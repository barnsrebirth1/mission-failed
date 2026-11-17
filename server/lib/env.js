import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "fs";
import { createHash } from "crypto";

// live-config.json (edited by Claude via GitHub) overrides Railway Variables for non-secret switches.
let LIVE = {};
try { LIVE = JSON.parse(readFileSync(new URL("../live-config.json", import.meta.url), "utf8")); } catch {}
for (const [k, v] of Object.entries(LIVE)) if (v !== null && v !== "" && !k.startsWith("_")) process.env[k] = String(v);

const clean = (k) => (process.env[k] || "").trim().replace(/^["']|["']$/g, "");
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? Number(process.env[k]) : d);
const bool = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : /^(1|true|yes)$/i.test(process.env[k]));

export const ENV = {
  PORT: num("PORT", 8080),
  RPC_URL: clean("RPC_URL"),
  SUPABASE_URL: clean("SUPABASE_URL").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""),
  SUPABASE_SERVICE_KEY: clean("SUPABASE_SERVICE_KEY"),
  FAILED_MINT: clean("FAILED_MINT"),
  SITE_ORIGIN: process.env.SITE_ORIGIN || "*",
  ADMIN_KEY: clean("ADMIN_KEY"),

  ROUND_MINUTES: num("ROUND_MINUTES", 10),
  PRIZE_SHARE: num("PRIZE_SHARE", 0.8),                     // share of collected creator fees paid to players
  MIN_HOLD: num("MIN_HOLD", 500_000),                       // $FAILED a wallet must hold at payout time
  MIN_PRIZE_SOL: num("MIN_PRIZE_SOL", 0.003),               // smaller pools roll over to the next round
  MIN_WALLET_LAMPORTS: num("MIN_WALLET_LAMPORTS", 20_000),  // dust floor per wallet
  MAX_RECIPIENTS: num("MAX_RECIPIENTS", 300),
  TREASURY_RESERVE_SOL: num("TREASURY_RESERVE_SOL", 0.02),  // always kept for tx fees
  PAYOUTS_ENABLED: bool("PAYOUTS_ENABLED", true),
  DRY_RUN: bool("DRY_RUN", false),                          // true = work out payouts but send nothing
  PRIORITY_MICROLAMPORTS: num("PRIORITY_MICROLAMPORTS", 200_000),
  MAX_STARTS_PER_MIN: num("MAX_STARTS_PER_MIN", 20),
};

// Safe description of the key for the admin page: never the key itself.
export function treasuryKeyInfo() {
  const raw = clean("TREASURY_PRIVATE_KEY");
  const names = Object.keys(process.env).filter((k) => /TREASURY|PRIVATE/i.test(k));
  const rawv = process.env.TREASURY_PRIVATE_KEY || ""; const info = { variable_names_found: names, raw_length: rawv.length, raw_first_char_code: rawv.length ? rawv.charCodeAt(0) : null, raw_starts_with_dollar: rawv.startsWith("$"), present: !!raw, length: raw.length, looks_like: !raw ? "empty" : raw.startsWith("[") ? "number list" : raw.trim().split(/\s+/).length >= 12 ? "RECOVERY PHRASE (wrong: needs the private key)" : /^[1-9A-HJ-NP-Za-km-z]+$/.test(raw) ? "base58 key" : "has characters a private key can't have" };
  if (raw) { try { (raw.startsWith("[") ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))) : Keypair.fromSecretKey(bs58.decode(raw))); info.ok = true; } catch (e) { info.ok = false; info.error = e.message; } }
  return info;
}

export function treasuryKeypair() {
  const raw = clean("TREASURY_PRIVATE_KEY");
  if (!raw) return null;
  try {
    if (raw.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (e) { console.error("TREASURY_PRIVATE_KEY could not be read:", e.message); return null; }
}

// Secret for signing login tokens. Uses SESSION_SECRET if set, otherwise derived from the treasury key
// so there's nothing extra to configure.
export const SESSION_SECRET = clean("SESSION_SECRET") || createHash("sha256").update("mission-failed:" + clean("TREASURY_PRIVATE_KEY") + clean("ADMIN_KEY")).digest("hex");

export function checkEnv() {
  const missing = ["RPC_URL", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter((k) => !ENV[k]);
  if (missing.length) console.warn("⚠️  Missing env:", missing.join(", "), "(running with in-memory storage)");
  if (!ENV.FAILED_MINT) console.warn("⚠️  FAILED_MINT not set: payouts paused until it is.");
  if (!clean("TREASURY_PRIVATE_KEY")) console.warn("⚠️  TREASURY_PRIVATE_KEY not set: payouts paused until it is.");
}
