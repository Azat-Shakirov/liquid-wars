// v2.7.2 regression — pins the lab-protection fix. Before the fix,
// Slime's DumbStrategy used the lab as a unit source (largest stockpile)
// and drained it from 50u → 25u in the same decision tick that queued a
// spell, sabotaging concoct. After the fix, spell-using personalities
// never use a lab as a send source.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/engine/GameEngine';
import { TICK_MS } from '../../../src/types';
import { makeContent, makeLevel } from '../../fixtures/content';
import type { LevelDef } from '../../../src/engine/content/ContentLibrary';

const content = makeContent();

function stripAIConfigId(level: LevelDef): LevelDef {
  return {
    ...level,
    players: level.players.map((p) => {
      const { aiConfigId: _, ...rest } = p;
      return rest;
    }),
  };
}

describe('Slime AI lab protection (v2.7.2)', () => {
  it('lab retains its units across the concoct → ready → cast cycle', () => {
    const level = stripAIConfigId(makeLevel([
      { id: 'p_b',   position: [50, 50],    ownerId: 'p1',  units: 10, type: 'barracks', level: 1 },
      { id: 'a_b',   position: [800, 200],  ownerId: 'ai1', units: 14, type: 'barracks', level: 2 },
      { id: 'a_lab', position: [800, 400],  ownerId: 'ai1', units: 50, type: 'lab',      level: 2 },
      { id: 'a_b2',  position: [900, 200],  ownerId: 'ai1', units: 8,  type: 'barracks', level: 1 },
    ], { aiLiquid: 'slime' }));
    const engine = new GameEngine(level, content);

    const ticksFor30s = Math.ceil(30000 / TICK_MS);
    let sawConcocting = false;
    let sawReady = false;
    let labUnitsDuringConcoct: number[] = [];

    for (let i = 0; i < ticksFor30s; i++) {
      engine.tick();
      const lab = engine.world.nodes.get('a_lab');
      if (!lab) break;
      if (lab.spellQueue?.state === 'concocting') {
        sawConcocting = true;
        labUnitsDuringConcoct.push(lab.units);
      }
      if (lab.spellQueue?.state === 'ready') sawReady = true;
    }

    expect(sawConcocting).toBe(true);
    expect(sawReady).toBe(true);
    // Pre-fix: lab dropped to 25u (drained as a send source) immediately
    // after queuing concoct. Post-fix: lab holds its initial 50u for the
    // entire concoction window (no production at labs, no draining).
    const minLabUnitsDuringConcoct = Math.min(...labUnitsDuringConcoct);
    expect(minLabUnitsDuringConcoct).toBeGreaterThanOrEqual(50);
  });
});
