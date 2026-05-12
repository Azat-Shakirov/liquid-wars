// Integration: every level in content/levels/ must parse the schema
// AND instantiate the engine without throwing. Catches stale node
// positions on walls, missing liquids, undefined node types, etc.
//
// This test was added after Issue 3 (L19 Citadel had two nodes sitting
// exactly on horizontal walls and failed at engine boot).

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { LevelSchema } from '../../src/engine/content/schemas';
import { makeContent } from '../fixtures/content';
import type { LevelDef } from '../../src/engine/content/ContentLibrary';

const levelModules = import.meta.glob('../../content/levels/*.json', {
  eager: true,
  import: 'default',
});

describe('all levels load cleanly', () => {
  const entries = Object.entries(levelModules).sort(([a], [b]) => a.localeCompare(b));
  for (const [path, raw] of entries) {
    const file = path.split('/').pop()!;
    it(`${file}: schema parses + engine accepts`, () => {
      const parsed = LevelSchema.parse(raw) as LevelDef;
      const content = makeContent();
      expect(() => new GameEngine(parsed, content)).not.toThrow();
    });
  }
});
