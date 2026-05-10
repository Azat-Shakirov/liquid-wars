// Spell system (§7) — concoction lifecycle, cast effects, EffectSystem.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();

function makeLab(level = 1, units = 60) {
  return makeLevel([
    { id: 'lab1', position: [200, 200], ownerId: 'p1', units, type: 'lab', level },
    { id: 'enemy', position: [600, 200], ownerId: 'ai1', units: 20, type: 'barracks', level: 1 },
    { id: 'mine',  position: [400, 200], ownerId: 'p1', units: 10, type: 'barracks', level: 1 },
    { id: 'neutral', position: [800, 200], ownerId: null, units: 10, type: 'barracks', level: 1 },
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
    // freeze concoctTimeMs = 4000, lab L1 concoctSpeed = 1.0
    const ticks = ticksFor(4000) + 2; // +slack for floor rounding
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

  it('frozen Lab pauses concoction (does not cancel)', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;
    lab.isFrozen = true;
    lab.frozenUntilTick = engine.world.tick + 99999;
    // After many ticks, concoction should not have advanced.
    const before = lab.spellQueue!.progress;
    for (let i = 0; i < 30; i++) engine.tick();
    // Frozen lab also has ownerId stripped per Freeze spec when applied via spell,
    // but in this test we set isFrozen directly without nulling owner. So queue stays.
    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.progress).toBe(before);
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
    expect(lab.units).toBe(60); // no payment
  });
});

describe('castSpell — Freeze', () => {
  it('rejects when spell is not ready', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not ready/i);
  });

  it('on cast: deducts cost, neutralizes target, sets isFrozen with expiry', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    for (let i = 0; i < ticksFor(4000) + 2; i++) engine.tick();
    const lab = engine.world.nodes.get('lab1')!;
    const enemy = engine.world.nodes.get('enemy')!;
    const beforeUnits = enemy.units;

    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(true);
    expect(lab.units).toBe(60 - 25);
    expect(lab.spellQueue).toBeNull();

    expect(enemy.ownerId).toBeNull(); // neutralized per §7.2
    expect(enemy.isFrozen).toBe(true);
    expect(enemy.units).toBe(beforeUnits); // units preserved
    expect(enemy.frozenUntilTick).toBeGreaterThan(engine.world.tick);
  });

  it('frozen target thaws on schedule via EffectSystem', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    for (let i = 0; i < ticksFor(4000) + 2; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;
    expect(enemy.isFrozen).toBe(true);

    // freeze.durationMs = 5000 → ~300 ticks. Add slack.
    for (let i = 0; i < ticksFor(5000) + 5; i++) engine.tick();
    expect(enemy.isFrozen).toBe(false);
    expect(enemy.ownerId).toBeNull(); // still neutral until someone captures
  });

  it('arrivals at a frozen node queue and resolve on thaw', () => {
    const engine = new GameEngine(makeLab(1, 60), content);
    engine.startConcoction('lab1', 'freeze');
    for (let i = 0; i < ticksFor(4000) + 2; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;
    expect(enemy.isFrozen).toBe(true);

    // Send a friendly attack at the now-neutral frozen target. Boost
    // 'mine' so the eventual arrival is large enough to capture.
    engine.world.nodes.get('mine')!.units = 50;
    engine.sendUnits(['mine'], 'enemy', 1.0);
    // Tick until in-flight group reaches the target — it should be queued.
    for (let i = 0; i < 200; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
    }
    // The arrival was queued because target was frozen. World.unitGroups
    // is now empty (CombatSystem moved it into pendingArrivals).
    expect(engine.world.unitGroups.length).toBe(0);
    expect(enemy.isFrozen).toBe(true);
    expect(enemy.ownerId).toBeNull();

    // Now wait for thaw + 1 tick for EffectSystem to resurface arrivals.
    for (let i = 0; i < ticksFor(5000) + 10; i++) engine.tick();
    expect(enemy.isFrozen).toBe(false);
    // The arrival captured the now-neutral target.
    expect(enemy.ownerId).toBe('p1');
  });
});

describe('castSpell — Poison', () => {
  it('adds a poison stack, EffectSystem drains over time, expires after duration', () => {
    const engine = new GameEngine(makeLab(2, 80), content);
    engine.startConcoction('lab1', 'poison');
    // poison concoctTime = 6000, lab L2 concoctSpeed = 1.3
    // ticks ≈ 6000 / 1.3 ÷ TICK_MS
    const concoctTicks = Math.ceil((6000 / 1.3) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    const lab = engine.world.nodes.get('lab1')!;
    expect(lab.spellQueue?.state).toBe('ready');

    const enemy = engine.world.nodes.get('enemy')!;
    const beforeUnits = enemy.units;
    const r = engine.castSpell('lab1', 'enemy');
    expect(r.ok).toBe(true);
    expect(enemy.poisonStacks.length).toBe(1);

    // Drain @ 2/sec for 8 sec ⇒ 16 units total. Tick 9 sec.
    const drainTicks = ticksFor(9000);
    for (let i = 0; i < drainTicks; i++) engine.tick();
    expect(enemy.units).toBeLessThan(beforeUnits);
    // Stack expired by now.
    expect(enemy.poisonStacks.length).toBe(0);
  });

  it('poison clears on ownership flip (§7.2)', () => {
    const engine = new GameEngine(makeLab(2, 80), content);
    engine.startConcoction('lab1', 'poison');
    const concoctTicks = Math.ceil((6000 / 1.3) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    engine.castSpell('lab1', 'enemy');
    const enemy = engine.world.nodes.get('enemy')!;
    expect(enemy.poisonStacks.length).toBe(1);

    // Drain enemy almost to zero, then capture by sending units.
    enemy.units = 5;
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
  it('flips ownership, preserves units, ends poison, cancels target spellQueue', () => {
    const engine = new GameEngine(makeLab(3, 100), content);
    engine.startConcoction('lab1', 'recruit');
    const concoctTicks = Math.ceil((9000 / 1.6) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    const lab = engine.world.nodes.get('lab1')!;
    expect(lab.spellQueue?.state).toBe('ready');

    const enemy = engine.world.nodes.get('enemy')!;
    enemy.poisonStacks.push({
      sourcePlayerId: 'p1',
      drainPerSecond: 2,
      expiresTick: engine.world.tick + 9999,
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
    const concoctTicks = Math.ceil((9000 / 1.6) / TICK_MS) + 5;
    for (let i = 0; i < concoctTicks; i++) engine.tick();
    const r = engine.castSpell('lab1', 'neutral');
    expect(r.ok).toBe(true);
    expect(engine.world.nodes.get('neutral')!.ownerId).toBe('p1');
  });
});

describe('frozen node behavior', () => {
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
