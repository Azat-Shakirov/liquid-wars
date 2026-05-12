// Phase 5 win condition: won when no enemy player owns any node.
// Neutral nodes are terrain, not opponents — they don't block victory.

import { describe, it, expect } from 'vitest';
import { WinConditionSystem } from '../../src/engine/systems/WinConditionSystem';
import { buildWorldFromLevel } from '../../src/engine/World';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

describe('WinConditionSystem', () => {
  it('won when no enemy nodes remain, even with neutrals on the map', () => {
    const level = makeLevel([
      { id: 'p1_a', position: [200, 200], ownerId: 'p1', units: 10 },
      { id: 'p1_b', position: [200, 500], ownerId: 'p1', units: 10 },
      { id: 'neutral', position: [600, 360], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('won');
  });

  it('not yet won when at least one enemy node remains', () => {
    const level = makeLevel([
      { id: 'p1_a', position: [200, 200], ownerId: 'p1', units: 10 },
      { id: 'ai_a', position: [600, 200], ownerId: 'ai1', units: 10 },
      { id: 'neutral', position: [400, 500], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('playing');
  });

  it('lost when player owns 0 nodes and has no in-flight groups', () => {
    const level = makeLevel([
      { id: 'ai_a', position: [600, 200], ownerId: 'ai1', units: 10 },
      { id: 'neutral', position: [200, 200], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, makeContent());
    new WinConditionSystem().update(world, TICK_MS);
    expect(world.status).toBe('lost');
  });
});
