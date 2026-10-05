import type { YearRecapView } from '../../engine/selectors';
import { NEWS_TITLE, recapMoneyLine, STAT_LABELS, statChangeLabel } from '../labels';

/** What changed in a year: history entries, memories, people met and stat changes. */
export function YearRecapList({ recap }: { recap: YearRecapView }) {
  const empty =
    recap.entries.length === 0 &&
    recap.statChanges.length === 0 &&
    recap.memories.length === 0 &&
    recap.newPeople.length === 0 &&
    recap.news.length === 0 &&
    recap.money === null;
  if (empty) return <p className="mt-1 text-muted">A quiet year.</p>;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {recap.entries.map((e, i) => (
        <li key={`e${i}`} className="break-words [overflow-wrap:anywhere]">
          {e.text}
        </li>
      ))}
      {recap.newPeople.map((p, i) => (
        <li key={`p${i}`} className="break-words [overflow-wrap:anywhere]">
          You met {p.name}.
        </li>
      ))}
      {recap.memories.map((m, i) => (
        <li key={`m${i}`} className="break-words text-muted [overflow-wrap:anywhere]">
          {m.name}: {m.text}
        </li>
      ))}
      {recap.news.length > 0 && (
        <li className="mt-1" data-testid="recap-news">
          <span className="text-sm font-semibold tracking-wide text-muted uppercase">{NEWS_TITLE}</span>
          <ul className="mt-1 flex flex-col gap-1" aria-label={NEWS_TITLE}>
            {recap.news.map((n, i) => (
              <li key={i} className="break-words [overflow-wrap:anywhere]">
                {n.text}
              </li>
            ))}
          </ul>
        </li>
      )}
      {recap.money && (
        <li className="break-words [overflow-wrap:anywhere]" data-testid="recap-money">
          {recapMoneyLine(recap.money)}
        </li>
      )}
      {recap.statChanges.map((c) => (
        <li key={c.stat} className="text-muted">
          {STAT_LABELS[c.stat]} {statChangeLabel(c.change)}.
        </li>
      ))}
    </ul>
  );
}
