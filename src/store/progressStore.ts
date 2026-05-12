// progressStore — completed levels + settings, persisted to
// localStorage at the §13 versioned key 'lnw_progress_v1'.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LevelProgress {
  stars: number; // 0..3 (Phase 1 awards a flat 1; multi-star is Phase 5)
  bestTimeMs: number | null;
  unitsLost: number;
}

export interface SettingsState {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
}

interface ProgressStore {
  completedLevels: Record<number, LevelProgress>;
  settings: SettingsState;
  recordCompletion: (id: number, p: LevelProgress) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  resetProgress: () => void;
}

const DEFAULT_SETTINGS: SettingsState = { musicVolume: 0.5, sfxVolume: 0.8 };

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set) => ({
      completedLevels: {},
      settings: { ...DEFAULT_SETTINGS },
      recordCompletion: (id, p) =>
        set((s) => {
          const existing = s.completedLevels[id];
          // Keep best time + max stars across attempts.
          const merged: LevelProgress = {
            stars: Math.max(existing?.stars ?? 0, p.stars),
            bestTimeMs:
              existing?.bestTimeMs !== null && existing?.bestTimeMs !== undefined
                ? Math.min(existing.bestTimeMs, p.bestTimeMs ?? existing.bestTimeMs)
                : p.bestTimeMs,
            unitsLost:
              existing !== undefined ? Math.min(existing.unitsLost, p.unitsLost) : p.unitsLost,
          };
          return { completedLevels: { ...s.completedLevels, [id]: merged } };
        }),
      setMusicVolume: (v) => set((s) => ({ settings: { ...s.settings, musicVolume: clamp01(v) } })),
      setSfxVolume: (v) => set((s) => ({ settings: { ...s.settings, sfxVolume: clamp01(v) } })),
      resetProgress: () =>
        set({ completedLevels: {}, settings: { ...DEFAULT_SETTINGS } }),
    }),
    {
      name: 'lnw_progress_v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Level N is unlocked if it's the first level in the sorted list, or if
// the level immediately before it has been completed.
//
// DEV bypass: when running under `npm run dev` (Vite sets
// import.meta.env.DEV = true) every level is unlocked so the author
// can jump straight to any level for playtest. Production builds
// (`npm run build`) keep the progression gate intact.
export function isLevelUnlocked(
  id: number,
  sortedAvailable: number[],
  completed: Record<number, LevelProgress>,
): boolean {
  if (import.meta.env.DEV) return true;
  const idx = sortedAvailable.indexOf(id);
  if (idx === -1) return false;
  if (idx === 0) return true;
  const prev = sortedAvailable[idx - 1]!;
  return completed[prev] !== undefined;
}
