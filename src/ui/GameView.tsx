// GameView — owns the engine, canvas, input, and HUD bar for one level.
// Mounted only when sessionStore.route === 'game'. Unmount destroys the
// engine cleanly. Esc opens the pause menu (engine stops ticking).

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { loadContent } from '../engine/content/ContentLoader';
import { PixiRenderer } from '../render/PixiRenderer';
import { InputController } from '../input/InputController';
import { createSessionState, type ContextMenuRequest, type SessionState } from '../render/SessionState';
import { TICK_MS } from '../types';
import { UnitBar } from './UnitBar';
import { PauseMenu } from './PauseMenu';
import { ContextMenu } from './ContextMenu';
import { useHudStore } from '../store/hudStore';
import { useSessionStore } from '../store/sessionStore';
import { useProgressStore } from '../store/progressStore';
import { computePlayerTotals } from '../store/computeTotals';

const MAX_FRAME_MS = 250;
const HUD_POLL_MS = 100;

interface GameViewProps {
  levelId: number;
}

export function GameView({ levelId }: GameViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartCounter, setRestartCounter] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuRequest | null>(null);
  const engineRefForMenu = useRef<GameEngine | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const paused = useSessionStore((s) => s.paused);
  const setPaused = useSessionStore((s) => s.setPaused);
  const togglePause = useSessionStore((s) => s.togglePause);
  const startLevel = useSessionStore((s) => s.startLevel);
  const exitToMenu = useSessionStore((s) => s.exitToMenu);
  const recordCompletion = useProgressStore((s) => s.recordCompletion);

  // Track pause via ref so the requestAnimationFrame closure sees the
  // current value without re-creating the entire effect.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Avoid double-recording the same victory.
  const recordedRef = useRef(false);

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
    recordedRef.current = false;

    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        // Cancel spell-targeting first if active; otherwise pause.
        if (sessionRef.current && sessionRef.current.targetingFromLabId !== null) {
          sessionRef.current.targetingFromLabId = null;
          return;
        }
        togglePause();
        return;
      }
      if (pausedRef.current) return;
      if (key === 'r') {
        setRestartCounter((c) => c + 1);
      } else if (key === 'n') {
        if (engineRef && engineRef.world.status === 'won') {
          const next = nextLevelId(levelId, availableLevels);
          if (next !== null) startLevel(next);
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
        const level = content.levels[levelId];
        if (!level) {
          throw new Error(`Level ${levelId} not found.`);
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
      sessionRef.current = session;
      engineRefForMenu.current = engine;
      input = new InputController(r.app.canvas, engine, session);

      const pushTotals = (): void => {
        if (!engineRef) return;
        useHudStore.getState().setTotals(computePlayerTotals(engineRef.world));
      };
      const pollMenu = (): void => {
        const req = session.contextMenu;
        setCtxMenu((prev) => {
          if (prev === req) return prev;
          if (prev && req && prev.nodeId === req.nodeId &&
              prev.position.x === req.position.x && prev.position.y === req.position.y) {
            return prev;
          }
          return req;
        });
      };
      pushTotals();
      pollMenu();
      hudIntervalId = setInterval(() => {
        pushTotals();
        pollMenu();
      }, HUD_POLL_MS);

      let lastTime = performance.now();
      let accumulator = 0;

      const frame = (now: number) => {
        const delta = Math.min(now - lastTime, MAX_FRAME_MS);
        lastTime = now;
        if (!pausedRef.current) {
          accumulator += delta;
          while (accumulator >= TICK_MS) {
            engine.tick();
            accumulator -= TICK_MS;
          }
        }

        if (
          engine.world.status === 'won' &&
          !recordedRef.current
        ) {
          recordedRef.current = true;
          recordCompletion(levelId, {
            stars: 1,
            bestTimeMs: Math.round(engine.world.elapsedMs),
            unitsLost: 0,
          });
        }

        const alpha = pausedRef.current ? 0 : accumulator / TICK_MS;
        r.render(
          engine.world,
          session,
          alpha,
          now,
          engine.towerInterceptSystem.recentShots,
        );
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
      sessionRef.current = null;
      engineRefForMenu.current = null;
      setCtxMenu(null);
      setPaused(false);
    };
  }, [levelId, restartCounter, togglePause, startLevel, recordCompletion, setPaused]);

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
      {paused && (
        <PauseMenu
          onResume={() => setPaused(false)}
          onRestart={() => {
            setPaused(false);
            setRestartCounter((c) => c + 1);
          }}
        />
      )}
      {!paused && ctxMenu && engineRefForMenu.current && sessionRef.current && (
        <ContextMenu
          engine={engineRefForMenu.current}
          request={ctxMenu}
          session={sessionRef.current}
          onClose={() => {
            if (sessionRef.current) sessionRef.current.contextMenu = null;
            setCtxMenu(null);
          }}
        />
      )}
      {error && (
        <div
          style={{
            position: 'fixed',
            top: 40,
            left: 20,
            color: '#ff8a8a',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
          <div style={{ marginTop: 8 }}>
            <button onClick={exitToMenu} style={{ marginRight: 8 }}>Main menu</button>
          </div>
        </div>
      )}
    </>
  );
}

function nextLevelId(current: number, available: number[]): number | null {
  const idx = available.indexOf(current);
  if (idx === -1 || idx + 1 >= available.length) return null;
  return available[idx + 1] ?? null;
}
