// Chokepoint level (L12 in the Phase 5 curve) — pathCache builds and
// routes pair-paths around the wall, not through it. Walls now terminate
// at the canvas edge but corner waypoints are clamped to canvas bounds
// (Issue 2 fix), so paths cannot route off-canvas.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { LevelSchema } from '../../src/engine/content/schemas';
import { pathCacheKey } from '../../src/engine/PathSystem';
import { makeContent } from '../fixtures/content';
import type { LevelDef } from '../../src/engine/content/ContentLibrary';
import level012 from '../../content/levels/012.json';

describe('level 012 — Chokepoint', () => {
  const parsed = LevelSchema.parse(level012) as LevelDef;

  it('schema validates and engine accepts the level', () => {
    expect(parsed.id).toBe(12);
    expect(parsed.terrain.walls.length).toBe(2);
    const engine = new GameEngine(parsed, makeContent());
    expect(engine.world.walls.length).toBe(2);
    expect(engine.world.pathCache.size).toBeGreaterThan(0);
  });

  it('p_b1 → ai_b2 routes around the wall, not through it', () => {
    const engine = new GameEngine(parsed, makeContent());
    // p_b1 at (180, 220), ai_b2 at (1100, 520). Straight line crosses
    // the upper wall at x=640. Cached path must detour through the gap
    // and have more than 2 waypoints. Every waypoint must stay on canvas.
    const path = engine.world.pathCache.get(pathCacheKey('p_b1', 'ai_b2'));
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    for (const p of path!) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1280);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(720);
    }
  });

  it('sendUnits across the wall routes through the cached path', () => {
    const engine = new GameEngine(parsed, makeContent());
    const r = engine.sendUnits(['p_b1'], 'ai_b2', 1.0);
    expect(r.ok).toBe(true);
    const ug = engine.world.unitGroups[0]!;
    expect(ug.path.length).toBeGreaterThan(2);
  });
});
