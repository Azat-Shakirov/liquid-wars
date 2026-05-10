// ContentLibrary — typed shape of all loaded JSON content. Engine code reads
// from this struct; the loader builds it from disk via Vite import.meta.glob.

import type { LiquidId, NodeTypeId, PlayerId, SpellId, Vec2 } from '../../types';

export interface LiquidEffect {
  type: string;
  value: number;
}

export interface LiquidDef {
  id: LiquidId;
  name: string;
  color: string;
  description: string;
  effects: LiquidEffect[];
}

export interface NodeTypeLevel {
  level: number;
  // Production-capable types (Barracks, House) set this. Lab/Tower omit.
  productionRate?: number; // units per second
  maxUnits: number;
  // Within-type upgrade cost (in units, paid from the node) to reach
  // THIS level from the level below.
  upgradeCost?: number;
  // Cost to upgrade a House INTO this type at level 1.
  upgradeCostFromHouse?: number;
  // Tower-specific level fields.
  attackRate?: number;
  attackRange?: number;
  attackDamage?: number;
  // Lab-specific level fields.
  concoctSpeed?: number;
  unlockedSpells?: string[];
}

export interface NodeTypeDef {
  id: NodeTypeId;
  shape: string;
  levels: NodeTypeLevel[];
  // Tower-specific.
  sendSpeedPenalty?: number;
  producesUnits?: boolean;
  // House-specific — which types it can be upgraded into.
  upgradeTargets?: NodeTypeId[];
}

export type SpellEffectDef =
  | { type: 'freeze'; params: { durationMs: number } }
  | { type: 'poison'; params: { drainPerSecond: number; durationMs: number } }
  | { type: 'recruit'; params?: Record<string, never> };

export interface SpellDef {
  id: SpellId;
  name: string;
  concoctTimeMs: number;
  unitCost: number;
  minLabLevel: number;
  effect: SpellEffectDef;
}

export interface AIPersonalityDef {
  id: string;
  decisionIntervalMs: number;
  weights: {
    aggression: number;
    defense: number;
    economy: number;
    spellUse: number;
  };
  thresholds: {
    minSourceUnits: number;
    attackRatio: number;
    upgradeUnitsReserve: number;
  };
  strategies: string[];
}

export interface LevelPlayerDef {
  id: PlayerId;
  type: 'human' | 'ai';
  color: string;
  aiConfigId?: string;
}

export interface LevelNodeDef {
  id: string;
  position: [number, number];
  ownerId: PlayerId | null;
  nodeType: NodeTypeId;
  level: number;
  liquidType: LiquidId;
  units: number;
}

export interface LevelDef {
  id: number;
  name: string;
  tutorialKey: string | null;
  introducesNodeTypes: string[];
  introducesLiquids: string[];
  map: { width: number; height: number; background: string };
  terrain: { walls: { id: string; points: [number, number][] }[] };
  players: LevelPlayerDef[];
  nodes: LevelNodeDef[];
  winCondition: { type: 'controlAll' | 'surviveTimeMs' | 'captureSpecific' | 'eliminate'; value?: unknown };
  starThresholds: { time: [number, number, number]; units: [number, number, number] };
}

export interface ContentLibrary {
  liquids: Record<LiquidId, LiquidDef>;
  nodeTypes: Record<NodeTypeId, NodeTypeDef>;
  spells: Record<SpellId, SpellDef>;
  ai: Record<string, AIPersonalityDef>;
  levels: Record<number, LevelDef>;
}

export function vec2FromTuple(p: [number, number]): Vec2 {
  return { x: p[0], y: p[1] };
}
