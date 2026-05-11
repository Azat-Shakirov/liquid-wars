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
  description: 'Default.',
  effects: [{ type: 'productionMultiplier', value: 1.0 }],
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
  description: 'Reduces incoming.',
  effects: [{ type: 'incomingDamageMultiplier', value: 0.33 }],
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
    { level: 1, attackRate: 0.4, attackRange: 200, attackDamage: 1, defenseRate: 2, maxUnits: 30, upgradeCostFromHouse: 10 },
    { level: 2, attackRate: 0.8, attackRange: 220, attackDamage: 1, defenseRate: 3, maxUnits: 50, upgradeCost: 10 },
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

export function makeContent(overrides: Partial<ContentLibrary> = {}): ContentLibrary {
  return {
    liquids: { water, blood, ink, ...(overrides.liquids ?? {}) },
    nodeTypes: { barracks, tower, lab, house, ...(overrides.nodeTypes ?? {}) } as ContentLibrary['nodeTypes'],
    spells: { freeze: freezeSpell, bleed: bleedSpell, recruit: recruitSpell, ...(overrides.spells ?? {}) },
    ai: { easy: easyAI, ...(overrides.ai ?? {}) },
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
} = {}): LevelDef {
  const humanId = opts.humanId ?? 'p1';
  const aiId = opts.aiId ?? 'ai1';
  return {
    id: opts.id ?? 1,
    name: 'fixture',
    tutorialKey: null,
    introducesNodeTypes: [],
    introducesLiquids: [],
    map: { width: opts.width ?? 1280, height: opts.height ?? 720, background: 'stone' },
    terrain: { walls: [] },
    players: [
      { id: humanId, type: 'human', color: '#3da9fc' },
      { id: aiId, type: 'ai', color: '#e63946', aiConfigId: 'easy' },
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
