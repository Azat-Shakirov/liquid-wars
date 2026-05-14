// UnitGroup entity — full shape per §4.3.
// v2.8.0: sourceLiquid → sourceFaction.

import type { FactionId, NodeId, PlayerId, UnitGroupId, Vec2 } from '../../types';

export interface UnitGroup {
  id: UnitGroupId;
  ownerId: PlayerId;
  count: number;
  sourceFaction: FactionId;
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
