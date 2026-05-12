// ObjectiveBanner — persistent strip across the top of the game view
// showing the current level's objective string. Purely cosmetic; no
// engine semantics. Sits below the UnitBar.

interface Props {
  objective: string;
}

export function ObjectiveBanner({ objective }: Props) {
  return (
    <div style={bannerStyle}>
      <span style={kickerStyle}>Objective</span>
      <span style={textStyle}>{objective}</span>
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 32,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  background: 'rgba(20, 22, 28, 0.85)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  color: '#e8e8e8',
  zIndex: 6,
  pointerEvents: 'none',
  maxWidth: '90vw',
};

const kickerStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#7a8090',
};

const textStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
};
