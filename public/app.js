import * as G from "./game/sim.js";
import { Renderer, CHARACTERS, CAR_COLORS, drawPortrait } from "./game/render.js";
import { Sound } from "./game/audio.js";

const CFG = window.MF_CONFIG || {};
const DEMO = !CFG.SERVER_URL;
const $ = (id) => document.getElementById(id);
const sfx = new Sound();
const store = { get(k, d) { try { const v = localStorage.getItem("mf_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem("mf_" + k, JSON.stringify(v)); } catch {} } };
const fmtT = (ticks) => { const s = Math.floor(ticks / 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const stars = (n) => "★".repeat(n);
const short = (w) => w ? w.slice(0, 4) + "…" + w.slice(-4) : "";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400); }
async function api(path, body) {
  const r = await fetch(CFG.SERVER_URL.replace(/\/$/, "") + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Server error");
  return j;
}
function show(id) { for (const s of document.querySelectorAll(".screen")) s.classList.toggle("show", s.id === id); }

// ---------- state ----------
const me = {
  name: store.get("name", ""), char: store.get("char", 0), color: store.get("color", 0),
  wallet: null, token: store.get("token", null), tokenWallet: store.get("tokenWallet", null),
};
let serverState = null;
const localBoard = store.get("board", []);

// ---------- title: CA, links, stats ----------
$("xlink").href = CFG.X_URL || "#";
$("minHold").textContent = (CFG.MIN_HOLD >= 1e6 ? CFG.MIN_HOLD / 1e6 + "M" : CFG.MIN_HOLD / 1e3 + "K");
if (CFG.CA) $("caText").textContent = CFG.CA;
$("caPill").onclick = () => { if (!CFG.CA) return toast("CA drops at launch"); navigator.clipboard?.writeText(CFG.CA); toast("CA copied"); };

function roundEnds() {
  if (serverState?.round?.endsAt) return serverState.round.endsAt;
  const ms = (CFG.ROUND_MINUTES || 10) * 60000; return Math.ceil(Date.now() / ms) * ms;
}
function tickStats() {
  const left = Math.max(0, roundEnds() - Date.now()), s = Math.ceil(left / 1000);
  $("sTimer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
setInterval(tickStats, 250); tickStats();
async function loadState() {
  if (DEMO) {
    $("sPlayers").textContent = new Set(localBoard.filter((r) => r.round === currentRound()).map((r) => r.name)).size;
    return;
  }
  try {
    serverState = await api("/api/state");
    $("sPool").textContent = (serverState.pool_sol || 0).toFixed(3) + " SOL";
    $("sPaid").textContent = (serverState.paid_total_sol || 0).toFixed(3) + " SOL";
    $("sPlayers").textContent = serverState.players_round || 0;
    if (serverState.ca && !CFG.CA) { CFG.CA = serverState.ca; $("caText").textContent = CFG.CA; }
  } catch {}
}
const currentRound = () => Math.floor(Date.now() / ((CFG.ROUND_MINUTES || 10) * 60000));
loadState(); setInterval(loadState, 15000);

// ---------- wallet ----------
function provider() { return window.phantom?.solana || window.solflare || window.solana || null; }
function setWalletBtn() { renderEarn(); }
const validAddr = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || "");
// "Connect" just reads your address to fill the box. Nothing to sign; pasting it works the same.
async function connectWallet() {
  const p = provider();
  if (!p) return toast("No wallet extension found. Just paste your address instead");
  try { const r = await p.connect(); setWallet((r?.publicKey || p.publicKey).toString()); toast("Address added"); }
  catch (e) { toast("Not connected. You can paste your address instead"); }
}
function setWallet(a) {
  me.wallet = validAddr(a) ? a : null; store.set("wallet", me.wallet);
  const w = document.getElementById("walletIn"); if (w && w.value !== (me.wallet || "")) w.value = me.wallet || "";
  setWalletBtn();
}
me.wallet = store.get("wallet", null);

function renderEarn() {
  const el = $("earnRow"), box = document.querySelector(".payBox");
  const hold = $("minHold").textContent;
  for (const h of document.querySelectorAll(".payBox .hold")) h.textContent = hold;
  if (box) box.classList.toggle("has", !!me.wallet);
  if (me.wallet) { el.style.display = ""; el.innerHTML = `<span class="ok">●</span> Payouts go to <b>${short(me.wallet)}</b>. Keep <b>${hold} $FAILED</b> in it when the round ends to get your cut.`; }
  else el.style.display = "none";
}

// ---------- setup screen ----------
function buildSetup() {
  const wrap = $("chars"); wrap.innerHTML = "";
  CHARACTERS.forEach((ch, i) => {
    const b = document.createElement("button"); b.className = "char" + (i === me.char ? " on" : "");
    const c = document.createElement("canvas"); c.width = 200; c.height = 200; drawPortrait(c.getContext("2d"), ch, 0, 0, 200);
    b.append(c); const n = document.createElement("span"); n.textContent = ch.name; b.append(n);
    b.onclick = () => { me.char = i; store.set("char", i); sfx.click(); buildSetup(); };
    wrap.append(b);
  });
  const cw = $("colors"); cw.innerHTML = "";
  CAR_COLORS.forEach((col, i) => {
    const b = document.createElement("button"); b.className = "sw" + (i === me.color ? " on" : ""); b.style.background = col;
    b.onclick = () => { me.color = i; store.set("color", i); sfx.click(); buildSetup(); };
    cw.append(b);
  });
  $("nameIn").value = me.name;
  $("walletIn").value = me.wallet || "";
  renderEarn();
}
$("playBtn").onclick = () => { sfx.init(); buildSetup(); show("setup"); setTimeout(() => !me.name && $("nameIn").focus(), 50); };
$("backBtn").onclick = () => show("title");
$("connectBtn").onclick = connectWallet;
$("walletIn").oninput = (e) => { const v = e.target.value.trim(); e.target.classList.toggle("bad", !!v && !validAddr(v)); if (!v || validAddr(v)) setWallet(v); };
$("nameIn").oninput = (e) => { me.name = e.target.value.replace(/[^\w .\-$]/g, "").slice(0, 14); };
$("startBtn").onclick = () => {
  me.name = ($("nameIn").value || "").trim().replace(/[^\w .\-$]/g, "").slice(0, 14);
  if (me.name.length < 2) { $("nameIn").focus(); return toast("Pick a name for the leaderboard"); }
  store.set("name", me.name);
  const wv = $("walletIn").value.trim();
  if (wv && !validAddr(wv)) { $("walletIn").focus(); return toast("That wallet address doesn't look right"); }
  setWallet(wv);
  startRun();
};

// ---------- input ----------
let keys = 0, touchKeys = 0;
const KEYMAP = { ArrowUp: G.UP, KeyW: G.UP, ArrowDown: G.DOWN, KeyS: G.DOWN, ArrowLeft: G.LEFT, KeyA: G.LEFT, ArrowRight: G.RIGHT, KeyD: G.RIGHT, Space: G.BRAKE };
addEventListener("keydown", (e) => {
  if (!run) return;
  if (KEYMAP[e.code] !== undefined) { keys |= KEYMAP[e.code]; e.preventDefault(); }
  if (e.code === "Escape" || e.code === "KeyP") togglePause();
  if (e.code === "KeyR" && run.done) startRun();
});
addEventListener("keyup", (e) => { if (KEYMAP[e.code] !== undefined) keys &= ~KEYMAP[e.code]; });
addEventListener("blur", () => { keys = 0; touchKeys = 0; stickBits = 0; });
const isTouch = matchMedia("(hover: none)").matches || "ontouchstart" in window;
if (isTouch) $("touch").classList.add("on");
const held = new Map();
for (const b of document.querySelectorAll("#touch button")) {
  const k = +b.dataset.k;
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); held.set(e.pointerId, k); b.classList.add("down"); recalcTouch(); });
  const up = (e) => { held.delete(e.pointerId); b.classList.remove("down"); recalcTouch(); };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
}
// joystick: push the way you want to drive
let stickBits = 0;
{
  const st = $("stick"), knob = $("knob");
  let id = null;
  const upd = (e) => {
    const r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), max = r.width / 2 - 20;
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stickBits = d > 14 ? G.dirBits(Math.atan2(dy, dx)) : 0;
  };
  st.addEventListener("pointerdown", (e) => { e.preventDefault(); id = e.pointerId; st.setPointerCapture(id); upd(e); });
  st.addEventListener("pointermove", (e) => { if (e.pointerId === id) upd(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; stickBits = 0; knob.style.transform = ""; };
  st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end); st.addEventListener("lostpointercapture", end);
}
function recalcTouch() { touchKeys = 0; for (const k of held.values()) touchKeys |= k; }
const allInput = (s) => keys | touchKeys | stickBits | mouseInput(s);
document.addEventListener("contextmenu", (e) => { if (run) e.preventDefault(); });
// mouse: point where you want to go, hold left click for gas, right click to brake/drift
const mouse = { active: false, x: 0, y: 0, left: false, right: false, bits: 0 };
const viewEl = $("view");
viewEl.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; mouse.x = e.clientX; mouse.y = e.clientY; if (!mouse.active && (e.movementX || e.movementY)) { mouse.active = true; $("game").classList.add("mouse"); } });
viewEl.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; e.preventDefault(); viewEl.focus(); mouse.active = true; $("game").classList.add("mouse"); mouse.x = e.clientX; mouse.y = e.clientY; if (e.button === 0) mouse.left = true; if (e.button === 2) mouse.right = true; viewEl.setPointerCapture(e.pointerId); });
const mUp = (e) => { if (e.pointerType !== "mouse") return; if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; };
viewEl.addEventListener("pointerup", mUp); viewEl.addEventListener("pointercancel", () => { mouse.left = mouse.right = false; });
function mouseInput(s) {
  if (!mouse.active) return (mouse.bits = 0);
  let b = 0;
  if (mouse.left) {
    const p = s.p, rect = viewEl.getBoundingClientRect();
    const wx = R.cam.x + ((mouse.x - rect.left) * R.dpr - viewEl.width / 2) / R.cam.z;
    const wy = R.cam.y + ((mouse.y - rect.top) * R.dpr - viewEl.height / 2) / R.cam.z;
    const dx = wx - p.x, dy = wy - p.y;
    if (dx * dx + dy * dy > 26 * 26) b |= G.dirBits(Math.atan2(dy, dx));
  }
  if (mouse.right) b |= G.BRAKE;
  return (mouse.bits = b);
}


// ---------- game ----------
const view = $("view"), R = new Renderer(view);
let run = null, raf = 0;
addEventListener("resize", () => { R.resize(); });

async function startRun() {
  sfx.init();
  let seed = (Math.random() * 2 ** 32) >>> 0, runId = null;
  if (!DEMO) {
    try { const r = await api("/api/run/start", { wallet: me.wallet, name: me.name, character: CHARACTERS[me.char].id, car: me.color }); seed = r.seed >>> 0; runId = r.runId; }
    catch (e) { toast("Server busy — this run won't count"); }
  }
  mouse.left = mouse.right = false;
  const s = G.createRun(seed);
  run = { s, seed, runId, inputs: [], acc: 0, last: performance.now(), paused: false, done: false, slow: 0, startedAt: Date.now() };
  R.carColor = CAR_COLORS[me.color]; R.map = null; R.parts = []; R.skids = [];
  $("game").classList.remove("dead"); $("failOv").classList.remove("show"); $("results").classList.remove("show"); $("pauseOv").classList.remove("show");
  show("game"); R.resize(); bgStop();
  showBanner("level 1", stars(1) + "  Reach the safehouse", 1800);
  viewEl.focus();
  const runsPlayed = store.get("runs", 0); store.set("runs", runsPlayed + 1);
  if (runsPlayed < 3) {
    $("hint").innerHTML = isTouch ? "Push the <b>joystick</b> the way you want to drive<br>Follow the <b style='color:#ffd640'>yellow arrow</b> to the safehouse"
      : "<b>Arrows / WASD</b> drive that way &nbsp;·&nbsp; or <b>hold click</b> and point<br>Follow the <b style='color:#ffd640'>yellow arrow</b> to the safehouse";
    $("hint").classList.add("show"); clearTimeout(startRun._h); startRun._h = setTimeout(() => $("hint").classList.remove("show"), 6500);
  }
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}

function showBanner(title, sub, ms = 2200) {
  $("banTitle").textContent = title; $("banSub").textContent = sub; $("banner").classList.add("show");
  clearTimeout(showBanner._t); showBanner._t = setTimeout(() => $("banner").classList.remove("show"), ms);
}

function togglePause(force) {
  if (!run || run.done) return;
  run.paused = force !== undefined ? force : !run.paused;
  $("pauseOv").classList.toggle("show", run.paused);
  if (!run.paused) { run.last = performance.now(); run.acc = 0; }
}
$("pauseBtn").onclick = () => togglePause();
$("resumeBtn").onclick = () => togglePause(false);
$("quitBtn").onclick = () => { togglePause(false); finish("quit"); };
let muted = store.get("muted", false);
$("muteBtn").textContent = muted ? "🔇" : "🔊"; sfx.setMuted(muted);
$("muteBtn").onclick = () => { muted = !muted; store.set("muted", muted); sfx.setMuted(muted); $("muteBtn").textContent = muted ? "🔇" : "🔊"; };
document.addEventListener("visibilitychange", () => { if (document.hidden && run && !run.done) togglePause(true); });

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!run) return;
  const s = run.s;
  let dt = now - run.last; run.last = now;
  if (!run.paused && !run.done) {
    run.acc += Math.min(dt, 100);
    let steps = 0;
    while (run.acc >= 1000 / 60 && steps < 6) {
      run.acc -= 1000 / 60; steps++;
      const inp = s.phase === "playing" ? allInput(s) : 0;
      run.inputs.push(inp);
      const evs = G.step(s, inp);
      R.onEvents(evs, s);
      for (const e of evs) {
        if (e.t === "crash") sfx.crash(e.power);
        if (e.t === "spike") { sfx.spike(); toast("Spike strip! Tyres shredded"); }
        if (e.t === "backup") toast("Chopper called backup");
        if (e.t === "cleared" && s.status === "playing") { sfx.cleared(); showBanner("level cleared", stars(e.level) + "  Next: " + stars(e.level + 1), 2300); }
        if (e.t === "level" && e.level > 1) setTimeout(() => showBanner("level " + e.level, stars(e.level) + "  " + ["", "", "More cops, roadblocks", "Spike strips and SWAT", "The chopper's up. Stay out of the light", "Cops faster than you. A tank.", "Six stars. Good luck."][e.level], 1800), 0);
        if (e.t === "failed") { finish("failed"); break; }
        if (e.t === "passed") { finish("passed"); break; }
      }
      if (run.done) break;
    }
  }
  const inp = keys | touchKeys | stickBits | mouse.bits;
  R.draw(s, inp);
  R.minimap($("mini"), s);
  hud(s);
  // audio
  let cd = 1e9; for (const c of s.cops) { const dx = c.x - s.p.x, dy = c.y - s.p.y; cd = Math.min(cd, Math.sqrt(dx * dx + dy * dy)); }
  sfx.update(Math.sqrt(s.p.vx ** 2 + s.p.vy ** 2), cd, !run.paused && !run.done, s.tick);
}

function hud(s) {
  $("hLevel").textContent = "level " + s.level;
  $("hTime").textContent = fmtT(s.lt || 0);
  const st = $("hStars"); const lit = s.cfg.stars;
  const html = "<i>" + "★".repeat(lit) + "</i>" + "★".repeat(G.LEVELS - lit);
  if (st._h !== html) { st.innerHTML = html; st._h = html; }
  let chasing = false; for (const c of s.cops) { const dx = c.x - s.p.x, dy = c.y - s.p.y; if (dx * dx + dy * dy < 500 * 500) { chasing = true; break; } }
  st.classList.toggle("flash", chasing);
  $("hHp").style.width = Math.max(0, s.p.hp) + "%";
  $("hBust").style.width = (s.p.bust * 100) + "%";
  $("bustTxt").style.opacity = s.p.bust > 0.2 && s.status === "playing" ? Math.min(1, s.p.bust * 1.3) : 0;
}

// ---------- the end of a run ----------
let lastResult = null;
async function finish(kind) {
  if (run.done) return;
  run.done = true;
  $("hint").classList.remove("show");
  const s = run.s;
  keys = 0; touchKeys = 0; stickBits = 0; held.clear();
  const passed = kind === "passed";
  const clearTicks = s.levelTicks.slice(1, s.cleared + 1).reduce((a, b) => a + b, 0);
  const reason = kind === "quit" ? "QUIT" : s.failReason;
  lastResult = { cleared: s.cleared, reachedLevel: passed ? G.LEVELS : s.level, reason, clearTicks, total: s.totalTicks, passed, name: me.name, char: me.char, color: me.color };
  // freeze-frame for the screenshot (before the grey fade so the card controls its own look)
  run.snap = document.createElement("canvas"); run.snap.width = view.width; run.snap.height = view.height; run.snap.getContext("2d").drawImage(view, 0, 0);
  if (passed) sfx.passed(); else sfx.failed();
  if (!passed) $("game").classList.add("dead");
  $("bustTxt").style.opacity = 0;
  setTimeout(() => {
    $("failTitle").textContent = passed ? "mission passed" : "mission failed";
    $("failTitle").classList.toggle("passed", passed);
    $("failSub").textContent = passed ? "All six stars. Respect +" : reason === "BUSTED" ? `Busted on ${stars(s.level)}` : reason === "WASTED" ? `Wasted on ${stars(s.level)}` : `Gave up on ${stars(s.level)}`;
    $("failOv").classList.add("show");
  }, passed ? 300 : 900);
  // results + submit
  $("rLevel").textContent = s.cleared ? stars(s.cleared) : "—";
  $("rTime").textContent = fmtT(clearTicks || s.totalTicks);
  $("rRank").textContent = "…";
  $("rNote").innerHTML = s.cleared ? `You cleared <b>${stars(s.cleared)}</b> — that's <b>${G.POINTS[s.cleared]} point${G.POINTS[s.cleared] > 1 ? "s" : ""}</b> this round.` : "Clear at least one level to score points this round.";
  setTimeout(() => $("results").classList.add("show"), passed ? 1100 : 1900);
  await submit();
}

async function submit() {
  const r = lastResult;
  const entry = { name: r.name, char: r.char, cleared: r.cleared, clearTicks: r.clearTicks, wallet: me.wallet || "", round: currentRound(), at: Date.now() };
  if (DEMO || !run.runId) {
    localBoard.push(entry); if (localBoard.length > 300) localBoard.splice(0, localBoard.length - 300); store.set("board", localBoard);
    const list = rankList(localBoard.filter((e) => e.round === entry.round));
    const i = list.findIndex((e) => e === entry);
    $("rRank").textContent = r.cleared ? "#" + (i + 1) : "—";
    if (DEMO && r.cleared) $("rNote").innerHTML += `<br>Payouts switch on at launch.`;
    loadState();
    return;
  }
  try {
    const res = await api("/api/run/finish", { runId: run.runId, inputs: G.encodeInputs(run.inputs) });
    $("rRank").textContent = res.rank ? "#" + res.rank : "—";
    if (res.cleared) {
      let note = `Verified: <b>${stars(res.cleared)}</b> = <b>${res.points} pts</b> this round.`;
      if (!res.wallet) note += ` Add your wallet address on the driver screen to earn from it.`;
      else if (res.eligible === false) note += ` Hold ${$("minHold").textContent} $FAILED by the end of the round to get paid.`;
      else if (res.estimate_sol) note += ` Est. payout <b>${res.estimate_sol.toFixed(4)} SOL</b>.`;
      $("rNote").innerHTML = note;
    }
    loadState();
  } catch (e) { $("rNote").innerHTML += `<br>${esc(e.message)}`; }
}

$("retryBtn").onclick = () => startRun();
$("menuBtn").onclick = () => { run = null; cancelAnimationFrame(raf); sfx.update(0, 1e9, false, 0); show("title"); bgStart(); };
$("saveBtn").onclick = () => { const c = makeCard(); const a = document.createElement("a"); a.download = "mission-failed.png"; a.href = c.toDataURL("image/png"); a.click(); toast("Screenshot saved"); };
$("shareBtn").onclick = async () => {
  const r = lastResult, c = makeCard();
  const what = r.passed ? "Escaped all 6 stars in Mission Failed 🚔" : `${r.reason === "WASTED" ? "Wasted" : "Busted"} on ${stars(r.reachedLevel)} in Mission Failed 🚔`;
  const cleared = r.cleared ? `Cleared ${stars(r.cleared)} in ${fmtT(r.clearTicks)}.` : "Didn't even make the safehouse.";
  const text = `${what}\n${cleared} What did you get? Drop your level below 👇\n\n${(CFG.SITE_URL || location.origin).replace(/^https?:\/\//, "")}\n${CFG.TICKER || "$FAILED"}${CFG.CA ? "\nCA: " + CFG.CA : ""}`;
  try {
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const file = new File([blob], "mission-failed.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  // desktop: copy the screenshot so it can be pasted straight into the post, and save a copy too
  let copied = false;
  try { const blob = await new Promise((res) => c.toBlob(res, "image/png")); await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); copied = true; } catch {}
  const a = document.createElement("a"); a.download = "mission-failed.png"; a.href = c.toDataURL("image/png"); a.click();
  toast(copied ? "Screenshot copied — press Ctrl+V (⌘V) in the post to add it" : "Screenshot saved — add it to your post");
  // open X's composer in a new tab; if the browser blocks that, copy the post text instead
  const url = "https://x.com/intent/post?text=" + encodeURIComponent(text);
  const w = window.open(url, "_blank");
  if (!w) {
    try { await navigator.clipboard.writeText(text); } catch {}
    toast("Couldn't open X. Post text copied, paste it into a new post");
  } else { try { w.opener = null; } catch {} }
};

// share card 1200x675
function makeCard() {
  const r = lastResult, W = 1200, H = 675;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  // background: freeze frame, greyscale for failed
  const src = run.snap, sc = Math.max(W / src.width, H / src.height);
  g.drawImage(src, (W - src.width * sc) / 2, (H - src.height * sc) / 2, src.width * sc, src.height * sc);
  if (!r.passed) {
    const id = g.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.85; d[i] = d[i + 1] = d[i + 2] = y; }
    g.putImageData(id, 0, 0);
  }
  // band
  const bg = g.createLinearGradient(0, 0, W, 0); bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.15, "rgba(0,0,0,.75)"); bg.addColorStop(0.85, "rgba(0,0,0,.75)"); bg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = bg; g.fillRect(0, 205, W, 210);
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.font = "140px Pricedown, Impact, sans-serif";
  g.fillStyle = "#000"; g.fillText(r.passed ? "mission passed" : "mission failed", W / 2 + 4, 345 + 4);
  g.fillStyle = r.passed ? "#ffd640" : "#c8201e"; g.fillText(r.passed ? "mission passed" : "mission failed", W / 2, 345);
  g.font = "600 30px Inter, sans-serif"; g.fillStyle = "#fff";
  g.fillText(r.passed ? "Escaped all six stars. Respect +" : `${r.reason === "WASTED" ? "Wasted" : "Busted"} on ${stars(r.reachedLevel)}`, W / 2, 392);
  // bottom bar
  g.fillStyle = "rgba(10,7,18,.88)"; g.fillRect(0, H - 120, W, 120);
  g.fillStyle = "#ff3ea5"; g.fillRect(0, H - 120, W, 4);
  drawPortrait(g, CHARACTERS[r.char], 30, H - 104, 88);
  g.textAlign = "left";
  g.font = "800 34px Inter, sans-serif"; g.fillStyle = "#fff"; g.fillText(r.name, 136, H - 62);
  g.font = "600 22px Inter, sans-serif"; g.fillStyle = "#c9bde0";
  g.fillText(r.cleared ? `Cleared ${stars(r.cleared)}  ·  ${fmtT(r.clearTicks)}` : "Didn't clear a level", 136, H - 28);
  g.textAlign = "right";
  g.font = "44px Pricedown, Impact, sans-serif"; g.fillStyle = "#c8201e"; g.fillText("mission failed", W - 30, H - 58);
  g.font = "700 22px Inter, sans-serif"; g.fillStyle = "#ffd640";
  g.fillText(`${(CFG.SITE_URL || location.host).replace(/^https?:\/\//, "")}  ·  ${CFG.TICKER || "$FAILED"}`, W - 30, H - 26);
  // top corner stars
  g.font = "44px Inter, sans-serif"; g.textAlign = "right";
  for (let i = 0; i < G.LEVELS; i++) { g.fillStyle = i < (r.passed ? G.LEVELS : r.reachedLevel) ? "#fff" : "rgba(255,255,255,.25)"; g.fillText("★", W - 30 - (G.LEVELS - 1 - i) * 46, 64); }
  return c;
}

// ---------- leaderboard ----------
function rankList(list) {
  const best = new Map();
  for (const e of list) {
    const k = e.wallet || "n:" + e.name;
    const b = best.get(k);
    if (!b || e.cleared > b.cleared || (e.cleared === b.cleared && e.clearTicks < b.clearTicks)) best.set(k, e);
  }
  return [...best.values()].filter((e) => e.cleared > 0).sort((a, b) => b.cleared - a.cleared || a.clearTicks - b.clearTicks);
}
let boardScope = "round";
// preview-only sample rows (never shown once the live server is connected)
const EXAMPLES = [
  ["leonida_lou", 2, 6, 18900], ["vicecityvet", 1, 5, 14420], ["SK", 0, 5, 15880], ["drift_king", 3, 4, 9120], ["bustedagain", 2, 4, 10310],
  ["keysnotkeys", 0, 3, 6240], ["palmtree", 3, 3, 7030], ["noobdriver", 1, 2, 4100], ["copmagnet", 2, 1, 1650], ["sundown", 3, 1, 1990],
].map(([name, char, cleared, clearTicks]) => ({ name, char, cleared, clearTicks, wallet: "", round: currentRound(), example: true }));
const avCache = {};
function avatar(ch) {
  const i = typeof ch === "number" ? ch : Math.max(0, CHARACTERS.findIndex((c) => c.id === ch));
  if (avCache[i]) return avCache[i];
  const c = document.createElement("canvas"); c.width = c.height = 80; drawPortrait(c.getContext("2d"), CHARACTERS[i] || CHARACTERS[0], 0, 0, 80);
  return (avCache[i] = c.toDataURL());
}
async function openBoard() {
  $("boardOv").classList.add("show");
  $("boardList").innerHTML = `<div class="empty">Loading…</div>`;
  let list = [], meta = "";
  if (DEMO) {
    list = rankList([...(boardScope === "round" ? localBoard.filter((e) => e.round === currentRound()) : localBoard), ...EXAMPLES]);
    meta = "Preview only: example drivers so you can see the layout. The real board starts empty at launch.";
  } else {
    try { const r = await api("/api/leaderboard?scope=" + boardScope); list = r.rows; meta = boardScope === "round" ? `Round ends in ${$("sTimer").textContent} · ${r.players || 0} playing · pool ${(serverState?.pool_sol || 0).toFixed(3)} SOL` : "Best getaway per driver, all time"; }
    catch (e) { meta = e.message; }
  }
  $("boardMeta").textContent = meta; $("boardMeta").classList.toggle("note", DEMO);
  if (!list.length) { $("boardList").innerHTML = `<div class="empty">Nobody's cleared a level yet. Be the first.</div>`; return; }
  $("boardList").innerHTML = list.slice(0, 100).map((e, i) => `<div class="lb${(me.wallet && e.wallet === me.wallet) || (!e.wallet && e.name === me.name) ? " me" : ""}"><div class="r">${i + 1}</div><img class="av" src="${avatar(e.char)}" alt=""><div class="nm">${esc(e.name)}${e.wallet ? `<small>${short(e.wallet)}</small>` : ""}</div><div class="st">${stars(e.cleared)}</div><div class="tm">${fmtT(e.clearTicks)}</div></div>`).join("");
}
const openHow = () => $("howOv").classList.add("show");
$("howBtn").onclick = openHow; $("howBtn2").onclick = openHow;
$("howOv").querySelector("[data-close]").onclick = () => $("howOv").classList.remove("show");
$("howOv").onclick = (e) => { if (e.target.id === "howOv") $("howOv").classList.remove("show"); };
$("howPlay").onclick = () => { $("howOv").classList.remove("show"); sfx.init(); buildSetup(); show("setup"); };
$("boardBtn").onclick = openBoard; $("board2Btn").onclick = openBoard;
for (const t of document.querySelectorAll(".tab")) t.onclick = () => { boardScope = t.dataset.scope; for (const x of document.querySelectorAll(".tab")) x.classList.toggle("on", x === t); openBoard(); };
$("boardOv").querySelector("[data-close]").onclick = () => $("boardOv").classList.remove("show");
$("boardOv").onclick = (e) => { if (e.target.id === "boardOv") $("boardOv").classList.remove("show"); };

// ---------- attract mode behind the title ----------
const bgCanvas = $("bg"), BR = new Renderer(bgCanvas);
let bg = null, bgRaf = 0;
function autopilot(s, mem) {
  const m = s.map, p = s.p;
  if (mem.level !== s.level) {
    mem.level = s.level; const f = mem.f = new Uint16Array(m.W * m.H).fill(65535), q = [s.goal.ty * m.W + s.goal.tx]; f[q[0]] = 0;
    const sol = (x, y) => x < 0 || y < 0 || x >= m.W || y >= m.H || m.t[y * m.W + x] === 1 || m.t[y * m.W + x] === 3;
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % m.W, y = (i - x) / m.W, d = f[i] + 1; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ox, ny = y + oy; if (!sol(nx, ny) && f[ny * m.W + nx] > d) { f[ny * m.W + nx] = d; q.push(ny * m.W + nx); } } }
  }
  const f = mem.f, cx = Math.floor(p.x / G.TILE), cy = Math.floor(p.y / G.TILE);
  let best = f[cy * m.W + cx], bx = cx, by = cy;
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue; if (f[ny * m.W + nx] < best) { best = f[ny * m.W + nx]; bx = nx; by = ny; } }
  const want = G.atan2((by + 0.5) * G.TILE - p.y, (bx + 0.5) * G.TILE - p.x), diff = G.wrapAngle(want - p.a);
  let inp = G.dirBits(want);
  if (Math.abs(diff) > 0.9 && Math.hypot(p.vx, p.vy) > 3.5) inp |= G.BRAKE;
  return inp;
}
function bgStart() {
  BR.resize(); bg = { s: G.createRun((Math.random() * 2 ** 32) >>> 0), mem: {}, wait: 0 }; BR.map = null; BR.carColor = CAR_COLORS[me.color];
  cancelAnimationFrame(bgRaf);
  const f = () => {
    bgRaf = requestAnimationFrame(f);
    if (!bg) return;
    const s = bg.s;
    if (s.status !== "playing") { if (++bg.wait > 90) { bg.s = G.createRun((Math.random() * 2 ** 32) >>> 0); bg.mem = {}; bg.wait = 0; BR.map = null; } }
    else { const evs = G.step(s, s.phase === "playing" ? autopilot(s, bg.mem) : 0); BR.onEvents(evs, s); }
    BR.draw(s, 0, { noArrow: true });
  };
  f();
}
function bgStop() { cancelAnimationFrame(bgRaf); bg = null; }
addEventListener("resize", () => bg && BR.resize());
document.fonts?.load("40px Pricedown").finally(() => bgStart());
// loading intro: "mission failed" -> main screen (once per visit, click to skip)
(() => {
  const el = $("intro");
  const done = () => { el.classList.add("out"); setTimeout(() => el.classList.add("skip"), 700); };
  el.onclick = done;
  setTimeout(done, 2900);
})();
setWalletBtn();

// remove any badge the host injects into the page
function zapHostBadges() {
  document.querySelectorAll("body > *").forEach((el) => {
    if (el.closest("#title, #setup, #game, #boardOv, #howOv, #intro, #toast, #bg")) return;
    const html = (el.outerHTML || "").slice(0, 400).toLowerCase();
    const cs = getComputedStyle(el);
    if ((cs.position === "fixed" || el.tagName.includes("-") || el.tagName === "IFRAME") && html.includes("netlify")) el.remove();
  });
}
new MutationObserver(zapHostBadges).observe(document.body, { childList: true });
zapHostBadges();
