import { content } from '../../../content';
import { getTimeline, getYearRecap } from '../../../engine/selectors';
import type { HistoryEntry, LifeState } from '../../../engine/types';
import { LOG_LABELS, outcomeMoneyLabel, recapMoneyLine, timelineAgeLabel } from '../../labels';
import { useTeamText } from '../../useTeamNames';

/** A money line: green for money gained, red for money lost, with the balance after it. */
export function MoneyLine({ change, children, testId }: { change: number; children: string; testId?: string }) {
  return (
    <p className={`text-sm font-bold tabular-nums ${change < 0 ? 'text-negative' : 'text-positive'}`} data-testid={testId} data-sign={change < 0 ? 'loss' : 'gain'}>
      {children}
    </p>
  );
}

function Entry({ entry, text }: { entry: HistoryEntry; text: string }) {
  return (
    <li className="flex flex-col gap-0.5">
      <p className={`leading-snug break-words [overflow-wrap:anywhere] ${entry.importance === 3 ? 'font-extrabold' : ''}`}>{text}</p>
      {entry.money && entry.money.change !== 0 && <MoneyLine change={entry.money.change}>{outcomeMoneyLabel(entry.money.change, entry.money.balance)}</MoneyLine>}
    </li>
  );
}

/**
 * The life log (U1): your whole life, grouped by age, the newest at the bottom (Home scrolls to the end whenever it
 * grows). Money lines are green or red with the amount and the balance after it; important lines are bold. Years off screen are
 * not drawn (content-visibility), so a full 100-year life scrolls smoothly.
 */
export function LifeLog({ life }: { life: LifeState }) {
  const teamText = useTeamText();
  // Every age you have lived shows, so a year with nothing to tell is still a year in the log.
  const told = new Map(getTimeline(life.history).map((g) => [g.year, g]));
  const groups = [];
  for (let year = life.birthYear; year <= life.currentYear; year++) {
    groups.push(told.get(year) ?? { year, age: year - life.birthYear, entries: [] as HistoryEntry[] });
  }
  const recap = getYearRecap(life, content);

  return (
    <section aria-label="Your life" className="flex flex-col gap-3">
      <ol aria-label="Life log" className="flex flex-col gap-4" data-testid="life-log">
        {groups.map((g) => (
          <li key={g.year} className="[contain-intrinsic-size:auto_96px] [content-visibility:auto]">
            <h3 className="font-display mb-1 text-base font-semibold">
              {timelineAgeLabel(g.age)}{' '}
              <span className="ml-1 text-sm font-normal text-muted">{g.year}</span>
            </h3>
            <ul className="flex flex-col gap-2 border-l-2 border-border pl-3">
              {g.entries.map((e, i) => (
                <Entry key={i} entry={e} text={teamText(e.text)} />
              ))}
              {g.age === 0 && g.entries.length === 0 && <li className="text-muted">{LOG_LABELS.start}</li>}
              {g.age > 0 && g.entries.length === 0 && !(recap && recap.money && recap.year === g.year) && <li className="text-muted">{LOG_LABELS.quietYear}</li>}
              {recap && recap.money && recap.year === g.year && (
                <li>
                  <MoneyLine change={recap.money.net} testId="log-year-money">
                    {recapMoneyLine(recap.money)}
                  </MoneyLine>
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
