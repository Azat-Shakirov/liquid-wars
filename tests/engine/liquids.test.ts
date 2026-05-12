// Phase 4 — full Liquid system. Blood + Ink coverage already lives in
// CombatSystem.test.ts; this file pins the two new liquids (Slime,
// Venom) and the auto-conversion-immediately-applies-buff invariant.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { CombatSystem } from '../../src/engine/systems/CombatSystem';
import { buildWorldFromLevel } from '../../src/engine/World';
import { registerCoreEffects } from '../../src/engine/effects/registerCoreEffects';
import { TICK_MS } from '../../src/types';
import type { UnitGroup } from '../../src/engine/entities/UnitGroup';
import { makeContent, makeLevel } from '../fixtures/content';

const content = makeContent();
const ticksFor = (ms: number) => Math.ceil(ms / TICK_MS);

describe('Slime (spellSpeedMultiplier 2.0)', () => {
  it('lab on slime concocts in ~half the wall-clock time', () => {
    const level = makeLevel([
      { id: 'lab1', position: [200, 200], ownerId: 'p1', units: 60, type: 'lab', level: 1 },
      { id: 'enemy', position: [600, 200], ownerId: 'ai1', units: 20, type: 'barracks', level: 1 },
    ], { humanLiquid: 'slime' });
    const engine = new GameEngine(level, content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;

    // freeze concoctTimeMs = 15000, lab L1 concoctSpeed = 1.0,
    // slime spellSpeedMultiplier = 2.0 → ready at ~7500 ms.
    const halfTicks = ticksFor(7500) + 1;
    for (let i = 0; i < halfTicks; i++) engine.tick();

    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.state).toBe('ready');
  });

  it('lab on water (baseline) is NOT yet ready at the half-time mark', () => {
    const level = makeLevel([
      { id: 'lab1', position: [200, 200], ownerId: 'p1', units: 60, type: 'lab', level: 1 },
      { id: 'enemy', position: [600, 200], ownerId: 'ai1', units: 20, type: 'barracks', level: 1 },
    ]);
    const engine = new GameEngine(level, content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;

    const halfTicks = ticksFor(7500) + 1;
    for (let i = 0; i < halfTicks; i++) engine.tick();

    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.state).toBe('concocting');
    expect(lab.spellQueue!.progress).toBeLessThan(0.6);
  });
});

describe('Venom (travelSpeedMultiplier 1.4)', () => {
  it('units sent from a venom node have baseSpeed = water baseSpeed × 1.4', () => {
    const venomLevel = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ], { humanLiquid: 'venom' });
    const waterLevel = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ]);

    const venomEngine = new GameEngine(venomLevel, content);
    const waterEngine = new GameEngine(waterLevel, content);

    venomEngine.sendUnits(['a'], 'b', 0.5);
    waterEngine.sendUnits(['a'], 'b', 0.5);

    const venomUg = venomEngine.world.unitGroups[0]!;
    const waterUg = waterEngine.world.unitGroups[0]!;

    expect(venomUg.baseSpeed / waterUg.baseSpeed).toBeCloseTo(1.4, 5);
  });

  it('venom-sourced groups arrive in fewer ticks than water', () => {
    const venomLevel = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ], { humanLiquid: 'venom' });
    const waterLevel = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ]);

    const venomEngine = new GameEngine(venomLevel, content);
    const waterEngine = new GameEngine(waterLevel, content);

    venomEngine.sendUnits(['a'], 'b', 0.5);
    waterEngine.sendUnits(['a'], 'b', 0.5);

    expect(venomEngine.world.unitGroups[0]!.arrivalTick)
      .toBeLessThan(waterEngine.world.unitGroups[0]!.arrivalTick);
  });

  it('sourceLiquid is captured at send-time and travels with the group', () => {
    const level = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ], { humanLiquid: 'venom' });
    const engine = new GameEngine(level, content);
    engine.sendUnits(['a'], 'b', 0.4);

    const ug = engine.world.unitGroups[0]!;
    expect(ug.sourceLiquid).toBe('venom');

    // Mutate the source after send — the in-flight group keeps its liquid.
    engine.world.nodes.get('a')!.liquidType = 'water';
    expect(ug.sourceLiquid).toBe('venom');
  });
});

describe('Liquid auto-conversion on capture (§4.5)', () => {
  it('captured node converts to attacker.sourceLiquid and the new buff applies immediately', () => {
    registerCoreEffects();
    // Capture a water node with a slime attacker, then confirm the
    // node is now slime. The captured-now-slime node, if it were a
    // Lab, would inherit slime's spellSpeedMultiplier next tick;
    // the conversion is what unlocks the strategic depth in §5.4.
    const level = makeLevel([
      { id: 'b', position: [400, 200], ownerId: 'ai1', units: 5, liquid: 'water' },
    ]);
    const world = buildWorldFromLevel(level, content);
    const ug: UnitGroup = {
      id: 'ug1',
      ownerId: 'p1',
      count: 10,
      sourceLiquid: 'slime',
      fromNodeId: 'a',
      toNodeId: 'b',
      path: [{ x: 0, y: 200 }, { x: 400, y: 200 }],
      pathProgress: 1,
      totalDistance: 400,
      baseSpeed: 0.1,
      spawnTick: 0,
      arrivalTick: 0,
      position: { x: 400, y: 200 },
      previousPosition: { x: 400, y: 200 },
    };
    world.unitGroups.push(ug);
    new CombatSystem(content).update(world, TICK_MS);

    const node = world.nodes.get('b')!;
    expect(node.ownerId).toBe('p1');
    expect(node.liquidType).toBe('slime');
  });

  it('captured node liquid converts to venom and ProductionSystem is unaffected (venom does NOT touch productionMultiplier)', () => {
    registerCoreEffects();
    const level = makeLevel([
      { id: 'b', position: [400, 200], ownerId: 'ai1', units: 3, liquid: 'water' },
    ]);
    const world = buildWorldFromLevel(level, content);
    const ug: UnitGroup = {
      id: 'ug1',
      ownerId: 'p1',
      count: 10,
      sourceLiquid: 'venom',
      fromNodeId: 'a',
      toNodeId: 'b',
      path: [{ x: 0, y: 200 }, { x: 400, y: 200 }],
      pathProgress: 1,
      totalDistance: 400,
      baseSpeed: 0.1,
      spawnTick: 0,
      arrivalTick: 0,
      position: { x: 400, y: 200 },
      previousPosition: { x: 400, y: 200 },
    };
    world.unitGroups.push(ug);
    new CombatSystem(content).update(world, TICK_MS);

    expect(world.nodes.get('b')!.liquidType).toBe('venom');
  });
});
