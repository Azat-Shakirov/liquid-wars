// TutorialOverlay — one-shot modal shown when a level starts that has
// a `tutorial` field. Engine is paused until the user clicks Start.
// Visible on top of the game canvas; clicking outside the card does
// nothing (the player must read + dismiss).

import type { TutorialDef } from '../engine/content/ContentLibrary';

interface Props {
  tutorial: TutorialDef;
  levelName: string;
  onDismiss: () => void;
}

export function TutorialOverlay({ tutorial, levelName, onDismiss }: Props) {
  return (
    <div style={backdropStyle}>
      <div style={cardStyle}>
        <div style={kickerStyle}>{levelName}</div>
        <div style={titleStyle}>{tutorial.title}</div>
        <div style={bodyStyle}>{tutorial.body}</div>
        <button style={buttonStyle} onClick={onDismiss}>Start</button>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 10, 14, 0.78)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  fontFamily: 'system-ui, sans-serif',
};

const cardStyle: React.CSSProperties = {
  background: '#181b22',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  padding: '32px 36px',
  width: 480,
  maxWidth: '90vw',
  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  color: '#e8e8e8',
};

const kickerStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a8090',
  marginBottom: 8,
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  marginBottom: 16,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: '#cdd3dd',
  marginBottom: 24,
  whiteSpace: 'pre-line',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 22px',
  background: '#3da9fc',
  color: '#0a1018',
  fontWeight: 700,
  fontSize: 14,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  letterSpacing: '0.04em',
};
