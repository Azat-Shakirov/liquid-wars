// BiomeSandbox — DEV-only screen that renders all five biome floors as
// stacked panels with sample nodes, a sample wall stroke, and a sample
// unit on each, so the author can eyeball how each biome cohabits with
// the production sprites without touching level JSONs.
//
// Reached via the ?biomes URL flag (see App.tsx).
//
// Faithfulness vs production:
//   - Biome PNGs loaded via the same biomeSprites.ts registry the
//     PixiRenderer uses.
//   - Biome sprite stretched to the panel rect at alpha 0.92, matching
//     PixiRenderer.syncBiome.
//   - Node PNGs loaded via the same nodeSprites.ts registry the
//     PixiRenderer uses, scaled to per-type display sizes that mirror
//     metricsForType() proportions.
//   - Wall drawn with the same RGB + stroke width PixiRenderer uses
//     (0x3a3f4a, width ~6), to verify wall contrast against each biome.

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { useSessionStore } from '../../store/sessionStore';
import { buttonStyle } from '../menuStyles';
import { loadBiomeTextures, getBiomeTexture } from '../../render/sprites/biomeSprites';
import { loadNodeTextures, getNodeTexture } from '../../render/sprites/nodeSprites';
import { loadUnitTextures, getUnitFrame } from '../../render/sprites/unitSprites';
import type { BiomeId } from '../../engine/content/ContentLibrary';
import type { FactionId } from '../../types';

// Panel geometry — wide enough to feel like a level slice, tall enough
// to fit five nodes without crowding. Five panels stacked vertically.
const PANEL_W = 920;
const PANEL_H = 360;
const PANEL_GAP = 18;
const LABEL_H = 36;
const PADDING_X = 24;
const PADDING_Y = 24;

const BIOMES: BiomeId[] = ['grass', 'desert', 'snow', 'jungle'];

const BIOME_ALPHA = 0.92;

// Pixi color for the wall stroke (matches PixiRenderer wallsGraphics).
const WALL_COLOR = 0x3a3f4a;
const WALL_WIDTH = 6;

// Sample-node table. One of each node type with a varied faction
// roster — visualizes how each faction's PNG sits on each biome.
type NodeKind = 'tower' | 'barracks' | 'lab' | 'house';
interface NodePlacement {
  kind: NodeKind;
  faction: FactionId;
  cx: number;            // center within panel
  cy: number;
  displayH: number;      // sprite display longest-edge after scaling
}

const NODE_PLACEMENTS: NodePlacement[] = [
  { kind: 'tower',    faction: 'azure',    cx: 140, cy: 130, displayH: 130 },
  { kind: 'barracks', faction: 'crimson',  cx: 360, cy: 130, displayH: 150 },
  { kind: 'house',    faction: 'verdant',  cx: 580, cy: 130, displayH: 110 },
  { kind: 'lab',      faction: 'amethyst', cx: 760, cy: 130, displayH: 130 },
  { kind: 'tower',    faction: 'shadow',   cx: 250, cy: 280, displayH: 130 },
];

// A short polyline drawn as a "sample wall" so the author can read wall
// contrast against each floor.
const SAMPLE_WALL: Array<[number, number]> = [
  [430, 240],
  [560, 230],
  [690, 260],
  [820, 250],
];

// A sample unit droplet — placed near the wall to visualize unit-on-floor
// reading.
const SAMPLE_UNIT = { faction: 'azure' as FactionId, cx: 540, cy: 290, displayH: 48 };

const CANVAS_W = PANEL_W + PADDING_X * 2;
const CANVAS_H = (PANEL_H + LABEL_H) * BIOMES.length + PANEL_GAP * (BIOMES.length - 1) + PADDING_Y * 2;

function makeText(label: string, opts: { size?: number; color?: number; weight?: '400' | '700' }): Text {
  return new Text({
    text: label,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: opts.size ?? 14,
      fontWeight: opts.weight ?? '700',
      fill: opts.color ?? 0xe7e9ee,
    },
  });
}

function buildPanel(biome: BiomeId, panelY: number): Container {
  const panel = new Container();
  panel.position.set(PADDING_X, panelY);

  // Label bar.
  const labelBar = new Graphics().rect(0, 0, PANEL_W, LABEL_H).fill({ color: 0x14171d, alpha: 1 });
  panel.addChild(labelBar);
  const label = makeText(`BIOME: ${biome}`, { size: 16, color: 0xe7e9ee, weight: '700' });
  label.position.set(14, 8);
  panel.addChild(label);

  // Floor — biome sprite stretched to panel, alpha 0.92 (matches production).
  const tex = getBiomeTexture(biome);
  const floor = new Container();
  floor.position.set(0, LABEL_H);
  if (tex) {
    const s = new Sprite(tex);
    s.x = 0;
    s.y = 0;
    s.width = PANEL_W;
    s.height = PANEL_H;
    s.alpha = BIOME_ALPHA;
    floor.addChild(s);
  } else {
    // Stone fallback — show the dark canvas the production renderer uses.
    floor.addChild(new Graphics().rect(0, 0, PANEL_W, PANEL_H).fill({ color: 0x0a0a0a, alpha: 1 }));
    const note = makeText('(no biome texture — canvas dark falls through)', { size: 12, color: 0x9aa0aa, weight: '400' });
    note.position.set(16, 12);
    floor.addChild(note);
  }
  panel.addChild(floor);

  // Sample wall — polyline drawn the same way PixiRenderer.syncWalls does.
  const wallG = new Graphics();
  const [first, ...rest] = SAMPLE_WALL;
  if (first) {
    wallG.moveTo(first[0], first[1] + LABEL_H);
    for (const [x, y] of rest) wallG.lineTo(x, y + LABEL_H);
    wallG.stroke({ color: WALL_COLOR, width: WALL_WIDTH, cap: 'round', join: 'round' });
  }
  panel.addChild(wallG);

  // Sample nodes — each placed at NODE_PLACEMENTS coordinates, scaled to
  // the per-type display height (mirrors metricsForType() proportions).
  for (const np of NODE_PLACEMENTS) {
    const nodeTex = getNodeTexture(np.kind, np.faction);
    if (!nodeTex) continue;
    const sp = new Sprite(nodeTex);
    sp.anchor.set(0.5, 0.85); // matches NodeView vertical anchor (foot of sprite)
    const baseScale = np.displayH / nodeTex.height;
    sp.scale.set(baseScale, baseScale);
    sp.position.set(np.cx, np.cy + LABEL_H);
    panel.addChild(sp);
  }

  // Sample unit — frame 0 only, no walk cycle in the sandbox.
  const unitTex = getUnitFrame('infantry', SAMPLE_UNIT.faction, 0);
  if (unitTex) {
    const u = new Sprite(unitTex);
    u.anchor.set(0.5, 0.55);
    const us = SAMPLE_UNIT.displayH / unitTex.height;
    u.scale.set(us, us);
    u.position.set(SAMPLE_UNIT.cx, SAMPLE_UNIT.cy + LABEL_H);
    panel.addChild(u);
  }

  return panel;
}

export function BiomeSandbox() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const navigate = useSessionStore((s) => s.navigate);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const host = mountRef.current;
    let liveApp: Application | null = null;
    let cancelled = false;

    const setup = async () => {
      try {
        const app = new Application();
        await app.init({
          width: CANVAS_W,
          height: CANVAS_H,
          backgroundColor: 0x0a0a0a,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        if (cancelled) {
          try { app.destroy(true, { children: true, texture: false }); } catch { /* noop */ }
          return;
        }

        await Promise.all([
          loadBiomeTextures(),
          loadNodeTextures(),
          loadUnitTextures(),
        ]);

        if (cancelled) {
          try { app.destroy(true, { children: true, texture: false }); } catch { /* noop */ }
          return;
        }

        // Page title.
        const title = makeText('biome floors · production stretch (alpha 0.92) · sample nodes + wall + unit', {
          size: 14, color: 0xa9adb5, weight: '400',
        });
        title.position.set(PADDING_X, 6);
        app.stage.addChild(title);

        let y = PADDING_Y;
        for (const biome of BIOMES) {
          const panel = buildPanel(biome, y);
          app.stage.addChild(panel);
          y += LABEL_H + PANEL_H + PANEL_GAP;
        }

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
