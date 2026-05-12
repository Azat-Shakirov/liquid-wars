// sessionStore — current route + paused flag for the in-game pause menu.
// Ephemeral; not persisted.

import { create } from 'zustand';
import type { LiquidId } from '../types';

export type Route = 'menu' | 'levelSelect' | 'settings' | 'credits' | 'game' | 'quit' | 'editor';

interface SessionStore {
  route: Route;
  selectedLevelId: number | null;
  paused: boolean;
  // Player's chosen liquid for challenge-tier levels (L31-40, the levels
  // with `letPlayerChooseLiquid: true`). On those levels, GameView clones
  // the level and overrides the human player's liquid to this value
  // before booting the engine. On L1-30 (designer's choice) this is
  // ignored. null = fall back to the level's designer-set liquid.
  playerStartLiquid: LiquidId | null;
  navigate: (route: Route) => void;
  startLevel: (id: number) => void;
  setPlayerStartLiquid: (id: LiquidId | null) => void;
  togglePause: () => void;
  setPaused: (p: boolean) => void;
  exitToMenu: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  route: 'menu',
  selectedLevelId: null,
  paused: false,
  playerStartLiquid: null,
  navigate: (route) => set({ route, paused: false }),
  startLevel: (id) => set({ route: 'game', selectedLevelId: id, paused: false }),
  setPlayerStartLiquid: (id) => set({ playerStartLiquid: id }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setPaused: (p) => set({ paused: p }),
  exitToMenu: () => set({ route: 'menu', selectedLevelId: null, paused: false }),
}));
