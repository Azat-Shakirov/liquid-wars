// v2.7.6 — replaced the v2.7.5 auto-zoom (camera transform that caused
// cursor offset) with a simpler per-level `visualScale` multiplier
// applied directly to node + unit-droplet sizes via metricsForType.
// World coords stay 1:1; sparse levels get bigger visuals.

import { describe, it, expect } from 'vitest';
import { buildWorldFromLevel } from '../../src/engine/World';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();

describe('World.visualScale', () => {
  it('returns 1.0 when nodes span the full map', () => {
    const lv = makeLevel([
      { id: 'a', position: [80, 80],   ownerId: 'p1',  units: 5 },
      { id: 'b', position: [1200, 640], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.visualScale).toBeCloseTo(1.0, 2);
  });

  it('caps scale at 1.5 for very sparse layouts', () => {
    // Three nodes within ~50x50 area (~3% of map).
    const lv = makeLevel([
      { id: 'a', position: [620, 350], ownerId: 'p1',  units: 5 },
      { id: 'b', position: [640, 360], ownerId: 'ai1', units: 5 },
      { id: 'c', position: [660, 370], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.visualScale).toBeCloseTo(1.5, 2);
  });

  it('scales between 1.0 and 1.5 linearly for mid-sparse layouts', () => {
    // bbox is ~50% of map → expect scale ~1.3.
    const lv = makeLevel([
      { id: 'a', position: [320, 180], ownerId: 'p1',  units: 5 },
      { id: 'b', position: [960, 540], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.visualScale).toBeGreaterThan(1.0);
    expect(world.visualScale).toBeLessThan(1.5);
  });

  it('never goes below 1.0 even for hypothetical larger-than-map layouts', () => {
    // bboxFractions clamp at 1.0 → scale floor 1.0.
    const lv = makeLevel([
      { id: 'a', position: [0, 0],     ownerId: 'p1',  units: 5 },
      { id: 'b', position: [1280, 720], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(lv, content);
    expect(world.visualScale).toBeGreaterThanOrEqual(1.0);
    expect(world.visualScale).toBeLessThanOrEqual(1.5);
  });
});
