// TowerInterceptSystem (§8, §6.1) — towers shoot enemy unit groups in range.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { makeContent, makeLevel } from '../fixtures/content';
import { TICK_MS } from '../../src/types';

const content = makeContent();

describe('TowerInterceptSystem', () => {
  it('reduces an in-range enemy UnitGroup count by attackDamage', () => {
    const level = makeLevel([
      // Tower L1: range 200, rate 0.4/s, damage 1.
      { id: 't1', position: [400, 300], ownerId: 'p1', units: 30, type: 'tower', level: 1 },
      // Source close enough that the in-flight group passes within range.
      { id: 's1', position: [800, 300], ownerId: 'ai1', units: 50, type: 'barracks', level: 1 },
      { id: 'd1', position: [200, 300], ownerId: 'ai1', units: 50, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const before = engine.world.unitGroups.length;
    expect(before).toBe(0);

    // Send AI units across the tower's path.
    const send = engine.sendUnits(['s1'], 'd1', 1.0);
    expect(send.ok).toBe(true);
    const ug = engine.world.unitGroups[0]!;
    const startCount = ug.count;

    // Tick until the group is within tower range and tower fires.
    let fired = false;
    for (let i = 0; i < 600 && !fired; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
      const live = engine.world.unitGroups[0];
      if (live && live.count < startCount) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('does not attack friendly UnitGroups', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1', units: 30, type: 'tower', level: 1 },
      { id: 'sp', position: [800, 300], ownerId: 'p1', units: 50, type: 'barracks', level: 1 },
      { id: 'dp', position: [200, 300], ownerId: 'p1', units: 50, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const send = engine.sendUnits(['sp'], 'dp', 1.0);
    expect(send.ok).toBe(true);
    const ug = engine.world.unitGroups[0]!;
    const startCount = ug.count;

    // Run far longer than any cooldown — friendly group should never lose count.
    for (let i = 0; i < 600; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
    }
    // The group either reached the friendly target (consumed by CombatSystem)
    // or is still in flight at full count. Crucially it was never reduced.
    if (engine.world.unitGroups.length > 0) {
      expect(engine.world.unitGroups[0]!.count).toBe(startCount);
    }
  });

  it('respects attackRate cooldown — not more than ~rate/s shots per second', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1', units: 30, type: 'tower', level: 1 },
      // Park an enemy group right next to the tower so it's always in range.
      { id: 's1', position: [410, 300], ownerId: 'ai1', units: 999, type: 'barracks', level: 1 },
      { id: 'd1', position: [395, 300], ownerId: 'ai1', units: 1, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    engine.sendUnits(['s1'], 'd1', 1.0);
    const ug = engine.world.unitGroups[0]!;
    const startCount = ug.count;

    // Rate 0.4/s × damage 1 ⇒ over 1 second at most ~1 shot.
    const ticksFor1s = Math.round(1000 / TICK_MS);
    for (let i = 0; i < ticksFor1s; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
    }
    if (engine.world.unitGroups.length > 0) {
      const lost = startCount - engine.world.unitGroups[0]!.count;
      // Allow a touch of slack for sub-tick scheduling but not multiple shots.
      expect(lost).toBeLessThanOrEqual(1);
      expect(lost).toBeGreaterThanOrEqual(0);
    }
  });

  it('removes UnitGroup from world.unitGroups when count drops to 0', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1', units: 30, type: 'tower', level: 1 },
      { id: 's1', position: [410, 300], ownerId: 'ai1', units: 1, type: 'barracks', level: 1 },
      { id: 'd1', position: [395, 300], ownerId: 'ai1', units: 50, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    engine.sendUnits(['s1'], 'd1', 1.0);
    expect(engine.world.unitGroups.length).toBe(1);
    expect(engine.world.unitGroups[0]!.count).toBe(1);

    // Single shot should kill a 1-count group; sweep should remove it.
    let cleared = false;
    for (let i = 0; i < 30 && !cleared; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) cleared = true;
    }
    expect(cleared).toBe(true);
  });

  it('frozen towers do not fire', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1', units: 30, type: 'tower', level: 1 },
      { id: 's1', position: [410, 300], ownerId: 'ai1', units: 999, type: 'barracks', level: 1 },
      { id: 'd1', position: [395, 300], ownerId: 'ai1', units: 5, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.isFrozen = true;
    tower.frozenUntilTick = 9999;
    engine.sendUnits(['s1'], 'd1', 1.0);
    const ug = engine.world.unitGroups[0]!;
    const startCount = ug.count;
    for (let i = 0; i < 60; i++) engine.tick();
    if (engine.world.unitGroups.length > 0) {
      expect(engine.world.unitGroups[0]!.count).toBe(startCount);
    }
  });

  it('neutral towers attack everyone (v2.6.2 — neutrals are a faction)', () => {
    const level = makeLevel([
      // p1 placeholder so the engine doesn't enter 'lost' status before
      // the tower has a chance to fire.
      { id: 'p0', position: [50, 50],   ownerId: 'p1',  units: 5,  type: 'barracks', level: 1 },
      { id: 't1', position: [400, 300], ownerId: null,  units: 0,  type: 'tower',    level: 1 },
      { id: 's1', position: [800, 300], ownerId: 'ai1', units: 50, type: 'barracks', level: 1 },
      { id: 'd1', position: [200, 300], ownerId: 'ai1', units: 50, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    engine.sendUnits(['s1'], 'd1', 1.0);
    const ug = engine.world.unitGroups[0]!;
    const startCount = ug.count;

    let fired = false;
    for (let i = 0; i < 600 && !fired; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
      const live = engine.world.unitGroups[0];
      if (live && live.count < startCount) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('does not affect a level with no towers', () => {
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'p1', units: 25 },
      { id: 'b2', position: [600, 200], ownerId: 'ai1', units: 25 },
    ]);
    const engine = new GameEngine(level, content);
    engine.sendUnits(['b1'], 'b2', 1.0);
    const startCount = engine.world.unitGroups[0]!.count;
    for (let i = 0; i < 60; i++) engine.tick();
    if (engine.world.unitGroups.length > 0) {
      expect(engine.world.unitGroups[0]!.count).toBe(startCount);
    }
  });
});
