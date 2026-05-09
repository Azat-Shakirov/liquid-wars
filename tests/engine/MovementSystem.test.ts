import { describe, it, expect } from 'vitest';
import { MovementSystem } from '../../src/engine/systems/MovementSystem';
import type { UnitGroup } from '../../src/engine/entities/UnitGroup';
import { TICK_MS } from '../../src/types';
import { buildWorldFromLevel } from '../../src/engine/World';
import { makeContent, makeLevel } from '../fixtures/content';

function makeUg(overrides: Partial<UnitGroup> = {}): UnitGroup {
  const path = overrides.path ?? [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  return {
    id: 'ug1',
    ownerId: 'p1',
    count: 10,
    sourceLiquid: 'water',
    fromNodeId: 'a',
    toNodeId: 'b',
    path,
    pathProgress: 0,
    totalDistance: 100,
    baseSpeed: 0.1, // 0.1 px / ms = 6 px / tick
    spawnTick: 0,
    arrivalTick: 100,
    position: { ...path[0]! },
    previousPosition: { ...path[0]! },
    ...overrides,
  };
}

describe('MovementSystem', () => {
  it('advances pathProgress in proportion to baseSpeed * dt / totalDistance', () => {
    const content = makeContent();
    const level = makeLevel([{ id: 'n1', position: [0, 0], ownerId: 'p1', units: 0 }]);
    const world = buildWorldFromLevel(level, content);
    const ug = makeUg();
    world.unitGroups.push(ug);
    const sys = new MovementSystem();

    sys.update(world, TICK_MS);

    // baseSpeed * TICK_MS = 0.1 * 16.67 ≈ 1.667 px; / 100 px = 0.01667
    expect(ug.pathProgress).toBeCloseTo(0.01666, 4);
    expect(ug.position.x).toBeCloseTo(1.667, 2);
    expect(ug.position.y).toBeCloseTo(0, 6);
  });

  it('clamps pathProgress at 1 and lands on target', () => {
    const content = makeContent();
    const level = makeLevel([{ id: 'n1', position: [0, 0], ownerId: 'p1', units: 0 }]);
    const world = buildWorldFromLevel(level, content);
    const ug = makeUg({ baseSpeed: 1 });
    world.unitGroups.push(ug);
    const sys = new MovementSystem();

    for (let i = 0; i < 30; i++) sys.update(world, TICK_MS);

    expect(ug.pathProgress).toBe(1);
    expect(ug.position).toEqual({ x: 100, y: 0 });
  });
});
