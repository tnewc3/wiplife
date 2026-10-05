/**
 * C1 content-build warnings (docs/expansion.md, C1): wording checks that
 * can't be exact, so they warn for review instead of failing the build.
 *
 *   time   a fixed time gap ("years later", "last year") in a follow-up,
 *          which can arrive sooner or later than the text says; use {since}
 *   money  text or a choice that talks about money without a money effect
 *   past   text that states something about your past ("you used to",
 *          "remember when") without requiring the flag, memory or earlier
 *          event that proves it
 *
 * An event can keep flagged wording by giving the reason in `justified`
 * (one per kind); a justification for a kind that isn't flagged is an error,
 * so stale ones are removed. docs/consistency-review.md lists every flagged
 * event and how it was resolved.
 */
import type { Condition, ContentBundle, EventDef, Outcome } from '../../src/content/schemas';
import type { ContentError } from './compile';

export type WarningKind = 'time' | 'money' | 'past';

export interface ContentWarning extends ContentError {
  eventId: string;
  kind: WarningKind;
}

/** Fixed time gaps a follow-up can't promise. */
const TIME =
  /\b(?:(?:years?|months?|decades?|weeks?) (?:later|ago|on|after|have passed|went by|go by)|(?:a|one|two|three|four|five|six|seven|eight|nine|ten|a few|a couple of|several|many|some) (?:years?|months?|decades?|weeks?) (?:later|ago|on|after|since|have passed|went by)|last (?:year|month|summer|winter|spring|fall|week)|(?:for|in|after|over) (?:two|three|four|five|six|seven|eight|nine|ten|a few|a couple of|several|many) (?:years|months|decades)|this time last year|all these years|after all this time|it'?s been (?:\w+ )?(?:years|months|a year|a decade|a while))\b/i;

/** Money talk, including buying and spending. ("Fine", "check" and "tip" mean too many other things to flag; spending time, or spending "it", "the afternoon" and so on, isn't money.) */
export const MONEY =
  /(?:\$\d|\bdollars?\b|\bbucks\b|\bcash\b|\bmoney\b|\bpaid\b|\bpays?\b(?! attention)|\bpaying\b(?! attention)|\blend\b|\blent\b|\bloan\b|\bborrow\w*|\brent\b|\bprice\b|\bcosts?\b|\brefund\b|\bsalary\b|\bwages?\b|\bfees?\b|\bbills?\b|\bdebts?\b|\bowes?\b|\bowed\b|\bbuy(?:s|ing)?\b|\bbought\b|\bspend(?:s|ing)?\b(?!\s+(?:it|them|the|a|an|this|that|these|those|all|every|most|time)\b)(?!(?:\s+\S+){0,3}?\s+(?:time|hours?|days?|weeks?|months?|years?|nights?|evenings?|weekends?|summers?|mornings?|afternoons?|(?:mon|tues|wednes|thurs|fri|satur|sun)days?)\b)|\bspent\b(?!\s+(?:it|them|the|a|an|this|that|these|those|all|every|most|time)\b)(?!(?:\s+\S+){0,3}?\s+(?:time|hours?|days?|weeks?|months?|years?|nights?|evenings?|weekends?|summers?|mornings?|afternoons?|(?:mon|tues|wednes|thurs|fri|satur|sun)days?)\b)|\bfortune\b|\bbabysit\w*|\bfor a price\b)/i;

/** Statements about your past. */
const PAST =
  /\b(?:you used to|you once|back when you|(?<!(?:can't|cannot|don't|not) )remember when|ever since you|(?<!by )the time you|you always (?:said|did|used|wanted|loved|hated)|when you were (?:a kid|little|young|small|a child|a teenager|in high school|in college)|as a (?:kid|child|teenager), you|you(?:'ve| have) always|you(?:'ve| have) never (?:been|had|missed|done|once|lost|failed)|you still remember|all those years)\b/i;

/** Effects that change your money now or from now on. */
function changesMoney(outcome: Outcome | undefined): boolean {
  return (outcome?.effects ?? []).some(
    (e) =>
      e.type === 'money' ||
      e.type === 'repay' ||
      e.type === 'rentMonths' ||
      e.type === 'cost' ||
      e.type === 'debt' ||
      e.type === 'housing' ||
      e.type === 'legal' ||
      // E5: damage, theft and a vet visit are paid (or paid out).
      (e.type === 'possession' && (e.action === 'vehicle_damage' || e.action === 'vehicle_stolen' || e.action === 'vehicle_sell' || e.action === 'home_damage' || e.action === 'pet_vet')) ||
      // M1: a first visit for care and a one-time medical cost are paid, and so is a crisis.
      (e.type === 'mental' && (e.action === 'pay' || (e.action === 'start' && e.care !== 'support'))) ||
      (e.type === 'job' && e.action !== 'performance') ||
      (e.type === 'education' && e.action === 'scholarship'),
  );
}

/** True when the condition requires (not just allows) a flag, memory or earlier event. */
function requiresEvidence(condition: Condition | undefined): boolean {
  if (!condition) return false;
  if ('all' in condition) return condition.all.some(requiresEvidence);
  if ('any' in condition) return condition.any.length > 0 && condition.any.every(requiresEvidence);
  if ('not' in condition) return false;
  return 'flag' in condition || 'memory' in condition || 'fired' in condition;
}

function outcomesOf(def: EventDef): { where: string; outcome: Outcome; label?: string; visibleIf?: Condition }[] {
  if (def.autoOutcome) return [{ where: 'autoOutcome', outcome: def.autoOutcome }];
  return (def.choices ?? []).flatMap((c) => {
    const base = { label: c.label, ...(c.visibleIf ? { visibleIf: c.visibleIf } : {}) };
    if (c.outcome) return [{ where: `choices.${c.id}`, outcome: c.outcome, ...base }];
    return [
      { where: `choices.${c.id}.check.success`, outcome: c.check!.success, ...base },
      { where: `choices.${c.id}.check.failure`, outcome: c.check!.failure, ...base },
    ];
  });
}

function textsOf(outcome: Outcome): string[] {
  return [outcome.text ?? '', ...outcome.effects.flatMap((e) => (e.type === 'history' ? [e.text] : []))];
}

/** Every C1 warning for the content, and errors for justifications nothing needs. */
export function consistencyWarnings(
  bundle: ContentBundle,
  fileOf: (id: string) => string,
): { warnings: ContentWarning[]; errors: ContentError[] } {
  const warnings: ContentWarning[] = [];
  const errors: ContentError[] = [];
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const file = fileOf(id);
    const found = new Map<WarningKind, string[]>();
    const flag = (kind: WarningKind, message: string) => found.set(kind, [...(found.get(kind) ?? []), message]);
    const outcomes = outcomesOf(def);
    const quote = (text: string, re: RegExp) => `"${text.match(re)![0]}"`;

    // Time: follow-ups only.
    if (def.followUpOnly) {
      for (const [where, text] of [['title', def.title], ['text', def.text], ...outcomes.flatMap((o) => textsOf(o.outcome).map((t) => [o.where, t]))] as [string, string][]) {
        if (TIME.test(text)) flag('time', `${where}: fixed time phrase ${quote(text, TIME)} in a follow-up; use {since} or drop it`);
      }
    }

    // Money: each outcome whose label or text talks money must change money; the event text needs some outcome that does.
    for (const o of outcomes) {
      const said = [o.label ?? '', ...textsOf(o.outcome)].find((t) => MONEY.test(t));
      if (said !== undefined && !changesMoney(o.outcome)) flag('money', `${o.where}: mentions money (${quote(said, MONEY)}) without a money effect`);
    }
    for (const text of [def.title, def.text]) {
      if (MONEY.test(text) && !outcomes.some((o) => changesMoney(o.outcome))) {
        flag('money', `text mentions money (${quote(text, MONEY)}) but no outcome changes money`);
      }
    }

    // Past: the event (or the choice) must require the evidence.
    const eventProof = requiresEvidence(def.requires);
    for (const [where, text, proof] of [
      ['title', def.title, eventProof],
      ['text', def.text, eventProof],
      ...outcomes.flatMap((o) => [o.label ?? '', ...textsOf(o.outcome)].map((t) => [o.where, t, eventProof || requiresEvidence(o.visibleIf)])),
    ] as [string, string, boolean][]) {
      if (PAST.test(text) && !proof) flag('past', `${where}: states something about your past (${quote(text, PAST)}) without requiring a flag, memory or earlier event`);
    }

    for (const [kind, messages] of found) {
      if (def.justified?.[kind]) continue;
      for (const message of messages) warnings.push({ file, eventId: id, kind, message: `${id}: ${message}` });
    }
    // (justified.safety is checked by the mental health safety check, tools/content/mentalSafety.ts.)
    for (const kind of Object.keys(def.justified ?? {}).filter((k) => k !== 'safety') as WarningKind[]) {
      if (!found.has(kind)) errors.push({ file, message: `${id}: justified.${kind} is set, but nothing is flagged for it (remove it)` });
    }
  }
  return { warnings, errors };
}
