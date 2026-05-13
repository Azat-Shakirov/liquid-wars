// v2.7.5 — auto-zoom: World.preferredView snugly contains the level's
// nodes + walls, preserves map aspect, caps zoom at 2× (view ≥ 50% of
// map), and clamps inside map bounds.

import { describe, it, expect } from 'vitest';
import { buildWorldFromLevel } from '../../src/engine/World';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();
const MAP_W = 1280;
const MAP_H = 720;
const MAP_ASPECT = MAP_W / MAP_H;

describe('World.preferredView (auto-zoom)', () => {
  it('returns the full map when nodes fill the map', () => {
    const lv = makeLevel([
      { id: 'a', position: [80, 80],   ownerId: 'p1',  units: 5 },
      { id: 'b', position: [1200, 640], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.preferredView.x).toBeLessThanOrEqual(0 + 1);
    expect(world.preferredView.y).toBeLessThanOrEqual(0 + 1);
    expect(world.preferredView.width).toBeCloseTo(MAP_W, 0);
    expect(world.preferredView.height).toBeCloseTo(MAP_H, 0);
  });

  it('caps zoom at 2× even with a single tight cluster', () => {
    // Three nodes within a 100×100 area.
    const lv = makeLevel([
      { id: 'a', position: [600, 340], ownerId: 'p1',  units: 5 },
      { id: 'b', position: [620, 360], ownerId: 'ai1', units: 5 },
      { id: 'c', position: [640, 380], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.preferredView.width).toBeGreaterThanOrEqual(MAP_W * 0.5 - 1);
    expect(world.preferredView.height).toBeGreaterThanOrEqual(MAP_H * 0.5 - 1);
  });

  it('preserves map aspect ratio (16:9)', () => {
    const lv = makeLevel([
      { id: 'a', position: [200, 200], ownerId: 'p1',  units: 5 },
      { id: 'b', position: [800, 600], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    const aspect = world.preferredView.width / world.preferredView.height;
    expect(aspect).toBeCloseTo(MAP_ASPECT, 2);
  });

  it('view stays inside map bounds', () => {
    const lv = makeLevel([
      { id: 'a', position: [80, 80],   ownerId: 'p1',  units: 5 },
      { id: 'b', position: [120, 100], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.preferredView.x).toBeGreaterThanOrEqual(0);
    expect(world.preferredView.y).toBeGreaterThanOrEqual(0);
    expect(world.preferredView.x + world.preferredView.width).toBeLessThanOrEqual(MAP_W + 1);
    expect(world.preferredView.y + world.preferredView.height).toBeLessThanOrEqual(MAP_H + 1);
  });
});
