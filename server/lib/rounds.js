// Every ROUND_MINUTES: collect creator fees, pay 80% to the round's top 3 drivers holding $FAILED (50/30/20).
import { POINTS } from "../../public/game/sim.js";
import { ENV, treasuryKeypair } from "./env.js";
import * as DB from "./db.js";
import { connection, collectCreatorFees, holderSnapshot, payMany, solBalance, LAMPORTS_PER_SOL, TOKEN_DECIMALS } from "./chain.js";

export const ROUND_MS = () => ENV.ROUND_MINUTES * 60_000;
export const roundOf = (t = Date.now()) => Math.floor(t / ROUND_MS());
export const roundEnds = (r = roundOf()) => (r + 1) * ROUND_MS();

// Best run per wallet in a round (highest level, then fastest time)
export const SPLIT = [50, 30, 20]; // top 3 split the pot; fewer than 3 winners -> same ratio between them
export async function roundPoints(round) {
  const runs = await DB.scoredRuns(round);
  const best = new Map();
  for (const r of runs) {
    if (!r.wallet) continue;
    const b = best.get(r.wallet);
    if (!b || r.cleared > b.cleared || (r.cleared === b.cleared && r.clear_ticks < b.clear_ticks)) best.set(r.wallet, r);
  }
  return [...best.values()].sort((a, b) => b.cleared - a.cleared || a.clear_ticks - b.clear_ticks)
    .map((r) => ({ wallet: r.wallet, name: r.name, cleared: r.cleared, clear_ticks: r.clear_ticks, points: POINTS[r.cleared] }));
}

// Only holders can win: non-holders are skipped and the next driver moves up.
export function splitPool(pool, players, holders, minHoldRaw) {
  const eligible = players.filter((p) => p.cleared > 0 && (holders.get(p.wallet) || 0n) >= minHoldRaw)
    .sort((a, b) => b.cleared - a.cleared || a.clear_ticks - b.clear_ticks);
  const winners = eligible.slice(0, SPLIT.length);
  const total = winners.reduce((a, _, i) => a + SPLIT[i], 0);
  if (!total) return { eligible, total: 0, pays: [] };
  const pays = winners.map((p, i) => ({ owner: p.wallet, name: p.name, place: i + 1, points: SPLIT[i], lamports: Math.floor(pool * SPLIT[i] / total) }))
    .filter((p) => p.lamports >= ENV.MIN_WALLET_LAMPORTS);
  return { eligible, total, pays };
}

let busy = false;
export async function runRound(round, { force = false } = {}) {
  if (busy) return { skipped: "busy" };
  busy = true;
  try {
    if (!force && (await DB.roundDone(round))) return { skipped: "done" };
    const treasury = treasuryKeypair();
    const ready = ENV.PAYOUTS_ENABLED && ENV.FAILED_MINT && treasury && connection;
    const players = await roundPoints(round);
    const rollover = Number(await DB.getSetting("rollover_lamports", 0)) || 0;
    const rec = { id: round, players: players.length, dry_run: ENV.DRY_RUN };
    if (!ready) { rec.note = "payouts not configured"; if (!force) await DB.insertRound(rec); return rec; }

    const col = await collectCreatorFees(treasury);
    rec.collected_lamports = col.claimed; rec.collect_sig = col.sig;
    let pool = Math.floor(col.claimed * ENV.PRIZE_SHARE) + rollover;
    // never dip into the reserve
    const spendable = col.balance - Math.floor(ENV.TREASURY_RESERVE_SOL * LAMPORTS_PER_SOL);
    if (pool > spendable) pool = Math.max(0, spendable);
    rec.pool_lamports = pool;

    if (!players.length || pool < ENV.MIN_PRIZE_SOL * LAMPORTS_PER_SOL) {
      await DB.setSetting("rollover_lamports", pool);
      rec.note = !players.length ? "no eligible players, rolled over" : "pool too small, rolled over";
      await DB.insertRound(rec);
      return rec;
    }
    const holders = await holderSnapshot(ENV.FAILED_MINT);
    const minHoldRaw = BigInt(Math.round(ENV.MIN_HOLD)) * 10n ** BigInt(TOKEN_DECIMALS);
    const { pays, total } = splitPool(pool, players, holders, minHoldRaw);
    rec.total_points = total;
    if (!pays.length) {
      await DB.setSetting("rollover_lamports", pool);
      rec.note = "no top-3 driver held enough, rolled over";
      await DB.insertRound(rec);
      return rec;
    }
    if (!ENV.DRY_RUN) await payMany(treasury, pays);
    const paid = pays.filter((p) => !p.failed && (ENV.DRY_RUN || p.sig)).reduce((a, p) => a + p.lamports, 0);
    rec.paid_lamports = ENV.DRY_RUN ? 0 : paid;
    rec.recipients = pays.length;
    await DB.setSetting("rollover_lamports", ENV.DRY_RUN ? pool : pool - paid);
    await DB.insertPayouts(pays.filter((p) => !p.failed).map((p) => ({ round, wallet: p.owner, name: p.name, points: p.points, lamports: p.lamports, sig: p.sig || null, dry_run: ENV.DRY_RUN })));
    rec.note = ENV.DRY_RUN ? "dry run: nothing sent" : `paid the top ${pays.length}`;
    await DB.insertRound(rec);
    return rec;
  } finally { busy = false; }
}

export function startRoundLoop() {
  const tick = async () => {
    const prev = roundOf() - 1;
    try { const r = await runRound(prev); if (!r.skipped) console.log("round", prev, JSON.stringify(r)); }
    catch (e) { console.error("round", prev, "failed:", e.message); }
  };
  // fire ~20s after each boundary so late finishes are in
  const schedule = () => { const wait = roundEnds() - Date.now() + 20_000; setTimeout(async () => { await tick(); schedule(); }, wait); };
  schedule();
}
