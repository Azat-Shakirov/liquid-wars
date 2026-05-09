// NodeView — renders one Node (§10.3).
// Layout (back to front):
//   - selection ring (outside)
//   - chrome (rounded square, owner-colored outline)
//   - liquid layer (animated sloshing fill, masked by inner shape)
//   - level pips along top edge
//   - units label

import { Container, Graphics, Text } from 'pixi.js';
import type { Node } from '../../engine/entities/Node';
import type { ContentLibrary } from '../../engine/content/ContentLibrary';
import type { World, Player } from '../../engine/World';
import { colorFromHex, metricsForType } from '../shapes';
import { buildLiquidPolyPoints } from '../liquidAnimator';

const NEUTRAL_OUTLINE = 0x666666;
const SELECTION_COLOR = 0xffffff;
const CHROME_BG = 0x1c1c22;

export class NodeView {
  readonly container: Container;
  private readonly selectionRing: Graphics;
  private readonly chrome: Graphics;
  private readonly liquidLayer: Container;
  private readonly liquid: Graphics;
  private readonly liquidMask: Graphics;
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
  ): void {
    // Position interpolation (§3.4). In Phase 1 nodes don't move, but the lerp
    // is wired in for free.
    const px = node.previousPosition.x + (node.position.x - node.previousPosition.x) * alpha;
    const py = node.previousPosition.y + (node.position.y - node.previousPosition.y) * alpha;
    this.container.position.set(px, py);

    const metrics = metricsForType(node.nodeType, node.level);
    const size = metrics.size;
    const half = size / 2;
    const radius = metrics.cornerRadius;

    const owner = node.ownerId
      ? world.players.find((p: Player) => p.id === node.ownerId)
      : undefined;
    const ownerColor = owner ? colorFromHex(owner.color) : NEUTRAL_OUTLINE;

    const liquidDef = content.liquids[node.liquidType];
    const liquidColor = liquidDef ? colorFromHex(liquidDef.color) : 0x3da9fc;

    // Selection ring (drawn even at size 0 if selected, else cleared).
    this.selectionRing.clear();
    if (selected) {
      this.selectionRing
        .roundRect(-half - 6, -half - 6, size + 12, size + 12, radius + 6)
        .stroke({ color: SELECTION_COLOR, width: 2, alpha: 0.85 });
    }

    // Chrome — bg fill + owner-color stroke.
    this.chrome
      .clear()
      .roundRect(-half, -half, size, size, radius)
      .fill({ color: CHROME_BG, alpha: 0.95 })
      .roundRect(-half, -half, size, size, radius)
      .stroke({ color: ownerColor, width: 2.5, alpha: 0.95 });

    // Liquid mask — same shape, slightly inset so it sits cleanly inside.
    const inset = 2;
    if (size !== this.currentSize) {
      this.currentSize = size;
    }
    this.liquidMask
      .clear()
      .roundRect(-half + inset, -half + inset, size - inset * 2, size - inset * 2, Math.max(2, radius - inset))
      .fill({ color: 0xffffff });

    // Liquid wavy fill.
    const fillRatio = node.maxUnits > 0 ? node.units / node.maxUnits : 0;
    const polyPts = buildLiquidPolyPoints(size, size, fillRatio, nowMs);
    this.liquid
      .clear()
      .poly(polyPts)
      .fill({ color: liquidColor, alpha: 0.92 });

    // Level pips along top edge.
    this.pips.clear();
    if (node.level > 1) {
      const pipRadius = 2.2;
      const spacing = 8;
      const totalW = (node.level - 1) * spacing;
      const startX = -totalW / 2;
      for (let i = 0; i < node.level; i++) {
        this.pips
          .circle(startX + i * spacing, -half - 7, pipRadius)
          .fill({ color: ownerColor, alpha: 0.95 });
      }
    } else {
      this.pips.circle(0, -half - 7, 2.2).fill({ color: ownerColor, alpha: 0.95 });
    }

    // Units number — floor(units) per §4.2.
    this.unitsLabel.text = Math.floor(node.units).toString();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  get id(): string {
    return this.nodeId;
  }
}
