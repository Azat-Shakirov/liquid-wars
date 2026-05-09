import { useSessionStore } from '../store/sessionStore';
import { cardStyle, linkStyle, screenStyle, titleStyle } from './menuStyles';

export function Credits() {
  const navigate = useSessionStore((s) => s.navigate);
  return (
    <div style={screenStyle}>
      <div style={{ ...titleStyle, fontSize: 36, marginBottom: 24 }}>Credits</div>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <p style={{ fontSize: 18, marginTop: 0 }}>Liquid Node Wars</p>
        <p style={{ color: '#bbc3cf' }}>by Azat Shakirov</p>
        <p style={{ color: '#7a8090', fontSize: 13, marginBottom: 0 }}>
          Built on PixiJS, React, TypeScript, and Vite.
          <br />
          Thanks for playing.
        </p>
      </div>
      <button style={linkStyle} onClick={() => navigate('menu')}>← back</button>
    </div>
  );
}
