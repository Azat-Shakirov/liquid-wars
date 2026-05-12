// Hand-built ContentLibrary fixtures for headless engine tests.
// Avoids depending on Vite's import.meta.glob inside the test environment.

import type {
  AIPersonalityDef,
  ContentLibrary,
  LevelDef,
  LiquidDef,
  NodeTypeDef,
  SpellDef,
} from '../../src/engine/content/ContentLibrary';

export const water: LiquidDef = {
  id: 'water',
  name: 'Water',
  color: '#3da9fc',
  description: '30% production boost.',
  effects: [{ type: 'productionMultiplier', value: 1.3 }],
};

export const blood: LiquidDef = {
  id: 'blood',
  name: 'Blood',
  color: '#a01010',
  description: 'Cheaper captures.',
  effects: [{ type: 'captureCostMultiplier', value: 0.7 }],
};

export const ink: LiquidDef = {
  id: 'ink',
  name: 'Ink',
  color: '#0a0a14',
  description: 'Halves incoming.',
  effects: [{ type: 'incomingDamageMultiplier', value: 0.5 }],
};

export const slime: LiquidDef = {
  id: 'slime',
  name: 'Slime',
  color: '#5cd65c',
  description: 'Faster spell concoction.',
  effects: [{ type: 'spellSpeedMultiplier', value: 2.0 }],
};

export const venom: LiquidDef = {
  id: 'venom',
  name: 'Venom',
  color: '#7a3da9',
  description: 'Faster unit travel.',
  effects: [{ type: 'travelSpeedMultiplier', value: 1.4 }],
};

export const barracks: NodeTypeDef = {
  id: 'barracks',
  shape: 'roundedSquare',
  levels: [
    { level: 1, productionRate: 0.4, maxUnits: 50,  upgradeCostFromHouse: 5 },
    { level: 2, productionRate: 0.8, maxUnits: 75,  upgradeCost: 5 },
    { level: 3, productionRate: 1.2, maxUnits: 100, upgradeCost: 10 },
    { level: 4, productionRate: 1.6, maxUnits: 150, upgradeCost: 20 },
    { level: 5, productionRate: 2.0, maxUnits: 200, upgradeCost: 30 },
  ],
};

export const tower: NodeTypeDef = {
  id: 'tower',
  shape: 'hexagon',
  producesUnits: false,
  sendSpeedPenalty: 0.6,
  levels: [
    { level: 1, attackRate: 0.4, attackRange: 200, attackDamage: 1, defenseRate: 2,   maxUnits: 30,  upgradeCostFromHouse: 10 },
    { level: 2, attackRate: 0.8, attackRange: 220, attackDamage: 1, defenseRate: 3,   maxUnits: 50,  upgradeCost: 10 },
    { level: 3, attackRate: 1.2, attackRange: 240, attackDamage: 2, defenseRate: 4,   maxUnits: 75,  upgradeCost: 15 },
    { level: 4, attackRate: 1.6, attackRange: 260, attackDamage: 2, defenseRate: 5,   maxUnits: 100, upgradeCost: 20 },
    { level: 5, attackRate: 2.0, attackRange: 300, attackDamage: 3, defenseRate: 5.5, maxUnits: 150, upgradeCost: 25 },
  ],
};

export const lab: NodeTypeDef = {
  id: 'lab',
  shape: 'triangle',
  producesUnits: false,
  levels: [
    { level: 1, concoctSpeed: 1.0, unlockedSpells: ['freeze'], maxUnits: 60, upgradeCostFromHouse: 10 },
    { level: 2, concoctSpeed: 1.3, unlockedSpells: ['freeze', 'bleed'], maxUnits: 90, upgradeCost: 20 },
    { level: 3, concoctSpeed: 1.6, unlockedSpells: ['freeze', 'bleed', 'recruit'], maxUnits: 120, upgradeCost: 35 },
  ],
};

export const house: NodeTypeDef = {
  id: 'house',
  shape: 'circle',
  upgradeTargets: ['barracks', 'lab', 'tower'],
  levels: [
    { level: 1, productionRate: 0.2, maxUnits: 20 },
  ],
};

export const freezeSpell: SpellDef = {
  id: 'freeze',
  name: 'Freeze',
  concoctTimeMs: 15000,
  unitCost: 25,
  minLabLevel: 1,
  effect: { type: 'freeze' },
};

export const bleedSpell: SpellDef = {
  id: 'bleed',
  name: 'Bleed',
  concoctTimeMs: 15000,
  unitCost: 35,
  minLabLevel: 2,
  effect: { type: 'bleed', params: { drainPerSecond: 1 } },
};

export const recruitSpell: SpellDef = {
  id: 'recruit',
  name: 'Recruit',
  concoctTimeMs: 15000,
  unitCost: 50,
  minLabLevel: 3,
  effect: { type: 'recruit' },
};

export const easyAI: AIPersonalityDef = {
  id: 'easy',
  decisionIntervalMs: 2500,
  weights: { aggression: 0.4, defense: 0.3, economy: 0.5, spellUse: 0 },
  thresholds: { minSourceUnits: 12, attackRatio: 1.0, upgradeUnitsReserve: 30 },
  strategies: ['DumbStrategy'],
};

// v2.7 — fixture personalities mirror content/ai/*.json so tests that
// construct levels WITHOUT aiConfigId can auto-select by liquid.
export const waterAI: AIPersonalityDef = {
  id: 'water',
  decisionIntervalMs: 2500,
  weights: { aggression: 0.5, defense: 0.4, economy: 0.6, spellUse: 0 },
  thresholds: { minSourceUnits: 12, attackRatio: 1.0, upgradeUnitsReserve: 30 },
  strategies: ['UpgradeStrategy', 'DumbStrategy'],
};

export const inkAI: AIPersonalityDef = {
  id: 'ink',
  decisionIntervalMs: 3000,
  weights: { aggression: 0.3, defense: 0.9, economy: 0.7, spellUse: 0 },
  thresholds: { minSourceUnits: 20, attackRatio: 1.5, upgradeUnitsReserve: 35 },
  strategies: ['UpgradeStrategy', 'DumbStrategy'],
};

export const slimeAI: AIPersonalityDef = {
  id: 'slime',
  decisionIntervalMs: 2000,
  weights: { aggression: 0.4, defense: 0.3, economy: 0.6, spellUse: 0.9 },
  thresholds: { minSourceUnits: 12, attackRatio: 1.0, upgradeUnitsReserve: 30, maxOwnedNodes: 4 },
  strategies: ['SpellCastStrategy', 'ConcoctStrategy', 'UpgradeStrategy', 'DumbStrategy'],
};

export const bloodAI: AIPersonalityDef = {
  id: 'blood',
  decisionIntervalMs: 2000,
  weights: { aggression: 0.9, defense: 0.2, economy: 0.4, spellUse: 0 },
  thresholds: { minSourceUnits: 8, attackRatio: 0.9, upgradeUnitsReserve: 25 },
  strategies: ['DumbStrategy', 'UpgradeStrategy'],
};

export const venomAI: AIPersonalityDef = {
  id: 'venom',
  decisionIntervalMs: 1500,
  weights: { aggression: 0.8, defense: 0.2, economy: 0.4, spellUse: 0 },
  thresholds: { minSourceUnits: 10, attackRatio: 1.0, upgradeUnitsReserve: 25 },
  strategies: ['VultureStrategy', 'UpgradeStrategy', 'DumbStrategy'],
};

export function makeContent(overrides: Partial<ContentLibrary> = {}): ContentLibrary {
  return {
    liquids: { water, blood, ink, slime, venom, ...(overrides.liquids ?? {}) },
    nodeTypes: { barracks, tower, lab, house, ...(overrides.nodeTypes ?? {}) } as ContentLibrary['nodeTypes'],
    spells: { freeze: freezeSpell, bleed: bleedSpell, recruit: recruitSpell, ...(overrides.spells ?? {}) },
    ai: {
      easy: easyAI,
      water: waterAI,
      ink: inkAI,
      slime: slimeAI,
      blood: bloodAI,
      venom: venomAI,
      ...(overrides.ai ?? {}),
    },
    levels: { ...(overrides.levels ?? {}) },
  };
}

export interface NodeSeed {
  id: string;
  position: [number, number];
  ownerId: string | null;
  level?: number;
  liquid?: string;
  units: number;
  type?: 'barracks' | 'tower' | 'lab' | 'house';
}

export function makeLevel(nodeSeeds: NodeSeed[], opts: {
  id?: number;
  width?: number;
  height?: number;
  humanId?: string;
  aiId?: string;
  humanLiquid?: string;
  aiLiquid?: string;
} = {}): LevelDef {
  const humanId = opts.humanId ?? 'p1';
  const aiId = opts.aiId ?? 'ai1';
  const humanLiquid = opts.humanLiquid ?? 'water';
  const aiLiquid = opts.aiLiquid ?? 'water';
  return {
    id: opts.id ?? 1,
    name: 'fixture',
    tutorialKey: null,
    introducesNodeTypes: [],
    introducesLiquids: [],
    map: { width: opts.width ?? 1280, height: opts.height ?? 720, background: 'stone' },
    terrain: { walls: [] },
    players: [
      { id: humanId, type: 'human', color: '#3da9fc', liquid: humanLiquid },
      { id: aiId, type: 'ai', color: '#e63946', liquid: aiLiquid, aiConfigId: 'easy' },
    ],
    nodes: nodeSeeds.map((n) => ({
      id: n.id,
      position: n.position,
      ownerId: n.ownerId,
      nodeType: n.type ?? 'barracks',
      level: n.level ?? 1,
      liquidType: n.liquid ?? 'water',
      units: n.units,
    })),
    winCondition: { type: 'controlAll' },
    starThresholds: { time: [120000, 90000, 60000], units: [50, 30, 15] },
  };
}
