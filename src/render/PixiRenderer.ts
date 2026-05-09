// PixiRenderer — bootstraps a PIXI.Application and renders engine state.
// Reads from World, never writes. (§3.1, §10)
//
// Phase 0: empty canvas plus a tiny tick/elapsed text and transient click ripples.
// In later phases this layer grows NodeView, UnitGroupView, etc.

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { World } from '../engine/World';

interface ClickRipple {
  x: number;
  y: number;
  birthMs: number;
}

const RIPPLE_LIFE_MS = 700;
const RIPPLE_MAX_RADIUS = 32;

export class PixiRenderer {
  readonly app: Application;
  private readonly host: HTMLElement;
  private readonly debugLayer: Container;
  private readonly ripples: ClickRipple[] = [];
  private readonly tickLabel: Text;
  private readonly clickGraphics: Graphics;
  private startTimeMs = 0;

  private constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.host = host;

    this.debugLayer = new Container();
    this.app.stage.addChild(this.debugLayer);

    this.clickGraphics = new Graphics();
    this.debugLayer.addChild(this.clickGraphics);

    this.tickLabel = new Text({
      text: 'tick: 0',
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0x888888,
      },
    });
    this.tickLabel.position.set(12, 10);
    this.debugLayer.addChild(this.tickLabel);
  }

  static async create(host: HTMLElement): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      background: '#0a0a0a',
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
    });
    host.appendChild(app.canvas);
    return new PixiRenderer(app, host);
  }

  render(world: World, _alpha: number, nowMs: number): void {
    if (this.startTimeMs === 0) this.startTimeMs = nowMs;

    this.tickLabel.text = `tick: ${world.tick}   elapsed: ${(world.elapsedMs / 1000).toFixed(2)}s   |   click anywhere`;

    this.clickGraphics.clear();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      const age = nowMs - r.birthMs;
      if (age > RIPPLE_LIFE_MS) {
        this.ripples.splice(i, 1);
        continue;
      }
      const t = age / RIPPLE_LIFE_MS;
      const radius = RIPPLE_MAX_RADIUS * t;
      const alpha = 1 - t;
      this.clickGraphics.circle(r.x, r.y, radius).stroke({ color: 0x3da9fc, width: 2, alpha });
    }
  }

  addClickRipple(x: number, y: number, nowMs: number): void {
    this.ripples.push({ x, y, birthMs: nowMs });
  }

  destroy(): void {
    if (this.app.canvas.parentElement === this.host) {
      this.host.removeChild(this.app.canvas);
    }
    this.app.destroy(true, { children: true });
  }
}
