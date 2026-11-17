// Storage: Supabase when configured, otherwise in-memory (local testing only).
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { ENV } from "./env.js";

export const db = ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_KEY
  ? createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } })
  : null;
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const mem = { runs: new Map(), rounds: new Map(), payouts: [], settings: new Map() };

export async function insertRun(row) { if (!db) { mem.runs.set(row.id, { ...row }); return; } must(await db.from("mf_runs").insert(row)); }
export async function getRun(id) {
  if (!db) return mem.runs.get(id) || null;
  return must(await db.from("mf_runs").select("*").eq("id", id).limit(1))[0] || null;
}
export async function updateRun(id, patch) {
  if (!db) { Object.assign(mem.runs.get(id) || {}, patch); return; }
  must(await db.from("mf_runs").update(patch).eq("id", id));
}
// verified runs that cleared at least one level (optionally for one round), best first
export async function scoredRuns(round, limit = 2000) {
  if (!db) return [...mem.runs.values()].filter((r) => r.verified && r.cleared > 0 && (round == null || r.round === round)).sort((a, b) => b.cleared - a.cleared || a.clear_ticks - b.clear_ticks).slice(0, limit);
  let q = db.from("mf_runs").select("wallet,name,character,car,cleared,clear_ticks,round").eq("verified", true).gt("cleared", 0);
  if (round != null) q = q.eq("round", round);
  return must(await q.order("cleared", { ascending: false }).order("clear_ticks", { ascending: true }).limit(limit));
}
export async function playersInRound(round) {
  if (!db) return new Set([...mem.runs.values()].filter((r) => r.verified && r.round === round).map((r) => r.wallet || "n:" + r.name)).size;
  const rows = must(await db.from("mf_runs").select("wallet,name").eq("verified", true).eq("round", round).limit(5000));
  return new Set(rows.map((r) => r.wallet || "n:" + r.name)).size;
}
export async function getSetting(key, fallback) {
  if (!db) return mem.settings.has(key) ? mem.settings.get(key) : fallback;
  const rows = must(await db.from("mf_settings").select("value").eq("key", key).limit(1));
  return rows.length ? rows[0].value : fallback;
}
export async function setSetting(key, value) {
  if (!db) { mem.settings.set(key, value); return; }
  must(await db.from("mf_settings").upsert({ key, value }));
}
export async function roundDone(id) {
  if (!db) return mem.rounds.has(id);
  return must(await db.from("mf_rounds").select("id").eq("id", id).limit(1)).length > 0;
}
export async function insertRound(row) { if (!db) { mem.rounds.set(row.id, row); return; } must(await db.from("mf_rounds").upsert(row)); }
export async function insertPayouts(rows) { if (!rows.length) return; if (!db) { mem.payouts.push(...rows); return; } must(await db.from("mf_payouts").insert(rows)); }
export async function paidTotalLamports() {
  if (!db) return mem.payouts.filter((p) => p.sig && !p.dry_run).reduce((a, p) => a + Number(p.lamports), 0);
  const rows = must(await db.from("mf_rounds").select("paid_lamports").eq("dry_run", false).limit(100000));
  return rows.reduce((a, r) => a + Number(r.paid_lamports || 0), 0);
}
export async function recentPayouts(limit = 12) {
  if (!db) return mem.payouts.slice(-limit).reverse();
  return must(await db.from("mf_payouts").select("round,wallet,name,points,lamports,sig,dry_run,created_at").order("id", { ascending: false }).limit(limit));
}
export async function lastRound() {
  if (!db) return [...mem.rounds.values()].pop() || null;
  return must(await db.from("mf_rounds").select("*").order("id", { ascending: false }).limit(1))[0] || null;
}

// World leaderboard: every star cleared = 1 point, summed over all verified runs.
export async function worldTotals() {
  const rows = [];
  if (!db) rows.push(...[...mem.runs.values()].filter((r) => r.verified && r.cleared > 0));
  else {
    for (let page = 0; page < 60; page++) {
      const chunk = must(await db.from("mf_runs").select("wallet,name,character,cleared,clear_ticks").eq("verified", true).gt("cleared", 0)
        .order("finished_at", { ascending: true }).range(page * 1000, page * 1000 + 999));
      rows.push(...chunk);
      if (chunk.length < 1000) break;
    }
  }
  const by = new Map();
  for (const r of rows) {
    const k = r.wallet || "n:" + r.name;
    const t = by.get(k) || { name: r.name, wallet: r.wallet || "", char: r.character, points: 0, runs: 0, best: 0, bestTicks: 1e9 };
    t.points += r.cleared; t.runs++; t.name = r.name; t.char = r.character;
    if (r.cleared > t.best || (r.cleared === t.best && r.clear_ticks < t.bestTicks)) { t.best = r.cleared; t.bestTicks = r.clear_ticks; }
    by.set(k, t);
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.best - a.best || a.bestTicks - b.bestTicks);
}
