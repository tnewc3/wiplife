/**
 * The people fame brings (E6b): superfans, haters and critics, who are real
 * people in your life with memories and ties; a stalker, who is a superfan
 * who crossed the line and is dealt with through the legal system (a report,
 * an order, charges that run as any crime case among the people you know);
 * and the tabloids, which can turn a secret from the social web (E4) into
 * common knowledge once you are famous enough. Numbers: balance/fame.yaml.
 */
import type { ContentBundle, FameFanType } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { curveAt } from '../curve';
import { defaultLife } from '../lives/model';
import { clampInt } from '../random';
import { chance, pick, type RngState } from '../rng';
import { kindDef, reactionDelta } from '../web/knowledge';
import { inCircle } from '../web/ties';
import { enrollFan, fanAgeRange } from './fans';
import { writeFromGroup } from '../systems/history';
import { renderText } from '../text';
import type { Id, KnowledgeItem, LifeState } from '../types';
import { fanAlive, livePeople, moodBand } from './query';
import { fameHistory } from './ladder';

/** A new fan person: age and place follow the rules (a young star's fans are their own age; no fan is ever romantic). */
export function spawnFan(state: LifeState, type: FameFanType, content: ContentBundle, rng: RngState): Id | null {
  const id = createPerson(state, { kind: 'acquaintance', presence: 'city', age: fanAgeRange(state, type, content) }, rng, content);
  if (id === null) return null;
  enrollFan(state, id, type, content, rng);
  return id;
}

/** Fan people who have gone from your life (died, faded) are dropped from the lists; the cap and the yearly arrivals come from the balance. */
export function tendFans(state: LifeState, content: ContentBundle, rng: RngState): void {
  const f = state.fame;
  const b = content.balance.fame.people;
  for (const type of ['super', 'hater', 'critic'] as const) {
    f.people[type] = f.people[type].filter((id) => fanAlive(state, id));
  }
  if (!f.active || f.main === null) return;
  const fameNow = f.paths[f.main]!.fame;
  for (const type of ['super', 'hater', 'critic'] as const) {
    // A critic reviewing a child, or a hater of a child: the same chances, with peers (see spawnFan).
    if (f.people[type].length >= b.max) continue;
    let p = curveAt(b[type], fameNow);
    if (type === 'hater') p *= 1 + Math.max(0, 55 - f.mood) / 100;
    if (chance(rng, p)) spawnFan(state, type, content, rng);
  }
}

// ── The stalker ────────────────────────────────────────────────────────────

/** A superfan whose devotion turns to following you: an adult matter (nobody under 18 is stalked in the game). */
export function stalkerChance(state: LifeState, content: ContentBundle): number {
  const f = state.fame;
  if (!f.active || f.main === null || f.stalker !== null || state.character.age < content.balance.relationships.adultAge) return 0;
  if (livePeople(state, 'super').length === 0) return 0;
  const p = curveAt(content.balance.fame.people.stalk, f.paths[f.main]!.fame);
  // A mood of devotion feeds it.
  return p * (moodBand(f.mood) === 2 ? 1.5 : 1);
}

export function startStalker(state: LifeState, id: Id, content: ContentBundle): boolean {
  const f = state.fame;
  if (f.stalker !== null || !fanAlive(state, id) || state.character.age < content.balance.relationships.adultAge) return false;
  const person = state.people[id]!;
  if (!person.tags.includes('fan:stalker')) person.tags.push('fan:stalker');
  if (!f.people.super.includes(id)) f.people.super.push(id);
  state.relationships[id]!.memories.push({ tag: 'fan_stalker', year: state.currentYear });
  f.stalker = { id, since: state.currentYear, stage: 'watching' };
  f.totals.stalkers += 1;
  state.flags.fame_stalked = true;
  fameHistory(state, 'stalker', content);
  return true;
}

/** Charges against the stalker, as any crime case among the people you know: the existing legal system decides it (E3, lives/trouble.ts). */
function charge(state: LifeState, id: Id, content: ContentBundle): void {
  const person = state.people[id];
  const rel = state.relationships[id];
  if (!person || !rel || !content.offenses.stalking) return;
  const life = (person.life ??= defaultLife(state, person, rel, content));
  if (life.troubles.some((t) => t.kind === 'crime' && t.refId === 'stalking')) return;
  life.troubles.push({ kind: 'crime', refId: 'stalking', since: state.currentYear, severity: 0, treated: false, stage: 'held' });
}

/** You go to the police. They may charge the stalker. */
export function reportStalker(state: LifeState, content: ContentBundle, rng: RngState): void {
  const s = state.fame.stalker;
  if (!s || s.stage !== 'watching') return;
  s.stage = 'reported';
  if (chance(rng, content.balance.fame.stalker.charge)) {
    s.stage = 'charged';
    charge(state, s.id, content);
  }
}

/** A restraining order: it may be granted, and then a violation gets them charged. */
export function orderStalker(state: LifeState, content: ContentBundle, rng: RngState): void {
  const s = state.fame.stalker;
  if (!s || (s.stage !== 'watching' && s.stage !== 'reported')) return;
  if (chance(rng, content.balance.fame.stalker.order)) s.stage = 'ordered';
}

export function endStalker(state: LifeState): void {
  const s = state.fame.stalker;
  if (!s) return;
  const rel = state.relationships[s.id];
  if (rel && rel.status === 'active') rel.status = 'estranged';
  state.fame.stalker = null;
}

/** The yearly part of a stalker's year: the strain, whether they give up, a violation of an order, a case that has run its course. Returns whether things escalate (an event). */
export function stalkerYear(state: LifeState, content: ContentBundle, rng: RngState): 'escalates' | 'violates' | null {
  const f = state.fame;
  const s = f.stalker;
  if (!s) return null;
  const b = content.balance.fame.stalker;
  if (!fanAlive(state, s.id)) {
    f.stalker = null;
    return null;
  }
  state.character.stats.stress = clampInt(state.character.stats.stress + b.stress, 0, 100);
  if (s.stage === 'charged') {
    // The case runs its course in the legal system; once it has, they are out of your life.
    const troubles = state.people[s.id]?.life?.troubles ?? [];
    if (!troubles.some((t) => t.kind === 'crime' && t.refId === 'stalking')) endStalker(state);
    return null;
  }
  if (chance(rng, b.giveUp)) {
    endStalker(state);
    return null;
  }
  if (s.stage === 'ordered') {
    if (chance(rng, b.violate)) {
      s.stage = 'charged';
      charge(state, s.id, content);
      return 'violates';
    }
    return null;
  }
  return chance(rng, b.escalate) ? 'escalates' : null;
}

// ── The tabloids ───────────────────────────────────────────────────────────

const fullName = (state: LifeState) => `${state.character.name.first} ${state.character.name.last}`;

/** Adds a headline to the feed the news shows (the last few years are kept). */
export function addHeadline(state: LifeState, kind: string, content: ContentBundle, rng: RngState): string | null {
  const lines = content.text.fame.tabloid[kind.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? content.text.fame.tabloid.scandal;
  if (!lines || lines.length === 0) return null;
  const text = renderText(pick(rng, lines), { values: { name: fullName(state) } });
  const f = state.fame;
  f.headlines.push({ year: state.currentYear, text, kind });
  const keep = content.balance.fame.tabloids.keep;
  if (f.headlines.length > keep) f.headlines.splice(0, f.headlines.length - keep);
  return text;
}

/** The secrets about you that could still go public. */
export function exposableSecrets(state: LifeState, content: ContentBundle): KnowledgeItem[] {
  return state.web.items.filter((i) => i.subject === 'you' && !i.public && kindDef(content, i.kind)?.secret === true);
}

/** The yearly chance a secret about you goes public: only when you are famous enough and old enough. */
export function tabloidChance(state: LifeState, content: ContentBundle): number {
  const f = state.fame;
  const b = content.balance.fame.tabloids;
  if (!f.active || f.main === null || state.character.age < b.minAge) return 0;
  const fameNow = f.paths[f.main]!.fame;
  if (fameNow < b.minFame) return 0;
  return curveAt(b.chance, fameNow) + Math.max(0, 50 - f.image) * b.image;
}

/**
 * A secret about you goes public: everyone in your life hears the true story
 * at once, and how they feel about you moves with it (as when it spreads by
 * word of mouth, only all at once). Public image, fan mood and fame move too.
 * Returns the item's id.
 */
export function exposeSecret(state: LifeState, item: KnowledgeItem, content: ContentBundle, rng: RngState): Id | null {
  const def = kindDef(content, item.kind);
  const version = def?.versions[item.truth];
  if (!def || !version) return null;
  const f = state.fame;
  const h = content.balance.fame.tabloids.hit;
  item.public = true;
  for (const id of Object.keys(state.relationships).sort()) {
    if (!inCircle(state, id) || item.holders[id] || id === item.other) {
      if (item.holders[id]) item.holders[id]!.reacted = true;
      continue;
    }
    // (They saw it for themselves, in print: the same as seeing it, as far as who told them goes.)
    item.holders[id] = { version: item.truth, since: state.currentYear, from: 'saw', reacted: true };
    const rel = state.relationships[id]!;
    const delta = reactionDelta(version, rel.kind, content);
    rel.affection = clampInt(rel.affection + Math.round(delta.affection * 0.6), 0, 100);
    rel.trust = clampInt(rel.trust + Math.round(delta.trust * 0.6), 0, 100);
  }
  const severity = Math.min(1.5, (Math.abs(version.affection) + Math.abs(version.trust)) / 24);
  f.image = clampInt(f.image - h.image * severity, 0, 100);
  f.mood = clampInt(f.mood - h.mood * severity, 0, 100);
  if (f.main !== null) f.paths[f.main]!.fame = Math.min(f.paths[f.main]!.fame + h.fame, 99);
  f.totals.scandals += 1;
  addHeadline(state, item.kind, content, rng);
  writeFromGroup(state, content.text.fame.history.tabloid, ['fame', 'tabloid'], { values: { headline: f.headlines.at(-1)?.text ?? '' } }, content);
  return item.id;
}

/** The person who is closest to you among those who now know, for the event that follows. */
export function closestHolder(state: LifeState, item: KnowledgeItem): Id | undefined {
  const holders = Object.keys(item.holders).filter((id) => inCircle(state, id));
  return holders.sort((a, b) => {
    const ra = state.relationships[a]!;
    const rb = state.relationships[b]!;
    return rb.affection + rb.trust - (ra.affection + ra.trust) || (a < b ? -1 : 1);
  })[0];
}
