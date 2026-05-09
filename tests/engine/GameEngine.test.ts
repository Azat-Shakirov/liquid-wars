// Engine must be runnable headless — no PIXI, no DOM. (§2 hard rule, §17)

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();
const level = makeLevel([
  { id: 'n1', position: [200, 360], ownerId: 'p1', units: 15 },
  { id: 'n2', position: [1080, 360], ownerId: 'ai1', units: 15 },
]);

describe('GameEngine', () => {
  it('starts at tick 0 with status=playing', () => {
    const engine = new GameEngine(level, content);
    expect(engine.world.tick).toBe(0);
    expect(engine.world.elapsedMs).toBe(0);
    expect(engine.world.status).toBe('playing');
  });

  it('advances tick and elapsedMs by exactly TICK_MS each tick', () => {
    const engine = new GameEngine(level, content);
    for (let i = 1; i <= 60; i++) {
      engine.tick();
      expect(engine.world.tick).toBe(i);
      expect(engine.world.elapsedMs).toBeCloseTo(i * TICK_MS, 6);
    }
  });

  it('produces deterministic RNG output for a given seed', () => {
    const a = new GameEngine(level, content, 42);
    const b = new GameEngine(level, content, 42);
    const c = new GameEngine(level, content, 43);
    const seqA = Array.from({ length: 5 }, () => a.world.rng.next());
    const seqB = Array.from({ length: 5 }, () => b.world.rng.next());
    const seqC = Array.from({ length: 5 }, () => c.world.rng.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('builds nodes from level config with maxUnits from nodeType levels table', () => {
    const engine = new GameEngine(level, content);
    const n1 = engine.world.nodes.get('n1')!;
    expect(n1.units).toBe(15);
    expect(n1.maxUnits).toBe(50); // barracks level 1
    expect(n1.ownerId).toBe('p1');
  });
});
