/**
 * How children grow, each year (E2a), a light version of the stat, school
 * and mood systems for your children and stepchildren. Your parenting style
 * (before this year's drift) nudges their personality, smarts, grades,
 * Happiness, Stress, how they feel about you and how much they trust you;
 * their Health and Fitness settle; the style then drifts back toward where
 * you've been lately, and a notable style leaves a memory on the child's
 * side. Grown children move out and may start a job. Numbers:
 * balance/family.yaml (children, parenting).
 */
import type { ContentBundle, ParentingKey } from '../../content/schemas';
import { PARENTING_KEYS, TRAIT_KEYS } from '../../content/schemas';
import { curveAt } from '../curve';
import { otherCity } from '../events/casting';
import { rollWealth } from '../interactions/wealth';
import { clampInt, rollNormal } from '../random';
import { chance, type RngState } from '../rng';
import { addHistory } from '../systems/history';
import type { LifeState, Person, Relationship } from '../types';
import { styleOf } from './parenting';
import { livingChildren } from './children';
import { renderText } from '../text';

type Lines = Record<ParentingKey, number>;

/** The style lines as −1 (the bottom) to 1 (the top), scaled for stepchildren. */
function lines(rel: Relationship, content: ContentBundle): Lines {
  const share = rel.kind === 'stepchild' ? content.balance.family.parenting.stepShare : 1;
  const style = styleOf(rel, content);
  return { warmth: ((style.warmth - 50) / 50) * share, strictness: ((style.strictness - 50) / 50) * share, involvement: ((style.involvement - 50) / 50) * share };
}

/** Σ effect[line] × line, for an effect table (missing lines count as zero). */
function weigh(effect: Partial<Record<ParentingKey, number>> | undefined, s: Lines): number {
  if (!effect) return 0;
  let sum = 0;
  for (const key of PARENTING_KEYS) sum += (effect[key] ?? 0) * s[key];
  return sum;
}

/** A whole number of points from a fractional amount: the fraction happens by chance. */
function points(rng: RngState, amount: number): number {
  const size = Math.abs(amount);
  const whole = Math.floor(size);
  const extra = size > whole && chance(rng, size - whole) ? 1 : 0;
  return amount < 0 ? -(whole + extra) : whole + extra;
}

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

/** The memory tags a notable style leaves on the child's side, with the line and direction that writes each. */
const STYLE_MEMORIES: { tag: string; line: ParentingKey; high: boolean }[] = [
  { tag: 'parent_never_around', line: 'involvement', high: false },
  { tag: 'parent_cold_home', line: 'warmth', high: false },
  { tag: 'parent_always_there', line: 'involvement', high: true },
  { tag: 'parent_warm_home', line: 'warmth', high: true },
  { tag: 'parent_strict_rules', line: 'strictness', high: true },
  { tag: 'parent_no_rules', line: 'strictness', high: false },
];

/** At most one memory a year: the first notable line whose memory wasn't written in the last few years. */
function writeStyleMemory(state: LifeState, rel: Relationship, content: ContentBundle): void {
  const { memories } = content.balance.family.parenting;
  const style = styleOf(rel, content);
  for (const m of STYLE_MEMORIES) {
    const value = style[m.line];
    if (m.high ? value < memories.high : value > memories.low) continue;
    if (rel.memories.some((x) => x.tag === m.tag && state.currentYear - x.year < memories.years)) continue;
    rel.memories.push({ tag: m.tag, year: state.currentYear });
    return;
  }
}

/** Whether you did anything with this child last year (an interaction through the menu). */
function interactedLastYear(rel: Relationship, currentYear: number): boolean {
  const c = rel.interactions;
  return c !== undefined && c.year === currentYear - 1 && Object.keys(c.counts).length > 0;
}

/** One child, one year: effects of your style first, then the style's drift and a memory. */
function growChild(state: LifeState, rng: RngState, person: Person & { child: NonNullable<Person['child']> }, content: ContentBundle): void {
  const { children, parenting } = content.balance.family;
  const rel = state.relationships[person.id]!;
  const d = person.child;
  const age = state.currentYear - person.birthYear;
  const w = curveAt(children.ageWeight, age);
  const s = lines(rel, content);

  // Personality and smarts follow the style while the child is growing up.
  for (const trait of TRAIT_KEYS) {
    const effect = children.personality[trait];
    if (!effect || w === 0) continue;
    const delta = points(rng, weigh(effect, s) * w);
    if (delta !== 0) person.traits[trait] = clampInt((person.traits[trait] ?? 50) + delta, 0, 100);
  }
  if (w > 0) {
    const delta = points(rng, weigh(children.smarts, s) * w);
    if (delta !== 0) person.smarts = clampInt(person.smarts + delta, 0, 100);
  }

  // Their mood in life: Happiness and Stress close in on what their home is like.
  const happy = children.happiness;
  d.happiness = clampInt(d.happiness + (happy.base + weigh(happy.style, s) + rollNormal(rng, { mean: 0, sd: happy.noiseSd }) - d.happiness) * happy.rate, 0, 100);
  const stress = children.stress;
  d.stress = clampInt(d.stress + (stress.base + weigh(stress.style, s) + rollNormal(rng, { mean: 0, sd: stress.noiseSd }) - d.stress) * stress.rate, 0, 100);
  const health = children.health;
  d.health = clampInt(d.health + (health.base - d.health) * health.rate + rollNormal(rng, { mean: 0, sd: health.noiseSd }), 0, 100);
  d.fitness = clampInt(d.fitness + (health.fitnessBase - d.fitness) * health.rate + rollNormal(rng, { mean: 0, sd: health.noiseSd }), 0, 100);

  // Grades, from kindergarten through high school.
  const school = content.balance.education.school;
  if (age >= school.startAge && age < school.startAge + school.elementary + school.middle + school.high) {
    const g = children.grades;
    const grade =
      g.base +
      g.smarts * (person.smarts - 50) +
      g.discipline * ((person.traits.discipline ?? 50) - 50) +
      g.happiness * (d.happiness - 50) +
      weigh(g.style, s) +
      rollNormal(rng, { mean: 0, sd: g.noiseSd });
    d.gpa = roundTo2(Math.min(4, Math.max(0, grade)));
  }

  // How they feel about you, and trust.
  const a = children.affection;
  const target = a.base + weigh(a.style, s);
  rel.affection = clampInt(rel.affection + Math.round((target - rel.affection) * a.rate), 0, 100);
  rel.trust = clampInt(rel.trust + points(rng, weigh(children.trust.style, s)), 0, 100);

  // The style drifts back toward where you've been lately; a year with no
  // time spent together at all costs involvement.
  const style = (rel.parenting ??= { ...parenting.start });
  if (age < content.balance.relationships.adultAge && !interactedLastYear(rel, state.currentYear)) {
    style.involvement = clampInt(style.involvement - parenting.inactivity, 0, 100);
  }
  const home = d.custody === 'you' ? 'household' : d.custody;
  const baselines: Record<ParentingKey, number> = { warmth: parenting.start.warmth, strictness: parenting.start.strictness, involvement: parenting.involvementBaseline[home] };
  for (const key of PARENTING_KEYS) style[key] = clampInt(style[key] + (baselines[key] - style[key]) * parenting.drift, 0, 100);
  if (age >= 3 && age < content.balance.relationships.adultAge) writeStyleMemory(state, rel, content);
}

/** A grown child may move out, and start a job. */
function growUp(state: LifeState, rng: RngState, person: Person & { child: NonNullable<Person['child']> }, content: ContentBundle): void {
  const { leaving, career } = content.balance.family.children;
  const d = person.child;
  const age = state.currentYear - person.birthYear;
  if (d.movedOutYear === undefined && age >= leaving.age && d.custody !== 'other') {
    if (age >= leaving.latest || chance(rng, leaving.chance)) {
      d.movedOutYear = state.currentYear;
      if (chance(rng, leaving.elsewhere)) person.cityId = otherCity(state, rng, content);
      const text = content.text.history.family.childMovedOut;
      const kind = state.relationships[person.id]?.kind;
      if (kind === 'child') {
        addHistory(
          state,
          { text: renderText(text.variants[0]!, { roles: { npc: { name: person.name, pronouns: person.identity.pronouns } } }), tags: ['family', 'childMovedOut', `person:${person.id}`], importance: text.importance },
          content,
        );
      }
    }
  }
  if (person.occupation === undefined && age >= career.age && chance(rng, career.employed)) {
    const rolled = rollWealth(state, 'acquaintance', age, rng, content);
    if (rolled.occupation !== undefined) person.occupation = rolled.occupation;
  }
}

/** Each year, every living child and stepchild grows (in id order, drawing from the life's generator). */
export function growChildren(state: LifeState, content: ContentBundle): void {
  for (const person of livingChildren(state, true)) {
    const age = state.currentYear - person.birthYear;
    const rel = state.relationships[person.id]!;
    if (rel.status === 'ended') continue;
    growChild(state, state.rng, person, content);
    if (age >= content.balance.relationships.adultAge) growUp(state, state.rng, person, content);
  }
}

