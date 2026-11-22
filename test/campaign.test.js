import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, LEVELS, LANE_HALF, UPGRADE_NAMES, autopilot } from '../src/simulation.js';

const DT = 1 / 30;

function play(s, pilot, limit = 120, each) {
  const seen = new Set(), kinds = new Set();
  while (s.state === 'playing' && s.elapsed < limit) {
    pilot(s); s.update(DT);
    for (const p of s.projectiles) kinds.add(p.kind);
    for (const e of s.events) seen.add(e.type);
    each?.(s, s.events);
    s.events.length = 0;
  }
  return { seen, kinds };
}

// Steers into the worst gate every row and ignores loot.
function reckless(s) {
  const n = s.members.length;
  const v = g => g.op === 'add' ? n + g.value : g.op === 'mul' ? n * g.value : n - g.value;
  const gates = s.objects.filter(o => o.kind === 'gate' && o.d > s.progress).sort((a, b) => a.d - b.d);
  if (gates.length) s.targetX = gates.filter(g => g.d === gates[0].d).sort((a, b) => v(a) - v(b))[0].x;
}

test('contract: exports and initial state', () => {
  assert.equal(LANE_HALF, 4.2);
  assert.equal(LEVELS.length, 3);
  assert.deepEqual(LEVELS.map(l => l.name), ['Breakwater Bay', 'Cinder Strait', 'Frostline Keep']);
  assert.equal(UPGRADE_NAMES.length, 4);
  assert.deepEqual(UPGRADE_NAMES.slice(1), ['Twin SMGs', 'Vulcan Minigun', 'Rocket Barrage']);
  const s = new Simulation(1);
  assert.equal(s.state, 'ready'); assert.equal(s.index, 1);
  assert.equal(s.progress, 0); assert.equal(s.members.length, 3); assert.equal(s.upgrade, 0);
  assert.equal(s.boss, null); assert.equal(s.bossName, LEVELS[1].boss);
  for (const m of s.members) for (const k of ['id', 'x', 'd', 'phase']) assert.equal(typeof m[k], 'number');
  for (const o of s.objects) {
    assert.ok(['gate', 'crate', 'pickup'].includes(o.kind));
    assert.ok(Math.abs(o.x) <= LANE_HALF && o.width > 0 && typeof o.label === 'string');
  }
  s.update(1); assert.equal(s.progress, 0, 'ready state does not advance');
});

for (const [i, level] of LEVELS.entries()) {
  test(level.name + ': skilled pilot clears with all three upgrades', () => {
    const s = new Simulation(i); s.start();
    let bossMax = 0, maxSpread = 0;
    const { seen, kinds } = play(s, autopilot, 120, sim => {
      for (const m of sim.members) maxSpread = Math.max(maxSpread, Math.abs(m.d - sim.progress));
      for (const o of sim.objects) assert.ok(Math.abs(o.x) <= LANE_HALF);
      if (sim.boss) bossMax = sim.boss.maxHp;
    });
    assert.equal(s.state, 'won');
    assert.ok(s.elapsed >= 35 && s.elapsed <= 65, 'mission length ' + s.elapsed.toFixed(1));
    assert.equal(s.upgrade, 3);
    assert.ok(s.upgradeTimes[1] < 8, 'first upgrade at ' + s.upgradeTimes[1]);
    assert.ok(s.upgradeTimes[1] < s.upgradeTimes[2] && s.upgradeTimes[2] < s.upgradeTimes[3]);
    assert.ok(s.members.length > 0 && s.peakSquad > 30 && s.kills > 40 && s.recruited > 20);
    assert.ok(s.progress >= level.length && s.bossDefeated);
    assert.ok(bossMax > 1000, 'boss is huge');
    assert.ok(maxSpread < 7, 'formation stays compact around progress');
    for (const k of ['round', 'tracer', 'shell', 'rocket']) assert.ok(kinds.has(k), k);
    for (const e of ['fire', 'hit', 'recruit', 'casualty', 'upgrade', 'crateOpen', 'blast', 'bossSpawn', 'bossWarn', 'bossStomp', 'bossDown', 'won']) assert.ok(seen.has(e), e);
  });

  test(level.name + ': picking the worst gates loses, and start() resets', () => {
    const s = new Simulation(i); s.start();
    const { seen } = play(s, reckless);
    assert.equal(s.state, 'lost'); assert.ok(seen.has('lost'));
    assert.ok(s.elapsed < 65);
    s.start();
    assert.equal(s.state, 'playing'); assert.equal(s.progress, 0); assert.equal(s.members.length, 3);
    assert.equal(s.upgrade, 0); assert.equal(s.kills, 0); assert.equal(s.threats.length, 0);
  });
}

test('gate rows are one-shot and the chosen side matters', () => {
  const counts = [];
  for (const side of [-1, 1]) {
    const s = new Simulation(0); s.start();
    const row = s.objects.filter(o => o.kind === 'gate').sort((a, b) => a.d - b.d)[0];
    const gates = s.objects.filter(o => o.row === row.row);
    assert.ok(gates.length >= 2 && new Set(gates.map(g => g.label)).size === gates.length);
    s.x = s.targetX = side * 2.5;
    while (s.progress < row.d) { s.targetX = side * 2.5; s.update(DT); }
    assert.equal(s.objects.filter(o => o.row === row.row).length, 0, 'whole row consumed');
    const e = s.events.find(e => e.type === 'recruit' || (e.type === 'casualty' && e.cause === 'gate'));
    assert.ok(e, 'gate event');
    counts.push(s.members.length);
  }
  assert.notEqual(counts[0], counts[1]);
});

test('crates take projectile damage, open, and missed loot comes back', () => {
  const s = new Simulation(0); s.start(); s.update(DT);
  const crate = s.objects.find(o => o.kind === 'crate');
  assert.ok(crate && crate.tier === 1 && crate.hp === crate.maxHp && crate.d < 30);
  // Line up to shoot it open, then dodge the pickup.
  let opened = false, rolled = false;
  const startX = crate.x;
  while (s.elapsed < 14 && s.upgrade === 0) {
    const loot = s.objects.find(o => o.kind === 'crate' || o.kind === 'pickup');
    if (loot.kind === 'crate') s.targetX = loot.x;
    else { opened = true; s.targetX = s.elapsed < 7 ? -Math.sign(loot.x) * 3.6 : loot.x; }
    s.update(DT);
    if (loot.x !== startX && opened) rolled = true;
    s.events.length = 0;
  }
  assert.ok(opened, 'crate opened by gunfire');
  assert.ok(rolled, 'missed pickup reappears ahead');
  assert.equal(s.upgrade, 1, 'second chance collected');
});

test('rockets deal area damage and threats react to hits', () => {
  const s = new Simulation(2); s.start();
  s.upgrade = 3;
  for (let i = 0; i < 6; i++) s.addThreat('zombie', -0.6 + i * 0.25, 14);
  let blast = null, flashed = false;
  for (let t = 0; t < 120 && !blast; t++) {
    s.targetX = 0; s.update(DT);
    if (s.threats.some(z => z.flash > 0)) flashed = true;
    blast = s.events.find(e => e.type === 'blast'); s.events.length = 0;
  }
  assert.ok(blast && blast.radius > 2);
  assert.ok(flashed);
});

test('boss telegraphs its stomp, and dodging saves soldiers', () => {
  const losses = [];
  for (const dodge of [true, false]) {
    const s = new Simulation(2, 11); s.start();
    let warned = 0, lost = 0;
    play(s, sim => { autopilot(sim); if (!dodge && sim.boss) sim.targetX = 0; }, 120, (sim, events) => {
      for (const e of events) {
        if (e.type === 'bossWarn') { warned++; assert.ok(sim.boss.windup > 0 && e.radius > 1); }
        if (e.type === 'bossStomp') lost += e.count;
      }
    });
    assert.ok(warned >= 2);
    losses.push(lost);
  }
  assert.ok(losses[0] < losses[1], 'dodge ' + losses[0] + ' vs stand ' + losses[1]);
});

test('pause, resume and fixed-step determinism', () => {
  const a = new Simulation(1, 5), b = new Simulation(1, 5);
  a.start(); b.start();
  for (let i = 0; i < 300; i++) { autopilot(a); autopilot(b); a.update(1 / 30); b.update(1 / 60); b.update(1 / 60); }
  assert.equal(a.progress, b.progress); assert.equal(a.members.length, b.members.length); assert.equal(a.kills, b.kills);
  a.pause(); const p = a.progress; a.update(1); assert.equal(a.progress, p); assert.equal(a.state, 'paused');
  a.resume(); a.update(0.2); assert.ok(a.progress > p);
});

test('fallen characters keep their last world position and each boss stomp starts recovery', () => {
  const s = new Simulation(0);
  s.start();
  const soldiers = s.members.slice(0, 2);
  s.removeMembers(soldiers, 'boss', 0, 0);
  const casualties = s.events.filter(e => e.type === 'fall');
  assert.deepEqual(casualties.map(e => [e.id, e.x, e.d, e.kind, e.tier]),
    soldiers.map(m => [m.id, m.x, m.d, 'marine', 0]));
  const brute = s.addThreat('brute', 1.4, 12);
  s.damage(brute, brute.hp + 1, 'round', { x: 1.4, d: 12 });
  assert.equal(s.events.filter(e => e.type === 'fall' && e.id === brute.id).length, 1);
  assert.ok(!s.threats.includes(brute));

  s.start();
  let stomps = 0;
  play(s, autopilot, 80, (state, events) => {
    if (events.some(e => e.type === 'bossStomp')) {
      assert.ok(state.boss?.recovery > .48);
      assert.equal(state.boss.windup, 0);
      stomps++;
    }
  });
  assert.ok(stomps > 0);
});
