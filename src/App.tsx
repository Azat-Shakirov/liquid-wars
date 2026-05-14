// App — top-level router. Picks which screen to render based on the
// session store. The engine only exists when route === 'game'; other
// routes are pure React and don't allocate any PixiJS resources.

import { useEffect } from 'react';
import { useSessionStore } from './store/sessionStore';
import { MainMenu } from './ui/MainMenu';
import { LevelSelect } from './ui/LevelSelect';
import { Settings } from './ui/Settings';
import { Credits } from './ui/Credits';
import { QuitScreen } from './ui/QuitScreen';
import { GameView } from './ui/GameView';
import { EditorView } from './ui/editor/EditorView';

const DEV = import.meta.env.DEV;

export default function App() {
  const route = useSessionStore((s) => s.route);
  const selectedLevelId = useSessionStore((s) => s.selectedLevelId);
  const startLevel = useSessionStore((s) => s.startLevel);

  // DEV-only URL bootstrap: ?level=N jumps straight to game view at level N.
  // Used by author + headless screenshot tooling for the sprite sandbox.
  useEffect(() => {
    if (!DEV) return;
    const params = new URLSearchParams(window.location.search);
    const rawLevel = params.get('level');
    if (rawLevel !== null) {
      const id = Number(rawLevel);
      if (Number.isInteger(id) && id >= 0) {
        startLevel(id);
      }
    }
  }, [startLevel]);

  switch (route) {
    case 'menu':
      return <MainMenu />;
    case 'levelSelect':
      return <LevelSelect />;
    case 'settings':
      return <Settings />;
    case 'credits':
      return <Credits />;
    case 'quit':
      return <QuitScreen />;
    case 'game':
      if (selectedLevelId === null) return <MainMenu />;
      return <GameView levelId={selectedLevelId} />;
    case 'editor':
      if (!DEV) return <MainMenu />;
      return <EditorView />;
  }
}
