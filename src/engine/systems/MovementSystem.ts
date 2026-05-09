// MovementSystem — advances each in-flight UnitGroup along its path.
// pathProgress is a fraction in [0, 1] of total distance (§4.3).

import type { World } from '../World';
import { sampleAlongPath } from '../path';

export class MovementSystem {
  update(world: World, dtMs: number): void {
    for (const ug of world.unitGroups) {
      if (ug.totalDistance <= 0) {
        ug.pathProgress = 1;
        ug.position = { ...ug.path[ug.path.length - 1]! };
        continue;
      }
      const stepPx = ug.baseSpeed * dtMs;
      ug.pathProgress = Math.min(1, ug.pathProgress + stepPx / ug.totalDistance);
      ug.position = sampleAlongPath(ug.path, ug.pathProgress);
    }
  }
}
