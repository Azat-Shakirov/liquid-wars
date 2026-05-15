// Biome floor sprite registry. Loads one PNG per biome at PixiRenderer
// init; PixiRenderer draws it as a stretched Sprite filling the map at
// z=0 (below walls, nodes, units).
//
// v2.8.1: introduces biome rendering. Two biomes shipped initially
// (desert, grass). Other biomes (snow/jungle/ruins) fall back to no
// floor sprite (the canvas's default dark background shows through).

import { Assets, type Texture } from 'pixi.js';
import type { BiomeId } from '../../engine/content/ContentLibrary';

import desertBgUrl from './biomes/desert-bg.png';
import grassBgUrl from './biomes/grass-bg.png';

const SPRITE_URLS: Partial<Record<BiomeId, string>> = {
  desert: desertBgUrl,
  grass: grassBgUrl,
};

const textures = new Map<BiomeId, Texture>();
let loaded = false;

export async function loadBiomeTextures(): Promise<void> {
  if (loaded) return;
  for (const [biome, url] of Object.entries(SPRITE_URLS)) {
    if (!url) continue;
    const tex = (await Assets.load(url)) as Texture;
    textures.set(biome as BiomeId, tex);
  }
  loaded = true;
}

export function getBiomeTexture(biome: BiomeId): Texture | null {
  return textures.get(biome) ?? null;
}
