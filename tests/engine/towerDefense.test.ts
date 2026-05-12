// Tower per-arrival defenseRate (user spec patch) — incoming hostile
// counts are DIVIDED by `defenseRate` before CombatSystem resolves
// (rate 2 → 20-unit attack hits for 10).

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();

describe('Tower defenseRate (divisor)', () => {
  it('hostile arrival count is divided by defenseRate', () => {
    // Tower L1 fixture: defenseRate 2.
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0,  type: 'tower',    level: 1 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 20, type: 'barracks', level: 5 }, // L5 cap = 50
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999; // suppress in-flight interception

    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 20 / 2 = 10 effective; tower had 0; flips to ai1 with 10 units.
    expect(tower.ownerId).toBe('ai1');
    expect(Math.round(tower.units)).toBe(10);
  });

  it('friendly reinforcements pass through without defense reduction', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1', units: 0, type: 'tower',    level: 1 },
      { id: 's1', position: [402, 300], ownerId: 'p1', units: 5, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    expect(tower.ownerId).toBe('p1');
    expect(tower.units).toBeCloseTo(5, 0);
  });

  it('higher-level tower has stronger divisor (rate 3 = ⅓ damage)', () => {
    // Tower L2 fixture: defenseRate 3.
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0,  type: 'tower',    level: 2 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 30, type: 'barracks', level: 5 }, // L5 cap = 50
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 30 / 3 = 10 effective; tower had 0; flips to ai1 with 10 units.
    expect(tower.ownerId).toBe('ai1');
    expect(Math.round(tower.units)).toBe(10);
  });

  it('L3 tower divides by 4 (defenseRate curve middle)', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0,  type: 'tower',    level: 3 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 40, type: 'barracks', level: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 40 / 4 = 10 effective; tower 0 → flips with 10 units.
    expect(tower.ownerId).toBe('ai1');
    expect(Math.round(tower.units)).toBe(10);
  });

  it('L5 tower divides hostile arrivals by 5.5', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0,  type: 'tower',    level: 5 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 33, type: 'barracks', level: 5 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 33 / 5.5 = 6 effective; tower 0 → flips with 6 units.
    expect(tower.ownerId).toBe('ai1');
    expect(tower.units).toBeCloseTo(6, 5);
  });

  it('neutral tower divides incoming counts (v2.6.2 — neutrals are a faction)', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: null,  units: 0,  type: 'tower',    level: 1 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 20, type: 'barracks', level: 5 },
      { id: 's2', position: [800, 300], ownerId: 'p1',  units: 5,  type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999; // suppress in-flight interception
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // L1 defenseRate 2: 20 / 2 = 10 effective; neutral tower flips to ai1 with 10 units.
    expect(tower.ownerId).toBe('ai1');
    expect(Math.round(tower.units)).toBe(10);
  });

  it('small attack still gets divided (no flip if defender holds)', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 5, type: 'tower',    level: 1 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 8, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 8 / 2 = 4 effective; tower had 5; ends with 1, owner unchanged.
    expect(tower.ownerId).toBe('p1');
    expect(tower.units).toBeCloseTo(1, 0);
  });
});
