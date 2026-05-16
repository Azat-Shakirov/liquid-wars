// Hand-built ContentLibrary fixtures for headless engine tests.
// Avoids depending on Vite's import.meta.glob inside the test environment.
//
// v2.8.0: renamed Liquid* → Faction*; bleed → starve; recruit → sabotage.
// Fixture factions are COSMETIC (effects[] empty) per v2.8.0 model.
// Archetypes added with their gameplay buffs.

import type {
  AIPersonalityDef,
  ArchetypeDef,
  ContentLibrary,
  FactionDef,
  LevelDef,
  NodeTypeDef,
  SpellDef,
} from '../../src/engine/content/ContentLibrary';

export const azure: FactionDef = {
  id: 'azure',
  name: 'Azure',
  color: '#3da9fc',
  description: 'Knights of the azure banner.',
  effects: [],
};

export const crimson: FactionDef = {
  id: 'crimson',
  name: 'Crimson',
  color: '#a01010',
  description: 'Knights of the crimson banner.',
  effects: [],
};

export const shadow: FactionDef = {
  id: 'shadow',
  name: 'Shadow',
  color: '#0a0a14',
  description: 'Knights of the shadow banner.',
  effects: [],
};

export const verdant: FactionDef = {
  id: 'verdant',
  name: 'Verdant',
  color: '#5cd65c',
  description: 'Knights of the verdant banner.',
  effects: [],
};

export const amethyst: FactionDef = {
  id: 'amethyst',
  name: 'Amethyst',
  color: '#7a3da9',
  description: 'Knights of the amethyst banner.',
  effects: [],
};

export const neutral: FactionDef = {
  id: 'neutral',
  name: 'Neutral',
  color: '#8a8a8a',
  description: 'Unclaimed holdings. Captured nodes adopt the new owner\'s banner.',
  effects: [],
};

export const infantryArch: ArchetypeDef = {
  id: 'infantry',
  name: 'Infantry',
  description: '+10% production',
  buff: { type: 'productionMultiplier', value: 1.1 },
};

export const cavalryArch: ArchetypeDef = {
  id: 'cavalry',
  name: 'Cavalry',
  description: '+40% travel speed',
  buff: { type: 'speedMultiplier', value: 1.4 },
};

export const knightArch: ArchetypeDef = {
  id: 'knight',
  name: 'Knight',
  description: '0.3x incoming damage',
  buff: { type: 'incomingDamageMultiplier', value: 0.3 },
};

export const mageArch: ArchetypeDef = {
  id: 'mage',
  name: 'Mage',
  description: '3x spell concoct speed',
  buff: { type: 'spellConcoctMultiplier', value: 3.0 },
};

export const archerArch: ArchetypeDef = {
  id: 'archer',
  name: 'Archer',
  description: '0.4x capture cost',
  buff: { type: 'captureCostMultiplier', value: 0.4 },
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
    { level: 2, concoctSpeed: 1.3, unlockedSpells: ['freeze', 'starve'], maxUnits: 90, upgradeCost: 20 },
    { level: 3, concoctSpeed: 1.6, unlockedSpells: ['freeze', 'starve', 'sabotage'], maxUnits: 120, upgradeCost: 35 },
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

export const starveSpell: SpellDef = {
  id: 'starve',
  name: 'Starve',
  concoctTimeMs: 15000,
  unitCost: 35,
  minLabLevel: 2,
  effect: { type: 'starve', params: { drainPerSecond: 1 } },
};

export const sabotageSpell: SpellDef = {
  id: 'sabotage',
  name: 'Sabotage',
  concoctTimeMs: 15000,
  unitCost: 50,
  minLabLevel: 3,
  effect: { type: 'sabotage' },
};

export const easyAI: AIPersonalityDef = {
  id: 'easy',
  decisionIntervalMs: 2500,
  weights: { aggression: 0.4, defense: 0.3, economy: 0.5, spellUse: 0 },
  thresholds: { minSourceUnits: 12, attackRatio: 1.0, upgradeUnitsReserve: 30 },
  strategies: ['DumbStrategy'],
};

// v2.7 — fixture personalities mirror content/ai/*.json so tests that
// construct levels WITHOUT aiConfigId can auto-select by faction.
export const azureAI: AIPersonalityDef = {
  id: 'azure',
  decisionIntervalMs: 2500,
  weights: { aggression: 0.5, defense: 0.4, economy: 0.6, spellUse: 0 },
  thresholds: { minSourceUnits: 12, attackRatio: 1.0, upgradeUnitsReserve: 30 },
  strategies: ['UpgradeStrategy', 'DumbStrategy'],
};

export const shadowAI: AIPersonalityDef = {
  id: 'shadow',
  decisionIntervalMs: 3000,
  weights: { aggression: 0.3, defense: 0.9, economy: 0.7, spellUse: 0 },
  thresholds: { minSourceUnits: 20, attackRatio: 1.5, upgradeUnitsReserve: 35 },
  strategies: ['UpgradeStrategy', 'DumbStrategy'],
};

export const verdantAI: AIPersonalityDef = {
  id: 'verdant',
  decisionIntervalMs: 2000,
  weights: { aggression: 0.4, defense: 0.3, economy: 0.6, spellUse: 0.9 },
  thresholds: { minSourceUnits: 12, attackRatio: 1.0, upgradeUnitsReserve: 30, maxOwnedNodes: 4 },
  strategies: ['SpellCastStrategy', 'ConcoctStrategy', 'UpgradeStrategy', 'DumbStrategy'],
};

export const crimsonAI: AIPersonalityDef = {
  id: 'crimson',
  decisionIntervalMs: 2000,
  weights: { aggression: 0.9, defense: 0.2, economy: 0.4, spellUse: 0 },
  thresholds: { minSourceUnits: 8, attackRatio: 0.9, upgradeUnitsReserve: 25 },
  strategies: ['DumbStrategy', 'UpgradeStrategy'],
};

export const amethystAI: AIPersonalityDef = {
  id: 'amethyst',
  decisionIntervalMs: 1500,
  weights: { aggression: 0.8, defense: 0.2, economy: 0.4, spellUse: 0 },
  thresholds: { minSourceUnits: 10, attackRatio: 1.0, upgradeUnitsReserve: 25 },
  strategies: ['VultureStrategy', 'UpgradeStrategy', 'DumbStrategy'],
};

export function makeContent(overrides: Partial<ContentLibrary> = {}): ContentLibrary {
  return {
    factions: { azure, crimson, shadow, verdant, amethyst, neutral, ...(overrides.factions ?? {}) },
    nodeTypes: { barracks, tower, lab, house, ...(overrides.nodeTypes ?? {}) } as ContentLibrary['nodeTypes'],
    spells: { freeze: freezeSpell, starve: starveSpell, sabotage: sabotageSpell, ...(overrides.spells ?? {}) },
    archetypes: {
      infantry: infantryArch,
      cavalry: cavalryArch,
      knight: knightArch,
      mage: mageArch,
      archer: archerArch,
      ...(overrides.archetypes ?? {}),
    },
    ai: {
      easy: easyAI,
      azure: azureAI,
      shadow: shadowAI,
      verdant: verdantAI,
      crimson: crimsonAI,
      amethyst: amethystAI,
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
  faction?: string;
  units: number;
  type?: 'barracks' | 'tower' | 'lab' | 'house';
}

export function makeLevel(nodeSeeds: NodeSeed[], opts: {
  id?: number;
  width?: number;
  height?: number;
  humanId?: string;
  aiId?: string;
  humanFaction?: string;
  aiFaction?: string;
  humanArchetype?: 'infantry' | 'cavalry' | 'knight' | 'mage' | 'archer';
  aiArchetype?: 'infantry' | 'cavalry' | 'knight' | 'mage' | 'archer';
} = {}): LevelDef {
  const humanId = opts.humanId ?? 'p1';
  const aiId = opts.aiId ?? 'ai1';
  const humanFaction = opts.humanFaction ?? 'azure';
  const aiFaction = opts.aiFaction ?? 'azure';
  const humanArchetype = opts.humanArchetype ?? 'infantry';
  const aiArchetype = opts.aiArchetype ?? 'infantry';
  return {
    id: opts.id ?? 1,
    name: 'fixture',
    tutorialKey: null,
    introducesNodeTypes: [],
    introducesFactions: [],
    map: { width: opts.width ?? 1280, height: opts.height ?? 720, background: 'stone' },
    terrain: { walls: [] },
    players: [
      { id: humanId, type: 'human', color: '#3da9fc', faction: humanFaction, archetype: humanArchetype },
      { id: aiId, type: 'ai', color: '#e63946', faction: aiFaction, archetype: aiArchetype, aiConfigId: 'easy' },
    ],
    nodes: nodeSeeds.map((n) => ({
      id: n.id,
      position: n.position,
      ownerId: n.ownerId,
      nodeType: n.type ?? 'barracks',
      level: n.level ?? 1,
      faction: n.faction ?? 'azure',
      units: n.units,
    })),
    winCondition: { type: 'controlAll' },
    starThresholds: { time: [120000, 90000, 60000], units: [50, 30, 15] },
  };
}
