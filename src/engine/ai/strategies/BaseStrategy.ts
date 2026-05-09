// BaseStrategy — interface every AI strategy implements (§12.1).
// Phase 1 ships only DumbStrategy. Phase 5 will add Aggressive/Economist/etc.

import type { NodeId } from '../../../types';
import type { World, Player } from '../../World';
import type { ContentLibrary, AIPersonalityDef } from '../../content/ContentLibrary';

export interface StrategyDecision {
  fromNodeIds: NodeId[];
  toNodeId: NodeId;
  fraction: number;
}

export interface Strategy {
  readonly id: string;
  decide(
    world: World,
    me: Player,
    personality: AIPersonalityDef,
    content: ContentLibrary,
  ): StrategyDecision | null;
}
