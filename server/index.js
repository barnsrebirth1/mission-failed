import express from "express";
import cors from "cors";
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { ENV, SESSION_SECRET, treasuryKeypair, treasuryKeyInfo, checkEnv } from "./lib/env.js";
import * as DB from "./lib/db.js";
import { connection, vaultBalance, tokenBalance, solBalance, LAMPORTS_PER_SOL, TOKEN_DECIMALS } from "./lib/chain.js";
import { roundOf, roundEnds, roundPoints, runRound, startRoundLoop } from "./lib/rounds.js";
import { replay, POINTS, TICK_HZ } from "../public/game/sim.js";

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e?.message || e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e?.message || e));
checkEnv();

const app = express();
app.set("trust proxy", true);
app.use(cors({ origin: ENV.SITE_ORIGIN === "*" ? true : ENV.SITE_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "400kb" }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(req.path, e.message); res.status(400).json({ error: e.message }); });
const cleanName = (s) => String(s || "").replace(/[^\w .\-$]/g, "").trim().slice(0, 14);

// ---------- login: sign a message with your wallet ----------
const nonces = new Map(); // wallet -> { message, exp }
function makeToken(wallet) {
  const body = Buffer.from(JSON.stringify({ w: wallet, e: Date.now() + 30 * 864e5 })).toString("base64url");
  return body + "." + createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
}
function readToken(tok) {
  if (!tok || typeof tok !== "string" || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const want = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const j = JSON.parse(Buffer.from(body, "base64url").toString()); return j.e > Date.now() ? j.w : null; } catch { return null; }
}
app.post("/api/auth/nonce", wrap(async (req, res) => {
  const wallet = new PublicKey(String(req.body.wallet)).toBase58();
  const message = `Mission Failed sign-in\n\nThis only proves you own this wallet. It costs nothing and can't move funds.\n\nWallet: ${wallet}\nNonce: ${randomBytes(8).toString("hex")}`;
  nonces.set(wallet, { message, exp: Date.now() + 5 * 60_000 });
  res.json({ message });
}));
app.post("/api/auth/verify", wrap(async (req, res) => {
  const wallet = new PublicKey(String(req.body.wallet)).toBase58();
  const n = nonces.get(wallet);
  if (!n || n.exp < Date.now() || n.message !== req.body.message) throw new Error("Sign-in expired, try again");
  const sig = Buffer.from(String(req.body.signature), "base64");
  if (!nacl.sign.detached.verify(new TextEncoder().encode(n.message), sig, bs58.decode(wallet))) throw new Error("Signature didn't match");
  nonces.delete(wallet);
  res.json({ token: makeToken(wallet), wallet });
}));

// ---------- runs ----------
const startsByIp = new Map();
app.post("/api/run/start", wrap(async (req, res) => {
  const ip = req.ip || "?", now = Date.now();
  const list = (startsByIp.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= ENV.MAX_STARTS_PER_MIN) throw new Error("Slow down a bit");
  list.push(now); startsByIp.set(ip, list);
  const name = cleanName(req.body.name);
  if (name.length < 2) throw new Error("Pick a name");
  // Payouts go to the address the player pastes. No signature needed: points can only ever pay the wallet
  // that holds $FAILED, so typing someone else's address only sends them money, never you.
  let wallet = readToken(req.body.token);
  if (!wallet && req.body.wallet) { try { const pk = new PublicKey(String(req.body.wallet).trim()); if (PublicKey.isOnCurve(pk.toBytes())) wallet = pk.toBase58(); } catch {} }
  const row = { id: randomUUID(), seed: randomBytes(4).readUInt32BE(0), wallet, name, character: String(req.body.character || "").slice(0, 12), car: Number(req.body.car) | 0, ip, started_at: new Date(now).toISOString(), status: "started" };
  await DB.insertRun(row);
  res.json({ runId: row.id, seed: row.seed, wallet });
}));

app.post("/api/run/finish", wrap(async (req, res) => {
  const run = await DB.getRun(String(req.body.runId));
  if (!run) throw new Error("Unknown run");
  if (run.status !== "started") throw new Error("Run already submitted");
  const inputs = String(req.body.inputs || "");
  const result = replay(Number(run.seed) >>> 0, inputs);           // the server plays your run back itself
  const elapsed = Date.now() - new Date(run.started_at).getTime();
  const gameMs = (result.ticks / TICK_HZ) * 1000;
  const honest = elapsed >= gameMs * 0.9 - 1500;                    // can't finish faster than real time
  const round = roundOf();
  const patch = { finished_at: new Date().toISOString(), round, cleared: honest ? result.cleared : 0, clear_ticks: result.clearTicks, total_ticks: result.totalTicks,
    status: result.status, reason: honest ? result.reason : "TIMING", verified: honest };
  await DB.updateRun(run.id, patch);
  // rank this round
  const runs = await DB.scoredRuns(round);
  const best = new Map();
  for (const r of runs) { const k = r.wallet || "n:" + r.name; if (!best.has(k)) best.set(k, r); }
  const me = run.wallet || "n:" + run.name;
  const rank = patch.cleared ? [...best.keys()].indexOf(me) + 1 : 0;
  worldCache.at = 0;
  const out = { world_points_earned: patch.cleared, cleared: patch.cleared, status: result.status, reason: patch.reason, clearTicks: result.clearTicks, points: POINTS[patch.cleared], rank, wallet: run.wallet, verified: honest };
  if (run.wallet && patch.cleared && ENV.FAILED_MINT && connection) {
    try {
      const bal = await tokenBalance(run.wallet, ENV.FAILED_MINT);
      out.eligible = bal >= BigInt(ENV.MIN_HOLD) * 10n ** BigInt(TOKEN_DECIMALS);
      if (out.eligible) {
        const { SPLIT } = await import("./lib/rounds.js");
        const pts = await roundPoints(round), place = pts.findIndex((p) => p.wallet === run.wallet) + 1;
        out.place = place;
        if (place >= 1 && place <= SPLIT.length) {
          const n = Math.min(SPLIT.length, pts.length), total = SPLIT.slice(0, n).reduce((a, b) => a + b, 0);
          out.estimate_sol = (await poolEstimate()) * SPLIT[place - 1] / total / LAMPORTS_PER_SOL;
        }
      }
    } catch {}
  }
  res.json(out);
}));

// ---------- leaderboard + state ----------
function bestPerDriver(rows) {
  const seen = new Set(), out = [];
  for (const r of rows) { const k = r.wallet || "n:" + r.name; if (seen.has(k)) continue; seen.add(k); out.push({ name: r.name, wallet: r.wallet || "", cleared: r.cleared, clearTicks: r.clear_ticks, char: r.character }); }
  return out;
}
let worldCache = { at: 0, v: null };
async function world() { if (worldCache.v && Date.now() - worldCache.at < 30_000) return worldCache.v; worldCache = { at: Date.now(), v: await DB.worldTotals() }; return worldCache.v; }
let boardCache = { at: 0, key: "", v: null };
app.get("/api/leaderboard", wrap(async (req, res) => {
  if (req.query.scope === "world" || req.query.scope === "all") {
    const w = await world();
    return res.json({ scope: "world", rows: w.slice(0, 100).map((t) => ({ name: t.name, wallet: t.wallet, char: t.char, points: t.points, runs: t.runs, cleared: t.best, clearTicks: t.bestTicks })), drivers: w.length });
  }
  const scope = "round", round = roundOf(), key = scope + round;
  if (boardCache.key === key && Date.now() - boardCache.at < 4000) return res.json(boardCache.v);
  const rows = bestPerDriver(await DB.scoredRuns(scope === "all" ? null : round)).slice(0, 100);
  const v = { scope, round, endsAt: roundEnds(round), rows, players: await DB.playersInRound(round) };
  boardCache = { at: Date.now(), key, v };
  res.json(v);
}));

let poolCache = { at: 0, v: 0 };
async function poolEstimate() {
  if (Date.now() - poolCache.at < 20_000) return poolCache.v;
  const t = treasuryKeypair();
  let v = Number(await DB.getSetting("rollover_lamports", 0)) || 0;
  if (t && connection) { const vb = await vaultBalance(t.publicKey); if (vb) v += Math.floor(vb * ENV.PRIZE_SHARE); }
  poolCache = { at: Date.now(), v };
  return v;
}
let stateCache = { at: 0, v: null };
app.get("/api/state", wrap(async (req, res) => {
  if (stateCache.v && Date.now() - stateCache.at < 5000) return res.json({ ...stateCache.v, now: Date.now() });
  const round = roundOf();
  const [pool, paid, players, recent] = await Promise.all([poolEstimate().catch(() => 0), DB.paidTotalLamports().catch(() => 0), DB.playersInRound(round).catch(() => 0), DB.recentPayouts(12).catch(() => [])]);
  const v = { round: { id: round, endsAt: roundEnds(round) }, split: [50, 30, 20], pool_sol: pool / LAMPORTS_PER_SOL, paid_total_sol: paid / LAMPORTS_PER_SOL, players_round: players, ca: ENV.FAILED_MINT,
    min_hold: ENV.MIN_HOLD, points: POINTS, recent: recent.map((p) => ({ name: p.name, wallet: p.wallet, sol: Number(p.lamports) / LAMPORTS_PER_SOL, round: p.round, sig: p.sig, dry_run: p.dry_run })) };
  stateCache = { at: Date.now(), v };
  res.json({ ...v, now: Date.now() });
}));

// ---------- admin (for testing) ----------
const admin = (req) => { if (!ENV.ADMIN_KEY || req.query.key !== ENV.ADMIN_KEY) { const e = new Error("unauthorized: add ?key=YOUR_ADMIN_KEY (the ADMIN_KEY value only)"); throw e; } };
app.get("/api/admin/status", wrap(async (req, res) => {
  admin(req);
  const t = treasuryKeypair();
  res.json({ setup: { database: !!DB.db, rpc: !!connection, treasuryKey: !!t, mint: !!ENV.FAILED_MINT, dryRun: ENV.DRY_RUN, payouts: ENV.PAYOUTS_ENABLED },
    treasury: t?.publicKey.toBase58() || null, treasury_key_check: treasuryKeyInfo(), treasury_sol: t && connection ? (await solBalance(t.publicKey)) / LAMPORTS_PER_SOL : null,
    round: roundOf(), last_round: await DB.lastRound().catch(() => null), pool_estimate_sol: (await poolEstimate().catch(() => 0)) / LAMPORTS_PER_SOL });
}));
app.get("/api/admin/run-round", wrap(async (req, res) => { admin(req); res.json(await runRound(req.query.round ? Number(req.query.round) : roundOf(), { force: true })); }));

// Pre-launch test: uses this round's real verified runs and a holder snapshot of ANY coin you choose,
// splits a small test pool by points and (with send=1) actually pays it from the treasury.
// Proves runs -> points -> holder check -> payout before $FAILED exists. Capped at 0.01 SOL.
app.get("/api/admin/test-round", wrap(async (req, res) => {
  admin(req);
  const { holderSnapshot, payMany } = await import("./lib/chain.js");
  const { splitPool } = await import("./lib/rounds.js");
  const t = treasuryKeypair();
  if (!connection) throw new Error("RPC missing");
  if (req.query.send === "1" && !t) throw new Error("TREASURY_PRIVATE_KEY isn't loaded yet, so nothing can be paid. The check without &send=1 still works.");
  const mint = String(req.query.mint || ENV.FAILED_MINT || "");
  if (!mint) throw new Error("add &mint=<any coin CA you hold>");
  const pool = Math.min(Math.round(Number(req.query.sol || 0.002) * LAMPORTS_PER_SOL), 0.01 * LAMPORTS_PER_SOL);
  const minHold = req.query.min !== undefined ? Number(req.query.min) : ENV.MIN_HOLD;
  const round = roundOf();
  const players = await roundPoints(round);
  const holders = await holderSnapshot(mint);
  const { pays, total } = splitPool(pool, players, holders, BigInt(Math.round(minHold)) * 10n ** BigInt(TOKEN_DECIMALS));
  let sigs = [];
  if (req.query.send === "1" && pays.length) sigs = await payMany(t, pays);
  res.json({ round, mint, test_pool_sol: pool / LAMPORTS_PER_SOL, min_hold: minHold, players: players.map((p) => ({ name: p.name, wallet: p.wallet, cleared: p.cleared, points: p.points, holds: String((holders.get(p.wallet) || 0n) / 10n ** BigInt(TOKEN_DECIMALS)) })),
    split_total: total, payouts: pays.map((p) => ({ place: p.place, name: p.name, wallet: p.owner, share_pct: p.points, sol: p.lamports / LAMPORTS_PER_SOL, sig: p.sig || null, failed: !!p.failed })), sent: req.query.send === "1", sigs });
}));

// The website itself (public/) is served from here too, so there's no separate host to pay for.
const PUBLIC_DIR = new URL("../public/", import.meta.url).pathname;
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  setHeaders: (res, path) => res.setHeader("Cache-Control", /\.(html|js|css)$/.test(path) ? "no-cache" : "public, max-age=604800"),
}));
app.get("/health", (req, res) => res.send("Mission Failed server is running."));
app.listen(ENV.PORT, () => { console.log("Mission Failed server on :" + ENV.PORT); startRoundLoop(); });
