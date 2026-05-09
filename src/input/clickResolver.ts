// Pure click resolver — given world state + current selection + the click
// metadata, returns an action describing what should happen. InputController
// applies the action; tests cover this function directly without DOM events.
//
// Click-resolution rules:
//
//   nodeId === null                        → clear selection
//   click on owned (shift)                 → select-toggle
//   click on owned, in multi-selection     → send 50% (100% on double-click)
//                                            from all OTHER selected nodes
//                                            (own-target redistribute)
//   click on owned, only one selected      → no-op (selected node clicked again)
//   click on owned, not in selection       → select-replace
//   click on hostile/neutral
//     • double-click + selection.size>=1   → send 100% (target excluded
//                                            from sources if it was selected)
//     • selection.size>=2, target not in   → send 50% from full selection
//       selection
//     • else                               → no-op (preserves selection so
//                                            a follow-up double-click can
//                                            still fire; single-select
//                                            requires drag to send)

import type { NodeId } from '../types';
import type { World } from '../engine/World';

export type ClickAction =
  | { kind: 'noop' }
  | { kind: 'clear-selection' }
  | { kind: 'select-replace'; nodeId: NodeId }
  | { kind: 'select-toggle'; nodeId: NodeId }
  | { kind: 'send'; sources: NodeId[]; target: NodeId; fraction: number };

export function resolveClick(
  world: World,
  selection: ReadonlySet<NodeId>,
  nodeId: NodeId | null,
  shiftKey: boolean,
  isDoubleClick: boolean,
): ClickAction {
  if (nodeId === null) return { kind: 'clear-selection' };

  const node = world.nodes.get(nodeId);
  if (!node) return { kind: 'noop' };

  const humanId = world.humanPlayerId;
  const isOwnedByHuman = humanId !== null && node.ownerId === humanId;

  if (!isOwnedByHuman) {
    if (isDoubleClick && selection.size >= 1) {
      const sources = [...selection].filter((id) => id !== nodeId);
      if (sources.length > 0) {
        return { kind: 'send', sources, target: nodeId, fraction: 1.0 };
      }
    }
    if (selection.size >= 2 && !selection.has(nodeId)) {
      return { kind: 'send', sources: [...selection], target: nodeId, fraction: 0.5 };
    }
    return { kind: 'noop' };
  }

  if (shiftKey) return { kind: 'select-toggle', nodeId };

  // Own-target redistribute: clicking a selected own node with 2+ selected
  // pours from every OTHER selected node into it. Double-click upgrades
  // to a full 100% drain. Replaces the old "click selected = narrow" rule
  // (narrow by clicking empty space then re-selecting).
  if (selection.has(nodeId)) {
    if (selection.size >= 2) {
      const sources = [...selection].filter((id) => id !== nodeId);
      const fraction = isDoubleClick ? 1.0 : 0.5;
      return { kind: 'send', sources, target: nodeId, fraction };
    }
    return { kind: 'noop' };
  }

  return { kind: 'select-replace', nodeId };
}
