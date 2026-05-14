// v2.8.0: liquid-era buffs retired (factions are now pure cosmetic).
// This file pins (a) faction auto-conversion on capture (still a real
// mechanic — preserves the cosmetic identity flip) and (b) per-archetype
// gameplay buffs that replaced the per-faction multipliers.

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

describe('Mage archetype (spellConcoctMultiplier 3.0)', () => {
  it('lab on a mage player concocts in ~one-third the wall-clock time', () => {
    const level = makeLevel([
      { id: 'lab1', position: [200, 200], ownerId: 'p1', units: 60, type: 'lab', level: 1 },
      { id: 'enemy', position: [600, 200], ownerId: 'ai1', units: 20, type: 'barracks', level: 1 },
    ], { humanArchetype: 'mage' });
    const engine = new GameEngine(level, content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;

    // freeze concoctTimeMs = 15000, lab L1 concoctSpeed = 1.0,
    // mage 3× → ready at ~5000 ms.
    const thirdTicks = ticksFor(5100) + 1;
    for (let i = 0; i < thirdTicks; i++) engine.tick();

    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.state).toBe('ready');
  });

  it('infantry (baseline) lab is NOT yet ready at the one-third-time mark', () => {
    const level = makeLevel([
      { id: 'lab1', position: [200, 200], ownerId: 'p1', units: 60, type: 'lab', level: 1 },
      { id: 'enemy', position: [600, 200], ownerId: 'ai1', units: 20, type: 'barracks', level: 1 },
    ]); // default archetype = infantry
    const engine = new GameEngine(level, content);
    engine.startConcoction('lab1', 'freeze');
    const lab = engine.world.nodes.get('lab1')!;

    const thirdTicks = ticksFor(5100) + 1;
    for (let i = 0; i < thirdTicks; i++) engine.tick();

    expect(lab.spellQueue).not.toBeNull();
    expect(lab.spellQueue!.state).toBe('concocting');
    expect(lab.spellQueue!.progress).toBeLessThan(0.5);
  });
});

describe('Cavalry archetype (speedMultiplier 1.4)', () => {
  it('a cavalry-player UnitGroup advances 1.4× faster per tick than infantry', () => {
    const cavLevel = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ], { humanArchetype: 'cavalry' });
    const infLevel = makeLevel([
      { id: 'a', position: [100, 200], ownerId: 'p1', units: 50 },
      { id: 'b', position: [700, 200], ownerId: 'ai1', units: 10 },
    ]);

    const cavEngine = new GameEngine(cavLevel, content);
    const infEngine = new GameEngine(infLevel, content);

    cavEngine.sendUnits(['a'], 'b', 0.5);
    infEngine.sendUnits(['a'], 'b', 0.5);

    // Identical baseSpeed at send-time — the buff is applied per-tick by
    // MovementSystem, not baked into baseSpeed. Tick once and compare
    // pathProgress.
    cavEngine.tick();
    infEngine.tick();

    const cavUg = cavEngine.world.unitGroups[0]!;
    const infUg = infEngine.world.unitGroups[0]!;

    expect(cavUg.pathProgress / infUg.pathProgress).toBeCloseTo(1.4, 2);
  });
});

describe('Faction auto-conversion on capture (§4.5)', () => {
  it('captured node converts to attacker.sourceFaction (cosmetic flip)', () => {
    registerCoreEffects();
    const level = makeLevel([
      { id: 'b', position: [400, 200], ownerId: 'ai1', units: 5, faction: 'azure' },
    ]);
    const world = buildWorldFromLevel(level, content);
    const ug: UnitGroup = {
      id: 'ug1',
      ownerId: 'p1',
      count: 10,
      sourceFaction: 'verdant',
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
    expect(node.faction).toBe('verdant');
  });
});
