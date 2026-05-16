// sessionStore — current route + paused flag for the in-game pause menu.
// Ephemeral; not persisted.
//
// v2.8.0: playerStartLiquid → playerStartFaction.

import { create } from 'zustand';
import type { FactionId } from '../types';

export type Route = 'menu' | 'levelSelect' | 'settings' | 'credits' | 'game' | 'quit' | 'editor' | 'variantSandbox';

interface SessionStore {
  route: Route;
  selectedLevelId: number | null;
  paused: boolean;
  // Player's chosen faction for challenge-tier levels (L31-40, the levels
  // with `letPlayerChooseFaction: true`). On those levels, GameView clones
  // the level and overrides the human player's faction to this value
  // before booting the engine. On L1-30 (designer's choice) this is
  // ignored. null = fall back to the level's designer-set faction.
  playerStartFaction: FactionId | null;
  navigate: (route: Route) => void;
  startLevel: (id: number) => void;
  setPlayerStartFaction: (id: FactionId | null) => void;
  togglePause: () => void;
  setPaused: (p: boolean) => void;
  exitToMenu: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  route: 'menu',
  selectedLevelId: null,
  paused: false,
  playerStartFaction: null,
  navigate: (route) => set({ route, paused: false }),
  startLevel: (id) => set({ route: 'game', selectedLevelId: id, paused: false }),
  setPlayerStartFaction: (id) => set({ playerStartFaction: id }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setPaused: (p) => set({ paused: p }),
  exitToMenu: () => set({ route: 'menu', selectedLevelId: null, paused: false }),
}));
