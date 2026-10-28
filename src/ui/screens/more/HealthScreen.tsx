import { content } from '../../../content';
import { getHealthView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { StatBar } from '../../components/StatBar';
import { MentalHealthSection } from './MentalHealthSection';
import { CONDITION_KIND_LABELS, money, severityLabel, STAT_LABELS, treatmentLabel } from '../../labels';

/** More → Health: how you're doing and your conditions. Seeing a doctor moved to Activities → Doctor (A1). */
export function HealthScreen({ life }: { life: LifeState }) {
  const view = getHealthView(life, content);
  const openActivity = useAppStore((s) => s.openActivity);

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="health-title">
        <h2 id="health-title" className="text-2xl leading-tight font-bold">
          Your health
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <StatBar label={STAT_LABELS.health} value={life.character.stats.health} />
          <StatBar label={STAT_LABELS.fitness} value={life.character.stats.fitness} />
        </div>
        {view.medicalDebt > 0 && (
          <p className="mt-3 text-sm text-muted" data-testid="medical-debt">
            Medical debt: {money(view.medicalDebt)}
          </p>
        )}
      </Card>

      <Card role="region" aria-labelledby="conditions-title">
        <h2 id="conditions-title" className="text-lg font-bold">
          Conditions
        </h2>
        {view.conditions.length === 0 ? (
          <p className="mt-1 text-muted" data-testid="no-conditions">
            Nothing to report. Long may it last.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Conditions">
            {view.conditions.map((c) => (
              <li key={c.id} className="flex min-w-0 flex-col gap-1 py-3">
                <span className="font-semibold break-words">{c.name}</span>
                <span className="text-sm text-muted">
                  {CONDITION_KIND_LABELS[c.kind]} · {severityLabel(c.severity)} · {treatmentLabel(c.treated, c.treatable)}
                </span>
                <StatBar label={`${c.name}: how bad it is`} value={c.severity} kind="bad" />
                <span className="text-sm break-words text-muted">{c.blurb}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MentalHealthSection mental={view.mental} />

      <Card role="region" aria-labelledby="doctor-title">
        <h2 id="doctor-title" className="text-lg font-bold">
          See a doctor
        </h2>
        <p className="mt-1 text-muted">Doctor visits are under Activities.</p>
        <Button block variant="secondary" className="mt-3" data-testid="health-open-doctor" onClick={() => openActivity('doctor')}>
          Go to Activities → Doctor
        </Button>
      </Card>
    </div>
  );
}
