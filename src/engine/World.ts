// World — root container for all engine state. Shape per §4.1.
// Phase 1: instantiates Nodes from a LevelDef + ContentLibrary.

import type { LiquidId, NodeId, NodeTypeId, PlayerId, Vec2 } from '../types';
import type { Node } from './entities/Node';
import type { UnitGroup } from './entities/UnitGroup';
import type { ActiveSpellEffect } from './entities/Spell';
import type { Wall } from './entities/Wall';
import type {
  ContentLibrary,
  LevelDef,
  NodeTypeDef,
} from './content/ContentLibrary';
import { vec2FromTuple } from './content/ContentLibrary';
import { createRNG, type SeededRNG } from './rng';
import { buildPathCache, type PathCache } from './PathSystem';
import { pointNearWall } from './geometry';

export interface Player {
  id: PlayerId;
  type: 'human' | 'ai';
  color: string;
  aiConfigId?: string;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface World {
  tick: number;
  rng: SeededRNG;
  players: Player[];
  humanPlayerId: PlayerId | null;
  nodes: Map<NodeId, Node>;
  // Insertion-order array for stable iteration when systems need positional
  // semantics (combat ordering by id, etc.). Mirrors `nodes` keys.
  nodeOrder: NodeId[];
  unitGroups: UnitGroup[];
  activeSpellEffects: ActiveSpellEffect[];
  level: LevelDef;
  // Phase 3 — terrain. Empty in pre-Phase-3 levels.
  walls: Wall[];
  // Phase 3 — precomputed paths between every ordered (from, to) node
  // pair. Built once at level load. Value === null ⇒ unreachable.
  pathCache: PathCache;
  status: GameStatus;
  elapsedMs: number;
  nextUnitGroupId: number;
}

const NODE_ON_WALL_TOLERANCE_PX = 12;

function nodeTypeLevelStats(
  def: NodeTypeDef,
  level: number,
): { maxUnits: number; productionRate: number } {
  const lv = def.levels.find((l) => l.level === level);
  if (!lv) {
    throw new Error(`NodeType '${def.id}' has no level ${level} configured.`);
  }
  return {
    maxUnits: lv.maxUnits,
    productionRate: lv.productionRate ?? 0,
  };
}

export function buildWorldFromLevel(
  level: LevelDef,
  content: ContentLibrary,
  seed = 1,
): World {
  const players: Player[] = level.players.map((p) => ({
    id: p.id,
    type: p.type,
    color: p.color,
    ...(p.aiConfigId !== undefined ? { aiConfigId: p.aiConfigId } : {}),
  }));

  const human = players.find((p) => p.type === 'human') ?? null;

  const walls: Wall[] = level.terrain.walls.map((w) => ({
    id: w.id,
    points: w.points.map((p) => vec2FromTuple(p)),
  }));

  const nodes = new Map<NodeId, Node>();
  const nodeOrder: NodeId[] = [];

  // Phase 5: each player owns ONE liquid; owned nodes inherit it at load.
  // Neutral nodes (ownerId null) keep the JSON-declared liquidType.
  const playerLiquid = new Map<string, LiquidId>();
  for (const pdef of level.players) {
    if (!content.liquids[pdef.liquid as LiquidId]) {
      throw new Error(`Level ${level.id} player '${pdef.id}' references unknown liquid '${pdef.liquid}'`);
    }
    playerLiquid.set(pdef.id, pdef.liquid as LiquidId);
  }

  for (const ndef of level.nodes) {
    const typeDef = content.nodeTypes[ndef.nodeType as NodeTypeId];
    if (!typeDef) throw new Error(`Level ${level.id} references unknown nodeType '${ndef.nodeType}'`);
    const ownerLiquid = ndef.ownerId !== null ? playerLiquid.get(ndef.ownerId) : undefined;
    const effectiveLiquid = (ownerLiquid ?? ndef.liquidType) as LiquidId;
    if (!content.liquids[effectiveLiquid]) {
      throw new Error(`Level ${level.id} references unknown liquid '${effectiveLiquid}'`);
    }
    const stats = nodeTypeLevelStats(typeDef, ndef.level);
    const pos: Vec2 = vec2FromTuple(ndef.position);
    if (walls.length > 0 && pointNearWall(pos, walls, NODE_ON_WALL_TOLERANCE_PX)) {
      throw new Error(
        `Level ${level.id} node '${ndef.id}' at (${pos.x},${pos.y}) overlaps a wall.`,
      );
    }
    const node: Node = {
      id: ndef.id,
      position: pos,
      previousPosition: { ...pos },
      ownerId: ndef.ownerId,
      nodeType: ndef.nodeType,
      level: ndef.level,
      liquidType: effectiveLiquid,
      units: ndef.units,
      maxUnits: stats.maxUnits,
      productionProgress: 0,
      spellQueue: null,
      attackCooldownMs: 0,
      isFrozen: false,
      frozenUntilTick: 0,
      poisonStacks: [],
    };
    nodes.set(node.id, node);
    nodeOrder.push(node.id);
  }

  const pathCache = buildPathCache(nodeOrder, nodes, walls, {
    width: level.map.width,
    height: level.map.height,
  });

  return {
    tick: 0,
    rng: createRNG(seed),
    players,
    humanPlayerId: human ? human.id : null,
    nodes,
    nodeOrder,
    unitGroups: [],
    activeSpellEffects: [],
    level,
    walls,
    pathCache,
    status: 'playing',
    elapsedMs: 0,
    nextUnitGroupId: 1,
  };
}
