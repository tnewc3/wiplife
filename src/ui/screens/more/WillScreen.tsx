import { useMemo, useState } from 'react';
import { content } from '../../../content';
import { getWillView, type WillRowView } from '../../../engine/selectors';
import type { LifeState, WillShare } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ESTATE_RELATION_LABELS } from '../../labels';

/** How much one tap of + or − moves a share. */
const STEP = 5;

const keyOf = (row: Pick<WillRowView, 'kind' | 'id'>) => `${row.kind}:${row.id}`;

/**
 * More → Write a will: split your estate by percentage between your spouse,
 * your children, other people you know, or a cause. The shares must add up to
 * 100. Without a will, the estate goes to your spouse and children by default.
 * You can change it, or clear it, at any time between years.
 */
export function WillScreen({ life }: { life: LifeState }) {
  const view = getWillView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [percents, setPercents] = useState<Record<string, number>>(() => Object.fromEntries(view.rows.filter((r) => r.percent > 0).map((r) => [keyOf(r), r.percent])));
  const [message, setMessage] = useState<string | null>(null);

  const total = useMemo(() => Object.values(percents).reduce((n, p) => n + p, 0), [percents]);
  const chosen = Object.values(percents).filter((p) => p > 0).length;
  const valid = total === 100 && chosen >= 1 && chosen <= view.maxShares;

  const change = (row: WillRowView, delta: number) => {
    setMessage(null);
    setPercents((current) => {
      const next = { ...current };
      const key = keyOf(row);
      const now = next[key] ?? 0;
      const target = Math.max(0, Math.min(100, now + delta));
      const sum = Object.values(next).reduce((n, p) => n + p, 0);
      let over = sum - now + target - 100;
      next[key] = target;
      // Past 100: take the extra from the largest other share.
      while (over > 0) {
        const donor = Object.entries(next)
          .filter(([k, p]) => k !== key && p > 0)
          .sort((a, b) => b[1] - a[1])[0];
        if (!donor) {
          next[key] = target - over;
          break;
        }
        const take = Math.min(over, donor[1]);
        next[donor[0]] = donor[1] - take;
        over -= take;
      }
      for (const [k, p] of Object.entries(next)) if (p <= 0) delete next[k];
      return next;
    });
  };

  const splitEvenly = () => {
    const keys = Object.keys(percents).filter((k) => (percents[k] ?? 0) > 0);
    if (keys.length === 0) return;
    const each = Math.floor(100 / keys.length);
    setMessage(null);
    setPercents(Object.fromEntries(keys.map((k, i) => [k, each + (i === 0 ? 100 - each * keys.length : 0)])));
  };

  const save = () => {
    const shares: WillShare[] = view.rows
      .filter((r) => (percents[keyOf(r)] ?? 0) > 0)
      .map((r) => ({ kind: r.kind, id: r.id, percent: percents[keyOf(r)]! }));
    void act('write_will', { shares }).then(() => setMessage('Your will is saved.'));
  };

  const clear = () => {
    setPercents({});
    void act('write_will', { shares: [] }).then(() => setMessage('Your will is cleared. The default shares apply again.'));
  };

  if (!view.canWrite) {
    return (
      <Card role="region" aria-labelledby="will-title">
        <h2 id="will-title" className="text-2xl leading-tight font-bold">
          Write a will
        </h2>
        <p className="mt-2 text-muted">You can write a will once you’re an adult, between years.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="will-title">
        <h2 id="will-title" className="text-2xl leading-tight font-bold">
          Write a will
        </h2>
        <p className="mt-1 text-muted">
          Choose who gets what share of your estate when you die. Debts and funeral costs are paid first; a home passes with what is still owed on it. Anything a child under 18 inherits is held in
          trust until they’re 18.
        </p>
        {!view.hasWill && view.defaults.length > 0 && (
          <p className="mt-2 text-sm" data-testid="will-defaults">
            Without a will: {view.defaults.map((d) => `${d.name} (${ESTATE_RELATION_LABELS[d.relation]}) ${d.percent}%`).join(', ')}.
          </p>
        )}
        {!view.hasWill && view.defaults.length === 0 && <p className="mt-2 text-sm text-muted">Without a will, nobody inherits: there is no one in your family to share it.</p>}
      </Card>

      <Card role="region" aria-labelledby="will-shares">
        <h3 id="will-shares" className="text-lg font-bold">
          Shares
        </h3>
        <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Who could inherit">
          {view.rows.map((row) => {
            const percent = percents[keyOf(row)] ?? 0;
            const canAdd = percent > 0 || chosen < view.maxShares;
            return (
              <li key={keyOf(row)} className="flex items-center justify-between gap-3 py-2" data-testid={`will-row-${row.id}`}>
                <span className="min-w-0">
                  <span className="block font-semibold break-words [overflow-wrap:anywhere]">{row.name}</span>
                  <span className="block text-sm text-muted">
                    {ESTATE_RELATION_LABELS[row.relation]}
                    {row.minor ? ' · under 18, held in trust' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="secondary" aria-label={`Less for ${row.name}`} disabled={busy || percent === 0} onClick={() => change(row, -STEP)} className="w-11 px-0">
                    −
                  </Button>
                  <span className="w-12 text-center font-semibold tabular-nums" aria-label={`${row.name}'s share`}>
                    {percent}%
                  </span>
                  <Button variant="secondary" aria-label={`More for ${row.name}`} data-testid={`will-plus-${row.id}`} disabled={busy || !canAdd || percent >= 100} onClick={() => change(row, STEP)} className="w-11 px-0">
                    +
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
        <p className={`mt-3 font-semibold ${valid ? '' : 'text-danger'}`} data-testid="will-total" role="status">
          Total: {total}%{valid ? '' : total === 0 ? ' · choose who gets a share' : total < 100 ? ` · ${100 - total}% still to give out` : ' · more than 100%'}
        </p>
        {chosen > view.maxShares && <p className="text-sm text-danger">A will can name at most {view.maxShares} people or causes.</p>}
        <div className="mt-3 flex flex-col gap-2">
          <Button block disabled={busy || !valid} data-testid="will-save" onClick={save}>
            Save will
          </Button>
          <Button variant="secondary" block disabled={busy || chosen < 2} onClick={splitEvenly}>
            Split evenly between those chosen
          </Button>
          {view.hasWill && (
            <Button variant="ghost" block disabled={busy} onClick={clear} data-testid="will-clear">
              Clear my will
            </Button>
          )}
        </div>
        {message && (
          <p role="status" className="mt-2 text-sm" data-testid="will-message">
            {message}
          </p>
        )}
      </Card>
    </div>
  );
}
