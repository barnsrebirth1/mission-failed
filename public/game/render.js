// Mission Failed — renderer (browser only). Draws the sim state; never changes it.
import { TILE, ROAD, BUILDING, PARK, WATER, SAND, rng } from "./sim.js";

const ROOFS = ["#f6a6c1", "#7fd8d0", "#ffc59a", "#c8b2f0", "#f4e3b5", "#9fc4ff", "#ff9e8a", "#b8ecc0"];
const ROOF_DARK = ["#c97a96", "#55aca5", "#d59b70", "#9d86c6", "#c8b78a", "#729bd6", "#d27462", "#8cc097"];

export function prerenderMap(s) {
  const m = s.map, W = m.W * TILE, H = m.H * TILE;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
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
    // roof
    g.fillStyle = ROOFS[ci]; g.fillRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2 - 4);
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
  // minimap image (1px per tile)
  const mm = document.createElement("canvas"); mm.width = m.W; mm.height = m.H;
  const mg = mm.getContext("2d"), id = mg.createImageData(m.W, m.H);
  for (let i = 0; i < m.W * m.H; i++) {
    const t = m.t[i], o = i * 4;
    const col = t === ROAD ? [205, 207, 220] : t === PARK ? [70, 150, 90] : t === WATER ? [40, 140, 190] : t === SAND ? [220, 200, 150] : [55, 50, 75];
    id.data[o] = col[0]; id.data[o + 1] = col[1]; id.data[o + 2] = col[2]; id.data[o + 3] = 255;
  }
  mg.putImageData(id, 0, 0);
  return { canvas: c, mini: mm };
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function drawCar(g, car, kind, color, t, braking) {
  g.save(); g.translate(car.x, car.y); g.rotate(car.a);
  const L = kind === "tank" ? 50 : kind === "swat" ? 40 : 32, Wd = kind === "tank" ? 34 : kind === "swat" ? 22 : 17;
  g.fillStyle = "rgba(0,0,0,0.4)"; roundRect(g, -L / 2 + 4, -Wd / 2 + 5, L, Wd, 5); g.fill();
  if (kind === "tank") {
    g.fillStyle = "#3f4a3a"; roundRect(g, -L / 2, -Wd / 2, L, Wd, 4); g.fill();
    g.fillStyle = "#262b23"; g.fillRect(-L / 2, -Wd / 2 - 3, L, 6); g.fillRect(-L / 2, Wd / 2 - 3, L, 6);
    g.fillStyle = "#56644f"; g.beginPath(); g.arc(-2, 0, 11, 0, 7); g.fill();
    g.fillStyle = "#4b5745"; g.fillRect(4, -3, 30, 6);
    g.restore(); return;
  }
  if (kind === "player") {
    g.fillStyle = color; roundRect(g, -L / 2, -Wd / 2, L, Wd, 6); g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)"; roundRect(g, -L / 2 + 3, -Wd / 2 + 2, L - 6, 4, 2); g.fill();
    g.fillStyle = "#1b1d2a"; roundRect(g, 1, -Wd / 2 + 3, 8, Wd - 6, 2); g.fill();     // windscreen
    g.fillStyle = "#24273a"; roundRect(g, -11, -Wd / 2 + 3, 6, Wd - 6, 2); g.fill();   // rear window
    g.fillStyle = "#fff8d0"; g.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 4); g.fillRect(L / 2 - 3, Wd / 2 - 6, 3, 4);
    g.fillStyle = braking ? "#ff2a2a" : "#a01818"; g.fillRect(-L / 2, -Wd / 2 + 2, 2, 4); g.fillRect(-L / 2, Wd / 2 - 6, 2, 4);
    if (braking) { g.shadowColor = "#ff2a2a"; g.shadowBlur = 12; g.fillRect(-L / 2, -Wd / 2 + 2, 2, 4); g.fillRect(-L / 2, Wd / 2 - 6, 2, 4); g.shadowBlur = 0; }
  } else {
    const swat = kind === "swat";
    g.fillStyle = swat ? "#1d2333" : "#f2f2f2"; roundRect(g, -L / 2, -Wd / 2, L, Wd, 5); g.fill();
    if (!swat) { g.fillStyle = "#15161c"; g.fillRect(-L / 2 + 6, -Wd / 2, 9, Wd); g.fillRect(L / 2 - 9, -Wd / 2, 9, Wd); }
    g.fillStyle = "#1b1d2a"; roundRect(g, 2, -Wd / 2 + 3, 7, Wd - 6, 2); g.fill();
    if (swat) { g.fillStyle = "#e9edf5"; g.font = "bold 7px Inter, sans-serif"; g.textAlign = "center"; g.fillText("SWAT", -6, 3); }
    // light bar
    const on = Math.floor(t / 6 + car.id) % 2 === 0;
    g.fillStyle = on ? "#ff2949" : "#7a1020"; g.fillRect(-4, -Wd / 2 + 2, 4, Wd / 2 - 2);
    g.fillStyle = on ? "#1f5bff" : "#3fb3ff"; g.fillRect(-4, 0, 4, Wd / 2 - 2);
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(-2, on ? -4 : 4, 0, -2, on ? -4 : 4, 42);
    glow.addColorStop(0, on ? "rgba(255,40,70,0.55)" : "rgba(40,110,255,0.55)"); glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow; g.fillRect(-46, -46, 92, 92);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext("2d");
    this.skids = []; this.parts = []; this.cam = { x: 0, y: 0, z: 1 }; this.shake = 0;
    this.map = null; this.level = 0; this.carColor = "#ff3ea5";
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    if (this.level !== s.level || !this.map) { this.map = prerenderMap(s); this.level = s.level; this.skids = []; this.cam.x = p.x; this.cam.y = p.y; }
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
    g.drawImage(this.map.canvas, 0, 0);
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
    // helicopter + spotlight
    if (s.heli) {
      const h = s.heli;
      g.globalCompositeOperation = "lighter";
      const sl = g.createRadialGradient(h.x, h.y, 10, h.x, h.y, 100);
      sl.addColorStop(0, "rgba(255,255,230,0.42)"); sl.addColorStop(0.75, "rgba(255,255,220,0.18)"); sl.addColorStop(1, "rgba(255,255,220,0)");
      g.fillStyle = sl; g.beginPath(); g.arc(h.x, h.y, 100, 0, 7); g.fill();
      g.globalCompositeOperation = "source-over";
      g.save(); g.translate(h.x - 70, h.y - 90);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(30, 40, 26, 12, 0.3, 0, 7); g.fill();
      g.fillStyle = "#20232f"; g.beginPath(); g.ellipse(0, 0, 18, 9, 0.3, 0, 7); g.fill(); g.fillRect(-30, -2, 20, 4);
      g.strokeStyle = "rgba(220,220,230,0.6)"; g.lineWidth = 2; const ra = t / 2;
      g.beginPath(); g.moveTo(Math.cos(ra) * -34, Math.sin(ra) * -34); g.lineTo(Math.cos(ra) * 34, Math.sin(ra) * 34);
      g.moveTo(Math.cos(ra + 1.57) * -34, Math.sin(ra + 1.57) * -34); g.lineTo(Math.cos(ra + 1.57) * 34, Math.sin(ra + 1.57) * 34); g.stroke();
      g.restore();
    }
    // sunset grade
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(30,5,40,0.55)");
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
    const scale = W / 22; // tiles visible ~22 across
    g.save(); g.clearRect(0, 0, W, H);
    g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, 7); g.clip();
    g.fillStyle = "#231f33"; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.translate(W / 2 - (p.x / TILE) * scale, H / 2 - (p.y / TILE) * scale);
    g.globalAlpha = 0.85; g.drawImage(this.map.mini, 0, 0, m.W * scale, m.H * scale); g.globalAlpha = 1;
    const blip = (x, y, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(x / TILE * scale, y / TILE * scale, r, 0, 7); g.fill(); };
    for (const c of s.cops) blip(c.x, c.y, Math.floor(s.tick / 8) % 2 ? "#ff3049" : "#3b7bff", 4);
    g.restore();
    // safehouse clamped to edge
    g.save();
    const dx = (s.goal.x - p.x) / TILE * scale, dy = (s.goal.y - p.y) / TILE * scale, d = Math.sqrt(dx * dx + dy * dy), maxR = W / 2 - 9;
    const k = d > maxR ? maxR / d : 1;
    g.fillStyle = "#ffd640"; g.strokeStyle = "#000"; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2 + dx * k, H / 2 + dy * k, 6, 0, 7); g.fill(); g.stroke();
    // player arrow
    g.translate(W / 2, H / 2); g.rotate(p.a);
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, 7); g.stroke();
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
    const gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, "#ff7a59"); gr.addColorStop(0.55, "#ff3ea5"); gr.addColorStop(1, "#4b1d7a");
    g.fillStyle = gr; g.fillRect(0, 0, 100, 100);
    g.fillStyle = "rgba(255,230,120,0.9)"; g.beginPath(); g.arc(80, 60, 15, Math.PI, 0); g.fill();
    g.fillStyle = "rgba(30,10,50,0.55)"; for (let i = 0; i < 4; i++) g.fillRect(0, 60 + i * 7, 100, 2 + i);
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
