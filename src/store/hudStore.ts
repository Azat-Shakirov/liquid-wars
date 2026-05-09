// HUD store — per-player unit totals for the top-of-screen power bar.
// Updated from outside the engine (a 100ms poll in App/GameView) so
// React only re-renders on diff (§3.1: HUD must NOT re-render every tick).

import { create } from 'zustand';
import type { PlayerId } from '../types';

export interface PlayerTotal {
  id: PlayerId;
  color: string;
  total: number;
}

interface HudState {
  players: PlayerTotal[];
  totalUnits: number;
  setTotals: (next: PlayerTotal[]) => void;
  reset: () => void;
}

function totalsEqual(a: PlayerTotal[], b: PlayerTotal[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id || x.color !== y.color || x.total !== y.total) return false;
  }
  return true;
}

export const useHudStore = create<HudState>((set, get) => ({
  players: [],
  totalUnits: 0,
  setTotals: (next: PlayerTotal[]) => {
    const current = get().players;
    if (totalsEqual(current, next)) return;
    let totalUnits = 0;
    for (const p of next) totalUnits += p.total;
    set({ players: next, totalUnits });
  },
  reset: () => set({ players: [], totalUnits: 0 }),
}));
