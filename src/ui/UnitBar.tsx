// UnitBar — Risk-style power bar across the top of the screen.
// Subscribes to the HUD store, animates width changes via CSS transition.

import { useHudStore } from '../store/hudStore';

const BAR_HEIGHT = 24;
const TRANSITION_MS = 200;
const MIN_WIDTH_FOR_LABEL_PX = 36;

export function UnitBar() {
  const players = useHudStore((s) => s.players);
  const totalUnits = useHudStore((s) => s.totalUnits);

  // Pre-game state (no players yet) — render an empty placeholder so the
  // canvas below sits in the same spot once the game starts.
  if (players.length === 0) {
    return <div style={containerStyle} />;
  }

  return (
    <div style={containerStyle}>
      {players.map((p) => {
        const widthPct = totalUnits > 0 ? (p.total / totalUnits) * 100 : 100 / players.length;
        const segmentWidthApprox = (widthPct / 100) * (typeof window !== 'undefined' ? window.innerWidth : 1280);
        const showLabel = segmentWidthApprox >= MIN_WIDTH_FOR_LABEL_PX;
        return (
          <div
            key={p.id}
            style={{
              width: `${widthPct}%`,
              backgroundColor: p.color,
              transition: `width ${TRANSITION_MS}ms ease-out`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              textShadow: '0 1px 1px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {showLabel ? p.total.toString() : ''}
          </div>
        );
      })}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: BAR_HEIGHT,
  display: 'flex',
  flexDirection: 'row',
  zIndex: 10,
  pointerEvents: 'none',
  backgroundColor: 'rgba(20, 20, 24, 0.6)',
};
