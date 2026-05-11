// Tower per-arrival defenseRate (user spec patch) — incoming hostile
// counts are reduced by `defenseRate` before CombatSystem resolves.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();

describe('Tower defenseRate', () => {
  it('hostile arrival has count reduced by defenseRate before resolution', () => {
    // Tower L1 fixture: defenseRate 2, attackRange 200, attackRate 0.4
    // Place attacker very close so the in-flight TowerInterceptSystem
    // doesn't have time to chip extra count off the group.
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0,  type: 'tower',    level: 1 },
      // Hostile attacker right next to the tower so it arrives in
      // ~one tick — no interception in flight to confound the test.
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 5,  type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999; // suppress in-flight interception so
                                    // defenseRate is the only effect under test.

    // Send 5 units; defenseRate 2 → tower starts with 0, takes
    // 5−2 = 3 effective hostile damage; tower had 0 units, so it
    // flips to ai1 with 3 units leftover.
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    expect(tower.ownerId).toBe('ai1');
    expect(Math.round(tower.units)).toBe(3);
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
    // Friendly send: 5 units arrive, tower had 0, ends with 5.
    expect(tower.ownerId).toBe('p1');
    expect(tower.units).toBeCloseTo(5, 0);
  });

  it('a hostile attack smaller than defenseRate is fully absorbed', () => {
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0, type: 'tower',    level: 1 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 2, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 2 attacker − 2 defense = 0 effective. Tower keeps owner, units unchanged.
    expect(tower.ownerId).toBe('p1');
    expect(Math.round(tower.units)).toBe(0);
  });

  it('higher-level tower has higher defenseRate', () => {
    // Tower L2 fixture: defenseRate 3.
    const level = makeLevel([
      { id: 't1', position: [400, 300], ownerId: 'p1',  units: 0, type: 'tower',    level: 2 },
      { id: 's1', position: [402, 300], ownerId: 'ai1', units: 5, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const tower = engine.world.nodes.get('t1')!;
    tower.attackCooldownMs = 99999;
    engine.sendUnits(['s1'], 't1', 1.0);
    for (let i = 0; i < 30; i++) engine.tick();
    // 5 − 3 = 2; tower flips to ai1 with 2 leftover.
    expect(tower.ownerId).toBe('ai1');
    expect(Math.round(tower.units)).toBe(2);
  });
});
