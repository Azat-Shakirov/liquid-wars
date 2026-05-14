// v2.7 — GameEngine auto-selects an AI personality from the player's
// faction when the level doesn't specify aiConfigId.
// v2.8.0 — renamed liquid → faction throughout.

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/engine/GameEngine';
import {
  makeContent,
  makeLevel,
  easyAI,
  infantryArch,
  cavalryArch,
  eliteArch,
  mageArch,
  assassinArch,
  azure,
  crimson,
  shadow,
  verdant,
  amethyst,
  barracks,
  tower,
  lab,
  house,
  freezeSpell,
  starveSpell,
  sabotageSpell,
} from '../../fixtures/content';
import type { ContentLibrary } from '../../../src/engine/content/ContentLibrary';
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

describe('AI personality auto-select by faction', () => {
  it('explicit aiConfigId wins over faction-based auto-select', () => {
    const lvl = makeLevel([
      { id: 'p', position: [200, 200], ownerId: 'p1',  units: 5 },
      { id: 'a', position: [800, 200], ownerId: 'ai1', units: 5 },
    ], { aiFaction: 'amethyst' });
    const engine = new GameEngine(lvl, content);
    expect(engine.ais.length).toBe(1);
  });

  it('falls back to faction when aiConfigId is undefined', () => {
    const lvl = stripAIConfigId(makeLevel([
      { id: 'p', position: [200, 200], ownerId: 'p1',  units: 5 },
      { id: 'a', position: [800, 200], ownerId: 'ai1', units: 5 },
    ], { aiFaction: 'crimson' }));
    const engine = new GameEngine(lvl, content);
    expect(engine.ais.length).toBe(1);
  });

  it("throws on a level whose AI faction has no matching personality", () => {
    const lvl = stripAIConfigId(makeLevel([
      { id: 'p', position: [200, 200], ownerId: 'p1',  units: 5 },
      { id: 'a', position: [800, 200], ownerId: 'ai1', units: 5 },
    ], { aiFaction: 'azure' }));
    // Build content directly (bypassing makeContent's defaults) so we can
    // omit the 'azure' personality entry that makeContent always includes
    // — we want to assert that the throw fires when it's missing.
    const trimmed: ContentLibrary = {
      factions: { azure, crimson, shadow, verdant, amethyst },
      nodeTypes: { barracks, tower, lab, house } as ContentLibrary['nodeTypes'],
      spells: { freeze: freezeSpell, starve: starveSpell, sabotage: sabotageSpell },
      archetypes: {
        infantry: infantryArch,
        cavalry: cavalryArch,
        elite: eliteArch,
        mage: mageArch,
        assassin: assassinArch,
      },
      ai: { easy: easyAI },
      levels: {},
    };
    expect(() => new GameEngine(lvl, trimmed)).toThrowError(/unknown personality 'azure'/);
  });
});
