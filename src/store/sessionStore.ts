// sessionStore — current route + paused flag for the in-game pause menu.
// Ephemeral; not persisted.

import { create } from 'zustand';

export type Route = 'menu' | 'levelSelect' | 'settings' | 'credits' | 'game' | 'quit';

interface SessionStore {
  route: Route;
  selectedLevelId: number | null;
  paused: boolean;
  navigate: (route: Route) => void;
  startLevel: (id: number) => void;
  togglePause: () => void;
  setPaused: (p: boolean) => void;
  exitToMenu: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  route: 'menu',
  selectedLevelId: null,
  paused: false,
  navigate: (route) => set({ route, paused: false }),
  startLevel: (id) => set({ route: 'game', selectedLevelId: id, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setPaused: (p) => set({ paused: p }),
  exitToMenu: () => set({ route: 'menu', selectedLevelId: null, paused: false }),
}));
