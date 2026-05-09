// App — loads content, builds the engine for a chosen level, runs the
// fixed-timestep frame loop (§3.4), and wires the input gesture machine.
//
// Keyboard:
//   R — restart current level
//   N — advance to next level (only when won)
//
// Level selection: ?level=N query param, default 1.

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './engine/GameEngine';
import { loadContent } from './engine/content/ContentLoader';
import { PixiRenderer } from './render/PixiRenderer';
import { InputController } from './input/InputController';
import { createSessionState } from './render/SessionState';
import { TICK_MS } from './types';
import { UnitBar } from './ui/UnitBar';
import { useHudStore } from './store/hudStore';
import { computePlayerTotals } from './store/computeTotals';

const HUD_POLL_MS = 100;

const MAX_FRAME_MS = 250;

function pickLevelId(): number {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('level');
  if (v) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

function gotoLevel(id: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('level', String(id));
  window.location.href = url.toString();
}

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let rafId = 0;
    let hudIntervalId: ReturnType<typeof setInterval> | null = null;
    let renderer: PixiRenderer | null = null;
    let input: InputController | null = null;
    let engineRef: GameEngine | null = null;
    let availableLevels: number[] = [];
    let currentLevelId = 1;

    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        gotoLevel(currentLevelId);
      } else if (key === 'n') {
        if (engineRef && engineRef.world.status === 'won') {
          const next = nextLevelId(currentLevelId, availableLevels);
          if (next !== null) gotoLevel(next);
        }
      }
    };
    window.addEventListener('keydown', handleKey);

    (async () => {
      let engine: GameEngine;
      let content: ReturnType<typeof loadContent>;
      try {
        content = loadContent();
        availableLevels = Object.keys(content.levels).map(Number).sort((a, b) => a - b);
        currentLevelId = pickLevelId();
        const level = content.levels[currentLevelId];
        if (!level) {
          throw new Error(
            `Level ${currentLevelId} not found. Available: ${availableLevels.join(', ')}`,
          );
        }
        engine = new GameEngine(level, content);
        engineRef = engine;
      } catch (err) {
        setError((err as Error).message);
        return;
      }

      const r = await PixiRenderer.create(host, content);
      if (cancelled) {
        r.destroy();
        return;
      }
      renderer = r;
      const session = createSessionState();

      input = new InputController(r.app.canvas, engine, session);

      // HUD polling — push per-player totals into the Zustand store every
      // 100ms, but only when they actually change. Keeps React out of
      // the per-tick render path (§3.1).
      const pushTotals = (): void => {
        if (!engineRef) return;
        useHudStore.getState().setTotals(computePlayerTotals(engineRef.world));
      };
      pushTotals();
      hudIntervalId = setInterval(pushTotals, HUD_POLL_MS);

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
        r.render(engine.world, session, alpha, now);
        rafId = requestAnimationFrame(frame);
      };

      rafId = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKey);
      if (rafId) cancelAnimationFrame(rafId);
      if (hudIntervalId !== null) clearInterval(hudIntervalId);
      useHudStore.getState().reset();
      input?.destroy();
      renderer?.destroy();
    };
  }, []);

  return (
    <>
      <UnitBar />
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
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: 20,
            color: '#ff8a8a',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

function nextLevelId(current: number, available: number[]): number | null {
  const idx = available.indexOf(current);
  if (idx === -1) return null;
  if (idx + 1 >= available.length) return null;
  return available[idx + 1] ?? null;
}
