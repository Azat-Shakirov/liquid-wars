// UnitGroupView — renders one in-flight UnitGroup as a marching infantry
// sprite. Two walk-cycle frames alternate every WALK_FRAME_MS to animate
// the step; sprite mirrors horizontally based on heading so the soldier
// faces the way they walk.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { UnitGroup } from '../../engine/entities/UnitGroup';
import type { ContentLibrary } from '../../engine/content/ContentLibrary';
import type { World } from '../../engine/World';
import { colorFromHex } from '../shapes';
import { getUnitFrame } from '../sprites/unitSprites';

// Sprite display height at world.visualScale = 1. Soldiers ought to read
// as comparable in scale to a base-size tower (~76 px high after the 1.7×
// factor) but smaller — a unit not a building.
const SPRITE_BASE_DISPLAY_HEIGHT = 30;
const WALK_FRAME_MS = 220;

// Walk animation (v2.8.5): one full bob+wobble cycle per pair of frame swaps,
// i.e. one cycle per step. Pixi Y is down, so we bob the sprite up (negative
// Y offset) relative to its container. The container origin stays glued to
// the ground so the foot-shadow + particle-puffs don't move with the body.
const BOB_PHASE_RATE = Math.PI / WALK_FRAME_MS; // rad/ms — π per frame swap
const BOB_AMPLITUDE = 1.6;                       // px at visualScale = 1
const WOBBLE_AMPLITUDE = 0.05;                   // ±0.05 rad ≈ ±2.9°
const PUFF_INTERVAL_MS = 280;                    // dust every ~0.28s while moving
const PUFF_LIFETIME_MS = 520;                    // fade-out duration per puff

interface FootPuff {
  graphics: Graphics;
  spawnedMs: number;
  baseRX: number;
  baseRY: number;
  driftX: number;
}

function countScale(count: number): number {
  const c = Math.max(1, count);
  return Math.min(1.5, 0.85 + Math.sqrt(c) * 0.06);
}

export class UnitGroupView {
  readonly container: Container;
  // Foot-puff dust particles live in a world-space layer (owned by
  // PixiRenderer), not in this container — the container moves with the
  // unit each frame; particles need to stay where they were spawned.
  private readonly particleLayer: Container;
  // Faction-colored ring on the ground under the unit. Strategy-game
  // team marker (AoE/SC2 style) — survives at any zoom and instantly
  // identifies whose unit this is, where the cape-recolor alone reads
  // too subtle at game scale.
  private readonly teamRing: Graphics;
  private readonly groundShadow: Graphics;
  private readonly droplet: Graphics;
  private readonly sprite: Sprite;
  private readonly label: Text;
  private readonly groupId: string;
  // Source-image soldiers face their LEFT (sword + cape on their left side).
  // We treat that as the "natural" heading; if the group is moving right we
  // flip horizontally so the soldier faces right.
  private facingRight = false;
  // Walk animation state. lastPuffMs gates new puff emission (every
  // PUFF_INTERVAL_MS while moving).
  private lastPuffMs = 0;
  private readonly puffs: FootPuff[] = [];

  constructor(ug: UnitGroup, particleLayer: Container) {
    this.groupId = ug.id;
    this.container = new Container();
    this.particleLayer = particleLayer;
    this.teamRing = new Graphics();
    this.groundShadow = new Graphics();
    this.droplet = new Graphics();
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 0.55);
    this.sprite.visible = false;
    this.label = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fill: 0xffffff,
        fontWeight: '600',
      },
    });
    this.label.anchor.set(0.5, -1.0);
    // Z-order: team ring (outer ground marker) → contact shadow (dark
    // ellipse inside it) → procedural droplet (fallback) → sprite → label.
    this.container.addChild(this.teamRing);
    this.container.addChild(this.groundShadow);
    this.container.addChild(this.droplet);
    this.container.addChild(this.sprite);
    this.container.addChild(this.label);
  }

  update(
    ug: UnitGroup,
    world: World,
    content: ContentLibrary,
    alpha: number,
    nowMs: number,
  ): void {
    const px = ug.previousPosition.x + (ug.position.x - ug.previousPosition.x) * alpha;
    const py = ug.previousPosition.y + (ug.position.y - ug.previousPosition.y) * alpha;
    this.container.position.set(px, py);

    // Heading: use the tick-delta. Only update facing when the delta is
    // big enough to be meaningful — avoids flickering at stationary moments.
    const dx = ug.position.x - ug.previousPosition.x;
    if (dx > 0.5) this.facingRight = true;
    else if (dx < -0.5) this.facingRight = false;

    const frame = Math.floor(nowMs / WALK_FRAME_MS) & 1;
    // Resolve archetype from the owning player (player → archetype, not
    // unit-group → archetype, because the unit group inherits the player's
    // archetype at spawn time). Fall back to 'infantry' if the lookup fails
    // (shouldn't happen — every player has an archetype as of v2.8.0).
    const ownerPlayer = world.players.find((p) => p.id === ug.ownerId);
    const archetype = ownerPlayer?.archetype ?? 'infantry';
    const tex = getUnitFrame(archetype, ug.sourceFaction, frame);

    // Distance moved this tick — used as the "is the unit moving?" gate for
    // bob/lean/foot-puff. Stationary clumps (e.g. just-arrived) don't bob.
    const dy = ug.position.y - ug.previousPosition.y;
    const moving = Math.abs(dx) + Math.abs(dy) > 0.25;

    if (tex !== null) {
      this.sprite.visible = true;
      this.sprite.texture = tex;
      const cs = countScale(ug.count);
      const displayH = SPRITE_BASE_DISPLAY_HEIGHT * world.visualScale * cs;
      const baseScale = displayH / tex.height;
      this.sprite.scale.set(this.facingRight ? -baseScale : baseScale, baseScale);
      this.droplet.clear();

      const spriteHalfH = (tex.height * baseScale) / 2;
      const spriteHalfW = (tex.width * baseScale) / 2;

      // ── Walk animation (v2.8.5) ───────────────────────────────────────
      // Bob: lift the sprite up (negative Y) on the upswing of a step;
      // the container stays glued to the ground so the shadow + puffs
      // remain on the floor.  Wobble: small rocking rotation in sync with
      // the bob — reads as a marching step rather than a static glide.
      if (moving) {
        const bobPhase = nowMs * BOB_PHASE_RATE;
        const bobY = -Math.abs(Math.sin(bobPhase)) * BOB_AMPLITUDE * world.visualScale;
        const wobble = Math.sin(bobPhase) * WOBBLE_AMPLITUDE;
        this.sprite.position.set(0, bobY);
        this.sprite.rotation = this.facingRight ? -wobble : wobble;
      } else {
        this.sprite.position.set(0, 0);
        this.sprite.rotation = 0;
      }

      // Tight contact shadow at the soldier's feet. Anchor on the sprite
      // is (0.5, 0.55) so the bottom of the sprite is at +spriteHalfH * 0.9.
      // The shadow ellipse is small (a third of the sprite width) and sits
      // a hair above the bottom edge so it reads as feet-on-ground rather
      // than a wide blob below.
      this.groundShadow.clear();
      const sShadowRX = Math.max(3, spriteHalfW * 0.32);
      const sShadowRY = Math.max(1.5, spriteHalfH * 0.07);
      const sShadowCY = spriteHalfH * 0.85;
      this.groundShadow
        .ellipse(0, sShadowCY, sShadowRX, sShadowRY)
        .fill({ color: 0x000000, alpha: 0.40 });

      // Faction team ring. Same Y as the contact shadow, but ~1.7×
      // wider — sits as a visible colored halo around the soldier's
      // feet. Filled with the faction color at low alpha + a stroke at
      // full alpha so the ring reads cleanly even when overlapping the
      // contact shadow underneath.
      const factionDef = content.factions[ug.sourceFaction];
      const factionColor = factionDef ? colorFromHex(factionDef.color) : 0xffffff;
      const ringRX = sShadowRX * 1.7;
      const ringRY = sShadowRY * 1.7;
      this.teamRing.clear()
        .ellipse(0, sShadowCY, ringRX, ringRY)
        .fill({ color: factionColor, alpha: 0.30 })
        .ellipse(0, sShadowCY, ringRX, ringRY)
        .stroke({ color: factionColor, width: 1.8, alpha: 0.95 });

      this.label.position.set(0, spriteHalfH + 2);

      // ── Foot-puff emission (v2.8.5) ───────────────────────────────────
      // While moving, drop a small dust ellipse at the unit's current
      // world position every PUFF_INTERVAL_MS. Stored in particleLayer
      // (world-space) so it stays put as the unit walks away.
      if (moving && nowMs - this.lastPuffMs >= PUFF_INTERVAL_MS) {
        this.lastPuffMs = nowMs;
        const baseRX = Math.max(2, spriteHalfW * 0.28);
        const baseRY = Math.max(1, spriteHalfH * 0.06);
        const g = new Graphics();
        g.ellipse(0, 0, baseRX, baseRY).fill({ color: 0xb8a88f, alpha: 0.55 });
        g.position.set(px, py + sShadowCY);
        this.particleLayer.addChild(g);
        // Small lateral drift opposite the direction of travel — dust
        // kicks back behind the foot. Scale by tick velocity sign.
        const drift = dx > 0 ? -0.6 : dx < 0 ? 0.6 : 0;
        this.puffs.push({ graphics: g, spawnedMs: nowMs, baseRX, baseRY, driftX: drift });
      }
    } else {
      // Pre-load fallback: procedural droplet (first frame only).
      this.sprite.visible = false;
      this.groundShadow.clear();
      this.teamRing.clear();
      const owner = world.players.find((p) => p.id === ug.ownerId);
      const outlineColor = owner ? colorFromHex(owner.color) : 0xffffff;
      const factionDef = content.factions[ug.sourceFaction];
      const fillColor = factionDef ? colorFromHex(factionDef.color) : 0x3da9fc;
      const baseRadius = 5;
      const raw = Math.min(baseRadius + Math.sqrt(Math.max(1, ug.count)) * 0.6, 14);
      const radius = raw * world.visualScale;
      this.droplet
        .clear()
        .circle(0, 0, radius)
        .fill({ color: fillColor, alpha: 0.95 })
        .circle(0, 0, radius)
        .stroke({ color: outlineColor, width: 1.5, alpha: 0.9 });
      this.label.position.set(0, 0);
    }

    const c = Math.floor(ug.count);
    this.label.text = c > 0 ? c.toString() : '';

    // ── Foot-puff lifecycle (v2.8.5) ────────────────────────────────────
    // Tick every active puff regardless of whether the unit is moving —
    // existing puffs need to fade out even after the unit stops or arrives.
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      const age = nowMs - p.spawnedMs;
      if (age >= PUFF_LIFETIME_MS) {
        this.particleLayer.removeChild(p.graphics);
        p.graphics.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      const t = age / PUFF_LIFETIME_MS;          // 0 → 1
      p.graphics.alpha = 0.55 * (1 - t);          // fade out
      const scale = 1 + t * 0.8;                  // expand a bit as it dissipates
      p.graphics.scale.set(scale, scale);
      p.graphics.x += p.driftX;                   // gentle lateral drift
    }
  }

  destroy(): void {
    // Particles live in a parent-owned world-space layer; remove them
    // explicitly so unit teardown doesn't leak Graphics objects.
    for (const p of this.puffs) {
      this.particleLayer.removeChild(p.graphics);
      p.graphics.destroy();
    }
    this.puffs.length = 0;
    this.container.destroy({ children: true });
  }

  get id(): string {
    return this.groupId;
  }
}
