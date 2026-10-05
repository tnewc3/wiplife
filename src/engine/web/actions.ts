/**
 * What you (or an event) can do to the web (E4): the `tie`, `knowledge` and
 * `introduce` effects, the introductions and the stories a person can be
 * asked about (for the three new interactions), and noting that you have
 * accepted who you are, which is something that can be talked about.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { whereabouts } from '../presence';
import { ageOf } from '../relationships';
import { clampInt } from '../random';
import type { RngState } from '../rng';
import type { Id, KnowledgeItem, LifeState } from '../types';
import { findItem, isHushed, kindDef, leak, startItem, type KnowledgeCtx } from './knowledge';
import { ITEM_ROLE, getTie, heardAboutYou } from './query';
import { addTie, agesFit, canTie, inCircle, mayBeCouple, startAffection, tieCount } from './ties';

type Cast = Record<string, Id>;

const ctxOf = (state: LifeState, rng: RngState, content: ContentBundle): KnowledgeCtx => ({ cur: state, web: state.web, content, rng, year: state.currentYear });

/** The `tie` effect. */
export function applyTie(state: LifeState, effect: Extract<Effect, { type: 'tie' }>, cast: Cast, content: ContentBundle): void {
  const a = cast[effect.a];
  const b = cast[effect.b];
  if (a === undefined || b === undefined) return;
  const tie = getTie(state.web, a, b);
  if (!tie) return;
  const bal = content.balance.web.feud;
  switch (effect.action) {
    case 'side': {
      const side = cast[effect.with ?? ''];
      if (tie.feud && side !== undefined) {
        tie.feud.side = side;
        tie.feud.aware = true;
        delete tie.feud.neutral;
      }
      return;
    }
    case 'neutral':
      if (tie.feud && tie.feud.side === undefined) {
        tie.feud.neutral = true;
        tie.feud.aware = true;
      }
      return;
    case 'mend':
      tie.affection = clampInt(tie.affection + (effect.delta ?? 0), 0, 100);
      if (tie.feud && tie.affection >= bal.end) {
        delete tie.feud;
        tie.affection = Math.max(tie.affection, bal.endAffection);
      }
      return;
    case 'worsen':
      tie.affection = clampInt(tie.affection - (effect.delta ?? 0), 0, 100);
      if (!tie.feud && tie.affection < bal.start) tie.feud = { since: state.currentYear };
      return;
    case 'reconcile':
      if (tie.feud) {
        delete tie.feud;
        tie.affection = Math.max(tie.affection, bal.endAffection);
      }
      return;
  }
}

/** The item a `knowledge` effect is about: the one the event or interaction was cast with, or the most recent about you of the kind. */
function targetItem(state: LifeState, effect: Extract<Effect, { type: 'knowledge' }>, cast: Cast, holderId: Id): KnowledgeItem | undefined {
  const given = findItem(state.web, cast[ITEM_ROLE]);
  if (given) return given;
  if (effect.kind === undefined) return undefined;
  const items = state.web.items.filter((i) => i.kind === effect.kind && i.subject === 'you');
  return [...items].reverse().find((i) => i.holders[holderId]) ?? items[items.length - 1];
}

/** The `knowledge` effect. */
export function applyKnowledge(state: LifeState, effect: Extract<Effect, { type: 'knowledge' }>, cast: Cast, rng: RngState, content: ContentBundle): void {
  const ctx = ctxOf(state, rng, content);
  // You tell everyone you know: they all hear the true version from you.
  if (effect.action === 'announce') {
    const item = state.web.items.find((i) => i.kind === effect.kind && i.subject === 'you') ?? (effect.kind !== undefined ? startItem(ctx, effect.kind, 'you', undefined) : null);
    if (!item) return;
    for (const id of Object.keys(state.relationships)) {
      if (!inCircle(state, id) || state.relationships[id]!.status !== 'active') continue;
      const had = item.holders[id];
      item.holders[id] = { version: item.truth, since: had?.since ?? state.currentYear, from: had?.from ?? 'you', reacted: true };
    }
    return;
  }
  const holderId = effect.role === undefined ? undefined : cast[effect.role];
  if (holderId === undefined || !inCircle(state, holderId)) return;
  let item = targetItem(state, effect, cast, holderId);
  if (!item && effect.action === 'tell' && effect.kind !== undefined) item = startItem(ctx, effect.kind, 'you', undefined) ?? undefined;
  if (!item) return;
  const holder = item.holders[holderId];
  switch (effect.action) {
    case 'correct':
      if (holder) {
        holder.version = item.truth;
        holder.reacted = true;
      }
      return;
    case 'confirm':
    case 'tell':
      item.holders[holderId] = { version: item.truth, since: holder?.since ?? state.currentYear, from: holder?.from ?? 'you', reacted: true, ...(holder?.hushed !== undefined ? { hushed: holder.hushed } : {}) };
      return;
    case 'hush':
      if (holder) holder.hushed = state.currentYear;
      return;
    case 'leak':
      if (holder) leak(ctx, item, holderId);
      return;
  }
}

/**
 * Whether the two can be introduced to each other: both in your circle and in
 * your city (they have to meet), no tie yet, not too many ties already, and
 * adults with adults, minors with minors of about their age.
 */
export function mayIntroduce(state: LifeState, a: Id, b: Id, content: ContentBundle): boolean {
  if (!canTie(state, a, b)) return false;
  const cap = content.balance.web.ties.maxPerPerson;
  if (tieCount(state.web, a) >= cap || tieCount(state.web, b) >= cap) return false;
  if (state.relationships[a]!.status !== 'active' || state.relationships[b]!.status !== 'active') return false;
  for (const id of [a, b]) if (whereabouts(state, id, content) === 'elsewhere') return false;
  return agesFit(ageOf(state, state.people[a]!), ageOf(state, state.people[b]!), content);
}

/** The people you could introduce this person to, the ones you're closest to first. */
export function introduceCandidates(state: LifeState, personId: Id, content: ContentBundle): Id[] {
  if (!inCircle(state, personId)) return [];
  return Object.keys(state.relationships)
    .sort()
    .filter((id) => id !== personId && mayIntroduce(state, personId, id, content))
    .sort((x, y) => state.relationships[y]!.affection - state.relationships[x]!.affection || (x < y ? -1 : 1));
}

/** The `introduce` effect: starts the tie the result calls for (a couple only where the rules allow one; friends otherwise). */
export function applyIntroduce(state: LifeState, effect: Extract<Effect, { type: 'introduce' }>, cast: Cast, rng: RngState, content: ContentBundle): void {
  const a = cast[effect.role];
  const b = cast[effect.with];
  if (a === undefined || b === undefined || !mayIntroduce(state, a, b, content)) return;
  const start = content.balance.web.ties.introduced;
  const year = state.currentYear;
  if (effect.result === 'romance' && mayBeCouple(state, a, b, content)) {
    addTie(state.web, a, b, 'dating', startAffection(rng, start.romance), 'introduced', year);
    return;
  }
  const spread = effect.result === 'rivalry' ? start.rivalry : effect.result === 'feud' ? start.feud : start.friends;
  const tie = addTie(state.web, a, b, 'friends', startAffection(rng, spread), 'introduced', year);
  if (effect.result === 'feud') tie.feud = { since: year };
}

/** The stories this person has heard about you that the interaction is about: untrue versions, or secrets that you can still ask them to keep. */
export function topicItems(state: LifeState, personId: Id, topic: 'distorted' | 'secret', content: ContentBundle): KnowledgeItem[] {
  if (!inCircle(state, personId)) return [];
  return heardAboutYou(state, personId).filter((item) => {
    const holder = item.holders[personId]!;
    if (topic === 'distorted') return holder.version !== item.truth;
    return kindDef(content, item.kind)?.secret === true && !isHushed(holder, state.currentYear, content);
  });
}

/** Notes that you have accepted something about who you are: a fact that others may come to hear. One item for the year. */
export function noteIdentityAccepted(state: LifeState, rng: RngState, content: ContentBundle): void {
  const ctx = ctxOf(state, rng, content);
  if (state.web.items.some((i) => i.kind === 'identity' && i.year === state.currentYear)) return;
  startItem(ctx, 'identity', 'you', undefined);
}
