// Node sprite registry. Loads one PNG per (nodeType × faction) at
// PixiRenderer init; NodeView grabs the right Texture by node.nodeType
// and node.faction at render time.
//
// v2.8.1: extends the v2.8.0 tower-only registry to cover house, barracks,
// and lab. 4 types × 5 factions = 20 textures preloaded.

import { Assets, type Texture } from 'pixi.js';
import type { FactionId, NodeTypeId } from '../../types';

import houseAzureUrl from './nodes/house-azure.png';
import houseCrimsonUrl from './nodes/house-crimson.png';
import houseVerdantUrl from './nodes/house-verdant.png';
import houseAmethystUrl from './nodes/house-amethyst.png';
import houseShadowUrl from './nodes/house-shadow.png';
import houseNeutralUrl from './nodes/house-neutral.png';

import barracksAzureUrl from './nodes/barracks-azure.png';
import barracksCrimsonUrl from './nodes/barracks-crimson.png';
import barracksVerdantUrl from './nodes/barracks-verdant.png';
import barracksAmethystUrl from './nodes/barracks-amethyst.png';
import barracksShadowUrl from './nodes/barracks-shadow.png';
import barracksNeutralUrl from './nodes/barracks-neutral.png';

import labAzureUrl from './nodes/lab-azure.png';
import labCrimsonUrl from './nodes/lab-crimson.png';
import labVerdantUrl from './nodes/lab-verdant.png';
import labAmethystUrl from './nodes/lab-amethyst.png';
import labShadowUrl from './nodes/lab-shadow.png';
import labNeutralUrl from './nodes/lab-neutral.png';

import towerAzureUrl from './nodes/tower-azure.png';
import towerCrimsonUrl from './nodes/tower-crimson.png';
import towerVerdantUrl from './nodes/tower-verdant.png';
import towerAmethystUrl from './nodes/tower-amethyst.png';
import towerShadowUrl from './nodes/tower-shadow.png';
import towerNeutralUrl from './nodes/tower-neutral.png';

const SPRITE_URLS: Record<NodeTypeId, Record<FactionId, string>> = {
  house: {
    azure: houseAzureUrl,
    crimson: houseCrimsonUrl,
    verdant: houseVerdantUrl,
    amethyst: houseAmethystUrl,
    shadow: houseShadowUrl,
    neutral: houseNeutralUrl,
  },
  barracks: {
    azure: barracksAzureUrl,
    crimson: barracksCrimsonUrl,
    verdant: barracksVerdantUrl,
    amethyst: barracksAmethystUrl,
    shadow: barracksShadowUrl,
    neutral: barracksNeutralUrl,
  },
  lab: {
    azure: labAzureUrl,
    crimson: labCrimsonUrl,
    verdant: labVerdantUrl,
    amethyst: labAmethystUrl,
    shadow: labShadowUrl,
    neutral: labNeutralUrl,
  },
  tower: {
    azure: towerAzureUrl,
    crimson: towerCrimsonUrl,
    verdant: towerVerdantUrl,
    amethyst: towerAmethystUrl,
    shadow: towerShadowUrl,
    neutral: towerNeutralUrl,
  },
};

type TexMap = Map<FactionId, Texture>;
const textures = new Map<NodeTypeId, TexMap>();
let loaded = false;

export async function loadNodeTextures(): Promise<void> {
  if (loaded) return;
  for (const [type, byFaction] of Object.entries(SPRITE_URLS)) {
    const byF = new Map<FactionId, Texture>();
    for (const [faction, url] of Object.entries(byFaction)) {
      const tex = (await Assets.load(url)) as Texture;
      byF.set(faction, tex);
    }
    textures.set(type as NodeTypeId, byF);
  }
  loaded = true;
}

export function getNodeTexture(type: NodeTypeId, faction: FactionId): Texture | null {
  return textures.get(type)?.get(faction) ?? null;
}
