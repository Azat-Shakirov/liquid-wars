// Seeded RNG for engine determinism (§3.3). mulberry32 — small, fast, decent.
// Engine code MUST use this rather than Math.random().

export interface SeededRNG {
  readonly seed: number;
  next(): number;
}

export function createRNG(seed: number): SeededRNG {
  let state = seed >>> 0;
  return {
    seed,
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
