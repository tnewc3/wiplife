/**
 * Generates the family a character is born into: one or two parents and any
 * older siblings, with believable ages and complete identities.
 */
import { GENDER_CATEGORIES, type ContentBundle, type GenderCategory, type NamePool } from '../../content/schemas';
import { chance, nextInt, pick, type RngState } from '../rng';
import { rollInRange, rollScore, weightedPick } from '../random';
import type { Id, Person, Relationship } from '../types';
import { rollGenderCategory, rollIdentity, rollRelativeTraits } from './character';

export interface FamilyRequest {
  birthYear: number;
  cityId: Id;
  pool: NamePool;
  /** The character's own first name, so no relative shares it. */
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

/** The second parent's category: usually a different one, sometimes the same. */
function partnerCategory(rng: RngState, content: ContentBundle, first: GenderCategory): GenderCategory {
  if (chance(rng, content.balance.creation.family.sameGenderParentsChance)) return first;
  const weights = content.balance.creation.genderCategory;
  const others = GENDER_CATEGORIES.filter((c) => c !== first).map((c) => [c, weights[c]] as const);
  return weightedPick(rng, others);
}

export function generateFamily(rng: RngState, content: ContentBundle, request: FamilyRequest): GeneratedFamily {
  const { family } = content.balance.creation;
  const { birthYear, cityId, pool } = request;
  const usedFirst = new Set<string>(request.characterFirstName ? [request.characterFirstName] : []);

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

  const lastName = request.lastName ?? pick(rng, pool.last);
  const people: Person[] = [];
  const relationships: Relationship[] = [];

  const addRelative = (
    kind: 'parent' | 'sibling',
    personBirthYear: number,
    category: GenderCategory,
    personLastName: string,
    mustBeAttractedTo?: GenderCategory,
  ): Person => {
    const identity = rollIdentity(rng, content, category, mustBeAttractedTo);
    const person: Person = {
      id: request.nextId(),
      name: { first: pickUnused(rng, pool.first[category], usedFirst), last: personLastName },
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
    addRelative('parent', birthYear - firstAge, firstCategory, lastName);
  } else {
    const secondCategory = partnerCategory(rng, content, firstCategory);
    const secondAge = rollInRange(
      rng,
      { mean: firstAge, sd: family.partnerAgeGap.sd },
      Math.max(youngestParentAge, firstAge - family.partnerAgeGap.max),
      Math.min(ageRange.max, firstAge + family.partnerAgeGap.max),
    );
    const secondLastName = chance(rng, family.sharedLastNameChance)
      ? lastName
      : pick(rng, pool.last.filter((n) => n !== lastName).length > 0 ? pool.last.filter((n) => n !== lastName) : pool.last);
    addRelative('parent', birthYear - firstAge, firstCategory, lastName, secondCategory);
    addRelative('parent', birthYear - secondAge, secondCategory, secondLastName, firstCategory);
  }

  // Older siblings, nearest in age first.
  let siblingBirthYear = birthYear;
  for (const gap of gaps) {
    siblingBirthYear -= gap;
    addRelative('sibling', siblingBirthYear, rollGenderCategory(rng, content), lastName);
  }

  return { lastName, people, relationships };
}
