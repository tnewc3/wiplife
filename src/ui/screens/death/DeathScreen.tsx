import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Obituary } from '../../components/Obituary';
import { Screen } from '../../components/Screen';

/** Shown when the character dies. The life is already in the archive. */
export function DeathScreen() {
  const entry = useAppStore((s) => s.lastDeath);
  const navigate = useAppStore((s) => s.navigate);
  const openArchive = useAppStore((s) => s.openArchive);

  return (
    <Screen
      footer={
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button size="lg" block onClick={() => navigate('newLife')}>
            Start a new life
          </Button>
          <Button variant="secondary" block onClick={() => void openArchive()}>
            Open the archive
          </Button>
          <Button variant="ghost" block onClick={() => navigate('title')}>
            Back to title
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm font-semibold tracking-wide text-muted uppercase">In memoriam</p>
        {entry ? (
          <>
            <Obituary life={entry} headingLevel={1} />
            <p className="text-center text-sm text-muted">This life has been saved to your archive.</p>
          </>
        ) : (
          <h1 className="text-center text-2xl font-bold">This life has ended.</h1>
        )}
      </div>
    </Screen>
  );
}
