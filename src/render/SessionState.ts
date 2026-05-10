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

// Right-click context menu request — set by InputController, consumed
// by the React layer (which renders the menu DOM and clears the field
// when the user picks an option or dismisses).
export interface ContextMenuRequest {
  nodeId: NodeId;
  // Canvas-local coords (the React layer maps to screen coords).
  position: Vec2;
}

export interface SessionState {
  selectedNodeIds: Set<NodeId>;
  hoveredNodeId: NodeId | null;
  drag: DragState | null;
  boxSelect: BoxSelectState | null;
  contextMenu: ContextMenuRequest | null;
  // When set, the player has a 'ready' Lab queued for casting. The
  // next left-click on any node fires `engine.castSpell(labId, target)`
  // and clears this. Right-click anywhere or Esc also clears it.
  targetingFromLabId: NodeId | null;
}

export function createSessionState(): SessionState {
  return {
    selectedNodeIds: new Set(),
    hoveredNodeId: null,
    drag: null,
    boxSelect: null,
    contextMenu: null,
    targetingFromLabId: null,
  };
}
