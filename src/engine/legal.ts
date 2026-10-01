/**
 * Legal rules (docs/design.md, sections D and E; docs/technical.md, Stage 9):
 * your criminal record, sentencing, fines, probation, prison and release.
 * Effects, the yearly legal step (./systems/legal.ts), actions, pacing,
 * selectors and invariants all use these functions, so each rule lives in
 * one place. Numbers come from src/content/balance/legal.yaml; offenses
 * from src/content/offenses.
 *
 * Prison is a reduced year: no job, no school, no gig work, housing set to
 * incarcerated, only prison events and a few actions. You're released as
 * the year after your last one inside begins.
 */
import type { ContentBundle, LegalTrigger, OffenseDef } from '../content/schemas';
import { endJob, meetsJobRequirements } from './career';
import { eventWeight } from './events/selection';
import { isIndependent, spend } from './finance';
import { leaveSchool } from './education';
import { moveInCost, moveTo, sellHome, supportingParent } from './housing';
import { weightedPick } from './random';
import { nextInt, type RngState } from './rng';
import { writeFromGroup } from './systems/history';
import type { Id, LifeState, RecordOutcome } from './types';

/** In prison now. */
export function isIncarcerated(state: LifeState): boolean {
  return state.housing.kind === 'incarcerated';
}

/** On probation (or parole) this year. */
export function onProbation(state: LifeState): boolean {
  const until = state.legal.probationUntil;
  return until !== undefined && until >= state.currentYear && !isIncarcerated(state);
}

/** Probation or prison on your record within this many years. */
export function seriousRecordWithin(state: LifeState, years: number): boolean {
  return state.legal.record.some((r) => (r.outcome === 'probation' || r.outcome === 'jail') && state.currentYear - r.year <= years);
}

/** An active (not retired) offense, or undefined. */
export function activeOffense(content: ContentBundle, id: Id): OffenseDef | undefined {
  const def = content.offenses[id];
  return def && !def.retired ? def : undefined;
}

/** "one year", "3 years" (text/legal.yaml years). */
export function yearsText(years: number, content: ContentBundle): string {
  const t = content.text.legal.years;
  return years === 1 ? t.one : t.many.replace('{n}', String(years));
}

/**
 * The weights a court decides by: the offense's likely outcomes, times the
 * prior-record multipliers once for each entry already on your record, and
 * the juvenile multipliers before the independence age (no jail for a minor).
 */
export function sentenceWeights(state: LifeState, def: OffenseDef, content: ContentBundle): Record<RecordOutcome, number> {
  const s = content.balance.legal.sentencing;
  const weights = { ...def.outcomes };
  const priors = state.legal.record.length;
  const juvenile = !isIndependent(state, content);
  for (const outcome of Object.keys(weights) as RecordOutcome[]) {
    let w = weights[outcome];
    for (let i = 0; i < priors; i++) w *= s.priorRecord[outcome];
    if (juvenile) w *= s.juvenile[outcome];
    weights[outcome] = w;
  }
  if (juvenile) weights.jail = 0;
  if (!Object.values(weights).some((w) => w > 0)) weights.warning = 1;
  return weights;
}

function rollYears(rng: RngState, range: { min: number; max: number } | undefined, fallback: { min: number; max: number }): number {
  const r = range ?? fallback;
  return nextInt(rng, r.min, r.max);
}

function legalHistory(state: LifeState, key: 'warning' | 'fine' | 'probation' | 'jail' | 'released' | 'probationEnded', values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.history.legal[key], ['legal', key], { values }, content);
}

/**
 * Queues one of the legal system's events (registries/legal.yaml) for
 * `dueYear` (this year or later), picked by weight among those that fit now
 * (requirements, cooldowns, one-time rules), unless one is already queued.
 */
export function queueLegalEvent(state: LifeState, trigger: LegalTrigger, dueYear: number, content: ContentBundle): void {
  const options = content.registries.legal.triggers[trigger].events.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return;
  const def = weightedPick(state.rng, options);
  if (state.scheduled.some((s) => s.eventId === def.id && s.dueYear === dueYear)) return;
  state.scheduled.push({ eventId: def.id, dueYear, cast: {} });
}

/**
 * You go to prison for `years` years (the caller has written the record):
 * your job ends, you leave school (and any place you were to take up), gig
 * work stops, a home you own is sold, a partner living with you stays where
 * you lived, and probation is served inside. You're inside for the rest of
 * this year and `years` full years; the first one begins with a prison event.
 */
export function incarcerate(state: LifeState, years: number, content: ContentBundle): void {
  const year = state.currentYear;
  state.legal.incarceratedUntil = Math.max(state.legal.incarceratedUntil ?? 0, year + years);
  delete state.legal.probationUntil;
  if (state.career.job) endJob(state, 'jailed', content);
  state.career.gig = false;
  if (state.education.current) {
    leaveSchool(state, 'droppedOut', content);
    // Too young to leave school by choice: you leave it anyway.
    if (state.education.current) state.education.current = null;
  }
  state.education.admission = null;
  if (state.housing.kind === 'owned') sellHome(state, content);
  moveTo(state, 'incarcerated', state.character.cityId, content);
  queueLegalEvent(state, 'jailed', year + 1, content);
}

/** What a sentence handed down (for {sentence} in event text). */
export interface Sentence {
  outcome: RecordOutcome;
  amount?: number;
  years?: number;
}

/**
 * An offense's consequences: the court decides (outcome 'sentence') or the
 * event does. The entry goes on your record, with a history entry; a fine is
 * paid (debt for what savings can't cover), probation starts (or grows), and
 * jail sends you to prison. Before the independence age, jail becomes
 * probation. A record that rules out your job costs you the job. Returns what
 * was handed down, or null for an unknown offense.
 */
export function sentence(
  state: LifeState,
  offenseId: Id,
  requested: RecordOutcome | 'sentence',
  years: number | undefined,
  content: ContentBundle,
): Sentence | null {
  const def = activeOffense(content, offenseId);
  if (!def) return null;
  let outcome: RecordOutcome = requested === 'sentence' ? weightedPick(state.rng, Object.entries(sentenceWeights(state, def, content)) as [RecordOutcome, number][]) : requested;
  if (outcome === 'jail' && !isIndependent(state, content)) outcome = 'probation';
  const result: Sentence = { outcome };
  const offense = def.name;
  switch (outcome) {
    case 'warning':
      legalHistory(state, 'warning', { offense }, content);
      break;
    case 'fine': {
      const amount = def.fine ? nextInt(state.rng, def.fine.min, def.fine.max) : 0;
      result.amount = amount;
      spend(state, amount, content);
      legalHistory(state, 'fine', { offense, amount: `$${amount.toLocaleString('en-US')}` }, content);
      break;
    }
    case 'probation': {
      const n = years ?? rollYears(state.rng, def.probationYears, def.jailYears ?? { min: 1, max: 2 });
      result.years = n;
      if (isIncarcerated(state)) {
        // Inside, probation means nothing: it becomes more time.
        state.legal.incarceratedUntil = (state.legal.incarceratedUntil ?? state.currentYear) + 1;
      } else {
        state.legal.probationUntil = Math.max(state.legal.probationUntil ?? 0, state.currentYear + n);
      }
      legalHistory(state, 'probation', { offense, years: yearsText(n, content) }, content);
      break;
    }
    case 'jail': {
      const n = years ?? rollYears(state.rng, def.jailYears, def.probationYears ?? { min: 1, max: 2 });
      result.years = n;
      legalHistory(state, 'jail', { offense, years: yearsText(n, content) }, content);
      if (isIncarcerated(state)) state.legal.incarceratedUntil = (state.legal.incarceratedUntil ?? state.currentYear) + n;
      else incarcerate(state, n, content);
      break;
    }
  }
  state.legal.record.push({ offenseId, year: state.currentYear, outcome, ...(result.amount !== undefined ? { amount: result.amount } : {}), ...(result.years !== undefined ? { years: result.years } : {}) });
  // A record can rule out the job you have (a police officer, a truck driver...).
  const job = state.career.job;
  const jobDef = job && content.jobs[job.jobId];
  if (job && jobDef && !meetsJobRequirements(state, jobDef, content)) endJob(state, 'fired', content);
  return result;
}

/** {sentence} in event text: the latest entry on your record this year, as words (text/legal.yaml); empty without one. */
export function sentenceText(state: LifeState, content: ContentBundle): string {
  const last = state.legal.record.at(-1);
  if (!last || last.year !== state.currentYear) return '';
  const template = content.text.legal.sentence[last.outcome];
  return template
    .replace('{amount}', `$${(last.amount ?? 0).toLocaleString('en-US')}`)
    .replace('{years}', yearsText(last.years ?? 1, content));
}

/**
 * Your sentence is served (as a year begins): you're released to a parent
 * who would take you in, else a rental if your savings cover moving in, else
 * the street. Parole follows (balance release.paroleYears), and a release
 * event is queued for this year.
 */
export function release(state: LifeState, content: ContentBundle): void {
  delete state.legal.incarceratedUntil;
  const city = state.character.cityId;
  const parent = supportingParent(state);
  if (parent) moveTo(state, 'with_parents', parent.cityId, content);
  else if (state.finances.savings >= moveInCost(state, city, content)) {
    spend(state, moveInCost(state, city, content), content);
    moveTo(state, 'renting', city, content);
  } else moveTo(state, 'homeless', city, content);
  const parole = content.balance.legal.release.paroleYears;
  if (parole > 0) state.legal.probationUntil = state.currentYear + parole - 1;
  legalHistory(state, 'released', {}, content);
  queueLegalEvent(state, 'released', state.currentYear, content);
}

/** Probation is over (as a year begins), with a history entry. */
export function endProbation(state: LifeState, content: ContentBundle): void {
  delete state.legal.probationUntil;
  legalHistory(state, 'probationEnded', {}, content);
}
