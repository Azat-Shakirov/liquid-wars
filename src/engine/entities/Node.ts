// Node entity — full shape per §4.2.
// v2.8.0: liquidType → faction; poisonStacks → starveStacks; StarveStack
// no longer has expiresTick (stack persists until enemy capture).

import type { FactionId, NodeId, NodeTypeId, PlayerId, SpellId, Vec2 } from '../../types';

export interface QueuedSpell {
  spellId: SpellId;
  state: 'concocting' | 'ready';
  progress: number;
}

export interface StarveStack {
  sourcePlayerId: PlayerId;
  drainPerSecond: number;
}

export interface Node {
  id: NodeId;
  position: Vec2;
  previousPosition: Vec2;
  ownerId: PlayerId | null;
  nodeType: NodeTypeId;
  level: number;
  faction: FactionId;
  units: number;
  maxUnits: number;
  productionProgress: number;
  spellQueue: QueuedSpell | null;
  attackCooldownMs: number;
  isFrozen: boolean;
  frozenUntilTick: number;
  // v2.8.0 — renamed from poisonStacks. Starve stacks no longer expire by
  // time; they persist until the node is captured by a non-current-owner.
  starveStacks: StarveStack[];
}
