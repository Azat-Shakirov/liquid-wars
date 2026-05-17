// ContentLibrary — typed shape of all loaded JSON content. Engine code reads
// from this struct; the loader builds it from disk via Vite import.meta.glob.
//
// v2.8.0: renamed Liquid* → Faction*; player.liquid → player.faction;
// node.liquidType → node.faction; introducesLiquids → introducesFactions;
// spell types 'bleed' → 'starve', 'recruit' → 'sabotage'; new Archetype
// concept (5 archetypes, data-driven buffs).

import type { FactionId, NodeTypeId, PlayerId, SpellId, Vec2 } from '../../types';

export type ArchetypeId = 'infantry' | 'cavalry' | 'knight' | 'mage' | 'archer';

export interface FactionEffect {
  type: string;
  value: number;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  color: string;
  description: string;
  effects: FactionEffect[];
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
  // Flat reduction subtracted from incoming UnitGroup count when
  // a group arrives at this Tower (per SPEC patch — Tower defends
  // itself against arrivals; interception in flight is separate).
  defenseRate?: number;
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
  | { type: 'freeze'; params?: Record<string, never> }
  | { type: 'starve'; params: { drainPerSecond: number } }
  | { type: 'sabotage'; params?: Record<string, never> };

export interface SpellDef {
  id: SpellId;
  name: string;
  concoctTimeMs: number;
  unitCost: number;
  minLabLevel: number;
  effect: SpellEffectDef;
}

export type ArchetypeBuffDef =
  | { type: 'productionMultiplier'; value: number }
  | { type: 'speedMultiplier'; value: number }
  | { type: 'incomingDamageMultiplier'; value: number }
  | { type: 'spellConcoctMultiplier'; value: number }
  | { type: 'captureCostMultiplier'; value: number };

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  description: string;
  buff: ArchetypeBuffDef;
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
    maxOwnedNodes?: number;
  };
  strategies: string[];
}

export interface LevelPlayerDef {
  id: PlayerId;
  type: 'human' | 'ai';
  color: string;
  // v2.8.0 — required. The player's faction (cosmetic team color/banner).
  // Owned nodes inherit it at level load; captures convert to the new
  // owner's faction. Renamed from `liquid` (pre-v2.8.0).
  faction: FactionId;
  // v2.8.0 — required. Gameplay-relevant unit class. Determines the
  // player's unit sprite + single buff (defined in
  // content/archetypes/<id>.json).
  archetype: ArchetypeId;
  aiConfigId?: string;
}

export interface LevelNodeDef {
  id: string;
  position: [number, number];
  ownerId: PlayerId | null;
  nodeType: NodeTypeId;
  level: number;
  // v2.8.0 — renamed from liquidType.
  faction: FactionId;
  units: number;
}

export interface TutorialDef {
  title: string;
  body: string;
}

export type BiomeId = 'grass' | 'desert' | 'snow' | 'jungle' | 'stone';

export interface LevelDef {
  id: number;
  name: string;
  tutorialKey: string | null;
  // Phase 5: one-shot modal at level start (engine paused until dismissed).
  tutorial?: TutorialDef | null;
  // Phase 5: persistent objective banner across the top of the game view.
  objective?: string | null;
  // v2.8.0 challenge tier: when true, LevelSelect's faction picker
  // overrides the designer-set player.faction.
  letPlayerChooseFaction?: boolean;
  // v2.8.0 (UI deferred to v1.1): when true, LevelSelect lets the player
  // pick the archetype. Designer-locked otherwise.
  letPlayerChooseArchetype?: boolean;
  introducesNodeTypes: string[];
  // v2.8.0 — renamed from introducesLiquids.
  introducesFactions: string[];
  map: { width: number; height: number; background: BiomeId };
  terrain: { walls: { id: string; points: [number, number][] }[] };
  players: LevelPlayerDef[];
  nodes: LevelNodeDef[];
  winCondition: { type: 'controlAll' | 'surviveTimeMs' | 'captureSpecific' | 'eliminate'; value?: unknown };
  starThresholds: { time: [number, number, number]; units: [number, number, number] };
}

export interface ContentLibrary {
  factions: Record<FactionId, FactionDef>;
  nodeTypes: Record<NodeTypeId, NodeTypeDef>;
  spells: Record<SpellId, SpellDef>;
  archetypes: Record<ArchetypeId, ArchetypeDef>;
  ai: Record<string, AIPersonalityDef>;
  levels: Record<number, LevelDef>;
}

export function vec2FromTuple(p: [number, number]): Vec2 {
  return { x: p[0], y: p[1] };
}
