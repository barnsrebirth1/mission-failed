import { Connection, PublicKey, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { OnlinePumpSdk, PUMP_SDK, PUMP_PROGRAM_ID } = require("@pump-fun/pump-sdk");
import { ENV } from "./env.js";

export const connection = ENV.RPC_URL ? new Connection(ENV.RPC_URL, "confirmed") : null;
let online = null;
const sdk = () => (online ||= new OnlinePumpSdk(connection));
export const TOKEN_DECIMALS = 6;
export { LAMPORTS_PER_SOL };

let feeCache = { at: 0, v: 0 };
async function priorityFee() {
  if (Date.now() - feeCache.at < 15_000 && feeCache.v) return feeCache.v;
  let v = ENV.PRIORITY_MICROLAMPORTS;
  try {
    const r = await fetch(ENV.RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "fee", method: "getPriorityFeeEstimate", params: [{ accountKeys: [PUMP_PROGRAM_ID.toBase58()], options: { priorityLevel: "High" } }] }) });
    const est = Number((await r.json())?.result?.priorityFeeEstimate);
    if (est > 0) v = Math.round(est * 1.2);
  } catch {}
  v = Math.min(Math.max(v, 300_000), 6_000_000);
  feeCache = { at: Date.now(), v };
  return v;
}

async function buildV0(payer, ixs, signers = [], units = 200_000) {
  const [{ blockhash }, price] = await Promise.all([connection.getLatestBlockhash("confirmed"), priorityFee()]);
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }), ...ixs] }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  if (signers.length) tx.sign(signers);
  return tx;
}

export async function sendAndConfirm(tx) {
  const raw = tx.serialize();
  const sig = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 0 });
  const bh = tx.message.recentBlockhash, started = Date.now();
  while (Date.now() - started < 120_000) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = (await connection.getSignatureStatuses([sig]).catch(() => null))?.value?.[0];
    if (st?.err) throw new Error("Transaction failed: " + JSON.stringify(st.err));
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    if (Date.now() - started > 20_000) {
      const valid = await connection.isBlockhashValid(bh, { commitment: "processed" }).catch(() => ({ value: true }));
      if (valid && valid.value === false) {
        const last = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true }).catch(() => null))?.value?.[0];
        if (last && !last.err) return sig;
        throw new Error("EXPIRED: transaction didn't land in time");
      }
    }
  }
  throw new Error("EXPIRED: transaction didn't land in time");
}

// All holders of the coin: owner -> raw amount (PDAs/pools excluded)
export async function holderSnapshot(mint) {
  const map = new Map();
  for (let page = 1; page <= 30; page++) {
    const r = await fetch(ENV.RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "mf", method: "getTokenAccounts", params: { mint, page, limit: 1000, options: { showZeroBalance: false } } }) });
    const j = await r.json();
    if (j.error) throw new Error("getTokenAccounts: " + j.error.message);
    const accs = j.result?.token_accounts || [];
    for (const a of accs) { const amt = BigInt(a.amount); if (amt > 0n) map.set(a.owner, (map.get(a.owner) || 0n) + amt); }
    if (accs.length < 1000) break;
  }
  for (const owner of [...map.keys()]) { try { if (!PublicKey.isOnCurve(new PublicKey(owner).toBytes())) map.delete(owner); } catch { map.delete(owner); } }
  return map;
}

// One wallet's balance of the coin (raw)
export async function tokenBalance(owner, mint) {
  const r = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
  let total = 0n;
  for (const a of r.value) total += BigInt(a.account.data.parsed.info.tokenAmount.amount);
  return total;
}

export async function collectCreatorFees(treasury) {
  const before = await connection.getBalance(treasury.publicKey);
  const mint = new PublicKey(ENV.FAILED_MINT);
  const collectIxs = await sdk().collectCoinCreatorFeeInstructions(treasury.publicKey, treasury.publicKey);
  let sweepIx = null;
  try { sweepIx = await PUMP_SDK.sweepCreatorFeeInstruction({ payer: treasury.publicKey, mint, creator: treasury.publicKey, quoteMint: NATIVE_MINT }); } catch {}
  let sig = null;
  for (const ixs of sweepIx ? [[sweepIx, ...collectIxs], collectIxs] : [collectIxs]) {
    try { sig = await sendAndConfirm(await buildV0(treasury.publicKey, ixs, [treasury], 250_000)); break; }
    catch (e) { console.warn("collect attempt failed:", e.message); }
  }
  const after = await connection.getBalance(treasury.publicKey);
  return { claimed: Math.max(0, after - before + (sig ? 10_000 : 0)), sig, balance: after };
}

export async function vaultBalance(creator) {
  try { return Number((await sdk().getCreatorVaultBalanceBothPrograms(creator)).toString()); } catch { return null; }
}

export async function payMany(treasury, payments) {
  const sigs = [];
  for (let i = 0; i < payments.length; i += 18) {
    const chunk = payments.slice(i, i + 18);
    const ixs = chunk.map((p) => SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: new PublicKey(p.owner), lamports: p.lamports }));
    let sent = false;
    for (let a = 0; a < 3 && !sent; a++) {
      try { const sig = await sendAndConfirm(await buildV0(treasury.publicKey, ixs, [treasury])); sigs.push(sig); chunk.forEach((p) => (p.sig = sig)); sent = true; }
      catch (e) { console.warn(`payout batch ${i / 18} attempt ${a + 1} failed:`, e.message); await new Promise((r) => setTimeout(r, 1500)); }
    }
    if (!sent) chunk.forEach((p) => (p.failed = true));
  }
  return sigs;
}

export async function solBalance(pubkey) { return connection.getBalance(pubkey); }
