// GameView — owns the engine, canvas, input, and HUD bar for one level.
// Mounted only when sessionStore.route === 'game'. Unmount destroys the
// engine cleanly. Esc opens the pause menu (engine stops ticking).

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { loadContent } from '../engine/content/ContentLoader';
import { PixiRenderer } from '../render/PixiRenderer';
import { InputController } from '../input/InputController';
import { createSessionState, type SessionState } from '../render/SessionState';
import { TICK_MS } from '../types';
import { UnitBar } from './UnitBar';
import { PauseMenu } from './PauseMenu';
import { NodeInfoPanel } from './NodeInfoPanel';
import { TutorialOverlay } from './TutorialOverlay';
import { ObjectiveBanner } from './ObjectiveBanner';
import type { TutorialDef } from '../engine/content/ContentLibrary';
import type { FactionId, NodeId } from '../types';
import type { LevelDef } from '../engine/content/ContentLibrary';
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
  const [hoveredId, setHoveredId] = useState<NodeId | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [tutorial, setTutorial] = useState<TutorialDef | null>(null);
  const [objective, setObjective] = useState<string | null>(null);
  const [levelName, setLevelName] = useState<string>('');
  const tutorialOpenRef = useRef(false);
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
      if (tutorialOpenRef.current) return; // tutorial blocks all input
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
        const baseLevel = content.levels[levelId];
        if (!baseLevel) {
          throw new Error(`Level ${levelId} not found.`);
        }
        // Faction override is gated on the level being a challenge-tier
        // level (letPlayerChooseFaction). On L1-30 we always honor the
        // designer's choice and ignore the LevelSelect picker.
        const overrideFaction = baseLevel.letPlayerChooseFaction
          ? useSessionStore.getState().playerStartFaction
          : null;
        const level = overrideFaction
          ? applyPlayerFactionOverride(baseLevel, overrideFaction)
          : baseLevel;
        engine = new GameEngine(level, content);
        engineRef = engine;
        // Phase 5: surface tutorial modal + objective banner.
        setLevelName(level.name);
        setObjective(level.objective ?? null);
        if (level.tutorial) {
          setTutorial(level.tutorial);
          tutorialOpenRef.current = true;
        } else {
          setTutorial(null);
          tutorialOpenRef.current = false;
        }
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
      setCanvasEl(r.app.canvas);
      input = new InputController(r.app.canvas, engine, session);

      const pushTotals = (): void => {
        if (!engineRef) return;
        useHudStore.getState().setTotals(computePlayerTotals(engineRef.world));
      };
      const pollHover = (): void => {
        const id = session.hoveredNodeId;
        setHoveredId((prev) => (prev === id ? prev : id));
      };
      pushTotals();
      pollHover();
      hudIntervalId = setInterval(() => {
        pushTotals();
        pollHover();
      }, HUD_POLL_MS);

      let lastTime = performance.now();
      let accumulator = 0;

      const frame = (now: number) => {
        const delta = Math.min(now - lastTime, MAX_FRAME_MS);
        lastTime = now;
        const blockTick = pausedRef.current || tutorialOpenRef.current;
        if (!blockTick) {
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

        const alpha = blockTick ? 0 : accumulator / TICK_MS;
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
      setCanvasEl(null);
      setHoveredId(null);
      setPaused(false);
    };
  }, [levelId, restartCounter, togglePause, startLevel, recordCompletion, setPaused]);

  return (
    <>
      <UnitBar />
      {objective && !tutorial && <ObjectiveBanner objective={objective} />}
      {/* v2.7.6: shift the canvas below the UnitBar (24px) so nodes
         placed near y=0 in a level aren't hidden under the bar. */}
      <div
        ref={hostRef}
        style={{
          width: '100vw',
          height: 'calc(100vh - 24px)',
          marginTop: 24,
          position: 'relative',
          cursor: 'crosshair',
        }}
      />
      {tutorial && (
        <TutorialOverlay
          tutorial={tutorial}
          levelName={levelName}
          onDismiss={() => {
            tutorialOpenRef.current = false;
            setTutorial(null);
          }}
        />
      )}
      {paused && (
        <PauseMenu
          onResume={() => setPaused(false)}
          onRestart={() => {
            setPaused(false);
            setRestartCounter((c) => c + 1);
          }}
        />
      )}
      {!paused && engineRefForMenu.current && sessionRef.current && (
        <NodeInfoPanel
          engine={engineRefForMenu.current}
          session={sessionRef.current}
          hoveredNodeId={hoveredId}
          canvasEl={canvasEl}
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

// Dev playtest helper: returns a shallow-cloned LevelDef whose human
// player's `faction` is swapped to `factionId`. buildWorldFromLevel
// propagates the override to every node the human owns (per-player
// faction model). Enemy + neutral nodes are left alone — the override
// is for feeling out the player's own faction. Auto-conversion on
// capture (§4.5) still applies as usual once the player takes enemy
// territory.
//
// v2.8.7-followup: also swaps archetype to match the new faction.
// The campaign uses a deterministic faction→archetype mapping so each
// banner color has a coherent identity (azure=infantry, crimson=archer,
// verdant=mage, amethyst=cavalry, shadow=knight). Letting the human's
// faction change without the archetype would break that contract — a
// "crimson archer-themed" run would render azure infantry sprites.
const ARCHETYPE_BY_FACTION: Record<string, 'infantry' | 'archer' | 'mage' | 'cavalry' | 'knight'> = {
  azure:    'infantry',
  crimson:  'archer',
  verdant:  'mage',
  amethyst: 'cavalry',
  shadow:   'knight',
};

function applyPlayerFactionOverride(level: LevelDef, factionId: FactionId): LevelDef {
  const newArchetype = ARCHETYPE_BY_FACTION[factionId];
  return {
    ...level,
    players: level.players.map((p) =>
      p.type === 'human'
        ? { ...p, faction: factionId, archetype: newArchetype ?? p.archetype }
        : p,
    ),
  };
}
