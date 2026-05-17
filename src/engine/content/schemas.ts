// Zod schemas — runtime validation of all content JSON at load time (§11).
// "Bad levels fail loud with a clear error, not silently."
//
// v2.8.0: renamed Liquid* → Faction*; player.liquid → player.faction;
// node.liquidType → node.faction; introducesLiquids → introducesFactions.
// Spell effects: 'bleed' → 'starve', 'recruit' → 'sabotage'.

import { z } from 'zod';

export const FactionEffectSchema = z.object({
  type: z.string().min(1),
  value: z.number(),
});

export const FactionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string(),
  effects: z.array(FactionEffectSchema),
});

export const NodeTypeLevelSchema = z.object({
  level: z.number().int().positive(),
  productionRate: z.number().nonnegative().optional(),
  maxUnits: z.number().positive(),
  upgradeCost: z.number().nonnegative().optional(),
  upgradeCostFromHouse: z.number().nonnegative().optional(),
  attackRate: z.number().nonnegative().optional(),
  attackRange: z.number().nonnegative().optional(),
  attackDamage: z.number().nonnegative().optional(),
  defenseRate: z.number().nonnegative().optional(),
  concoctSpeed: z.number().nonnegative().optional(),
  unlockedSpells: z.array(z.string()).optional(),
});

export const NodeTypeSchema = z.object({
  id: z.enum(['house', 'barracks', 'lab', 'tower']),
  shape: z.string().min(1),
  levels: z.array(NodeTypeLevelSchema).min(1),
  sendSpeedPenalty: z.number().positive().optional(),
  producesUnits: z.boolean().optional(),
  upgradeTargets: z.array(z.enum(['house', 'barracks', 'lab', 'tower'])).optional(),
});

export const SpellEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('freeze'),
    params: z.object({}).optional(),
  }),
  z.object({
    type: z.literal('starve'),
    params: z.object({
      drainPerSecond: z.number().positive(),
    }),
  }),
  z.object({
    type: z.literal('sabotage'),
    params: z.object({}).optional(),
  }),
]);

export const SpellSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  concoctTimeMs: z.number().positive(),
  unitCost: z.number().positive(),
  minLabLevel: z.number().int().positive(),
  effect: SpellEffectSchema,
});

export const ArchetypeBuffSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('productionMultiplier'),
    value: z.number().positive(),
  }),
  z.object({
    type: z.literal('speedMultiplier'),
    value: z.number().positive(),
  }),
  z.object({
    type: z.literal('incomingDamageMultiplier'),
    value: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('spellConcoctMultiplier'),
    value: z.number().positive(),
  }),
  z.object({
    type: z.literal('captureCostMultiplier'),
    value: z.number().positive(),
  }),
]);

export const ArchetypeSchema = z.object({
  id: z.enum(['infantry', 'cavalry', 'knight', 'mage', 'archer']),
  name: z.string().min(1),
  description: z.string(),
  buff: ArchetypeBuffSchema,
});

export const AIPersonalitySchema = z.object({
  id: z.string().min(1),
  decisionIntervalMs: z.number().positive(),
  weights: z.object({
    aggression: z.number(),
    defense: z.number(),
    economy: z.number(),
    spellUse: z.number(),
  }),
  thresholds: z.object({
    minSourceUnits: z.number(),
    attackRatio: z.number(),
    upgradeUnitsReserve: z.number(),
    // Optional expansion cap (v2.7.1). When set, DumbStrategy and
    // VultureStrategy return null once the AI owns ≥ this many nodes,
    // so the AI focuses on development/spells instead of sprawling.
    // Slime's signature behavior (cap around lab + a few barracks).
    maxOwnedNodes: z.number().int().positive().optional(),
  }),
  strategies: z.array(z.string()),
});

const Vec2TupleSchema = z.tuple([z.number(), z.number()]);

export const LevelPlayerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['human', 'ai']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  // v2.8.0 — each player owns ONE faction (cosmetic team color/banner).
  // All of their owned nodes inherit it at level load; captures auto-
  // convert to the new owner's faction. Factions cannot mix across
  // players. Required. Renamed from `liquid` (pre-v2.8.0).
  faction: z.string().min(1),
  // v2.8.0 — gameplay-relevant unit class. Determines the player's unit
  // sprite + a single buff (defined in content/archetypes/<id>.json).
  // Required as of v2.8.0.
  archetype: z.enum(['infantry', 'cavalry', 'knight', 'mage', 'archer']),
  aiConfigId: z.string().optional(),
});

export const LevelNodeSchema = z.object({
  id: z.string().min(1),
  position: Vec2TupleSchema,
  ownerId: z.string().nullable(),
  nodeType: z.enum(['house', 'barracks', 'lab', 'tower']),
  level: z.number().int().positive(),
  // v2.8.0 — renamed from `liquidType`. Cosmetic faction color of this
  // node. For owned nodes it matches the owner's faction at level load;
  // neutrals keep the JSON-declared faction.
  faction: z.string().min(1),
  units: z.number().nonnegative(),
});

export const WallSchema = z.object({
  id: z.string().min(1),
  points: z.array(Vec2TupleSchema).min(2),
});

export const TutorialSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export const LevelSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  tutorialKey: z.string().nullable(),
  // Optional one-shot modal shown when the level loads. Engine pauses
  // until dismissed. Phase 5 introduction-of-mechanics levels set this.
  tutorial: TutorialSchema.nullable().optional(),
  // Optional persistent banner shown across the top of the game view.
  // Plain string — purely cosmetic, no engine semantics.
  objective: z.string().nullable().optional(),
  // v2.8.0 challenge-tier (L31+): if true, LevelSelect's faction picker
  // overrides the designer-set player.faction. Renamed from
  // `letPlayerChooseLiquid` pre-v2.8.0.
  letPlayerChooseFaction: z.boolean().optional(),
  // v2.8.0 (deferred to v1.1 UI): if true, LevelSelect lets the player
  // pick the archetype. Designer-locked otherwise (the JSON's archetype
  // field always wins for MVP).
  letPlayerChooseArchetype: z.boolean().optional(),
  introducesNodeTypes: z.array(z.string()),
  // v2.8.0 — renamed from introducesLiquids.
  introducesFactions: z.array(z.string()),
  map: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    // v2.8.0 — typed biome enum (was free-form string).
    background: z.enum(['grass', 'desert', 'snow', 'jungle', 'stone']),
  }),
  terrain: z.object({
    walls: z.array(WallSchema),
  }),
  players: z.array(LevelPlayerSchema).min(1),
  nodes: z.array(LevelNodeSchema).min(1),
  winCondition: z.object({
    type: z.enum(['controlAll', 'surviveTimeMs', 'captureSpecific', 'eliminate']),
    value: z.unknown().optional(),
  }),
  starThresholds: z.object({
    time: z.tuple([z.number(), z.number(), z.number()]),
    units: z.tuple([z.number(), z.number(), z.number()]),
  }),
});
