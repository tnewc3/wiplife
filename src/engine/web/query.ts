/**
 * Conditions about the social web (E4): the `heard` part of a role condition
 * and the `tie` condition. Kept free of other engine imports (but the
 * types) so the condition evaluator can use it.
 */
import type { Compare, ContentBundle, HeardCondition, TieCondition, TieStatusId } from '../../content/schemas';
import type { Id, KnowledgeItem, LifeState, Tie, WebState } from '../types';

/** A pseudo-role in a cast: the id of the knowledge item an event or interaction is about. Never a person. */
export const ITEM_ROLE = '@item';

/** The key a tie is kept under: the two ids in order, so it is the same from both sides. */
export function tieKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Whether this person is in a couple tie (dating or married) with someone you know. */
export function hasRomanticTie(web: WebState, id: Id): boolean {
  return Object.values(web.ties).some((t) => (t.a === id || t.b === id) && (t.kind === 'dating' || t.kind === 'married'));
}

/** The tie between two people, if they have one. */
export function getTie(web: WebState, a: Id, b: Id): Tie | undefined {
  return web.ties[tieKey(a, b)];
}

/** How a tie reads: feuding while it has a feud, otherwise by its affection. */
export function tieStatus(tie: Pick<Tie, 'affection' | 'feud'>, content: ContentBundle): TieStatusId {
  if (tie.feud) return 'feuding';
  const s = content.balance.web.ties.status;
  return tie.affection >= s.close ? 'close' : tie.affection < s.strained ? 'strained' : 'normal';
}

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

/** True when the tie between the two people meets the condition. */
export function tieHolds(q: TieCondition, state: LifeState, a: Id, b: Id, content: ContentBundle | undefined): boolean {
  const tie = getTie(state.web, a, b);
  if (!tie) return false;
  if (q.kind && !q.kind.includes(tie.kind)) return false;
  if (q.status) {
    if (!content || !q.status.includes(tieStatus(tie, content))) return false;
  }
  if (q.feudYears && !(tie.feud && within(state.currentYear - tie.feud.since, q.feudYears))) return false;
  if (q.sided !== undefined && (tie.feud?.side !== undefined) !== q.sided) return false;
  if (q.neutral !== undefined && (tie.feud?.neutral === true) !== q.neutral) return false;
  return true;
}

/** How a person came to know an item, for conditions: from you, by seeing it, or through gossip. */
export function learnedHow(from: string): 'you' | 'saw' | 'gossip' {
  return from === 'you' ? 'you' : from === 'saw' ? 'saw' : 'gossip';
}

/** The items about you that this person has heard, in id order. */
export function heardAboutYou(state: LifeState, holderId: Id): KnowledgeItem[] {
  return state.web.items.filter((item) => item.subject === 'you' && item.holders[holderId] !== undefined);
}

/** True when this person has heard something about you that meets the condition (of the one item, if `itemId`). */
export function heardHolds(q: HeardCondition, state: LifeState, holderId: Id, content: ContentBundle | undefined, itemId?: string): boolean {
  return heardAboutYou(state, holderId)
    .filter((item) => itemId === undefined || item.id === itemId)
    .some((item) => {
      const holder = item.holders[holderId]!;
      const def = content?.registries.web.kinds[item.kind as keyof ContentBundle['registries']['web']['kinds']];
      if (q.kinds && !q.kinds.includes(item.kind as never)) return false;
      if (q.versions && !q.versions.includes(holder.version)) return false;
      if (q.distorted !== undefined && (holder.version !== item.truth) !== q.distorted) return false;
      if (q.secret !== undefined && (def === undefined || def.secret !== q.secret)) return false;
      if (q.light !== undefined && (def?.versions[holder.version]?.light === true) !== q.light) return false;
      if (q.learned && !q.learned.includes(learnedHow(holder.from))) return false;
      if (q.fresh !== undefined && !holder.reacted !== q.fresh) return false;
      return true;
    });
}
