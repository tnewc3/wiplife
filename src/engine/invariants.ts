/**
 * Sanity checks on a life (docs/technical.md, sections M and Q). Used in
 * development and tests; each later stage adds the checks for its systems.
 */
import type { ContentBundle } from '../content/schemas';
import { isRngState } from './rng';
import type { Identity, LifeState, Pronouns } from './types';

const LIFE_STAGES = new Set(['early', 'child', 'teen', 'youngAdult', 'adult', 'senior']);
const PHASES = new Set(['yearStart', 'events', 'yearEnd', 'dead']);
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
  city('housing.cityId', state.housing.cityId);

  // Money.
  money('finances.savings', state.finances.savings);
  if (state.finances.savings < 0) fail('finances.savings must not be negative');
  for (const debt of state.finances.debts) money(`debt ${debt.id} balance`, debt.balance);
  money('housing.annualCost', state.housing.annualCost);

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

  // Logs.
  if (state.inputLog[0]?.kind !== 'create') fail('the input log must start with the create input');
  for (let i = 1; i < state.history.length; i++) {
    if (state.history[i]!.year < state.history[i - 1]!.year) fail('history years must only go forward');
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
