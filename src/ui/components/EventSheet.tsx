import { useEffect, useRef } from 'react';
import { content } from '../../content';
import type { Tone } from '../../content/schemas';
import { getEventCard } from '../../engine/selectors';
import type { LifeState } from '../../engine/types';
import { useAppStore } from '../../store/appStore';
import { ageLabel } from '../labels';
import { Button } from './Button';
import { YearRecapList } from './YearRecapList';

/** Accent stripe color by tone (tokens in src/ui/theme/tokens.css). */
const TONE_ACCENT: Record<Tone, string> = {
  light: 'bg-tone-light',
  neutral: 'bg-tone-neutral',
  serious: 'bg-tone-serious',
  dark: 'bg-tone-dark',
};

/**
 * A full-screen sheet showing the year's events one card at a time: the text
 * and choices, then the outcome on the same card with Continue. After the
 * last event, the year recap is the final card.
 */
export function EventSheet({ life }: { life: LifeState }) {
  const sheet = useAppStore((s) => s.eventSheet);
  const busy = useAppStore((s) => s.aging);
  const choose = useAppStore((s) => s.chooseEvent);
  const next = useAppStore((s) => s.continueEvents);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const card = sheet && !sheet.recap ? getEventCard(life, sheet.index, content) : null;
  const key = sheet ? (sheet.recap ? 'recap' : `${sheet.index}:${card?.resolved ? 'out' : 'in'}`) : null;

  // Move focus to each new card (and to its outcome) for screen readers and keyboards.
  useEffect(() => {
    headingRef.current?.focus();
  }, [key]);

  if (!sheet) return null;

  const accent = card ? TONE_ACCENT[card.tone] : 'bg-accent';
  const title = sheet.recap ? `${sheet.recap.year} · ${ageLabel(sheet.recap.age)}` : (card?.title ?? '');

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-scrim" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <div className="pt-safe flex h-full w-full max-w-lg flex-col bg-bg animate-[wl-sheet-in_200ms_ease-out]">
        <div className="px-safe min-h-0 flex-1 overflow-y-auto py-4">
          <article className="overflow-hidden rounded-card border border-border bg-surface" data-testid="event-card" data-tone={card?.tone}>
            <div className={`h-2 ${accent}`} aria-hidden="true" />
            <div className="flex flex-col gap-3 p-5">
              {sheet.recap && <p className="text-sm font-semibold tracking-wide text-muted uppercase">Your year</p>}
              <h2
                id="event-title"
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl leading-tight font-bold break-words outline-none [overflow-wrap:anywhere]"
              >
                {title}
              </h2>
              {sheet.recap ? (
                <YearRecapList recap={sheet.recap} />
              ) : (
                card && (
                  <>
                    <p className="leading-relaxed break-words [overflow-wrap:anywhere]">{card.text}</p>
                    {card.resolved && card.outcomeText && (
                      <p className="border-l-4 border-border pl-3 leading-relaxed break-words [overflow-wrap:anywhere]" data-testid="event-outcome">
                        {card.outcomeText}
                      </p>
                    )}
                  </>
                )
              )}
            </div>
          </article>
        </div>
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {card && !card.resolved ? (
            card.choices.map((choice) => (
              <Button
                key={choice.id}
                size="lg"
                variant="secondary"
                block
                disabled={busy}
                className="whitespace-normal text-left"
                onClick={() => void choose(card.instanceId, choice.id)}
              >
                {choice.label}
              </Button>
            ))
          ) : (
            <Button size="lg" block disabled={busy} onClick={() => void next()}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
