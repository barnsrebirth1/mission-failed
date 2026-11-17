// Mission Failed — renderer (browser only). Draws the sim state; never changes it.
import { TILE, ROAD, BUILDING, PARK, WATER, SAND, rng } from "./sim.js";

const ROOFS = ["#f6a6c1", "#7fd8d0", "#ffc59a", "#c8b2f0", "#f4e3b5", "#9fc4ff", "#ff9e8a", "#b8ecc0"];
const ROOF_DARK = ["#c97a96", "#55aca5", "#d59b70", "#9d86c6", "#c8b78a", "#729bd6", "#d27462", "#8cc097"];

export function prerenderMap(s, scale = 1) {
  const m = s.map, W = m.W * TILE, H = m.H * TILE;
  const c = document.createElement("canvas"); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const g = c.getContext("2d"); g.scale(scale, scale);
  const lamps = [];
  const R = rng(s.seed + s.level * 31);
  // base asphalt
  g.fillStyle = "#2a2b36"; g.fillRect(0, 0, W, H);
  const at = (x, y) => (x < 0 || y < 0 || x >= m.W || y >= m.H) ? BUILDING : m.t[y * m.W + x];
  // ground layers
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const t = at(x, y), px = x * TILE, py = y * TILE;
    if (t === WATER) {
      const gr = g.createLinearGradient(px, 0, px + TILE, 0); gr.addColorStop(0, "#1fb5c9"); gr.addColorStop(1, "#1272a8");
      g.fillStyle = gr; g.fillRect(px, py, TILE, TILE);
    } else if (t === SAND) { g.fillStyle = "#f1d9a6"; g.fillRect(px, py, TILE, TILE); }
    else if (t === PARK) { g.fillStyle = (x + y) % 2 ? "#3d8b4f" : "#43945a"; g.fillRect(px, py, TILE, TILE); }
    else if (t === ROAD) {
      g.fillStyle = "#30313d"; g.fillRect(px, py, TILE, TILE);
      // grain
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${0.015 + R() * 0.02})`; g.fillRect(px + R() * TILE, py + R() * TILE, 2, 2); }
    }
  }
  // sidewalks: a light curb where road meets a building
  g.fillStyle = "#4a4b5a";
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    if (at(x, y) !== ROAD) continue;
    const px = x * TILE, py = y * TILE;
    if (at(x - 1, y) === BUILDING) g.fillRect(px, py, 5, TILE);
    if (at(x + 1, y) === BUILDING) g.fillRect(px + TILE - 5, py, 5, TILE);
    if (at(x, y - 1) === BUILDING) g.fillRect(px, py, TILE, 5);
    if (at(x, y + 1) === BUILDING) g.fillRect(px, py + TILE - 5, TILE, 5);
  }
  // street lamps along the curbs
  for (let y = 1; y < m.H - 1; y++) for (let x = 1; x < m.W - 1; x++) {
    if (at(x, y) !== ROAD || (x * 7 + y * 3) % 4 !== 0) continue;
    let lx = null, ly = null;
    if (at(x - 1, y) === BUILDING) { lx = x * TILE + 7; ly = y * TILE + TILE / 2; }
    else if (at(x + 1, y) === BUILDING) { lx = x * TILE + TILE - 7; ly = y * TILE + TILE / 2; }
    else if (at(x, y - 1) === BUILDING) { lx = x * TILE + TILE / 2; ly = y * TILE + 7; }
    else if (at(x, y + 1) === BUILDING) { lx = x * TILE + TILE / 2; ly = y * TILE + TILE - 7; }
    if (lx === null) continue;
    lamps.push({ x: lx, y: ly, warm: (x + y) % 3 !== 0 });
  }
  // lane markings down the middle of 2-wide roads
  g.strokeStyle = "rgba(255,214,102,0.55)"; g.lineWidth = 2; g.setLineDash([14, 14]);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    if (at(x, y) !== ROAD) continue;
    const px = x * TILE, py = y * TILE;
    // vertical road pair (this tile + right tile road, left & right of pair not road) -> line on shared edge
    if (at(x + 1, y) === ROAD && at(x - 1, y) !== ROAD && at(x + 2, y) !== ROAD && at(x, y - 1) === ROAD && at(x, y + 1) === ROAD) {
      g.beginPath(); g.moveTo(px + TILE, py); g.lineTo(px + TILE, py + TILE); g.stroke();
    }
    if (at(x, y + 1) === ROAD && at(x, y - 1) !== ROAD && at(x, y + 2) !== ROAD && at(x - 1, y) === ROAD && at(x + 1, y) === ROAD) {
      g.beginPath(); g.moveTo(px, py + TILE); g.lineTo(px + TILE, py + TILE); g.stroke();
    }
  }
  g.setLineDash([]);
  // buildings: group contiguous building rects per block by flood fill for nicer roofs
  const seen = new Uint8Array(m.W * m.H);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    if (at(x, y) !== BUILDING || seen[y * m.W + x]) continue;
    // greedy rectangle
    let w = 1; while (x + w < m.W && at(x + w, y) === BUILDING && !seen[y * m.W + x + w] && w < 4) w++;
    let h = 1; outer: while (y + h < m.H && h < 4) { for (let i = 0; i < w; i++) if (at(x + i, y + h) !== BUILDING || seen[(y + h) * m.W + x + i]) break outer; h++; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen[(y + j) * m.W + x + i] = 1;
    const px = x * TILE, py = y * TILE, pw = w * TILE, ph = h * TILE;
    const ci = Math.floor(R() * ROOFS.length), inset = 3;
    // shadow
    g.fillStyle = "rgba(0,0,0,0.38)"; g.fillRect(px + inset + 7, py + inset + 9, pw - inset * 2, ph - inset * 2);
    // walls hint
    g.fillStyle = ROOF_DARK[ci]; g.fillRect(px + inset, py + inset + 4, pw - inset * 2, ph - inset * 2);
    // lit windows along the visible wall
    for (let wx = px + inset + 5; wx < px + pw - inset - 6; wx += 9) if (R() < 0.55) { g.fillStyle = R() < 0.8 ? "rgba(255,214,140,.9)" : "rgba(140,220,255,.9)"; g.fillRect(wx, py + ph - inset - 3, 4, 2); }
    // roof
    const rg = g.createLinearGradient(px, py, px + pw, py + ph); rg.addColorStop(0, ROOFS[ci]); rg.addColorStop(1, ROOF_DARK[ci]);
    g.fillStyle = rg; g.fillRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2 - 4);
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(px + inset, py + inset, pw - inset * 2, 2); g.fillRect(px + inset, py + inset, 2, ph - inset * 2 - 4);
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 2; g.strokeRect(px + inset + 4, py + inset + 4, pw - inset * 2 - 8, ph - inset * 2 - 12);
    // roof details
    const roll = R();
    if (roll < 0.22 && pw >= 96 && ph >= 96) { // rooftop pool
      g.fillStyle = "#e9f6f7"; g.fillRect(px + pw / 2 - 26, py + ph / 2 - 18, 52, 32);
      g.fillStyle = "#38c6d9"; g.fillRect(px + pw / 2 - 22, py + ph / 2 - 14, 44, 24);
    } else {
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const ax = px + 12 + R() * (pw - 40), ay = py + 12 + R() * (ph - 44);
        g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(ax + 3, ay + 3, 16, 12);
        g.fillStyle = "#d9dbe3"; g.fillRect(ax, ay, 16, 12);
        g.fillStyle = "#9da1ad"; g.fillRect(ax + 3, ay + 3, 10, 6);
      }
    }
    if (R() < 0.12) { // neon sign strip
      g.fillStyle = R() < 0.5 ? "#ff3ea5" : "#29f0ff";
      g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.fillRect(px + inset + 6, py + ph - inset - 10, pw - inset * 2 - 12, 3); g.shadowBlur = 0;
    }
  }
  // palm trees in parks and on the beach
  const palm = (x, y, r) => {
    g.fillStyle = "rgba(0,0,0,0.3)"; g.beginPath(); g.ellipse(x + 8, y + 10, r, r * 0.8, 0, 0, 7); g.fill();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + R();
      g.fillStyle = k % 2 ? "#2f9e57" : "#3cb868";
      g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.62, r * 0.22, a, 0, 7); g.fill();
    }
    g.fillStyle = "#7a5a36"; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
  };
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const t = at(x, y);
    if (t === PARK && R() < 0.45) palm(x * TILE + 10 + R() * 28, y * TILE + 10 + R() * 28, 13 + R() * 6);
    if (t === SAND && R() < 0.25) palm(x * TILE + 24, y * TILE + 24, 14);
  }
  for (const L of lamps) {
    g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(L.x + 3, L.y + 3, 4, 0, 7); g.fill();
    g.fillStyle = "#3a3c48"; g.beginPath(); g.arc(L.x, L.y, 3.5, 0, 7); g.fill();
    g.fillStyle = L.warm ? "#ffe2a8" : "#d8f0ff"; g.beginPath(); g.arc(L.x, L.y, 1.8, 0, 7); g.fill();
  }
  // night: tint the whole city, then pour warm/cool lamp light onto the roads only
  g.fillStyle = "rgba(10,8,30,0.42)"; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath();
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (at(x, y) === ROAD || at(x, y) === SAND) g.rect(x * TILE, y * TILE, TILE, TILE);
  g.clip(); g.globalCompositeOperation = "lighter";
  for (const L of lamps) { const gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, 64); gr.addColorStop(0, L.warm ? "rgba(255,180,90,.30)" : "rgba(140,200,255,.24)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(L.x - 64, L.y - 64, 128, 128); }
  g.restore();
  // neon trims glow on top of the tint
  g.globalCompositeOperation = "source-over";
  // minimap image (1px per tile)
  const mm = document.createElement("canvas"); mm.width = m.W; mm.height = m.H;
  const mg = mm.getContext("2d"), id = mg.createImageData(m.W, m.H);
  for (let i = 0; i < m.W * m.H; i++) {
    const t = m.t[i], o = i * 4;
    const col = t === ROAD ? [128, 130, 146] : t === PARK ? [52, 104, 66] : t === WATER ? [34, 92, 140] : t === SAND ? [150, 136, 104] : [30, 29, 40];
    id.data[o] = col[0]; id.data[o + 1] = col[1]; id.data[o + 2] = col[2]; id.data[o + 3] = 255;
  }
  mg.putImageData(id, 0, 0);
  return { canvas: c, mini: mm, lamps, W, H };
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function shade(hex, k) { // k<0 darker, k>0 lighter
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}
function drawCar(g, car, kind, color, t, braking) {
  g.save(); g.translate(car.x, car.y); g.rotate(car.a);
  const L = kind === "tank" ? 50 : kind === "swat" ? 40 : 34, Wd = kind === "tank" ? 34 : kind === "swat" ? 22 : 18;
  // soft shadow
  g.fillStyle = "rgba(0,0,0,0.45)"; roundRect(g, -L / 2 + 3, -Wd / 2 + 4, L + 2, Wd + 1, 6); g.fill();
  if (kind === "tank") {
    g.fillStyle = "#2c3328"; g.fillRect(-L / 2 - 1, -Wd / 2 - 4, L + 2, 8); g.fillRect(-L / 2 - 1, Wd / 2 - 4, L + 2, 8);
    g.fillStyle = "#1c211a"; for (let i = -L / 2; i < L / 2; i += 5) { g.fillRect(i, -Wd / 2 - 4, 2, 8); g.fillRect(i, Wd / 2 - 4, 2, 8); }
    const tg = g.createLinearGradient(0, -Wd / 2, 0, Wd / 2); tg.addColorStop(0, "#5b6a52"); tg.addColorStop(1, "#3a4535");
    g.fillStyle = tg; roundRect(g, -L / 2 + 2, -Wd / 2 + 3, L - 4, Wd - 6, 4); g.fill();
    g.fillStyle = "#4b5745"; g.fillRect(2, -3, 34, 6); g.fillStyle = "#2c3328"; g.fillRect(34, -4, 5, 8);
    g.fillStyle = "#64735a"; g.beginPath(); g.arc(-3, 0, 11, 0, 7); g.fill(); g.strokeStyle = "#2c3328"; g.lineWidth = 1.5; g.stroke();
    g.restore(); return;
  }
  const body = kind === "player" ? color : kind === "swat" ? "#1d2333" : "#f4f5f7";
  // wheels
  g.fillStyle = "#0b0b0f";
  for (const [wx, wy] of [[L / 2 - 9, -Wd / 2 - 1.5], [L / 2 - 9, Wd / 2 - 2.5], [-L / 2 + 5, -Wd / 2 - 1.5], [-L / 2 + 5, Wd / 2 - 2.5]]) g.fillRect(wx, wy, 7, 4);
  // body with side shading
  const bg = g.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
  bg.addColorStop(0, shade(body, -0.25)); bg.addColorStop(0.3, shade(body, 0.12)); bg.addColorStop(0.7, body); bg.addColorStop(1, shade(body, -0.35));
  g.fillStyle = bg; roundRect(g, -L / 2, -Wd / 2, L, Wd, 6); g.fill();
  g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 1; g.stroke();
  if (kind === "cop") { g.fillStyle = "#121318"; roundRect(g, -L / 2, -Wd / 2, 9, Wd, 4); g.fill(); roundRect(g, L / 2 - 8, -Wd / 2, 8, Wd, 4); g.fill(); }
  // cabin: windscreen, roof, rear window
  g.fillStyle = "#0f1220"; roundRect(g, 0, -Wd / 2 + 2.5, 9, Wd - 5, 2.5); g.fill();
  g.fillStyle = "rgba(160,200,255,.35)"; g.fillRect(6, -Wd / 2 + 3.5, 1.5, Wd - 7);
  g.fillStyle = kind === "player" ? shade(body, -0.12) : kind === "swat" ? "#273048" : "#e6e7ea"; roundRect(g, -10, -Wd / 2 + 3, 10, Wd - 6, 2); g.fill();
  g.fillStyle = "#151827"; roundRect(g, -14, -Wd / 2 + 3, 4.5, Wd - 6, 1.5); g.fill();
  // mirrors
  g.fillStyle = shade(body, -0.3); g.fillRect(1, -Wd / 2 - 2, 3, 2); g.fillRect(1, Wd / 2, 3, 2);
  // lights
  g.fillStyle = "#fff6d5"; g.fillRect(L / 2 - 2.5, -Wd / 2 + 2, 2.5, 4); g.fillRect(L / 2 - 2.5, Wd / 2 - 6, 2.5, 4);
  g.fillStyle = braking ? "#ff3030" : "#9a1616"; g.fillRect(-L / 2, -Wd / 2 + 2, 2, 4); g.fillRect(-L / 2, Wd / 2 - 6, 2, 4);
  if (kind === "player") { g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(-L / 2 + 4, -1, L - 8, 2); } // racing stripe sheen
  if (kind === "swat") { g.fillStyle = "#e9edf5"; g.font = "bold 6px Inter, sans-serif"; g.textAlign = "center"; g.fillText("SWAT", -5, 2.5); }
  if (kind !== "player") { // light bar
    const on = Math.floor(t / 6 + car.id) % 2 === 0;
    g.fillStyle = on ? "#ff2949" : "#5a0d18"; g.fillRect(-4, -Wd / 2 + 2.5, 4, Wd / 2 - 2.5);
    g.fillStyle = on ? "#1f3a7a" : "#3f8bff"; g.fillRect(-4, 0, 4, Wd / 2 - 2.5);
  }
  g.restore();
}
function copGlow(g, car, t) {
  const on = Math.floor(t / 6 + car.id) % 2 === 0, a = car.a, ox = Math.cos(a) * -2, oy = Math.sin(a) * -2;
  const nx = -Math.sin(a) * (on ? -4 : 4), ny = Math.cos(a) * (on ? -4 : 4);
  const gr = g.createRadialGradient(car.x + ox + nx, car.y + oy + ny, 0, car.x + ox + nx, car.y + oy + ny, 64);
  gr.addColorStop(0, on ? "rgba(255,40,70,0.75)" : "rgba(50,120,255,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(car.x - 70, car.y - 70, 140, 140);
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext("2d");
    this.skids = []; this.parts = []; this.cam = { x: 0, y: 0, z: 1 }; this.shake = 0;
    this.map = null; this.level = 0; this.carColor = "#ff3ea5";
    this.low = matchMedia("(hover: none)").matches || Math.min(screen.width, screen.height) < 700;
    this.lc = document.createElement("canvas"); this.lg = this.lc.getContext("2d");
    this.night = true;
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.low ? 1.5 : 2);
    this.c.width = Math.floor(this.c.clientWidth * dpr); this.c.height = Math.floor(this.c.clientHeight * dpr);
    this.dpr = dpr;
  }
  onEvents(evs, s) {
    for (const e of evs) {
      if (e.t === "crash") { this.shake = Math.min(14, 3 + e.power * 1.6); for (let i = 0; i < 10; i++) this.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 22 + Math.random() * 12, col: Math.random() < 0.5 ? "#ffd166" : "#ffffff" }); }
      if (e.t === "spike") { this.shake = 6; }
    }
  }
  draw(s, input, opts = {}) {
    const g = this.g, c = this.c, p = s.p;
    if (this.level !== s.level || !this.map) { this.map = prerenderMap(s, this.low ? 0.6 : 1); this.level = s.level; this.skids = []; this.cam.x = p.x; this.cam.y = p.y; }
    // camera with look-ahead
    const view = Math.min(c.width, c.height) / this.dpr;
    const targetZ = (view < 520 ? 0.95 : 1.3) * this.dpr;
    this.cam.z += (targetZ - this.cam.z) * 0.1;
    this.cam.x += (p.x + p.vx * 18 - this.cam.x) * 0.12;
    this.cam.y += (p.y + p.vy * 18 - this.cam.y) * 0.12;
    { // keep the camera inside the map
      const hw = c.width / 2 / this.cam.z, hh = c.height / 2 / this.cam.z, MW = s.map.W * TILE, MH = s.map.H * TILE;
      this.cam.x = MW > hw * 2 ? Math.max(hw, Math.min(MW - hw, this.cam.x)) : MW / 2;
      this.cam.y = MH > hh * 2 ? Math.max(hh, Math.min(MH - hh, this.cam.y)) : MH / 2;
    }
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake; this.shake *= 0.86;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#14121e"; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(this.cam.z, 0, 0, this.cam.z, c.width / 2 - this.cam.x * this.cam.z + sx, c.height / 2 - this.cam.y * this.cam.z + sy);
    g.drawImage(this.map.canvas, 0, 0, this.map.W, this.map.H);
    // animated ocean shimmer
    const t = s.tick;
    // skid marks
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const lat = Math.abs(-Math.sin(p.a) * p.vx + Math.cos(p.a) * p.vy);
    if ((input & 16 && sp > 2) || lat > 2.2) { this.skids.push({ x: p.x - Math.cos(p.a) * 12, y: p.y - Math.sin(p.a) * 12, a: p.a }); if (this.skids.length > 500) this.skids.shift(); }
    g.fillStyle = "rgba(10,10,14,0.35)";
    for (const k of this.skids) { g.save(); g.translate(k.x, k.y); g.rotate(k.a); g.fillRect(-2, -8, 4, 3); g.fillRect(-2, 5, 4, 3); g.restore(); }
    // spikes
    for (const k of s.spikes) {
      g.save(); g.translate(k.x, k.y);
      g.fillStyle = "#1b1b20"; g.fillRect(-20, -4, 40, 8);
      g.fillStyle = "#c9ccd6"; for (let i = -18; i < 18; i += 5) { g.beginPath(); g.moveTo(i, -4); g.lineTo(i + 2.5, -9); g.lineTo(i + 5, -4); g.fill(); }
      g.restore();
    }
    // safehouse blip
    const pulse = 0.5 + 0.5 * Math.sin(t / 9);
    g.save(); g.translate(s.goal.x, s.goal.y);
    g.fillStyle = `rgba(255,214,64,${0.18 + pulse * 0.2})`; g.beginPath(); g.arc(0, 0, 40 + pulse * 10, 0, 7); g.fill();
    g.strokeStyle = "#ffd640"; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 28, 0, 7); g.stroke();
    g.fillStyle = "#ffd640"; g.font = "bold 22px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("⌂", 0, 1);
    g.restore();
    // roadblocks
    for (const b of s.blocks) {
      g.save(); g.translate(b.x, b.y); g.rotate(b.a);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(-26, -6, 56, 14);
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#ff3b30"; g.fillRect(-28 + i * 9.3, -5, 9.3, 9); }
      g.restore();
      drawCar(g, { x: b.x + Math.cos(b.a + 1.57) * 18, y: b.y + Math.sin(b.a + 1.57) * 18, a: b.a, id: 3 }, "cop", null, t);
    }
    // cops
    for (const cop of s.cops) drawCar(g, cop, cop.type === "cop" ? "cop" : cop.type, null, t);
    // player
    drawCar(g, p, "player", this.carColor, t, (input & 16) !== 0);
    if (p.hp < 35) { if (t % 4 === 0) this.parts.push({ x: p.x - Math.cos(p.a) * 14, y: p.y - Math.sin(p.a) * 14, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), life: 40, col: "smoke" }); }
    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.x += q.vx; q.y += q.vy; q.life--;
      if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      if (q.col === "smoke") { g.fillStyle = `rgba(60,60,70,${q.life / 80})`; g.beginPath(); g.arc(q.x, q.y, 6 + (40 - q.life) * 0.4, 0, 7); g.fill(); }
      else { g.fillStyle = q.col; g.fillRect(q.x, q.y, 3, 3); }
    }
    const wt = [this.cam.z, 0, 0, this.cam.z, c.width / 2 - this.cam.x * this.cam.z + sx, c.height / 2 - this.cam.y * this.cam.z + sy];
    // ---- night lighting: darken everything, then cut light pools out of the dark ----
    if (this.night) {
      const lc = this.lc, lg = this.lg;
      if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = "source-over"; lg.clearRect(0, 0, lc.width, lc.height);
      lg.fillStyle = "rgba(4,3,14,0.38)"; lg.fillRect(0, 0, lc.width, lc.height);
      lg.setTransform(...wt); lg.globalCompositeOperation = "destination-out";
      const hw = c.width / 2 / this.cam.z + 120, hh = c.height / 2 / this.cam.z + 120;
      const vis = (x, y) => Math.abs(x - this.cam.x) < hw && Math.abs(y - this.cam.y) < hh;
      const pool = (x, y, r, a) => { const gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)"); lg.fillStyle = gr; lg.fillRect(x - r, y - r, r * 2, r * 2); };
      const beam = (car, len, wid, a) => { lg.save(); lg.translate(car.x, car.y); lg.rotate(car.a); const gr = lg.createLinearGradient(14, 0, len, 0); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)"); lg.fillStyle = gr; lg.beginPath(); lg.moveTo(14, -7); lg.lineTo(len, -wid); lg.lineTo(len, wid); lg.lineTo(14, 7); lg.closePath(); lg.fill(); lg.restore(); };
      pool(p.x, p.y, 80, 0.55); beam(p, 230, 78, 0.9);
      for (const cop of s.cops) if (vis(cop.x, cop.y)) { beam(cop, 150, 48, 0.7); pool(cop.x, cop.y, 40, 0.5); }
      pool(s.goal.x, s.goal.y, 110, 0.9);
      if (s.heli) pool(s.heli.x, s.heli.y, 105, 0.95);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(lc, 0, 0);
      g.setTransform(...wt);
      // coloured light on top
      g.globalCompositeOperation = "lighter";
      for (const cop of s.cops) if (vis(cop.x, cop.y)) copGlow(g, cop, t);
      for (const b of s.blocks) if (vis(b.x, b.y)) copGlow(g, { x: b.x + Math.cos(b.a + 1.57) * 18, y: b.y + Math.sin(b.a + 1.57) * 18, a: b.a, id: 3 }, t);
      const tl = g.createRadialGradient(p.x - Math.cos(p.a) * 18, p.y - Math.sin(p.a) * 18, 0, p.x - Math.cos(p.a) * 18, p.y - Math.sin(p.a) * 18, (input & 16) ? 40 : 22);
      tl.addColorStop(0, "rgba(255,30,40,.55)"); tl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = tl; g.fillRect(p.x - 70, p.y - 70, 140, 140);
      const sg = g.createRadialGradient(s.goal.x, s.goal.y, 0, s.goal.x, s.goal.y, 90); sg.addColorStop(0, `rgba(255,200,40,${0.25 + pulse * 0.15})`); sg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sg; g.fillRect(s.goal.x - 90, s.goal.y - 90, 180, 180);
      g.globalCompositeOperation = "source-over";
    } else {
      for (const cop of s.cops) { g.globalCompositeOperation = "lighter"; copGlow(g, cop, t); g.globalCompositeOperation = "source-over"; }
    }
    // helicopter (above the lights)
    if (s.heli) {
      const h = s.heli;
      g.globalCompositeOperation = "lighter";
      const sl = g.createRadialGradient(h.x, h.y, 10, h.x, h.y, 100);
      sl.addColorStop(0, "rgba(255,255,230,0.35)"); sl.addColorStop(0.75, "rgba(255,255,220,0.12)"); sl.addColorStop(1, "rgba(255,255,220,0)");
      g.fillStyle = sl; g.beginPath(); g.arc(h.x, h.y, 100, 0, 7); g.fill();
      g.globalCompositeOperation = "source-over";
      g.save(); g.translate(h.x - 70, h.y - 90);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(30, 40, 26, 12, 0.3, 0, 7); g.fill();
      g.fillStyle = "#2a2e3c"; g.beginPath(); g.ellipse(0, 0, 18, 9, 0.3, 0, 7); g.fill(); g.fillRect(-30, -2, 20, 4);
      g.fillStyle = Math.floor(t / 10) % 2 ? "#ff3049" : "#ffffff"; g.fillRect(-31, -2, 3, 3);
      g.strokeStyle = "rgba(220,220,230,0.6)"; g.lineWidth = 2; const ra = t / 2;
      g.beginPath(); g.moveTo(Math.cos(ra) * -34, Math.sin(ra) * -34); g.lineTo(Math.cos(ra) * 34, Math.sin(ra) * 34);
      g.moveTo(Math.cos(ra + 1.57) * -34, Math.sin(ra + 1.57) * -34); g.lineTo(Math.cos(ra + 1.57) * 34, Math.sin(ra + 1.57) * 34); g.stroke();
      g.restore();
    }
    // vignette
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.4, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
    // off-screen arrow to safehouse
    const gx = (s.goal.x - this.cam.x) * this.cam.z + c.width / 2, gy = (s.goal.y - this.cam.y) * this.cam.z + c.height / 2;
    const pad = 46 * this.dpr;
    if (!opts.noArrow && (gx < 0 || gy < 0 || gx > c.width || gy > c.height)) {
      const ang = Math.atan2(gy - c.height / 2, gx - c.width / 2);
      const ax = Math.max(pad, Math.min(c.width - pad, gx)), ay = Math.max(pad, Math.min(c.height - pad, gy));
      g.save(); g.translate(ax, ay); g.rotate(ang); g.scale(this.dpr, this.dpr);
      g.fillStyle = "#ffd640"; g.shadowColor = "#ffd640"; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-4, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
      g.restore();
    }
  }
  minimap(mc, s) {
    if (!this.map) return;
    const g = mc.getContext("2d"), W = mc.width, H = mc.height, m = s.map, p = s.p;
    const scale = W / 20, r = 14;
    const rr = () => { g.beginPath(); g.moveTo(r, 0); g.arcTo(W, 0, W, H, r); g.arcTo(W, H, 0, H, r); g.arcTo(0, H, 0, 0, r); g.arcTo(0, 0, W, 0, r); g.closePath(); };
    g.save(); g.clearRect(0, 0, W, H); rr(); g.clip();
    g.fillStyle = "#15131f"; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.translate(W / 2 - (p.x / TILE) * scale, H / 2 - (p.y / TILE) * scale);
    g.globalAlpha = 0.9; g.drawImage(this.map.mini, 0, 0, m.W * scale, m.H * scale); g.globalAlpha = 1;
    const blip = (x, y, col, rad) => { g.fillStyle = col; g.beginPath(); g.arc(x / TILE * scale, y / TILE * scale, rad, 0, 7); g.fill(); };
    for (const c of s.cops) blip(c.x, c.y, Math.floor(s.tick / 8) % 2 ? "#ff3049" : "#3b7bff", 4);
    g.restore();
    g.save(); rr(); g.clip();
    const dx = (s.goal.x - p.x) / TILE * scale, dy = (s.goal.y - p.y) / TILE * scale;
    const kx = Math.abs(dx) > W / 2 - 10 ? (W / 2 - 10) / Math.abs(dx) : 1, ky = Math.abs(dy) > H / 2 - 10 ? (H / 2 - 10) / Math.abs(dy) : 1, k = Math.min(kx, ky);
    g.fillStyle = "#ffd640"; g.strokeStyle = "#000"; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2 + dx * k, H / 2 + dy * k, 6, 0, 7); g.fill(); g.stroke();
    g.translate(W / 2, H / 2); g.rotate(p.a);
    g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    rr(); g.strokeStyle = "rgba(0,0,0,.9)"; g.lineWidth = 5; g.stroke(); rr(); g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1.5; g.stroke();
  }
}

// ---------- character portraits (original characters) ----------
export const CHARACTERS = [
  { id: "mari", name: "Mari", skin: "#c68a5f", hair: "#1a1410", outfit: "#ff3ea5", style: "long" },
  { id: "dre",  name: "Dre",  skin: "#7a4e33", hair: "#0e0c0b", outfit: "#ffb02e", style: "buzz" },
  { id: "cole", name: "Cole", skin: "#f0c4a4", hair: "#5a3a22", outfit: "#29d3e8", style: "cap" },
  { id: "jade", name: "Jade", skin: "#f5d3bb", hair: "#ecc76d", outfit: "#a66bff", style: "bun" },
];
export const CAR_COLORS = ["#ff3ea5", "#29d3e8", "#ffd640", "#ff5a36", "#7cff6b", "#a66bff", "#ffffff", "#1d1f2b"];

export function drawPortrait(g, ch, x, y, size, bg = true) {
  g.save(); g.translate(x, y); const k = size / 100; g.scale(k, k);
  if (bg) {
    const gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, "#22222b"); gr.addColorStop(1, "#08080b");
    g.fillStyle = gr; g.fillRect(0, 0, 100, 100);
    const rim = g.createRadialGradient(50, 46, 6, 50, 46, 52); rim.addColorStop(0, "rgba(227,38,43,.55)"); rim.addColorStop(1, "rgba(227,38,43,0)");
    g.fillStyle = rim; g.fillRect(0, 0, 100, 100);
    g.fillStyle = "rgba(255,255,255,.05)"; for (let i = 0; i < 6; i++) g.fillRect(0, 8 + i * 15, 100, 1);
    g.fillStyle = "rgba(60,120,255,.18)"; g.fillRect(0, 0, 6, 100); g.fillStyle = "rgba(255,40,60,.18)"; g.fillRect(94, 0, 6, 100);
  }
  // shoulders / outfit
  g.fillStyle = ch.outfit; g.beginPath(); g.moveTo(14, 100); g.quadraticCurveTo(18, 72, 50, 70); g.quadraticCurveTo(82, 72, 86, 100); g.fill();
  g.fillStyle = "rgba(0,0,0,0.18)"; g.beginPath(); g.moveTo(44, 72); g.lineTo(50, 90); g.lineTo(56, 72); g.fill();
  // neck + head
  g.fillStyle = ch.skin; g.fillRect(43, 58, 14, 14);
  g.beginPath(); g.ellipse(50, 44, 17, 20, 0, 0, 7); g.fill();
  g.fillStyle = "rgba(0,0,0,0.12)"; g.beginPath(); g.ellipse(56, 46, 9, 16, 0, 0, 7); g.fill();
  // hair
  g.fillStyle = ch.hair;
  if (ch.style === "cap") { g.beginPath(); g.ellipse(50, 30, 19, 11, 0, Math.PI, 0); g.fill(); g.fillRect(31, 29, 38, 5); g.fillRect(46, 29, 30, 4); }
  if (ch.style === "long") { g.beginPath(); g.ellipse(50, 34, 19, 15, 0, Math.PI, 0); g.fill(); g.fillRect(31, 33, 7, 34); g.fillRect(62, 33, 7, 34); }
  if (ch.style === "buzz") { g.beginPath(); g.ellipse(50, 31, 17, 9, 0, Math.PI, 0); g.fill(); g.fillStyle = "rgba(14,12,11,0.75)"; g.beginPath(); g.ellipse(50, 56, 13, 8, 0, 0, Math.PI); g.fill(); }
  if (ch.style === "bun") { g.beginPath(); g.ellipse(50, 31, 18, 11, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(50, 17, 8, 0, 7); g.fill(); }
  // shades
  g.fillStyle = "#101018"; g.fillRect(35, 40, 13, 6); g.fillRect(52, 40, 13, 6); g.fillRect(47, 41, 6, 2);
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(37, 41, 4, 2); g.fillRect(54, 41, 4, 2);
  if (ch.style === "long" || ch.style === "bun") { g.fillStyle = "#ffd640"; g.beginPath(); g.arc(33, 52, 2.5, 0, 7); g.arc(67, 52, 2.5, 0, 7); g.fill(); }
  g.restore();
}

// Draws the player car (for the driver-select preview)
export function drawCarSprite(g, x, y, a, color, scale = 1) {
  g.save(); g.translate(x, y); g.scale(scale, scale); drawCar(g, { x: 0, y: 0, a, id: 0 }, "player", color, 0, false); g.restore();
}
