// ContentLoader — bundles all JSON under /content via Vite's import.meta.glob.
// Validates each file against its Zod schema. Throws a clear, prefixed error
// on the first bad file rather than silently shipping a broken build.

import type {
  AIPersonalityDef,
  ContentLibrary,
  LevelDef,
  LiquidDef,
  NodeTypeDef,
  SpellDef,
} from './ContentLibrary';
import {
  AIPersonalitySchema,
  LevelSchema,
  LiquidSchema,
  NodeTypeSchema,
  SpellSchema,
} from './schemas';
import type { LiquidId, NodeTypeId, SpellId } from '../../types';

interface GlobMap {
  [path: string]: unknown;
}

function loadEach<T>(
  glob: GlobMap,
  parse: (raw: unknown) => T,
  label: string,
): T[] {
  const out: T[] = [];
  for (const [path, raw] of Object.entries(glob)) {
    try {
      out.push(parse(raw));
    } catch (err) {
      throw new Error(`[ContentLoader] failed to validate ${label} at ${path}: ${(err as Error).message}`);
    }
  }
  return out;
}

export function loadContent(): ContentLibrary {
  const liquidsGlob = import.meta.glob('/content/liquids/*.json', { eager: true, import: 'default' }) as GlobMap;
  const nodeTypesGlob = import.meta.glob('/content/nodeTypes/*.json', { eager: true, import: 'default' }) as GlobMap;
  const spellsGlob = import.meta.glob('/content/spells/*.json', { eager: true, import: 'default' }) as GlobMap;
  const aiGlob = import.meta.glob('/content/ai/*.json', { eager: true, import: 'default' }) as GlobMap;
  const levelsGlob = import.meta.glob('/content/levels/*.json', { eager: true, import: 'default' }) as GlobMap;

  const liquids = loadEach<LiquidDef>(liquidsGlob, (r) => LiquidSchema.parse(r), 'liquid');
  const nodeTypes = loadEach<NodeTypeDef>(nodeTypesGlob, (r) => NodeTypeSchema.parse(r) as NodeTypeDef, 'nodeType');
  const spells = loadEach<SpellDef>(spellsGlob, (r) => SpellSchema.parse(r) as SpellDef, 'spell');
  const ai = loadEach<AIPersonalityDef>(aiGlob, (r) => AIPersonalitySchema.parse(r), 'ai');
  const levels = loadEach<LevelDef>(levelsGlob, (r) => LevelSchema.parse(r) as LevelDef, 'level');

  const lib: ContentLibrary = {
    liquids: {},
    nodeTypes: {} as Record<NodeTypeId, NodeTypeDef>,
    spells: {},
    ai: {},
    levels: {},
  };

  for (const l of liquids) lib.liquids[l.id as LiquidId] = l;
  for (const n of nodeTypes) lib.nodeTypes[n.id] = n;
  for (const s of spells) lib.spells[s.id as SpellId] = s;
  for (const a of ai) lib.ai[a.id] = a;
  for (const lv of levels) lib.levels[lv.id] = lv;

  return lib;
}
