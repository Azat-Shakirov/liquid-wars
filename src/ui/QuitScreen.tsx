import { useSessionStore } from '../store/sessionStore';
import { buttonStyle, screenStyle, titleStyle } from './menuStyles';

export function QuitScreen() {
  const navigate = useSessionStore((s) => s.navigate);
  return (
    <div style={screenStyle}>
      <div style={{ ...titleStyle, fontSize: 36, marginBottom: 16 }}>Thanks for playing.</div>
      <p style={{ color: '#7a8090', marginBottom: 36 }}>You can close this tab, or head back to the menu.</p>
      <button style={buttonStyle} onClick={() => navigate('menu')}>Main menu</button>
    </div>
  );
}
