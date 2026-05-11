// Zod schemas — runtime validation of all content JSON at load time (§11).
// "Bad levels fail loud with a clear error, not silently."

import { z } from 'zod';

export const LiquidEffectSchema = z.object({
  type: z.string().min(1),
  value: z.number(),
});

export const LiquidSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string(),
  effects: z.array(LiquidEffectSchema),
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
    type: z.literal('bleed'),
    params: z.object({
      drainPerSecond: z.number().positive(),
    }),
  }),
  z.object({
    type: z.literal('recruit'),
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
  }),
  strategies: z.array(z.string()),
});

const Vec2TupleSchema = z.tuple([z.number(), z.number()]);

export const LevelPlayerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['human', 'ai']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  aiConfigId: z.string().optional(),
});

export const LevelNodeSchema = z.object({
  id: z.string().min(1),
  position: Vec2TupleSchema,
  ownerId: z.string().nullable(),
  nodeType: z.enum(['house', 'barracks', 'lab', 'tower']),
  level: z.number().int().positive(),
  liquidType: z.string().min(1),
  units: z.number().nonnegative(),
});

export const WallSchema = z.object({
  id: z.string().min(1),
  points: z.array(Vec2TupleSchema).min(2),
});

export const LevelSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  tutorialKey: z.string().nullable(),
  introducesNodeTypes: z.array(z.string()),
  introducesLiquids: z.array(z.string()),
  map: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    background: z.string(),
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
