import { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useProgressStore, isLevelUnlocked } from '../store/progressStore';
import { loadContent } from '../engine/content/ContentLoader';
import { buttonStyle, linkStyle, screenStyle, titleStyle } from './menuStyles';
import type { FactionId } from '../types';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export function LevelSelect() {
  const navigate = useSessionStore((s) => s.navigate);
  const startLevel = useSessionStore((s) => s.startLevel);
  const playerStartFaction = useSessionStore((s) => s.playerStartFaction);
  const setPlayerStartFaction = useSessionStore((s) => s.setPlayerStartFaction);
  const completedLevels = useProgressStore((s) => s.completedLevels);

  const content = useMemo(() => loadContent(), []);
  // Level 0 is the dev sandbox — hide it from the regular grid; reachable
  // only via the DEV-only Sandbox button below.
  const sortedIds = useMemo(
    () =>
      Object.keys(content.levels)
        .map(Number)
        .filter((id) => id !== 0)
        .sort((a, b) => a - b),
    [content.levels],
  );
  const hasSandbox = useMemo(
    () => content.levels[0] !== undefined,
    [content.levels],
  );
  const factionIds = useMemo(
    () => Object.keys(content.factions).sort(),
    [content.factions],
  );
  // Only show the challenge-tier picker once at least one level with
  // letPlayerChooseFaction exists in the campaign.
  const hasChallengeLevels = useMemo(
    () => sortedIds.some((id) => content.levels[id]?.letPlayerChooseFaction === true),
    [sortedIds, content.levels],
  );

  return (
    <div style={screenStyle}>
      <div style={{ ...titleStyle, fontSize: 36, marginBottom: 24 }}>Choose a Level</div>
      {hasChallengeLevels && (
        <div style={pickerRowStyle}>
          <span style={pickerLabelStyle}>Faction for challenge levels (L31-40)</span>
          {factionIds.map((fid) => {
            const fac = content.factions[fid as FactionId]!;
            const selected = (playerStartFaction ?? null) === fid;
            return (
              <button
                key={fid}
                onClick={() => setPlayerStartFaction(selected ? null : (fid as FactionId))}
                style={{
                  ...chipStyle,
                  borderColor: selected ? fac.color : 'rgba(255,255,255,0.15)',
                  background: selected ? `${fac.color}20` : 'rgba(255,255,255,0.04)',
                }}
                title={fac.description}
              >
                <span style={{ ...chipSwatchStyle, background: fac.color }} />
                <span>{fac.name}</span>
              </button>
            );
          })}
          <button
            onClick={() => setPlayerStartFaction(null)}
            style={{
              ...chipStyle,
              padding: '6px 10px',
              opacity: playerStartFaction === null ? 0.45 : 1,
              cursor: playerStartFaction === null ? 'default' : 'pointer',
            }}
            disabled={playerStartFaction === null}
          >
            Reset
          </button>
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        maxWidth: 900,
        width: '90%',
        maxHeight: '70vh',
        overflowY: 'auto',
        padding: '4px 8px',
      }}>
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
      {import.meta.env.DEV && hasSandbox && (
        <button
          style={{ ...linkStyle, color: '#9be29b', marginTop: 8 }}
          onClick={() => startLevel(0)}
        >
          ⚙ Sandbox (L0) — sprite preview
        </button>
      )}
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
