import { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useProgressStore, isLevelUnlocked } from '../store/progressStore';
import { loadContent } from '../engine/content/ContentLoader';
import { buttonStyle, linkStyle, screenStyle, titleStyle } from './menuStyles';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export function LevelSelect() {
  const navigate = useSessionStore((s) => s.navigate);
  const startLevel = useSessionStore((s) => s.startLevel);
  const completedLevels = useProgressStore((s) => s.completedLevels);

  const content = useMemo(() => loadContent(), []);
  const sortedIds = useMemo(
    () => Object.keys(content.levels).map(Number).sort((a, b) => a - b),
    [content.levels],
  );

  return (
    <div style={screenStyle}>
      <div style={{ ...titleStyle, fontSize: 36, marginBottom: 36 }}>Choose a Level</div>
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
