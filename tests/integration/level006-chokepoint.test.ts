// Phase 3 — level 006 "Chokepoint" loads, builds a pathCache, and routes
// pair-paths around the wall instead of through it.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { LevelSchema } from '../../src/engine/content/schemas';
import { pathCacheKey } from '../../src/engine/PathSystem';
import { makeContent } from '../fixtures/content';
import type { LevelDef } from '../../src/engine/content/ContentLibrary';
import level006 from '../../content/levels/006.json';

describe('level 006 — Chokepoint', () => {
  const parsed = LevelSchema.parse(level006) as LevelDef;

  it('schema validates and engine accepts the level', () => {
    expect(parsed.id).toBe(6);
    expect(parsed.terrain.walls.length).toBe(2);
    const engine = new GameEngine(parsed, makeContent());
    expect(engine.world.walls.length).toBe(2);
    expect(engine.world.pathCache.size).toBeGreaterThan(0);
  });

  it('p_b1 → ai_b2 routes around the wall, not through it', () => {
    const engine = new GameEngine(parsed, makeContent());
    // p_b1 is at (180, 220), ai_b2 at (1100, 520). Straight line crosses
    // the upper wall at x=640. Cached path must detour through the gap
    // and have more than 2 waypoints.
    const path = engine.world.pathCache.get(pathCacheKey('p_b1', 'ai_b2'));
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    // The path's total length should exceed the direct distance.
    const direct = Math.hypot(1100 - 180, 520 - 220);
    let total = 0;
    for (let i = 1; i < path!.length; i++) {
      total += Math.hypot(
        path![i]!.x - path![i - 1]!.x,
        path![i]!.y - path![i - 1]!.y,
      );
    }
    expect(total).toBeGreaterThan(direct);
  });

  it('sendUnits across the wall routes through the cached path', () => {
    const engine = new GameEngine(parsed, makeContent());
    const r = engine.sendUnits(['p_b1'], 'ai_b2', 1.0);
    expect(r.ok).toBe(true);
    const ug = engine.world.unitGroups[0]!;
    expect(ug.path.length).toBeGreaterThan(2);
  });
});
