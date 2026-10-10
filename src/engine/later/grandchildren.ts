/**
 * Grandchildren (L1). The children of your children are summaries in E3
 * (`PersonLife.children`: a first name and a birth year). Once one is born
 * the later-life step makes them a person on your People list, with a
 * relationship of the kind `grandchild`, a personality drawn from their
 * parent's, and the grandparent interactions of the E1 menu. A grandchild
 * lives wherever their parent does until they are grown; helping out warms
 * the parents, spoiling and playing favorites cost something with them.
 *
 * If their parents can't raise them you can take a grandchild in
 * (`raiseGrandchild`): the guardianship E2b describes. They become your child
 * (origin `grandchild`), so parenting, school, costs and heir play all work
 * as they do for any child of yours, and their parent can ask for them back.
 */
import type { ContentBundle, GenderCategory } from '../../content/schemas';
import { PERSONALITY_TRAITS, rollGenderCategory, rollIdentity, rollLatent } from '../creation/character';
import { nextPersonId } from '../events/casting';
import { queueFamilyEvent } from '../family/step';
import { rollCanCarry } from '../family/carrying';
import { shiftParenting } from '../family/parenting';
import { moodBaseline } from '../interactions/mood';
import { isJailed } from '../lives/model';
import { rollNeuro } from '../mental/neuro';
import { clampInt, rollNormal, rollScore } from '../random';
import type { RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { ChildData, Id, LifeState, Person, Personality, Relationship } from '../types';
import { grandchildren, raisedGrandchildren } from './query';

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** The gender category a first name belongs to in the name pool of its country, or null when no list has it. */
function categoryOfName(content: ContentBundle, cityId: Id, first: string): GenderCategory | null {
  const pool = content.names[content.cities[cityId]?.countryId ?? ''];
  if (!pool) return null;
  for (const category of ['woman', 'man', 'nonbinary'] as const) {
    for (const heritage of Object.values(pool.heritages)) if (heritage.first[category].includes(first)) return category;
  }
  return null;
}

/** A grandchild's starting value: their parent's pulled toward the population by `1 - parentShare`, plus the spread. */
function inheritFrom(rng: RngState, parentValue: number | undefined, population: { mean: number; sd: number }, content: ContentBundle): number {
  const { parentShare, noiseSd } = content.balance.later.grandchildren;
  const from = parentValue ?? population.mean;
  const mean = from * parentShare + population.mean * (1 - parentShare);
  return clampInt(rollNormal(rng, { mean, sd: noiseSd }), 0, 100);
}

/**
 * Makes one of your children's children a person on your People list, with a
 * relationship of the kind `grandchild`. Draws from `rng` in a fixed order.
 * Returns their id.
 */
export function createGrandchild(state: LifeState, rng: RngState, parentId: Id, kid: { first: string; birthYear: number }, content: ContentBundle): Id {
  const parent = state.people[parentId]!;
  const creation = content.balance.creation;
  const bond = content.balance.later.grandchildren.bond;
  const id = nextPersonId(state);
  const category = categoryOfName(content, parent.cityId, kid.first) ?? rollGenderCategory(rng, content);
  const identity = rollIdentity(rng, content, category);
  const traits = {} as Personality;
  for (const trait of PERSONALITY_TRAITS) traits[trait] = inheritFrom(rng, parent.traits[trait], creation.personality, content);
  const looks = inheritFrom(rng, parent.looks, creation.stats.looks, content);
  const smarts = inheritFrom(rng, parent.smarts, creation.stats.smarts, content);
  const neuro = rollNeuro(rng, content, [parent.neuro]);
  const person: Person = {
    id,
    name: { first: kid.first, last: parent.name.last },
    birthYear: kid.birthYear,
    alive: true,
    identity,
    traits,
    looks,
    smarts,
    cityId: parent.cityId,
    tags: ['family'],
    mood: 50,
    moodBase: 50,
    wealthLevel: parent.wealthLevel,
    canCarry: rollCanCarry(rng, category, content),
    grandchild: { parentId },
    ...(neuro.length > 0 ? { neuro } : {}),
  };
  const relationship: Relationship = {
    personId: id,
    kind: 'grandchild',
    status: 'active',
    affection: rollScore(rng, bond.affection),
    trust: rollScore(rng, bond.trust),
    memories: [],
    since: kid.birthYear,
  };
  state.people[id] = person;
  state.relationships[id] = relationship;
  person.mood = person.moodBase = moodBaseline(state, person, content);
  return id;
}

/** True when this person is a minor, by the independence age. */
function isMinor(state: LifeState, person: Person, content: ContentBundle): boolean {
  return state.currentYear - person.birthYear < content.balance.relationships.adultAge;
}

/** Offers each chance at most once in `years`: true the first time, then not again until the cooldown has passed. */
export function offerOnce(state: LifeState, key: string, years: number): boolean {
  const last = state.later.offered[key];
  if (last !== undefined && state.currentYear - last < years) return false;
  state.later.offered[key] = state.currentYear;
  return true;
}

/** Your children's babies become your grandchildren, as people on your People list. */
function welcomeGrandchildren(state: LifeState, content: ContentBundle): void {
  const reg = content.registries.later.grandchildren;
  for (const parentId of Object.keys(state.relationships).sort(byId)) {
    const rel = state.relationships[parentId]!;
    const parent = state.people[parentId];
    if ((rel.kind !== 'child' && rel.kind !== 'stepchild') || rel.status === 'ended' || !parent?.life) continue;
    // The children of a grandchild you raised are your great-grandchildren, not grandchildren.
    if (parent.grandchild) continue;
    const kids = parent.life.children;
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i]!;
      if (kid.id !== undefined) continue;
      const first = grandchildren(state).length === 0 && raisedGrandchildren(state).length === 0;
      const id = createGrandchild(state, state.rng, parentId, kid, content);
      state.people[parentId]!.life!.children[i]!.id = id;
      writeFromGroup(
        state,
        content.text.later.history.grandchild,
        ['milestone', 'grandchild', `person:${id}`],
        { roles: { kid: { name: state.people[id]!.name, pronouns: state.people[id]!.identity.pronouns }, parent: { name: parent.name, pronouns: parent.identity.pronouns } } },
        content,
      );
      if (first && parent.alive) queueFamilyEvent(state, reg.first, { kid: id, parent: parentId }, content);
    }
  }
}

/** A grandchild lives where their parent does, until they are grown. */
function followParents(state: LifeState, content: ContentBundle): void {
  for (const kid of grandchildren(state)) {
    const parent = state.people[kid.grandchild.parentId];
    if (parent?.alive && isMinor(state, kid, content) && kid.cityId !== parent.cityId) kid.cityId = parent.cityId;
  }
}

/**
 * Last year's grandparenting reaches their parents: looking after a
 * grandchild warms them; spoiling someone's child behind their back costs
 * some trust. Reads last year's interaction counters.
 */
function parentsNotice(state: LifeState, content: ContentBundle): void {
  const help = content.balance.later.grandchildren.help;
  for (const kid of grandchildren(state)) {
    const rel = state.relationships[kid.id]!;
    const parentRel = state.relationships[kid.grandchild.parentId];
    const counts = rel.interactions;
    if (!parentRel || parentRel.status !== 'active' || !counts || counts.year !== state.currentYear - 1) continue;
    if (counts.counts.babysit) {
      parentRel.affection = clampInt(parentRel.affection + help.babysitParentAffection, 0, 100);
      parentRel.trust = clampInt(parentRel.trust + help.babysitParentTrust, 0, 100);
    }
    if (counts.counts.spoil_them) parentRel.trust = clampInt(parentRel.trust + help.spoilParentTrust, 0, 100);
  }
}

/**
 * Playing favorites: for a few years after you make one grandchild your
 * favorite, the others feel it, and so do their parents. One chance of the
 * story coming out (a grandchild notices) per few years.
 */
function favorites(state: LifeState, content: ContentBundle): void {
  const f = content.balance.later.grandchildren.favorite;
  const kids = grandchildren(state);
  if (kids.length < 2) return;
  const isFavorite = (id: Id) => state.relationships[id]!.memories.some((m) => m.tag === 'your_favorite' && state.currentYear - m.year <= f.years);
  const chosen = kids.filter((k) => isFavorite(k.id));
  if (chosen.length === 0) return;
  let noticed: Person | null = null;
  for (const kid of kids) {
    if (isFavorite(kid.id)) continue;
    const rel = state.relationships[kid.id]!;
    rel.affection = clampInt(rel.affection + f.others, 0, 100);
    const parentRel = state.relationships[kid.grandchild.parentId];
    // Their own parent doesn't mind if their child is the favorite too.
    if (parentRel && parentRel.status === 'active' && !chosen.some((c) => c.grandchild.parentId === kid.grandchild.parentId)) {
      parentRel.trust = clampInt(parentRel.trust + f.parentTrust, 0, 100);
    }
    noticed ??= kid;
  }
  if (noticed && offerOnce(state, 'favorite', f.years * 2)) {
    queueFamilyEvent(state, content.registries.later.grandchildren.favorite, { kid: noticed.id, parent: noticed.grandchild!.parentId }, content);
  }
}

/** The grandchildren a parent's trouble leaves without a home they can count on, and a parent doing better who might want theirs back. */
function raisingChances(state: LifeState, content: ContentBundle): void {
  const reg = content.registries.later.grandchildren;
  const serious = content.balance.people.trouble.serious;
  const age = state.character.age;
  if (age < content.balance.relationships.adultAge || state.housing.kind === 'incarcerated') return;
  for (const kid of grandchildren(state)) {
    if (!isMinor(state, kid, content)) continue;
    const parentId = kid.grandchild.parentId;
    const parent = state.people[parentId];
    const key = `raise:${kid.id}`;
    if (parent && !parent.alive) {
      if (parent.deathYear === state.currentYear && offerOnce(state, key, 10)) queueFamilyEvent(state, reg.parentGone, { kid: kid.id }, content);
      continue;
    }
    if (!parent?.life) continue;
    const trouble = isJailed(parent.life) || parent.life.troubles.some((t) => t.kind !== 'crime' && t.severity >= serious && !t.treated);
    if (trouble && offerOnce(state, key, 6)) queueFamilyEvent(state, reg.parentCannot, { kid: kid.id, parent: parentId }, content);
  }
  // A parent who is doing better asks about the grandchild you are raising.
  for (const kid of raisedGrandchildren(state)) {
    const parentId = kid.grandchild?.parentId;
    const parent = parentId === undefined ? undefined : state.people[parentId];
    const rel = state.relationships[kid.id]!;
    if (!parent?.alive || !parent.life || state.currentYear - (rel.kindSince ?? rel.since) < 2) continue;
    const worst = parent.life.troubles.reduce((m, t) => (t.kind === 'crime' ? m : Math.max(m, t.severity)), 0);
    if (isJailed(parent.life) || worst > content.balance.later.grandchildren.parentRecovered) continue;
    if (offerOnce(state, `back:${kid.id}`, 6)) queueFamilyEvent(state, reg.parentBack, { kid: kid.id, parent: parentId! }, content);
  }
}

/** Step part: grandchildren are born, grow up and are looked after. */
export function runGrandchildren(state: LifeState, content: ContentBundle): void {
  welcomeGrandchildren(state, content);
  followParents(state, content);
  parentsNotice(state, content);
  favorites(state, content);
  raisingChances(state, content);
}

/** Whether you can take this grandchild in now: they are a minor you have as a grandchild, and you are a free adult. */
export function canRaise(state: LifeState, kidId: Id, content: ContentBundle): boolean {
  const kid = state.people[kidId];
  const rel = state.relationships[kidId];
  return (
    kid !== undefined &&
    rel !== undefined &&
    kid.alive &&
    rel.kind === 'grandchild' &&
    rel.status !== 'ended' &&
    kid.grandchild !== undefined &&
    isMinor(state, kid, content) &&
    state.character.age >= content.balance.relationships.adultAge &&
    state.housing.kind !== 'incarcerated'
  );
}

/**
 * You take a grandchild in. They become your child (origin `grandchild`, custody yours), live in your
 * city, and you start with the usual parenting style. Does nothing when they can't be taken in.
 */
export function raiseGrandchild(state: LifeState, kidId: Id, rng: RngState, content: ContentBundle): void {
  if (!canRaise(state, kidId, content)) return;
  const kid = state.people[kidId]!;
  const rel = state.relationships[kidId]!;
  const fam = content.balance.family;
  const creation = content.balance.creation;
  const parentChild = kid.grandchild ? state.people[kid.grandchild.parentId]?.child : undefined;
  const data: ChildData = {
    origin: 'grandchild',
    custody: 'you',
    custodyDecided: true,
    health: rollScore(rng, fam.genetics.newborn.health),
    happiness: rollScore(rng, fam.genetics.newborn.happiness),
    fitness: rollScore(rng, creation.stats.fitness),
    stress: rollScore(rng, fam.genetics.newborn.stress),
    geneticRisk: parentChild?.geneticRisk ?? rollScore(rng, creation.hidden.geneticRisk),
    talent: null,
    gpa: 0,
    latent: rollLatent(rng, content, kid.identity, kid.traits as Personality),
  };
  kid.child = data;
  kid.cityId = state.character.cityId;
  rel.kind = 'child';
  rel.kindSince = state.currentYear;
  rel.parenting = { ...fam.parenting.start };
  shiftParenting(rel, { involvement: 5 }, content);
  rel.memories.push({ tag: 'you_raised_them', year: state.currentYear });
  writeFromGroup(
    state,
    content.text.later.history.raised,
    ['milestone', 'raisedGrandchild', `person:${kidId}`],
    { roles: { kid: { name: kid.name, pronouns: kid.identity.pronouns } } },
    content,
  );
}

/** A grandchild you are raising goes back to their parent. */
export function returnGrandchild(state: LifeState, kidId: Id, content: ContentBundle): void {
  const kid = state.people[kidId];
  const rel = state.relationships[kidId];
  if (!kid?.child || kid.child.origin !== 'grandchild' || !rel || !kid.grandchild) return;
  const parent = state.people[kid.grandchild.parentId];
  delete kid.child;
  delete rel.parenting;
  rel.kind = 'grandchild';
  rel.kindSince = state.currentYear;
  if (parent) kid.cityId = parent.cityId;
  if (state.family.support?.personId === kidId) state.family.support = null;
  writeFromGroup(
    state,
    content.text.later.history.returned,
    ['milestone', 'returnedGrandchild', `person:${kidId}`],
    { roles: { kid: { name: kid.name, pronouns: kid.identity.pronouns } } },
    content,
  );
}

/** You nudge a grandchild's trait or smarts (mentoring); anything that doesn't fit is ignored. */
export function teachGrandchild(state: LifeState, kidId: Id, key: keyof Personality | 'smarts', delta: number): void {
  const kid = state.people[kidId];
  const rel = state.relationships[kidId];
  if (!kid?.alive || !rel || !kid.grandchild || rel.status === 'ended') return;
  if (key === 'smarts') kid.smarts = clampInt(kid.smarts + delta, 0, 100);
  else kid.traits[key] = clampInt((kid.traits[key] ?? 50) + delta, 0, 100);
}
