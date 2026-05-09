// Engine must be runnable headless — no PIXI, no DOM. (§2 hard rule, §17)

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { TICK_MS, type LevelConfig } from '../../src/types';

const LEVEL: LevelConfig = { id: 0, name: 'test', width: 1280, height: 720 };

describe('GameEngine', () => {
  it('starts at tick 0 with status=playing', () => {
    const engine = new GameEngine(LEVEL);
    expect(engine.world.tick).toBe(0);
    expect(engine.world.elapsedMs).toBe(0);
    expect(engine.world.status).toBe('playing');
  });

  it('advances tick and elapsedMs by exactly TICK_MS each tick', () => {
    const engine = new GameEngine(LEVEL);
    for (let i = 1; i <= 60; i++) {
      engine.tick();
      expect(engine.world.tick).toBe(i);
      expect(engine.world.elapsedMs).toBeCloseTo(i * TICK_MS, 6);
    }
  });

  it('produces deterministic RNG output for a given seed', () => {
    const a = new GameEngine(LEVEL, 42);
    const b = new GameEngine(LEVEL, 42);
    const c = new GameEngine(LEVEL, 43);
    const seqA = Array.from({ length: 5 }, () => a.world.rng.next());
    const seqB = Array.from({ length: 5 }, () => b.world.rng.next());
    const seqC = Array.from({ length: 5 }, () => c.world.rng.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});
