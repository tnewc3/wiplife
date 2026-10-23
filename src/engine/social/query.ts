/**
 * Social media (Batch 8): small read-only helpers the whole engine shares:
 * the empty state, the platforms and niches, who counts as a creator, what an
 * account may post in a year, reach, the words for followers, the handle you
 * type, and the creators among the people you know. Numbers: balance/social.yaml;
 * platforms and niches: src/content/platforms and niches.
 */
import type { ContentBundle, SocialNicheDef, SocialPlatformDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { countryOf } from '../country';
import { isMinorStar } from '../fame/query';
import { ageOf } from '../relationships';
import type { Id, LifeState, SocialAccount, SocialIncome, SocialState, SocialTotals, SocialYear } from '../types';
import { inCircle } from '../web/ties';

export const emptySocialYear = (year: number): SocialYear => ({ year, posts: {}, quality: {}, bold: 0, risky: {}, viral: [], crossed: [], collabs: [], promoted: [] });
export const emptySocialIncome = (year: number): SocialIncome => ({ year, gross: 0, agent: 0, trust: 0, byPlatform: {}, byModel: {} });
export const emptySocialTotals = (): SocialTotals => ({
  opened: 0,
  posts: 0,
  viral: 0,
  algorithmUp: 0,
  algorithmDown: 0,
  demonetized: 0,
  monetized: 0,
  burnouts: 0,
  controversies: 0,
  cancellations: 0,
  collabs: 0,
  crossPromos: 0,
  promos: 0,
  sponsorships: 0,
  foundEmployer: 0,
  foundPartner: 0,
  foundEx: 0,
  foundFamily: 0,
  earned: 0,
});
export const emptySocial = (year = 0): SocialState => ({
  accounts: {},
  year: emptySocialYear(year),
  income: emptySocialIncome(year),
  algorithm: { year: 0, shifts: {} },
  controversy: null,
  happened: { year: 0, triggers: [] },
  focus: null,
  streak: 0,
  workedYear: 0,
  totals: emptySocialTotals(),
});

/** The platforms in the game, by id. */
export function platformList(content: ContentBundle): SocialPlatformDef[] {
  return Object.keys(content.platforms)
    .sort()
    .map((id) => content.platforms[id]!)
    .filter((p) => !p.retired);
}

export function platformOf(content: ContentBundle, id: Id | undefined): SocialPlatformDef | undefined {
  const def = id === undefined ? undefined : content.platforms[id];
  return def && !def.retired ? def : undefined;
}

export function nicheList(content: ContentBundle): SocialNicheDef[] {
  return Object.keys(content.niches)
    .sort()
    .map((id) => content.niches[id]!)
    .filter((n) => !n.retired);
}

/** Your accounts, in platform id order. */
export function accountList(state: LifeState): SocialAccount[] {
  return Object.keys(state.social.accounts)
    .sort()
    .map((id) => state.social.accounts[id]!);
}

/** You are working as a creator: a career in the social media path (as your main path or your second). */
export function isCreator(state: LifeState): boolean {
  const f = state.fame;
  return f.active && (f.main === 'social' || f.second === 'social') && f.paths.social !== undefined;
}

/** The year's record as it reads now (an empty one if the record is from another year). */
export function yearView(state: LifeState): SocialYear {
  return state.social.year.year === state.currentYear ? state.social.year : emptySocialYear(state.currentYear);
}

/** This year's record, fresh if the one on record is from another year (writes). */
export function yearNow(state: LifeState): SocialYear {
  if (state.social.year.year !== state.currentYear) state.social.year = emptySocialYear(state.currentYear);
  return state.social.year;
}

/** The posts made this year on a platform. */
export function postsThisYear(state: LifeState, platformId: Id): number {
  return yearView(state).posts[platformId] ?? 0;
}

/** How many posts, uploads, streams or episodes a platform's account can have this year: the model's budget, less for a casual account and for anyone under 18. */
export function platformBudget(state: LifeState, platform: SocialPlatformDef, content: ContentBundle): number {
  const b = content.balance.social;
  let share = isCreator(state) ? 1 : b.budget.casualShare;
  if (isMinorStar(state, content)) share *= b.budget.minorShare;
  return Math.max(1, Math.round(b.growth[platform.growth].posts * share));
}

/** What engagement does to pay, brand money and reach. */
export function engagementFactor(engagement: number, content: ContentBundle): number {
  return curveAt(content.balance.social.engagement.factor, engagement);
}

/** Your reach: followers weighted by platform and engagement (private accounts count for nothing). */
export function reachOf(state: LifeState, content: ContentBundle): number {
  const b = content.balance.social;
  let reach = 0;
  for (const a of accountList(state)) {
    if (a.private) continue;
    const w = b.platforms[a.platform]?.reach ?? 0;
    reach += a.followers * w * engagementFactor(a.engagement, content);
  }
  return Math.round(reach);
}

/** All your followers, on every platform. */
export function totalFollowers(state: LifeState): number {
  return accountList(state).reduce((sum, a) => sum + a.followers, 0);
}

/** The account with the most followers, or undefined. */
export function topAccount(state: LifeState): SocialAccount | undefined {
  return [...accountList(state)].sort((a, b) => b.followers - a.followers || (a.platform < b.platform ? -1 : 1))[0];
}

/** The account an event is about: the platform the social step named this year, else your biggest. */
export function focusAccount(state: LifeState): SocialAccount | undefined {
  const f = state.social.focus;
  const named = f && f.year === state.currentYear ? state.social.accounts[f.platform] : undefined;
  return named ?? topAccount(state);
}

/** What a number of followers reads as, in words. */
export function followerWords(count: number, content: ContentBundle): string {
  const lines = content.text.social.followers;
  let text = lines[0]!.text;
  for (const l of lines) if (count >= l.from) text = l.text;
  return text;
}

/** What an engagement reads as, in words. */
export function engagementWords(engagement: number, content: ContentBundle): string {
  const lines = content.text.social.engagement;
  let text = lines[0]!.text;
  for (const l of lines) if (engagement >= l.from) text = l.text;
  return text;
}

/** How a number of followers is written: 1,234. */
export function followerNumber(count: number): string {
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The youngest age you can join a platform at, where you live. */
export function joinAge(state: LifeState, platform: SocialPlatformDef, content: ContentBundle): number {
  const b = content.balance.social.age;
  const country = countryOf(state, content).id;
  return Math.max(platform.minAge, b.byCountry[country] ?? b.default);
}

/** A parent or guardian who can keep an eye on an account you are too young to hold alone. */
export function parentPresent(state: LifeState): boolean {
  if (state.housing.guardianId !== undefined) return true;
  return Object.values(state.relationships).some((r) => (r.kind === 'parent' || r.kind === 'stepparent') && r.status === 'active' && state.people[r.personId]?.alive === true);
}

// ── Handles ─────────────────────────────────────────────────────────────────

export type HandleIssue = 'empty' | 'short' | 'long' | 'chars' | 'edges' | 'repeat' | 'digits' | 'reserved' | 'blocked';

/** What is wrong with a handle you typed, or null. A leading @ is ignored, and capitals are lowered. */
export function handleIssue(raw: unknown, content: ContentBundle): HandleIssue | null {
  if (typeof raw !== 'string') return 'empty';
  const h = raw.trim().replace(/^@/, '').toLowerCase();
  const b = content.balance.social.handle;
  if (h.length === 0) return 'empty';
  if (h.length < b.min) return 'short';
  if (h.length > b.max) return 'long';
  if (!/^[a-z0-9._]+$/.test(h)) return 'chars';
  if (/^[._]|[._]$/.test(h)) return 'edges';
  if (/[._]{2}/.test(h)) return 'repeat';
  if (/^[0-9]+$/.test(h)) return 'digits';
  const t = content.text.social;
  if (t.reserved.includes(h)) return 'reserved';
  const plain = h.replace(/[^a-z]/g, '');
  if (t.blocked.some((w) => plain.includes(w))) return 'blocked';
  return null;
}

/** The handle as it is kept (trimmed, without @, lower case), or null when it isn't allowed. */
export function parseHandle(raw: unknown, content: ContentBundle): string | null {
  return handleIssue(raw, content) === null ? (raw as string).trim().replace(/^@/, '').toLowerCase() : null;
}

/** A 32-bit hash of a string (FNV-1a), the same on every device. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A handle suggestion, the same every time for the same life, name and `n` (it draws nothing from the generator). */
export function handleSuggestion(state: LifeState, content: ContentBundle, n = 0): string {
  const words = content.text.social.handleWords;
  const h = hashOf(`${state.seed}:handle:${state.character.name.first}:${n}`);
  const first = words.first[h % words.first.length]!;
  const second = words.second[Math.floor(h / 7919) % words.second.length]!;
  const digits = (Math.floor(h / 104729) % 90) + 10;
  return `${first}${second}${digits}`;
}

// ── Niches ──────────────────────────────────────────────────────────────────

/** How well your traits and stats fit a niche (0–1). */
export function nicheFit(state: LifeState, niche: SocialNicheDef): number {
  const c = state.character;
  let total = 0;
  let weights = 0;
  for (const [key, weight] of Object.entries(niche.fit)) {
    if (weight === undefined) continue;
    const value = key in c.stats ? c.stats[key as keyof typeof c.stats] : c.personality[key as keyof typeof c.personality];
    total += weight * value;
    weights += weight;
  }
  return weights === 0 ? 0.5 : total / weights / 100;
}

/** The niche that suits you best (ties go to the first by id). */
export function bestNiche(state: LifeState, content: ContentBundle): SocialNicheDef {
  const list = nicheList(content);
  return list.reduce((best, n) => (nicheFit(state, n) > nicheFit(state, best) ? n : best), list[0]!);
}

// ── Creators among the people you know ─────────────────────────────────────

const COLLAB_KINDS: readonly string[] = ['friend', 'classmate', 'coworker', 'acquaintance', 'sibling', 'relative'];

/** Whether someone you know makes content, and how many followers they have. The same every time for the same life and person. */
export function creatorFollowers(state: LifeState, personId: Id, content: ContentBundle): number | null {
  const b = content.balance.social.collab;
  if (hashOf(`${state.seed}:creator:${personId}`) % 10000 >= b.creators * 10000) return null;
  return Math.round(curveAt(b.followers, hashOf(`${state.seed}:following:${personId}`) % 101));
}

/** The people you could make something with: creators you know, of an age that fits yours. */
export function collabCandidates(state: LifeState, content: ContentBundle): { id: Id; followers: number }[] {
  const b = content.balance.social.collab;
  const mine = state.character.age;
  const done = yearView(state).collabs;
  const out: { id: Id; followers: number }[] = [];
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person || !inCircle(state, id) || rel.status !== 'active' || !COLLAB_KINDS.includes(rel.kind) || done.includes(id)) continue;
    const age = ageOf(state, person);
    if (age < b.minAge) continue;
    // Under 18, only with people under 18 of about your age; from 18, only with adults.
    if (mine < 18 ? age >= 18 || Math.abs(age - mine) > b.gap : age < 18) continue;
    const followers = creatorFollowers(state, id, content);
    if (followers !== null) out.push({ id, followers });
  }
  return out;
}

/** What the platforms paid you this year, after the cuts (set aside by the social step for the ledger). */
export function socialIncome(state: LifeState): number {
  const i = state.social.income;
  return i.year === state.currentYear ? Math.max(0, i.gross - i.agent - i.trust) : 0;
}

/** A year of posting counted as a year of work for the career (the fame step reads it). */
export function socialWorked(state: LifeState): boolean {
  return state.social.workedYear === state.currentYear;
}

/** Once you have accounts, the social media path's old retainer and its projects pay a smaller share (the platforms pay the rest); 1 for any other path. */
export function legacyScale(state: LifeState, pathId: Id, kind: 'retainer' | 'project', content: ContentBundle): number {
  if (pathId !== 'social' || Object.keys(state.social.accounts).length === 0) return 1;
  return content.balance.social.fame[kind];
}
