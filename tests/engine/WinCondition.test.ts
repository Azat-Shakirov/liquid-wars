// Phase 5 win condition: won when no enemy player owns any node.
// Neutral nodes are terrain, not opponents — they don't block victory.

import { describe, it, expect } from 'vitest';
import { WinConditionSystem } from '../../src/engine/systems/WinConditionSystem';
import { buildWorldFromLevel } from '../../src/engine/World';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

describe('WinConditionSystem', () => {
  it('won when no enemy nodes remain, even with neutrals on the map', () => {
    const level = makeLevel([
      { id: 'p1_a', position: [200, 200], ownerId: 'p1', units: 10 },
      { id: 'p1_b', position: [200, 500], ownerId: 'p1', units: 10 },
      { id: 'neutral', position: [600, 360], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('won');
  });

  it('not yet won when at least one enemy node remains', () => {
    const level = makeLevel([
      { id: 'p1_a', position: [200, 200], ownerId: 'p1', units: 10 },
      { id: 'ai_a', position: [600, 200], ownerId: 'ai1', units: 10 },
      { id: 'neutral', position: [400, 500], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('playing');
  });

  it('lost when player owns 0 nodes and has no in-flight groups', () => {
    const level = makeLevel([
      { id: 'ai_a', position: [600, 200], ownerId: 'ai1', units: 10 },
      { id: 'neutral', position: [200, 200], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('lost');
  });

  it('v2.7.3: holds judgment while ANY UnitGroup is in flight', () => {
    // Setup: only the player owns nodes (would normally trigger win),
    // but there's a unit group mid-air. The system must wait until it
    // lands before declaring the outcome.
    const level = makeLevel([
      { id: 'p1_a', position: [200, 200], ownerId: 'p1', units: 10 },
      { id: 'neutral', position: [600, 200], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    // Force an in-flight UG into the world (any owner — the rule is
    // "no judgment while any group flies").
    world.unitGroups.push({
      id: 'ug-mock',
      ownerId: 'p1',
      count: 5,
      sourceFaction: 'azure',
      fromNodeId: 'p1_a',
      toNodeId: 'neutral',
      path: [{ x: 200, y: 200 }, { x: 600, y: 200 }],
      pathProgress: 0.5,
      totalDistance: 400,
      baseSpeed: 0.09,
      spawnTick: 0,
      arrivalTick: 10,
      position: { x: 400, y: 200 },
      previousPosition: { x: 400, y: 200 },
    });
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('playing');
  });

  it('v2.7.3: holds loss judgment while player has units in flight (carried from v2.6)', () => {
    const level = makeLevel([
      { id: 'ai_a', position: [600, 200], ownerId: 'ai1', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    world.unitGroups.push({
      id: 'ug-mock',
      ownerId: 'p1',
      count: 3,
      sourceFaction: 'azure',
      fromNodeId: 'ai_a', // arbitrary — only ownerId matters for the test
      toNodeId: 'ai_a',
      path: [{ x: 100, y: 200 }, { x: 600, y: 200 }],
      pathProgress: 0.5,
      totalDistance: 500,
      baseSpeed: 0.09,
      spawnTick: 0,
      arrivalTick: 10,
      position: { x: 350, y: 200 },
      previousPosition: { x: 350, y: 200 },
    });
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('playing');
  });
});
