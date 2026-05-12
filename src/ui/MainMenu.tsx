import { useSessionStore } from '../store/sessionStore';
import { buttonStyle, screenStyle, subtitleStyle, titleStyle } from './menuStyles';

const DEV = import.meta.env.DEV;

export function MainMenu() {
  const navigate = useSessionStore((s) => s.navigate);
  return (
    <div style={screenStyle}>
      <div style={titleStyle}>Liquid Node Wars</div>
      <div style={subtitleStyle}>node capture · liquid strategy</div>
      <button style={buttonStyle} onClick={() => navigate('levelSelect')}>Play</button>
      <button style={buttonStyle} onClick={() => navigate('settings')}>Settings</button>
      <button style={buttonStyle} onClick={() => navigate('credits')}>Credits</button>
      {DEV && (
        <button style={buttonStyle} onClick={() => navigate('editor')}>
          Level Editor (dev)
        </button>
      )}
      <button style={buttonStyle} onClick={() => navigate('quit')}>Quit</button>
    </div>
  );
}
