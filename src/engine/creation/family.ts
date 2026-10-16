import { nativeLanguages, householdLanguages } from '../languages';
import { citizenshipsFromCity } from '../migration/citizenship';
/**
 * Generates the family a character is born into: one or two parents, any
 * older siblings and (C1) each parent's two parents, with believable ages,
 * complete identities and names that fit the parents' heritages.
 * Grandparents may have died before you were born (the NPC mortality odds),
 * and some live in another city.
 */
import {
  GENDER_CATEGORIES,
  type ContentBundle,
  type GenderCategory,
  type HeritageNames,
  type NamePool,
} from '../../content/schemas';
import { chance, nextFloat, nextInt, pick, type RngState } from '../rng';
import { rollInRange, rollScore, weightedPick } from '../random';
import { npcDeathChance } from '../systems/mortality';
import type { FamilyWealth, Id, Person, Relationship } from '../types';
import { rollCanCarry } from '../family/carrying';
import { rollGenderCategory, rollIdentity, rollRelativeTraits } from './character';
import { sameCountryCities } from '../country';

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
  /** E1: relatives share the family's background (their wealth level). */
  familyWealth: FamilyWealth;
  /** Assigns ids to new people, in order. */
  nextId: () => Id;
}

export interface GeneratedFamily {
  /** B1: the heritage your names come from. */
  heritage: string;
  firstName: string;
  lastName: string;
  people: Person[];
  relationships: Relationship[];
}

export function pickUnused(rng: RngState, options: readonly string[], used: Set<string>): string {
  const free = options.filter((o) => !used.has(o));
  const name = pick(rng, free.length > 0 ? free : options);
  used.add(name);
  return name;
}

/** Heritages in this pool with their weights, in a fixed order. */
function heritageOptions(content: ContentBundle, pool: NamePool, allowed?: readonly string[], cityId?: Id): (readonly [string, number])[] {
  // A name pool is the pool of the country it is named after: that country says how often each heritage starts a family,
  // unless the city (B1: Houston, Montreal) sets its own.
  const weights = (cityId !== undefined ? content.cities[cityId]?.heritageWeights : undefined) ?? content.countries[pool.id]?.names.heritageWeights ?? {};
  return Object.keys(pool.heritages)
    .sort()
    .filter((id) => !allowed || allowed.includes(id))
    .map((id) => [id, weights[id] ?? 0] as const);
}

export function rollHeritage(rng: RngState, content: ContentBundle, pool: NamePool, allowed?: readonly string[], cityId?: Id): string {
  const options = heritageOptions(content, pool, allowed, cityId);
  if (options.some(([, w]) => w > 0)) return weightedPick(rng, options);
  return pick(rng, options.map(([id]) => id));
}

/**
 * B1: a child's heritage comes from a parent's. Parents whose heritage is not in this pool (or not known) are left
 * out; with none left, it is rolled for the city. Two different heritages give either, by the city's weights.
 */
export function heritageFromParents(rng: RngState, content: ContentBundle, pool: NamePool, parents: readonly (string | undefined)[], cityId: Id): string {
  const known = [...new Set(parents.filter((h): h is string => h !== undefined && pool.heritages[h] !== undefined))].sort();
  if (known.length === 0) return rollHeritage(rng, content, pool, undefined, cityId);
  if (known.length === 1) return known[0]!;
  return rollHeritage(rng, content, pool, known, cityId);
}

/** Heritages whose first names (of any category) include this one (case-insensitive), for custom characters. */
export function heritagesForFirstName(pool: NamePool, firstName: string): string[] {
  const wanted = firstName.toLocaleLowerCase('en-US');
  return Object.keys(pool.heritages)
    .sort()
    .filter((id) => GENDER_CATEGORIES.some((c) => pool.heritages[id]!.first[c].some((n) => n.toLocaleLowerCase('en-US') === wanted)));
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
  const { family } = content.balance.creation;
  const { birthYear, cityId, pool } = request;
  const names = content.countries[pool.id]!.names;

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
  // B1: a custom first or last name found in a heritage picks it (a name found in both picks one that has both).
  const lastMatching = request.lastName ? heritagesForLastName(pool, request.lastName) : [];
  const firstMatching = request.characterFirstName ? heritagesForFirstName(pool, request.characterFirstName) : [];
  const both = lastMatching.filter((h) => firstMatching.includes(h));
  const matching = both.length > 0 ? both : lastMatching.length > 0 ? lastMatching : firstMatching;
  const primary = rollHeritage(rng, content, pool, matching.length > 0 ? matching : undefined, cityId);
  const otherHeritages = Object.keys(pool.heritages).filter((h) => h !== primary);
  const partner =
    parentCount === 2 && otherHeritages.length > 0 && !chance(rng, names.sameHeritageParentsChance)
      ? rollHeritage(rng, content, pool, otherHeritages, cityId)
      : primary;
  const heritage = (id: string): HeritageNames => pool.heritages[id]!;
  /** Children's first names come from either parent's heritage. */
  const childHeritageId = () => (partner === primary ? primary : pick(rng, [primary, partner]));
  const childHeritage = () => heritage(childHeritageId());

  const lastName = request.lastName ?? pick(rng, heritage(primary).last);
  const usedFirst = new Set<string>();
  // Your own heritage: the one your custom first name belongs to if a parent has it, otherwise either parent's.
  const ownHeritage = [primary, partner].find((h) => firstMatching.includes(h)) ?? childHeritageId();
  const firstName = request.characterFirstName ?? pickUnused(rng, heritage(ownHeritage).first[request.characterCategory], usedFirst);
  usedFirst.add(firstName);

  const people: Person[] = [];
  const relationships: Relationship[] = [];

  const addRelative = (
    kind: 'parent' | 'sibling' | 'grandparent',
    personBirthYear: number,
    category: GenderCategory,
    nameSource: HeritageNames,
    personLastName: string,
    mustBeAttractedTo?: GenderCategory,
  ): Person => {
    const identity = rollIdentity(rng, content, category, mustBeAttractedTo);
    const origin = Object.keys(pool.heritages).find((id) => pool.heritages[id] === nameSource) ?? primary;
    const person: Person = {
      id: request.nextId(),
      heritage: origin,
      languages: [],
      citizenships: citizenshipsFromCity(cityId, content),
      name: { first: pickUnused(rng, nameSource.first[category], usedFirst), last: personLastName },
      birthYear: personBirthYear,
      alive: true,
      identity,
      traits: rollRelativeTraits(rng, content),
      looks: rollScore(rng, family.relativeLooks),
      smarts: rollScore(rng, family.relativeSmarts),
      cityId,
      tags: ['family'],
      // E1: set from their personality and circumstances once the life is assembled (createLife).
      mood: 50,
      moodBase: 50,
      wealthLevel: request.familyWealth,
      canCarry: rollCanCarry(rng, category, content),
    };
    person.languages = nativeLanguages(cityId, origin, birthYear, rng, content);
    const scores = {
      parent: [family.parentAffection, family.parentTrust],
      sibling: [family.siblingAffection, family.siblingTrust],
      grandparent: [family.grandparents.affection, family.grandparents.trust],
    } as const;
    const affection = rollScore(rng, scores[kind][0]);
    const trust = rollScore(rng, scores[kind][1]);
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
  const parents: { person: Person; heritage: string }[] = [];
  const firstAge = rollInRange(rng, ageRange, youngestParentAge, ageRange.max);
  const firstCategory = rollGenderCategory(rng, content);
  if (parentCount === 1) {
    parents.push({ person: addRelative('parent', birthYear - firstAge, firstCategory, heritage(primary), lastName), heritage: primary });
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
    parents.push(
      { person: addRelative('parent', birthYear - firstAge, firstCategory, heritage(primary), lastName, secondCategory), heritage: primary },
      { person: addRelative('parent', birthYear - secondAge, secondCategory, heritage(partner), secondLastName, firstCategory), heritage: partner },
    );
  }

  // Older siblings, nearest in age first.
  let siblingBirthYear = birthYear;
  for (const gap of gaps) {
    siblingBirthYear -= gap;
    addRelative('sibling', siblingBirthYear, rollGenderCategory(rng, content), childHeritage(), lastName);
  }

  // Grandparents (C1): each parent's two parents.
  const otherCities = sameCountryCities(cityId, content).filter((id) => id !== cityId);
  for (const { person: parent, heritage: parentHeritage } of parents) {
    const names = heritage(parentHeritage);
    const age = rollInRange(rng, ageRange, ageRange.min, ageRange.max);
    const category = rollGenderCategory(rng, content);
    const otherCategory = partnerCategory(rng, content, category);
    const otherAge = rollInRange(
      rng,
      { mean: age, sd: family.partnerAgeGap.sd },
      Math.max(ageRange.min, age - family.partnerAgeGap.max),
      Math.min(ageRange.max, age + family.partnerAgeGap.max),
    );
    const otherLastNames = names.last.filter((n) => n !== parent.name.last);
    const otherLastName = chance(rng, family.sharedLastNameChance) || otherLastNames.length === 0 ? parent.name.last : pick(rng, otherLastNames);
    for (const [gpAge, gpCategory, gpLastName, partnerOf] of [
      [age, category, parent.name.last, otherCategory],
      [otherAge, otherCategory, otherLastName, category],
    ] as const) {
      const gp = addRelative('grandparent', parent.birthYear - gpAge, gpCategory, names, gpLastName, partnerOf);
      const died = yearOfDeathBefore(rng, content, gp.birthYear, parent.birthYear, birthYear);
      if (died !== null) {
        gp.alive = false;
        gp.deathYear = died;
      } else if (otherCities.length > 0 && !chance(rng, family.grandparents.sameCityChance)) {
        gp.cityId = pick(rng, otherCities);
      }
    }
  }

  for (const p of people) if (relationships.some((r) => r.personId === p.id && r.kind === "sibling")) p.languages = householdLanguages(cityId, parents.map((p) => p.person), birthYear, content);
  return { heritage: ownHeritage, firstName, lastName, people, relationships };
}

/**
 * The year someone born in `born` died between `from` (alive then) and
 * `before` (exclusive), by the NPC mortality odds; null if they lived. One
 * draw: the year where the chance of having died reaches it.
 */
function yearOfDeathBefore(rng: RngState, content: ContentBundle, born: number, from: number, before: number): number | null {
  const roll = nextFloat(rng);
  let survived = 1;
  for (let year = from + 1; year < before; year++) {
    survived *= 1 - npcDeathChance(year - born, content);
    if (1 - survived > roll) return year;
  }
  return null;
}
