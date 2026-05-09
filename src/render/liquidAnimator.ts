// liquidAnimator — generates the polygon points for a sloshing fill (§10.2).
// y = baseLevel + amplitude * sin(time * freq + x * waveLen)

const STEPS = 24;
const AMPLITUDE = 2.4;
const WAVE_LEN = 0.18;
const FREQ_HZ = 0.55;

export function buildLiquidPolyPoints(
  width: number,
  height: number,
  fillRatio: number, // 0..1 (1 = full)
  timeMs: number,
  phase = 0,
): number[] {
  const r = Math.max(0, Math.min(1, fillRatio));
  const halfW = width / 2;
  const halfH = height / 2;
  const topY = -halfH + (1 - r) * height;
  const t = (timeMs / 1000) * FREQ_HZ * Math.PI * 2 + phase;

  const pts: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = -halfW + (width * i) / STEPS;
    const y = topY + Math.sin(t + x * WAVE_LEN) * AMPLITUDE * r;
    pts.push(x, y);
  }
  pts.push(halfW, halfH);
  pts.push(-halfW, halfH);
  return pts;
}
