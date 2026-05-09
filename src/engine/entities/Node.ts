// Node entity — full shape per §4.2.
// Phase 0 defines the type only; construction logic ships in Phase 1.

import type { LiquidId, NodeId, NodeTypeId, PlayerId, SpellId, Vec2 } from '../../types';

export interface QueuedSpell {
  spellId: SpellId;
  state: 'concocting' | 'ready';
  progress: number;
}

export interface PoisonStack {
  sourcePlayerId: PlayerId;
  drainPerSecond: number;
  expiresTick: number;
}

export interface Node {
  id: NodeId;
  position: Vec2;
  previousPosition: Vec2;
  ownerId: PlayerId | null;
  nodeType: NodeTypeId;
  level: number;
  liquidType: LiquidId;
  units: number;
  maxUnits: number;
  productionProgress: number;
  spellQueue: QueuedSpell | null;
  attackCooldownMs: number;
  isFrozen: boolean;
  frozenUntilTick: number;
  poisonStacks: PoisonStack[];
}
