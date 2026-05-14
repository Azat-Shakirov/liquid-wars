// Unit sprite registry. Loads per-liquid infantry PNGs in two walk-cycle
// frames; UnitGroupView alternates frames to animate the march.

import { Assets, type Texture } from 'pixi.js';
import type { LiquidId } from '../../types';

import infantryWater0 from './units/infantry-water-0.png';
import infantryWater1 from './units/infantry-water-1.png';
import infantryBlood0 from './units/infantry-blood-0.png';
import infantryBlood1 from './units/infantry-blood-1.png';
import infantrySlime0 from './units/infantry-slime-0.png';
import infantrySlime1 from './units/infantry-slime-1.png';
import infantryVenom0 from './units/infantry-venom-0.png';
import infantryVenom1 from './units/infantry-venom-1.png';
import infantryInk0 from './units/infantry-ink-0.png';
import infantryInk1 from './units/infantry-ink-1.png';

type FramePair = [Texture, Texture];

const SPRITE_URLS: Record<LiquidId, [string, string]> = {
  water: [infantryWater0, infantryWater1],
  blood: [infantryBlood0, infantryBlood1],
  slime: [infantrySlime0, infantrySlime1],
  venom: [infantryVenom0, infantryVenom1],
  ink: [infantryInk0, infantryInk1],
};

const frames = new Map<LiquidId, FramePair>();
let loaded = false;

export async function loadUnitTextures(): Promise<void> {
  if (loaded) return;
  for (const [liquid, urls] of Object.entries(SPRITE_URLS)) {
    const t0 = (await Assets.load(urls[0])) as Texture;
    const t1 = (await Assets.load(urls[1])) as Texture;
    frames.set(liquid, [t0, t1]);
  }
  loaded = true;
}

// Get the requested walk frame for a given liquid; 0 or 1 indices.
export function getUnitFrame(liquid: LiquidId, frame: number): Texture | null {
  const pair = frames.get(liquid);
  if (!pair) return null;
  return pair[frame & 1] ?? null;
}
