import { describe, it, expect, beforeEach } from 'vitest';
import { ProductionSystem } from '../../src/engine/systems/ProductionSystem';
import { buildWorldFromLevel } from '../../src/engine/World';
import { registerCoreEffects } from '../../src/engine/effects/registerCoreEffects';
import { TICK_MS } from '../../src/types';
import { makeContent, makeLevel } from '../fixtures/content';

beforeEach(() => registerCoreEffects());

describe('ProductionSystem', () => {
  it('grows owned barracks at productionRate * dt', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'n1', position: [200, 360], ownerId: 'p1', units: 0 },
    ]);
    const world = buildWorldFromLevel(level, content);
    const sys = new ProductionSystem(content);

    // v2.8.0: barracks lvl 1 base rate = 0.4 u/s. Infantry archetype
    // (default in fixtures) multiplies by 1.10 → 0.44 u/s.
    // (Was 0.52 under the v2.7 Water-faction 1.3× liquid model.)
    for (let i = 0; i < 60; i++) sys.update(world, TICK_MS);

    const n = world.nodes.get('n1')!;
    expect(n.units).toBeCloseTo(0.44, 5);
  });

  it('caps units at maxUnits', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'n1', position: [200, 360], ownerId: 'p1', level: 1, units: 49.9 },
    ]);
    const world = buildWorldFromLevel(level, content);
    const sys = new ProductionSystem(content);

    for (let i = 0; i < 600; i++) sys.update(world, TICK_MS);

    const n = world.nodes.get('n1')!;
    expect(n.units).toBe(50); // barracks lvl 1 maxUnits = 50
  });

  it('does not produce on neutral nodes', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'n1', position: [200, 360], ownerId: null, units: 5 },
    ]);
    const world = buildWorldFromLevel(level, content);
    const sys = new ProductionSystem(content);

    for (let i = 0; i < 600; i++) sys.update(world, TICK_MS);

    expect(world.nodes.get('n1')!.units).toBe(5);
  });

  it('does not produce on frozen nodes', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'n1', position: [200, 360], ownerId: 'p1', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.nodes.get('n1')!.isFrozen = true;
    const sys = new ProductionSystem(content);

    for (let i = 0; i < 600; i++) sys.update(world, TICK_MS);

    expect(world.nodes.get('n1')!.units).toBe(10);
  });
});
