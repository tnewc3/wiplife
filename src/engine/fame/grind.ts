/**
 * The grind (Batch 4): what you do between years toward the coming one.
 *
 * - Practice: a generic system for any path that registers skills in its
 *   content (music: vocals, an instrument, songwriting, stage presence;
 *   Batch 5 adds a sport's). Sessions come from a yearly budget set by your
 *   commitment; each session raises one skill by less as it grows, and less
 *   for each session of that skill already this year; a share goes to craft.
 *   The skills a kind of work draws on add to its quality. Practice never
 *   touches your health: it causes no injury.
 * - Shows: up to a number a year, at the venue your rung gives. A show is
 *   rolled great, good or rough; it adds fans, a little fame and craft, costs
 *   stress, moves your bandmates' feelings and the band's chemistry, and pays
 *   through the yearly ledger as the next year begins.
 * - Tours: one a year, booked between years and on the road as the year
 *   begins, sized by how far up the ladder you are. It costs to put on and
 *   brings in money by fan mood (both through the ledger), wins fame and fans,
 *   and strains the people close to you, your stress and burnout.
 *
 * Numbers: balance/fame.yaml practice, shows and tours.
 */
import type { ContentBundle, FameInstrumentDef, FamePathDef, FameSkillDef, FameVenueDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { wholeDollars } from '../finance';
import { isIncarcerated } from '../legal';
import { clampInt, rollNormal, wholeChange } from '../random';
import { chance, type RngState } from '../rng';
import type { FameGrind, FamePathState, Id, LifeState, ShowResult, TourSize } from '../types';
import { bandQuality, moveBand } from './band';
import { fameHistory, hasGuardian } from './ladder';
import { emptyGrind, hasTalentFor, isMinorStar, pathDef, usualYear, workedPaths } from './query';
import { queueFameEvent } from './step';
import { aptitude } from './work';

export const TOUR_SIZES: readonly TourSize[] = ['local', 'regional', 'national', 'world'];

/** This year's grind, fresh if the one on record is from another year (writes). */
export function grindNow(state: LifeState): FameGrind {
  if (state.fame.grind.year !== state.currentYear) state.fame.grind = emptyGrind(state.currentYear);
  return state.fame.grind;
}

/** This year's grind as it reads (an empty one if the record is from another year). */
export function grindView(state: LifeState): FameGrind {
  return state.fame.grind.year === state.currentYear ? state.fame.grind : emptyGrind(state.currentYear);
}

// ── Practice ───────────────────────────────────────────────────────────────

/** A path's skills (none for a path that registers none). */
export function skillsOf(def: FamePathDef | undefined): readonly FameSkillDef[] {
  return def?.skills ?? [];
}

/** The instruments you can play in a path (band parts such as the lead vocals left out). */
export function instrumentsOf(def: FamePathDef | undefined): readonly FameInstrumentDef[] {
  return (def?.instruments ?? []).filter((i) => !i.partOnly);
}

/** Where a skill stands (a skill you have not touched starts low). */
export function skillLevel(path: FamePathState | undefined, skillId: Id, content: ContentBundle): number {
  return path?.skills?.[skillId] ?? content.balance.fame.practice.start;
}

/** The most a skill can reach for you: practice alone only takes you so far without a talent that fits. */
export function skillCap(state: LifeState, def: FamePathDef, content: ContentBundle): number {
  const c = content.balance.fame.practice.cap;
  return hasTalentFor(state, def) ? c.talent : c.none;
}

/** Practice sessions a year: by your commitment (under 18, at most a steady one's); an athlete with a club or travel team alongside gets a few more (Batch 5). */
export function practiceBudget(state: LifeState, content: ContentBundle): number {
  const b = content.balance.fame;
  const setting = isMinorStar(state, content) && state.fame.commitment === 'all' ? b.commitment.minorsMax : state.fame.commitment;
  const club = state.sports.club !== null && pathDef(content, state.fame.main)?.sport !== undefined ? content.balance.sports.training.club.sessions : 0;
  return b.practice.sessions[setting] + club;
}

export type PracticeBlock = 'inactive' | 'prison' | 'path' | 'skill' | 'instrument' | 'budget' | 'maxed';

/** Why you can't practise this skill now, or null. */
export function practiceBlock(state: LifeState, pathId: Id, skillId: Id, content: ContentBundle): PracticeBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (isIncarcerated(state)) return 'prison';
  const def = pathDef(content, pathId);
  const path = f.paths[pathId];
  if (!def || !path || !workedPaths(state).includes(pathId)) return 'path';
  const skill = skillsOf(def).find((s) => s.id === skillId);
  if (!skill) return 'skill';
  if (skill.instrument && (pathId !== f.main || f.instrument === null)) return 'instrument';
  if (grindView(state).practice >= practiceBudget(state, content)) return 'budget';
  if (skillLevel(path, skillId, content) >= skillCap(state, def, content)) return 'maxed';
  return null;
}

/** What one more session of this skill would add now (0 when it can't). Reads only. `multiplier`: Batch 5, where the session happens (a sport's team, gym or coach). */
export function practiceGain(state: LifeState, pathId: Id, skillId: Id, content: ContentBundle, multiplier = 1): number {
  const def = pathDef(content, pathId);
  const path = state.fame.paths[pathId];
  if (!def || !path) return 0;
  const p = content.balance.fame.practice;
  const level = skillLevel(path, skillId, content);
  const repeats = grindView(state).bySkill[skillId] ?? 0;
  const discipline = Math.max(0.5, 1 + (state.character.personality.discipline - 50) * p.discipline);
  const raw = curveAt(p.gain, level) * Math.pow(p.repeat, repeats) * discipline * (hasTalentFor(state, def) ? p.talent : 1) * multiplier;
  return Math.max(0, Math.min(skillCap(state, def, content) - level, raw));
}

/** One session: the skill rises (less each time), a share goes to craft. Returns the points gained. Never touches health. */
export function practise(state: LifeState, pathId: Id, skillId: Id, content: ContentBundle, multiplier = 1, craftShare = content.balance.fame.practice.craft): number {
  if (practiceBlock(state, pathId, skillId, content) !== null) return 0;
  const def = pathDef(content, pathId)!;
  const path = state.fame.paths[pathId]!;
  const gain = practiceGain(state, pathId, skillId, content, multiplier);
  const g = grindNow(state);
  path.skills = { ...(path.skills ?? {}), [skillId]: Math.round((skillLevel(path, skillId, content) + gain) * 10) / 10 };
  const q = content.balance.fame.quality;
  const craftCap = hasTalentFor(state, def) ? q.craftCap.talent : q.craftCap.none;
  if (path.craft < craftCap) path.craft = Math.min(craftCap, Math.round((path.craft + gain * craftShare) * 10) / 10);
  g.practice += 1;
  g.bySkill[skillId] = (g.bySkill[skillId] ?? 0) + 1;
  state.fame.totals.practice += 1;
  // Now and then the hours leave a story for the coming year.
  if (!def.sport && g.practice === practiceBudget(state, content) && chance(state.rng, 0.25)) queueFameEvent(state, 'practice', content, {}, state.currentYear + 1);
  return Math.round(gain * 10) / 10;
}

/** The mean of the skills a piece of work draws on (0 for work that draws on none). */
export function workSkill(path: FamePathState, skillIds: readonly Id[] | undefined, content: ContentBundle): number {
  if (!skillIds || skillIds.length === 0) return 0;
  return skillIds.reduce((sum, id) => sum + skillLevel(path, id, content), 0) / skillIds.length;
}

/** The quality points your practised skills add to a kind of work. */
export function skillQuality(path: FamePathState, skillIds: readonly Id[] | undefined, content: ContentBundle): number {
  return workSkill(path, skillIds, content) * content.balance.fame.practice.quality;
}

export type InstrumentBlock = 'inactive' | 'path' | 'unknown' | 'same';

/** Why you can't take up this instrument now, or null. */
export function instrumentBlock(state: LifeState, instrumentId: Id, content: ContentBundle): InstrumentBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  const def = pathDef(content, f.main);
  if (!def || !skillsOf(def).some((s) => s.instrument)) return 'path';
  if (!instrumentsOf(def).some((i) => i.id === instrumentId)) return 'unknown';
  if (f.instrument === instrumentId) return 'same';
  return null;
}

/** You take up an instrument; changing it keeps a share of what you could play. */
export function setInstrument(state: LifeState, instrumentId: Id, content: ContentBundle): void {
  const f = state.fame;
  const def = pathDef(content, f.main)!;
  const path = f.paths[f.main!]!;
  const skill = skillsOf(def).find((s) => s.instrument);
  if (f.instrument !== null && skill && path.skills?.[skill.id] !== undefined) {
    const p = content.balance.fame.practice;
    path.skills = { ...path.skills, [skill.id]: Math.round(Math.max(p.start, path.skills[skill.id]! * p.switchKeep) * 10) / 10 };
  }
  f.instrument = instrumentId;
  // In a band, you now play it (unless you are the singer).
  const band = f.band;
  if (band && band.part !== def.bands?.singer) band.part = instrumentId;
}

// ── Shows ──────────────────────────────────────────────────────────────────

/** The path you play shows in: the first of yours that has them. */
export function showPath(state: LifeState, content: ContentBundle): Id | null {
  return workedPaths(state).find((id) => pathDef(content, id)?.shows !== undefined) ?? null;
}

/** The venue your rung gives (the biggest one open to you). */
export function venueFor(def: FamePathDef, rung: number): FameVenueDef | undefined {
  return [...(def.shows?.venues ?? [])].filter((v) => v.minRung <= rung).sort((a, b) => b.minRung - a.minRung)[0];
}

export type ShowBlock = 'inactive' | 'prison' | 'path' | 'limit' | 'parent';

/** Why you can't play a show now, or null. */
export function showBlock(state: LifeState, content: ContentBundle): ShowBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (isIncarcerated(state)) return 'prison';
  const id = showPath(state, content);
  const def = pathDef(content, id);
  if (!id || !def || !venueFor(def, f.paths[id]!.rung)) return 'path';
  if (grindView(state).shows >= content.balance.fame.shows.perYear) return 'limit';
  if (isMinorStar(state, content) && !hasGuardian(state)) return 'parent';
  return null;
}

/** What a show pays before the cuts at a venue, at this outcome multiple (your share, in a band). */
export function showPay(state: LifeState, def: FamePathDef, rung: number, venue: FameVenueDef, mult: number, content: ContentBundle): number {
  const v = content.balance.fame.shows.venues[venue.id];
  if (!v) return 0;
  const cut = state.fame.band ? content.balance.fame.band.cut : 1;
  return wholeDollars(usualYear(state, def, rung, content) * v.pay * Math.max(0, mult) * cut);
}

/** The show you would play now and what a good night pays, for the screen. Reads only. */
export function showQuote(state: LifeState, content: ContentBundle): { pathId: Id; venue: FameVenueDef; pay: number } | null {
  const id = showPath(state, content);
  const def = pathDef(content, id);
  if (!id || !def) return null;
  const rung = state.fame.paths[id]!.rung;
  const venue = venueFor(def, rung);
  return venue ? { pathId: id, venue, pay: showPay(state, def, rung, venue, content.balance.fame.shows.outcome.good, content) } : null;
}

/** Plays a show: the roll, then fans, fame, craft, stress, the band, and the pay set aside for the ledger. The caller has checked showBlock. */
export function playShow(state: LifeState, content: ContentBundle, rng: RngState): ShowResult | null {
  if (showBlock(state, content) !== null) return null;
  const f = state.fame;
  const b = content.balance.fame;
  const s = b.shows;
  const id = showPath(state, content)!;
  const def = pathDef(content, id)!;
  const path = f.paths[id]!;
  const venue = venueFor(def, path.rung)!;
  const v = s.venues[venue.id];
  if (!v) return null;
  const score =
    s.base +
    s.aptitude * aptitude(state, def) +
    (hasTalentFor(state, def) ? s.talent : 0) +
    s.skills * workSkill(path, def.shows?.skills, content) +
    s.craft * path.craft +
    bandQuality(state, content) +
    rollNormal(rng, { mean: 0, sd: s.noise });
  const outcome: ShowResult['outcome'] = score >= s.bands.great ? 'great' : score >= s.bands.good ? 'good' : 'rough';
  const mult = s.outcome[outcome];
  const pay = showPay(state, def, path.rung, venue, mult, content);
  const fansAt = curveAt(b.gain.fansAt, path.fame);
  const fans = Math.max(0, Math.round(Math.max(v.fansFloor, fansAt * v.fans) * Math.max(0, mult) * (f.band ? b.band.showFans : 1)));
  const fame = Math.round(v.fame * mult * 10) / 10;
  f.fans += fans;
  path.fame = Math.max(0, Math.min(100, path.fame + fame));
  const q = b.quality;
  const craftCap = hasTalentFor(state, def) ? q.craftCap.talent : q.craftCap.none;
  if (path.craft < craftCap) path.craft = Math.min(craftCap, Math.round((path.craft + v.craft) * 10) / 10);
  const stats = state.character.stats;
  stats.stress = clampInt(stats.stress + wholeChange(rng, v.stress), 0, 100);
  if (outcome === 'great') stats.happiness = clampInt(stats.happiness + 1, 0, 100);
  if (f.band) moveBand(state, s.affection[outcome], s.chemistry[outcome], rng);
  const g = grindNow(state);
  g.shows += 1;
  g.showPay += pay;
  const result: ShowResult = { venue: venue.id, outcome, pay, fans, fame };
  g.lastShow = result;
  f.totals.shows += 1;
  path.last = Math.max(path.last, state.currentYear);
  // A night worth telling: an event as the coming year begins.
  if (chance(rng, s.event)) queueFameEvent(state, 'show', content, {}, state.currentYear + 1);
  return result;
}

// ── Tours ──────────────────────────────────────────────────────────────────

/** The size of tour your rung gives in a path: the biggest whose share of the ladder you have climbed. */
export function tourSizeFor(def: FamePathDef, rung: number, content: ContentBundle): TourSize {
  const sizes = content.balance.fame.tours.sizes;
  const share = def.rungs.length <= 1 ? 1 : (rung - 1) / (def.rungs.length - 1);
  let size: TourSize = 'local';
  for (const id of TOUR_SIZES) if (share >= sizes[id].from) size = id;
  return size;
}

export type TourBlock = 'inactive' | 'prison' | 'path' | 'rung' | 'booked' | 'parent';

/** Why you can't book a tour in this path now, or null. */
export function tourBlock(state: LifeState, pathId: Id, content: ContentBundle): TourBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (isIncarcerated(state)) return 'prison';
  const def = pathDef(content, pathId);
  const path = f.paths[pathId];
  if (!def || !path || def.sport || !workedPaths(state).includes(pathId)) return 'path';
  if (path.rung < def.tour.minRung) return 'rung';
  if (grindView(state).tour !== null) return 'booked';
  if (isMinorStar(state, content) && !hasGuardian(state)) return 'parent';
  return null;
}

/** What a tour would cost and bring in now (revenue at your fan mood), for the screen and the booking. Reads only. */
export function tourQuote(state: LifeState, pathId: Id, content: ContentBundle): { size: TourSize; cost: number; revenue: number } | null {
  const def = pathDef(content, pathId);
  const path = state.fame.paths[pathId];
  if (!def || !path) return null;
  const t = content.balance.fame.tours;
  const size = tourSizeFor(def, path.rung, content);
  const usual = usualYear(state, def, path.rung, content);
  const mood = t.mood.low + ((t.mood.high - t.mood.low) * state.fame.mood) / 100;
  return { size, cost: wholeDollars(usual * t.sizes[size].cost), revenue: wholeDollars(usual * t.sizes[size].revenue * mood) };
}

/** Books a tour for the coming year: its cost is set now and charged by the ledger as the year begins. */
export function bookTour(state: LifeState, pathId: Id, content: ContentBundle): boolean {
  if (tourBlock(state, pathId, content) !== null) return false;
  const quote = tourQuote(state, pathId, content)!;
  grindNow(state).tour = { path: pathId, size: quote.size, cost: quote.cost };
  return true;
}

export function cancelTour(state: LifeState): boolean {
  const g = grindNow(state);
  if (!g.tour) return false;
  g.tour = null;
  return true;
}

/** The kinds of people who count as close to you for fame's toll: your partner and children (and, while you are young, your parents). */
const CLOSE = ['partner', 'fiance', 'spouse', 'child', 'stepchild'];
const OTHERS = ['friend', 'sibling', 'parent', 'stepparent', 'grandparent', 'relative'];

/** The toll on the people around you: `close` affection lost by your partner and children (and a young star's parents), `other` by everyone else close. */
export function strainCircle(state: LifeState, close: number, other: number, content: ContentBundle, rng: RngState): void {
  const young = isMinorStar(state, content);
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    if (rel.status !== 'active' || state.people[id]?.alive !== true) continue;
    const isClose = CLOSE.includes(rel.kind) || (young && (rel.kind === 'parent' || rel.kind === 'stepparent'));
    if (!isClose && !OTHERS.includes(rel.kind)) continue;
    const loss = wholeChange(rng, isClose ? close : other);
    if (loss > 0) rel.affection = clampInt(rel.affection - loss, 0, 100);
  }
}

/** A tour booked last between years goes out as the year begins. Returns what it brought in and cost (for the ledger), or null if none went. */
export function runTour(state: LifeState, booked: NonNullable<FameGrind['tour']>, content: ContentBundle, rng: RngState): { revenue: number; cost: number; path: Id } | null {
  const f = state.fame;
  const def = pathDef(content, booked.path);
  const path = f.paths[booked.path];
  if (!f.active || !def || !path || def.sport || isIncarcerated(state)) return null;
  const b = content.balance.fame;
  const size = b.tours.sizes[booked.size];
  const quote = tourQuote(state, booked.path, content)!;
  const scale = b.gain.rung[Math.min(path.rung, b.gain.rung.length) - 1]!;
  path.fame = Math.max(0, Math.min(100, path.fame + size.fame * scale * b.gain.commitment[f.commitment]));
  f.fans = Math.round(f.fans * (1 + size.fans));
  strainCircle(state, size.close, size.other, content, rng);
  const stats = state.character.stats;
  stats.stress = clampInt(stats.stress + wholeChange(rng, size.stress), 0, 100);
  f.burnout = clampInt(f.burnout + size.burnout, 0, 100);
  path.last = state.currentYear;
  f.totals.tours += 1;
  fameHistory(state, 'tour', content, { tourNoun: tourNoun(def, booked.size, content) });
  return { revenue: quote.revenue, cost: booked.cost, path: booked.path };
}

/** "a regional tour", "a world book tour" (the size's word is in text; the noun is the path's). */
export function tourNoun(def: FamePathDef, size: TourSize, content: ContentBundle): string {
  const word = content.text.fame.tourSizes[size];
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word} ${def.tour.noun}`;
}
