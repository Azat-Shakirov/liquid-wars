import { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useProgressStore } from '../store/progressStore';
import {
  buttonDangerStyle,
  buttonStyle,
  cardStyle,
  linkStyle,
  screenStyle,
  titleStyle,
} from './menuStyles';

export function Settings() {
  const navigate = useSessionStore((s) => s.navigate);
  const settings = useProgressStore((s) => s.settings);
  const setMusicVolume = useProgressStore((s) => s.setMusicVolume);
  const setSfxVolume = useProgressStore((s) => s.setSfxVolume);
  const resetProgress = useProgressStore((s) => s.resetProgress);

  const [confirming, setConfirming] = useState(false);

  return (
    <div style={screenStyle}>
      <div style={{ ...titleStyle, fontSize: 36, marginBottom: 24 }}>Settings</div>
      <div style={cardStyle}>
        <Slider
          label="Music"
          value={settings.musicVolume}
          onChange={setMusicVolume}
        />
        <Slider
          label="SFX"
          value={settings.sfxVolume}
          onChange={setSfxVolume}
        />
        <p style={{ color: '#7a8090', fontSize: 12, marginTop: 8 }}>
          Audio engine wires up in Phase 6. Your preferences are saved.
        </p>
        <hr style={{ border: 'none', borderTop: '1px solid rgba(120, 140, 180, 0.18)', margin: '20px 0' }} />
        {!confirming ? (
          <button style={buttonDangerStyle} onClick={() => setConfirming(true)}>
            Reset progress
          </button>
        ) : (
          <div>
            <p style={{ marginTop: 0 }}>This will erase all level progress and stars.</p>
            <button
              style={buttonDangerStyle}
              onClick={() => {
                resetProgress();
                setConfirming(false);
              }}
            >
              Yes, reset
            </button>
            <button style={{ ...buttonStyle, marginLeft: 8 }} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <button style={linkStyle} onClick={() => navigate('menu')}>← back</button>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function Slider({ label, value, onChange }: SliderProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 14, color: '#bbc3cf' }}>{label}</span>
        <span style={{ fontSize: 12, color: '#7a8090' }}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10) / 100)}
        style={{ width: '100%' }}
      />
    </div>
  );
}
