// NodeView — renders one Node (§10.3).
// Layout (back to front):
//   - selection ring (outside)
//   - chrome (rounded square, owner-colored outline)
//   - liquid layer (animated sloshing fill, masked by inner shape)
//   - level pips along top edge
//   - units label

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Node } from '../../engine/entities/Node';
import type { ContentLibrary } from '../../engine/content/ContentLibrary';
import type { World, Player } from '../../engine/World';
import {
  colorFromHex,
  hexagonPoints,
  metricsForType,
  trianglePoints,
  NODE_SPRITE_SCALE_FACTOR,
  type ShapeKind,
} from '../shapes';
import { buildLiquidPolyPoints } from '../liquidAnimator';
import { getNodeTexture } from '../sprites/nodeSprites';

const NEUTRAL_OUTLINE = 0x666666;
const SELECTION_COLOR = 0xffffff;
const CHROME_BG = 0x1c1c22;

function drawShape(g: Graphics, kind: ShapeKind, size: number, cornerRadius: number): void {
  const half = size / 2;
  switch (kind) {
    case 'roundedSquare':
      g.roundRect(-half, -half, size, size, cornerRadius);
      return;
    case 'circle':
      g.circle(0, 0, half);
      return;
    case 'hexagon':
      g.poly(hexagonPoints(size));
      return;
    case 'triangle':
      g.poly(trianglePoints(size));
      return;
  }
}

export class NodeView {
  readonly container: Container;
  private readonly selectionRing: Graphics;
  private readonly chrome: Graphics;
  private readonly liquidLayer: Container;
  private readonly liquid: Graphics;
  private readonly liquidMask: Graphics;
  private readonly towerSprite: Sprite;
  private readonly effectsLayer: Graphics;
  private readonly pips: Graphics;
  private readonly unitsLabel: Text;
  private readonly nodeId: string;
  private currentSize = 0;

  constructor(node: Node) {
    this.nodeId = node.id;
    this.container = new Container();
    this.container.position.set(node.position.x, node.position.y);

    this.selectionRing = new Graphics();
    this.chrome = new Graphics();
    this.liquidLayer = new Container();
    this.liquid = new Graphics();
    this.liquidMask = new Graphics();
    this.towerSprite = new Sprite();
    this.towerSprite.anchor.set(0.5, 0.55); // slight downward bias so the
    // tower body looks anchored at the node center; the dirt-base sits
    // below, the spire/flag above.
    this.towerSprite.visible = false;
    this.effectsLayer = new Graphics();
    this.pips = new Graphics();

    this.liquidLayer.addChild(this.liquid);
    this.liquidLayer.addChild(this.liquidMask);
    this.liquidLayer.mask = this.liquidMask;

    this.unitsLabel = new Text({
      text: '0',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fill: 0xffffff,
        fontWeight: '600',
        align: 'center',
      },
    });
    this.unitsLabel.anchor.set(0.5);

    this.container.addChild(this.selectionRing);
    this.container.addChild(this.chrome);
    this.container.addChild(this.liquidLayer);
    this.container.addChild(this.towerSprite);
    this.container.addChild(this.effectsLayer);
    this.container.addChild(this.pips);
    this.container.addChild(this.unitsLabel);
  }

  update(
    node: Node,
    world: World,
    content: ContentLibrary,
    selected: boolean,
    nowMs: number,
    alpha: number,
    targetingFromHere = false,
  ): void {
    // Position interpolation (§3.4). In Phase 1 nodes don't move, but the lerp
    // is wired in for free.
    const px = node.previousPosition.x + (node.position.x - node.previousPosition.x) * alpha;
    const py = node.previousPosition.y + (node.position.y - node.previousPosition.y) * alpha;
    this.container.position.set(px, py);

    const metrics = metricsForType(node.nodeType, node.level, world.visualScale);
    const size = metrics.size;
    const half = size / 2;
    const radius = metrics.cornerRadius;
    const kind = metrics.kind;

    const owner = node.ownerId
      ? world.players.find((p: Player) => p.id === node.ownerId)
      : undefined;
    const ownerColor = owner ? colorFromHex(owner.color) : NEUTRAL_OUTLINE;

    const factionDef = content.factions[node.faction];
    const liquidColor = factionDef ? colorFromHex(factionDef.color) : 0x3da9fc;

    // Sprite path (v2.8.1): when this node's (type × faction) texture is
    // available, render the sprite in place of the procedural shape.
    const nodeTex = getNodeTexture(node.nodeType, node.faction);
    const useSprite = nodeTex !== null;

    // Visual bounding box for layout of selection/pips/label/effects.
    let visualHalfY = half;
    let visualHalfX = half;

    if (useSprite) {
      this.towerSprite.visible = true;
      this.towerSprite.texture = nodeTex;
      const tex = nodeTex;
      const scaleFactor = NODE_SPRITE_SCALE_FACTOR[node.nodeType];
      const displayW = size * scaleFactor;
      const scale = displayW / tex.width;
      this.towerSprite.scale.set(scale);
      // Hide the procedural chrome + liquid layers entirely.
      this.chrome.clear();
      this.liquid.clear();
      this.liquidMask.clear();
      visualHalfX = (tex.width * scale) / 2;
      visualHalfY = (tex.height * scale) / 2;
    } else {
      this.towerSprite.visible = false;
    }

    // No procedural ground shadow for sprite nodes: each building source
    // already includes its own dirt/grass platform that grounds it.
    // Stacking a generic ellipse below it created a visible "two-grounds"
    // artifact (v2.8.2 ellipse → removed in v2.8.4).

    // Selection ring — outline at the same shape, padded outward by 6px.
    this.selectionRing.clear();
    if (selected) {
      if (useSprite) {
        // Rounded rectangle hugging the sprite's actual footprint.
        this.selectionRing.roundRect(
          -visualHalfX - 6,
          -visualHalfY - 6,
          visualHalfX * 2 + 12,
          visualHalfY * 2 + 12,
          10,
        );
        this.selectionRing.stroke({ color: SELECTION_COLOR, width: 2, alpha: 0.85 });
      } else {
        drawShape(this.selectionRing, kind, size + 12, radius + 6);
        this.selectionRing.stroke({ color: SELECTION_COLOR, width: 2, alpha: 0.85 });
      }
    }

    if (!useSprite) {
      // Chrome — bg fill + owner-color stroke, drawn in the node's shape.
      this.chrome.clear();
      drawShape(this.chrome, kind, size, radius);
      this.chrome.fill({ color: CHROME_BG, alpha: 0.95 });
      drawShape(this.chrome, kind, size, radius);
      this.chrome.stroke({ color: ownerColor, width: 2.5, alpha: 0.95 });

      // Liquid mask — same shape, slightly inset so it sits cleanly inside.
      const inset = 2;
      if (size !== this.currentSize) {
        this.currentSize = size;
      }
      this.liquidMask.clear();
      drawShape(this.liquidMask, kind, size - inset * 2, Math.max(2, radius - inset));
      this.liquidMask.fill({ color: 0xffffff });

      // Liquid wavy fill.
      const fillRatio = node.maxUnits > 0 ? node.units / node.maxUnits : 0;
      const polyPts = buildLiquidPolyPoints(size, size, fillRatio, nowMs);
      this.liquid
        .clear()
        .poly(polyPts)
        .fill({ color: liquidColor, alpha: 0.92 });
    }

    // Level pips along top edge. For sprites, sit above the sprite's actual
    // bounding box (the tower's spire top), not the small `half`.
    this.pips.clear();
    const pipY = useSprite ? -visualHalfY - 6 : -half - 7;
    if (node.level > 1) {
      const pipRadius = 2.2;
      const spacing = 8;
      const totalW = (node.level - 1) * spacing;
      const startX = -totalW / 2;
      for (let i = 0; i < node.level; i++) {
        this.pips
          .circle(startX + i * spacing, pipY, pipRadius)
          .fill({ color: ownerColor, alpha: 0.95 });
      }
    } else {
      this.pips.circle(0, pipY, 2.2).fill({ color: ownerColor, alpha: 0.95 });
    }

    // Units number — floor(units) per §4.2. For sprite towers we drop the
    // label below the tower (the building body covers the center anchor).
    this.unitsLabel.text = Math.floor(node.units).toString();
    this.unitsLabel.position.set(0, useSprite ? visualHalfY + 10 : 0);

    // ── Spell / status effects layer ─────────────────────────────────
    this.effectsLayer.clear();

    // Concoction progress arc on Lab.
    if (node.spellQueue && node.spellQueue.state === 'concocting') {
      const r = half + 5;
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * node.spellQueue.progress;
      this.effectsLayer
        .arc(0, 0, r, startAngle, endAngle)
        .stroke({ color: 0xc6a8ff, width: 2.5, alpha: 0.9 });
      // Faint full ring as track.
      this.effectsLayer
        .circle(0, 0, r)
        .stroke({ color: 0xc6a8ff, width: 1, alpha: 0.18 });
    }

    // Ready: pulsing outer ring.
    if (node.spellQueue && node.spellQueue.state === 'ready') {
      const pulse = 0.55 + 0.4 * Math.sin(nowMs * 0.008);
      const r = half + 6;
      this.effectsLayer
        .circle(0, 0, r)
        .stroke({ color: 0xc6a8ff, width: 2.5, alpha: pulse });
      // Inner solid ring as steady indicator.
      this.effectsLayer
        .circle(0, 0, half + 2)
        .stroke({ color: 0xc6a8ff, width: 1.5, alpha: 0.55 });
    }

    // Targeting source — distinct emphasis so the player remembers
    // which Lab is awaiting a target click.
    if (targetingFromHere) {
      const breath = 0.7 + 0.3 * Math.sin(nowMs * 0.012);
      drawShape(this.effectsLayer, kind, size + 16, radius + 8);
      this.effectsLayer.stroke({ color: 0x9be29b, width: 2.5, alpha: breath });
    }

    // Frozen overlay — translucent cyan over the chrome shape (or the sprite
    // footprint for towers).
    if (node.isFrozen) {
      if (useSprite) {
        this.effectsLayer
          .roundRect(-visualHalfX, -visualHalfY, visualHalfX * 2, visualHalfY * 2, 10)
          .fill({ color: 0x9fdcff, alpha: 0.32 })
          .roundRect(-visualHalfX, -visualHalfY, visualHalfX * 2, visualHalfY * 2, 10)
          .stroke({ color: 0xcdefff, width: 1.5, alpha: 0.85 });
      } else {
        drawShape(this.effectsLayer, kind, size, radius);
        this.effectsLayer.fill({ color: 0x9fdcff, alpha: 0.32 });
        drawShape(this.effectsLayer, kind, size, radius);
        this.effectsLayer.stroke({ color: 0xcdefff, width: 1.5, alpha: 0.85 });
      }
    }

    // Starve indicator — small green dots circling the perimeter,
    // count = stack count (capped at 4).
    if (node.starveStacks.length > 0) {
      const stackCount = Math.min(4, node.starveStacks.length);
      const r = useSprite ? Math.max(visualHalfX, visualHalfY) + 9 : half + 9;
      for (let i = 0; i < stackCount; i++) {
        const a = (Math.PI * 2 * i) / stackCount + nowMs * 0.001;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        this.effectsLayer.circle(x, y, 2.5).fill({ color: 0x6dc26d, alpha: 0.95 });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  get id(): string {
    return this.nodeId;
  }
}
