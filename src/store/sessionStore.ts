// sessionStore — current route + paused flag for the in-game pause menu.
// Ephemeral; not persisted.

import { create } from 'zustand';
import type { LiquidId } from '../types';

export type Route = 'menu' | 'levelSelect' | 'settings' | 'credits' | 'game' | 'quit';

interface SessionStore {
  route: Route;
  selectedLevelId: number | null;
  paused: boolean;
  // Dev-only: when set, GameView clones the level and overrides the
  // human player's starting nodes' liquidType to this value before
  // booting the engine. null = use the level's defaults.
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
