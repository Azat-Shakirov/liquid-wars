// UnitGroup entity — full shape per §4.3.
// Phase 0 defines the type only; construction logic ships in Phase 1.

import type { LiquidId, NodeId, PlayerId, UnitGroupId, Vec2 } from '../../types';

export interface UnitGroup {
  id: UnitGroupId;
  ownerId: PlayerId;
  count: number;
  sourceLiquid: LiquidId;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  path: Vec2[];
  pathProgress: number;
  totalDistance: number;
  baseSpeed: number;
  spawnTick: number;
  arrivalTick: number;
  position: Vec2;
  previousPosition: Vec2;
}
