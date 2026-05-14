// Tower sprite registry. Loads PNG textures for each faction (heraldic
// tincture) once at renderer init; NodeView grabs the right Texture at
// render time by node.faction.

import { Assets, type Texture } from 'pixi.js';
import type { FactionId } from '../../types';

import towerAzureUrl from './nodes/tower-azure.png';
import towerCrimsonUrl from './nodes/tower-crimson.png';
import towerVerdantUrl from './nodes/tower-verdant.png';
import towerAmethystUrl from './nodes/tower-amethyst.png';
import towerShadowUrl from './nodes/tower-shadow.png';

const SPRITE_URLS: Record<FactionId, string> = {
  azure: towerAzureUrl,
  crimson: towerCrimsonUrl,
  verdant: towerVerdantUrl,
  amethyst: towerAmethystUrl,
  shadow: towerShadowUrl,
};

const textures = new Map<FactionId, Texture>();
let loaded = false;

export async function loadTowerTextures(): Promise<void> {
  if (loaded) return;
  for (const [faction, url] of Object.entries(SPRITE_URLS)) {
    const tex = (await Assets.load(url)) as Texture;
    textures.set(faction, tex);
  }
  loaded = true;
}

export function getTowerTexture(faction: FactionId): Texture | null {
  return textures.get(faction) ?? null;
}

export function towerTexturesReady(): boolean {
  return loaded;
}
