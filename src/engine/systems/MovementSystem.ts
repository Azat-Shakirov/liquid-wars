// MovementSystem — advances each in-flight UnitGroup along its path.
// pathProgress is a fraction in [0, 1] of total distance (§4.3).
//
// v2.8.0: applies the OWNER's archetype `speedMultiplier` buff (Cavalry +40%)
// AND the source-faction's legacy `travelSpeedMultiplier` (any liquid-era
// faction can still set it via its JSON effects[] block).

import type { World } from '../World';
import type { ContentLibrary } from '../content/ContentLibrary';
import { effectValueForFaction } from '../effects/EffectRegistry';
import { sampleAlongPath } from '../path';
import type { FactionId } from '../../types';

export class MovementSystem {
  constructor(private readonly content: ContentLibrary) {}

  update(world: World, dtMs: number): void {
    for (const ug of world.unitGroups) {
      if (ug.totalDistance <= 0) {
        ug.pathProgress = 1;
        ug.position = { ...ug.path[ug.path.length - 1]! };
        continue;
      }

      let speedMult = 1;
      const faction = this.content.factions[ug.sourceFaction as FactionId];
      if (faction) {
        speedMult *= effectValueForFaction(faction, 'travelSpeedMultiplier');
      }
      const owner = world.players.find((p) => p.id === ug.ownerId);
      if (owner) {
        const arch = this.content.archetypes[owner.archetype];
        if (arch && arch.buff.type === 'speedMultiplier') {
          speedMult *= arch.buff.value;
        }
      }

      const stepPx = ug.baseSpeed * speedMult * dtMs;
      ug.pathProgress = Math.min(1, ug.pathProgress + stepPx / ug.totalDistance);
      ug.position = sampleAlongPath(ug.path, ug.pathProgress);
    }
  }
}
