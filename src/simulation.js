// Squad gate-runner simulation. World units are metres; +d points toward the horizon.
// The squad runs forward along d, steers on x, and auto-fires at everything ahead.

export const LANE_HALF = 4.2;
export const STEP = 1 / 60;
export const MAX_SQUAD = 96;
export const START_SQUAD = 3;
export const RANGE = 25;
export const UPGRADE_NAMES = ['Service Rifles', 'Twin SMGs', 'Vulcan Minigun', 'Rocket Barrage'];

export const LEVELS = [
  { name: 'Breakwater Bay', length: 280, speed: 6.4, difficulty: 1.12, boss: 'Tidecaller Hulk', bossHp: 3600, rows: 6 },
  { name: 'Cinder Strait', length: 310, speed: 6.6, difficulty: 1.32, boss: 'Ash Colossus', bossHp: 4800, rows: 7 },
  { name: 'Frostline Keep', length: 330, speed: 6.9, difficulty: 1.5, boss: 'Rime Warden', bossHp: 5800, rows: 8 },
];

// Per-soldier weapons. Tier 3 keeps the Vulcan and adds rockets on top.
export const WEAPONS = [
  { kind: 'round', rate: 2.2, damage: 1.2, speed: 34, spread: 0.02, shooters: 18 },
  { kind: 'tracer', rate: 5.5, damage: 1, speed: 40, spread: 0.05, shooters: 18, twin: 0.14 },
  { kind: 'shell', rate: 11, damage: 0.9, speed: 46, spread: 0.07, shooters: 18 },
];
export const ROCKET = { kind: 'rocket', rate: 0.9, damage: 7, speed: 24, spread: 0.03, radius: 2.6, shooters: 6 };

const THREAT = {
  zombie: { r: 0.45, speed: 2.8, hp: 4, push: 0.2 },
  brute: { r: 0.8, speed: 1.7, hp: 40, push: 0.04 },
  boss: { r: 1.9, speed: 1.1, hp: 0, push: 0.004 },
};
const CRATE_HP = [0, 5, 28, 60];
const SPACING = 0.62;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Compact hex formation, wider than deep so the squad reads as a running block.
const SLOTS = (() => {
  const pts = [];
  for (let j = -8; j <= 8; j++) for (let i = -10; i <= 10; i++) {
    const dx = SPACING * (i + (j & 1) * 0.5), dz = SPACING * 0.866 * j;
    pts.push({ dx, dz, k: dx * dx + dz * dz * 1.35 });
  }
  pts.sort((a, b) => a.k - b.k || a.dz - b.dz || a.dx - b.dx);
  return pts.slice(0, MAX_SQUAD);
})();

export class Simulation {
  constructor(index = 0, seed) {
    this.index = clamp(index | 0, 0, LEVELS.length - 1);
    this.seed = seed ?? (this.index + 1) * 7919;
    this.reset();
    this.state = 'ready';
  }

  get level() { return LEVELS[this.index]; }
  get count() { return this.members.length; }
  get weaponName() { return UPGRADE_NAMES[this.upgrade]; }
  get formationRadius() { return SPACING * Math.sqrt(Math.max(1, this.members.length)) * 0.55; }

  reset() {
    const L = this.level;
    this.rand = rng(this.seed);
    this.state = 'ready';
    this.elapsed = 0; this.acc = 0; this.progress = 0;
    this.x = 0; this.targetX = 0;
    this.upgrade = 0; this.recruited = 0; this.kills = 0; this.peakSquad = START_SQUAD;
    this.bossName = L.boss; this.boss = null; this.bossDefeated = false;
    this.members = []; this.threats = []; this.projectiles = []; this.objects = []; this.events = [];
    this.nextId = 1; this.fireClock = 0; this.pendingVolleys = {}; this.hitBudget = 0;
    this.upgradeTimes = [];
    for (let i = 0; i < START_SQUAD; i++) this.addMember(0, 0);
    this.buildCourse();
  }

  start() { this.reset(); this.state = 'playing'; }
  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }

  update(dt) {
    if (this.state !== 'playing') return;
    this.acc += Math.min(Math.max(dt, 0), 0.25);
    while (this.acc >= STEP && this.state === 'playing') { this.acc -= STEP; this.step(STEP); }
  }

  emit(type, x, d, extra) { this.events.push({ type, x, d, ...extra }); }

  addMember(x, d) {
    const slot = SLOTS[this.members.length] || SLOTS[0];
    this.members.push({ id: this.nextId++, x, d, phase: this.rand() * 6.28, cd: this.rand() * 0.4, rcd: this.rand() * 1.1, slot });
  }

  // ---------- course generation ----------
  buildCourse() {
    const L = this.level, r = this.rand;
    this.rows = []; this.waves = []; this.crateQueue = [{ tier: 1, at: 0 }, { tier: 2, at: L.length * 0.3 }, { tier: 3, at: L.length * 0.52 }];
    const gap = (L.length - 130) / Math.max(1, L.rows - 1);
    for (let k = 0; k < L.rows; k++) {
      const d = 42 + k * gap, a = 3 + Math.round(k * 1.6 + r() * 3), b = 2 + Math.round(k * 1.4 + r() * 3);
      const templates = [
        [['add', a], ['mul', 2]],
        [['add', a + 2], ['sub', b]],
        [['mul', 2], ['sub', b]],
        [['add', a], ['add', Math.max(1, a - 3)]],
        [['add', a], ['mul', 2], ['sub', b + 2]],
      ];
      const pick = k === 0 ? 1 : k === 1 || k === 3 ? [0, 2, 4][Math.floor(r() * 3)] : Math.floor(r() * templates.length);
      let t = templates[pick];
      if (k === 0 && this.index > 0) t = [['add', a + 2], ['sub', 1]];
      if (r() < 0.5) t = [...t].reverse();
      const w = (LANE_HALF * 2) / t.length, row = { id: this.nextId++, d, gates: [] };
      t.forEach(([op, value], i) => {
        const label = op === 'add' ? '+' + value : op === 'mul' ? '×' + value : '−' + value;
        const g = { id: this.nextId++, row: row.id, kind: 'gate', x: -LANE_HALF + w * (i + 0.5), d, width: w - 0.2, op, value, label, risk: op === 'sub' };
        row.gates.push(g); this.objects.push(g);
      });
      this.rows.push(row);
      const diff = L.difficulty, wd = d + gap * 0.5;
      if (wd < L.length - 80) this.waves.push({ d: wd, zombies: Math.min(44, Math.round((6 + k * 4.8) * diff)), brutes: k >= 1 ? Math.min(7, Math.floor(k * 1.05 * diff)) : 0, tough: 1 + k * 0.34, center: (r() * 2 - 1) * 2.2 });
    }
    if (this.index === 0) {
      const id = this.nextId++;
      const gates = [3, 8].map((value, i) => ({
        id: this.nextId++, row: id, kind: 'gate', x: (i ? 1 : -1) * LANE_HALF / 2,
        d: 9, width: LANE_HALF - .2, op: 'add', value, label: '+' + value, risk: false
      }));
      this.rows.unshift({ id, d: 9, gates });
      this.objects.push(...gates);
    }
    // The last crates have a pack to fire into before the boss reaches the road.
    for (let i = 0; i < 2; i++) this.waves.push({
      d: L.length - 69 + i * 22, zombies: 30 + this.index * 6, brutes: i + 1,
      tough: .85, center: i ? -1.4 : 1.4
    });
    this.waves.unshift({ d: 32, zombies: Math.round(3 * L.difficulty), brutes: 0, center: (r() * 2 - 1) * 2 });
  }

  // Puts loot between gate rows so each choice stays readable.
  lootSpot(d) {
    for (let i = 0; i < 4; i++) for (const row of this.rows) if (Math.abs(row.d - d) < 6) d = row.d + 7;
    if (this.boss || d > this.level.length - 4) d = Math.min(d, this.progress + 14);
    return d;
  }

  spawnCrate(tier, d) {
    const side = this.rand() < 0.5 ? -1 : 1, x = side * (1.2 + this.rand() * 1.4);
    const c = { id: this.nextId++, kind: 'crate', x, d: this.lootSpot(d), width: 1.8, tier, hp: CRATE_HP[tier], maxHp: CRATE_HP[tier], label: UPGRADE_NAMES[tier], flash: 0 };
    this.objects.push(c);
    return c;
  }

  // ---------- simulation step ----------
  step(dt) {
    const L = this.level;
    this.elapsed += dt; this.hitBudget = 6;
    this.targetX = clamp(Number(this.targetX) || 0, -LANE_HALF + 0.6, LANE_HALF - 0.6);
    const dx = this.targetX - this.x;
    this.x += clamp(dx * Math.min(1, dt * 10), -12 * dt, 12 * dt);

    // advance unless the boss blocks the road
    let cap = L.length;
    if (this.boss) cap = Math.min(cap, this.boss.d - this.boss.r - 6);
    this.progress = Math.min(Math.max(this.progress, Math.min(cap, this.progress + L.speed * (this.bossDefeated ? 1.65 : 1) * dt)), L.length);

    this.spawnThings();
    this.moveSquad(dt);
    this.fire(dt);
    this.moveProjectiles(dt);
    this.moveThreats(dt);
    this.crossGates();
    this.handleLoot();

    if (this.members.length === 0) { this.state = 'lost'; this.emit('lost', this.x, this.progress); return; }
    if (this.bossDefeated && this.progress >= L.length) { this.state = 'won'; this.emit('won', this.x, this.progress); }
  }

  spawnThings() {
    const L = this.level, r = this.rand;
    while (this.waves.length && this.waves[0].d < this.progress + 36) {
      const w = this.waves.shift();
      for (let i = 0; i < w.zombies; i++) this.addThreat('zombie', clamp(w.center + (r() * 2 - 1) * 2.6, -LANE_HALF + 0.4, LANE_HALF - 0.4), w.d + r() * (6 + w.zombies * 0.25), w.tough);
      for (let i = 0; i < w.brutes; i++) this.addThreat('brute', clamp(w.center + (r() * 2 - 1) * 1.8, -LANE_HALF + 0.8, LANE_HALF - 0.8), w.d + 3 + r() * 5, w.tough);
    }
    const q = this.crateQueue[0];
    if (q && q.tier === this.upgrade + 1 && this.progress >= q.at && !this.objects.some(o => o.kind === 'crate' || o.kind === 'pickup')) {
      this.crateQueue.shift();
      this.spawnCrate(q.tier, this.progress + (q.tier === 1 ? 20 : 26));
    }
    if (!this.boss && !this.bossDefeated && this.progress >= L.length - 75) {
      const b = this.addThreat('boss', 0, this.progress + 32);
      b.hp = b.maxHp = L.bossHp; b.attackCd = 3; b.windup = 0; b.bite = 0;
      this.boss = b;
      this.emit('bossSpawn', b.x, b.d, { name: L.boss, hp: b.hp });
    }
  }

  addThreat(kind, x, d, tough = 1) {
    const T = THREAT[kind], diff = this.level.difficulty;
    const hp = (kind === 'zombie' ? T.hp * diff ** 0.7 : T.hp * diff) * tough;
    const t = { id: this.nextId++, kind, x, d, hp, maxHp: hp, r: T.r, speed: T.speed * (0.85 + this.rand() * 0.3), phase: this.rand() * 6.28, flash: 0, bite: 0, windup: 0 };
    this.threats.push(t);
    return t;
  }

  moveSquad(dt) {
    const run = this.level.speed;
    const radius = this.formationRadius;
    const widthScale = 1 - .38 * Math.abs(this.x) / (LANE_HALF - .6);
    const centre = clamp(this.x, -LANE_HALF + radius * widthScale, LANE_HALF - radius * widthScale);
    this.members.forEach((m, i) => {
      m.slot = SLOTS[i];
      const tx = clamp(centre + m.slot.dx * widthScale, -LANE_HALF + .18, LANE_HALF - .18), td = this.progress + m.slot.dz;
      const k = Math.min(1, dt * 9);
      m.x += (tx - m.x) * k; m.d += (td - m.d) * k;
      m.phase += dt * run * 1.9;
    });
    if (this.members.length > this.peakSquad) this.peakSquad = this.members.length;
  }

  findTarget(m) {
    let best = null, score = Infinity;
    for (const t of this.threats) {
      const ahead = t.d - m.d;
      if (ahead < 0.3 || ahead > RANGE) continue;
      const s = ahead + Math.abs(t.x - m.x) * 2.2 - (t.kind === 'boss' ? 6 : 0);
      if (s < score) { score = s; best = t; }
    }
    if (best) return best;
    for (const o of this.objects) {
      if (o.kind !== 'crate') continue;
      const ahead = o.d - m.d;
      if (ahead > 0.3 && ahead < RANGE && Math.abs(o.x - m.x) < o.width / 2 + 1.4) return o;
    }
    return null;
  }

  shoot(m, W, dmgMul) {
    const target = this.findTarget(m);
    let vx = 0;
    if (target) {
      const time = Math.max(0.05, (target.d - m.d) / W.speed);
      vx = clamp((target.x - m.x) / time, -W.speed * 0.35, W.speed * 0.35);
    }
    const offs = W.twin ? [-W.twin, W.twin] : [0];
    for (const o of offs) {
      const spread = (this.rand() * 2 - 1) * W.spread * W.speed;
      this.projectiles.push({ id: this.nextId++, kind: W.kind, x: m.x + o, d: m.d + 0.4, vx: vx + spread, vd: W.speed, damage: W.damage * dmgMul, life: RANGE / W.speed + 0.1, radius: W.radius || 0, from: m.id });
    }
  }

  fire(dt) {
    const tier = this.upgrade, W = WEAPONS[Math.min(tier, 2)];
    const n = this.members.length;
    const gunners = Math.min(n, W.shooters + Math.floor(Math.max(0, n - W.shooters) * .54));
    const dmgMul = (1 + Math.max(0, n - W.shooters) * .012) * Math.min(W.shooters, n) / Math.max(1, gunners);
    const fired = this.pendingVolleys;
    for (let i = 0; i < n; i++) {
      const m = this.members[i];
      m.muzzle = Math.max(0, (m.muzzle || 0) - dt);
      if (i < gunners) {
        m.cd -= dt;
        if (m.cd <= 0 && this.projectiles.length < 520) { m.cd += 1 / W.rate * (0.9 + this.rand() * 0.2); this.shoot(m, W, dmgMul); m.muzzle = .055; fired[W.kind] = m; }
      }
      if (tier >= 3 && i < ROCKET.shooters) {
        m.rcd -= dt;
        if (m.rcd <= 0) { m.rcd += 1 / ROCKET.rate * (0.9 + this.rand() * 0.2); this.shoot(m, ROCKET, 1 + Math.max(0, n - 12) * 0.012); fired.rocket = m; }
      }
    }
    this.fireClock -= dt;
    if (this.fireClock <= 0) {
      for (const kind in fired) this.emit('fire', fired[kind].x, fired[kind].d, { kind, tier });
      if (Object.keys(fired).length) { this.fireClock = 0.09; this.pendingVolleys = {}; }
    }
  }

  damage(t, amount, kind, p) {
    t.hp -= amount; t.flash = 0.12;
    if (this.elapsed - (t.recoilAt ?? -1) > .28) t.recoilAt = this.elapsed;
    t.d += amount * THREAT[t.kind].push * (kind === 'rocket' ? 2.5 : 1);
    if (t.hp <= 0) {
      this.threats.splice(this.threats.indexOf(t), 1); this.kills++;
      this.fall(t);
      this.emit('hit', t.x, t.d, { kind, target: t.kind, killed: true });
      if (t.kind === 'boss') {
        this.boss = null; this.bossDefeated = true;
        this.emit('bossDown', t.x, t.d, { name: this.bossName });
        for (const remaining of this.threats) this.fall(remaining);
        this.threats.length = 0;
      }
    } else if (this.hitBudget-- > 0) this.emit('hit', t.x, t.d, { kind, target: t.kind, killed: false });
  }

  hitCrate(c, amount, kind) {
    c.hp -= amount; c.flash = 0.12;
    if (this.hitBudget-- > 0) this.emit('hit', c.x, c.d, { kind, target: 'crate', killed: c.hp <= 0 });
    if (c.hp <= 0) {
      c.kind = 'pickup'; c.hp = 0; c.width = 2.4; c.radius = 2.4;
      this.emit('crateOpen', c.x, c.d, { tier: c.tier, name: c.label });
    }
  }

  blast(p) {
    const R = ROCKET.radius;
    this.emit('blast', p.x, p.d, { radius: R, kind: 'rocket' });
    for (const t of [...this.threats]) {
      const dist = Math.hypot(t.x - p.x, t.d - p.d) - t.r;
      if (dist < R && this.threats.includes(t)) this.damage(t, p.damage * (1 - Math.max(0, dist) / R * 0.6), 'rocket', p);
    }
    for (const o of this.objects) if (o.kind === 'crate' && Math.hypot(o.x - p.x, o.d - p.d) < R + o.width / 2) this.hitCrate(o, p.damage * 0.5, 'rocket');
  }

  moveProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      const pd = p.d, px = p.x;
      p.x += p.vx * dt; p.d += p.vd * dt; p.life -= dt;
      let hit = false;
      for (const t of this.threats) {
        if (t.d + t.r < pd || t.d - t.r > p.d) continue;
        const f = clamp((t.d - pd) / Math.max(1e-6, p.d - pd), 0, 1), hx = px + (p.x - px) * f;
        if (Math.abs(hx - t.x) < t.r + 0.08) {
          hit = true;
          if (p.kind === 'rocket') { p.x = hx; p.d = t.d; this.blast(p); } else this.damage(t, p.damage, p.kind, p);
          break;
        }
      }
      if (!hit) for (const o of this.objects) {
        if (o.kind !== 'crate' || o.d < pd - 0.4 || o.d > p.d + 0.4) continue;
        if (Math.abs(p.x - o.x) < o.width / 2 + 0.08) {
          hit = true;
          if (p.kind === 'rocket') { p.d = o.d; this.blast(p); } else this.hitCrate(o, p.damage, p.kind);
          break;
        }
      }
      if (!hit && p.life <= 0 && p.kind === 'rocket') { this.blast(p); hit = true; }
      if (!hit && p.life > 0 && Math.abs(p.x) < LANE_HALF + 1) keep.push(p);
    }
    this.projectiles = keep;
  }

  fall(unit, kind = unit.kind) {
    this.emit('fall', unit.x, unit.d, { id: unit.id, kind, tier: this.upgrade });
  }

  removeMembers(list, cause, x, d) {
    if (!list.length) return;
    const ids = new Set(list.map(m => m.id));
    this.members = this.members.filter(m => !ids.has(m.id));
    for (const member of list) this.fall(member, 'marine');
    this.emit('casualty', x, d, { count: list.length, cause, squad: this.members.length });
  }

  nearestMembers(x, d, radius, max) {
    return this.members.map(m => [m, Math.hypot(m.x - x, m.d - d)]).filter(([, r]) => r < radius).sort((a, b) => a[1] - b[1]).slice(0, max).map(([m]) => m);
  }

  moveThreats(dt) {
    const front = this.progress;
    for (const t of [...this.threats]) {
      if (!this.threats.includes(t)) continue;
      t.flash = Math.max(0, t.flash - dt); t.phase += dt * t.speed * (t.kind === 'boss' ? 5.8 : 3.7);
      t.bite = Math.max(0, t.bite - dt);
      const near = t.d - front < 12;
      if (t.kind === 'boss') { this.bossThink(t, dt); continue; }
      t.d -= t.speed * dt;
      if (near) t.x += clamp(this.x - t.x, -1, 1) * 0.9 * dt;
      t.x = clamp(t.x, -LANE_HALF + t.r * 0.5, LANE_HALF - t.r * 0.5);
      if (t.d < front - 5) { this.threats.splice(this.threats.indexOf(t), 1); continue; }
      if (t.bite > 0) continue;
      const victims = this.nearestMembers(t.x, t.d, t.r + 0.32, 1);
      if (victims.length) {
        this.removeMembers(victims, t.kind, t.x, t.d);
        if (t.kind === 'zombie') { this.fall(t); this.threats.splice(this.threats.indexOf(t), 1); }
        else t.bite = 0.55;
      }
    }
  }

  bossThink(b, dt) {
    const front = this.progress + this.formationRadius;
    b.recovery = Math.max(0, (b.recovery || 0) - dt);
    if (b.d - b.r > front + 2) b.d -= b.speed * dt;
    if (b.windup > 0) {
      b.windup += dt / 1.15;
      if (b.windup >= 1) {
        b.windup = 0; b.recovery = .55;
        const n = this.members.length, victims = this.nearestMembers(b.strikeX, this.progress, b.strikeR, Math.max(1, Math.ceil(n * 0.4)));
        this.emit('bossStomp', b.strikeX, this.progress, { radius: b.strikeR, count: victims.length });
        this.removeMembers(victims, 'boss', b.strikeX, this.progress);
        b.attackCd = 3.4 / this.level.difficulty ** 0.35;
      }
    } else if (b.d - this.progress < RANGE) {
      b.attackCd -= dt;
      if (b.attackCd <= 0) {
        b.windup = 0.001; b.strikeX = this.x; b.strikeR = 2.2;
        this.emit('bossWarn', b.strikeX, this.progress, { radius: b.strikeR, time: 1.15 });
      }
    }
    if (b.d - b.r <= front + 2.2 && b.bite <= 0) {
      const victims = this.nearestMembers(b.x, b.d, b.r + 3, 2);
      if (victims.length) { this.removeMembers(victims, 'boss', b.x, b.d); b.bite = 0.5; }
    }
  }

  crossGates() {
    const row = this.rows[0];
    if (!row || this.progress < row.d) return;
    this.rows.shift();
    const gateIndex = Math.floor((this.x + LANE_HALF) * row.gates.length / (2 * LANE_HALF));
    const g = row.gates[clamp(gateIndex, 0, row.gates.length - 1)];
    this.objects = this.objects.filter(o => o.row !== row.id);
    const n = this.members.length;
    const after = clamp(g.op === 'add' ? n + g.value : g.op === 'mul' ? n * g.value : n - g.value, 0, MAX_SQUAD);
    if (after > n) {
      for (let i = n; i < after; i++) this.addMember(g.x + (this.rand() * 2 - 1) * g.width * 0.4, g.d + this.rand());
      this.recruited += after - n;
      this.emit('recruit', g.x, g.d, { gain: after - n, count: after, label: g.label, op: g.op });
    } else if (after < n) {
      this.removeMembers(this.members.slice(after), 'gate', g.x, g.d);
    } else this.emit('recruit', g.x, g.d, { gain: 0, count: n, label: g.label, op: g.op });
  }

  handleLoot() {
    const reach = 1.6 + this.formationRadius * 0.6;
    for (const o of [...this.objects]) {
      if (o.kind !== 'crate' && o.kind !== 'pickup') continue;
      o.flash = Math.max(0, (o.flash || 0) - STEP);
      if (o.kind === 'pickup' && Math.abs(o.x - this.x) < reach && Math.abs(o.d - this.progress) < 1.6 + this.formationRadius) {
        this.objects.splice(this.objects.indexOf(o), 1);
        this.upgrade = Math.max(this.upgrade, o.tier);
        this.upgradeTimes[o.tier] = this.elapsed;
        this.emit('upgrade', o.x, o.d, { tier: this.upgrade, name: UPGRADE_NAMES[this.upgrade] });
        continue;
      }
      // Missed loot rolls ahead again: another chance on the opposite side.
      if (o.d < this.progress - 2.5) {
        o.d = this.lootSpot(this.progress + 18);
        o.x = (o.x > 0 ? -1 : 1) * (1 + this.rand() * 1.6);
        if (o.kind === 'crate') o.hp = Math.max(o.hp, o.maxHp * 0.5);
      }
    }
  }
}

// Simple skilled pilot, used by tests and usable as an attract-mode autopilot.
export function autopilot(s) {
  const p = s.progress, n = s.members.length;
  const value = g => g.op === 'add' ? n + g.value : g.op === 'mul' ? n * g.value : n - g.value;
  const gates = s.objects.filter(o => o.kind === 'gate' && o.d > p - 0.5).sort((a, b) => a.d - b.d);
  const rowD = gates.length ? gates[0].d : Infinity;
  const best = gates.filter(g => g.d === rowD).sort((a, b) => value(b) - value(a))[0];
  const loot = s.objects.find(o => (o.kind === 'crate' || o.kind === 'pickup') && o.d > p - 1);
  let tx = s.x;
  if (loot && (loot.d < rowD || !best)) tx = loot.x;
  else if (best) tx = best.x;
  else if (s.boss) tx = 0;
  const b = s.boss;
  if (b && b.windup > 0 && Math.abs(s.x - b.strikeX) < b.strikeR + 1) tx = b.strikeX > 0 ? b.strikeX - 4.2 : b.strikeX + 4.2;
  s.targetX = clamp(tx, -LANE_HALF + 0.6, LANE_HALF - 0.6);
}
