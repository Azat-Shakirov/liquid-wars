// App — mounts the PIXI canvas and runs the fixed-timestep frame loop (§3.4).
// Phase 0: blank world (no level loaded), tick + click handler verified.

import { useEffect, useRef } from 'react';
import { GameEngine } from './engine/GameEngine';
import { PixiRenderer } from './render/PixiRenderer';
import { InputController } from './input/InputController';
import { TICK_MS, type LevelConfig } from './types';

const PHASE_0_LEVEL: LevelConfig = {
  id: 0,
  name: 'Phase 0 sandbox',
  width: 1280,
  height: 720,
};

const MAX_FRAME_MS = 250; // hard cap to avoid spiral-of-death after a long pause

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let rafId = 0;
    let renderer: PixiRenderer | null = null;
    let input: InputController | null = null;
    const engine = new GameEngine(PHASE_0_LEVEL, /* seed */ 1);

    (async () => {
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
    <div
      ref={hostRef}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        cursor: 'crosshair',
      }}
    />
  );
}
