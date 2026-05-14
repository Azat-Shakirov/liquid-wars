// SpellCastStrategy — pairs with ConcoctStrategy. When a Lab has a
// 'ready' spell queued, picks the highest-value enemy target and casts.
//
// Target picking per spell:
//   - freeze:  highest-level enemy node (disable a key piece — preferring
//              towers and labs since freeze sets ownerId=null and the
//              target stops producing / shooting until recaptured).
//   - bleed:   strongest enemy node by units (drains 1/sec + halts
//              production — bleed only pays off on a high-unit target).
//   - recruit: weakest enemy node (cheapest cap flip — recruit preserves
//              current unit count, so flipping a 1-unit barracks is free
//              expansion).
//
// Personality gate: `weights.spellUse > 0`. Without a queued spell this
// strategy returns null.

import type { Node } from '../../entities/Node';
import type { Strategy, StrategyDecision } from './BaseStrategy';
import type { World, Player } from '../../World';
import type { AIPersonalityDef, ContentLibrary } from '../../content/ContentLibrary';

export const SpellCastStrategy: Strategy = {
  id: 'SpellCastStrategy',
  decide(
    world: World,
    me: Player,
    personality: AIPersonalityDef,
    _content: ContentLibrary,
  ): StrategyDecision | null {
    if (personality.weights.spellUse <= 0) return null;

    // Find a ready Lab (in node-order for determinism).
    let readyLab: Node | null = null;
    for (const id of world.nodeOrder) {
      const n = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId !== me.id) continue;
      if (n.nodeType !== 'lab') continue;
      if (n.isFrozen) continue;
      if (!n.spellQueue || n.spellQueue.state !== 'ready') continue;
      readyLab = n;
      break;
    }
    if (!readyLab || !readyLab.spellQueue) return null;
    const spellId = readyLab.spellQueue.spellId;

    // Candidate enemies (excludes friendly, includes neutrals as targets
    // for recruit/freeze — a captured neutral is valid territory).
    const enemies: Node[] = [];
    for (const id of world.nodeOrder) {
      const n = world.nodes.get(id);
      if (!n) continue;
      if (n.ownerId === me.id) continue;
      enemies.push(n);
    }
    if (enemies.length === 0) return null;

    let target: Node | null = null;
    if (spellId === 'freeze') {
      // Highest level (towers + labs are best). Tiebreak: more units, then id.
      target = enemies.reduce<Node | null>((best, e) => {
        if (!best) return e;
        if (e.level > best.level) return e;
        if (e.level < best.level) return best;
        if (e.units > best.units) return e;
        if (e.units < best.units) return best;
        return e.id < best.id ? e : best;
      }, null);
    } else if (spellId === 'starve') {
      // Strongest by units. Tiebreak: higher level, then id.
      target = enemies.reduce<Node | null>((best, e) => {
        if (!best) return e;
        if (e.units > best.units) return e;
        if (e.units < best.units) return best;
        if (e.level > best.level) return e;
        if (e.level < best.level) return best;
        return e.id < best.id ? e : best;
      }, null);
    } else if (spellId === 'sabotage') {
      // Weakest enemy by units. Recruit on neutrals is wasteful (no flip
      // benefit since they're already non-self) — only consider enemy-owned.
      const owned = enemies.filter((e) => e.ownerId !== null);
      if (owned.length === 0) return null;
      target = owned.reduce<Node | null>((best, e) => {
        if (!best) return e;
        if (e.units < best.units) return e;
        if (e.units > best.units) return best;
        return e.id < best.id ? e : best;
      }, null);
    }

    if (!target) return null;
    return { kind: 'cast', labNodeId: readyLab.id, targetNodeId: target.id };
  },
};
