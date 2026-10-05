/**
 * Ties between the people you know (E4): who can be tied to whom, what a tie
 * starts at, and the rules the engine enforces whatever the content says:
 * both people alive and in your circle, one record for the pair (the same from
 * both sides), and a romance only between unrelated adults.
 */
import type { ContentBundle, TieKindId } from '../../content/schemas';
import { rollScore, type Spread } from '../random';
import { ageOf, attractedTo, isFamilyKind, isPartnerKind } from '../relationships';
import type { RngState } from '../rng';
import type { Id, LifeState, Person, Relationship, Tie, TieOrigin, WebState } from '../types';
import { getTie, hasRomanticTie, tieKey } from './query';

export const emptyWeb = (): WebState => ({ ties: {}, items: [], nextItem: 1, seen: [] });

/** A copy of the web that can be changed without touching the original (which may be frozen). */
export function cloneWeb(web: WebState): WebState {
  return JSON.parse(JSON.stringify(web)) as WebState;
}

/** True when this person is alive and still in your life: someone with a relationship that hasn't faded out. */
export function inCircle(state: LifeState, id: Id): boolean {
  const person = state.people[id];
  const rel = state.relationships[id];
  return person !== undefined && person.alive && rel !== undefined && rel.status !== 'ended';
}

/** The kinds a person can be to you for a friends tie between them (your friends and the people you go to school with). */
export const FRIEND_TIE_KINDS: readonly Relationship['kind'][] = ['friend', 'classmate'];

const PARENT_GENERATION: readonly Relationship['kind'][] = ['parent', 'stepparent'];

/**
 * Whether two people are related to each other, as far as the web can tell:
 * a family tie between them, or both being your family (your parents are
 * together, not related to each other, so that pair is the exception; and
 * your partner's kin are no kin of yours). Romance needs them unrelated.
 */
export function areRelated(state: LifeState, a: Id, b: Id): boolean {
  const tie = getTie(state.web, a, b);
  if (tie && (tie.kind === 'siblings' || tie.kind === 'parentChild')) return true;
  const ra = state.relationships[a];
  const rb = state.relationships[b];
  if (!ra || !rb || !isFamilyKind(ra.kind) || !isFamilyKind(rb.kind)) return false;
  if (PARENT_GENERATION.includes(ra.kind) && PARENT_GENERATION.includes(rb.kind)) return false;
  return true;
}

/**
 * Whether two people may become a couple (a dating or married tie): living
 * adults in your circle, unrelated, attracted to each other, neither your own
 * partner, fiancé or spouse, and neither with a partner of their own (off
 * your list, E3, or in another couple tie). The engine checks this whatever
 * the content says.
 */
export function mayBeCouple(state: LifeState, a: Id, b: Id, content: ContentBundle): boolean {
  if (a === b || !inCircle(state, a) || !inCircle(state, b)) return false;
  const pa = state.people[a]!;
  const pb = state.people[b]!;
  const { adultAge } = content.balance.relationships;
  if (ageOf(state, pa) < adultAge || ageOf(state, pb) < adultAge) return false;
  if (areRelated(state, a, b)) return false;
  const ra = state.relationships[a]!;
  const rb = state.relationships[b]!;
  if (isPartnerKind(ra.kind) || isPartnerKind(rb.kind)) return false;
  if (pa.life?.partner || pb.life?.partner) return false;
  if (hasRomanticTie(state.web, a) || hasRomanticTie(state.web, b)) return false;
  return attractedTo(pa.identity, pb.identity) && attractedTo(pb.identity, pa.identity);
}

/** How many ties a person has. */
export function tieCount(web: WebState, id: Id): number {
  let n = 0;
  for (const t of Object.values(web.ties)) if (t.a === id || t.b === id) n += 1;
  return n;
}

/** Whether two people can be given a (new) tie: both in your circle, no tie yet. */
export function canTie(state: LifeState, a: Id, b: Id): boolean {
  return a !== b && inCircle(state, a) && inCircle(state, b) && getTie(state.web, a, b) === undefined;
}

/** The kind of tie two friends can have. */
export function friendsMayTie(state: LifeState, a: Id, b: Id): boolean {
  const ra = state.relationships[a];
  const rb = state.relationships[b];
  return ra !== undefined && rb !== undefined && FRIEND_TIE_KINDS.includes(ra.kind) && FRIEND_TIE_KINDS.includes(rb.kind);
}

/** Starts a tie in `web` (the caller has checked that it may). Returns it. */
export function addTie(web: WebState, a: Id, b: Id, kind: TieKindId, affection: number, origin: TieOrigin, year: number): Tie {
  const [x, y] = a < b ? [a, b] : [b, a];
  const tie: Tie = { a: x, b: y, kind, affection, origin, since: year };
  web.ties[tieKey(a, b)] = tie;
  return tie;
}

/** A roll for the affection a new tie starts at. */
export function startAffection(rng: RngState, spread: Spread): number {
  return rollScore(rng, spread);
}

/**
 * Drops the ties and the holders of stories that point at people who are no
 * longer alive and in your circle. The year step does this itself; this is for
 * code that removes or kills people outside it (scenario builders in tests).
 */
export function pruneWeb(state: LifeState): void {
  for (const key of Object.keys(state.web.ties)) {
    const t = state.web.ties[key]!;
    if (!inCircle(state, t.a) || !inCircle(state, t.b)) delete state.web.ties[key];
  }
  for (const item of state.web.items) for (const id of Object.keys(item.holders)) if (!inCircle(state, id)) delete item.holders[id];
  state.web.items = state.web.items.filter((i) => i.subject === 'you' || inCircle(state, i.subject));
}

/** A person's age. */
export function age(state: LifeState, p: Person): number {
  return ageOf(state, p);
}

/**
 * Whether two people of these ages can be friends: adults with adults, and
 * minors with minors of about their age.
 */
export function agesFit(ageA: number, ageB: number, content: ContentBundle): boolean {
  const { adultAge } = content.balance.relationships;
  const adultA = ageA >= adultAge;
  const adultB = ageB >= adultAge;
  if (adultA !== adultB) return false;
  return adultA ? true : Math.abs(ageA - ageB) <= content.balance.web.ties.minorAgeGap;
}
