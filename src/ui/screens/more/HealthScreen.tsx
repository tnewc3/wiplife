import { useState } from 'react';
import { content } from '../../../content';
import { getHealthView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { EmptyState } from '../../components/EmptyState';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { MentalHealthSection } from './MentalHealthSection';
import { CONDITION_KIND_LABELS, money, severityLabel, STAT_LABELS, treatmentLabel } from '../../labels';

type Tab = 'conditions' | 'mind';

/** Health (U3b, on the feature template): a hero with Health and Fitness, tiles for the doctor and the therapist, tabs Conditions and Mind. */
export function HealthScreen({ life }: { life: LifeState }) {
  const view = getHealthView(life, content);
  const openActivity = useAppStore((s) => s.openActivity);
  const [tab, setTab] = useState<Tab>('conditions');
  const stats = life.character.stats;
  return (
    <div className="flex flex-col gap-3">
      <HeroCard lead={undefined} title="Your health" status={view.conditions.length === 0 ? 'Nothing to report' : `${view.conditions.length} ${view.conditions.length === 1 ? 'condition' : 'conditions'}`} testId="health-hero">
        <StatCell label={STAT_LABELS.health} value={`${Math.round(stats.health)}%`} bar={stats.health} />
        <StatCell label={STAT_LABELS.fitness} value={`${Math.round(stats.fitness)}%`} bar={stats.fitness} />
        {view.medicalDebt > 0 && <StatCell label="Medical debt" value={money(view.medicalDebt)} testId="medical-debt" />}
      </HeroCard>
      <ActionTileRow>
        <ActionTile label="Doctor" icon="stethoscope" tone="health" status={view.doctor.block ? 'Seen' : 'Ready'} onClick={() => openActivity('doctor')} testId="health-open-doctor" />
        <ActionTile label="Therapist" icon="brain" tone="mind" status={view.mental.therapist.block ? 'Not now' : 'Ready'} onClick={() => setTab('mind')} testId="health-open-mind" />
      </ActionTileRow>
      <SegmentedTabs sticky tabs={[{ id: 'conditions', label: 'Conditions', testId: 'health-tab-conditions' }, { id: 'mind', label: 'Mind', testId: 'health-tab-mind' }]} value={tab} onChange={setTab} label="Health" />
      {tab === 'conditions' &&
        (view.conditions.length === 0 ? (
          <EmptyState text="Nothing to report. Long may it last." testId="no-conditions" />
        ) : (
          <RowList label="Conditions">
            {view.conditions.map((c) => (
              <ListRow key={c.id} title={c.name} subtitle={`${CONDITION_KIND_LABELS[c.kind]} · ${severityLabel(c.severity)} · ${treatmentLabel(c.treated, c.treatable)}`} value={<MiniBar label={`${c.name}: how bad it is`} value={c.severity} kind="bad" />} />
            ))}
          </RowList>
        ))}
      {tab === 'mind' && <MentalHealthSection mental={view.mental} />}
    </div>
  );
}
