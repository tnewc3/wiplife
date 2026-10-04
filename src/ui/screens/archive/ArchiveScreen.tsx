import { groupArchiveByLine } from '../../../engine/selectors';
import { useAppStore } from '../../../store/appStore';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { lifespanLabel, reputationWords } from '../../labels';

/** Every past life, grouped into family lines, most recent line first. */
export function ArchiveScreen() {
  const listing = useAppStore((s) => s.archive);
  const navigate = useAppStore((s) => s.navigate);
  const open = useAppStore((s) => s.openArchivedLife);
  const lives = listing?.lives ?? [];
  const lines = groupArchiveByLine(lives);

  return (
    <Screen title="Archive" onBack={() => navigate('title')}>
      <div className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <Card className="text-center">
            <p className="font-semibold">No past lives yet.</p>
            <p className="mt-1 text-muted">When a life ends, its obituary is kept here.</p>
          </Card>
        ) : (
          <ul aria-label="Family lines" className="flex flex-col gap-4">
            {lines.map((line) => {
              const latest = line.lives.at(-1)!;
              return (
                <li key={line.lineId} data-testid="family-line-group">
                  <section aria-labelledby={`line-${line.lineId}`} className="flex flex-col gap-2">
                    <div>
                      <h2 id={`line-${line.lineId}`} className="text-lg font-bold break-words [overflow-wrap:anywhere]">
                        The {line.familyName} family
                      </h2>
                      <p className="text-sm text-muted">
                        {line.lives.length === 1 ? '1 life' : `${line.lives.length} lives`} · {reputationWords(latest.familyReputation)}
                      </p>
                    </div>
                    <ol aria-label={`Generations of the ${line.familyName} family`} className="flex flex-col gap-2">
                      {line.lives.map((life) => (
                        <li key={life.id}>
                          <button
                            type="button"
                            onClick={() => open(life.id)}
                            className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-card border border-border bg-surface p-4 text-left active:bg-surface-2"
                          >
                            <span className="text-sm font-semibold text-muted">Generation {life.generation}</span>
                            <span className="w-full font-semibold break-words [overflow-wrap:anywhere]">{life.name}</span>
                            <span className="text-sm text-muted">
                              {lifespanLabel(life.birthYear, life.deathYear)} · Age {life.ageAtDeath}
                            </span>
                            <span className="text-sm text-muted">{life.unfinished ? 'Unfinished' : `Died of ${life.causeOfDeath ?? 'unknown causes'}`}</span>
                            {life.heirName && <span className="text-sm text-muted">Carried on by {life.heirName}</span>}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </section>
                </li>
              );
            })}
          </ul>
        )}
        {listing && listing.damaged > 0 && (
          <p role="status" className="text-sm text-muted">
            {listing.damaged === 1 ? 'One archived life is damaged and can’t be shown.' : `${listing.damaged} archived lives are damaged and can’t be shown.`}
          </p>
        )}
      </div>
    </Screen>
  );
}
