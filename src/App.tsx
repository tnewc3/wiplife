import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { Button } from './ui/components/Button';
import { Screen } from './ui/components/Screen';
import { UpdatePrompt } from './ui/components/UpdatePrompt';
import { AgeGateScreen } from './ui/screens/ageGate/AgeGateScreen';
import { ArchivedLifeScreen } from './ui/screens/archive/ArchivedLifeScreen';
import { ArchiveScreen } from './ui/screens/archive/ArchiveScreen';
import { CustomLifeScreen } from './ui/screens/custom/CustomLifeScreen';
import { DeathScreen } from './ui/screens/death/DeathScreen';
import { GameScreen } from './ui/screens/game/GameScreen';
import { LifeHistoryScreen } from './ui/screens/history/LifeHistoryScreen';
import { NewLifeScreen } from './ui/screens/newLife/NewLifeScreen';
import { SettingsScreen } from './ui/screens/settings/SettingsScreen';
import { TitleScreen } from './ui/screens/title/TitleScreen';
import { useApplyTheme } from './ui/theme/useApplyTheme';

function CurrentScreen() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const ageConfirmed = useAppStore((s) => s.settings.ageConfirmed);
  const screen = useAppStore((s) => s.screen);
  const life = useAppStore((s) => s.life);

  if (status === 'loading') return <div className="h-dvh bg-bg" aria-busy="true" />;
  if (status === 'error') {
    return (
      <Screen centered>
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-2xl font-bold">WIPlife couldn’t start</h1>
          <p className="text-muted">Your browser blocked local storage, which the game needs to save. ({error})</p>
          <Button block onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </Screen>
    );
  }
  if (!ageConfirmed) return <AgeGateScreen />;

  switch (screen) {
    case 'title':
      return <TitleScreen />;
    case 'newLife':
      return <NewLifeScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'custom':
      return <CustomLifeScreen />;
    case 'game':
      return life ? <GameScreen life={life} /> : <TitleScreen />;
    case 'lifeHistory':
      return life ? <LifeHistoryScreen life={life} /> : <TitleScreen />;
    case 'death':
      return <DeathScreen />;
    case 'archive':
      return <ArchiveScreen />;
    case 'archivedLife':
      return <ArchivedLifeScreen />;
  }
}

export function App() {
  const init = useAppStore((s) => s.init);
  const theme = useAppStore((s) => s.settings.theme);
  useApplyTheme(theme);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <>
      <CurrentScreen />
      <UpdatePrompt />
    </>
  );
}
