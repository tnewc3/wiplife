/**
 * Sanity checks on a life (docs/technical.md, sections M and Q). Used in
 * development and tests; each later stage adds the checks for its systems.
 */
import type { ContentBundle } from '../content/schemas';
import { ageOf, isCurrentPartner, isFamilyKind, isPartnerKind, isRomanticKind, kindSince } from './relationships';
import { isRngState } from './rng';
import { lifeStageForAge } from './systems/aging';
import type { Identity, LifeState, Pronouns } from './types';

const LIFE_STAGES = new Set(['early', 'child', 'teen', 'youngAdult', 'adult', 'senior']);
const PHASES = new Set(['yearStart', 'events', 'yearEnd', 'dead', 'action']);
const CATEGORIES = new Set(['man', 'woman', 'nonbinary']);

export class InvariantError extends Error {
  override name = 'InvariantError';
  constructor(readonly failures: string[]) {
    super(`Invariant failures:\n- ${failures.join('\n- ')}`);
  }
}

/** Returns every invariant the life breaks (empty when healthy). */
export function checkInvariants(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);

  const score = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
      fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
    }
  };
  const money = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${label} must be a whole-dollar amount (got ${String(value)})`);
  };
  const text = (label: string, value: unknown) => {
    if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must not be empty`);
  };
  const pronouns = (label: string, p: Pronouns) => {
    for (const form of ['subject', 'object', 'possessive', 'possessivePronoun', 'reflexive'] as const) {
      text(`${label}.pronouns.${form}`, p[form]);
    }
    if (typeof p.verbPlural !== 'boolean') fail(`${label}.pronouns.verbPlural must be a boolean`);
  };
  const identity = (label: string, id: Identity) => {
    text(`${label}.genderIdentity`, id.genderIdentity);
    text(`${label}.genderExpression`, id.genderExpression);
    if (!CATEGORIES.has(id.genderCategory)) fail(`${label}.genderCategory is invalid`);
    pronouns(label, id.pronouns);
    if (new Set(id.attractedTo).size !== id.attractedTo.length || id.attractedTo.some((c) => !CATEGORIES.has(c))) {
      fail(`${label}.attractedTo must list distinct gender categories`);
    }
  };
  const city = (label: string, cityId: string) => {
    if (!content.cities[cityId]) fail(`${label} "${cityId}" is not a known city`);
  };

  // Time.
  if (!Number.isInteger(state.birthYear) || !Number.isInteger(state.currentYear)) fail('years must be integers');
  if (state.currentYear < state.birthYear) fail('currentYear is before birthYear');
  if (!PHASES.has(state.phase)) fail(`phase "${state.phase}" is invalid`);
  if (!isRngState(state.rng)) fail('rng state is invalid');

  // Character.
  const c = state.character;
  text('character.name.first', c.name.first);
  text('character.name.last', c.name.last);
  if (c.age !== state.currentYear - state.birthYear) fail(`character.age ${c.age} does not match birth year`);
  if (!LIFE_STAGES.has(c.lifeStage)) fail(`character.lifeStage "${c.lifeStage}" is invalid`);
  else if (c.lifeStage !== lifeStageForAge(c.age, content)) fail(`character.lifeStage "${c.lifeStage}" does not match age ${c.age}`);
  const { maxAge } = content.balance.mortality;
  if (c.age > maxAge) fail(`character.age ${c.age} is past the maximum age ${maxAge}`);
  identity('character.identity', c.identity);
  for (const [key, value] of Object.entries(c.stats)) score(`character.stats.${key}`, value);
  for (const [key, value] of Object.entries(c.personality)) score(`character.personality.${key}`, value);
  for (const key of ['luck', 'reputation', 'geneticRisk', 'vice', 'innerConflict'] as const) {
    score(`character.hidden.${key}`, c.hidden[key]);
  }
  if (c.hidden.talent !== null && !content.talents[c.hidden.talent]) fail(`talent "${c.hidden.talent}" is not known`);
  for (const [key, value] of Object.entries(c.latent.personality ?? {})) score(`character.latent.personality.${key}`, value);
  if (c.latent.identity?.pronouns) pronouns('character.latent.identity', c.latent.identity.pronouns);
  city('character.cityId', c.cityId);
  city('character.birthCityId', c.birthCityId);
  city('housing.cityId', state.housing.cityId);

  // Money.
  const f = state.finances;
  money('finances.savings', f.savings);
  if (f.savings < 0) fail('finances.savings must not be negative');
  const debtIds = new Set<string>();
  const DEBT_KINDS = new Set(['student', 'personal', 'mortgage', 'medical', 'collections']);
  for (const debt of f.debts) {
    const label = `debt ${debt.id}`;
    if (debtIds.has(debt.id)) fail(`${label} appears twice`);
    debtIds.add(debt.id);
    if (!DEBT_KINDS.has(debt.kind)) fail(`${label} has an unknown kind "${debt.kind}"`);
    money(`${label} balance`, debt.balance);
    money(`${label} minPayment`, debt.minPayment);
    if (!(debt.balance > 0)) fail(`${label} is paid off but still listed`);
    if (!(debt.minPayment >= 0)) fail(`${label} has a negative minimum payment`);
    if (!Number.isFinite(debt.annualRate) || debt.annualRate < 0 || debt.annualRate > 1) fail(`${label} has an invalid rate`);
    if (!Number.isInteger(debt.missed) || debt.missed < 0) fail(`${label}.missed must be a whole number of at least 0`);
  }
  if (!Number.isInteger(f.hardshipYears) || f.hardshipYears < 0) fail('finances.hardshipYears must be a whole number of at least 0');
  for (const key of ['bankruptcyYear', 'debtPlanYear'] as const) {
    const year = f[key];
    if (year !== undefined && (!Number.isInteger(year) || year > state.currentYear || year < state.birthYear)) fail(`finances.${key} is outside the life`);
  }
  const independent = c.age >= content.balance.economy.independenceAge;
  if (!independent && f.debts.length > 0) fail('a child has debt');
  if (f.lastLedger) {
    const l = f.lastLedger;
    for (const key of ['gross', 'tax', 'housing', 'living', 'debtPayments', 'interest', 'debtInterest', 'borrowed', 'support'] as const) {
      money(`lastLedger.${key}`, l[key]);
      if (l[key] < 0) fail(`lastLedger.${key} must not be negative`);
    }
    money('lastLedger.net', l.net);
    if (l.net !== l.gross + l.interest - l.tax - l.housing - l.living - l.debtPayments) fail('lastLedger.net does not add up');
    if (l.year > state.currentYear || l.year <= state.birthYear) fail('lastLedger is for a year outside the life');
  }
  if (state.career.gig && c.age < content.balance.economy.gig.minAge) fail('gig work before the minimum age');

  // Housing.
  const h = state.housing;
  money('housing.annualCost', h.annualCost);
  if (h.cityId !== c.cityId) fail('housing.cityId is not the city you live in');
  if (!Number.isInteger(h.since) || h.since < state.birthYear || h.since > state.currentYear) fail('housing.since is outside the life');
  if (!independent && h.kind !== 'with_parents') fail(`a child is housed "${h.kind}"`);
  if (h.roommate !== undefined && (h.roommate !== true || h.kind !== 'renting')) fail('only a rental has a roommate');
  const mortgages = f.debts.filter((d) => d.kind === 'mortgage');
  if (h.kind === 'owned') {
    if (h.homeValue === undefined) fail('an owned home has no value');
    else money('housing.homeValue', h.homeValue);
  } else if (h.homeValue !== undefined || h.mortgageDebtId !== undefined) {
    fail(`a "${h.kind}" home has a value or mortgage`);
  }
  if (h.mortgageDebtId !== undefined && !mortgages.some((d) => d.id === h.mortgageDebtId)) fail('housing.mortgageDebtId is not a mortgage');
  if (mortgages.some((d) => d.id !== h.mortgageDebtId)) fail('a mortgage without a home');

  // People and relationships.
  const { parentAgeAtBirth } = content.balance.creation.family;
  for (const [id, person] of Object.entries(state.people)) {
    const label = `person ${id}`;
    if (person.id !== id) fail(`${label} is stored under the wrong key`);
    text(`${label}.name.first`, person.name.first);
    text(`${label}.name.last`, person.name.last);
    identity(`${label}.identity`, person.identity);
    score(`${label}.looks`, person.looks);
    score(`${label}.smarts`, person.smarts);
    for (const [key, value] of Object.entries(person.traits)) score(`${label}.traits.${key}`, value);
    if (person.birthYear > state.currentYear) fail(`${label} is born in the future`);
    if (person.alive === (person.deathYear !== undefined)) fail(`${label} alive flag and deathYear disagree`);
    if (person.deathYear !== undefined && (person.deathYear < person.birthYear || person.deathYear > state.currentYear)) {
      fail(`${label} has an impossible death year`);
    }
    if (person.alive && state.currentYear - person.birthYear >= maxAge) fail(`${label} is alive at or past the maximum age`);
    city(`${label}.cityId`, person.cityId);
  }

  const parents = [];
  const siblings = [];
  for (const [id, rel] of Object.entries(state.relationships)) {
    const label = `relationship ${id}`;
    if (rel.personId !== id) fail(`${label} is stored under the wrong key`);
    const person = state.people[rel.personId];
    if (!person) {
      fail(`${label} points to a missing person`);
      continue;
    }
    score(`${label}.affection`, rel.affection);
    score(`${label}.trust`, rel.trust);
    if (rel.since > state.currentYear) fail(`${label} starts in the future`);
    if (rel.kindSince !== undefined && (!Number.isInteger(rel.kindSince) || rel.kindSince < rel.since || rel.kindSince > state.currentYear)) {
      fail(`${label}.kindSince is outside the relationship's years`);
    }
    if (rel.lastActionYear !== undefined && (!Number.isInteger(rel.lastActionYear) || rel.lastActionYear > state.currentYear)) {
      fail(`${label}.lastActionYear is in the future`);
    }
    if (rel.wasSpouse !== undefined && rel.wasSpouse !== true) fail(`${label}.wasSpouse is only ever true (or absent)`);
    if (rel.wasSpouse && isFamilyKind(rel.kind)) fail(`${label} is family but was your spouse`);
    if (rel.kind === 'parent') parents.push(person);
    if (rel.kind === 'sibling') siblings.push(person);
  }

  // Family believability: every child was born while each parent was of a
  // plausible age; siblings are distinct from the character in age.
  if (parents.length > 2) fail(`a character has ${parents.length} parents`);
  const childBirthYears = [
    { label: 'character', year: state.birthYear },
    ...siblings.map((s) => ({ label: `sibling ${s.id}`, year: s.birthYear })),
  ];
  for (const parent of parents) {
    for (const child of childBirthYears) {
      const parentAge = child.year - parent.birthYear;
      if (parentAge < parentAgeAtBirth.min || parentAge > parentAgeAtBirth.max) {
        fail(`parent ${parent.id} was ${parentAge} when ${child.label} was born`);
      }
    }
  }
  for (const sibling of siblings) {
    if (sibling.birthYear === state.birthYear) fail(`sibling ${sibling.id} has the same birth year as the character`);
  }

  // Romance: adults only, one partner at a time, and a current partner is
  // alive and in your life.
  const { adultAge } = content.balance.relationships;
  let partners = 0;
  for (const [id, rel] of Object.entries(state.relationships)) {
    const person = state.people[id];
    if (!person || !isRomanticKind(rel.kind)) continue;
    const label = `relationship ${id} (${rel.kind})`;
    if (rel.kindSince === undefined) fail(`${label} has no kindSince`);
    // When it took this kind (for an ex: when the romance ended), both were adults.
    const at = kindSince(rel);
    if (at - state.birthYear < adultAge) fail(`${label}: you were under ${adultAge}`);
    if (at - person.birthYear < adultAge || ageOf(state, person) < adultAge) fail(`${label}: they were under ${adultAge}`);
    if (rel.kind === 'spouse' && rel.wasSpouse !== true) fail(`${label} is a spouse without wasSpouse`);
    if (isPartnerKind(rel.kind) && person.alive) {
      if (rel.status !== 'active') fail(`${label} is a current partner but "${rel.status}"`);
      if (isCurrentPartner(state, rel)) partners++;
    }
  }
  if (partners > 1) fail(`the character has ${partners} current partners (no one is married to two people)`);

  // Logs.
  if (state.inputLog[0]?.kind !== 'create') fail('the input log must start with the create input');
  const ageUps = state.inputLog.filter((r) => r.kind === 'ageUp').length;
  if (ageUps !== c.age) fail(`the input log has ${ageUps} age-ups for age ${c.age}`);
  for (let i = 1; i < state.history.length; i++) {
    if (state.history[i]!.year < state.history[i - 1]!.year) fail('history years must only go forward');
  }
  for (const entry of state.history) {
    if (entry.age !== entry.year - state.birthYear) fail(`history entry for ${entry.year} has age ${entry.age}`);
    if (entry.year > state.currentYear) fail(`history entry for ${entry.year} is in the future`);
  }
  const { maxEntries } = content.balance.aging.history;
  if (state.history.length > maxEntries) fail(`history has ${state.history.length} entries (limit ${maxEntries})`);

  // Year progress.
  if (state.recap) {
    if (state.recap.year !== state.currentYear || state.recap.age !== c.age) fail('the recap is not for the current year');
    const inProgress = state.phase === 'events' || state.phase === 'yearEnd';
    if (inProgress !== (state.recap.statsAfter === null)) fail(`the recap's end stats don't match the "${state.phase}" phase`);
  } else if (c.age > 0) {
    fail('a life that has aged has no recap');
  }
  if (state.phase === 'action') {
    if (state.pending.length === 0) fail('the action phase has no result event');
    if (state.death) fail('a death record in the "action" phase');
  }
  if (state.phase === 'dead' && !state.death) fail('a dead character has no death record');
  if (state.death && state.phase !== 'dead' && state.phase !== 'yearEnd') fail(`a death record in the "${state.phase}" phase`);
  const completedYears = state.phase === 'events' || state.phase === 'yearEnd' ? c.age - 1 : c.age;
  const { happinessTotal, years } = state.lifetime;
  if (years !== Math.max(0, completedYears)) fail(`lifetime.years is ${years}, expected ${completedYears}`);
  if (!Number.isInteger(happinessTotal) || happinessTotal < 0 || happinessTotal > 100 * years) {
    fail('lifetime.happinessTotal is out of range');
  }

  // Events.
  const inYear = state.phase === 'events' || state.phase === 'yearEnd';
  if (!inYear && state.phase !== 'action' && state.pending.length > 0) fail(`pending events in the "${state.phase}" phase`);
  if (state.phase === 'events' && state.pending.every((p) => p.resolvedChoiceId !== undefined)) fail('the events phase has nothing left to resolve');
  if (state.phase === 'yearEnd' && state.pending.some((p) => p.resolvedChoiceId === undefined)) fail('the year ended with events unresolved');
  const ids = new Set<string>();
  for (const p of state.pending) {
    if (ids.has(p.instanceId)) fail(`duplicate pending instance ${p.instanceId}`);
    ids.add(p.instanceId);
    if (!content.events[p.eventId]) fail(`pending event "${p.eventId}" is not known`);
    for (const [role, id] of Object.entries(p.cast)) if (!state.people[id]) fail(`pending ${p.eventId} casts missing person ${id} as ${role}`);
  }
  const pendingEvents = state.pending.map((p) => p.eventId);
  if (new Set(pendingEvents).size !== pendingEvents.length) fail('an event appears twice in one year');
  for (const s of state.scheduled) {
    if (!content.events[s.eventId]) fail(`scheduled event "${s.eventId}" is not known`);
    // Follow-ups are always for a later year; due ones leave the list when the year begins.
    if (s.dueYear <= state.currentYear) fail(`scheduled ${s.eventId} is due in the past (${s.dueYear})`);
    for (const [role, id] of Object.entries(s.cast)) if (!state.people[id]) fail(`scheduled ${s.eventId} casts missing person ${id} as ${role}`);
  }
  for (const [id, log] of Object.entries(state.eventLog)) {
    if (!(log.count >= 1) || log.lastYear > state.currentYear || log.lastYear < state.birthYear) fail(`event log for ${id} is invalid`);
  }
  const { tags } = content.registries.memories;
  for (const [id, rel] of Object.entries(state.relationships)) {
    for (const m of rel.memories) {
      if (!tags[m.tag]) fail(`relationship ${id} has unregistered memory "${m.tag}"`);
      if (m.year > state.currentYear) fail(`relationship ${id} has a memory from the future`);
    }
  }
  for (const key of Object.keys(state.flags)) if (!content.registries.flags.flags[key]) fail(`flag "${key}" is not registered`);

  if (state.death) {
    if (state.death.year !== state.currentYear || state.death.age !== c.age) fail('the death record does not match the final year');
    if (!content.causes[state.death.causeId]) fail(`cause of death "${state.death.causeId}" is not known`);
  }
  if (!(state.lineage.generation >= 1)) fail('lineage.generation must be at least 1');
  if (state.phase === 'dead' && state.pending.length > 0) fail('a dead character has pending events');

  return failures;
}

/** Throws InvariantError listing every failure. */
export function assertInvariants(state: LifeState, content: ContentBundle): void {
  const failures = checkInvariants(state, content);
  if (failures.length > 0) throw new InvariantError(failures);
}
