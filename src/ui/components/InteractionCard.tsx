import { useEffect, useRef } from 'react';
import { content } from '../../content';
import { getInteractionOutcome } from '../../engine/selectors';
import type { LifeState } from '../../engine/types';
import { useAppStore } from '../../store/appStore';
import { interactionChangeLines, OUTCOME_TIER_LABELS, OUTCOME_TIER_TONE, outcomeDebtLabel, outcomeMoneyLabel } from '../labels';
import { Button } from './Button';

const TONE_ACCENT = {
  light: 'bg-tone-light',
  neutral: 'bg-tone-neutral',
  serious: 'bg-tone-serious',
  dark: 'bg-tone-dark',
} as const;

/**
 * The outcome of an interaction (E1), in the same style as an event card: what
 * happened, how they feel about it in words, any money that changed hands, and
 * for a big moment a choice. It comes from the saved life, so it is still here
 * after a reload, until you close it.
 */
export function InteractionCard({ life }: { life: LifeState }) {
  const busy = useAppStore((s) => s.aging);
  const choose = useAppStore((s) => s.chooseInteractionOption);
  const dismiss = useAppStore((s) => s.dismissInteraction);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const view = getInteractionOutcome(life, content);
  const key = view ? `${view.interactionName}:${view.choice?.chosen ?? 'open'}` : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, [key]);

  if (!view) return null;
  const waiting = view.choice !== undefined && view.choice.chosen === undefined;
  const lines = interactionChangeLines(view.personName, view.changes);

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-scrim" role="dialog" aria-modal="true" aria-labelledby="interaction-title">
      <div className="pt-safe flex h-full w-full max-w-lg flex-col bg-bg animate-[wl-sheet-in_200ms_ease-out]">
        <div className="px-safe min-h-0 flex-1 overflow-y-auto py-4">
          <article className="overflow-hidden rounded-card border border-border bg-surface" data-testid="interaction-card" data-tier={view.tier}>
            <div className={`h-2 ${TONE_ACCENT[OUTCOME_TIER_TONE[view.tier]]}`} aria-hidden="true" />
            <div className="flex flex-col gap-3 p-5">
              <p className="text-sm font-semibold tracking-wide text-muted uppercase">{OUTCOME_TIER_LABELS[view.tier]}</p>
              <h2
                id="interaction-title"
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl leading-tight font-bold break-words outline-none [overflow-wrap:anywhere]"
              >
                {view.interactionName} · {view.personName}
              </h2>
              <p className="leading-relaxed break-words [overflow-wrap:anywhere]" data-testid="interaction-outcome">
                {view.text}
              </p>
              {view.choice && (
                <p className="font-semibold break-words [overflow-wrap:anywhere]" data-testid="interaction-prompt">
                  {view.choice.prompt}
                </p>
              )}
              {view.choice?.result && (
                <p className="border-l-4 border-border pl-3 leading-relaxed break-words [overflow-wrap:anywhere]" data-testid="interaction-result">
                  {view.choice.result}
                </p>
              )}
              {view.notes.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm font-semibold" data-testid="interaction-notes">
                  {view.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              {!waiting && (
                <ul className="flex flex-col gap-1 text-sm text-muted" data-testid="interaction-changes">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  {view.annoyed && <li>{view.personName} seems annoyed with you.</li>}
                </ul>
              )}
              {view.money && (
                <p className="text-sm font-semibold" data-testid="interaction-money">
                  {view.money.change !== 0 && <span className="block">{outcomeMoneyLabel(view.money.change, view.money.balance)}</span>}
                  {view.money.debtChange !== 0 && <span className="block">{outcomeDebtLabel(view.money.debtChange)}</span>}
                </p>
              )}
            </div>
          </article>
        </div>
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {waiting && view.choice ? (
            view.choice.options.map((option) => (
              <Button
                key={option.id}
                size="lg"
                variant="secondary"
                block
                disabled={busy}
                data-testid={`interaction-choice-${option.id}`}
                className="whitespace-normal text-left"
                onClick={() => void choose(option.id)}
              >
                {option.label}
              </Button>
            ))
          ) : (
            <Button size="lg" block disabled={busy} data-testid="interaction-done" onClick={() => void dismiss()}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
