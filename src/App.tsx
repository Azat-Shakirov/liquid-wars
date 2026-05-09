// App — top-level router. Picks which screen to render based on the
// session store. The engine only exists when route === 'game'; other
// routes are pure React and don't allocate any PixiJS resources.

import { useSessionStore } from './store/sessionStore';
import { MainMenu } from './ui/MainMenu';
import { LevelSelect } from './ui/LevelSelect';
import { Settings } from './ui/Settings';
import { Credits } from './ui/Credits';
import { QuitScreen } from './ui/QuitScreen';
import { GameView } from './ui/GameView';

export default function App() {
  const route = useSessionStore((s) => s.route);
  const selectedLevelId = useSessionStore((s) => s.selectedLevelId);

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
  }
}
