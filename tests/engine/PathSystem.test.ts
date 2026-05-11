import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { pathCacheKey } from '../../src/engine/PathSystem';
import { makeContent, makeLevel } from '../fixtures/content';
import type { LevelDef } from '../../src/engine/content/ContentLibrary';

function withWalls(level: LevelDef, walls: { id: string; points: [number, number][] }[]): LevelDef {
  return { ...level, terrain: { walls } };
}

describe('PathSystem', () => {
  it('no walls → direct two-point path between every pair', () => {
    const level = makeLevel([
      { id: 'n1', position: [100, 100], ownerId: 'p1', units: 10 },
      { id: 'n2', position: [500, 100], ownerId: 'ai1', units: 10 },
    ]);
    const engine = new GameEngine(level, makeContent());
    const path = engine.world.pathCache.get(pathCacheKey('n1', 'n2'));
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    expect(path![0]).toEqual({ x: 100, y: 100 });
    expect(path![1]).toEqual({ x: 500, y: 100 });
  });

  it('a wall blocking the straight line produces a detour path', () => {
    // Two nodes on the same horizontal line, a vertical wall between them
    // that intersects the straight line. Path must go around.
    const baseLevel = makeLevel([
      { id: 'n1', position: [100, 200], ownerId: 'p1', units: 10 },
      { id: 'n2', position: [500, 200], ownerId: 'ai1', units: 10 },
    ]);
    const level = withWalls(baseLevel, [
      { id: 'w1', points: [[300, 0], [300, 400]] },
    ]);
    const engine = new GameEngine(level, makeContent());
    const path = engine.world.pathCache.get(pathCacheKey('n1', 'n2'));
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    // First waypoint is source, last is target.
    expect(path![0]).toEqual({ x: 100, y: 200 });
    expect(path!.at(-1)).toEqual({ x: 500, y: 200 });
    // The polyline length should exceed the direct distance.
    const direct = 400;
    let total = 0;
    for (let i = 1; i < path!.length; i++) {
      total += Math.hypot(
        path![i]!.x - path![i - 1]!.x,
        path![i]!.y - path![i - 1]!.y,
      );
    }
    expect(total).toBeGreaterThan(direct);
  });

  it('chokepoint level: a gap in two stacked walls lets units through', () => {
    const baseLevel = makeLevel([
      { id: 'n1', position: [100, 360], ownerId: 'p1', units: 10 },
      { id: 'n2', position: [1100, 360], ownerId: 'ai1', units: 10 },
    ]);
    const level = withWalls(baseLevel, [
      { id: 'w1', points: [[600, 0], [600, 300]] },
      { id: 'w2', points: [[600, 420], [600, 720]] },
    ]);
    const engine = new GameEngine(level, makeContent());
    const path = engine.world.pathCache.get(pathCacheKey('n1', 'n2'));
    expect(path).not.toBeNull();
    // n1 and n2 are at y=360, which is inside the gap (300..420), so the
    // straight line clears both walls — should be the direct two-point path.
    expect(path!.length).toBe(2);
  });

  it('rejects level loading if a node sits on a wall', () => {
    const baseLevel = makeLevel([
      { id: 'n1', position: [600, 200], ownerId: 'p1', units: 10 },
      { id: 'n2', position: [800, 200], ownerId: 'ai1', units: 10 },
    ]);
    const level = withWalls(baseLevel, [
      { id: 'w1', points: [[600, 100], [600, 300]] },
    ]);
    expect(() => new GameEngine(level, makeContent())).toThrow(/overlaps a wall/);
  });

  it('sendUnits routes through the cached path waypoints', () => {
    const baseLevel = makeLevel([
      { id: 'n1', position: [100, 200], ownerId: 'p1', units: 10 },
      { id: 'n2', position: [500, 200], ownerId: 'ai1', units: 10 },
    ]);
    const level = withWalls(baseLevel, [
      { id: 'w1', points: [[300, 0], [300, 400]] },
    ]);
    const engine = new GameEngine(level, makeContent());
    const r = engine.sendUnits(['n1'], 'n2', 1.0);
    expect(r.ok).toBe(true);
    const ug = engine.world.unitGroups[0]!;
    expect(ug.path.length).toBeGreaterThan(2);
    // Total distance should match the polyline length.
    let total = 0;
    for (let i = 1; i < ug.path.length; i++) {
      total += Math.hypot(
        ug.path[i]!.x - ug.path[i - 1]!.x,
        ug.path[i]!.y - ug.path[i - 1]!.y,
      );
    }
    expect(ug.totalDistance).toBeCloseTo(total, 5);
  });
});
