// Unit sprite registry. Loads per-liquid infantry PNGs once at renderer init.
// UnitGroupView reads the right Texture by sourceLiquid at render time.

import { Assets, type Texture } from 'pixi.js';
import type { LiquidId } from '../../types';

import infantryWaterUrl from './units/infantry-water.png';
import infantryBloodUrl from './units/infantry-blood.png';
import infantrySlimeUrl from './units/infantry-slime.png';
import infantryVenomUrl from './units/infantry-venom.png';
import infantryInkUrl from './units/infantry-ink.png';

const SPRITE_URLS: Record<LiquidId, string> = {
  water: infantryWaterUrl,
  blood: infantryBloodUrl,
  slime: infantrySlimeUrl,
  venom: infantryVenomUrl,
  ink: infantryInkUrl,
};

const textures = new Map<LiquidId, Texture>();
let loaded = false;

export async function loadUnitTextures(): Promise<void> {
  if (loaded) return;
  for (const [liquid, url] of Object.entries(SPRITE_URLS)) {
    const tex = (await Assets.load(url)) as Texture;
    textures.set(liquid, tex);
  }
  loaded = true;
}

export function getUnitTexture(liquid: LiquidId): Texture | null {
  return textures.get(liquid) ?? null;
}
