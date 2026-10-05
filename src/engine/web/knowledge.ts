/**
 * Knowledge and gossip (E4). Notable things about you (and the people you
 * know) become knowledge items: what happened, which version is true, and
 * who has heard which version. A secret starts known only to whoever saw it.
 * Each year an item spreads from the people who know it to the people they
 * are tied to, weighted by closeness and each person's gossip tendency, and
 * each time it is passed on it may twist into a version the content defines.
 * People react to the version they believe: how they feel about the person
 * it is about changes, and the closest may come to you in an event (an
 * affair reaches your partner through the existing discovery events; being
 * outed through the coming-out reactions).
 *
 * The kinds, their versions and twists live in registries/web.yaml; every
 * number in balance/web.yaml.
 */
import type { ContentBundle, EventDef, KnowledgeKindDef, KnowledgeKindId, VersionDef, WebBalance } from '../../content/schemas';
import { fittingResults } from '../actions/result';
import { weightedPick } from '../random';
import { isPartnerKind } from '../relationships';
import { chance, nextInt, type RngState } from '../rng';
import { whereabouts } from '../presence';
import { renderText, type TextRole } from '../text';
import type { Holder, Id, KnowledgeItem, LifeState, Tie, WebState } from '../types';
import { gossipTendency } from '../lives/model';
import { ITEM_ROLE, tieKey, tieStatus } from './query';
import { inCircle } from './ties';

/** What the knowledge functions read and write: the life as it stands (a draft or a plain copy), the web being worked on, the generator. */
export interface KnowledgeCtx {
  /** Readable life; its `web` is `web`. */
  cur: LifeState;
  web: WebState;
  content: ContentBundle;
  rng: RngState;
  year: number;
}

export const kindDef = (content: ContentBundle, kind: string): KnowledgeKindDef | undefined =>
  content.registries.web.kinds[kind as KnowledgeKindId];

/** The item with this id. */
export function findItem(web: WebState, id: string | undefined): KnowledgeItem | undefined {
  return id === undefined ? undefined : web.items.find((i) => i.id === id);
}

/** Pronoun-free names for the text a version can use. */
function roleOf(state: LifeState, id: Id | undefined): TextRole | undefined {
  const p = id === undefined ? undefined : state.people[id];
  return p ? { name: p.name, pronouns: p.identity.pronouns } : undefined;
}

/** What a person has heard, as a phrase ("that you were fired for stealing"), for the person's page and for {heard}. */
export function heardText(state: LifeState, item: KnowledgeItem, version: string, content: ContentBundle): string {
  const def = kindDef(content, item.kind)?.versions[version];
  if (!def) return '';
  const template = item.subject === 'you' ? def.heard : def.heardAbout;
  if (template === undefined) return '';
  const c = state.character;
  const roles: Record<string, TextRole> = { self: { name: c.name, pronouns: c.identity.pronouns } };
  const other = roleOf(state, item.other);
  if (other) roles.other = other;
  const about = item.subject === 'you' ? undefined : roleOf(state, item.subject);
  if (about) roles.about = about;
  try {
    return renderText(template, { roles });
  } catch {
    // A story about someone who isn't in the life any more: nothing to say about it.
    return '';
  }
}

/** What this person has heard about you, as a phrase: from the item given, or the one they heard most recently. Empty if they have heard nothing. */
export function heardFor(state: LifeState, holderId: Id, itemId: string | undefined, content: ContentBundle): string {
  const items = state.web.items.filter((i) => i.subject === 'you' && i.holders[holderId] !== undefined);
  const item = (itemId !== undefined ? items.find((i) => i.id === itemId) : undefined) ?? [...items].sort((a, b) => b.holders[holderId]!.since - a.holders[holderId]!.since || (a.id < b.id ? 1 : -1))[0];
  return item ? heardText(state, item, item.holders[holderId]!.version, content) : '';
}

/** The version of a story a holder passes on: usually the one they believe, sometimes a twist of it. */
export function twisted(rng: RngState, def: KnowledgeKindDef, version: string, chanceOfTwist: number): string {
  const options = def.versions[version]?.twists.filter((t) => def.versions[t.to] !== undefined) ?? [];
  if (options.length === 0 || !chance(rng, chanceOfTwist)) return version;
  return weightedPick(rng, options.map((t) => [t.to, t.weight] as const));
}

/** The people who might have seen it first, by the kind's witness rule. */
function witnessCandidates(ctx: KnowledgeCtx, item: KnowledgeItem, who: KnowledgeKindDef['witness']['who']): Id[] {
  const { cur, web, content } = ctx;
  const circle = Object.keys(cur.relationships)
    .sort()
    .filter((id) => inCircle(cur, id));
  // Something about someone else: it is known by the people they are closest to.
  if (item.subject !== 'you') {
    const subject = item.subject;
    const near = Object.values(web.ties)
      .filter((t) => (t.a === subject || t.b === subject) && inCircle(cur, t.a === subject ? t.b : t.a))
      .sort((a, b) => b.affection - a.affection || (tieKey(a.a, a.b) < tieKey(b.a, b.b) ? -1 : 1))
      .map((t) => (t.a === subject ? t.b : t.a));
    return near;
  }
  switch (who) {
    case 'other':
      return item.other !== undefined && inCircle(cur, item.other) ? [item.other] : [];
    case 'household':
      return circle.filter((id) => whereabouts(cur, id, content) === 'household');
    case 'closest':
      return [...circle].sort((a, b) => {
        const ra = cur.relationships[a]!;
        const rb = cur.relationships[b]!;
        return rb.affection + rb.trust - (ra.affection + ra.trust) || (a < b ? -1 : 1);
      });
    case 'random': {
      const pool = [...circle];
      const out: Id[] = [];
      while (pool.length > 0) out.push(pool.splice(nextInt(ctx.rng, 0, pool.length - 1), 1)[0]!);
      return out;
    }
  }
}

/** Who knows a new item at first: the first `count` candidates, each with the kind's chance. */
function seedHolders(ctx: KnowledgeCtx, item: KnowledgeItem, def: KnowledgeKindDef): void {
  const w = def.witness;
  const candidates = witnessCandidates(ctx, item, w.who);
  let taken = 0;
  for (const id of candidates) {
    if (taken >= w.count) break;
    if (item.holders[id] || id === item.subject) continue;
    if (!chance(ctx.rng, w.chance)) continue;
    item.holders[id] = { version: item.truth, since: ctx.year, from: 'saw', reacted: true };
    taken += 1;
  }
}

/** Starts an item (the true version is `truth`, if the kind has it; else its first). Returns it, or null when the kind is unknown. */
export function startItem(ctx: KnowledgeCtx, kind: string, subject: 'you' | Id, detail: string | undefined, other?: Id): KnowledgeItem | null {
  const def = kindDef(ctx.content, kind);
  if (!def) return null;
  const truth = detail !== undefined && def.truths.includes(detail) ? detail : def.truths[0]!;
  const item: KnowledgeItem = { id: `k${ctx.web.nextItem}`, kind, subject, ...(other !== undefined ? { other } : {}), year: ctx.year, truth, holders: {} };
  ctx.web.nextItem += 1;
  ctx.web.items.push(item);
  seedHolders(ctx, item, def);
  capItems(ctx.web, ctx.content, item.id);
  return item;
}

/** Keeps the web within its cap: the oldest closed items go first (secrets last), never the one just made. */
function capItems(web: WebState, content: ContentBundle, keep: string): void {
  const cap = content.balance.web.knowledge.maxItems;
  const secret = (i: KnowledgeItem) => kindDef(content, i.kind)?.secret === true;
  while (web.items.length > cap) {
    const order = web.items.filter((i) => i.id !== keep).sort((a, b) => Number(secret(a)) - Number(secret(b)) || a.year - b.year || (a.id < b.id ? -1 : 1));
    if (order.length === 0) return;
    web.items.splice(web.items.indexOf(order[0]!), 1);
  }
}

/** Notes that this fact has become an item, once. */
function note(web: WebState, key: string, remember: number): boolean {
  if (web.seen.includes(key)) return false;
  web.seen.push(key);
  if (web.seen.length > remember) web.seen.splice(0, web.seen.length - remember);
  return true;
}

/** Whether an item of this kind about this subject is still being talked about. */
const hasActive = (web: WebState, kind: string, subject: 'you' | Id) => web.items.some((i) => i.kind === kind && i.subject === subject);

/**
 * Notices the notable things in your life and the lives of the people you
 * know that haven't become items yet, up to the year's cap. Reads the life
 * as it stands; each fact is recorded once (`web.seen`).
 */
export function detectItems(ctx: KnowledgeCtx): KnowledgeItem[] {
  const { cur, web, content, year } = ctx;
  const bal = content.balance.web.knowledge;
  const made: KnowledgeItem[] = [];
  const room = () => made.length < bal.newPerYear;
  const recent = year - 1;

  // About you.
  const kinds = content.registries.web.kinds;
  const affairTag = kinds.affair.sources.memory;
  if (affairTag) {
    for (const id of Object.keys(cur.relationships).sort()) {
      const rel = cur.relationships[id]!;
      const mem = rel.memories.find((m) => m.tag === affairTag && m.year >= recent);
      if (!mem || !room() || !note(web, `affair:${mem.year}:${id}`, bal.remember)) continue;
      const item = startItem(ctx, 'affair', 'you', undefined, id);
      if (item) made.push(item);
    }
  }
  for (const flag of kinds.unknownCrime.sources.flags) {
    const set = cur.flags[flag];
    if (!set || set === 0 || set === '' || !room()) continue;
    const unless = kinds.unknownCrime.sources.unless[flag];
    if (unless !== undefined && cur.flags[unless]) {
      note(web, `crime:${flag}`, bal.remember);
      continue;
    }
    if (!note(web, `crime:${flag}`, bal.remember)) continue;
    const item = startItem(ctx, 'unknownCrime', 'you', undefined);
    if (item) made.push(item);
  }
  const debts = cur.finances.debts.filter((d) => d.kind !== 'mortgage' && d.kind !== 'student');
  const owed = debts.reduce((sum, d) => sum + d.balance, 0);
  if (room() && !hasActive(web, 'hiddenDebt', 'you') && (debts.some((d) => d.kind === 'collections') || owed >= bal.detect.hiddenDebt) && owed > 0) {
    if (note(web, `debt:${Math.floor(year / bal.detect.debtRepeatYears)}`, bal.remember)) {
      const item = startItem(ctx, 'hiddenDebt', 'you', undefined);
      if (item) made.push(item);
    }
  }
  for (const h of cur.health.conditions) {
    const def = content.conditions[h.conditionId];
    if (!def || !room()) continue;
    if (def.kind === 'addiction' && h.severity >= bal.detect.addictionSeverity && note(web, `addiction:${h.conditionId}:${h.since}`, bal.remember)) {
      const item = startItem(ctx, 'addiction', 'you', undefined);
      if (item) made.push(item);
    } else if ((def.kind === 'illness' || def.kind === 'chronic') && h.since >= recent && h.severity >= bal.detect.illnessSeverity && note(web, `illness:${h.conditionId}:${h.since}`, bal.remember)) {
      const item = startItem(ctx, 'illness', 'you', undefined);
      if (item) made.push(item);
    }
  }
  for (const past of cur.career.history) {
    if (!room()) break;
    if ((past.endedBy === 'fired' || past.endedBy === 'laid_off') && past.toYear >= recent && note(web, `jobLoss:${past.toYear}:${past.jobId}`, bal.remember)) {
      const item = startItem(ctx, 'jobLoss', 'you', past.endedBy);
      if (item) made.push(item);
    }
  }
  for (const entry of cur.legal.record) {
    if (!room()) break;
    if (entry.outcome !== 'warning' && entry.year >= recent && note(web, `arrest:${entry.year}:${entry.offenseId}`, bal.remember)) {
      const item = startItem(ctx, 'arrest', 'you', undefined);
      if (item) made.push(item);
    }
  }
  for (const id of Object.keys(cur.relationships).sort()) {
    const rel = cur.relationships[id]!;
    if (!room()) break;
    if (rel.kind === 'ex' && rel.kindSince !== undefined && rel.kindSince >= recent && inCircle(cur, id) && note(web, `breakup:${rel.kindSince}:${id}`, bal.remember)) {
      const item = startItem(ctx, 'breakup', 'you', undefined, id);
      if (item) made.push(item);
    }
  }

  // About the people you know (the ones you follow closely).
  for (const id of Object.keys(cur.people).sort()) {
    if (!room()) break;
    const person = cur.people[id]!;
    const life = person.life;
    if (!life || !inCircle(cur, id) || life.tier === 'far' || person.child) continue;
    if (life.jobLost && life.jobLost.year >= recent && note(web, `jobLoss:${id}:${life.jobLost.year}`, bal.remember)) {
      const item = startItem(ctx, 'jobLoss', id, life.jobLost.how);
      if (item) made.push(item);
    }
    if (life.ended && life.ended.how !== 'widowed' && life.ended.year >= recent && note(web, `breakup:${id}:${life.ended.year}`, bal.remember)) {
      const item = startItem(ctx, 'breakup', id, undefined);
      if (item) made.push(item);
    }
    for (const t of life.troubles) {
      if (t.since < recent || !room()) continue;
      // (Secrets about other people aren't followed: only the news that has a way of being told about them.)
      const k: KnowledgeKindId | null = t.kind === 'crime' ? 'arrest' : t.kind === 'illness' && t.severity >= bal.detect.illnessSeverity ? 'illness' : null;
      if (k && note(web, `${k}:${id}:${t.refId}:${t.since}`, bal.remember)) {
        const item = startItem(ctx, k, id, undefined);
        if (item) made.push(item);
      }
    }
  }
  return made;
}

/** The affection and trust a version moves in someone who comes to believe it, scaled by what they are to you. */
export function reactionDelta(version: VersionDef, relationKind: string, content: ContentBundle): { affection: number; trust: number } {
  const scale = content.balance.web.knowledge.reaction.scale[relationKind as keyof WebBalance['knowledge']['reaction']['scale']] ?? 1;
  return { affection: Math.round(version.affection * scale), trust: Math.round(version.trust * scale) };
}

/** Everyone's ties, by person (built once a year). */
export function adjacency(web: WebState): Map<Id, Tie[]> {
  const adj = new Map<Id, Tie[]>();
  for (const key of Object.keys(web.ties).sort()) {
    const t = web.ties[key]!;
    for (const id of [t.a, t.b]) {
      const list = adj.get(id);
      if (list) list.push(t);
      else adj.set(id, [t]);
    }
  }
  return adj;
}

export interface Learned {
  item: KnowledgeItem;
  holderId: Id;
  /** The one who told them. */
  from: Id;
  /** The person told a hushed secret had been asked to keep it. */
  betrayal: boolean;
}

/**
 * One year of gossip: each holder tells up to a few of the people they are
 * tied to, by the closeness of the tie, their gossip tendency and (for
 * secrets, and for news about you) how much they care about you. A holder
 * you asked to keep it quiet tells almost nobody. Holders are read as the
 * year began, so a story doesn't cross the whole web in a year.
 */
export function spreadItems(ctx: KnowledgeCtx, adj: Map<Id, Tie[]>): Learned[] {
  const { cur, web, content, rng, year } = ctx;
  const bal = content.balance.web.knowledge;
  const sp = bal.spread;
  const learned: Learned[] = [];
  for (const item of web.items) {
    const def = kindDef(content, item.kind);
    if (!def) continue;
    for (const hid of Object.keys(item.holders).sort()) {
      const holder = item.holders[hid]!;
      if (holder.since === year && holder.from !== 'saw' && holder.from !== 'you') continue;
      if (!inCircle(cur, hid)) continue;
      const person = cur.people[hid]!;
      const tendency = person.life?.gossip ?? gossipTendency(person, content);
      const hushed = holder.hushed !== undefined && year - holder.hushed < sp.hushYears;
      let told = 0;
      for (const tie of adj.get(hid) ?? []) {
        if (told >= sp.perHolder) break;
        const other = tie.a === hid ? tie.b : tie.a;
        if (item.holders[other] || other === item.subject || !inCircle(cur, other)) continue;
        let p = sp.base * sp.closeness[tieStatus(tie, content)] * Math.max(0, 1 + sp.gossip * (tendency / 50 - 1));
        if (def.secret) p *= sp.secret;
        if (item.subject === 'you') {
          const rel = cur.relationships[hid]!;
          p *= 1 - sp.loyalty * ((rel.affection + rel.trust) / 200);
        }
        if (hushed) p *= sp.hushed;
        if (!chance(rng, Math.min(1, p))) continue;
        const version = twisted(rng, def, holder.version, def.secret ? bal.twist.secret : bal.twist.chance);
        item.holders[other] = { version, since: year, from: hid, reacted: false };
        learned.push({ item, holderId: other, from: hid, betrayal: hushed });
        told += 1;
      }
    }
  }
  return learned;
}

/** Items that have run their course go; past the cap, the oldest closed ones first. */
export function retireItems(ctx: KnowledgeCtx): void {
  const { web, content, year } = ctx;
  const bal = content.balance.web.knowledge;
  const secret = (i: KnowledgeItem) => kindDef(content, i.kind)?.secret === true;
  web.items = web.items.filter((i) => {
    if (!kindDef(content, i.kind)) return false;
    if (year - i.year > (secret(i) ? bal.expireYears.secret : bal.expireYears.rumor)) return false;
    // About someone who has left your life: nobody is talking about them.
    if (i.subject !== 'you' && !inCircle(ctx.cur, i.subject)) return false;
    return true;
  });
  capItems(web, content, '');
  // Holders who have left your circle (died, faded) no longer count.
  for (const i of web.items) {
    for (const hid of Object.keys(i.holders)) if (!inCircle(ctx.cur, hid)) delete i.holders[hid];
  }
}

export interface ReactionResult {
  /** Events queued (for the year's cap). */
  queued: number;
}

/** Reaction events that fit this person hearing this item: with their weights and the cast that goes with them. */
export function reactionOptions(ctx: KnowledgeCtx, item: KnowledgeItem, holderId: Id): (readonly [EventDef, number, Record<string, Id>])[] {
  const def = kindDef(ctx.content, item.kind);
  if (!def) return [];
  const out: (readonly [EventDef, number, Record<string, Id>])[] = [];
  for (const id of def.reactions) {
    const ev = ctx.content.events[id];
    if (!ev) continue;
    const cast: Record<string, Id> = {};
    let ok = true;
    for (const [role, spec] of Object.entries(ev.cast ?? {})) {
      if (role === 'npc') cast[role] = holderId;
      else if (role === 'other' && item.other !== undefined && inCircle(ctx.cur, item.other)) cast[role] = item.other;
      else if (spec.kind !== undefined && isPartnerKind(spec.kind)) cast[role] = holderId;
      else ok = false;
    }
    if (!ok) continue;
    cast[ITEM_ROLE] = item.id;
    for (const [d, weight] of fittingResults(ctx.cur, [id], cast, ctx.content)) out.push([d, weight, cast] as const);
  }
  return out;
}

/** Everyone a holder could tell (people tied to them who don't know yet). */
export function tellable(web: WebState, item: KnowledgeItem, holderId: Id, cur: LifeState): Id[] {
  return Object.values(web.ties)
    .filter((t) => t.a === holderId || t.b === holderId)
    .map((t) => (t.a === holderId ? t.b : t.a))
    .filter((id) => !item.holders[id] && id !== item.subject && inCircle(cur, id))
    .sort();
}

/** A holder tells one more person now (a leak): the version may twist. Returns who they told. */
export function leak(ctx: KnowledgeCtx, item: KnowledgeItem, holderId: Id): Id | undefined {
  const holder = item.holders[holderId];
  const def = kindDef(ctx.content, item.kind);
  if (!holder || !def) return undefined;
  const options = tellable(ctx.web, item, holderId, ctx.cur);
  if (options.length === 0) return undefined;
  const who = options[nextInt(ctx.rng, 0, options.length - 1)]!;
  const version = twisted(ctx.rng, def, holder.version, ctx.content.balance.web.knowledge.twist.chance);
  item.holders[who] = { version, since: ctx.year, from: holderId, reacted: false };
  return who;
}

/** Whether someone is a holder who has been asked to keep it quiet, and still is. */
export function isHushed(holder: Holder | undefined, year: number, content: ContentBundle): boolean {
  return holder?.hushed !== undefined && year - holder.hushed < content.balance.web.knowledge.spread.hushYears;
}

