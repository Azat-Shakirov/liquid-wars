import { describe, it, expect, beforeEach } from 'vitest';
import { CombatSystem } from '../../src/engine/systems/CombatSystem';
import { buildWorldFromLevel } from '../../src/engine/World';
import { registerCoreEffects } from '../../src/engine/effects/registerCoreEffects';
import { TICK_MS } from '../../src/types';
import type { UnitGroup } from '../../src/engine/entities/UnitGroup';
import { makeContent, makeLevel } from '../fixtures/content';

beforeEach(() => registerCoreEffects());

function ug(over: Partial<UnitGroup>): UnitGroup {
  return {
    id: 'ug1',
    ownerId: 'p1',
    count: 10,
    sourceLiquid: 'water',
    fromNodeId: 'a',
    toNodeId: 'b',
    path: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    pathProgress: 1,
    totalDistance: 100,
    baseSpeed: 0.1,
    spawnTick: 0,
    arrivalTick: 0,
    position: { x: 100, y: 0 },
    previousPosition: { x: 100, y: 0 },
    ...over,
  };
}

describe('CombatSystem', () => {
  it('friendly arrival tops up units; overflow allowed (drains via ProductionSystem)', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'p1', units: 45 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 10 }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    // Per the user spec patch arrivals no longer clamp to maxUnits;
    // ProductionSystem drains the excess at 1 unit/sec.
    expect(world.nodes.get('b')!.units).toBe(55);
    expect(world.unitGroups.length).toBe(0);
  });

  it('hostile arrival reduces defender; if positive defender holds', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', units: 20 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 8 }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    const node = world.nodes.get('b')!;
    expect(node.ownerId).toBe('ai1');
    expect(node.units).toBeCloseTo(12, 5);
  });

  it('hostile arrival flips ownership when defender drops to zero', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 15 }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    const node = world.nodes.get('b')!;
    expect(node.ownerId).toBe('p1');
    expect(node.units).toBeCloseTo(5, 5);
  });

  it('captured node converts liquid to attacker sourceLiquid (§4.5)', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', liquid: 'water', units: 5 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 12, sourceLiquid: 'blood' }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    expect(world.nodes.get('b')!.liquidType).toBe('blood');
  });

  it('blood captureCostMultiplier 0.7 amplifies attack power', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', liquid: 'water', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, content);
    // 8 units of blood vs 10 water → effective attack = 8 / 0.7 ≈ 11.43; defender 10 - 11.43 = -1.43, flips.
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 8, sourceLiquid: 'blood' }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    const node = world.nodes.get('b')!;
    expect(node.ownerId).toBe('p1');
    expect(node.units).toBeCloseTo(1.4286, 3);
  });

  it('ink incomingDamageMultiplier does NOT apply to friendly arrivals', () => {
    // Regression: pre-fix, ink (0.5) was applied to every arrival
    // before the friendly/hostile split, so capturing an ink node
    // halved your own reinforcements. Friendly arrivals must pass
    // through the defender's liquid unmodified — "incomingDamage" is
    // an enemy-side concept.
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'p1', liquid: 'ink', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 12, sourceLiquid: 'water' }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    // 10 + 12 = 22 (full friendly count, NOT 10 + 6).
    expect(world.nodes.get('b')!.units).toBe(22);
  });

  it('ink incomingDamageMultiplier 0.5 halves attacker effectiveness', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', liquid: 'ink', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, content);
    // 12 water vs 10 ink → effective = 12 * 0.5 = 6; defender 10 - 6 = 4, holds.
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 12, sourceLiquid: 'water' }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    const node = world.nodes.get('b')!;
    expect(node.ownerId).toBe('ai1');
    expect(node.units).toBeCloseTo(4, 5);
  });

  it('multiple arrivals same tick resolve in arrivalTick then id order', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', units: 10 },
    ]);
    const world = buildWorldFromLevel(level, content);
    // Two arriving p1 attacks; both at progress 1. Combined 6 + 8 = 14 vs 10 → flips, remainder 4.
    world.unitGroups.push(ug({ id: 'ug2', ownerId: 'p1', toNodeId: 'b', count: 6, arrivalTick: 50 }));
    world.unitGroups.push(ug({ id: 'ug1', ownerId: 'p1', toNodeId: 'b', count: 8, arrivalTick: 50 }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    const node = world.nodes.get('b')!;
    expect(node.ownerId).toBe('p1');
    expect(node.units).toBeCloseTo(4, 5);
  });

  it('frozen target queues arrivals into pendingArrivals (§20 item 10)', () => {
    const content = makeContent();
    const level = makeLevel([
      { id: 'b', position: [100, 0], ownerId: 'ai1', units: 5 },
    ]);
    const world = buildWorldFromLevel(level, content);
    world.nodes.get('b')!.isFrozen = true;
    world.unitGroups.push(ug({ ownerId: 'p1', toNodeId: 'b', count: 10 }));
    const sys = new CombatSystem(content);

    sys.update(world, TICK_MS);

    const node = world.nodes.get('b') as typeof world.nodes extends Map<string, infer N> ? N & { pendingArrivals?: UnitGroup[] } : never;
    expect(node.ownerId).toBe('ai1');
    expect(node.units).toBe(5);
    expect((node as { pendingArrivals?: UnitGroup[] }).pendingArrivals?.length).toBe(1);
    expect(world.unitGroups.length).toBe(0);
  });
});
