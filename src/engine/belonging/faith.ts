/**
 * Faith (W2): which faith (if any) you were born into from your family, how
 * strongly you believe, and how that changes over a life: it can deepen,
 * fade, be found, lost, changed or returned to. The people around you have
 * faiths too: a family's is set down at birth and everyone else's is worked
 * out from the life's seed when asked (always the same), until a change or
 * a congregation sets it down. Numbers: balance/belonging.yaml (faith).
 *
 * Nothing here says one faith is better, worse, truer or sillier than another:
 * every faith is rolled, drifted and changed by the same rules.
 */
import type { ContentBundle } from '../../content/schemas';
import { clampInt, rollNormal, rollScore, weightedPick, wholeChange } from '../random';
import { chance, createRng, nextFloat, type RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { FaithState, Id, LifeState, Person } from '../types';
import { adherentName, faithName, instanceOf, ownFaithMemberships } from './query';

/** Active faiths in id order, with their birth weights, and (optionally) no faith. */
function weights(content: ContentBundle, withNone: boolean, exclude: Id | null | 'nothing' = 'nothing'): (readonly [Id | null, number])[] {
  const reg = content.registries.belonging;
  const out: (readonly [Id | null, number])[] = Object.keys(reg.faiths)
    .sort()
    .filter((id) => id !== exclude)
    .map((id) => [id, reg.faiths[id]!.birthWeight] as const);
  if (withNone && exclude !== null) out.push([null, reg.noneWeight] as const);
  return out;
}

const pickFaith = (rng: RngState, options: readonly (readonly [Id | null, number])[]): Id | null =>
  options.some(([, w]) => w > 0) ? weightedPick(rng, options) : (options[0]?.[0] ?? null);

/** The faith a family has when you are born and how devout it is. */
export function rollHousehold(rng: RngState, content: ContentBundle): { faith: Id | null; devotion: number } {
  const faith = pickFaith(rng, weights(content, true));
  return { faith, devotion: faith === null ? 0 : rollScore(rng, content.balance.belonging.faith.household) };
}

/** A child's belief from the household's. */
function childStrength(rng: RngState, devotion: number, content: ContentBundle): number {
  const f = content.balance.belonging.faith;
  return clampInt(Math.round(devotion * f.childShare + rollNormal(rng, { mean: 0, sd: f.childNoise })), 1, 100);
}

/** Your faith at birth: your household's, with the chance of another. */
export function rollOwnFaith(rng: RngState, content: ContentBundle, household: { faith: Id | null; devotion: number }): FaithState {
  const f = content.balance.belonging.faith;
  const takes = chance(rng, f.inherit);
  const id = takes ? household.faith : pickFaith(rng, weights(content, true, household.faith));
  const strength = id === null ? 0 : takes ? childStrength(rng, household.devotion, content) : rollScore(rng, f.chosen);
  return { id, strength: id === null ? 0 : Math.max(1, strength), raised: household.faith, since: null, changes: 0 };
}

/** A faith the player chose in custom creation: the family has it too (or none). */
export function chosenFaith(rng: RngState, content: ContentBundle, choice: Id | 'none'): { household: { faith: Id | null; devotion: number }; faith: FaithState } {
  const f = content.balance.belonging.faith;
  const id = choice === 'none' ? null : choice;
  const devotion = id === null ? 0 : rollScore(rng, f.household);
  return {
    household: { faith: id, devotion },
    faith: { id, strength: id === null ? 0 : Math.max(1, rollScore(rng, f.chosen)), raised: id, since: null, changes: 0 },
  };
}

/** A hidden pull toward another faith (or away from yours), to be found or lost later. */
export function rollLatentFaith(rng: RngState, content: ContentBundle, current: Id | null): { id: Id | null } | undefined {
  const f = content.balance.belonging.faith.latent;
  if (!chance(rng, f.chance)) return undefined;
  const options = [...weights(content, false, current === null ? 'nothing' : current)];
  if (current !== null) options.push([null, f.noneWeight] as const);
  const id = pickFaith(rng, options);
  return id === current ? undefined : { id };
}

const FAMILY_OF_HOUSEHOLD = new Set(['parent', 'stepparent', 'sibling', 'grandparent', 'relative']);

/**
 * A person's faith and how strongly they believe: what has been set down for
 * them, or, until then, worked out from the life's seed: your family has your
 * household's, with the usual chance of another; everyone else has the broad
 * mix. It is always the same for the same person.
 */
export function faithOf(state: LifeState, person: Person, content: ContentBundle): { id: Id | null; strength: number } {
  if (person.faith) return person.faith;
  const rng = createRng(`${state.seed}:faith:${person.id}`);
  const f = content.balance.belonging.faith;
  const rel = state.relationships[person.id];
  const h = state.belonging.household;
  if (rel && FAMILY_OF_HOUSEHOLD.has(rel.kind) && chance(rng, f.inherit)) {
    return { id: h.faith, strength: h.faith === null ? 0 : clampInt(Math.round(h.devotion + rollNormal(rng, { mean: 0, sd: f.strengthNoise })), 1, 100) };
  }
  const id = pickFaith(rng, weights(content, true));
  return { id, strength: id === null ? 0 : Math.max(1, rollScore(rng, f.household)) };
}

/** Sets a person's faith down (so it no longer depends on the seed). */
export function setPersonFaith(person: Person, id: Id | null, strength: number): void {
  person.faith = { id, strength: id === null ? 0 : clampInt(strength, 1, 100) };
}

/** Your children and grandchildren take your faith, at the chance a child takes a household's, when first met. */
export function stampChildFaith(state: LifeState, person: Person, rng: RngState, content: ContentBundle): void {
  if (person.faith) return;
  const f = content.balance.belonging.faith;
  const mine = state.belonging.faith;
  const takes = chance(rng, f.inherit);
  const id = takes ? mine.id : pickFaith(rng, weights(content, true, mine.id));
  setPersonFaith(person, id, id === null ? 0 : takes ? childStrength(rng, mine.strength, content) : rollScore(rng, f.chosen));
}

function ageCurve(points: readonly { at: number; x: number }[], at: number): number {
  const first = points[0]!;
  if (at <= first.at) return first.x;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (at <= b.at) return a.x + ((b.x - a.x) * (at - a.at)) / (b.at - a.at);
  }
  return points[points.length - 1]!.x;
}

/** Strength of belief moves, within 0 to 100 (and at least 1 while you have a faith). */
export function shiftStrength(state: LifeState, delta: number): void {
  const f = state.belonging.faith;
  if (f.id === null) return;
  f.strength = clampInt(f.strength + delta, 1, 100);
}

function faithHistory(state: LifeState, key: 'converted' | 'lostFaith' | 'foundFaith' | 'returnedFaith', religion: string, content: ContentBundle): void {
  writeFromGroup(state, content.text.belonging.history[key], ['belonging', 'faith', key], { values: { religion } }, content);
}

export type FaithChange = 'convert' | 'find' | 'lose' | 'return';

/** Your faith changes: set down with its year, and the pull you felt (if it was toward this) is spent. */
export function changeFaith(state: LifeState, to: Id | null, how: FaithChange, content: ContentBundle): void {
  const b = state.belonging;
  const f = b.faith;
  if (to !== null && !content.registries.belonging.faiths[to]) return;
  if (to === f.id) return;
  const start = content.balance.belonging.faith.start;
  f.id = to;
  f.strength = to === null ? 0 : how === 'find' ? start.find : how === 'return' ? start.return : start.convert;
  f.since = state.currentYear;
  f.changes += 1;
  if (state.character.latent.faith && state.character.latent.faith.id === to) delete state.character.latent.faith;
  delete state.discovery.surfaced.faith;
  const religion = faithName(content, to);
  faithHistory(state, to === null ? 'lostFaith' : how === 'return' ? 'returnedFaith' : how === 'find' ? 'foundFaith' : 'converted', religion, content);
}

/** The faith the pull you felt leads to, or undefined when there is none. */
export function acceptLatentFaith(state: LifeState, content: ContentBundle): void {
  const latent = state.character.latent.faith;
  if (!latent) return;
  const how: FaithChange = latent.id === null ? 'lose' : state.belonging.faith.id === null ? 'find' : 'convert';
  changeFaith(state, latent.id, how, content);
  delete state.character.latent.faith;
}

/** The yearly drift of belief: age, the congregation you keep (or don't), and a little chance. */
export function driftFaith(state: LifeState, content: ContentBundle): void {
  const f = state.belonging.faith;
  if (f.id === null) return;
  const bal = content.balance.belonging.faith;
  const age = state.character.age;
  let change = ageCurve(bal.drift.byAge, age) + (nextFloat(state.rng) * 2 - 1) * bal.drift.noise;
  if (age >= bal.community.fromAge || ownFaithMemberships(state, content).length > 0) {
    const own = ownFaithMemberships(state, content);
    if (own.length === 0) change += bal.community.without;
    else {
      const best = own.some((m) => m.commitment === 'committed') ? bal.community.committed : bal.community.casual;
      // A group's intensity deepens belief a little more.
      const g = instanceOf(state, own[0]!.groupId);
      change += best * (0.8 + (0.4 * (g?.intense ?? 50)) / 100);
    }
  }
  shiftStrength(state, wholeChange(state.rng, change));
}

/** "a Catholic", "no religion": a short phrase for lists and the profile. */
export function faithPhrase(state: LifeState, content: ContentBundle): string {
  const f = state.belonging.faith;
  return f.id === null ? content.registries.belonging.noneName : adherentName(content, f.id);
}

/** How strongly you believe, in words, from the wavering and devout lines. */
export function strengthWord(state: LifeState, content: ContentBundle): 'none' | 'wavering' | 'steady' | 'devout' {
  const f = state.belonging.faith;
  const b = content.balance.belonging.faith;
  if (f.id === null) return 'none';
  return f.strength <= b.wavering ? 'wavering' : f.strength >= b.devout ? 'devout' : 'steady';
}
