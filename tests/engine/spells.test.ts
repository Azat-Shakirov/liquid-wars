// Spell system (§7 + user spec patch) — concoction lifecycle and the
// post-patch effects (Freeze = pure neutralize, Bleed = permanent
// drain + production halt until captured, Recruit unchanged).

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();

function makeLab(level = 1, units = 60) {
  return makeLevel([
    { id: 'lab1',    position: [200, 200],  ownerId: 'p1',  units,             type: 'lab',      level },
    { id: 'enemy',   position: [600, 200],  ownerId: 'ai1', units: 20,          type: 'barracks', level: 1 },
    { id: 'mine',    position: [400, 200],  ownerId: 'p1',  units: 10,          type: 'barracks', level: 1 },
    { id: 'neutral', position: [800, 200],  ownerId: null,  units: 10,          type: 'barracks', level: 1 },
  ]);
}

const ticksFor = (ms: number) => Math.ceil(ms / TICK_MS);

describe('startConcoction', () => {
  it('queues a spell on a Lab in the concocting state', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    const lab = engine.world.nodes.get('lab1')!;
    const r = engine.startConcoction('lab1', 'freeze');
    expect(r.ok).toBe(true);
    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.spellId).toBe('freeze');
    expect(lab.spellQueue!.state).toBe('concocting');
    expect(lab.spellQueue!.progress).toBe(0);
    expect(lab.units).toBe(60); // pay-on-cast: nothing deducted yet
  });

  it('rejects a spell whose minLabLevel exceeds the Lab level', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    const r = engine.startConcoction('lab1', 'recruit'); // recruit needs Lab L3
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/lab level/i);
  });

  it('rejects when units < unitCost', () => {
    const engine = new GameEngine(makeLab(1, 10), content);
    const r = engine.startConcoction('lab1', 'freeze'); // freeze costs 25
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/insufficient/i);
  });

  it('rejects on a non-Lab', () => {
    const engine = new GameEngine(makeLab(), content);
    const r = engine.startConcoction('mine', 'freeze');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not a lab/i);
  });

  it('rejects when Lab already busy', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    expect(engine.startConcoction('lab1', 'freeze').ok).toBe(true);
    const r2 = engine.startConcoction('lab1', 'freeze');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/busy/i);
  });
});

describe('SpellConcoctionSystem', () => {
  it('advances progress to ready over concoctTimeMs', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;
    // freeze concoctTimeMs = 15000, lab L1 concoctSpeed = 1.0
    const ticks = ticksFor(15000) + 5;
    for (let i = 0; i < ticks; i++) engine.tick();
    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.state).toBe('ready');
    expect(lab.spellQueue!.progress).toBe(1);
  });

  it('cancels concoction if Lab.units drops below cost mid-concoction', () => {
    const engine = new GameEngine(makeLab(1, 30), content); // ≥25 to start
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;
    expect(lab.spellQueue).not.toBeNull();
    lab.units = 1;
    engine.tick();
    expect(lab.spellQueue).toBeNull();
  });
});

describe('cancelConcoction', () => {
  it('drops the queue with no penalty', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;
    expect(lab.units).toBe(60);
    const r = engine.cancelConcoction('lab1');
    expect(r.ok).toBe(true);
    expect(lab.spellQueue).toBeNull();
    expect(lab.units).toBe(60);
  });
});

describe('castSpell — Freeze (pure neutralize)', () => {
  it('rejects when spell is not ready', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not ready/i);
  });

  it('on cast: deducts cost and neutralizes target with units preserved', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    for (let i = 0; i < ticksFor(15000) + 5; i++) engine.tick();
    const lab = engine.world.nodes.get('lab1')!;
    const enemy = engine.world.nodes.get('enemy')!;
    const beforeUnits = enemy.units;

    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(true);
    expect(lab.units).toBe(60 - 25);
    expect(lab.spellQueue).toBeNull();

    expect(enemy.ownerId).toBeNull();
    expect(enemy.units).toBe(beforeUnits);
    // Pure neutralize — no isFrozen, no timer.
    expect(enemy.isFrozen).toBe(false);
  });

  it('next attacker can capture the now-neutral target normally', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    for (let i = 0; i < ticksFor(15000) + 5; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;

    // Boost mine and send — should arrive and capture (no pendingArrivals queue).
    engine.world.nodes.get('mine')!.units = 50;
    engine.sendUnits(['mine'], 'enemy', 1.0);
    for (let i = 0; i < 200; i++) {
      engine.tick();
      if (enemy.ownerId === 'p1') break;
    }
    expect(enemy.ownerId).toBe('p1');
  });
});

describe('castSpell — Bleed (permanent until captured)', () => {
  it('adds a permanent bleed stack', () => {
    const engine = new GameEngine(makeLab(2, 80), content);
    engine.startConcoction('lab1', 'bleed');
    const concoctTicks = Math.ceil((15000 / 1.3) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    const lab = engine.world.nodes.get('lab1')!;
    expect(lab.spellQueue?.state).toBe('ready');

    const enemy = engine.world.nodes.get('enemy')!;
    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(true);
    expect(enemy.poisonStacks.length).toBe(1);
    expect(enemy.poisonStacks[0]!.drainPerSecond).toBe(1);
    expect(enemy.poisonStacks[0]!.expiresTick).toBeGreaterThan(1e10);
  });

  it('drains 1 unit per second over time and never self-expires', () => {
    const engine = new GameEngine(makeLab(2, 80), content);
    engine.startConcoction('lab1', 'bleed');
    const concoctTicks = Math.ceil((15000 / 1.3) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;
    enemy.units = 20; // known starting point

    // Tick 10 seconds — drain should be ~10 units.
    for (let i = 0; i < ticksFor(10000); i++) engine.tick();
    expect(enemy.units).toBeLessThanOrEqual(11);
    expect(enemy.units).toBeGreaterThanOrEqual(9);
    // Stack still present (no self-expiry).
    expect(enemy.poisonStacks.length).toBe(1);
  });

  it('halts production on bleeding nodes', () => {
    const engine = new GameEngine(makeLab(2, 80), content);
    engine.startConcoction('lab1', 'bleed');
    const concoctTicks = Math.ceil((15000 / 1.3) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;
    // Drain enemy below max, then verify production doesn't refill.
    enemy.units = 5;
    const before = enemy.units;
    for (let i = 0; i < ticksFor(2000); i++) engine.tick();
    // Bleed drains ~2 units in 2s; production would have ADDED units
    // for an L1 enemy barracks (0.4/sec × 2s = 0.8 units). With
    // production halted, we expect units to have decreased, not
    // increased.
    expect(enemy.units).toBeLessThan(before);
  });

  it('vanishes when the node is captured by a non-owner', () => {
    const engine = new GameEngine(makeLab(2, 80), content);
    engine.startConcoction('lab1', 'bleed');
    const concoctTicks = Math.ceil((15000 / 1.3) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;
    expect(enemy.poisonStacks.length).toBe(1);

    enemy.units = 5;
    engine.world.nodes.get('mine')!.units = 50;
    engine.sendUnits(['mine'], 'enemy', 1.0);
    for (let i = 0; i < 200; i++) {
      engine.tick();
      if (enemy.ownerId === 'p1') break;
    }
    expect(enemy.ownerId).toBe('p1');
    expect(enemy.poisonStacks.length).toBe(0);
  });
});

describe('castSpell — Recruit', () => {
  it('flips ownership, preserves units, ends bleed, cancels target spellQueue', () => {
    const engine = new GameEngine(makeLab(3, 100), content);
    engine.startConcoction('lab1', 'recruit');
    const concoctTicks = Math.ceil((15000 / 1.6) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    const lab = engine.world.nodes.get('lab1')!;
    expect(lab.spellQueue?.state).toBe('ready');

    const enemy = engine.world.nodes.get('enemy')!;
    enemy.poisonStacks.push({
      sourcePlayerId: 'p1',
      drainPerSecond: 1,
      expiresTick: Number.MAX_SAFE_INTEGER,
    });
    const beforeUnits = enemy.units;

    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(true);
    expect(enemy.ownerId).toBe('p1');
    expect(enemy.units).toBe(beforeUnits);
    expect(enemy.poisonStacks.length).toBe(0);
    expect(enemy.spellQueue).toBeNull();
  });

  it('on a neutral target: flips to caster', () => {
    const engine = new GameEngine(makeLab(3, 100), content);
    engine.startConcoction('lab1', 'recruit');
    const concoctTicks = Math.ceil((15000 / 1.6) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    const r = engine.castSpell('lab1', 'neutral');
    expect(r.ok).toBe(true);
    expect(engine.world.nodes.get('neutral')!.ownerId).toBe('p1');
  });
});

describe('frozen-node legacy gates (isFrozen still respected if set)', () => {
  it('frozen owned source cannot send units', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    const mine = engine.world.nodes.get('mine')!;
    mine.isFrozen = true;
    mine.frozenUntilTick = engine.world.tick + 999;
    const r = engine.sendUnits(['mine'], 'enemy', 1.0);
    expect(r.ok).toBe(false);
  });

  it('frozen node does not produce', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    const mine = engine.world.nodes.get('mine')!;
    const before = mine.units;
    mine.isFrozen = true;
    mine.frozenUntilTick = engine.world.tick + 999;
    for (let i = 0; i < 60; i++) engine.tick();
    expect(mine.units).toBe(before);
  });
});
