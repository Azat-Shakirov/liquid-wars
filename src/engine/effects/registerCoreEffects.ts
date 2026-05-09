// Registers the core multiplier-style effect handlers used by Phase 1+ liquids.
// Idempotent — safe to call multiple times.

import { registerEffect } from './EffectRegistry';

let registered = false;

export function registerCoreEffects(): void {
  if (registered) return;
  registered = true;

  const multiplyCombine = (a: number, b: number): number => a * b;

  registerEffect({ type: 'productionMultiplier', identity: 1, combine: multiplyCombine });
  registerEffect({ type: 'incomingDamageMultiplier', identity: 1, combine: multiplyCombine });
  registerEffect({ type: 'captureCostMultiplier', identity: 1, combine: multiplyCombine });
  registerEffect({ type: 'travelSpeedMultiplier', identity: 1, combine: multiplyCombine });
  registerEffect({ type: 'spellSpeedMultiplier', identity: 1, combine: multiplyCombine });
}
