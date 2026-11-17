// Mission Failed — deterministic game simulation.
// The SAME file runs in the browser (to play) and on the server (to replay a run from its inputs and
// verify the score). Only + - * / sqrt floor and Math.imul are used, which give identical results in
// every JS engine, so a replay always lands exactly where the player's game did.

export const TICK_HZ = 60;
export const TILE = 48;
export const LEVELS = 6;
export const POINTS = [0, 1, 2, 4, 8, 16, 40]; // points for highest level cleared (index = level)
export const INTERMISSION = 150;          // ticks between levels (2.5s "LEVEL CLEARED" banner)

// Input bits
export const UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8, BRAKE = 16;

// Tiles
export const ROAD = 0, BUILDING = 1, PARK = 2, WATER = 3, SAND = 4;

// ---------- deterministic maths ----------
const PI = 3.141592653589793, TAU = 6.283185307179586, HALF_PI = 1.5707963267948966;
export function wrapAngle(a) { a = a - TAU * Math.floor((a + PI) / TAU); return a; } // -> [-PI, PI)
export function sin(a) {
  a = wrapAngle(a);
  if (a > HALF_PI) a = PI - a; else if (a < -HALF_PI) a = -PI - a;
  const x2 = a * a;
  return a * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156))))));
}
export function cos(a) { return sin(a + HALF_PI); }
export function atan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  const swap = ay > ax;
  const t = swap ? ax / ay : ay / ax;           // 0..1
  // atan on [0,1] via t/(1+0.28086 t^2) refined with a minimax polynomial
  const t2 = t * t;
  let r = t * (0.9998660 + t2 * (-0.3302995 + t2 * (0.1801410 + t2 * (-0.0851330 + t2 * 0.0208351))));
  if (swap) r = HALF_PI - r;
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}
const sqrt = Math.sqrt, floor = Math.floor;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- level design ----------
// Each star gets meaner. ★★★★★★ is meant to stop almost everyone.
export const LEVEL_CFG = [
  null,
  { stars: 1, size: 44, goal: 52, cops: 2,  copSpeed: 0.74, copAccel: 0.8,  swat: 0, tanks: 0, blocks: 0, spikes: 0, heli: 0,    bustTicks: 150, spawnMin: 900, dmg: 0.6 },
  { stars: 2, size: 48, goal: 62, cops: 4,  copSpeed: 0.86, copAccel: 0.92, swat: 0, tanks: 0, blocks: 2, spikes: 0, heli: 0,    bustTicks: 105, spawnMin: 560, dmg: 0.85 },
  { stars: 3, size: 54, goal: 72, cops: 6,  copSpeed: 0.97, copAccel: 1.05, swat: 1, tanks: 0, blocks: 5, spikes: 6, heli: 0,    bustTicks: 90,  spawnMin: 520, dmg: 1.0 },
  { stars: 4, size: 60, goal: 82, cops: 8,  copSpeed: 1.02, copAccel: 1.12, swat: 2, tanks: 0, blocks: 7, spikes: 9, heli: 0.93, bustTicks: 75,  spawnMin: 480, dmg: 1.15 },
  { stars: 5, size: 64, goal: 88, cops: 10, copSpeed: 1.05, copAccel: 1.18, swat: 3, tanks: 1, blocks: 9, spikes: 12, heli: 0.97, bustTicks: 66,  spawnMin: 460, dmg: 1.25 },
  { stars: 6, size: 70, goal: 100, cops: 13, copSpeed: 1.12, copAccel: 1.3, swat: 4, tanks: 3, blocks: 12, spikes: 16, heli: 1.08, bustTicks: 54, spawnMin: 420, dmg: 1.5 },
];

const CAR = { maxSpeed: 6.3, accel: 0.17, reverse: 0.09, turn: 0.062, grip: 0.82, drift: 0.965, drag: 0.993, r: 13 };
const TYPES = {
  cop:  { speed: 1.00, accel: 1.00, r: 13, mass: 1.0, hit: 1.0, turn: 1.0 },
  swat: { speed: 0.94, accel: 0.90, r: 16, mass: 1.8, hit: 1.6, turn: 0.85 },
  tank: { speed: 0.62, accel: 0.55, r: 22, mass: 5.0, hit: 3.2, turn: 0.6 },
};

// ---------- map generation ----------
function buildMap(level, seed) {
  const cfg = LEVEL_CFG[level];
  const R = rng(seed ^ (level * 0x9E3779B1));
  const W = cfg.size, H = cfg.size;
  const t = new Uint8Array(W * H).fill(BUILDING);
  const BLOCK = 6; // road every 6 tiles, 2 wide
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x % BLOCK < 2, ry = y % BLOCK < 2;
    if (rx || ry) t[y * W + x] = ROAD;
  }
  // blocks: some become parks (drive-through grass, slower) or get an alley through them
  for (let by = 2; by < H; by += BLOCK) for (let bx = 2; bx < W; bx += BLOCK) {
    const roll = R();
    if (roll < 0.16) { for (let y = by; y < by + 4 && y < H; y++) for (let x = bx; x < bx + 4 && x < W; x++) t[y * W + x] = PARK; }
    else if (roll < 0.36) {
      const horiz = R() < 0.5;
      for (let i = 0; i < 4; i++) { const x = horiz ? bx + i : bx + 2, y = horiz ? by + 2 : by + i; if (x < W && y < H) t[y * W + x] = ROAD; }
    }
  }
  // cut a few road segments between junctions -> dead ends and detours
  const nb = floor(W / BLOCK);
  for (let i = 0; i < floor(W * H / 170); i++) {
    const vert = R() < 0.5, line = (1 + floor(R() * (nb - 1))) * BLOCK, seg = floor(R() * nb) * BLOCK + 2;
    if (seg + 4 > W - 4 || line > W - 5) continue;
    for (let k = 0; k < 4; k++) for (let w = 0; w < 2; w++) {
      const x = vert ? line + w : seg + k, y = vert ? seg + k : line + w;
      if (t[y * W + x] === ROAD) t[y * W + x] = BUILDING;
    }
  }
  // Leonida coast: beach + ocean down the east edge
  for (let y = 0; y < H; y++) { t[y * W + W - 1] = WATER; t[y * W + W - 2] = WATER; t[y * W + W - 3] = SAND; }
  // outer wall
  for (let x = 0; x < W; x++) { t[x] = BUILDING; t[(H - 1) * W + x] = BUILDING; }
  for (let y = 0; y < H; y++) { t[y * W] = BUILDING; }
  // re-open the first road ring inside the wall
  for (let x = 1; x < W - 3; x++) t[1 * W + x] = ROAD;
  for (let y = 1; y < H - 1; y++) t[y * W + 1] = ROAD;
  for (let x = 1; x < W - 3; x++) t[(H - 2) * W + x] = ROAD;
  return { W, H, t };
}

const solid = (m, tx, ty) => (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) ? true : (m.t[ty * m.W + tx] === BUILDING || m.t[ty * m.W + tx] === WATER);
const tileAt = (m, x, y) => { const tx = floor(x / TILE), ty = floor(y / TILE); return (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) ? BUILDING : m.t[ty * m.W + tx]; };
const isRoad = (m, tx, ty) => tx >= 0 && ty >= 0 && tx < m.W && ty < m.H && m.t[ty * m.W + tx] === ROAD;

// BFS distance field over drivable tiles (road, park, sand) from (sx,sy)
function flowField(m, sx, sy, out) {
  const N = m.W * m.H;
  out.fill(65535);
  const q = new Int32Array(N);
  let h = 0, tl = 0;
  if (solid(m, sx, sy)) return out;
  out[sy * m.W + sx] = 0; q[tl++] = sy * m.W + sx;
  while (h < tl) {
    const i = q[h++], x = i % m.W, y = (i - x) / m.W, d = out[i] + 1;
    if (x > 0 && !solid(m, x - 1, y) && out[i - 1] > d) { out[i - 1] = d; q[tl++] = i - 1; }
    if (x < m.W - 1 && !solid(m, x + 1, y) && out[i + 1] > d) { out[i + 1] = d; q[tl++] = i + 1; }
    if (y > 0 && !solid(m, x, y - 1) && out[i - m.W] > d) { out[i - m.W] = d; q[tl++] = i - m.W; }
    if (y < m.H - 1 && !solid(m, x, y + 1) && out[i + m.W] > d) { out[i + m.W] = d; q[tl++] = i + m.W; }
  }
  return out;
}

// ---------- entities ----------
function makeCar(x, y, a, type) { return { x, y, vx: 0, vy: 0, a, type, stuck: 0, rev: 0, revSteer: 0, id: 0, siren: 0 }; }

function roadTilesWhere(m, fn) {
  const out = [];
  for (let y = 1; y < m.H - 1; y++) for (let x = 1; x < m.W - 1; x++) if (isRoad(m, x, y) && fn(x, y)) out.push(y * m.W + x);
  return out;
}

export function createRun(seed) {
  const s = { seed: seed >>> 0, tick: 0, level: 0, phase: "intermission", phaseT: 0, cleared: 0, status: "playing",
    failReason: "", levelTicks: [0, 0, 0, 0, 0, 0], totalTicks: 0, events: [] };
  startLevel(s, 1);
  s.phase = "playing";
  return s;
}

function startLevel(s, level) {
  const cfg = LEVEL_CFG[level];
  const m = buildMap(level, s.seed);
  const R = rng((s.seed + level * 7919) >>> 0);
  s.level = level; s.cfg = cfg; s.map = m; s.R = R; s.lt = 0;
  s.flow = new Uint16Array(m.W * m.H); s.goalFlow = null;
  // player starts on the west side, safehouse far to the east/elsewhere
  const starts = roadTilesWhere(m, (x, y) => (x === 6 || x === 7) && y > 4 && y < m.H - 5);
  const si = starts[floor(R() * starts.length)];
  const sx = si % m.W, sy = (si - sx) / m.W;
  s.p = makeCar((sx + 0.5) * TILE, (sy + 0.5) * TILE, 0, "player");
  s.p.hp = 100; s.p.bust = 0; s.p.spiked = 0; s.p.lastHit = -999;
  const gf = flowField(m, sx, sy, new Uint16Array(m.W * m.H));
  s.reach = gf;
  const goals = roadTilesWhere(m, (x, y) => gf[y * m.W + x] >= cfg.goal && gf[y * m.W + x] <= cfg.goal + 14);
  const gi = goals.length ? goals[floor(R() * goals.length)] : roadTilesWhere(m, () => true).pop();
  const gx = gi % m.W, gy = (gi - gx) / m.W;
  s.goal = { x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, tx: gx, ty: gy };
  // face the car down the road towards the safehouse
  const toGoal = flowField(m, gx, gy, new Uint16Array(m.W * m.H));
  let bd = toGoal[sy * m.W + sx], hx = sx, hy = sy;
  for (const [ox, oy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const v = toGoal[(sy + oy) * m.W + sx + ox]; if (v < bd) { bd = v; hx = sx + ox; hy = sy + oy; } }
  s.p.a = atan2(hy - sy, hx - sx);
  // roadblocks (static) and spike strips, kept away from the start and the safehouse
  s.blocks = []; s.spikes = [];
  const far = (x, y) => Math.abs(x - sx) + Math.abs(y - sy) > 7 && Math.abs(x - gx) + Math.abs(y - gy) > 3;
  const pool = roadTilesWhere(m, (x, y) => far(x, y) && gf[y * m.W + x] !== 65535);
  for (let i = 0; i < cfg.blocks && pool.length; i++) {
    const k = floor(R() * pool.length), ti = pool.splice(k, 1)[0], x = ti % m.W, y = (ti - x) / m.W;
    s.blocks.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, a: R() < 0.5 ? 0 : HALF_PI, r: 15 });
  }
  for (let i = 0; i < cfg.spikes && pool.length; i++) {
    const k = floor(R() * pool.length), ti = pool.splice(k, 1)[0], x = ti % m.W, y = (ti - x) / m.W;
    s.spikes.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, r: 18 });
  }
  // cops
  s.cops = []; s.nextId = 1;
  const total = cfg.cops;
  for (let i = 0; i < total; i++) spawnCop(s, i < cfg.tanks ? "tank" : i < cfg.tanks + cfg.swat ? "swat" : "cop", cfg.spawnMin + 120);
  s.heli = cfg.heli ? { x: s.p.x - 400, y: s.p.y - 300, lit: 0 } : null;
  s.events.push({ t: "level", level });
}

function spawnCop(s, type, minDist) {
  const m = s.map, p = s.p, R = s.R;
  const cand = [];
  for (let tries = 0; tries < 40 && cand.length === 0; tries++) {
    const tx = 1 + floor(R() * (m.W - 2)), ty = 1 + floor(R() * (m.H - 2));
    if (!isRoad(m, tx, ty) || s.reach[ty * m.W + tx] === 65535) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, dx = x - p.x, dy = y - p.y;
    const d = sqrt(dx * dx + dy * dy);
    if (d < minDist || d > minDist + 900) continue;
    if (Math.abs(x - s.goal.x) + Math.abs(y - s.goal.y) < 150) continue;
    cand.push([x, y]);
  }
  if (!cand.length) return null;
  const c = makeCar(cand[0][0], cand[0][1], atan2(p.y - cand[0][1], p.x - cand[0][0]), type);
  c.id = s.nextId++;
  s.cops.push(c);
  return c;
}

// ---------- physics ----------
// Player controls are screen-direction ("up" drives up the screen, "left" drives left...), so the car
// turns towards the pressed direction and goes. Cops use classic car steering (turn left/right, gas, brake).
function drive(s, c, input, spec, maxSpeed, accel, turnMul, screenDir = false) {
  const fx = cos(c.a), fy = sin(c.a), rx = -fy, ry = fx;
  let fs = c.vx * fx + c.vy * fy, ls = c.vx * rx + c.vy * ry;
  const tile = tileAt(s.map, c.x, c.y);
  const brake = (input & BRAKE) !== 0;
  let going = false;
  if (screenDir) {
    const dx = ((input & RIGHT) ? 1 : 0) - ((input & LEFT) ? 1 : 0), dy = ((input & DOWN) ? 1 : 0) - ((input & UP) ? 1 : 0);
    if (dx || dy) {
      going = true;
      const diff = wrapAngle(atan2(dy, dx) - c.a), ad = diff < 0 ? -diff : diff;
      const sf = clamp((fs < 0 ? -fs : fs) / 2.2, 0.45, 1);
      const maxTurn = CAR.turn * turnMul * sf * (brake ? 1.35 : 1.15);
      c.a = wrapAngle(c.a + clamp(diff, -maxTurn, maxTurn));
      if (ad < 1.9) fs += accel * (ad < 0.6 ? 1 : 0.6);
      else if (fs > 1.5) fs -= accel * 1.4;           // big turn: scrub speed first
      else fs += accel * 0.35;
    }
  } else {
    if (input & UP) fs += accel;
    if (input & DOWN) fs -= fs > 0.5 ? accel * 1.6 : CAR.reverse;
    const steer = ((input & RIGHT) ? 1 : 0) - ((input & LEFT) ? 1 : 0);
    const speedFactor = clamp((fs < 0 ? -fs : fs) / 2.2, 0, 1);
    c.a = wrapAngle(c.a + steer * CAR.turn * turnMul * speedFactor * (fs < 0 ? -1 : 1) * (brake ? 1.35 : 1));
    going = (input & (UP | DOWN)) !== 0;
  }
  ls *= brake ? CAR.drift : CAR.grip;
  fs *= brake ? 0.975 : going ? CAR.drag : 0.982;
  let max = maxSpeed;
  if (tile === PARK || tile === SAND) { max *= 0.62; fs *= 0.985; }
  if (fs > max) fs = max; if (fs < -max * 0.45) fs = -max * 0.45;
  // recompute with new heading
  const nfx = cos(c.a), nfy = sin(c.a);
  c.vx = nfx * fs + -nfy * ls; c.vy = nfy * fs + nfx * ls;
  move(s, c, spec.r);
}

function move(s, c, r) {
  const m = s.map;
  let hit = 0;
  // integrate in two half-steps to avoid tunnelling at speed
  for (let k = 0; k < 2; k++) {
    c.x += c.vx * 0.5;
    hit += resolveTiles(m, c, r, 0);
    c.y += c.vy * 0.5;
    hit += resolveTiles(m, c, r, 1);
  }
  return hit;
}

function resolveTiles(m, c, r, axis) {
  const x0 = floor((c.x - r) / TILE), x1 = floor((c.x + r) / TILE), y0 = floor((c.y - r) / TILE), y1 = floor((c.y + r) / TILE);
  let hit = 0;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!solid(m, tx, ty)) continue;
    const L = tx * TILE, T = ty * TILE, Rr = L + TILE, B = T + TILE;
    const nx = clamp(c.x, L, Rr), ny = clamp(c.y, T, B);
    const dx = c.x - nx, dy = c.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = 1;
    if (axis === 0) {
      if (c.vx > 0 && c.x < L) c.x = L - r; else if (c.vx < 0 && c.x > Rr) c.x = Rr + r;
      else if (d2 > 0) { const d = sqrt(d2); c.x += dx / d * (r - d); }
      c.vx *= -0.25; c.vy *= 0.9;
    } else {
      if (c.vy > 0 && c.y < T) c.y = T - r; else if (c.vy < 0 && c.y > B) c.y = B + r;
      else if (d2 > 0) { const d = sqrt(d2); c.y += dy / d * (r - d); }
      c.vy *= -0.25; c.vx *= 0.9;
    }
  }
  return hit;
}

function los(m, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = sqrt(dx * dx + dy * dy), n = floor(d / (TILE * 0.5)) + 1;
  for (let i = 1; i < n; i++) { const t = i / n; if (solid(m, floor((x0 + dx * t) / TILE), floor((y0 + dy * t) / TILE))) return false; }
  return true;
}

// Cop brain: chase straight when it can see you, otherwise follow the road network towards you.
function copInput(s, c, spec) {
  const m = s.map, p = s.p;
  if (c.rev > 0) { c.rev--; return DOWN | (c.revSteer > 0 ? RIGHT : LEFT); }
  const dx = p.x - c.x, dy = p.y - c.y, d = sqrt(dx * dx + dy * dy);
  let tx, ty;
  if (d < 330 && los(m, c.x, c.y, p.x, p.y)) {
    const lead = clamp(d / 9, 0, 34);
    tx = p.x + p.vx * lead; ty = p.y + p.vy * lead;
  } else {
    const cx = floor(c.x / TILE), cy = floor(c.y / TILE);
    let best = s.flow[cy * m.W + cx], bx = cx, by = cy;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
      const v = s.flow[ny * m.W + nx];
      if (v < best && los(m, c.x, c.y, (nx + 0.5) * TILE, (ny + 0.5) * TILE)) { best = v; bx = nx; by = ny; }
    }
    tx = (bx + 0.5) * TILE; ty = (by + 0.5) * TILE;
    if (bx === cx && by === cy) { tx = p.x; ty = p.y; }
  }
  const want = atan2(ty - c.y, tx - c.x);
  const diff = wrapAngle(want - c.a);
  const ad = diff < 0 ? -diff : diff;
  let inp = 0;
  if (diff > 0.08) inp |= RIGHT; else if (diff < -0.08) inp |= LEFT;
  const sp = sqrt(c.vx * c.vx + c.vy * c.vy);
  if (ad > 1.9 && sp > 3) inp |= DOWN; else inp |= UP;
  if (ad > 1.0 && sp > 4.2) inp |= BRAKE;
  // stuck detection -> reverse out
  if (sp < 0.6) { if (++c.stuck > 50) { c.stuck = 0; c.rev = 32; c.revSteer = diff > 0 ? -1 : 1; } } else c.stuck = 0;
  return inp;
}

function collideCars(a, b, ra, rb, ma, mb) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, R = ra + rb;
  if (d2 >= R * R || d2 === 0) return 0;
  const d = sqrt(d2), nx = dx / d, ny = dy / d, over = R - d;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x -= nx * over * wa; a.y -= ny * over * wa; b.x += nx * over * wb; b.y += ny * over * wb;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = -1.5 * rv / (1 / ma + 1 / mb);
    a.vx -= j * nx / ma; a.vy -= j * ny / ma; b.vx += j * nx / mb; b.vy += j * ny / mb;
  }
  return rv < 0 ? -rv : 0;
}

// ---------- main step ----------
export function step(s, input) {
  s.events.length = 0;
  if (s.status !== "playing") return s.events;
  s.tick++;
  if (s.phase === "intermission") {
    if (++s.phaseT >= INTERMISSION) { startLevel(s, s.level + 1); s.phase = "playing"; s.phaseT = 0; }
    return s.events;
  }
  s.totalTicks++; s.lt++;
  const cfg = s.cfg, p = s.p, m = s.map;

  // flow field towards the player every 12 ticks
  if (s.lt % 12 === 1) flowField(m, clamp(floor(p.x / TILE), 0, m.W - 1), clamp(floor(p.y / TILE), 0, m.H - 1), s.flow);

  // player
  const spiked = p.spiked > 0;
  if (spiked) p.spiked--;
  drive(s, p, input, { r: CAR.r }, CAR.maxSpeed * (spiked ? 0.55 : 1), CAR.accel * (spiked ? 0.6 : 1), spiked ? 0.75 : 1, true);

  // spikes
  for (const k of s.spikes) {
    const dx = p.x - k.x, dy = p.y - k.y;
    if (dx * dx + dy * dy < (k.r + CAR.r) * (k.r + CAR.r) && p.spiked < 200) { if (p.spiked === 0 || p.spiked < 150) s.events.push({ t: "spike" }); p.spiked = 240; }
  }

  // cops
  for (const c of s.cops) {
    const spec = TYPES[c.type];
    drive(s, c, copInput(s, c, spec), spec, CAR.maxSpeed * cfg.copSpeed * spec.speed, CAR.accel * cfg.copAccel * spec.accel, spec.turn);
  }
  // collisions
  const pSpeed = sqrt(p.vx * p.vx + p.vy * p.vy);
  for (const c of s.cops) {
    const spec = TYPES[c.type];
    const imp = collideCars(p, c, CAR.r, spec.r, 1, spec.mass);
    if (imp > 1.2 && s.tick - p.lastHit > 8) {
      p.hp -= imp * 2.6 * spec.hit * cfg.dmg; p.lastHit = s.tick;
      s.events.push({ t: "crash", x: (p.x + c.x) / 2, y: (p.y + c.y) / 2, power: imp });
    }
  }
  for (let i = 0; i < s.cops.length; i++) for (let j = i + 1; j < s.cops.length; j++) {
    const a = s.cops[i], b = s.cops[j];
    collideCars(a, b, TYPES[a.type].r, TYPES[b.type].r, TYPES[a.type].mass, TYPES[b.type].mass);
  }
  for (const b of s.blocks) {
    const fake = { x: b.x, y: b.y, vx: 0, vy: 0 };
    const imp = collideCars(p, fake, CAR.r, b.r + 8, 1, 1e9);
    if (imp > 2.5 && s.tick - p.lastHit > 8) { p.hp -= imp * 1.6 * cfg.dmg; p.lastHit = s.tick; s.events.push({ t: "crash", x: b.x, y: b.y, power: imp }); }
    for (const c of s.cops) { const f2 = { x: b.x, y: b.y, vx: 0, vy: 0 }; collideCars(c, f2, TYPES[c.type].r, b.r + 8, TYPES[c.type].mass, 1e9); }
  }
  // wall scrape damage
  // (handled softly: walls slow you, cops do the damage)

  // helicopter: follows you; while you're in its light you get busted faster and backup is called
  let bustMul = 1;
  if (s.heli) {
    const h = s.heli, hx = p.x - h.x, hy = p.y - h.y, hd = sqrt(hx * hx + hy * hy);
    const hs = CAR.maxSpeed * 0.8 * cfg.heli;
    if (hd > 1) { const k = hd < hs ? hd : hs; h.x += hx / hd * k; h.y += hy / hd * k; }
    const lit = hd < 95;
    if (lit) { h.lit++; bustMul = 1.35; if (h.lit % 300 === 0 && s.cops.length < cfg.cops + 6) { const c = spawnCop(s, "cop", 380); if (c) s.events.push({ t: "backup" }); } }
    else h.lit = 0;
  }

  // busted meter: a cop is on you and you're (nearly) stopped
  let near = false;
  for (const c of s.cops) { const dx = c.x - p.x, dy = c.y - p.y, R = TYPES[c.type].r + CAR.r + 26; if (dx * dx + dy * dy < R * R) { near = true; break; } }
  if (near && pSpeed < 1.6) p.bust += bustMul / cfg.bustTicks; else p.bust -= 1 / 70;
  p.bust = clamp(p.bust, 0, 1);

  // keep the heat on: replace cops that fall far behind
  for (let i = s.cops.length - 1; i >= 0; i--) {
    const c = s.cops[i], dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > 1500 * 1500) { s.cops.splice(i, 1); spawnCop(s, c.type, cfg.spawnMin); }
  }

  // outcomes
  if (p.hp <= 0) return fail(s, "WASTED");
  if (p.bust >= 1) return fail(s, "BUSTED");
  const gx = p.x - s.goal.x, gy = p.y - s.goal.y;
  if (gx * gx + gy * gy < 30 * 30) {
    s.cleared = s.level; s.levelTicks[s.level] = s.lt;
    s.events.push({ t: "cleared", level: s.level });
    if (s.level >= LEVELS) { s.status = "passed"; s.events.push({ t: "passed" }); }
    else { s.phase = "intermission"; s.phaseT = 0; }
  }
  return s.events;
}

function fail(s, reason) {
  s.status = "failed"; s.failReason = reason;
  s.events.push({ t: "failed", reason });
  return s.events;
}

// Turn an angle (radians, screen space) into the nearest of 8 directions
export function dirBits(angle) {
  const k = ((Math.round(wrapAngle(angle) / (PI / 4)) % 8) + 8) % 8; // 0=right,1=down-right,2=down...
  return [RIGHT, RIGHT | DOWN, DOWN, DOWN | LEFT, LEFT, LEFT | UP, UP, UP | RIGHT][k];
}

// ---------- inputs: run-length encoded so a whole run is a few KB ----------
export function encodeInputs(arr) { // arr: number per tick
  const out = [];
  for (let i = 0; i < arr.length;) { let j = i; while (j < arr.length && arr[j] === arr[i] && j - i < 4095) j++; out.push(arr[i].toString(36) + (j - i).toString(36)); i = j; }
  return out.join(".");
}
export function decodeInputs(str) {
  const out = [];
  if (!str) return out;
  for (const part of str.split(".")) { const v = parseInt(part[0], 36), n = parseInt(part.slice(1), 36); if (!(n > 0) || n > 4095 || v > 31) throw new Error("bad input"); for (let k = 0; k < n; k++) out.push(v); }
  return out;
}

// Replays a run. Returns the verified result.
export function replay(seed, inputStr, maxTicks = 60 * 60 * 25) {
  const inputs = decodeInputs(inputStr);
  if (inputs.length > maxTicks) throw new Error("run too long");
  const s = createRun(seed);
  for (let i = 0; i < inputs.length && s.status === "playing"; i++) step(s, inputs[i]);
  const clearTicks = s.levelTicks.slice(1, s.cleared + 1).reduce((a, b) => a + b, 0);
  return { cleared: s.cleared, status: s.status, reason: s.failReason, totalTicks: s.totalTicks, clearTicks, ticks: inputs.length };
}

// Tooling only (promo videos): start a run straight at a given level.
export function jumpToLevel(s, level) { startLevel(s, level); s.phase = "playing"; s.phaseT = 0; }
