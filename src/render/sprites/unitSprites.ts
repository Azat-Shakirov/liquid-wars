// Unit sprite registry. Loads per-(archetype × faction) walk-cycle frames;
// UnitGroupView alternates frames every WALK_FRAME_MS to animate the march.
//
// v2.8.7: extended from infantry-only to the full 5-archetype roster
// (infantry / knight / archer / mage / cavalry). 5 archetypes × 5 factions ×
// 2 frames = 50 textures preloaded. UnitGroupView resolves which set to use
// by looking up the owner player's archetype on world.players.

import { Assets, type Texture } from 'pixi.js';
import type { FactionId } from '../../types';
import type { ArchetypeId } from '../../engine/content/ContentLibrary';

// Infantry.
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

// Knight (renamed from elite in v2.8.7).
import knightAzure0 from './units/knight-azure-0.png';
import knightAzure1 from './units/knight-azure-1.png';
import knightCrimson0 from './units/knight-crimson-0.png';
import knightCrimson1 from './units/knight-crimson-1.png';
import knightVerdant0 from './units/knight-verdant-0.png';
import knightVerdant1 from './units/knight-verdant-1.png';
import knightAmethyst0 from './units/knight-amethyst-0.png';
import knightAmethyst1 from './units/knight-amethyst-1.png';
import knightShadow0 from './units/knight-shadow-0.png';
import knightShadow1 from './units/knight-shadow-1.png';

// Archer (renamed from assassin in v2.8.7).
import archerAzure0 from './units/archer-azure-0.png';
import archerAzure1 from './units/archer-azure-1.png';
import archerCrimson0 from './units/archer-crimson-0.png';
import archerCrimson1 from './units/archer-crimson-1.png';
import archerVerdant0 from './units/archer-verdant-0.png';
import archerVerdant1 from './units/archer-verdant-1.png';
import archerAmethyst0 from './units/archer-amethyst-0.png';
import archerAmethyst1 from './units/archer-amethyst-1.png';
import archerShadow0 from './units/archer-shadow-0.png';
import archerShadow1 from './units/archer-shadow-1.png';

// Mage.
import mageAzure0 from './units/mage-azure-0.png';
import mageAzure1 from './units/mage-azure-1.png';
import mageCrimson0 from './units/mage-crimson-0.png';
import mageCrimson1 from './units/mage-crimson-1.png';
import mageVerdant0 from './units/mage-verdant-0.png';
import mageVerdant1 from './units/mage-verdant-1.png';
import mageAmethyst0 from './units/mage-amethyst-0.png';
import mageAmethyst1 from './units/mage-amethyst-1.png';
import mageShadow0 from './units/mage-shadow-0.png';
import mageShadow1 from './units/mage-shadow-1.png';

// Cavalry — single-source pipeline uses cavalry-1.jpeg (charge pose).
import cavalryAzure0 from './units/cavalry-azure-0.png';
import cavalryAzure1 from './units/cavalry-azure-1.png';
import cavalryCrimson0 from './units/cavalry-crimson-0.png';
import cavalryCrimson1 from './units/cavalry-crimson-1.png';
import cavalryVerdant0 from './units/cavalry-verdant-0.png';
import cavalryVerdant1 from './units/cavalry-verdant-1.png';
import cavalryAmethyst0 from './units/cavalry-amethyst-0.png';
import cavalryAmethyst1 from './units/cavalry-amethyst-1.png';
import cavalryShadow0 from './units/cavalry-shadow-0.png';
import cavalryShadow1 from './units/cavalry-shadow-1.png';

type FramePair = [Texture, Texture];

const SPRITE_URLS: Record<ArchetypeId, Record<FactionId, [string, string]>> = {
  infantry: {
    azure:    [infantryAzure0,    infantryAzure1],
    crimson:  [infantryCrimson0,  infantryCrimson1],
    verdant:  [infantryVerdant0,  infantryVerdant1],
    amethyst: [infantryAmethyst0, infantryAmethyst1],
    shadow:   [infantryShadow0,   infantryShadow1],
  },
  knight: {
    azure:    [knightAzure0,    knightAzure1],
    crimson:  [knightCrimson0,  knightCrimson1],
    verdant:  [knightVerdant0,  knightVerdant1],
    amethyst: [knightAmethyst0, knightAmethyst1],
    shadow:   [knightShadow0,   knightShadow1],
  },
  archer: {
    azure:    [archerAzure0,    archerAzure1],
    crimson:  [archerCrimson0,  archerCrimson1],
    verdant:  [archerVerdant0,  archerVerdant1],
    amethyst: [archerAmethyst0, archerAmethyst1],
    shadow:   [archerShadow0,   archerShadow1],
  },
  mage: {
    azure:    [mageAzure0,    mageAzure1],
    crimson:  [mageCrimson0,  mageCrimson1],
    verdant:  [mageVerdant0,  mageVerdant1],
    amethyst: [mageAmethyst0, mageAmethyst1],
    shadow:   [mageShadow0,   mageShadow1],
  },
  cavalry: {
    azure:    [cavalryAzure0,    cavalryAzure1],
    crimson:  [cavalryCrimson0,  cavalryCrimson1],
    verdant:  [cavalryVerdant0,  cavalryVerdant1],
    amethyst: [cavalryAmethyst0, cavalryAmethyst1],
    shadow:   [cavalryShadow0,   cavalryShadow1],
  },
};

type FactionFrames = Map<FactionId, FramePair>;
const frames = new Map<ArchetypeId, FactionFrames>();
let loaded = false;

export async function loadUnitTextures(): Promise<void> {
  if (loaded) return;
  for (const [archetype, byFaction] of Object.entries(SPRITE_URLS)) {
    const byF: FactionFrames = new Map();
    for (const [faction, urls] of Object.entries(byFaction)) {
      const t0 = (await Assets.load(urls[0])) as Texture;
      const t1 = (await Assets.load(urls[1])) as Texture;
      byF.set(faction as FactionId, [t0, t1]);
    }
    frames.set(archetype as ArchetypeId, byF);
  }
  loaded = true;
}

// Get the requested walk frame for an (archetype, faction) pair.
// `frame` is masked to 0 or 1 — callers may pass any integer.
export function getUnitFrame(archetype: ArchetypeId, faction: FactionId, frame: number): Texture | null {
  const pair = frames.get(archetype)?.get(faction);
  if (!pair) return null;
  return pair[frame & 1] ?? null;
}
