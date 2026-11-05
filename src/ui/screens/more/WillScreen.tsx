import { PageInfo } from '../../components/PageInfo';
import { useMemo, useState } from 'react';
import { content } from '../../../content';
import { getWillView, type WillRowView } from '../../../engine/selectors';
import type { LifeState, WillShare } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { ListRow, RowList } from '../../components/ListRow';
import { SectionLabel } from '../../components/SectionLabel';
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
      <div className="flex flex-col gap-3">
        <HeroCard lead={<Icon id="memo" size={44} />} title="Write a will" status="Once you’re an adult, between years." />
      </div>
    );
  }

  const without = !view.hasWill ? (view.defaults.length > 0 ? `Without a will: ${view.defaults.map((d) => `${d.name} (${ESTATE_RELATION_LABELS[d.relation]}) ${d.percent}%`).join(', ')}.` : 'Without a will, nobody inherits.') : 'Your will is written.';
  return (
    <div className="flex flex-col gap-3">
      <PageInfo>
        <p>Choose who gets what share of your estate when you die. Debts and funeral costs are paid first; a home passes with what is still owed on it. Anything a child under 18 inherits is held in trust until they’re 18.</p>
      </PageInfo>
      <HeroCard lead={<Icon id="memo" size={44} />} title="Your estate" status={without} {...(!view.hasWill ? { testId: "will-defaults" } : {})}>
        <StatCell label="Given out" value={`${total}%`} bar={total} />
        <span className="sr-only" data-testid="will-total" role="status">Total: {total}%{valid ? '' : total === 0 ? ' · choose who gets a share' : total < 100 ? ` · ${100 - total}% still to give out` : ' · more than 100%'}</span>
        <StatCell label="People" value={`${chosen} of ${view.maxShares}`} />
      </HeroCard>
      <ActionTileRow>
        <ActionTile label="Save" icon="memo" tone="money" status={valid ? 'Ready' : total < 100 ? `${100 - total}% to give` : 'Over 100%'} disabled={busy || !valid} onClick={save} testId="will-save" />
        <ActionTile label="Split evenly" icon="handshake" tone="people" status="Those chosen" disabled={busy || chosen < 2} onClick={splitEvenly} testId="will-split" />
        {view.hasWill && <ActionTile label="Clear" icon="alarm_clock" tone="crime" status="Back to defaults" disabled={busy} onClick={clear} testId="will-clear" />}
      </ActionTileRow>
      {chosen > view.maxShares && <p className="px-1 text-sm text-danger">A will can name at most {view.maxShares} people or causes.</p>}
      {message && (
        <p role="status" className="px-1 text-sm" data-testid="will-message">
          {message}
        </p>
      )}
      <SectionLabel>Shares</SectionLabel>
      <RowList label="Who could inherit">
        {view.rows.map((row) => {
          const percent = percents[keyOf(row)] ?? 0;
          const canAdd = percent > 0 || chosen < view.maxShares;
          return (
            <ListRow
              key={keyOf(row)}
              title={row.name}
              subtitle={`${ESTATE_RELATION_LABELS[row.relation]}${row.minor ? ' · under 18, held in trust' : ''}`}
              testId={`will-row-${row.id}`}
              value={
                <span className="flex items-center gap-1">
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
              }
            />
          );
        })}
      </RowList>
    </div>
  );
}
