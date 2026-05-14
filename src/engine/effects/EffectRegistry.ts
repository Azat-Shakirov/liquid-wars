// EffectRegistry — single dispatch point for faction effects (§5.2).
//
// Adding a new faction that uses an existing effect type = JSON only.
// Adding a new effect primitive = register one handler here.
//
// Effects are NOT applied globally per tick. Each system queries the relevant
// effect type when needed (§5.3). The registry just maps type → numeric value
// extractor so callers can fold all faction contributions for a given context.
//
// v2.8.0: renamed Liquid* → Faction*. The mechanic is unchanged — factions
// can still have an `effects[]` block in their JSON for liquid-era multipliers
// (a few legacy levels still rely on Ink halving incoming damage, etc.).
// New gameplay buffs in v2.8.0 live on Archetype, not Faction.

import type { FactionEffect, FactionDef } from '../content/ContentLibrary';

export type EffectType =
  | 'productionMultiplier'
  | 'incomingDamageMultiplier'
  | 'captureCostMultiplier'
  | 'travelSpeedMultiplier'
  | 'spellSpeedMultiplier';

export interface EffectHandler {
  type: EffectType;
  // Identity value when no faction contributes — multiplied effects use 1.
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

// Fold all matching effects from a single faction into one number.
//
// v2.8.0: most factions ship with empty effects[] under the castle model
// (gameplay buffs moved to archetypes). Short-circuit on that empty case
// so callers don't need to register core effects when no faction uses any.
export function effectValueForFaction(faction: FactionDef, type: EffectType): number {
  if (faction.effects.length === 0) return 1;
  const handler = getHandler(type);
  let acc = handler.identity;
  for (const eff of faction.effects) {
    if (eff.type === type) acc = handler.combine(acc, eff.value);
  }
  return acc;
}

// Useful utility: confirm every effect type referenced by content has a handler.
export function validateFactionEffects(faction: FactionDef): void {
  for (const eff of faction.effects as FactionEffect[]) {
    if (!handlers.has(eff.type)) {
      throw new Error(`Faction '${faction.id}' references unknown effect type '${eff.type}'`);
    }
  }
}

// Test-only — clear the registry to reinit between tests.
export function _resetRegistry(): void {
  handlers.clear();
}
