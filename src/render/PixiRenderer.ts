// PixiRenderer — bootstraps a PIXI.Application and renders engine state.
// Reads from World + SessionState, never writes. (§3.1, §10)
//
// Layered stage (§10.1):
//   1. Background          — dark canvas (Phase 1)
//   2. Connection hints    — drag/hover line from selected source(s) to target
//   3. Nodes               — NodeView containers
//   4. Tower attack range  — Phase 2
//   5. Unit groups         — UnitGroupView containers
//   6. Spell effects       — Phase 2
//   7. Selection box       — dashed rectangle while box-selecting
//   8. HUD overlay         — tick counter / status string

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { World } from '../engine/World';
import type { ContentLibrary } from '../engine/content/ContentLibrary';
import { NodeView } from './views/NodeView';
import { UnitGroupView } from './views/UnitGroupView';
import { SelectionBoxView } from './views/SelectionBoxView';
import { colorFromHex } from './shapes';
import type { SessionState } from './SessionState';

interface ClickRipple {
  x: number;
  y: number;
  birthMs: number;
}

const RIPPLE_LIFE_MS = 600;
const RIPPLE_MAX_RADIUS = 28;

export class PixiRenderer {
  readonly app: Application;
  private readonly host: HTMLElement;
  private readonly content: ContentLibrary;

  private readonly bgLayer: Container;
  private readonly hintLayer: Container;
  private readonly nodeLayer: Container;
  private readonly unitLayer: Container;
  private readonly boxLayer: Container;
  private readonly hudLayer: Container;

  private readonly hintGraphics: Graphics;
  private readonly rippleGraphics: Graphics;
  private readonly selectionBoxView: SelectionBoxView;
  private readonly hudText: Text;
  private readonly statusText: Text;

  private readonly nodeViews = new Map<string, NodeView>();
  private readonly unitViews = new Map<string, UnitGroupView>();
  private readonly ripples: ClickRipple[] = [];

  private constructor(app: Application, host: HTMLElement, content: ContentLibrary) {
    this.app = app;
    this.host = host;
    this.content = content;

    this.bgLayer = new Container();
    this.hintLayer = new Container();
    this.nodeLayer = new Container();
    this.unitLayer = new Container();
    this.boxLayer = new Container();
    this.hudLayer = new Container();

    this.app.stage.addChild(this.bgLayer);
    this.app.stage.addChild(this.hintLayer);
    this.app.stage.addChild(this.nodeLayer);
    this.app.stage.addChild(this.unitLayer);
    this.app.stage.addChild(this.boxLayer);
    this.app.stage.addChild(this.hudLayer);

    this.hintGraphics = new Graphics();
    this.hintLayer.addChild(this.hintGraphics);

    this.rippleGraphics = new Graphics();
    this.hintLayer.addChild(this.rippleGraphics);

    this.selectionBoxView = new SelectionBoxView();
    this.boxLayer.addChild(this.selectionBoxView.graphic);

    this.hudText = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fill: 0x888888,
      },
    });
    this.hudText.position.set(12, 10);
    this.hudLayer.addChild(this.hudText);

    this.statusText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 36,
        fill: 0xffffff,
        fontWeight: '700',
        align: 'center',
      },
    });
    this.statusText.anchor.set(0.5);
    this.hudLayer.addChild(this.statusText);
  }

  static async create(host: HTMLElement, content: ContentLibrary): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      background: '#0a0a0a',
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
    });
    host.appendChild(app.canvas);
    return new PixiRenderer(app, host, content);
  }

  render(world: World, session: SessionState, alpha: number, nowMs: number): void {
    this.syncNodes(world, session, nowMs, alpha);
    this.syncUnitGroups(world, alpha);
    this.drawHints(world, session);
    this.selectionBoxView.update(session.boxSelect);
    this.drawRipples(nowMs);
    this.updateHud(world);
  }

  private syncNodes(world: World, session: SessionState, nowMs: number, alpha: number): void {
    const present = new Set<string>();
    for (const id of world.nodeOrder) {
      const node = world.nodes.get(id);
      if (!node) continue;
      present.add(id);
      let view = this.nodeViews.get(id);
      if (!view) {
        view = new NodeView(node);
        this.nodeViews.set(id, view);
        this.nodeLayer.addChild(view.container);
      }
      view.update(node, world, this.content, session.selectedNodeIds.has(id), nowMs, alpha);
    }
    for (const [id, view] of this.nodeViews) {
      if (!present.has(id)) {
        view.destroy();
        this.nodeViews.delete(id);
      }
    }
  }

  private syncUnitGroups(world: World, alpha: number): void {
    const present = new Set<string>();
    for (const ug of world.unitGroups) {
      present.add(ug.id);
      let view = this.unitViews.get(ug.id);
      if (!view) {
        view = new UnitGroupView(ug);
        this.unitViews.set(ug.id, view);
        this.unitLayer.addChild(view.container);
      }
      view.update(ug, world, this.content, alpha);
    }
    for (const [id, view] of this.unitViews) {
      if (!present.has(id)) {
        view.destroy();
        this.unitViews.delete(id);
      }
    }
  }

  private drawHints(world: World, session: SessionState): void {
    this.hintGraphics.clear();

    if (session.drag) {
      const targetNode = session.drag.overTargetId
        ? world.nodes.get(session.drag.overTargetId) ?? null
        : null;
      const tipX = targetNode ? targetNode.position.x : session.drag.cursorPos.x;
      const tipY = targetNode ? targetNode.position.y : session.drag.cursorPos.y;
      for (const fromId of session.drag.fromNodeIds) {
        const from = world.nodes.get(fromId);
        if (!from) continue;
        const owner = from.ownerId
          ? world.players.find((p) => p.id === from.ownerId)
          : undefined;
        const color = owner ? colorFromHex(owner.color) : 0xffffff;
        this.hintGraphics
          .moveTo(from.position.x, from.position.y)
          .lineTo(tipX, tipY)
          .stroke({ color, width: 1.5, alpha: targetNode ? 0.85 : 0.45 });
        if (targetNode) {
          this.hintGraphics
            .circle(targetNode.position.x, targetNode.position.y, 22)
            .stroke({ color, width: 2, alpha: 0.9 });
        }
      }
      return;
    }

    // Multi-select preview — when two or more nodes are selected and the
    // cursor is over a non-selected target, preview the click-to-send.
    if (
      session.selectedNodeIds.size >= 2 &&
      session.hoveredNodeId &&
      !session.selectedNodeIds.has(session.hoveredNodeId)
    ) {
      const hovered = world.nodes.get(session.hoveredNodeId);
      if (hovered) {
        for (const sid of session.selectedNodeIds) {
          const source = world.nodes.get(sid);
          if (!source) continue;
          const owner = source.ownerId
            ? world.players.find((p) => p.id === source.ownerId)
            : undefined;
          const color = owner ? colorFromHex(owner.color) : 0xffffff;
          this.hintGraphics
            .moveTo(source.position.x, source.position.y)
            .lineTo(hovered.position.x, hovered.position.y)
            .stroke({ color, width: 1.5, alpha: 0.45 });
        }
        this.hintGraphics
          .circle(hovered.position.x, hovered.position.y, 22)
          .stroke({ color: 0xffffff, width: 2, alpha: 0.55 });
        return;
      }
    }

    if (session.hoveredNodeId) {
      const hovered = world.nodes.get(session.hoveredNodeId);
      if (hovered) {
        this.hintGraphics
          .circle(hovered.position.x, hovered.position.y, 26)
          .stroke({ color: 0xffffff, width: 1, alpha: 0.18 });
      }
    }
  }

  private drawRipples(nowMs: number): void {
    this.rippleGraphics.clear();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      const age = nowMs - r.birthMs;
      if (age > RIPPLE_LIFE_MS) {
        this.ripples.splice(i, 1);
        continue;
      }
      const t = age / RIPPLE_LIFE_MS;
      const radius = RIPPLE_MAX_RADIUS * t;
      const a = (1 - t) * 0.5;
      this.rippleGraphics
        .circle(r.x, r.y, radius)
        .stroke({ color: 0xffffff, width: 1, alpha: a });
    }
  }

  private updateHud(world: World): void {
    const elapsedSec = (world.elapsedMs / 1000).toFixed(1);
    this.hudText.text = `level: ${world.level.id} (${world.level.name})   tick: ${world.tick}   t: ${elapsedSec}s`;

    if (world.status === 'won') {
      this.statusText.text = 'VICTORY\nR — retry   N — next';
    } else if (world.status === 'lost') {
      this.statusText.text = 'DEFEATED\nR — retry';
    } else {
      this.statusText.text = '';
    }
    if (this.statusText.text) {
      this.statusText.position.set(this.app.renderer.width / 2, this.app.renderer.height / 2);
    }
  }

  addClickRipple(x: number, y: number, nowMs: number): void {
    this.ripples.push({ x, y, birthMs: nowMs });
  }

  destroy(): void {
    for (const v of this.nodeViews.values()) v.destroy();
    for (const v of this.unitViews.values()) v.destroy();
    this.nodeViews.clear();
    this.unitViews.clear();
    this.selectionBoxView.destroy();
    if (this.app.canvas.parentElement === this.host) {
      this.host.removeChild(this.app.canvas);
    }
    this.app.destroy(true, { children: true });
  }
}
