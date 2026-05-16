// UnitSandbox — DEV-only screen rendering all 5 archetypes × 5 factions
// in a grid, animating at production cadence (WALK_FRAME_MS swap + bob +
// wobble). Lets the author eyeball every (archetype, faction) cell at
// game-actual scale without needing a level that uses each one.
//
// Reached via the ?units URL flag (see App.tsx).

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { useSessionStore } from '../../store/sessionStore';
import { buttonStyle } from '../menuStyles';
import { loadUnitTextures, getUnitFrame } from '../../render/sprites/unitSprites';
import type { ArchetypeId } from '../../engine/content/ContentLibrary';
import type { FactionId } from '../../types';

// Mirror UnitGroupView constants.
const WALK_FRAME_MS = 220;
const BOB_AMPLITUDE = 1.6;
const WOBBLE_AMPLITUDE = 0.05;
const BOB_PHASE_RATE = Math.PI / WALK_FRAME_MS;

const ARCHETYPES: ArchetypeId[] = ['infantry', 'knight', 'archer', 'mage', 'cavalry'];
const FACTIONS: FactionId[] = ['azure', 'crimson', 'verdant', 'amethyst', 'shadow'];

// Two scales per cell: BIG for studying detail, SMALL for game-actual feel.
// SMALL_DISPLAY_H tracks UnitGroupView.SPRITE_BASE_DISPLAY_HEIGHT × ~1.2
// (UnitGroupView additionally multiplies by world.visualScale + countScale,
// so a small group at default scale lands close to 30 px tall in game).
const BIG_DISPLAY_H = 144;
const SMALL_DISPLAY_H = 36;

const ROW_LABEL_W = 88;
const COL_HEADER_H = 28;
const CELL_W = 168;
const CELL_H = 200;
const CELL_GAP = 8;

const PAD_X = 24;
const PAD_Y = 24;

const CANVAS_W = PAD_X * 2 + ROW_LABEL_W + (CELL_W + CELL_GAP) * FACTIONS.length - CELL_GAP;
const CANVAS_H = PAD_Y * 2 + COL_HEADER_H + (CELL_H + CELL_GAP) * ARCHETYPES.length - CELL_GAP + 40;

// Sprite anchor matches UnitGroupView (feet just below the vertical center).
const ANCHOR_X = 0.5;
const ANCHOR_Y = 0.55;

// In-row Y offsets within a cell (relative to the cell's top edge).
const BIG_Y_IN_CELL = 138;
const SMALL_Y_IN_CELL = 178;

interface AnimatedCell {
  sprite: Sprite;
  archetype: ArchetypeId;
  faction: FactionId;
  baseY: number;
  // Bob amplitude scaled by (display height / 30) so visually-large
  // sprites bob proportionally to small ones. Mirrors UnitGroupView's
  // `BOB_AMPLITUDE * world.visualScale`.
  bobAmpScale: number;
}

function makeText(text: string, opts: { size?: number; color?: number; weight?: '400' | '700' }): Text {
  return new Text({
    text,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: opts.size ?? 13,
      fontWeight: opts.weight ?? '400',
      fill: opts.color ?? 0xe7e9ee,
    },
  });
}

function buildCell(
  archetype: ArchetypeId,
  faction: FactionId,
  cx: number,
  baseY: number,
  displayH: number,
  parent: Container,
  out: AnimatedCell[],
): void {
  const tex0 = getUnitFrame(archetype, faction, 0);
  if (!tex0) return;
  const sp = new Sprite(tex0);
  sp.anchor.set(ANCHOR_X, ANCHOR_Y);
  const baseScale = displayH / tex0.height;
  sp.scale.set(baseScale, baseScale);
  sp.position.set(cx, baseY);
  parent.addChild(sp);
  out.push({
    sprite: sp,
    archetype,
    faction,
    baseY,
    bobAmpScale: displayH / 30,
  });
}

export function UnitSandbox() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const navigate = useSessionStore((s) => s.navigate);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const host = mountRef.current;
    let liveApp: Application | null = null;
    let cancelled = false;
    let tickerCb: (() => void) | null = null;

    const setup = async () => {
      try {
        const app = new Application();
        await app.init({
          width: CANVAS_W,
          height: CANVAS_H,
          backgroundColor: 0x1b1f27,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        if (cancelled) {
          try { app.destroy(true, { children: true, texture: false }); } catch { /* noop */ }
          return;
        }

        await loadUnitTextures();

        if (cancelled) {
          try { app.destroy(true, { children: true, texture: false }); } catch { /* noop */ }
          return;
        }

        // Title.
        const title = makeText(
          '5 archetypes × 5 factions · production-path variant B · WALK_FRAME_MS = 220',
          { size: 14, color: 0xa9adb5 },
        );
        title.position.set(PAD_X, 6);
        app.stage.addChild(title);

        // Faction column headers.
        for (let c = 0; c < FACTIONS.length; c++) {
          const cx = PAD_X + ROW_LABEL_W + c * (CELL_W + CELL_GAP) + CELL_W / 2;
          const head = makeText(FACTIONS[c]!, { size: 13, color: 0x9aa0aa, weight: '700' });
          head.anchor.set(0.5, 0);
          head.position.set(cx, PAD_Y + 6);
          app.stage.addChild(head);
        }

        const animated: AnimatedCell[] = [];

        for (let r = 0; r < ARCHETYPES.length; r++) {
          const archetype = ARCHETYPES[r]!;
          const rowY = PAD_Y + COL_HEADER_H + r * (CELL_H + CELL_GAP);

          // Row label.
          const rowLabel = makeText(archetype, { size: 14, color: 0xe7e9ee, weight: '700' });
          rowLabel.position.set(PAD_X, rowY + CELL_H / 2 - 8);
          app.stage.addChild(rowLabel);

          // Cell backgrounds + ground-shadow strips.
          const stripG = new Graphics();
          for (let c = 0; c < FACTIONS.length; c++) {
            const x = PAD_X + ROW_LABEL_W + c * (CELL_W + CELL_GAP);
            stripG
              .roundRect(x, rowY, CELL_W, CELL_H, 10)
              .fill({ color: 0x232934, alpha: 1 })
              .roundRect(x, rowY + BIG_Y_IN_CELL - 6, CELL_W, 14, 7)
              .fill({ color: 0x000000, alpha: 0.30 })
              .roundRect(x, rowY + SMALL_Y_IN_CELL - 2, CELL_W, 8, 4)
              .fill({ color: 0x000000, alpha: 0.30 });
          }
          app.stage.addChild(stripG);

          for (let c = 0; c < FACTIONS.length; c++) {
            const faction = FACTIONS[c]!;
            const cx = PAD_X + ROW_LABEL_W + c * (CELL_W + CELL_GAP) + CELL_W / 2;
            buildCell(archetype, faction, cx, rowY + BIG_Y_IN_CELL, BIG_DISPLAY_H, app.stage, animated);
            buildCell(archetype, faction, cx, rowY + SMALL_Y_IN_CELL, SMALL_DISPLAY_H, app.stage, animated);
          }
        }

        const startMs = performance.now();
        tickerCb = () => {
          const nowMs = performance.now() - startMs;
          const phase = nowMs * BOB_PHASE_RATE;
          const absSin = Math.abs(Math.sin(phase));
          const wobble = Math.sin(phase) * WOBBLE_AMPLITUDE;
          const fIdx = (Math.floor(nowMs / WALK_FRAME_MS) & 1) as 0 | 1;
          for (const a of animated) {
            const tex = getUnitFrame(a.archetype, a.faction, fIdx);
            if (tex) a.sprite.texture = tex;
            a.sprite.position.y = a.baseY - absSin * BOB_AMPLITUDE * a.bobAmpScale;
            a.sprite.rotation = wobble;
          }
        };
        app.ticker.add(tickerCb);

        host.appendChild(app.canvas);
        liveApp = app;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    };

    void setup();

    return () => {
      cancelled = true;
      const app = liveApp;
      if (app) {
        if (tickerCb) app.ticker.remove(tickerCb);
        const canvas = app.canvas;
        try { app.destroy(true, { children: true, texture: false }); } catch { /* noop */ }
        if (canvas && canvas.parentNode === host) host.removeChild(canvas);
        liveApp = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(circle at 50% 35%, #14141c 0%, #06060a 70%)',
        color: '#eee',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        boxSizing: 'border-box',
        overflow: 'auto',
      }}
    >
      <div ref={mountRef} style={{ width: CANVAS_W, maxWidth: '100%' }} />
      {loadError !== null && (
        <div style={{ color: '#ff8888', fontSize: 13 }}>load error: {loadError}</div>
      )}
      <button style={{ ...buttonStyle, minWidth: 160 }} onClick={() => navigate('menu')}>
        Back to menu
      </button>
    </div>
  );
}
