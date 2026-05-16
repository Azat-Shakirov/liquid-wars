// VariantSandbox — DEV-only screen that animates all three unit-walk
// variants side by side so the author can pick which reads best. Mounts a
// dedicated PixiJS Application (no engine, no levels) and runs each
// variant's animation at the production WALK_FRAME_MS cadence.
//
// Reached via the ?variants URL flag (see App.tsx).
//
// Variants under test:
//   A: mirror legs.  Pre-baked frame 0 / frame 1 PNGs; sprite swaps texture.
//   B: skew legs.    Pre-baked frame 0 / frame 1 PNGs; sprite swaps texture.
//   C: split layers. Torso + legs as two sprites; renderer shears the legs.

import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { useSessionStore } from '../../store/sessionStore';
import { buttonStyle } from '../menuStyles';

import variantA0 from '../../render/sprites/units/variants/a/infantry-azure-0.png';
import variantA1 from '../../render/sprites/units/variants/a/infantry-azure-1.png';
import variantB0 from '../../render/sprites/units/variants/b/infantry-azure-0.png';
import variantB1 from '../../render/sprites/units/variants/b/infantry-azure-1.png';
import variantCTorso from '../../render/sprites/units/variants/c/infantry-azure-torso.png';
import variantCLegs from '../../render/sprites/units/variants/c/infantry-azure-legs.png';

// Mirror production constants (see UnitGroupView).
const WALK_FRAME_MS = 220;
const BOB_AMPLITUDE = 1.6;
const WOBBLE_AMPLITUDE = 0.05;
const BOB_PHASE_RATE = Math.PI / WALK_FRAME_MS;

// Variant C in-engine leg animation.
const VARIANT_C_SKEW = 0.10;   // radians; alternates per frame swap
const VARIANT_C_DX = 0;        // optional lateral offset; 0 keeps it pure shear

const CANVAS_W = 1180;
const CANVAS_H = 540;
const COLS = 4;
const COL_W = 270;
const COL_GAP = 22;
const COL_X = (i: number) => COL_GAP + i * (COL_W + COL_GAP) + COL_W / 2;

// Per-row presentation: the big row is for studying details, the small row
// is closer to game-actual rendering scale so the author can judge how the
// stride reads at play distance.
const BIG_DISPLAY_H = 192;
const BIG_ROW_Y = 200;
const SMALL_DISPLAY_H = 48;
const SMALL_ROW_Y = 380;

// Sprite anchor matches the production renderer: 0.5 horizontally so the
// figure is centered on its container, 0.55 vertically so the cut line for
// variants B/C is at the local origin (the legs shear around the cut).
const ANCHOR_X = 0.5;
const ANCHOR_Y = 0.55;

interface VariantCell {
  // Big-scale + small-scale renderings share the same animation phase so
  // they pulse in unison — easier to compare them across columns.
  big: VariantRender;
  small: VariantRender;
}

interface VariantRender {
  container: Container;
  apply: (nowMs: number) => void;
}

type VariantKind = 'ref' | 'a' | 'b' | 'c';

// BOB_AMPLITUDE is in source-pixel units (matches production's per-1×-zoom
// scale). When rendering at a different scale we multiply through, just like
// production's `* world.visualScale`. Wobble is an angle — it doesn't need
// scaling because rotation reads the same across sprite sizes.
function bobAndWobbleOffsets(nowMs: number, spriteScale: number): { bobY: number; wobble: number } {
  const phase = nowMs * BOB_PHASE_RATE;
  return {
    bobY: -Math.abs(Math.sin(phase)) * BOB_AMPLITUDE * spriteScale,
    wobble: Math.sin(phase) * WOBBLE_AMPLITUDE,
  };
}

function frameIndex(nowMs: number): 0 | 1 {
  return ((Math.floor(nowMs / WALK_FRAME_MS) & 1) as 0 | 1);
}

function buildSwapSprite(
  textures: [Texture, Texture],
  displayH: number,
): VariantRender {
  const container = new Container();
  const sprite = new Sprite(textures[0]);
  sprite.anchor.set(ANCHOR_X, ANCHOR_Y);
  const baseScale = displayH / textures[0].height;
  sprite.scale.set(baseScale, baseScale);
  container.addChild(sprite);
  return {
    container,
    apply: (nowMs: number) => {
      const { bobY, wobble } = bobAndWobbleOffsets(nowMs, baseScale);
      const f = frameIndex(nowMs);
      sprite.texture = textures[f];
      sprite.position.set(0, bobY);
      sprite.rotation = wobble;
      sprite.scale.set(baseScale, baseScale);
    },
  };
}

function buildStaticSprite(texture: Texture, displayH: number): VariantRender {
  const container = new Container();
  const sprite = new Sprite(texture);
  sprite.anchor.set(ANCHOR_X, ANCHOR_Y);
  const baseScale = displayH / texture.height;
  sprite.scale.set(baseScale, baseScale);
  container.addChild(sprite);
  return {
    container,
    apply: (nowMs: number) => {
      const { bobY, wobble } = bobAndWobbleOffsets(nowMs, baseScale);
      sprite.position.set(0, bobY);
      sprite.rotation = wobble;
    },
  };
}

function buildSplitSprite(
  torsoTex: Texture,
  legsTex: Texture,
  displayH: number,
): VariantRender {
  const container = new Container();
  const legs = new Sprite(legsTex);
  const torso = new Sprite(torsoTex);
  legs.anchor.set(ANCHOR_X, ANCHOR_Y);
  torso.anchor.set(ANCHOR_X, ANCHOR_Y);
  const baseScale = displayH / torsoTex.height;
  legs.scale.set(baseScale, baseScale);
  torso.scale.set(baseScale, baseScale);
  // Legs render first so the torso overlaps any seam at the cut line.
  container.addChild(legs);
  container.addChild(torso);
  return {
    container,
    apply: (nowMs: number) => {
      const { bobY, wobble } = bobAndWobbleOffsets(nowMs, baseScale);
      const f = frameIndex(nowMs);
      const sign = f === 0 ? +1 : -1;
      // Torso bobs and wobbles. Legs stay grounded but shear around the cut
      // line (PIXI skew.x is angle in radians; positive shears the y-axis
      // basis clockwise, i.e. bottom shifts right when origin is at the cut).
      torso.position.set(0, bobY);
      torso.rotation = wobble;
      legs.position.set(sign * VARIANT_C_DX, 0);
      legs.skew.x = sign * VARIANT_C_SKEW;
    },
  };
}

function makeHeader(label: string, color: number, x: number, y: number): Text {
  const t = new Text({
    text: label,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 14,
      fontWeight: '700',
      fill: color,
    },
  });
  t.anchor.set(0.5, 0);
  t.position.set(x, y);
  return t;
}

function makeSubLabel(label: string, x: number, y: number): Text {
  const t = new Text({
    text: label,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 11,
      fill: 0x9aa0aa,
    },
  });
  t.anchor.set(0.5, 0);
  t.position.set(x, y);
  return t;
}

const COLUMN_DEFS: { kind: VariantKind; title: string; subtitle: string; color: number }[] = [
  { kind: 'ref', title: 'REFERENCE', subtitle: 'frame 0 only · no swap', color: 0xa0a4ad },
  { kind: 'a', title: 'A · MIRROR LEGS', subtitle: 'cut 0.78 · h-flip below sword', color: 0xfacc15 },
  { kind: 'b', title: 'B · SKEW LEGS', subtitle: 'cut 0.55 · shear ±0.14', color: 0x6dd0ff },
  { kind: 'c', title: 'C · SPLIT LAYERS', subtitle: 'torso + legs · in-engine shear', color: 0xf472b6 },
];

export function VariantSandbox() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const navigate = useSessionStore((s) => s.navigate);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const host = mountRef.current;
    // Don't expose `app` to the cleanup closure until init() has fully
    // completed — otherwise StrictMode's double-mount can call destroy()
    // on a half-built Pixi instance.
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

        const loaded = (await Promise.all([
          Assets.load(variantA0),
          Assets.load(variantA1),
          Assets.load(variantB0),
          Assets.load(variantB1),
          Assets.load(variantCTorso),
          Assets.load(variantCLegs),
        ])) as readonly [Texture, Texture, Texture, Texture, Texture, Texture];
        const [a0, a1, b0, b1, cTorso, cLegs] = loaded;

        if (cancelled) {
          try { app.destroy(true, { children: true, texture: false }); } catch { /* noop */ }
          return;
        }

        // Column backgrounds: subtle floor strips so each cell reads as its
        // own stage. Grass-tinted to echo the actual game biome.
        const bg = new Graphics();
        for (let i = 0; i < COLS; i++) {
          const x = COL_GAP + i * (COL_W + COL_GAP);
          bg.roundRect(x, 64, COL_W, CANVAS_H - 64 - 24, 10)
            .fill({ color: 0x232934, alpha: 1 })
            .roundRect(x, BIG_ROW_Y + 10, COL_W, 14, 7)
            .fill({ color: 0x000000, alpha: 0.30 })
            .roundRect(x, SMALL_ROW_Y + 4, COL_W, 8, 4)
            .fill({ color: 0x000000, alpha: 0.30 });
        }
        app.stage.addChild(bg);

        // Title bar.
        const title = new Text({
          text: 'unit walk-cycle variants · 5× and game-scale · WALK_FRAME_MS = 220',
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 16,
            fontWeight: '700',
            fill: 0xe7e9ee,
          },
        });
        title.anchor.set(0.5, 0);
        title.position.set(CANVAS_W / 2, 22);
        app.stage.addChild(title);

        const cells: VariantCell[] = [];

        for (let i = 0; i < COLUMN_DEFS.length; i++) {
          const def = COLUMN_DEFS[i]!;
          const cx = COL_X(i);

          app.stage.addChild(makeHeader(def.title, def.color, cx, 80));
          app.stage.addChild(makeSubLabel(def.subtitle, cx, 102));

          let big: VariantRender;
          let small: VariantRender;
          switch (def.kind) {
            case 'ref':
              big = buildStaticSprite(a0, BIG_DISPLAY_H);
              small = buildStaticSprite(a0, SMALL_DISPLAY_H);
              break;
            case 'a':
              big = buildSwapSprite([a0, a1], BIG_DISPLAY_H);
              small = buildSwapSprite([a0, a1], SMALL_DISPLAY_H);
              break;
            case 'b':
              big = buildSwapSprite([b0, b1], BIG_DISPLAY_H);
              small = buildSwapSprite([b0, b1], SMALL_DISPLAY_H);
              break;
            case 'c':
              big = buildSplitSprite(cTorso, cLegs, BIG_DISPLAY_H);
              small = buildSplitSprite(cTorso, cLegs, SMALL_DISPLAY_H);
              break;
          }
          big.container.position.set(cx, BIG_ROW_Y);
          small.container.position.set(cx, SMALL_ROW_Y);
          app.stage.addChild(big.container);
          app.stage.addChild(small.container);

          app.stage.addChild(makeSubLabel('5× scale', cx, BIG_ROW_Y + 80));
          app.stage.addChild(makeSubLabel('game scale (~1×)', cx, SMALL_ROW_Y + 24));

          cells.push({ big, small });
        }

        const startMs = performance.now();
        tickerCb = () => {
          const nowMs = performance.now() - startMs;
          for (const c of cells) {
            c.big.apply(nowMs);
            c.small.apply(nowMs);
          }
        };
        app.ticker.add(tickerCb);

        // Final step: only now expose the app to the cleanup closure AND
        // attach the canvas to the DOM. If we got cancelled between the
        // earlier checkpoints, we never appended — no orphan DOM nodes.
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
        justifyContent: 'center',
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
