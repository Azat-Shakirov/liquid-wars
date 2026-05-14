// Unit sprite registry. Loads per-faction infantry PNGs in two walk-cycle
// frames; UnitGroupView alternates frames to animate the march.

import { Assets, type Texture } from 'pixi.js';
import type { FactionId } from '../../types';

import infantryAzure0 from './units/infantry-azure-0.png';
import infantryAzure1 from './units/infantry-azure-1.png';
import infantryCrimson0 from './units/infantry-crimson-0.png';
import infantryCrimson1 from './units/infantry-crimson-1.png';
import infantryVerdant0 from './units/infantry-verdant-0.png';
import infantryVerdant1 from './units/infantry-verdant-1.png';
import infantryAmethyst0 from './units/infantry-amethyst-0.png';
import infantryAmethyst1 from './units/infantry-amethyst-1.png';
import infantryShadow0 from './units/infantry-shadow-0.png';
import infantryShadow1 from './units/infantry-shadow-1.png';

type FramePair = [Texture, Texture];

const SPRITE_URLS: Record<FactionId, [string, string]> = {
  azure: [infantryAzure0, infantryAzure1],
  crimson: [infantryCrimson0, infantryCrimson1],
  verdant: [infantryVerdant0, infantryVerdant1],
  amethyst: [infantryAmethyst0, infantryAmethyst1],
  shadow: [infantryShadow0, infantryShadow1],
};

const frames = new Map<FactionId, FramePair>();
let loaded = false;

export async function loadUnitTextures(): Promise<void> {
  if (loaded) return;
  for (const [faction, urls] of Object.entries(SPRITE_URLS)) {
    const t0 = (await Assets.load(urls[0])) as Texture;
    const t1 = (await Assets.load(urls[1])) as Texture;
    frames.set(faction, [t0, t1]);
  }
  loaded = true;
}

// Get the requested walk frame for a given faction; 0 or 1 indices.
export function getUnitFrame(faction: FactionId, frame: number): Texture | null {
  const pair = frames.get(faction);
  if (!pair) return null;
  return pair[frame & 1] ?? null;
}
