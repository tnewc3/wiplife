import { PageInfo } from '../../components/PageInfo';
import { content } from '../../../content';
import { getRecoveryView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionHeader } from '../../components/SectionHeader';
import { DRUG_LABELS, money } from '../../labels';

/** Recovery (D1): your habits, how long you have been clean, quitting, and relapse. Groups, counseling and rehab are activities. */
export function RecoveryScreen({ life }: { life: LifeState }) {
  const view = getRecoveryView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const openCategory = useAppStore((s) => s.openActivityCategory);
  const closeHome = useAppStore((s) => s.closeHome);
  const last = life.drugs.last;
  const R = DRUG_LABELS.recovery;
  return (
    <div className="flex flex-col gap-3" data-testid="recovery-screen">
      <PageInfo>
        <p>{R.intro}</p>
        <p>{R.notes}</p>
      </PageInfo>
      {last && (last.action === 'quit') && (
        <p role="status" data-testid="recovery-result" className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">
          {DRUG_LABELS.result(last.note, last.amount, `balance ${money(last.balance)}`, money(Math.abs(last.amount)))}
        </p>
      )}
      <section aria-labelledby="habits-title" className="flex flex-col gap-1.5">
        <SectionHeader id="habits-title">{R.status.using}</SectionHeader>
        {view.habits.length === 0 ? <p className="text-muted" data-testid="recovery-none">{R.none}</p> : (
          <RowList label="Habits">
            {view.habits.map((h) => {
              const state = h.recovered ? R.status.recovered : h.quitYear > 0 ? R.status.quitting : h.addicted ? R.status.addicted : R.status.using;
              const parts = [state, h.quitYear > 0 || h.recovered ? R.clean(h.clean) : '', h.relapses > 0 ? R.relapses(h.relapses) : '', h.craving ? R.craving : ''].filter((x) => x);
              return (
                <ListRow
                  key={h.id}
                  title={h.name}
                  subtitle={parts.join(' · ')}
                  value={<MiniBar label={DRUG_LABELS.dependence} value={h.dependence} kind="bad" />}
                  testId={`habit-${h.id}`}
                />
              );
            })}
          </RowList>
        )}
        {view.habits.filter((h) => h.quit === null).map((h) => (
          <Button key={h.id} variant="secondary" block disabled={busy || !view.between} onClick={() => void act('quit_drug', { drugId: h.id })} data-testid={`quit-${h.id}`}>
            {R.quit} {h.noun}
          </Button>
        ))}
      </section>
      <Button
        variant="secondary"
        block
        onClick={() => {
          closeHome();
          openCategory('recovery');
        }}
        data-testid="recovery-activities"
      >
        {R.toRecovery}
      </Button>
    </div>
  );
}
