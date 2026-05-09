// EffectRegistry — single dispatch point for liquid effects (§5.2).
//
// Adding a new liquid that uses an existing effect type = JSON only.
// Adding a new effect primitive = register one handler here.
//
// Effects are NOT applied globally per tick. Each system queries the relevant
// effect type when needed (§5.3). The registry just maps type → numeric value
// extractor so callers can fold all liquid contributions for a given context.

import type { LiquidEffect, LiquidDef } from '../content/ContentLibrary';

export type EffectType =
  | 'productionMultiplier'
  | 'incomingDamageMultiplier'
  | 'captureCostMultiplier'
  | 'travelSpeedMultiplier'
  | 'spellSpeedMultiplier';

export interface EffectHandler {
  type: EffectType;
  // Identity value when no liquid contributes — multiplied effects use 1.
  identity: number;
  // How to combine multiple values (most multipliers: just multiply).
  combine(a: number, b: number): number;
}

const handlers = new Map<string, EffectHandler>();

export function registerEffect(handler: EffectHandler): void {
  handlers.set(handler.type, handler);
}

export function getHandler(type: EffectType): EffectHandler {
  const h = handlers.get(type);
  if (!h) throw new Error(`Unknown effect type: ${type}`);
  return h;
}

// Fold all matching effects from a single liquid into one number.
export function effectValueForLiquid(liquid: LiquidDef, type: EffectType): number {
  const handler = getHandler(type);
  let acc = handler.identity;
  for (const eff of liquid.effects) {
    if (eff.type === type) acc = handler.combine(acc, eff.value);
  }
  return acc;
}

// Useful utility: confirm every effect type referenced by content has a handler.
export function validateLiquidEffects(liquid: LiquidDef): void {
  for (const eff of liquid.effects as LiquidEffect[]) {
    if (!handlers.has(eff.type)) {
      throw new Error(`Liquid '${liquid.id}' references unknown effect type '${eff.type}'`);
    }
  }
}

// Test-only — clear the registry to reinit between tests.
export function _resetRegistry(): void {
  handlers.clear();
}
