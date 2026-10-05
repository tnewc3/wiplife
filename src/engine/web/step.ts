/**
 * The social web's yearly step (E4, year pipeline step 'web', after the
 * people's own lives and before pacing): ties are kept (a tie to someone who
 * has died or left your life ends), made (from the family's structure, when
 * your partner meets your people, between friends who share a city) and
 * drift, change and turn into feuds or end them; then what people know
 * spreads along the ties. Changes can ask something of you as an event (side
 * with someone, a mediation, a rumor that reached someone), counted in the
 * pacing budget like E3's requests, so the cap of six events a year holds.
 *
 * Reads go through the life as the earlier steps left it; the web is worked
 * on as a copy and written back at the end.
 */
import { isDraft, original } from 'immer';
import type { ContentBundle, EventDef, NewsKind, TieKindId, WebTrigger } from '../../content/schemas';
import { fittingResults } from '../actions/result';
import { curveAt } from '../curve';
import { clampInt, rollNormal, weightedPick } from '../random';
import { ageOf, isFamilyKind, isPartnerKind } from '../relationships';
import { chance, nextInt, pick } from '../rng';
import { lifeTextRole } from '../lives/model';
import { renderText } from '../text';
import type { Id, LifeState, Tie, WebState } from '../types';
import {
  adjacency,
  detectItems,
  kindDef,
  reactionDelta,
  reactionOptions,
  retireItems,
  spreadItems,
  type KnowledgeCtx,
  type Learned,
} from './knowledge';
import { ITEM_ROLE, getTie, tieStatus } from './query';
import { ensureStructure } from './structure';
import { addTie, agesFit, canTie, cloneWeb, FRIEND_TIE_KINDS, inCircle, mayBeCouple, startAffection, tieCount } from './ties';

interface Ctx extends KnowledgeCtx {
  /** The life being changed (an Immer draft inside beginYear). */
  state: LifeState;
  view: LifeState;
  /** Event candidates from ties, to be picked from at the end (lower `priority` goes first). */
  candidates: { trigger: WebTrigger; a: Id; b: Id; priority: number }[];
}

/** Adds a line to this year's news (in the E3 feed), if the feed has room and says it once. */
function addNews(ctx: Ctx, personId: Id, kind: NewsKind, otherId: Id): void {
  const { state, content, year } = ctx;
  const lines = content.text.news.lines[kind];
  const other = state.people[otherId];
  if (!lines || !other) return;
  const cap = content.balance.people.news.maxPerYear;
  let entry = state.news.find((n) => n.year === year);
  if (entry && (entry.lines.length >= cap || entry.lines.some((l) => l.personId === personId && l.kind === kind))) return;
  const role = lifeTextRole(ctx.cur, personId, content);
  if (!role) return;
  const text = renderText(pick(ctx.rng, lines), { roles: { npc: role }, values: { other: other.name.first } });
  if (!entry) {
    entry = { year, lines: [] };
    state.news.push(entry);
    state.news = state.news.slice(-content.balance.people.news.keepYears);
    entry = state.news.find((n) => n.year === year)!;
  }
  entry.lines.push({ personId, kind, text });
}

/** The one of the two the news is about: the one you are closer to. */
function closer(ctx: Ctx, a: Id, b: Id): Id {
  const ra = ctx.view.relationships[a]?.affection ?? 0;
  const rb = ctx.view.relationships[b]?.affection ?? 0;
  return rb > ra ? b : a;
}

function personKindness(state: LifeState, id: Id): number {
  return state.people[id]?.traits.kindness ?? 50;
}

/** Where a tie settles on its own: the kind's mean, higher for two kind people, lower for people who are unlike each other. */
function meanFor(ctx: Ctx, tie: Tie): number {
  const d = ctx.content.balance.web.ties.drift;
  const pa = ctx.view.people[tie.a]!;
  const pb = ctx.view.people[tie.b]!;
  const trait = (p: typeof pa, key: 'sociability' | 'discipline') => p.traits[key] ?? 50;
  const kind = (personKindness(ctx.view, tie.a) + personKindness(ctx.view, tie.b)) / 2 - 50;
  const unlike = Math.abs(trait(pa, 'sociability') - trait(pb, 'sociability')) + Math.abs(trait(pa, 'discipline') - trait(pb, 'discipline'));
  return Math.min(95, Math.max(5, d.means[tie.kind] + d.kindness * kind - d.unlike * (unlike / 2)));
}

function addCandidate(ctx: Ctx, trigger: WebTrigger, a: Id, b: Id): void {
  ctx.candidates.push({ trigger, a, b, priority: ctx.content.registries.web.priority.indexOf(trigger) });
}

// ── Making ties ───────────────────────────────────────────────────────────

/** Ties end when either person has died or left your circle. */
function pruneTies(ctx: Ctx): void {
  for (const key of Object.keys(ctx.web.ties)) {
    const t = ctx.web.ties[key]!;
    if (!inCircle(ctx.view, t.a) || !inCircle(ctx.view, t.b)) delete ctx.web.ties[key];
  }
}

/** Your partner meets your family and your friends. */
function partnerMeets(ctx: Ctx): void {
  const { view, web, content, rng, year } = ctx;
  const meet = content.balance.web.ties.meet;
  const cap = content.balance.web.ties.maxPerPerson;
  const ids = Object.keys(view.relationships).sort();
  for (const partnerId of ids) {
    const rel = view.relationships[partnerId]!;
    if (!isPartnerKind(rel.kind) || rel.status !== 'active' || !inCircle(view, partnerId)) continue;
    if (year - rel.since < meet.afterYears) continue;
    const committed = rel.kind === 'partner' ? 1 : meet.committed;
    const household = view.housing.partnerId === partnerId ? meet.household : 1;
    for (const id of ids) {
      if (id === partnerId || !inCircle(view, id)) continue;
      const k = view.relationships[id]!.kind;
      const tieKind: TieKindId | null = ['parent', 'stepparent', 'grandparent', 'sibling', 'relative'].includes(k) ? 'inLaw' : k === 'friend' ? 'friends' : null;
      if (!tieKind || getTie(web, partnerId, id)) continue;
      if (tieCount(web, id) >= cap || tieCount(web, partnerId) >= cap) continue;
      if (!chance(rng, Math.min(0.95, (tieKind === 'inLaw' ? meet.inLaw : meet.friends) * committed * household))) continue;
      addTie(web, partnerId, id, tieKind, startAffection(rng, content.balance.web.ties.start[tieKind]), 'partner', year);
      if (chance(rng, content.balance.web.events.formedChance)) addCandidate(ctx, 'partnerMet', partnerId, id);
    }
  }
}

/** Friends and classmates who live in the same city: a few pairs are drawn, and some become friends or even a couple. */
function contextTies(ctx: Ctx): void {
  const { view, web, content, rng, year } = ctx;
  const c = content.balance.web.ties.context;
  const cap = content.balance.web.ties.maxPerPerson;
  const pool = Object.keys(view.relationships)
    .sort()
    .filter((id) => view.relationships[id]!.status === 'active' && inCircle(view, id) && FRIEND_TIE_KINDS.includes(view.relationships[id]!.kind));
  if (pool.length < 2) return;
  let made = 0;
  const cur = { ...view, web };
  for (let i = 0; i < c.draws; i++) {
    const a = pool[nextInt(rng, 0, pool.length - 1)]!;
    const b = pool[nextInt(rng, 0, pool.length - 1)]!;
    if (made >= c.maxPerYear) break;
    if (a === b || !canTie(cur, a, b) || tieCount(web, a) >= cap || tieCount(web, b) >= cap) continue;
    const pa = view.people[a]!;
    const pb = view.people[b]!;
    if (pa.cityId !== pb.cityId) continue;
    const ageA = ageOf(view, pa);
    const ageB = ageOf(view, pb);
    if (!agesFit(ageA, ageB, content)) continue;
    if (mayBeCouple(cur, a, b, content) && Math.abs(ageA - ageB) <= content.balance.web.ties.couple.maxAgeGap && chance(rng, c.romance)) {
      addTie(web, a, b, 'dating', startAffection(rng, content.balance.web.ties.start.dating), 'context', year);
      addNews(ctx, closer(ctx, a, b), 'couple_formed', closer(ctx, a, b) === a ? b : a);
      if (chance(rng, content.balance.web.events.formedChance)) addCandidate(ctx, 'coupleFormed', a, b);
      made += 1;
    } else if (chance(rng, c.chance)) {
      addTie(web, a, b, 'friends', startAffection(rng, content.balance.web.ties.start.friends), 'context', year);
      made += 1;
    }
  }
}

/** Couples among the people you know: some marry, some split. */
function couples(ctx: Ctx): void {
  const { web, content, rng, year } = ctx;
  const c = content.balance.web.ties.couple;
  for (const key of Object.keys(web.ties).sort()) {
    const t = web.ties[key]!;
    if (t.kind !== 'dating' || t.since === year) continue;
    const years = year - (t.kindSince ?? t.since);
    if (chance(rng, curveAt(c.breakup, years))) {
      t.kind = 'friends';
      t.kindSince = year;
      t.affection = clampInt(t.affection - c.breakupDrop, 0, 100);
    } else if (years >= c.afterYears && chance(rng, c.marry)) {
      t.kind = 'married';
      t.kindSince = year;
      addNews(ctx, closer(ctx, t.a, t.b), 'couple_wed', closer(ctx, t.a, t.b) === t.a ? t.b : t.a);
      if (chance(rng, content.balance.web.events.formedChance)) addCandidate(ctx, 'coupleWed', t.a, t.b);
    }
  }
}

// ── Drift and feuds ───────────────────────────────────────────────────────

function driftAndFeuds(ctx: Ctx): void {
  const { state, web, content, rng, year } = ctx;
  const bal = content.balance.web;
  const adult = state.character.age >= bal.events.minAge;
  for (const key of Object.keys(web.ties).sort()) {
    const t = web.ties[key]!;
    const before = tieStatus(t, content);
    if (t.feud) {
      // Feuds don't pull back toward the mean: time heals them slowly.
      if (chance(rng, bal.feud.heal.chance)) t.affection = clampInt(t.affection + nextInt(rng, bal.feud.heal.min, bal.feud.heal.max), 0, 100);
      if (t.affection >= bal.feud.end) {
        delete t.feud;
        t.affection = Math.max(t.affection, bal.feud.endAffection);
        addNews(ctx, closer(ctx, t.a, t.b), 'feud_ended', closer(ctx, t.a, t.b) === t.a ? t.b : t.a);
        addCandidate(ctx, 'feudEnded', t.a, t.b);
        continue;
      }
      // Staying out of it costs you with both of them, each year (once it has come to your attention: a feud nobody told you about costs you nothing).
      if (adult && t.feud.since < year && t.feud.side === undefined && (t.feud.aware || t.feud.neutral)) {
        for (const id of [t.a, t.b]) {
          const rel = state.relationships[id];
          if (rel && rel.status === 'active') rel.affection = Math.max(0, rel.affection - bal.feud.neutralCost);
        }
      }
      if (year - t.feud.since >= bal.feud.mediateAfter && chance(rng, bal.feud.mediateChance)) addCandidate(ctx, 'feudLong', t.a, t.b);
      continue;
    }
    // Drift toward where this kind of tie settles, with a wobble, and now and then a shock.
    const mean = meanFor(ctx, t);
    let next = t.affection + bal.ties.drift.pull * (mean - t.affection) + rollNormal(rng, { mean: 0, sd: bal.ties.drift.sd });
    const shock = bal.ties.shock;
    if (chance(rng, shock.chance)) {
      next += chance(rng, shock.worse) ? -nextInt(rng, shock.fall.min, shock.fall.max) : nextInt(rng, shock.rise.min, shock.rise.max);
    }
    t.affection = clampInt(next, 0, 100);
    if (t.since < year && t.affection < bal.feud.start) {
      t.feud = { since: year };
      addNews(ctx, closer(ctx, t.a, t.b), 'feud_began', closer(ctx, t.a, t.b) === t.a ? t.b : t.a);
      if (chance(rng, bal.feud.sideChance)) addCandidate(ctx, 'feudBegan', t.a, t.b);
      continue;
    }
    const after = tieStatus(t, content);
    if (after === 'strained' && before !== 'strained' && chance(rng, bal.events.strainedChance)) addCandidate(ctx, 'tieStrained', t.a, t.b);
    else if (after === 'close' && before !== 'close' && chance(rng, bal.events.closeChance)) addCandidate(ctx, 'tieClose', t.a, t.b);
    // An introduction's follow-up: how it turned out.
    if (t.origin === 'introduced' && !t.followed && year - t.since >= bal.events.introFollowYears) {
      t.followed = true;
      if (chance(rng, bal.events.introChance)) {
        const couple = t.kind === 'dating' || t.kind === 'married';
        addCandidate(ctx, couple ? 'introducedCouple' : after === 'strained' ? 'introducedBadly' : after === 'close' ? 'introducedWell' : 'introducedWell', t.a, t.b);
      }
    }
  }
  // An introduction that went badly enough to be a feud right away.
  for (const key of Object.keys(web.ties).sort()) {
    const t = web.ties[key]!;
    if (t.origin === 'introduced' && t.feud && !t.followed && year - t.since >= bal.events.introFollowYears) {
      t.followed = true;
      if (chance(rng, bal.events.introChance)) addCandidate(ctx, 'introducedBadly', t.a, t.b);
    }
  }
}

// ── Events ────────────────────────────────────────────────────────────────

/** How many events are already due this year (requests from E3, discoveries and so on). */
function dueNow(state: LifeState): number {
  return state.scheduled.filter((s) => s.dueYear <= state.currentYear).length;
}

/** Whether the web can ask something of you this year: old enough, and not in prison. */
function open(ctx: Ctx): boolean {
  return ctx.view.character.age >= ctx.content.balance.web.events.minAge && ctx.view.housing.kind !== 'incarcerated';
}

/** The events a trigger can queue for this pair, in either order, that fit now. */
function tieOptions(ctx: Ctx, trigger: WebTrigger, a: Id, b: Id): (readonly [EventDef, Record<string, Id>, number])[] {
  const out: (readonly [EventDef, Record<string, Id>, number])[] = [];
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const cast = { a: x, b: y };
    for (const [def, weight] of fittingResults(ctx.cur, ctx.content.registries.web.triggers[trigger].events, cast, ctx.content)) {
      if (def.once && ctx.view.eventLog[def.id]) continue;
      const log = ctx.view.eventLog[def.id];
      if (def.cooldownYears && log && ctx.year - log.lastYear < def.cooldownYears) continue;
      out.push([def, cast, weight] as const);
    }
  }
  return out;
}

/** Picks from the year's tie candidates, most pressing first, up to the balance's maximum (and what the pacing budget has room for). */
function queueTieEvents(ctx: Ctx, room: number): number {
  const { state, content, year } = ctx;
  const bal = content.balance.web.events;
  let queued = 0;
  const order = [...ctx.candidates].sort((x, y) => x.priority - y.priority);
  const usedPeople = new Set<Id>();
  for (const cand of order) {
    if (queued >= Math.min(bal.maxPerYear, room)) break;
    const tie = getTie(ctx.web, cand.a, cand.b);
    if (!tie || usedPeople.has(cand.a) || usedPeople.has(cand.b)) continue;
    const feudTrigger = cand.trigger === 'feudBegan';
    if (!feudTrigger && tie.eventYear !== undefined && year - tie.eventYear < bal.tieCooldownYears) continue;
    const options = tieOptions(ctx, cand.trigger, cand.a, cand.b);
    if (options.length === 0) continue;
    const [def, cast] = weightedPick(ctx.rng, options.map((o) => [o, o[2]] as const));
    state.scheduled.push({ eventId: def.id, dueYear: year, cast });
    tie.eventYear = year;
    if (tie.feud) tie.feud.aware = true;
    usedPeople.add(cand.a);
    usedPeople.add(cand.b);
    queued += 1;
  }
  return queued;
}

/** A person's standing for coming to you first: your partner, then family, then friends, then the rest. */
function closeness(state: LifeState, id: Id): number {
  const k = state.relationships[id]?.kind;
  if (k === undefined) return 4;
  if (isPartnerKind(k)) return 0;
  if (isFamilyKind(k)) return 1;
  return k === 'friend' ? 2 : 3;
}

/** Removes the follow-ups the old way of finding out would bring, once a partner has found out another way. */
function dropInfidelityFollowUps(state: LifeState, holder: Id, content: ContentBundle): void {
  const ids = new Set([...content.registries.interactions.infidelity.flirt.events, ...content.registries.interactions.infidelity.intimate.events]);
  state.scheduled = state.scheduled.filter((s) => !(ids.has(s.eventId) && Object.values(s.cast).includes(holder)));
}

/**
 * What people make of what they heard: how they feel about the person it is
 * about changes with the version they believe, and the closest may come to
 * you about it as an event (up to the balance's maximum a year).
 */
function reactions(ctx: Ctx, learned: Learned[]): void {
  const { state, view, web, content, year } = ctx;
  const bal = content.balance.web.knowledge.reaction;
  const reacting: { learned: Learned; weight: number }[] = [];
  for (const l of learned) {
    const holder = l.item.holders[l.holderId];
    const def = kindDef(content, l.item.kind);
    const version = def?.versions[holder?.version ?? ''];
    if (!holder || !def || !version) continue;
    holder.reacted = true;
    if (l.item.subject === 'you') {
      const rel = state.relationships[l.holderId];
      const delta = reactionDelta(version, rel?.kind ?? 'acquaintance', content);
      if (rel) {
        rel.affection = clampInt(rel.affection + delta.affection, 0, 100);
        rel.trust = clampInt(rel.trust + delta.trust, 0, 100);
      }
      reacting.push({ learned: l, weight: Math.abs(delta.affection) + Math.abs(delta.trust) });
    } else {
      const tie = getTie(web, l.holderId, l.item.subject);
      if (tie) tie.affection = clampInt(tie.affection + Math.round(version.affection * bal.aboutOthers), 0, 100);
    }
  }
  if (!open(ctx)) return;
  const order = reacting.sort((x, y) => closeness(view, x.learned.holderId) - closeness(view, y.learned.holderId) || y.weight - x.weight || (x.learned.holderId < y.learned.holderId ? -1 : 1));
  let queued = 0;
  for (const r of order) {
    if (queued >= bal.maxEvents) break;
    if (!chance(ctx.rng, bal.eventChance)) continue;
    const options = reactionOptions(ctx, r.learned.item, r.learned.holderId);
    if (options.length === 0) continue;
    const [def, , cast] = weightedPick(ctx.rng, options.map((o) => [o, o[1]] as const));
    // A partner who finds out this way doesn't find out again the old way.
    if (r.learned.item.kind === 'affair') dropInfidelityFollowUps(state, r.learned.holderId, content);
    state.scheduled.push({ eventId: def.id, dueYear: year, cast });
    queued += 1;
  }
  // Someone who was asked to keep it quiet told: you hear about it (these count apart from the reactions, up to the same maximum).
  let betrayed = 0;
  for (const l of learned.filter((x) => x.betrayal && x.item.subject === 'you')) {
    if (betrayed >= bal.maxEvents) break;
    const ev = content.registries.web.triggers.betrayed.events
      .flatMap((id) => fittingResults(ctx.cur, [id], { npc: l.from, [ITEM_ROLE]: l.item.id }, content))
      .map(([d, w]) => [d, w] as const);
    if (ev.length === 0) continue;
    const def = weightedPick(ctx.rng, ev);
    state.scheduled.push({ eventId: def.id, dueYear: year, cast: { npc: l.from, [ITEM_ROLE]: l.item.id } });
    betrayed += 1;
  }
}

/** A secret that most of your circle now knows has become common knowledge: one event, once. */
function publicSecrets(ctx: Ctx): void {
  const { state, view, web, content, year } = ctx;
  if (!open(ctx)) return;
  const bal = content.balance.web.knowledge.reaction;
  const circle = Object.keys(view.relationships).filter((id) => inCircle(view, id)).length;
  for (const item of web.items) {
    if (item.public || item.subject !== 'you' || !kindDef(content, item.kind)?.secret) continue;
    const holders = Object.keys(item.holders).filter((id) => inCircle(view, id));
    if (holders.length < Math.max(bal.publicMin, Math.ceil(bal.publicShare * circle))) continue;
    item.public = true;
    const npc = [...holders].sort((x, y) => closeness(view, x) - closeness(view, y) || (x < y ? -1 : 1))[0]!;
    const options = content.registries.web.triggers.public.events.flatMap((id) => fittingResults(ctx.cur, [id], { npc, [ITEM_ROLE]: item.id }, content));
    if (options.length === 0) continue;
    const def = weightedPick(ctx.rng, options.map(([d, w]) => [d, w] as const));
    state.scheduled.push({ eventId: def.id, dueYear: year, cast: { npc, [ITEM_ROLE]: item.id } });
  }
}

/** Step 'web': keep, make and change the ties, then let what people know travel along them. */
export function runWeb(state: LifeState, content: ContentBundle): void {
  const view = isDraft(state) ? (original(state) as LifeState) : state;
  const web: WebState = cloneWeb(view.web);
  const year = state.currentYear;
  const ctx: Ctx = { state, view, cur: { ...view, web }, web, content, rng: state.rng, year, candidates: [] };

  pruneTies(ctx);
  ensureStructure(view, web, state.rng, content, year);
  partnerMeets(ctx);
  contextTies(ctx);
  couples(ctx);
  driftAndFeuds(ctx);

  // What people know: new facts, gossip, how people take it.
  detectItems(ctx);
  const learned = spreadItems(ctx, adjacency(web));
  retireItems(ctx);
  reactions(ctx, learned.filter((l) => web.items.includes(l.item)));
  publicSecrets(ctx);

  if (open(ctx)) queueTieEvents(ctx, Math.max(0, content.balance.pacing.cap - dueNow(state)));
  writeBack(state, view.web, web);
}

/**
 * Writes the changes to the web into the life, tie by tie and item by item, so
 * what didn't change stays as it was (cheaper for the draft to finish, and for
 * the state to be frozen).
 */
function writeBack(state: LifeState, before: WebState, after: WebState): void {
  const target = state.web;
  for (const key of Object.keys(target.ties)) if (!after.ties[key]) delete target.ties[key];
  for (const [key, tie] of Object.entries(after.ties)) {
    const was = before.ties[key];
    if (!was || JSON.stringify(was) !== JSON.stringify(tie)) target.ties[key] = tie;
  }
  if (JSON.stringify(before.items) !== JSON.stringify(after.items)) target.items = after.items;
  if (before.nextItem !== after.nextItem) target.nextItem = after.nextItem;
  if (before.seen.length !== after.seen.length || before.seen[before.seen.length - 1] !== after.seen[after.seen.length - 1]) target.seen = after.seen;
}
