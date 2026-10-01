import { content } from '../../../content';
import { getCareerHistory } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Card } from '../../components/Card';
import { HistoryTimeline } from '../../components/HistoryTimeline';
import { Screen } from '../../components/Screen';
import { capitalized, JOB_END_LABELS, money } from '../../labels';

/** Every job you've had, newest first (Stage 8). */
function CareerHistory({ life }: { life: LifeState }) {
  const rows = getCareerHistory(life, content);
  if (rows.length === 0) return null;
  return (
    <Card role="region" aria-labelledby="career-title">
      <h2 id="career-title" className="text-xl font-bold">
        Career
      </h2>
      <ol className="mt-1 flex flex-col divide-y divide-border" aria-label="Career history">
        {rows.map((r, i) => (
          <li key={i} className="flex min-w-0 flex-col py-2">
            <span className="font-semibold break-words [overflow-wrap:anywhere]">
              {capitalized(r.title)} · {r.employer}
            </span>
            <span className="text-sm break-words text-muted">
              {r.trackName} · {r.toYear === null ? `${r.fromYear}–now` : `${r.fromYear}–${r.toYear}`} · {money(r.salary)} a year
            </span>
            <span className="text-sm text-muted">{r.endedBy ? JOB_END_LABELS[r.endedBy] : 'Your job now'}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** More → Life history: your career, then the full timeline of the current life. */
export function LifeHistoryScreen({ life }: { life: LifeState }) {
  const close = useAppStore((s) => s.closeLifeHistory);
  return (
    <Screen title="Life history" onBack={close}>
      <div className="flex flex-col gap-4">
        <CareerHistory life={life} />
        <Card>
          <h2 className="mb-3 text-xl font-bold break-words [overflow-wrap:anywhere]">
            {life.character.name.first} {life.character.name.last}
          </h2>
          <HistoryTimeline history={life.history} label="Life history" />
        </Card>
      </div>
    </Screen>
  );
}
