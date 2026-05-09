// SessionState — pure UI state shared between InputController and renderer.
// Lives outside the engine; selection/hover/drag don't affect simulation
// determinism so they don't belong in World.

import type { NodeId, Vec2 } from '../types';

export interface DragState {
  fromNodeIds: NodeId[];
  cursorPos: Vec2;
  overTargetId: NodeId | null;
}

export interface BoxSelectState {
  start: Vec2;
  current: Vec2;
}

export interface SessionState {
  selectedNodeIds: Set<NodeId>;
  hoveredNodeId: NodeId | null;
  drag: DragState | null;
  boxSelect: BoxSelectState | null;
}

export function createSessionState(): SessionState {
  return {
    selectedNodeIds: new Set(),
    hoveredNodeId: null,
    drag: null,
    boxSelect: null,
  };
}
