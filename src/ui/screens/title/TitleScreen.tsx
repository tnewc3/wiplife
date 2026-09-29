import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';

/**
 * Entry point. Continue and Archive join New Life and Settings once lives
 * can be saved (Stage 2) and archived (Stage 3).
 */
export function TitleScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const openSettings = useAppStore((s) => s.openSettings);

  return (
    <Screen centered>
      <div className="flex flex-col items-center gap-12 text-center">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight">WIPlife</h1>
          <p className="mt-3 text-lg text-muted">Every life is a work in progress.</p>
        </div>
        <nav className="flex w-full max-w-xs flex-col gap-3" aria-label="Main menu">
          <Button size="lg" block onClick={() => navigate('newLife')}>
            New Life
          </Button>
          <Button variant="secondary" block onClick={openSettings}>
            Settings
          </Button>
        </nav>
      </div>
    </Screen>
  );
}
