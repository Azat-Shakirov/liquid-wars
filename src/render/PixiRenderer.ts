// PixiRenderer — bootstraps a PIXI.Application and renders engine state.
// Reads from World + SessionState, never writes. (§3.1, §10)
//
// Layered stage (§10.1):
//   1. Background          — dark canvas (Phase 1)
//   2. Walls               — static terrain polylines (Phase 3)
//   3. Connection hints    — drag/hover line from selected source(s) to target
//   4. Nodes               — NodeView containers
//   5. Tower attack range  — Phase 2
//   6. Unit groups         — UnitGroupView containers
//   7. Spell effects       — Phase 2
//   8. Selection box       — dashed rectangle while box-selecting
//   9. HUD overlay         — tick counter / status string

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { World } from '../engine/World';
import type { ContentLibrary } from '../engine/content/ContentLibrary';
import type { TowerShot } from '../engine/systems/TowerInterceptSystem';
import { pathCacheKey } from '../engine/PathSystem';
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

interface RenderedBeam {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: number;
  birthMs: number;
}

const RIPPLE_LIFE_MS = 600;
const RIPPLE_MAX_RADIUS = 28;
const BEAM_LIFE_MS = 220;

export class PixiRenderer {
  readonly app: Application;
  private readonly host: HTMLElement;
  private readonly content: ContentLibrary;

  // v2.7.5: world layers attach to worldRoot (which we scale+translate
  // per level via world.preferredView). The HUD layer attaches directly
  // to stage so overlay text doesn't zoom with the world.
  private readonly worldRoot: Container;
  private readonly bgLayer: Container;
  private readonly wallsLayer: Container;
  private readonly rangeLayer: Container;
  private readonly hintLayer: Container;
  private readonly nodeLayer: Container;
  private readonly unitLayer: Container;
  private readonly beamLayer: Container;
  private readonly boxLayer: Container;
  private readonly hudLayer: Container;

  private readonly hintGraphics: Graphics;
  private readonly rippleGraphics: Graphics;
  private readonly rangeGraphics: Graphics;
  private readonly beamGraphics: Graphics;
  private readonly wallsGraphics: Graphics;
  private readonly selectionBoxView: SelectionBoxView;
  private readonly hudText: Text;
  private readonly statusText: Text;

  // Walls are static per level — redraw only when the level id changes.
  private lastWallsLevelId: number | null = null;

  private readonly nodeViews = new Map<string, NodeView>();
  private readonly unitViews = new Map<string, UnitGroupView>();
  private readonly ripples: ClickRipple[] = [];
  private readonly beams: RenderedBeam[] = [];
  // Dedupe key per shot — `${firedAtTick}-${fromNodeId}` is unique
  // because a single tower fires at most once per tick.
  private ingestedShotKeys = new Set<string>();

  private constructor(app: Application, host: HTMLElement, content: ContentLibrary) {
    this.app = app;
    this.host = host;
    this.content = content;

    this.worldRoot = new Container();
    this.bgLayer = new Container();
    this.wallsLayer = new Container();
    this.rangeLayer = new Container();
    this.hintLayer = new Container();
    this.nodeLayer = new Container();
    this.unitLayer = new Container();
    this.beamLayer = new Container();
    this.boxLayer = new Container();
    this.hudLayer = new Container();

    this.app.stage.addChild(this.worldRoot);
    this.worldRoot.addChild(this.bgLayer);
    this.worldRoot.addChild(this.wallsLayer);
    this.worldRoot.addChild(this.rangeLayer);
    this.worldRoot.addChild(this.hintLayer);
    this.worldRoot.addChild(this.nodeLayer);
    this.worldRoot.addChild(this.unitLayer);
    this.worldRoot.addChild(this.beamLayer);
    this.worldRoot.addChild(this.boxLayer);
    // HUD stays at canvas scale.
    this.app.stage.addChild(this.hudLayer);

    this.wallsGraphics = new Graphics();
    this.wallsLayer.addChild(this.wallsGraphics);

    this.hintGraphics = new Graphics();
    this.hintLayer.addChild(this.hintGraphics);

    this.rippleGraphics = new Graphics();
    this.hintLayer.addChild(this.rippleGraphics);

    this.rangeGraphics = new Graphics();
    this.rangeLayer.addChild(this.rangeGraphics);

    this.beamGraphics = new Graphics();
    this.beamLayer.addChild(this.beamGraphics);

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

  render(
    world: World,
    session: SessionState,
    alpha: number,
    nowMs: number,
    recentTowerShots: ReadonlyArray<TowerShot> = [],
  ): void {
    this.applyViewTransform(world);
    this.syncWalls(world);
    this.syncNodes(world, session, nowMs, alpha);
    this.syncUnitGroups(world, alpha);
    this.drawHints(world, session);
    this.drawTowerRanges(world, session);
    this.ingestTowerShots(recentTowerShots, world, nowMs);
    this.drawTowerBeams(nowMs);
    this.selectionBoxView.update(session.boxSelect);
    this.drawRipples(nowMs);
    this.updateHud(world);
  }

  // v2.7.5: fit world.preferredView into the host canvas. Uniform scale,
  // centered translation. World layers go through worldRoot; the HUD
  // layer is on stage directly so its text stays at canvas scale.
  private applyViewTransform(world: World): void {
    const view = world.preferredView;
    const canvasW = this.app.renderer.width / (this.app.renderer.resolution || 1);
    const canvasH = this.app.renderer.height / (this.app.renderer.resolution || 1);
    if (view.width <= 0 || view.height <= 0 || canvasW <= 0 || canvasH <= 0) return;
    const scale = Math.min(canvasW / view.width, canvasH / view.height);
    const tx = (canvasW - view.width  * scale) / 2 - view.x * scale;
    const ty = (canvasH - view.height * scale) / 2 - view.y * scale;
    this.worldRoot.scale.set(scale);
    this.worldRoot.position.set(tx, ty);
  }

  // Walls are static per level — only redraw when the level changes.
  private syncWalls(world: World): void {
    if (this.lastWallsLevelId === world.level.id) return;
    this.lastWallsLevelId = world.level.id;
    this.wallsGraphics.clear();
    for (const wall of world.walls) {
      if (wall.points.length < 2) continue;
      // Soft drop shadow under the wall — adds presence on the dark bg.
      this.wallsGraphics.moveTo(wall.points[0]!.x, wall.points[0]!.y + 2);
      for (let i = 1; i < wall.points.length; i++) {
        this.wallsGraphics.lineTo(wall.points[i]!.x, wall.points[i]!.y + 2);
      }
      this.wallsGraphics.stroke({ color: 0x000000, width: 9, alpha: 0.45, cap: 'round', join: 'round' });

      // Main wall body — stone grey.
      this.wallsGraphics.moveTo(wall.points[0]!.x, wall.points[0]!.y);
      for (let i = 1; i < wall.points.length; i++) {
        this.wallsGraphics.lineTo(wall.points[i]!.x, wall.points[i]!.y);
      }
      this.wallsGraphics.stroke({ color: 0x4a4a4a, width: 7, alpha: 1.0, cap: 'round', join: 'round' });

      // Highlight pass — thin lighter centerline for a beveled look.
      this.wallsGraphics.moveTo(wall.points[0]!.x, wall.points[0]!.y);
      for (let i = 1; i < wall.points.length; i++) {
        this.wallsGraphics.lineTo(wall.points[i]!.x, wall.points[i]!.y);
      }
      this.wallsGraphics.stroke({ color: 0x6a6a6a, width: 2, alpha: 0.9, cap: 'round', join: 'round' });
    }
  }

  // Polyline path between two nodes — cached one if present, else direct
  // [from, to]. Returns null if the pair is explicitly unreachable.
  private polylineForPair(
    world: World,
    fromId: string,
    toId: string,
  ): { x: number; y: number }[] | null {
    const cached = world.pathCache.get(pathCacheKey(fromId, toId));
    if (cached === null) return null;
    if (cached === undefined) {
      const a = world.nodes.get(fromId);
      const b = world.nodes.get(toId);
      if (!a || !b) return null;
      return [{ ...a.position }, { ...b.position }];
    }
    return cached.map((p) => ({ x: p.x, y: p.y }));
  }

  private drawTowerRanges(world: World, session: SessionState): void {
    this.rangeGraphics.clear();
    if (session.selectedNodeIds.size === 0) return;
    for (const id of session.selectedNodeIds) {
      const n = world.nodes.get(id);
      if (!n || n.nodeType !== 'tower') continue;
      const def = this.content.nodeTypes[n.nodeType];
      const lv = def?.levels.find((l) => l.level === n.level);
      const range = lv?.attackRange;
      if (range === undefined || range <= 0) continue;
      const owner = n.ownerId
        ? world.players.find((p) => p.id === n.ownerId)
        : undefined;
      const color = owner ? colorFromHex(owner.color) : 0xffffff;
      this.rangeGraphics
        .circle(n.position.x, n.position.y, range)
        .fill({ color, alpha: 0.04 })
        .circle(n.position.x, n.position.y, range)
        .stroke({ color, width: 1, alpha: 0.35 });
    }
  }

  private ingestTowerShots(
    shots: ReadonlyArray<TowerShot>,
    world: World,
    nowMs: number,
  ): void {
    if (shots.length === 0) return;
    for (const shot of shots) {
      const key = `${shot.firedAtTick}-${shot.fromNodeId}`;
      if (this.ingestedShotKeys.has(key)) continue;
      this.ingestedShotKeys.add(key);
      const tower = world.nodes.get(shot.fromNodeId);
      const owner = tower?.ownerId
        ? world.players.find((p) => p.id === tower.ownerId)
        : undefined;
      const color = owner ? colorFromHex(owner.color) : 0xffffff;
      this.beams.push({
        fromX: shot.fromPos.x,
        fromY: shot.fromPos.y,
        toX: shot.toPos.x,
        toY: shot.toPos.y,
        color,
        birthMs: nowMs,
      });
    }
    // Bound the dedupe set so it doesn't grow forever during long sessions.
    if (this.ingestedShotKeys.size > 4096) {
      this.ingestedShotKeys = new Set(
        Array.from(this.ingestedShotKeys).slice(-1024),
      );
    }
  }

  private drawTowerBeams(nowMs: number): void {
    this.beamGraphics.clear();
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]!;
      const age = nowMs - b.birthMs;
      if (age > BEAM_LIFE_MS) {
        this.beams.splice(i, 1);
        continue;
      }
      const t = age / BEAM_LIFE_MS;
      const alpha = 1 - t;
      this.beamGraphics
        .moveTo(b.fromX, b.fromY)
        .lineTo(b.toX, b.toY)
        .stroke({ color: b.color, width: 2, alpha: alpha * 0.85 });
    }
  }

  private syncNodes(world: World, session: SessionState, nowMs: number, alpha: number): void {
    const present = new Set<string>();
    const targetingId = session.targetingFromLabId;
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
      view.update(
        node,
        world,
        this.content,
        session.selectedNodeIds.has(id),
        nowMs,
        alpha,
        targetingId === id,
      );
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
        // When dragging over an actual target, preview the cached path
        // polyline. While the cursor is mid-air, fall back to a straight
        // rubber-band to the cursor.
        if (targetNode) {
          const poly = this.polylineForPair(world, fromId, targetNode.id);
          if (poly === null) {
            // Unreachable — draw a faint X across the link to make it visible.
            this.hintGraphics
              .moveTo(from.position.x, from.position.y)
              .lineTo(tipX, tipY)
              .stroke({ color: 0xff5050, width: 1.5, alpha: 0.45 });
          } else {
            this.strokePolyline(poly, color, 1.5, 0.85);
          }
          this.hintGraphics
            .circle(targetNode.position.x, targetNode.position.y, 22)
            .stroke({ color, width: 2, alpha: 0.9 });
        } else {
          this.hintGraphics
            .moveTo(from.position.x, from.position.y)
            .lineTo(tipX, tipY)
            .stroke({ color, width: 1.5, alpha: 0.45 });
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
          const poly = this.polylineForPair(world, sid, hovered.id);
          if (poly === null) {
            this.hintGraphics
              .moveTo(source.position.x, source.position.y)
              .lineTo(hovered.position.x, hovered.position.y)
              .stroke({ color: 0xff5050, width: 1.5, alpha: 0.35 });
          } else {
            this.strokePolyline(poly, color, 1.5, 0.45);
          }
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

  private strokePolyline(
    poly: { x: number; y: number }[],
    color: number,
    width: number,
    alpha: number,
  ): void {
    if (poly.length < 2) return;
    this.hintGraphics.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) {
      this.hintGraphics.lineTo(poly[i]!.x, poly[i]!.y);
    }
    this.hintGraphics.stroke({ color, width, alpha, cap: 'round', join: 'round' });
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
