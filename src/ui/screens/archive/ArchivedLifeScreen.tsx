import type { Stats } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Card } from '../../components/Card';
import { HistoryTimeline } from '../../components/HistoryTimeline';
import { Obituary } from '../../components/Obituary';
import { Screen } from '../../components/Screen';
import { StatBar } from '../../components/StatBar';
import { reputationWords, STAT_LABELS } from '../../labels';

/** One past life: obituary, final stats and timeline. */
export function ArchivedLifeScreen() {
  const id = useAppStore((s) => s.archiveSelection);
  const life = useAppStore((s) => s.archive?.lives.find((l) => l.id === id) ?? null);
  const navigate = useAppStore((s) => s.navigate);

  return (
    <Screen title="Past life" onBack={() => navigate('archive')} backLabel="Back to archive">
      {life ? (
        <div className="flex flex-col gap-4">
          <Obituary life={life} />
          <Card data-testid="archived-line">
            <h3 className="text-lg font-bold">The {life.familyName} family</h3>
            <p className="mt-1 text-muted">
              Generation {life.generation} · {reputationWords(life.familyReputation)}
              {life.heirName ? ` · Carried on by ${life.heirName}` : ''}
            </p>
          </Card>
          <Card>
            <h3 className="mb-2 text-lg font-bold">{life.unfinished ? 'Where things stood' : 'At the end'}</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3" aria-label="Final stats" role="group">
              {(Object.keys(STAT_LABELS) as (keyof Stats)[]).map((key) => (
                <StatBar key={key} label={STAT_LABELS[key]} value={life.finalStats[key]} />
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-lg font-bold">Timeline</h3>
            <HistoryTimeline history={life.highlights} label="Timeline" />
          </Card>
        </div>
      ) : (
        <Card className="text-center">
          <p className="text-muted">This life couldn’t be found.</p>
        </Card>
      )}
    </Screen>
  );
}
