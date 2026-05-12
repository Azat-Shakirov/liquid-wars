import { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useProgressStore, isLevelUnlocked } from '../store/progressStore';
import { loadContent } from '../engine/content/ContentLoader';
import { buttonStyle, linkStyle, screenStyle, titleStyle } from './menuStyles';
import type { LiquidId } from '../types';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';
const DEV = import.meta.env.DEV;

export function LevelSelect() {
  const navigate = useSessionStore((s) => s.navigate);
  const startLevel = useSessionStore((s) => s.startLevel);
  const playerStartLiquid = useSessionStore((s) => s.playerStartLiquid);
  const setPlayerStartLiquid = useSessionStore((s) => s.setPlayerStartLiquid);
  const completedLevels = useProgressStore((s) => s.completedLevels);

  const content = useMemo(() => loadContent(), []);
  const sortedIds = useMemo(
    () => Object.keys(content.levels).map(Number).sort((a, b) => a - b),
    [content.levels],
  );
  const liquidIds = useMemo(
    () => Object.keys(content.liquids).sort(),
    [content.liquids],
  );

  return (
    <div style={screenStyle}>
      <div style={{ ...titleStyle, fontSize: 36, marginBottom: 24 }}>Choose a Level</div>
      {DEV && (
        <div style={pickerRowStyle}>
          <span style={pickerLabelStyle}>Start as</span>
          {liquidIds.map((lid) => {
            const liq = content.liquids[lid as LiquidId]!;
            const selected = (playerStartLiquid ?? null) === lid;
            return (
              <button
                key={lid}
                onClick={() => setPlayerStartLiquid(selected ? null : (lid as LiquidId))}
                style={{
                  ...chipStyle,
                  borderColor: selected ? liq.color : 'rgba(255,255,255,0.15)',
                  background: selected ? `${liq.color}20` : 'rgba(255,255,255,0.04)',
                }}
                title={liq.description}
              >
                <span style={{ ...chipSwatchStyle, background: liq.color }} />
                <span>{liq.name}</span>
              </button>
            );
          })}
          <button
            onClick={() => setPlayerStartLiquid(null)}
            style={{
              ...chipStyle,
              padding: '6px 10px',
              opacity: playerStartLiquid === null ? 0.45 : 1,
              cursor: playerStartLiquid === null ? 'default' : 'pointer',
            }}
            disabled={playerStartLiquid === null}
          >
            Reset
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 720, width: '90%' }}>
        {sortedIds.map((id) => {
          const lv = content.levels[id]!;
          const unlocked = isLevelUnlocked(id, sortedIds, completedLevels);
          const stars = completedLevels[id]?.stars ?? 0;
          return (
            <button
              key={id}
              disabled={!unlocked}
              onClick={() => unlocked && startLevel(id)}
              style={{
                ...buttonStyle,
                minWidth: 0,
                padding: '20px 14px',
                opacity: unlocked ? 1 : 0.35,
                cursor: unlocked ? 'pointer' : 'not-allowed',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 800 }}>{id}</span>
              <span style={{ fontSize: 13, color: '#bbc3cf' }}>{lv.name}</span>
              <span style={{ fontSize: 13, color: '#f5c95b', letterSpacing: '0.1em' }}>
                {[0, 1, 2].map((i) => (i < stars ? STAR_FILLED : STAR_EMPTY)).join('')}
              </span>
              {!unlocked && <span style={{ fontSize: 11, color: '#7a8090' }}>locked</span>}
            </button>
          );
        })}
      </div>
      <button style={linkStyle} onClick={() => navigate('menu')}>← back</button>
    </div>
  );
}

const pickerRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 20,
  alignItems: 'center',
  flexWrap: 'wrap',
  justifyContent: 'center',
  maxWidth: 720,
  width: '90%',
};

const pickerLabelStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#8a92a0',
  marginRight: 4,
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  fontSize: 12,
  color: '#e8e8e8',
  background: 'rgba(255,255,255,0.04)',
  cursor: 'pointer',
};

const chipSwatchStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  borderRadius: 2,
  border: '1px solid rgba(255,255,255,0.18)',
};
