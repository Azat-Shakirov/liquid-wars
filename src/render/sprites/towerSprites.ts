// Tower sprite registry. Loads PNG textures for each liquid color once at
// renderer init; NodeView grabs the right Texture at render time by liquidId.

import { Assets, type Texture } from 'pixi.js';
import type { LiquidId } from '../../types';

import towerWaterUrl from './nodes/tower-water.png';
import towerBloodUrl from './nodes/tower-blood.png';
import towerSlimeUrl from './nodes/tower-slime.png';
import towerVenomUrl from './nodes/tower-venom.png';
import towerInkUrl from './nodes/tower-ink.png';

const SPRITE_URLS: Record<LiquidId, string> = {
  water: towerWaterUrl,
  blood: towerBloodUrl,
  slime: towerSlimeUrl,
  venom: towerVenomUrl,
  ink: towerInkUrl,
};

const textures = new Map<LiquidId, Texture>();
let loaded = false;

export async function loadTowerTextures(): Promise<void> {
  if (loaded) return;
  for (const [liquid, url] of Object.entries(SPRITE_URLS)) {
    const tex = (await Assets.load(url)) as Texture;
    textures.set(liquid, tex);
  }
  loaded = true;
}

export function getTowerTexture(liquid: LiquidId): Texture | null {
  return textures.get(liquid) ?? null;
}

export function towerTexturesReady(): boolean {
  return loaded;
}
