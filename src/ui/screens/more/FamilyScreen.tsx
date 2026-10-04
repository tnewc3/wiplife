import { useState } from 'react';
import { content } from '../../../content';
import { getFamilyView, type FamilyOptionView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { CUSTODY_LABELS, money, oddsWords, PROCESS_BLOCK_LABELS, PROCESS_LABELS, pregnancyLine, waitWords } from '../../labels';

const ACTION = { adoption: 'start_adoption', ivf: 'start_ivf', surrogacy: 'start_surrogacy' } as const;

/** More → Family: where your family stands, and adoption, IVF and surrogacy with their costs and odds in words. */
export function FamilyScreen({ life }: { life: LifeState }) {
  const view = getFamilyView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [confirming, setConfirming] = useState<FamilyOptionView | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="family-status">
        <h2 id="family-status" className="text-2xl leading-tight font-bold">
          Your family
        </h2>
        {view.pregnancy ? (
          <p className="mt-1" data-testid="family-pregnancy">
            {pregnancyLine(view.pregnancy, life.currentYear)}
          </p>
        ) : view.process ? (
          <p className="mt-1" data-testid="family-process">
            {PROCESS_LABELS[view.process.kind].name} is under way.{' '}
            {view.process.yearsLeft <= 1 ? 'An answer is due next year.' : `An answer is due in ${view.process.yearsLeft} years.`}
          </p>
        ) : (
          <p className="mt-1 text-muted">Nothing under way right now.</p>
        )}
        {view.attempts > 0 && <p className="mt-1 text-sm text-muted">You’ve been trying for a baby for {view.attempts === 1 ? 'a year' : `${view.attempts} years`}.</p>}
        {view.children.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-border" aria-label="Your children">
            {view.children.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 font-semibold break-words">{c.name}</span>
                <span className="text-sm text-muted">
                  {c.age <= 0 ? 'Newborn' : `${c.age}`} · {c.stepchild ? 'Stepchild' : CUSTODY_LABELS[c.custody]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">
          To try for a baby, open your partner’s page in People. A natural pregnancy needs a couple where one of you can carry one.
        </p>
      </Card>

      {view.options.map((o) => {
        const label = PROCESS_LABELS[o.kind];
        return (
          <Card key={o.kind} role="region" aria-labelledby={`family-${o.kind}`}>
            <h3 id={`family-${o.kind}`} className="text-lg font-bold">
              {label.name}
            </h3>
            <p className="mt-1 text-muted">{label.blurb}</p>
            <p className="mt-2 text-sm" data-testid={`family-${o.kind}-facts`}>
              Costs about {money(o.cost)} in all · takes {waitWords(o.waitYears)}
              {o.odds !== undefined ? ` · ${oddsWords(o.odds)}` : ''}
            </p>
            {o.blocks.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-muted" aria-label={`Why not ${label.name}`}>
                {o.blocks.map((b) => (
                  <li key={b}>{PROCESS_BLOCK_LABELS[b]}</li>
                ))}
              </ul>
            )}
            <Button block className="mt-3" disabled={busy || !o.available} data-testid={`family-${o.kind}-start`} onClick={() => setConfirming(o)}>
              {label.confirm}
            </Button>
          </Card>
        );
      })}

      <ConfirmSheet
        open={confirming !== null}
        title={confirming ? `${PROCESS_LABELS[confirming.kind].name}?` : ''}
        body={
          confirming
            ? `It costs about ${money(confirming.cost)} in all, and the first part is due now. ${confirming.odds !== undefined ? `It has ${oddsWords(confirming.odds)}. ` : ''}You’ll decide on the next card.`
            : ''
        }
        confirmLabel={confirming ? PROCESS_LABELS[confirming.kind].confirm : ''}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const c = confirming;
          setConfirming(null);
          if (c) void act(ACTION[c.kind]);
        }}
      />
    </div>
  );
}
