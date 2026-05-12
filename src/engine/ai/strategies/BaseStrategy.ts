// BaseStrategy — interface every AI strategy implements (§12.1).
//
// StrategyDecision is a discriminated union (v2.7): a strategy can
// return any one of the four AI-actionable engine commands. The
// AIController dispatches on `kind`. Strategies that don't apply to
// the current world return null, and the controller falls through to
// the next strategy in `personality.strategies[]`.

import type { NodeId, NodeTypeId } from '../../../types';
import type { World, Player } from '../../World';
import type { ContentLibrary, AIPersonalityDef } from '../../content/ContentLibrary';

export type StrategyDecision =
  | { kind: 'send'; fromNodeIds: NodeId[]; toNodeId: NodeId; fraction: number }
  | { kind: 'upgrade'; nodeId: NodeId; targetType?: NodeTypeId }
  | { kind: 'concoct'; labNodeId: NodeId; spellId: string }
  | { kind: 'cast'; labNodeId: NodeId; targetNodeId: NodeId };

export interface Strategy {
  readonly id: string;
  decide(
    world: World,
    me: Player,
    personality: AIPersonalityDef,
    content: ContentLibrary,
  ): StrategyDecision | null;
}
