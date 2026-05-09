// InputController — gesture state machine for Phase 1 (§9.1, §20 item 1).
//
//   Click on owned node            → select (replace)
//   Shift-click on owned node      → toggle in selection
//   Drag from owned node           → send 50% from source(s) to release target
//   Drag from selection (any)      → send 50% from each selected source
//   Drag from empty                → box-select all owned-by-human inside box
//   Double-click on any target     → send 100% from selection (if non-empty)
//   Click on empty / hostile node  → clear selection
//
// Hit-testing uses size-by-level metrics from render/shapes (input layer is
// allowed to import from render — only engine/ is forbidden from doing so).

import type { GameEngine } from '../engine/GameEngine';
import type { NodeId, Vec2 } from '../types';
import type { SessionState } from '../render/SessionState';
import { metricsForType } from '../render/shapes';

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
  | { kind: 'drag-send'; pointerId: number; sources: NodeId[] };

export class InputController {
  private state: GestureState = { kind: 'idle' };
  private lastClick: { nodeId: NodeId | null; time: number } | null = null;

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
        this.engine.sendUnits(this.state.sources, targetId, 0.5);
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
    const now = performance.now();
    const isDoubleClick =
      this.lastClick !== null &&
      this.lastClick.nodeId === nodeId &&
      now - this.lastClick.time < DOUBLE_CLICK_MS;
    this.lastClick = { nodeId, time: now };

    if (nodeId === null) {
      this.session.selectedNodeIds.clear();
      return;
    }

    const node = this.engine.world.nodes.get(nodeId);
    if (!node) return;

    const isHuman = node.ownerId === this.engine.world.humanPlayerId;

    if (isDoubleClick && this.session.selectedNodeIds.size > 0) {
      // Double-click on a target — send 100% from selection to it.
      const sources = Array.from(this.session.selectedNodeIds).filter((id) => id !== nodeId);
      if (sources.length > 0) {
        this.engine.sendUnits(sources, nodeId, 1.0);
      }
      return;
    }

    if (isHuman) {
      if (shiftKey) {
        if (this.session.selectedNodeIds.has(nodeId)) {
          this.session.selectedNodeIds.delete(nodeId);
        } else {
          this.session.selectedNodeIds.add(nodeId);
        }
      } else {
        this.session.selectedNodeIds.clear();
        this.session.selectedNodeIds.add(nodeId);
      }
    }
    // Click on hostile/neutral target with no double-click → no-op.
    // Selection is preserved so the second click within DOUBLE_CLICK_MS
    // can fire the double-click branch above (the "send 100%" gesture).
    // Clicking empty space (nodeId === null, handled earlier) is what
    // actually clears the selection.
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
