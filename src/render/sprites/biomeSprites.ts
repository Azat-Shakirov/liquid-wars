// Biome floor sprite registry. Loads one PNG per biome at PixiRenderer
// init; PixiRenderer draws it as a stretched Sprite filling the map at
// z=0 (below walls, nodes, units).
//
// v2.8.7: snow / jungle added — painterly full-frame sources.
// "stone" biome intentionally has no floor sprite (the canvas's default
// dark background shows through, preserving the v2.7.x look used by ~40
// existing levels). Ruins biome shipped briefly in v2.8.7 then retired
// in a followup — the stone-mosaic source didn't fit the painterly
// low-poly aesthetic of the other biomes.

import { Assets, type Texture } from 'pixi.js';
import type { BiomeId } from '../../engine/content/ContentLibrary';

import desertBgUrl from './biomes/desert-bg.png';
import grassBgUrl from './biomes/grass-bg.png';
import snowBgUrl from './biomes/snow-bg.png';
import jungleBgUrl from './biomes/jungle-bg.png';

const SPRITE_URLS: Partial<Record<BiomeId, string>> = {
  desert: desertBgUrl,
  grass: grassBgUrl,
  snow: snowBgUrl,
  jungle: jungleBgUrl,
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
