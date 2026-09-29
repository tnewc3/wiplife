/**
 * Life lifecycle (docs/technical.md, section M). Stage 2 adds createLife;
 * beginYear and endYear arrive with Stage 3.
 */
import type { ContentBundle } from '../content/schemas';
import {
  activeIds,
  rollAppearance,
  rollGenderCategory,
  rollHidden,
  rollIdentity,
  rollLatent,
  rollPersonality,
  rollStats,
} from './creation/character';
import { generateFamily } from './creation/family';
import { parseCreateLifeOptions, type CreateLifeOptions } from './creation/input';
import { weightedKey } from './random';
import { createRng, pick } from './rng';
import type { Character, Id, LifeState } from './types';

export type { CreateLifeOptions, CustomLifeInput } from './creation/input';

/**
 * Builds a new life at age 0 from random or custom options. Deterministic:
 * the same options and content always produce the same life. The options are
 * validated (throws InvalidInputError) and recorded as the first entry of the
 * input log, so the life can be replayed.
 */
export function createLife(input: CreateLifeOptions, content: ContentBundle): LifeState {
  const options = parseCreateLifeOptions(input, content);
  const { seed, birthYear } = options;
  const rng = createRng(seed);
  const creation = content.balance.creation;

  let personCount = 0;
  const nextId = (): Id => `p${++personCount}`;

  let character: Character;
  let familyRequest: { parents?: 1 | 2; siblings?: number; lastName?: string };

  if (options.mode === 'random') {
    const cityId = pick(rng, activeIds(content.cities));
    const familyWealth = weightedKey(rng, creation.familyWealth);
    const identity = rollIdentity(rng, content, rollGenderCategory(rng, content));
    const pool = namePool(content, cityId);
    const first = pick(rng, pool.first[identity.genderCategory]);
    const stats = rollStats(rng, content);
    const personality = rollPersonality(rng, content);
    const descriptors = rollAppearance(rng, content);
    character = {
      name: { first, last: '' },
      age: 0,
      lifeStage: 'early',
      identity,
      latent: {},
      appearance: { descriptors },
      stats,
      personality,
      hidden: rollHidden(rng, content),
      cityId,
      familyWealth,
      custom: false,
    };
    familyRequest = {};
  } else {
    const custom = options.custom;
    character = {
      name: { ...custom.name },
      age: 0,
      lifeStage: 'early',
      identity: {
        ...custom.identity,
        pronouns: { ...custom.identity.pronouns },
        attractedTo: [...custom.identity.attractedTo],
      },
      latent: {},
      appearance: { descriptors: [...custom.appearance.descriptors] },
      stats: { ...custom.stats },
      personality: { ...custom.personality },
      hidden: rollHidden(rng, content),
      cityId: custom.cityId,
      familyWealth: custom.familyWealth,
      custom: true,
    };
    familyRequest = { parents: custom.family.parents, siblings: custom.family.siblings, lastName: custom.name.last };
  }

  character.latent = rollLatent(rng, content, character.identity, character.personality);

  const family = generateFamily(rng, content, {
    birthYear,
    cityId: character.cityId,
    pool: namePool(content, character.cityId),
    characterFirstName: character.name.first,
    nextId,
    ...familyRequest,
  });
  character.name.last = family.lastName;

  return {
    id: `life_${seed}`,
    seed,
    rng,
    birthYear,
    currentYear: birthYear,
    phase: 'yearStart',
    character,
    people: Object.fromEntries(family.people.map((p) => [p.id, p])),
    relationships: Object.fromEntries(family.relationships.map((r) => [r.personId, r])),
    education: { current: null, credentials: [] },
    career: { job: null, gig: false, retired: false, history: [] },
    finances: { savings: 0, debts: [], lifestyle: 'comfortable' },
    housing: { kind: 'with_parents', cityId: character.cityId, annualCost: 0 },
    health: { conditions: [] },
    legal: { record: [] },
    flags: {},
    eventLog: {},
    scheduled: [],
    pending: [],
    history: [],
    inputLog: [{ year: birthYear, kind: 'create', payload: structuredCloneJson(options) }],
    lineage: { generation: 1 },
  };
}

function namePool(content: ContentBundle, cityId: Id) {
  const city = content.cities[cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) throw new Error(`No name pool for city "${cityId}"`);
  return pool;
}

/** A deep copy through JSON, so the input log holds plain data only. */
function structuredCloneJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
