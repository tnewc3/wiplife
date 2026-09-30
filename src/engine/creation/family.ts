/**
 * Generates the family a character is born into: one or two parents and any
 * older siblings, with believable ages, complete identities and names that
 * fit the parents' heritages.
 */
import {
  GENDER_CATEGORIES,
  type ContentBundle,
  type GenderCategory,
  type HeritageNames,
  type NamePool,
} from '../../content/schemas';
import { chance, nextInt, pick, type RngState } from '../rng';
import { rollInRange, rollScore, weightedPick } from '../random';
import type { Id, Person, Relationship } from '../types';
import { rollGenderCategory, rollIdentity, rollRelativeTraits } from './character';

export interface FamilyRequest {
  birthYear: number;
  cityId: Id;
  pool: NamePool;
  /** The character's gender category, for picking their first name. */
  characterCategory: GenderCategory;
  /** Custom characters choose their first name; random ones get one from their family's heritage. */
  characterFirstName?: string;
  /** Custom characters choose their last name; the family takes it too. */
  lastName?: string;
  /** Custom characters choose these; random ones roll them. */
  parents?: 1 | 2;
  siblings?: number;
  /** Assigns ids to new people, in order. */
  nextId: () => Id;
}

export interface GeneratedFamily {
  firstName: string;
  lastName: string;
  people: Person[];
  relationships: Relationship[];
}

function pickUnused(rng: RngState, options: readonly string[], used: Set<string>): string {
  const free = options.filter((o) => !used.has(o));
  const name = pick(rng, free.length > 0 ? free : options);
  used.add(name);
  return name;
}

/** Heritages in this pool with their weights, in a fixed order. */
function heritageOptions(content: ContentBundle, pool: NamePool, allowed?: readonly string[]): (readonly [string, number])[] {
  const weights = content.balance.creation.names.heritageWeights;
  return Object.keys(pool.heritages)
    .sort()
    .filter((id) => !allowed || allowed.includes(id))
    .map((id) => [id, weights[id] ?? 0] as const);
}

function rollHeritage(rng: RngState, content: ContentBundle, pool: NamePool, allowed?: readonly string[]): string {
  const options = heritageOptions(content, pool, allowed);
  if (options.some(([, w]) => w > 0)) return weightedPick(rng, options);
  return pick(rng, options.map(([id]) => id));
}

/** Heritages whose last names include this one (case-insensitive), for custom families. */
export function heritagesForLastName(pool: NamePool, lastName: string): string[] {
  const wanted = lastName.toLocaleLowerCase('en-US');
  return Object.keys(pool.heritages)
    .sort()
    .filter((id) => pool.heritages[id]!.last.some((n) => n.toLocaleLowerCase('en-US') === wanted));
}

/** The second parent's category: usually a different one, sometimes the same. */
function partnerCategory(rng: RngState, content: ContentBundle, first: GenderCategory): GenderCategory {
  if (chance(rng, content.balance.creation.family.sameGenderParentsChance)) return first;
  const weights = content.balance.creation.genderCategory;
  const others = GENDER_CATEGORIES.filter((c) => c !== first).map((c) => [c, weights[c]] as const);
  return weightedPick(rng, others);
}

export function generateFamily(rng: RngState, content: ContentBundle, request: FamilyRequest): GeneratedFamily {
  const { family, names } = content.balance.creation;
  const { birthYear, cityId, pool } = request;

  const parentCount = request.parents ?? (chance(rng, family.singleParentChance) ? 1 : 2);
  const siblingCount = request.siblings ?? weightedPick(rng, family.siblingWeights.map((w, i) => [i, w] as const));

  // Older siblings, nearest first. Gaps shrink to the minimum if the parents
  // could not otherwise have had them all within the allowed ages.
  let gaps = Array.from({ length: siblingCount }, () => nextInt(rng, family.siblingSpacing.min, family.siblingSpacing.max));
  let span = gaps.reduce((a, b) => a + b, 0);
  if (family.parentAgeAtBirth.min + span > family.parentAgeAtBirth.max) {
    gaps = gaps.map(() => family.siblingSpacing.min);
    span = gaps.reduce((a, b) => a + b, 0);
  }
  // Every parent must have been old enough when the oldest sibling was born.
  const youngestParentAge = Math.min(family.parentAgeAtBirth.min + span, family.parentAgeAtBirth.max);
  const ageRange = family.parentAgeAtBirth;

  // Heritage: the family's last name comes from the first parent's heritage;
  // a second parent usually shares it. A custom last name found in a heritage
  // picks that heritage.
  const matching = request.lastName ? heritagesForLastName(pool, request.lastName) : [];
  const primary = rollHeritage(rng, content, pool, matching.length > 0 ? matching : undefined);
  const otherHeritages = Object.keys(pool.heritages).filter((h) => h !== primary);
  const partner =
    parentCount === 2 && otherHeritages.length > 0 && !chance(rng, names.sameHeritageParentsChance)
      ? rollHeritage(rng, content, pool, otherHeritages)
      : primary;
  const heritage = (id: string): HeritageNames => pool.heritages[id]!;
  /** Children's first names come from either parent's heritage. */
  const childHeritage = () => heritage(partner === primary ? primary : pick(rng, [primary, partner]));

  const lastName = request.lastName ?? pick(rng, heritage(primary).last);
  const usedFirst = new Set<string>();
  const firstName = request.characterFirstName ?? pickUnused(rng, childHeritage().first[request.characterCategory], usedFirst);
  usedFirst.add(firstName);

  const people: Person[] = [];
  const relationships: Relationship[] = [];

  const addRelative = (
    kind: 'parent' | 'sibling',
    personBirthYear: number,
    category: GenderCategory,
    nameSource: HeritageNames,
    personLastName: string,
    mustBeAttractedTo?: GenderCategory,
  ): Person => {
    const identity = rollIdentity(rng, content, category, mustBeAttractedTo);
    const person: Person = {
      id: request.nextId(),
      name: { first: pickUnused(rng, nameSource.first[category], usedFirst), last: personLastName },
      birthYear: personBirthYear,
      alive: true,
      identity,
      traits: rollRelativeTraits(rng, content),
      looks: rollScore(rng, family.relativeLooks),
      smarts: rollScore(rng, family.relativeSmarts),
      cityId,
      tags: ['family'],
    };
    const affection = rollScore(rng, kind === 'parent' ? family.parentAffection : family.siblingAffection);
    const trust = rollScore(rng, kind === 'parent' ? family.parentTrust : family.siblingTrust);
    people.push(person);
    relationships.push({
      personId: person.id,
      kind,
      status: 'active',
      affection,
      trust,
      memories: [],
      since: birthYear,
    });
    return person;
  };

  // Parents.
  const firstAge = rollInRange(rng, ageRange, youngestParentAge, ageRange.max);
  const firstCategory = rollGenderCategory(rng, content);
  if (parentCount === 1) {
    addRelative('parent', birthYear - firstAge, firstCategory, heritage(primary), lastName);
  } else {
    const secondCategory = partnerCategory(rng, content, firstCategory);
    const secondAge = rollInRange(
      rng,
      { mean: firstAge, sd: family.partnerAgeGap.sd },
      Math.max(youngestParentAge, firstAge - family.partnerAgeGap.max),
      Math.min(ageRange.max, firstAge + family.partnerAgeGap.max),
    );
    const otherLastNames = heritage(partner).last.filter((n) => n !== lastName);
    const secondLastName =
      chance(rng, family.sharedLastNameChance) || otherLastNames.length === 0 ? lastName : pick(rng, otherLastNames);
    addRelative('parent', birthYear - firstAge, firstCategory, heritage(primary), lastName, secondCategory);
    addRelative('parent', birthYear - secondAge, secondCategory, heritage(partner), secondLastName, firstCategory);
  }

  // Older siblings, nearest in age first.
  let siblingBirthYear = birthYear;
  for (const gap of gaps) {
    siblingBirthYear -= gap;
    addRelative('sibling', siblingBirthYear, rollGenderCategory(rng, content), childHeritage(), lastName);
  }

  return { firstName, lastName, people, relationships };
}
