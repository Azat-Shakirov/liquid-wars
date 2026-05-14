// Tower line-of-sight (§11.5 Phase 3). Walls block tower beams.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { makeContent, makeLevel } from '../fixtures/content';
import { TICK_MS } from '../../src/types';
import type { UnitGroup } from '../../src/engine/entities/UnitGroup';
import type { LevelDef } from '../../src/engine/content/ContentLibrary';

const content = makeContent();

function injectStationaryEnemy(engine: GameEngine, atX: number, atY: number) {
  // totalDistance must be > 0 so MovementSystem doesn't shortcut pathProgress
  // to 1 (which would route through CombatSystem). baseSpeed = 0 keeps the
  // group pinned at atX/atY despite the non-zero distance.
  const ug: UnitGroup = {
    id: 'ug1',
    ownerId: 'ai1',
    count: 10,
    sourceFaction: 'azure',
    fromNodeId: 'src',
    toNodeId: 'dst',
    path: [{ x: atX, y: atY }, { x: atX, y: atY }],
    pathProgress: 0,
    totalDistance: 1,
    baseSpeed: 0,
    spawnTick: 0,
    arrivalTick: Number.MAX_SAFE_INTEGER,
    position: { x: atX, y: atY },
    previousPosition: { x: atX, y: atY },
  };
  engine.world.unitGroups.push(ug);
  return ug;
}

function levelWithTowerAndPlaceholders(walls: { id: string; points: [number, number][] }[]): LevelDef {
  const level = makeLevel([
    // Tower at (400, 300), range 200.
    { id: 't1', position: [400, 300], ownerId: 'p1', type: 'tower', level: 1, units: 0 },
    // Two harmless placeholder nodes to satisfy the world (need ≥1 each side
    // so victory doesn't trigger and AI doesn't auto-send into our test).
    { id: 'p1b', position: [100, 600], ownerId: 'p1', type: 'barracks', units: 0 },
    { id: 'ai1b', position: [1200, 100], ownerId: 'ai1', type: 'barracks', units: 0 },
  ]);
  level.terrain.walls = walls;
  return level;
}

describe('Tower line-of-sight (LOS)', () => {
  it('does NOT fire when a wall blocks the segment to the enemy group', () => {
    // Wall at x=500, y∈[200,400] sits between tower(400,300) and ug(550,300).
    const level = levelWithTowerAndPlaceholders([
      { id: 'w1', points: [[500, 200], [500, 400]] },
    ]);
    const engine = new GameEngine(level, content);
    const ug = injectStationaryEnemy(engine, 550, 300);
    const start = ug.count;

    // Run several seconds of ticks; tower would have fired multiple times
    // by now if LOS were ignored.
    const ticks = Math.round(5000 / TICK_MS);
    for (let i = 0; i < ticks; i++) engine.tick();

    // ug is alive and never damaged.
    expect(engine.world.unitGroups.length).toBe(1);
    expect(engine.world.unitGroups[0]!.count).toBe(start);
  });

  it('DOES fire when there is no wall in the way', () => {
    const level = levelWithTowerAndPlaceholders([]);
    const engine = new GameEngine(level, content);
    const ug = injectStationaryEnemy(engine, 550, 300);
    const start = ug.count;

    const ticks = Math.round(5000 / TICK_MS);
    for (let i = 0; i < ticks; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
    }
    if (engine.world.unitGroups.length > 0) {
      expect(engine.world.unitGroups[0]!.count).toBeLessThan(start);
    } else {
      // Killed entirely — also fine.
      expect(true).toBe(true);
    }
  });

  it('fires when the wall is off to the side (does not cross the LOS segment)', () => {
    // Wall is well above the tower-to-ug line, so segment is clear.
    const level = levelWithTowerAndPlaceholders([
      { id: 'w1', points: [[500, 50], [500, 150]] },
    ]);
    const engine = new GameEngine(level, content);
    const ug = injectStationaryEnemy(engine, 550, 300);
    const start = ug.count;

    const ticks = Math.round(5000 / TICK_MS);
    for (let i = 0; i < ticks; i++) {
      engine.tick();
      if (engine.world.unitGroups.length === 0) break;
    }
    const live = engine.world.unitGroups[0];
    if (live) expect(live.count).toBeLessThan(start);
  });
});
