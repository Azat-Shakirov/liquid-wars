// World — root container for all engine state. Shape per §4.1.

import type { LevelConfig, NodeId, PlayerId } from '../types';
import type { Node } from './entities/Node';
import type { UnitGroup } from './entities/UnitGroup';
import type { ActiveSpellEffect } from './entities/Spell';
import { createRNG, type SeededRNG } from './rng';

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
  nodes: Map<NodeId, Node>;
  unitGroups: UnitGroup[];
  activeSpellEffects: ActiveSpellEffect[];
  config: LevelConfig;
  status: GameStatus;
  elapsedMs: number;
}

export function createWorld(config: LevelConfig, seed = 1): World {
  return {
    tick: 0,
    rng: createRNG(seed),
    players: [],
    nodes: new Map(),
    unitGroups: [],
    activeSpellEffects: [],
    config,
    status: 'playing',
    elapsedMs: 0,
  };
}
