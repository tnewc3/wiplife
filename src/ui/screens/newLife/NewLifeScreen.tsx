import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';

/** Placeholder until character creation (Stage 2). */
export function NewLifeScreen() {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <Screen title="New Life" onBack={() => navigate('title')}>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2 text-center">
          <p className="text-sm font-semibold tracking-wide text-accent uppercase">Coming soon</p>
          <h2 className="text-2xl font-bold">Your first life is on its way</h2>
          <p className="text-muted">
            Character creation arrives in the next update. You’ll be able to start a random life in one tap or build
            someone from scratch.
          </p>
        </Card>
        <Button variant="secondary" block onClick={() => navigate('shell')}>
          Preview the game layout
        </Button>
      </div>
    </Screen>
  );
}
