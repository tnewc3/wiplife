/**
 * Children as people (E2a): creating one (born to you, adopted, through IVF
 * or surrogacy, or a partner's child who becomes your stepchild), with the
 * fuller data a child has. Genetics: a child's starting looks, smarts,
 * fitness, genetic health risk and personality come from their biological
 * parents' values (the mean of both, or of the one known parent and the
 * population), with random variation; an adopted child's are rolled
 * independently. Orientation, gender identity and the hidden traits (latent)
 * are always rolled independently, never inherited. Numbers:
 * balance/family.yaml.
 */
import { rollNeuro } from '../mental/neuro';
import { ownNeuro } from '../mental/query';
import type { ContentBundle, Distribution } from '../../content/schemas';
import { PERSONALITY_TRAITS, rollGenderCategory, rollIdentity, rollLatent, activeIds } from '../creation/character';
import { pickUnused, rollHeritage } from '../creation/family';
import { curveAt } from '../curve';
import { nextPersonId } from '../events/casting';
import { moodBaseline } from '../interactions/mood';
import { yourWealth } from '../interactions/wealth';
import { clampInt, rollNormal, rollScore, weightedPick } from '../random';
import { chance, nextInt, pick, type RngState } from '../rng';
import { rollCanCarry } from './carrying';
import type { ChildData, ChildOrigin, Custody, Id, LifeState, Person, Personality, Relationship } from '../types';

/** Who a child's biological parents are, among the people in the life. */
export interface Parents {
  /** You are a biological parent. */
  you: boolean;
  /** The other biological parent, if they are someone in your life. */
  other?: Id;
}

export interface NewChild {
  origin: ChildOrigin;
  /** Years old now (0 for a newborn). */
  age: number;
  parents: Parents;
  /** The other parent for the record: your partner or ex; a stepchild's parent. */
  otherParentId?: Id;
  custody: Custody;
}

type ParentRef = 'you' | Id;

/** A parent's value for a score the child inherits. People other than you only have looks, smarts and some traits; the rest count as average. */
function parentValue(state: LifeState, who: ParentRef, key: 'smarts' | 'looks' | 'fitness' | 'geneticRisk' | keyof Personality, content: ContentBundle): number {
  const creation = content.balance.creation;
  const popMean = key === 'geneticRisk' ? creation.hidden.geneticRisk.mean : (PERSONALITY_TRAITS as readonly string[]).includes(key) ? creation.personality.mean : creation.stats[key as 'smarts' | 'looks' | 'fitness'].mean;
  if (who === 'you') {
    if (key === 'geneticRisk') return state.character.hidden.geneticRisk;
    if ((PERSONALITY_TRAITS as readonly string[]).includes(key)) return state.character.personality[key as keyof Personality];
    return state.character.stats[key as 'smarts' | 'looks' | 'fitness'];
  }
  const person = state.people[who];
  if (!person) return popMean;
  if (key === 'smarts') return person.smarts;
  if (key === 'looks') return person.looks;
  if (key === 'fitness' || key === 'geneticRisk') return popMean;
  return person.traits[key as keyof Personality] ?? popMean;
}

/**
 * A child's starting value: the mean of their biological parents' (the one
 * known parent's, pulled toward the population by populationShare, when only
 * one is known), plus the genetic spread; with no biological parent among
 * the people you know, a fresh roll from the population.
 */
function inherit(
  state: LifeState,
  rng: RngState,
  parents: ParentRef[],
  key: Parameters<typeof parentValue>[2],
  population: Distribution,
  sd: number,
  content: ContentBundle,
): number {
  if (parents.length === 0) return rollScore(rng, population);
  const known = parents.map((p) => parentValue(state, p, key, content));
  const share = content.balance.family.genetics.populationShare;
  const mean = known.length >= 2 ? (known[0]! + known[1]!) / 2 : known[0]! * (1 - share) + population.mean * share;
  return clampInt(rollNormal(rng, { mean, sd }), 0, 100);
}

/**
 * Creates a child and the relationship with you (kind `child`, or
 * `stepchild` for a stepchild) and adds both to the life. Draws from `rng` in
 * a fixed order. Returns the child's id.
 */
export function createChild(state: LifeState, rng: RngState, spec: NewChild, content: ContentBundle): Id {
  const { genetics, parenting, stepchildren } = content.balance.family;
  const creation = content.balance.creation;
  const step = spec.origin === 'step';
  const bio: ParentRef[] = spec.origin === 'adopted' ? [] : [...(spec.parents.you ? (['you'] as const) : []), ...(spec.parents.other ? [spec.parents.other] : [])];
  const sd = genetics.noiseSd;

  const id = nextPersonId(state);
  const category = rollGenderCategory(rng, content);
  const identity = rollIdentity(rng, content, category);
  const city = content.cities[state.character.cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) throw new Error(`No name pool for city "${state.character.cityId}"`);
  const heritage = pool.heritages[rollHeritage(rng, content, pool)]!;
  const used = new Set([state.character.name.first, ...Object.values(state.people).map((p) => p.name.first)]);
  const first = pickUnused(rng, heritage.first[category], used);
  const parentPerson = spec.otherParentId === undefined ? undefined : state.people[spec.otherParentId];
  const last = step && parentPerson ? parentPerson.name.last : state.character.name.last;

  const traits = {} as Personality;
  for (const trait of PERSONALITY_TRAITS) traits[trait] = inherit(state, rng, bio, trait, creation.personality, sd, content);
  const looks = inherit(state, rng, bio, 'looks', creation.stats.looks, sd, content);
  const smarts = inherit(state, rng, bio, 'smarts', creation.stats.smarts, sd, content);
  const fitness = inherit(state, rng, bio, 'fitness', creation.stats.fitness, sd, content);
  const geneticRisk = inherit(state, rng, bio, 'geneticRisk', creation.hidden.geneticRisk, genetics.riskSd, content);

  // A hidden talent: a parent's, sometimes handed down; otherwise the usual odds.
  const talents = activeIds(content.talents);
  const parentTalent = spec.parents.you ? state.character.hidden.talent : null;
  let talent: Id | null = null;
  if (parentTalent !== null && bio.includes('you') && chance(rng, genetics.talentInherit)) talent = parentTalent;
  else if (chance(rng, creation.talentChance) && talents.length > 0) talent = pick(rng, talents);

  // M1: ADHD and neurodivergence run in families: likelier if either biological parent has them.
  const neuro = rollNeuro(rng, content, bio.map((b) => (b === 'you' ? ownNeuro(state, content) : state.people[b]?.neuro)));

  const newborn = genetics.newborn;
  const child: ChildData = {
    origin: spec.origin,
    ...(spec.otherParentId !== undefined ? { otherParentId: spec.otherParentId } : {}),
    custody: spec.custody,
    custodyDecided: step || spec.otherParentId === undefined || spec.custody !== 'you',
    health: rollScore(rng, newborn.health),
    happiness: rollScore(rng, newborn.happiness),
    fitness,
    stress: rollScore(rng, newborn.stress),
    geneticRisk,
    talent,
    gpa: 0,
    // Hidden identity and personality traits are rolled on their own: never inherited.
    latent: rollLatent(rng, content, identity, traits),
  };

  const canCarry = rollCanCarry(rng, category, content);
  const person: Person = {
    id,
    name: { first, last },
    birthYear: state.currentYear - spec.age,
    alive: true,
    identity,
    traits,
    looks,
    smarts,
    cityId: spec.custody === 'other' && parentPerson ? parentPerson.cityId : state.character.cityId,
    tags: ['family'],
    mood: 50,
    moodBase: 50,
    wealthLevel: step && parentPerson ? parentPerson.wealthLevel : yourWealth(state, content),
    canCarry,
    child,
    ...(neuro.length > 0 ? { neuro } : {}),
  };
  const bond = spec.origin === 'adopted' ? parenting.bond.adopted : parenting.bond.birth;
  const relationship: Relationship = {
    personId: id,
    kind: step ? 'stepchild' : 'child',
    status: 'active',
    affection: rollScore(rng, step ? stepchildren.affection : bond.affection),
    trust: rollScore(rng, step ? stepchildren.trust : bond.trust),
    memories: [],
    since: state.currentYear,
    parenting: { ...parenting.start },
  };
  state.people[id] = person;
  state.relationships[id] = relationship;
  person.mood = person.moodBase = moodBaseline(state, person, content);
  return id;
}

/** The year-of-birth list for a new potential partner's children from before (empty: none). Draws from `rng`. */
export function rollPriorChildren(rng: RngState, age: number, currentYear: number, content: ContentBundle): number[] {
  const { stepchildren } = content.balance.family;
  const { adultAge } = content.balance.relationships;
  if (!chance(rng, curveAt(stepchildren.chance, age))) return [];
  const count = weightedPick(rng, stepchildren.count.map((w, i) => [i + 1, w] as const));
  // A parent's child is at most as old as their age minus the adult age (a teenager's child is a different story).
  const oldest = Math.min(stepchildren.maxAge, age - adultAge - 1);
  if (oldest < 0) return [];
  const years: number[] = [];
  for (let i = 0; i < count; i++) years.push(currentYear - nextInt(rng, 0, oldest));
  return years.sort((a, b) => a - b);
}

/**
 * Marrying someone with children: their children become your stepchildren
 * (people with their own pages, living where their parent does). Done once;
 * the partner's list of children from before is then cleared. Returns the
 * ids created.
 */
export function createStepchildren(state: LifeState, rng: RngState, partnerId: Id, content: ContentBundle): Id[] {
  const partner = state.people[partnerId];
  // E3: children they had since you met them (their life summary) join the ones they came with.
  const born = [...(partner?.priorChildren ?? []), ...(partner?.life?.children.map((c) => c.birthYear) ?? [])];
  if (!partner || born.length === 0) return [];
  const ids: Id[] = [];
  for (const birthYear of born) {
    const id = createChild(
      state,
      rng,
      { origin: 'step', age: state.currentYear - birthYear, parents: { you: false, other: partnerId }, otherParentId: partnerId, custody: 'you' },
      content,
    );
    const kid = state.people[id]!;
    // They live where their parent does.
    kid.cityId = partner.cityId;
    ids.push(id);
  }
  delete partner.priorChildren;
  // E3: they are your stepchildren now, and you are their partner.
  if (partner.life) {
    partner.life.children = [];
    partner.life.partner = null;
  }
  return ids;
}

/** Whether a person is one of your children or stepchildren (with child data). */
export function isChild(person: Person | undefined): person is Person & { child: ChildData } {
  return person?.child !== undefined;
}

/** Your living children (not stepchildren) and, with `steps`, stepchildren too, in id order. */
export function livingChildren(state: LifeState, steps = false): (Person & { child: ChildData })[] {
  return Object.keys(state.people)
    .sort()
    .flatMap((id) => {
      const person = state.people[id]!;
      const rel = state.relationships[id];
      if (!person.alive || !person.child || !rel) return [];
      if (rel.kind === 'child' || (steps && rel.kind === 'stepchild')) return [person as Person & { child: ChildData }];
      return [];
    });
}

