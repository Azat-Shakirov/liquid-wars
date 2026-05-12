// LiquidPickerOverlay — one-shot modal shown on challenge-tier levels
// (LevelDef.letPlayerChooseLiquid). Player picks their liquid before
// the engine boots. Engine is paused via tutorialOpenRef until the
// player confirms.

import { useState } from 'react';
import type { ContentLibrary } from '../engine/content/ContentLibrary';
import type { LiquidId } from '../types';

interface Props {
  content: ContentLibrary;
  levelName: string;
  onConfirm: (liquid: LiquidId) => void;
}

export function LiquidPickerOverlay({ content, levelName, onConfirm }: Props) {
  const [picked, setPicked] = useState<LiquidId | null>(null);
  const liquidIds = Object.keys(content.liquids).sort();

  return (
    <div style={backdropStyle}>
      <div style={cardStyle}>
        <div style={kickerStyle}>{levelName}</div>
        <div style={titleStyle}>Choose your liquid</div>
        <div style={bodyStyle}>
          Every node you own (and every node you capture) will be this liquid.
          You can pick differently each time you replay this level.
        </div>
        <div style={chipRowStyle}>
          {liquidIds.map((id) => {
            const liq = content.liquids[id as LiquidId]!;
            const selected = picked === id;
            return (
              <button
                key={id}
                onClick={() => setPicked(id as LiquidId)}
                style={{
                  ...chipStyle,
                  borderColor: selected ? liq.color : 'rgba(255,255,255,0.15)',
                  background: selected
                    ? `${liq.color}22`
                    : 'rgba(255,255,255,0.04)',
                }}
              >
                <span style={{ ...swatchStyle, background: liq.color }} />
                <div style={chipTextStyle}>
                  <div style={chipNameStyle}>{liq.name}</div>
                  <div style={chipDescStyle}>{liq.description}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button
          style={{ ...beginButtonStyle, opacity: picked ? 1 : 0.4, cursor: picked ? 'pointer' : 'not-allowed' }}
          disabled={picked === null}
          onClick={() => picked && onConfirm(picked)}
        >
          Begin
        </button>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 10, 14, 0.82)',
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
  padding: '28px 32px',
  width: 520,
  maxWidth: '92vw',
  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  color: '#e8e8e8',
};

const kickerStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a8090',
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 8,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: '#cdd3dd',
  marginBottom: 18,
};

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 18,
};

const chipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  fontSize: 13,
  color: '#e8e8e8',
  background: 'rgba(255,255,255,0.04)',
  cursor: 'pointer',
  textAlign: 'left',
};

const swatchStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 16,
  height: 16,
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.2)',
  flexShrink: 0,
};

const chipTextStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const chipNameStyle: React.CSSProperties = {
  fontWeight: 600,
};

const chipDescStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
  marginTop: 1,
  lineHeight: 1.35,
};

const beginButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 28px',
  background: '#3da9fc',
  color: '#0a1018',
  fontWeight: 700,
  fontSize: 14,
  border: 'none',
  borderRadius: 6,
  letterSpacing: '0.04em',
};
