// Active spell effects tracked at the world level (§4.1: activeSpellEffects[]).
// Phase 0 defines the type only; expanded in Phase 2.

import type { NodeId, PlayerId, SpellId } from '../../types';

export interface ActiveSpellEffect {
  id: string;
  spellId: SpellId;
  casterId: PlayerId;
  targetNodeId: NodeId;
  startedTick: number;
  expiresTick: number;
}
