// ContentLibrary — typed shape of all loaded JSON content. Engine code reads
// from this struct; the loader builds it from disk via Vite import.meta.glob.

import type { LiquidId, NodeTypeId, PlayerId, Vec2 } from '../../types';

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

export interface BarracksLevel {
  level: number;
  productionRate: number; // units per second
  maxUnits: number;
  upgradeCost?: number;
  upgradeCostFromHouse?: number;
}

export interface NodeTypeDef {
  id: NodeTypeId;
  shape: string;
  levels: BarracksLevel[];
  // Tower-specific (Phase 2+); typed loosely to avoid speculative shape:
  sendSpeedPenalty?: number;
  producesUnits?: boolean;
  upgradeTargets?: NodeTypeId[];
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
  ai: Record<string, AIPersonalityDef>;
  levels: Record<number, LevelDef>;
}

export function vec2FromTuple(p: [number, number]): Vec2 {
  return { x: p[0], y: p[1] };
}
