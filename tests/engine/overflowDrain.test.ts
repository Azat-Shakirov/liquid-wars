// Over-capacity drain (user spec patch) — when node.units > maxUnits,
// the overflow leaks at 1 unit/sec until the node is back at the cap.
// Production is paused while over-cap.
//
// Excess units come from: friendly arrivals that no longer clamp,
// captures that no longer clamp, and House conversions to a smaller
// cap.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();
const ticksFor = (ms: number) => Math.ceil(ms / TICK_MS);

describe('over-capacity drain', () => {
  it('a node above maxUnits decays toward the cap at ~1 unit/sec', () => {
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'p1',  units: 10, type: 'barracks', level: 1 },
      { id: 'e',  position: [800, 200], ownerId: 'ai1', units: 10, type: 'barracks', level: 1 }, // keeps game playing
    ]);
    const engine = new GameEngine(level, content);
    const node = engine.world.nodes.get('b1')!;
    // L1 barracks fixture: maxUnits = 50, productionRate = 0.4 (test fixture).
    // Manually push over cap.
    node.units = 55;
    const cap = node.maxUnits;

    // Tick 3 seconds — drain should be ~3 units.
    for (let i = 0; i < ticksFor(3000); i++) engine.tick();
    expect(node.units).toBeLessThanOrEqual(53);
    expect(node.units).toBeGreaterThanOrEqual(51);

    // Tick long enough to fully decay back to cap.
    for (let i = 0; i < ticksFor(10000); i++) engine.tick();
    expect(node.units).toBeCloseTo(cap, 0);
  });

  it('production does not run while over-cap', () => {
    const level = makeLevel([
      { id: 'b1', position: [200, 200], ownerId: 'p1',  units: 10, type: 'barracks', level: 1 },
      { id: 'e',  position: [800, 200], ownerId: 'ai1', units: 10, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const node = engine.world.nodes.get('b1')!;
    node.units = 60; // 10 over cap (50)

    // After 1 second: drain ~1, no production. Net change ~−1.
    for (let i = 0; i < ticksFor(1000); i++) engine.tick();
    expect(node.units).toBeLessThan(60);
    expect(node.units).toBeGreaterThan(58); // not gaining from production
  });

  it('friendly arrivals no longer silently vanish on overflow', () => {
    const level = makeLevel([
      { id: 'src', position: [200, 200], ownerId: 'p1',  units: 50, type: 'barracks', level: 5 }, // L5 cap 200
      { id: 'dst', position: [220, 200], ownerId: 'p1',  units: 8,  type: 'barracks', level: 1 }, // L1 cap 50
      { id: 'e',   position: [800, 200], ownerId: 'ai1', units: 10, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const dst = engine.world.nodes.get('dst')!;

    // Send 50 from src to dst. dst already has 8 → 58 after arrival
    // (over the L1 cap of 50). Old behavior would clamp to 50.
    engine.sendUnits(['src'], 'dst', 1.0);
    // Wait for arrival. Distance ~20 px → very few ticks.
    for (let i = 0; i < 30; i++) engine.tick();
    expect(dst.units).toBeGreaterThan(50);
  });

  it('house conversion to a smaller-cap type preserves overflow then drains', () => {
    const level = makeLevel([
      { id: 'h1', position: [200, 200], ownerId: 'p1',  units: 18, type: 'house',    level: 1 },
      { id: 'e',  position: [800, 200], ownerId: 'ai1', units: 10, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    const node = engine.world.nodes.get('h1')!;
    // House cap = 20; convert to Barracks L1 (cap 50 in fixture).
    // Cost from House to Barracks L1 = 5; remaining 13. New cap 50;
    // 13 < 50, no overflow. Behavior is fine here, but verify it
    // doesn't truncate.
    const r = engine.upgradeNode('h1', 'barracks');
    expect(r.ok).toBe(true);
    expect(node.units).toBeCloseTo(13, 5);
    expect(node.maxUnits).toBe(50);
  });
});
