import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { Button } from './ui/components/Button';
import { Screen } from './ui/components/Screen';
import { UpdatePrompt } from './ui/components/UpdatePrompt';
import { AgeGateScreen } from './ui/screens/ageGate/AgeGateScreen';
import { NewLifeScreen } from './ui/screens/newLife/NewLifeScreen';
import { SettingsScreen } from './ui/screens/settings/SettingsScreen';
import { ShellScreen } from './ui/screens/shell/ShellScreen';
import { TitleScreen } from './ui/screens/title/TitleScreen';
import { useApplyTheme } from './ui/theme/useApplyTheme';

function CurrentScreen() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const ageConfirmed = useAppStore((s) => s.settings.ageConfirmed);
  const screen = useAppStore((s) => s.screen);

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
    case 'shell':
      return <ShellScreen />;
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
