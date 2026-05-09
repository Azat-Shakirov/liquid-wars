// Shape geometry constants and helpers shared by NodeView.
// Phase 1 only uses Barracks (rounded square). Phase 2+ adds circle/triangle/hex.

import type { NodeTypeId } from '../types';

export interface ShapeMetrics {
  size: number;        // bounding-box edge in px
  cornerRadius: number;
}

export function metricsForType(type: NodeTypeId, level: number): ShapeMetrics {
  // Slightly grow with level so higher-tier nodes feel chunkier without
  // changing pip rules. Values pulled to feel-good defaults; can move to
  // content JSON later if rebalanced.
  const baseByType: Record<NodeTypeId, number> = {
    house: 48,
    barracks: 56,
    lab: 60,
    tower: 60,
  };
  const base = baseByType[type];
  const size = base + (level - 1) * 4;
  return { size, cornerRadius: 8 };
}

export function colorFromHex(hex: string): number {
  // '#a01010' → 0xa01010
  return parseInt(hex.replace('#', ''), 16);
}
