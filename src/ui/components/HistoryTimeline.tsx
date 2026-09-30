import { getTimeline } from '../../engine/selectors';
import type { HistoryEntry } from '../../engine/types';
import { timelineAgeLabel } from '../labels';

/** A life's history grouped by year, oldest first. */
export function HistoryTimeline({ history, label }: { history: readonly HistoryEntry[]; label: string }) {
  const groups = getTimeline(history);
  if (groups.length === 0) return <p className="text-muted">Nothing has happened yet.</p>;
  return (
    <ol aria-label={label} className="flex flex-col gap-4">
      {groups.map((g) => (
        <li key={g.year} className="flex gap-3">
          <div className="w-16 shrink-0 text-sm">
            <p className="font-semibold">{timelineAgeLabel(g.age)}</p>
            <p className="text-muted">{g.year}</p>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col gap-1">
            {g.entries.map((e, i) => (
              <li key={i} className={`break-words [overflow-wrap:anywhere] ${e.importance === 3 ? 'font-semibold' : ''}`}>
                {e.text}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
