/**
 * Trouble in the lives of the people you know (E3): illness and addiction
 * from the existing health conditions (the same onset curves and courses),
 * crime from the existing offenses (the same likely outcomes), recovery and
 * relapse, and the need for care in old age. People have no stats of their
 * own to read, so the balance gives them typical ones; Risk-taking and
 * Discipline set their vice.
 */
import type { ConditionDef, ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { yearsText } from '../legal';
import { clampInt, weightedKey, weightedPick } from '../random';
import { chance, nextInt } from '../rng';
import type { Id, Trouble } from '../types';
import { ask, say, type Ctx, type Subject } from './subject';
import { isJailed, seriousTrouble } from './model';

/** Conditions people can get: illnesses, chronic and mental conditions and addictions (injuries don't change a life), in id order. */
const conditionsCache = new WeakMap<ContentBundle, ConditionDef[]>();
function onsetConditions(content: ContentBundle): ConditionDef[] {
  let list = conditionsCache.get(content);
  if (!list) {
    list = Object.keys(content.conditions)
      .sort()
      .map((id) => content.conditions[id]!)
      .filter((def) => !def.retired && def.onset !== undefined && def.kind !== 'injury');
    conditionsCache.set(content, list);
  }
  return list;
}

type FactorKey = NonNullable<ConditionDef['onset']>['factors'] extends (infer F)[] | undefined ? (F extends { key: infer K } ? K : never) : never;

/** What an onset factor reads for someone you know. */
function factorValue(ctx: Ctx, s: Subject, key: FactorKey): number {
  const b = ctx.bal.trouble;
  switch (key) {
    case 'stress':
    case 'health':
    case 'fitness':
      return b.stats[key];
    case 'smarts':
      return s.person.smarts;
    case 'looks':
      return s.person.looks;
    case 'happiness':
    case 'geneticRisk':
      return 50;
    case 'vice': {
      const risk = s.person.traits.riskTaking ?? 50;
      const discipline = s.person.traits.discipline ?? 50;
      return clampInt(Math.round(b.vice.base + b.vice.riskTaking * (risk - 50) - b.vice.discipline * (discipline - 50)), 0, 100);
    }
    default:
      return s.person.traits[key] ?? 50;
  }
}

function onsetChance(ctx: Ctx, s: Subject, def: ConditionDef): number {
  const onset = def.onset!;
  let p = curveAt(onset.chance, s.age);
  if (p <= 0) return 0;
  for (const f of onset.factors ?? []) p *= curveAt(f.curve, factorValue(ctx, s, f.key));
  return Math.min(1, p * ctx.bal.trouble.illnessScale);
}

const isAddiction = (def: ConditionDef) => def.kind === 'addiction';
const startSeverity = (ctx: Ctx, def: ConditionDef) => nextInt(ctx.state.rng, def.onset?.severity.min ?? 20, def.onset?.severity.max ?? 40);

/** A case is decided the year after the arrest, by the offense's likely outcomes. Returns the trouble if it goes on (probation or prison). */
function progressCrime(ctx: Ctx, s: Subject, t: Trouble): Trouble | null {
  const def = ctx.content.offenses[t.refId];
  if (!def) return null;
  const rng = ctx.state.rng;
  if (t.stage === 'held' || t.stage === 'bailed') {
    if (t.since === ctx.year) return t;
    const weights = { ...def.outcomes };
    const { adultAge } = ctx.content.balance.relationships;
    if (s.age < adultAge) {
      const juvenile = ctx.content.balance.legal.sentencing.juvenile;
      for (const k of Object.keys(weights) as (keyof typeof weights)[]) weights[k] *= juvenile[k];
      weights.jail = 0;
    }
    if (t.stage === 'bailed') weights.jail *= ctx.bal.trouble.crime.bailJail;
    if (!Object.values(weights).some((w) => w > 0)) weights.warning = 1;
    const outcome = weightedKey(rng, weights);
    const offense = def.name;
    if (outcome === 'warning') {
      say(ctx, s, 'warned', { offense });
      return null;
    }
    if (outcome === 'fine') {
      say(ctx, s, 'fined', { offense });
      return null;
    }
    if (outcome === 'probation') {
      const years = nextInt(rng, def.probationYears?.min ?? 1, def.probationYears?.max ?? 1);
      say(ctx, s, 'probation', { offense, years: yearsText(years, ctx.content) });
      return { ...t, stage: 'probation', until: ctx.year + years - 1 };
    }
    const years = nextInt(rng, def.jailYears?.min ?? 1, def.jailYears?.max ?? 1);
    say(ctx, s, 'jailed', { offense, years: yearsText(years, ctx.content) }, 'jailed');
    ask(ctx, s, 'jailed');
    return { ...t, stage: 'jail', until: ctx.year + years - 1 };
  }
  if (t.until !== undefined && ctx.year > t.until) {
    if (t.stage === 'jail') {
      say(ctx, s, 'released', {}, 'released');
      ask(ctx, s, 'released');
    }
    return null;
  }
  return t;
}

/** Illnesses and addictions run their course: treatment, getting better or worse. */
function progressCondition(ctx: Ctx, s: Subject, t: Trouble): Trouble | null {
  const def = ctx.content.conditions[t.refId];
  if (!def) return null;
  if (t.since === ctx.year) return t;
  const rng = ctx.state.rng;
  const next = { ...t };
  if (!next.treated) {
    const base = isAddiction(def) ? ctx.bal.trouble.rehab : def.treatable ? curveAt(ctx.content.balance.health.doctor.treatChance, next.severity) : 0;
    if (chance(rng, Math.min(1, base * ctx.bal.trouble.access[s.wealth]))) {
      next.treated = true;
      if (isAddiction(def)) say(ctx, s, 'got_clean', { condition: def.noun });
    }
  }
  const before = next.severity;
  next.severity = clampInt(Math.round(next.severity + (next.treated ? def.course.treated : def.course.untreated)), 0, 100);
  if (next.severity <= 0) {
    say(ctx, s, 'recovered_health', { condition: def.noun });
    if (isAddiction(def)) {
      s.life.recovered.push({ refId: def.id, year: ctx.year });
      ask(ctx, s, 'recovered');
    }
    return null;
  }
  const bar = ctx.bal.trouble.serious;
  if (!isAddiction(def) && before < bar && next.severity >= bar) {
    say(ctx, s, 'worsened', { condition: def.noun });
    ask(ctx, s, 'illness');
  }
  return next;
}

/** A new offense: arrested, with the case decided next year. */
function newCrime(ctx: Ctx, s: Subject): void {
  const c = ctx.bal.trouble.crime;
  const rng = ctx.state.rng;
  const { adultAge } = ctx.content.balance.relationships;
  const p =
    curveAt(c.rate, s.age) * curveAt(c.riskTaking, s.person.traits.riskTaking ?? 50) * c.wealth[s.wealth] * (s.age < adultAge ? c.juvenile : 1);
  if (!(p > 0) || !chance(rng, p)) return;
  const offenses = Object.keys(ctx.content.offenses)
    .sort()
    .map((id) => ctx.content.offenses[id]!)
    .filter((o) => !o.retired);
  if (offenses.length === 0) return;
  const offense = weightedPick(rng, offenses.map((o) => [o, 1 / (o.severity * o.severity)] as const));
  s.life.troubles.push({ kind: 'crime', refId: offense.id, since: ctx.year, severity: 0, treated: false, stage: 'held' });
  say(ctx, s, 'arrested', { offense: offense.name }, 'arrest');
  ask(ctx, s, 'arrest');
}

/** The trouble step for one person. */
export function troubleStep(ctx: Ctx, s: Subject): void {
  const rng = ctx.state.rng;
  const t = ctx.bal.trouble;
  const life = s.life;

  // Troubles that are already there.
  const kept: Trouble[] = [];
  for (const trouble of life.troubles) {
    const next = trouble.kind === 'crime' ? progressCrime(ctx, s, trouble) : progressCondition(ctx, s, trouble);
    if (next) kept.push(next);
  }
  life.troubles = kept;

  // A new illness or addiction (one at most a year): all the conditions' odds, then one draw.
  if (kept.filter((x) => x.kind !== 'crime').length < t.maxTroubles) {
    const options = onsetConditions(ctx.content)
      .filter((def) => !kept.some((x) => x.refId === def.id))
      .map((def) => [def, onsetChance(ctx, s, def)] as const)
      .filter(([, p]) => p > 0);
    const total = options.reduce((sum, [, p]) => sum + p, 0);
    if (total > 0 && chance(rng, Math.min(1, total))) {
      const def = weightedPick(rng, options);
      const severity = startSeverity(ctx, def);
      life.troubles.push({ kind: isAddiction(def) ? 'addiction' : 'illness', refId: def.id, since: ctx.year, severity, treated: false });
      if (isAddiction(def)) {
        say(ctx, s, 'addiction_started', { condition: def.noun });
      } else {
        say(ctx, s, 'diagnosed', { condition: def.noun }, 'illness');
        if (severity >= t.serious) ask(ctx, s, 'illness');
      }
    }
  }

  // Someone who recovered from an addiction can relapse for a while.
  const recoveredFrom = life.recovered.findIndex((r) => ctx.year - r.year <= t.relapse.years && ctx.year > r.year);
  if (recoveredFrom >= 0 && life.troubles.filter((x) => x.kind !== 'crime').length < t.maxTroubles && chance(rng, t.relapse.chance) && !life.troubles.some((x) => x.refId === life.recovered[recoveredFrom]!.refId)) {
    const refId: Id = life.recovered[recoveredFrom]!.refId;
    const def = ctx.content.conditions[refId];
    life.recovered.splice(recoveredFrom, 1);
    if (def) {
      life.troubles.push({ kind: 'addiction', refId, since: ctx.year, severity: startSeverity(ctx, def), treated: false });
      say(ctx, s, 'relapsed', { condition: def.noun }, 'relapse');
      ask(ctx, s, 'relapse');
    }
  }
  life.recovered = life.recovered.filter((r) => ctx.year - r.year <= t.relapse.years);

  // An addiction that has taken over asks for an intervention.
  if (life.troubles.some((x) => x.kind === 'addiction' && !x.treated && x.severity >= t.intervention)) ask(ctx, s, 'intervention');

  // Arrests.
  if (!life.troubles.some((x) => x.kind === 'crime') && !isJailed(life)) newCrime(ctx, s);

  // Short of money: someone may ask for a loan or a cosigner.
  const bracket = ctx.content.balance.careers.minAge;
  if ((s.wealth === 'poor' || s.wealth === 'working') && s.age >= bracket && s.age < ctx.content.balance.economy.retirement.age && !isJailed(life)) {
    ask(ctx, s, 'moneyTrouble');
  }
}

/** Old age: some people come to need care. Once needed, it stays a request until someone steps in. */
export function careStep(ctx: Ctx, s: Subject): void {
  const care = ctx.bal.care;
  const life = s.life;
  if (life.care === 'needed') {
    ask(ctx, s, 'careNeeded');
    return;
  }
  if (life.care !== undefined || s.age < care.age) return;
  const boost = seriousTrouble(life, ctx.content) ? care.illnessBoost : 1;
  if (!chance(ctx.state.rng, Math.min(1, curveAt(care.needChance, s.age) * boost))) return;
  life.care = 'needed';
  life.careSince = ctx.year;
  say(ctx, s, 'care_needed', {}, 'careNeeded');
  ask(ctx, s, 'careNeeded');
}
