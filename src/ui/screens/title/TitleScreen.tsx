import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { ageLabel } from '../../labels';

/** Entry point. Archive joins these once lives can end (Stage 3). */
export function TitleScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const openSettings = useAppStore((s) => s.openSettings);
  const continueLife = useAppStore((s) => s.continueLife);
  const life = useAppStore((s) => s.life);
  const savedLifeStatus = useAppStore((s) => s.savedLifeStatus);

  return (
    <Screen centered>
      <div className="flex flex-col items-center gap-10 text-center">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight">WIPlife</h1>
          <p className="mt-3 text-lg text-muted">Every life is a work in progress.</p>
        </div>

        {savedLifeStatus === 'corrupt' && (
          <Card className="w-full max-w-xs text-left text-sm" role="alert">
            <p className="font-semibold">Your saved life couldn’t be loaded.</p>
            <p className="mt-1 text-muted">The save and its backups were damaged. You can start a new life.</p>
          </Card>
        )}

        {savedLifeStatus === 'recovered' && life && (
          <Card className="w-full max-w-xs text-left text-sm" role="status">
            <p className="font-semibold">Your last save was damaged.</p>
            <p className="mt-1 text-muted">We restored an earlier backup, so you may have lost a little progress.</p>
          </Card>
        )}

        <nav className="flex w-full max-w-xs flex-col gap-3" aria-label="Main menu">
          {life && (
            <Button size="lg" block onClick={continueLife} aria-describedby="continue-who">
              Continue
            </Button>
          )}
          {life && (
            <p id="continue-who" className="-mt-1 text-sm break-words text-muted">
              {life.character.name.first} {life.character.name.last} · {ageLabel(life.character.age)}
            </p>
          )}
          <Button size={life ? 'md' : 'lg'} variant={life ? 'secondary' : 'primary'} block onClick={() => navigate('newLife')}>
            New Life
          </Button>
          <Button variant={life ? 'ghost' : 'secondary'} block onClick={openSettings}>
            Settings
          </Button>
        </nav>
      </div>
    </Screen>
  );
}
