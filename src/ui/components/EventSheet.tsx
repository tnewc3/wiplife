import { useEffect, useRef, useState } from 'react';
import { content } from '../../content';
import { getEventCard, problemReport } from '../../engine/selectors';
import { SURPRISE_CHOICE } from '../../engine/life';
import type { LifeState } from '../../engine/types';
import { useAppStore } from '../../store/appStore';
import { Shuffle } from 'lucide-react';
import { ageLabel, choiceMoneyLabel, EVENT_CARD_LABELS, familyHelpLabel, housingChangeLabel, outcomeDebtLabel, outcomeDirtyLabel, outcomeMoneyLabel } from '../labels';
import { useTeamText } from '../useTeamNames';
import { CharacterPortrait } from '../portraits/CharacterPortrait';
import { Button } from './Button';
import { Icon } from './Icon';
import { StatBar } from './StatBar';
import { YearRecapList } from './YearRecapList';

/** Development and test builds only (C1): the "Report a problem" button on event cards. */
const REPORTS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === 'true';

/**
 * Development only (C1): copies the event ID, the choice and a short state
 * summary, and shows the same text so it can be copied by hand too.
 */
function ReportProblem({ life, index }: { life: LifeState; index: number }) {
  const [report, setReport] = useState<{ text: string; copied: boolean } | null>(null);
  const copy = async () => {
    const text = problemReport(life, index, content);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // No clipboard (an insecure page, or permission refused): the text below can be copied by hand.
    }
    setReport({ text, copied });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="report-problem">
      <Button variant="ghost" onClick={() => void copy()}>
        Report a problem
      </Button>
      {report && (
        <>
          <p className="text-sm text-muted" role="status">
            {report.copied ? 'Copied to the clipboard.' : 'Copy this report:'}
          </p>
          <pre className="max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]" data-testid="problem-report">
            {report.text}
          </pre>
        </>
      )}
    </div>
  );
}

/** A banner id's color token (src/ui/theme/tokens.css); an unknown banner falls back to the Life color. */
const bannerColor = (id: string) => `var(--wl-cat-${/^[a-z]+$/.test(id) ? id : 'life'}, var(--wl-cat-life))`;

/** One line of an outcome's money, green when you gained and red when you lost. */
function OutcomeLine({ children, change, testId }: { children: string; change: number; testId?: string }) {
  return (
    <span className={`block ${change < 0 ? 'text-negative' : change > 0 ? 'text-positive' : ''}`} data-testid={testId}>
      {children}
    </span>
  );
}

/**
 * A full-screen sheet showing the year's events one card at a time (U1): a card with a border and a banner in its
 * category's color; the icon and title, or for an event about a person their portrait and name; the text; an optional
 * meter; "What will you do?" and the choices stacked full width with the costs known up front; "Surprise me" to let the
 * seeded generator pick; then the outcome on the same card, with money as amounts and your new balance, and Continue.
 * After the last event, the year recap is the final card.
 */
export function EventSheet({ life }: { life: LifeState }) {
  const sheet = useAppStore((s) => s.eventSheet);
  const busy = useAppStore((s) => s.aging);
  const choose = useAppStore((s) => s.chooseEvent);
  const next = useAppStore((s) => s.continueEvents);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const teamText = useTeamText();

  const card = sheet && !sheet.recap ? getEventCard(life, sheet.index, content) : null;
  const key = sheet ? (sheet.recap ? 'recap' : `${sheet.index}:${card?.resolved ? 'out' : 'in'}`) : null;

  // Move focus to each new card (and to its outcome) for screen readers and keyboards.
  useEffect(() => {
    headingRef.current?.focus();
  }, [key]);

  if (!sheet) return null;

  const banner = sheet.recap ? { id: 'life', label: EVENT_CARD_LABELS.yourYear } : card?.banner ?? { id: 'life', label: '' };
  const color = bannerColor(banner.id);
  const title = sheet.recap ? `${sheet.recap.year} · ${ageLabel(sheet.recap.age)}` : teamText(card?.title ?? '');
  const people = card?.portraits;

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-scrim" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <div className="pt-safe flex h-full w-full max-w-lg flex-col animate-[wl-sheet-in_240ms_ease-out]">
        <div className="px-safe flex min-h-0 flex-1 flex-col justify-end overflow-y-auto pt-6 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <article
            className="relative mt-5 rounded-[1.75rem] border-[3px] bg-surface shadow-xl"
            style={{ borderColor: color }}
            data-testid="event-card"
            data-tone={card?.tone}
            data-banner={banner.id}
          >
            {banner.label && (
              <span
                className="font-display absolute -top-3.5 right-5 rounded-full px-3.5 py-1 text-xs font-bold tracking-wide uppercase"
                style={{ backgroundColor: color, color: 'var(--wl-cat-ink)' }}
                data-testid="event-banner"
              >
                {banner.label}
              </span>
            )}
            <div className="flex flex-col gap-4 p-5 pt-6">
              {people ? (
                <div className="flex items-center gap-3" data-testid="event-portraits">
                  <span className="flex -space-x-3">
                    {people.map((p) => (
                      <CharacterPortrait key={p.name} portrait={p.portrait} size={64} label={`Portrait of ${p.name}`} />
                    ))}
                  </span>
                  <span className="min-w-0 text-sm font-semibold break-words text-muted" data-testid="event-people">
                    {people.map((p) => p.name).join(' · ')}
                  </span>
                </div>
              ) : card ? (
                <Icon id={card.icon} size={56} />
              ) : sheet.recap ? (
                <Icon id="calendar" size={56} />
              ) : null}
              <h2 id="event-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl leading-tight font-semibold break-words outline-none [overflow-wrap:anywhere]">
                {title}
              </h2>
              {sheet.recap ? (
                <YearRecapList recap={sheet.recap} />
              ) : (
                card && (
                  <>
                    <p className="text-lg leading-relaxed break-words [overflow-wrap:anywhere]">{teamText(card.text)}</p>
                    {card.meter && (
                      <div data-testid="event-meter">
                        <StatBar label={card.meter.label} value={card.meter.value} kind="plain" />
                      </div>
                    )}
                    {card.resolved && card.outcomeText && (
                      <p className="border-l-4 pl-3 text-lg leading-relaxed break-words [overflow-wrap:anywhere]" style={{ borderColor: color }} data-testid="event-outcome">
                        {teamText(card.outcomeText)}
                      </p>
                    )}
                    {card.resolved && card.money && (
                      <p className="text-base font-bold tabular-nums" data-testid="event-money">
                        {card.money.change !== 0 && <OutcomeLine change={card.money.change}>{outcomeMoneyLabel(card.money.change, card.money.balance)}</OutcomeLine>}
                        {card.money.debtChange !== 0 && <OutcomeLine change={-card.money.debtChange}>{outcomeDebtLabel(card.money.debtChange)}</OutcomeLine>}
                        {card.money.familyHelp !== undefined && <OutcomeLine change={0}>{familyHelpLabel(card.money.familyHelp)}</OutcomeLine>}
                        {card.money.housing && <OutcomeLine change={-card.money.housing.change}>{housingChangeLabel(card.money.housing.change, card.money.housing.annual)}</OutcomeLine>}
                        {card.money.dirty && (
                          <OutcomeLine change={card.money.dirty.change} testId="event-dirty">
                            {outcomeDirtyLabel(card.money.dirty.change, card.money.dirty.balance)}
                          </OutcomeLine>
                        )}
                      </p>
                    )}
                  </>
                )
              )}
              {card && !card.resolved ? (
                <div className="flex flex-col gap-2.5">
                  {card.choices.length > 1 && <p className="font-display text-sm font-semibold tracking-wide text-muted uppercase">{EVENT_CARD_LABELS.whatWillYouDo}</p>}
                  {card.choices.map((choice) => (
                    <Button key={choice.id} size="lg" block disabled={busy} className="!justify-start !py-2 whitespace-normal text-left" onClick={() => void choose(card.instanceId, choice.id)}>
                      <span className="flex w-full flex-col">
                        <span>{teamText(choice.label)}</span>
                        {(choice.money !== undefined || choice.familyHelp !== undefined || choice.rent !== undefined) && (
                          <span className="text-sm font-semibold opacity-80" data-testid="choice-money">
                            {choiceMoneyLabel(choice)}
                          </span>
                        )}
                      </span>
                    </Button>
                  ))}
                  {card.canSurprise && (
                    <Button variant="ghost" disabled={busy} className="self-center" data-testid="surprise-me" onClick={() => void choose(card.instanceId, SURPRISE_CHOICE)}>
                      <Shuffle aria-hidden="true" size={18} />
                      {EVENT_CARD_LABELS.surpriseMe}
                    </Button>
                  )}
                </div>
              ) : (
                <Button size="lg" block disabled={busy} onClick={() => void next()}>
                  Continue
                </Button>
              )}
              {/* After the choices, so the choices stay first. */}
              {REPORTS_ENABLED && card && <ReportProblem key={key} life={life} index={sheet.index} />}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
