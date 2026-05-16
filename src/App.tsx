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
import { VariantSandbox } from './ui/dev/VariantSandbox';
import { BiomeSandbox } from './ui/dev/BiomeSandbox';
import { UnitSandbox } from './ui/dev/UnitSandbox';

const DEV = import.meta.env.DEV;

export default function App() {
  const route = useSessionStore((s) => s.route);
  const selectedLevelId = useSessionStore((s) => s.selectedLevelId);
  const startLevel = useSessionStore((s) => s.startLevel);
  const navigate = useSessionStore((s) => s.navigate);

  // DEV-only URL bootstrap: ?level=N jumps straight to game view at level N;
  // ?variants jumps to the unit-walk-cycle variant sandbox; ?biomes jumps to
  // the biome-floor preview sandbox. Author tools — production users never
  // hit these.
  useEffect(() => {
    if (!DEV) return;
    const params = new URLSearchParams(window.location.search);
    const rawLevel = params.get('level');
    if (rawLevel !== null) {
      const id = Number(rawLevel);
      if (Number.isInteger(id) && id >= 0) {
        startLevel(id);
        return;
      }
    }
    if (params.has('variants')) {
      navigate('variantSandbox');
    } else if (params.has('biomes')) {
      navigate('biomeSandbox');
    } else if (params.has('units')) {
      navigate('unitSandbox');
    }
  }, [startLevel, navigate]);

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
    case 'variantSandbox':
      if (!DEV) return <MainMenu />;
      return <VariantSandbox />;
    case 'biomeSandbox':
      if (!DEV) return <MainMenu />;
      return <BiomeSandbox />;
    case 'unitSandbox':
      if (!DEV) return <MainMenu />;
      return <UnitSandbox />;
  }
}
