// App — loads content, builds the engine for a chosen level, and runs the
// fixed-timestep frame loop (§3.4).
//
// Phase 1 (intermediate): render layer is still the Phase 0 click-ripple
// PixiRenderer. NodeView/UnitGroupView/InputController gestures land in the
// next commits. Engine ticks and AI run regardless — visuals catch up.

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './engine/GameEngine';
import { loadContent } from './engine/content/ContentLoader';
import { PixiRenderer } from './render/PixiRenderer';
import { InputController } from './input/InputController';
import { TICK_MS } from './types';

const MAX_FRAME_MS = 250; // hard cap to avoid spiral-of-death after a long pause

function pickLevelId(): number {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('level');
  if (v) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let rafId = 0;
    let renderer: PixiRenderer | null = null;
    let input: InputController | null = null;

    (async () => {
      let engine: GameEngine;
      try {
        const content = loadContent();
        const levelId = pickLevelId();
        const level = content.levels[levelId];
        if (!level) {
          throw new Error(`Level ${levelId} not found. Available: ${Object.keys(content.levels).join(', ')}`);
        }
        engine = new GameEngine(level, content);
      } catch (err) {
        setError((err as Error).message);
        return;
      }

      const r = await PixiRenderer.create(host);
      if (cancelled) {
        r.destroy();
        return;
      }
      renderer = r;
      input = new InputController(r.app.canvas, {
        onClick: (x, y) => {
          r.addClickRipple(x, y, performance.now());
        },
      });

      let lastTime = performance.now();
      let accumulator = 0;

      const frame = (now: number) => {
        const delta = Math.min(now - lastTime, MAX_FRAME_MS);
        lastTime = now;
        accumulator += delta;

        while (accumulator >= TICK_MS) {
          engine.tick();
          accumulator -= TICK_MS;
        }

        const alpha = accumulator / TICK_MS;
        r.render(engine.world, alpha, now);
        rafId = requestAnimationFrame(frame);
      };

      rafId = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      input?.destroy();
      renderer?.destroy();
    };
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          cursor: 'crosshair',
        }}
      />
      {error && (
        <div style={{ position: 'fixed', top: 20, left: 20, color: '#ff8a8a', fontFamily: 'monospace' }}>
          {error}
        </div>
      )}
    </>
  );
}
