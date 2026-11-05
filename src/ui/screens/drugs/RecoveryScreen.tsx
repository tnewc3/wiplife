import { PageInfo } from '../../components/PageInfo';
import { content } from '../../../content';
import { getRecoveryView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet } from '../../components/ActionSheet';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { EmptyState } from '../../components/EmptyState';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { useState } from 'react';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { DRUG_LABELS, money } from '../../labels';

/** Recovery (D1): your habits, how long you have been clean, quitting, and relapse. Groups, counseling and rehab are activities. */
export function RecoveryScreen({ life }: { life: LifeState }) {
  const view = getRecoveryView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const openCategory = useAppStore((s) => s.openActivityCategory);
  const closeHome = useAppStore((s) => s.closeHome);
  const [menu, setMenu] = useState<string | null>(null);
  const last = life.drugs.last;
  const R = DRUG_LABELS.recovery;
  const habit = view.habits.find((h) => h.id === menu);
  const clean = Math.max(0, ...view.habits.map((h) => h.clean));
  return (
    <div className="flex flex-col gap-3" data-testid="recovery-screen">
      <PageInfo>
        <p>{R.intro}</p>
        <p>{R.notes}</p>
      </PageInfo>
      <HeroCard title="Your recovery" status={view.habits.length === 0 ? R.none : `${view.habits.length} ${view.habits.length === 1 ? 'habit' : 'habits'}`}>
        <StatCell label="Years clean" value={clean} />
      </HeroCard>
      <ActionTileRow>
        <ActionTile
          label="Support"
          icon="hugging_face"
          tone="health"
          status="Groups, rehab"
          onClick={() => {
            closeHome();
            openCategory('recovery');
          }}
          testId="recovery-activities"
        />
      </ActionTileRow>
      {last && last.action === 'quit' && (
        <p role="status" data-testid="recovery-result" className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">
          {DRUG_LABELS.result(last.note, last.amount, `balance ${money(last.balance)}`, money(Math.abs(last.amount)))}
        </p>
      )}
      {view.habits.length === 0 ? (
        <EmptyState text={R.none} testId="recovery-none" />
      ) : (
        <RowList label="Habits">
          {view.habits.map((h) => {
            const state = h.recovered ? R.status.recovered : h.quitYear > 0 ? R.status.quitting : h.addicted ? R.status.addicted : R.status.using;
            const parts = [state, h.quitYear > 0 || h.recovered ? R.clean(h.clean) : '', h.relapses > 0 ? R.relapses(h.relapses) : '', h.craving ? R.craving : ''].filter((x) => x);
            return <ListRow key={h.id} title={h.name} subtitle={parts.join(' · ')} value={<MiniBar label={DRUG_LABELS.dependence} value={h.dependence} kind="bad" />} ending={h.quit === null ? 'dots' : 'none'} onMore={() => setMenu(h.id)} moreTestId={`habit-more-${h.id}`} testId={`habit-${h.id}`} />;
          })}
        </RowList>
      )}
      <ActionSheet open={habit !== undefined} title={habit?.name ?? ''} onClose={() => setMenu(null)} actions={habit ? [{ id: 'quit', label: `${R.quit} ${habit.noun}`, disabled: busy || !view.between, testId: `quit-${habit.id}`, onSelect: () => void act('quit_drug', { drugId: habit.id }) }] : []} />
    </div>
  );
}
