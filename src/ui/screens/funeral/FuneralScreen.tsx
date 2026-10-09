import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FuneralCards } from '../../components/FuneralCards';
import { Screen } from '../../components/Screen';
import { FUNERAL_LABELS } from '../../labels';

/** Shown first when the character dies (W1): the eulogy and who didn't come. Continue goes on to the obituary and estate. */
export function FuneralScreen() {
  const entry = useAppStore((s) => s.lastDeath);
  const next = useAppStore((s) => s.continueFromFuneral);

  return (
    <Screen
      footer={
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button size="lg" block onClick={next} data-testid="funeral-continue">
            Continue
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">{FUNERAL_LABELS.screen}</p>
        {entry ? (
          <>
            <h1 className="text-center text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]">{entry.name}</h1>
            <FuneralCards life={entry} />
          </>
        ) : (
          <Card>
            <h1 className="text-center text-2xl font-bold">This life has ended.</h1>
          </Card>
        )}
      </div>
    </Screen>
  );
}
