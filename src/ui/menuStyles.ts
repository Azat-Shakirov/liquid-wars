// Shared menu styles — keeps the screens visually consistent without
// pulling in a CSS framework.

import type { CSSProperties } from 'react';

export const screenStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(circle at 50% 35%, #14141c 0%, #06060a 70%)',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  zIndex: 100,
};

export const titleStyle: CSSProperties = {
  fontSize: 48,
  fontWeight: 800,
  marginBottom: 12,
  letterSpacing: '0.02em',
  background: 'linear-gradient(180deg, #ffffff 0%, #6dd0ff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

export const subtitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#9aa0aa',
  marginBottom: 36,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

export const buttonStyle: CSSProperties = {
  minWidth: 220,
  padding: '12px 18px',
  margin: '6px 0',
  fontSize: 16,
  fontWeight: 600,
  fontFamily: 'inherit',
  color: '#eee',
  background: 'rgba(40, 44, 56, 0.85)',
  border: '1px solid rgba(120, 140, 180, 0.35)',
  borderRadius: 6,
  cursor: 'pointer',
  letterSpacing: '0.02em',
};

export const buttonDangerStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(70, 28, 32, 0.85)',
  border: '1px solid rgba(220, 100, 100, 0.45)',
};

export const linkStyle: CSSProperties = {
  marginTop: 32,
  fontSize: 13,
  color: '#7a8090',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '0.05em',
};

export const cardStyle: CSSProperties = {
  background: 'rgba(28, 30, 38, 0.88)',
  border: '1px solid rgba(120, 140, 180, 0.18)',
  borderRadius: 10,
  padding: 24,
  minWidth: 360,
  maxWidth: 520,
};
