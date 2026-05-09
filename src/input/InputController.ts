// InputController — gesture state machine for Phase 1 (§9.1, §20 item 1).
//
//   Click on owned node            → select (replace)
//   Shift-click on owned node      → toggle in selection
//   Drag from owned node           → send 50%; the same target can be
//                                    tapped within DOUBLE_CLICK_MS to
//                                    finish the gesture as 100% total
//                                    ("drag + tap = 100%")
//   Shift-drag from owned node     → send 100% in one motion
//   Drag from empty                → box-select owned-by-human inside box
//   Click on multi-select target   → send 50% (deferred for double-click
//                                    upgrade — see below)
//   Double-click on target with    → send 100% from selection
//     selection (single OR multi)
//   Click on empty space           → clear selection
//   Click on hostile/neutral with  → no-op (preserves selection so a
//     ≤ 1 sources                    follow-up double-click can fire 100%)
//
// Two upgrade mechanisms support the "fast 100% without explicit
// selection" gestures:
//
// 1. dragUpgrade — set by a plain drag-release. A tap on the same
//    target within DOUBLE_CLICK_MS issues a 100% send from the drag
//    sources (which is 50% of the original units, the other half
//    having gone with the drag itself). Net effect: drag + tap = 100%.
//
// 2. deferredClick — used for multi-select click-to-send. The first
//    click with selection.size >= 2 on a non-selected target stages
//    a 50% send; a second click on the same target within
//    DOUBLE_CLICK_MS upgrades to 100%. The auto-deselect from item 2
//    means a fired 50% would otherwise leave nothing for a follow-up
//    double-click to act on, so we hold the action.
//
// Hit-testing uses size-by-level metrics from render/shapes (input layer is
// allowed to import from render — only engine/ is forbidden from doing so).

import type { GameEngine } from '../engine/GameEngine';
import type { NodeId, Vec2 } from '../types';
import type { SessionState } from '../render/SessionState';
import { metricsForType } from '../render/shapes';
import { resolveClick, type ClickAction } from './clickResolver';

const DEAD_ZONE_PX = 5;
const DOUBLE_CLICK_MS = 350;
const HIT_RADIUS_PADDING = 6;

type GestureState =
  | { kind: 'idle' }
  | {
      kind: 'down';
      startX: number;
      startY: number;
      downNodeId: NodeId | null;
      shiftKey: boolean;
      pointerId: number;
    }
  | { kind: 'box-select'; pointerId: number; startX: number; startY: number }
  | { kind: 'drag-send'; pointerId: number; sources: NodeId[]; shiftKey: boolean };

interface DeferredClick {
  nodeId: NodeId;
  selectionSnapshot: Set<NodeId>;
  shiftKey: boolean;
  action: ClickAction;
  timer: ReturnType<typeof setTimeout>;
}

interface DragUpgrade {
  sources: NodeId[];
  target: NodeId;
  expiresAt: number;
}

export class InputController {
  private state: GestureState = { kind: 'idle' };
  private lastClick: { nodeId: NodeId | null; time: number } | null = null;
  private deferredClick: DeferredClick | null = null;
  private dragUpgrade: DragUpgrade | null = null;

  private readonly handlePointerDown: (e: PointerEvent) => void;
  private readonly handlePointerMove: (e: PointerEvent) => void;
  private readonly handlePointerUp: (e: PointerEvent) => void;
  private readonly handlePointerCancel: (e: PointerEvent) => void;
  private readonly handleContextMenu: (e: MouseEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: GameEngine,
    private readonly session: SessionState,
  ) {
    this.handlePointerDown = (e: PointerEvent) => this.onPointerDown(e);
    this.handlePointerMove = (e: PointerEvent) => this.onPointerMove(e);
    this.handlePointerUp = (e: PointerEvent) => this.onPointerUp(e);
    this.handlePointerCancel = (e: PointerEvent) => this.onPointerCancel(e);
    this.handleContextMenu = (e: MouseEvent) => e.preventDefault();

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  destroy(): void {
    if (this.deferredClick) {
      clearTimeout(this.deferredClick.timer);
      this.deferredClick = null;
    }
    this.dragUpgrade = null;
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }

  // ── Event handlers ────────────────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    const { x, y } = this.localCoords(e);

    // Right-click — Phase 1 has no spell/upgrade menu; reserved for Phase 2.
    if (e.button === 2) return;

    const downNodeId = this.pickNodeAt(x, y);
    this.state = {
      kind: 'down',
      startX: x,
      startY: y,
      downNodeId,
      shiftKey: e.shiftKey,
      pointerId: e.pointerId,
    };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // some environments (touch + odd browsers) reject capture; safe to ignore.
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.localCoords(e);

    if (this.state.kind === 'idle') {
      this.session.hoveredNodeId = this.pickNodeAt(x, y);
      return;
    }

    if (this.state.kind === 'down') {
      if (e.pointerId !== this.state.pointerId) return;
      const dx = x - this.state.startX;
      const dy = y - this.state.startY;
      if (Math.hypot(dx, dy) < DEAD_ZONE_PX) return;

      const downNode = this.state.downNodeId
        ? this.engine.world.nodes.get(this.state.downNodeId) ?? null
        : null;
      const isOwnedByHuman =
        downNode !== null && downNode.ownerId === this.engine.world.humanPlayerId;

      if (isOwnedByHuman && downNode) {
        const sources = this.session.selectedNodeIds.has(downNode.id)
          ? Array.from(this.session.selectedNodeIds)
          : [downNode.id];
        this.state = {
          kind: 'drag-send',
          pointerId: this.state.pointerId,
          sources,
          shiftKey: this.state.shiftKey,
        };
        this.session.drag = {
          fromNodeIds: sources,
          cursorPos: { x, y },
          overTargetId: this.pickNodeAt(x, y),
        };
      } else {
        this.state = {
          kind: 'box-select',
          pointerId: this.state.pointerId,
          startX: this.state.startX,
          startY: this.state.startY,
        };
        this.session.boxSelect = {
          start: { x: this.state.startX, y: this.state.startY },
          current: { x, y },
        };
      }
      return;
    }

    if (this.state.kind === 'drag-send') {
      if (e.pointerId !== this.state.pointerId) return;
      const overId = this.pickNodeAt(x, y);
      if (this.session.drag) {
        this.session.drag.cursorPos = { x, y };
        this.session.drag.overTargetId = overId;
      }
      this.session.hoveredNodeId = overId;
      return;
    }

    if (this.state.kind === 'box-select') {
      if (e.pointerId !== this.state.pointerId) return;
      if (this.session.boxSelect) this.session.boxSelect.current = { x, y };
      this.session.hoveredNodeId = this.pickNodeAt(x, y);
      return;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.state.kind === 'idle') return;
    if (this.state.kind !== 'down' && e.pointerId !== this.state.pointerId) return;
    const { x, y } = this.localCoords(e);

    if (this.state.kind === 'down') {
      this.handleClick(this.state.downNodeId, this.state.shiftKey);
    } else if (this.state.kind === 'drag-send') {
      const targetId = this.pickNodeAt(x, y);
      if (targetId && this.state.sources.length > 0) {
        const fraction = this.state.shiftKey ? 1.0 : 0.5;
        const result = this.engine.sendUnits(this.state.sources, targetId, fraction);
        if (result.ok) this.session.selectedNodeIds.clear();
        if (result.ok && fraction < 1.0) {
          // Plain drag-release primes a tap-to-upgrade window. A
          // single tap on the target within DOUBLE_CLICK_MS issues
          // 100% of the source's CURRENT units (= the remaining 50%
          // of the original), totalling 100% sent across two waves.
          this.dragUpgrade = {
            sources: [...this.state.sources],
            target: targetId,
            expiresAt: performance.now() + DOUBLE_CLICK_MS,
          };
        } else {
          this.dragUpgrade = null;
        }
      }
      this.session.drag = null;
    } else if (this.state.kind === 'box-select') {
      const start = { x: this.state.startX, y: this.state.startY };
      const end = { x, y };
      this.commitBoxSelect(start, end);
      this.session.boxSelect = null;
    }

    this.state = { kind: 'idle' };
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore — already released or never captured.
    }
  }

  private onPointerCancel(_e: PointerEvent): void {
    this.session.drag = null;
    this.session.boxSelect = null;
    this.state = { kind: 'idle' };
  }

  // ── Click resolution ──────────────────────────────────────────────

  private handleClick(nodeId: NodeId | null, shiftKey: boolean): void {
    // Case A0: drag-upgrade window — a tap on the recently dragged
    // target completes the gesture as 100% by sending the remaining
    // half. No selection is required.
    if (this.dragUpgrade && nodeId !== null && this.dragUpgrade.target === nodeId) {
      const now = performance.now();
      if (now < this.dragUpgrade.expiresAt) {
        const sources = this.dragUpgrade.sources;
        const target = this.dragUpgrade.target;
        this.dragUpgrade = null;
        this.lastClick = null;
        if (this.deferredClick) {
          clearTimeout(this.deferredClick.timer);
          this.deferredClick = null;
        }
        const result = this.engine.sendUnits(sources, target, 1.0);
        if (result.ok) this.session.selectedNodeIds.clear();
        return;
      }
      this.dragUpgrade = null; // expired
    }

    // Case A: a deferred multi-select 50% click is pending.
    if (this.deferredClick) {
      const same = this.deferredClick.nodeId === nodeId;
      clearTimeout(this.deferredClick.timer);

      if (same && nodeId !== null) {
        // Second tap of a double-click on the same target — upgrade to 100%.
        // Re-resolve using the original selection snapshot so the source
        // list matches what the user saw at first click time.
        const snap = this.deferredClick.selectionSnapshot;
        const upgradedAction = resolveClick(
          this.engine.world,
          snap,
          nodeId,
          shiftKey,
          /* isDoubleClick */ true,
        );
        this.deferredClick = null;
        this.lastClick = null;
        this.applyClickAction(upgradedAction);
        return;
      }

      // Different target — commit the pending 50% before processing the
      // new click as a fresh click.
      const pending = this.deferredClick;
      this.deferredClick = null;
      this.applyClickAction(pending.action);
      // Fall through to handle the new click normally.
    }

    const now = performance.now();
    const isDoubleClick =
      this.lastClick !== null &&
      this.lastClick.nodeId === nodeId &&
      now - this.lastClick.time < DOUBLE_CLICK_MS;
    this.lastClick = { nodeId, time: now };

    const action = resolveClick(
      this.engine.world,
      this.session.selectedNodeIds,
      nodeId,
      shiftKey,
      isDoubleClick,
    );

    // Defer multi-select 50% sends. The first click in a sequence stages
    // the action; if a second click on the same target arrives within
    // DOUBLE_CLICK_MS the deferred call becomes a 100% send instead.
    // Only multi-select 50% (selection.size >= 2) can be upgraded —
    // single-select clicks on hostile/neutral are already no-ops, so
    // the lastClick path handles those.
    if (
      action.kind === 'send' &&
      action.fraction === 0.5 &&
      this.session.selectedNodeIds.size >= 2 &&
      nodeId !== null &&
      !isDoubleClick
    ) {
      const snapshot = new Set(this.session.selectedNodeIds);
      const targetId = nodeId;
      const timer = setTimeout(() => {
        if (this.deferredClick && this.deferredClick.nodeId === targetId) {
          this.deferredClick = null;
          this.applyClickAction(action);
        }
      }, DOUBLE_CLICK_MS);
      this.deferredClick = {
        nodeId: targetId,
        selectionSnapshot: snapshot,
        shiftKey,
        action,
        timer,
      };
      return;
    }

    this.applyClickAction(action);
  }

  private applyClickAction(action: ClickAction): void {
    switch (action.kind) {
      case 'noop':
        return;
      case 'clear-selection':
        this.session.selectedNodeIds.clear();
        return;
      case 'select-replace':
        this.session.selectedNodeIds.clear();
        this.session.selectedNodeIds.add(action.nodeId);
        return;
      case 'select-toggle':
        if (this.session.selectedNodeIds.has(action.nodeId)) {
          this.session.selectedNodeIds.delete(action.nodeId);
        } else {
          this.session.selectedNodeIds.add(action.nodeId);
        }
        return;
      case 'send': {
        const result = this.engine.sendUnits(action.sources, action.target, action.fraction);
        if (result.ok) this.session.selectedNodeIds.clear();
        return;
      }
    }
  }

  private commitBoxSelect(start: Vec2, end: Vec2): void {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    if (maxX - minX < 4 || maxY - minY < 4) return;

    this.session.selectedNodeIds.clear();
    for (const id of this.engine.world.nodeOrder) {
      const n = this.engine.world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId !== this.engine.world.humanPlayerId) continue;
      if (n.position.x < minX || n.position.x > maxX) continue;
      if (n.position.y < minY || n.position.y > maxY) continue;
      this.session.selectedNodeIds.add(id);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private localCoords(e: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private pickNodeAt(x: number, y: number): NodeId | null {
    let best: { id: NodeId; d: number } | null = null;
    for (const id of this.engine.world.nodeOrder) {
      const n = this.engine.world.nodes.get(id);
      if (!n) continue;
      const metrics = metricsForType(n.nodeType, n.level);
      const radius = metrics.size / 2 + HIT_RADIUS_PADDING;
      const dx = x - n.position.x;
      const dy = y - n.position.y;
      const d = Math.hypot(dx, dy);
      if (d <= radius && (!best || d < best.d)) best = { id, d };
    }
    return best ? best.id : null;
  }
}
