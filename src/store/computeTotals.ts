// Compute per-player unit totals from an engine World snapshot.
// Lives in src/store (not engine/) so it can import the HUD types and is
// not part of the deterministic simulation. Engine code never imports
// from here. (§2 hard rule.)

import type { World } from '../engine/World';
import type { PlayerTotal } from './hudStore';

export function computePlayerTotals(world: World): PlayerTotal[] {
  const map = new Map<string, { color: string; total: number }>();
  for (const p of world.players) {
    map.set(p.id, { color: p.color, total: 0 });
  }

  for (const id of world.nodeOrder) {
    const n = world.nodes.get(id);
    if (!n || n.ownerId === null) continue; // exclude neutral nodes
    const slot = map.get(n.ownerId);
    if (!slot) continue;
    slot.total += Math.floor(n.units);
  }
  for (const ug of world.unitGroups) {
    const slot = map.get(ug.ownerId);
    if (!slot) continue;
    slot.total += Math.floor(ug.count);
  }

  const out: PlayerTotal[] = [];
  // Stable iteration via world.players insertion order.
  for (const p of world.players) {
    const slot = map.get(p.id);
    if (slot) out.push({ id: p.id, color: slot.color, total: slot.total });
  }
  return out;
}
