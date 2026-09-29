import { useCallback, useState } from 'react';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ReplaceLifeSheet } from '../../components/ReplaceLifeSheet';
import { Screen } from '../../components/Screen';

/** Choose how to start: one-tap random, or build someone in Custom. */
export function NewLifeScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const startRandomLife = useAppStore((s) => s.startRandomLife);
  const creating = useAppStore((s) => s.creating);
  const hasLife = useAppStore((s) => s.life !== null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRandom = async () => {
    setError(null);
    try {
      await startRandomLife();
    } catch {
      setError('Something went wrong starting your life. Please try again.');
      setConfirming(false);
    }
  };

  const cancel = useCallback(() => setConfirming(false), []);

  return (
    <Screen title="New Life" onBack={() => navigate('title')}>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-bold">Random life</h2>
            <p className="text-muted">Be born somewhere, to someone. Find out who you are as you go.</p>
          </div>
          <Button size="lg" block disabled={creating} onClick={() => (hasLife ? setConfirming(true) : void startRandom())}>
            Start a random life
          </Button>
        </Card>
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-bold">Custom life</h2>
            <p className="text-muted">Choose your name, identity, family, city, stats and personality.</p>
          </div>
          <Button variant="secondary" block onClick={() => navigate('custom')}>
            Create a custom life
          </Button>
        </Card>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <ReplaceLifeSheet open={confirming} onCancel={cancel} onConfirm={() => void startRandom()} busy={creating} />
    </Screen>
  );
}
