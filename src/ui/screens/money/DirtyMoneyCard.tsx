import { useState } from 'react';
import { content } from '../../../content';
import { getDirtyView, getLaunderBlock, getSpendBlock, type FrontView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { dirtyBlockLabel, HEAT_WORDS, LAUNDER_RISK_WORDS, money } from '../../labels';

/** A whole number of dollars from what was typed, or NaN. */
function dollars(text: string): number {
  const clean = text.replace(/[,$\s]/g, '');
  return /^\d{1,12}$/.test(clean) ? Number(clean) : Number.NaN;
}

/**
 * E6a: dirty money on the Money tab: what you hold, how to put it through a
 * cash business (for its cut and a risk of being flagged) and what spending
 * it does (it makes you happier, and it gets noticed). Never mixed into
 * savings or net worth.
 */
export function DirtyMoneyCard({ life }: { life: LifeState }) {
  const view = getDirtyView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'launder'; front: FrontView; amount: number } | { kind: 'spend'; amount: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  if (!view.show) return null;

  const amount = dollars(text);
  const block = (frontId: string) => (Number.isNaN(amount) ? 'amount' : getLaunderBlock(life, frontId, amount, content));
  const spendBlocked = Number.isNaN(amount) ? 'amount' : getSpendBlock(life, amount, content);

  const run = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    const before = useAppStore.getState().life;
    if (c.kind === 'launder') await act('launder_money', { frontId: c.front.id, amount: c.amount });
    else await act('spend_dirty', { amount: c.amount });
    const after = useAppStore.getState().life;
    if (!before || !after) return;
    setText('');
    if (c.kind === 'launder') {
      const gained = after.finances.savings - before.finances.savings;
      setResult(gained > 0 ? `It went through: ${money(gained)} reached your savings after the cut.` : `The deposit was flagged. You lost ${money(before.finances.dirty - after.finances.dirty)} and the heat went up.`);
    } else {
      setResult(`You spent ${money(c.amount)}. It was a good time, and people noticed.`);
    }
  };

  return (
    <Card role="region" aria-labelledby="dirty-title" data-testid="dirty-card">
      <h2 id="dirty-title" className="text-lg font-bold">
        Dirty money
      </h2>
      <p className="mt-1 text-2xl font-bold tabular-nums" data-testid="dirty-balance">
        {money(view.balance)}
      </p>
      <p className="mt-1 text-sm text-muted">
        It is not in your savings and it is not counted in your net worth. Spending it freely draws attention. Police attention: <span data-testid="dirty-heat">{HEAT_WORDS[view.heatBand]}</span>.
      </p>
      {view.balance > 0 && (
        <>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-semibold">How much (dollars)</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              data-testid="dirty-amount"
              aria-label="How much dirty money"
              className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3 text-base"
            />
          </label>
          <div className="mt-2 flex gap-2">
            {[0.25, 0.5, 1].map((share) => (
              <Button key={share} variant="secondary" className="flex-1" disabled={busy} onClick={() => setText(String(Math.max(1, Math.floor(view.balance * share))))}>
                {share === 1 ? 'All' : `${share * 100}%`}
              </Button>
            ))}
          </div>
          <h3 className="mt-3 text-sm font-semibold">Put it through a business</h3>
          {view.fronts.length === 0 ? (
            <p className="text-muted">Nobody will take it for you yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border" aria-label="Businesses">
              {view.fronts.map((f) => {
                const reason = block(f.id);
                return (
                  <li key={f.id} className="flex min-w-0 flex-col gap-1 py-3" data-testid={`front-${f.id}`}>
                    <span className="flex justify-between gap-2 font-semibold">
                      <span className="min-w-0 break-words">{f.name}</span>
                      <span className="shrink-0 tabular-nums">{Math.round(f.fee * 100)}% cut</span>
                    </span>
                    <span className="text-sm text-muted">
                      {f.blurb} {LAUNDER_RISK_WORDS[f.riskBand]}. It will still take {money(f.left)} this year.
                    </span>
                    <Button
                      variant="secondary"
                      block
                      disabled={busy || !view.canAct || reason !== null}
                      onClick={() => setConfirm({ kind: 'launder', front: f, amount })}
                      data-testid={`launder-${f.id}`}
                    >
                      Launder through {f.name}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {text.trim() !== '' && Number.isNaN(amount) && <p className="text-sm text-danger">{dirtyBlockLabel('amount')}</p>}
          <Button variant="secondary" block className="mt-3" disabled={busy || !view.canAct || spendBlocked !== null} onClick={() => setConfirm({ kind: 'spend', amount })} data-testid="spend-dirty">
            Spend it on a good time
          </Button>
          <p className="mt-1 text-xs text-muted">The least you can launder is {money(view.minLaunder)}, and the least you can spend is {money(view.minSpend)}.</p>
        </>
      )}
      {result && (
        <p className="mt-3 border-l-4 border-border pl-3" role="status" data-testid="dirty-result">
          {result}
        </p>
      )}
      {view.cleaned > 0 && (
        <p className="mt-2 text-sm text-muted" data-testid="dirty-cleaned">
          So far {money(view.cleaned)} has reached your savings, and {money(view.fees)} has gone in cuts.
        </p>
      )}
      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.kind === 'launder' ? `Put ${money(confirm.amount)} through ${confirm.front.name}?` : `Spend ${money(confirm?.amount ?? 0)}?`}
        body={
          confirm?.kind === 'launder'
            ? `It keeps ${Math.round(confirm.front.fee * 100)}% and the rest goes to your savings. ${LAUNDER_RISK_WORDS[confirm.front.riskBand]}: if it is flagged, part of it is lost and the police take notice.`
            : 'You will enjoy it, and so will everyone who sees you spend it. It raises the heat on you, more for more money.'
        }
        confirmLabel={confirm?.kind === 'launder' ? 'Launder it' : 'Spend it'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run()}
      />
    </Card>
  );
}
