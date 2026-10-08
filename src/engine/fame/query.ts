/**
 * Fame in arts and media (E6b): small read-only helpers every part of the
 * engine shares: whether you have a career, your paths and rungs, the words
 * for them, and what a year at your rung is worth. Numbers: balance/fame.yaml;
 * ladders and kinds of work: src/content/fame.
 */
import type { ContentBundle, FameBand, FamePathDef, FameRungDef, FameSize } from '../../content/schemas';
import { wholeDollars } from '../finance';
import type { FamePathState, FameState, Id, LifeState } from '../types';

export const emptyFame = (): FameState => ({
  active: false,
  main: null,
  second: null,
  paths: {},
  image: 50,
  fans: 0,
  mood: 60,
  burnout: 0,
  commitment: 'steady',
  scene: 'social',
  agent: null,
  contract: null,
  plan: null,
  projects: [],
  awards: [],
  people: { super: [], hater: [], critic: [] },
  stalker: null,
  headlines: [],
  income: { year: 0, gross: 0, agent: 0, company: 0, trust: 0, scene: 0 },
  totals: { projects: 0, hits: 0, flops: 0, breaks: 0, fades: 0, comebacks: 0, nominations: 0, wins: 0, scandals: 0, tours: 0, burnouts: 0, crossovers: 0, stalkers: 0, earned: 0 },
});

/** A path's definition, or undefined. */
export function pathDef(content: ContentBundle, id: Id | null | undefined): FamePathDef | undefined {
  if (id === null || id === undefined) return undefined;
  const def = content.famePaths[id];
  return def && !def.retired ? def : undefined;
}

/** Every active path definition, in id order. */
export function allPaths(content: ContentBundle): FamePathDef[] {
  return Object.keys(content.famePaths)
    .sort()
    .map((id) => content.famePaths[id]!)
    .filter((d) => !d.retired);
}

/** You have a career (a faded one counts) and haven't retired. */
export function inFame(state: LifeState): boolean {
  return state.fame.active;
}

export function isRetiredStar(state: LifeState): boolean {
  return !state.fame.active && state.fame.retired !== undefined;
}

/** The paths you work in: your main path, then the second one if you crossed over. */
export function workedPaths(state: LifeState): Id[] {
  const f = state.fame;
  return [f.main, f.second].filter((p): p is Id => p !== null && f.paths[p] !== undefined);
}

export function mainPath(state: LifeState): FamePathState | undefined {
  const f = state.fame;
  return f.main === null ? undefined : f.paths[f.main];
}

/** Your highest rung across your paths, or 0 without a career. */
export function topRung(state: LifeState): number {
  return workedPaths(state).reduce((best, id) => Math.max(best, state.fame.paths[id]!.rung), 0);
}

/** Your highest peak across your paths, or 0. */
export function peakRung(state: LifeState): number {
  const f = state.fame;
  return Object.values(f.paths).reduce((best, p) => Math.max(best, p.peak), 0);
}

export function rungDef(def: FamePathDef, rung: number): FameRungDef {
  return def.rungs[Math.min(def.rungs.length, Math.max(1, rung)) - 1]!;
}

/** "a signed act", "an extra" (the article goes with the first word). */
export function withArticle(text: string): string {
  return /^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`;
}

/** The title of a rung (no article), or '' without that path. */
export function rungTitle(content: ContentBundle, pathId: Id | null, rung: number): string {
  const def = pathDef(content, pathId);
  return def ? rungDef(def, rung).title : '';
}

/** A hidden talent that fits this path (found or not). */
export function hasTalentFor(state: LifeState, def: FamePathDef): boolean {
  const t = state.character.hidden.talent;
  return t !== null && def.talents.includes(t);
}

/** Your city's pay level (the salary multiplier). */
export function payLevel(state: LifeState, content: ContentBundle): number {
  return content.cities[state.character.cityId]?.salaryMultiplier ?? 1;
}

/** A typical year's earnings at a rung of a path, in your city. */
export function usualYear(state: LifeState, def: FamePathDef, rung: number, content: ContentBundle): number {
  return wholeDollars(rungDef(def, rung).income * payLevel(state, content));
}

/** What a size of payment (or cost) is worth to you now: a share of your rung's usual year, with a floor, in your city. Zero without a career. */
export function sizeAmount(state: LifeState, size: FameSize, content: ContentBundle): number {
  const b = content.balance.fame.income;
  const paths = workedPaths(state);
  const usual = paths.length === 0 ? 0 : Math.max(...paths.map((id) => usualYear(state, content.famePaths[id]!, state.fame.paths[id]!.rung, content)));
  return wholeDollars(Math.max(b.floor[size] * payLevel(state, content), usual * b.sizes[size]));
}

/** Under the age a parent signs for you. */
export function isMinorStar(state: LifeState, content: ContentBundle): boolean {
  return state.character.age < content.balance.economy.independenceAge;
}

/** Which of a list of ascending thresholds a value reaches: the number of thresholds it is at or above. */
export function bandOf(value: number, bands: readonly number[]): number {
  let band = 0;
  for (const start of bands) if (value >= start) band++;
  return band;
}

/** The kind of work in a path by id. */
export function kindDef(def: FamePathDef, id: Id) {
  return def.kinds.find((k) => k.id === id);
}

/** The words for how a project was received, for a band. */
export function isHitBand(band: FameBand): boolean {
  return band === 'hit' || band === 'acclaimed' || band === 'crowd' || band === 'cult';
}

/** The ceiling rung a break can take you to in a path (talent: the top; none: a share of the ladder). */
export function breakCeiling(state: LifeState, def: FamePathDef, content: ContentBundle): number {
  const share = hasTalentFor(state, def) ? content.balance.fame.bigBreak.ceiling.talent : content.balance.fame.bigBreak.ceiling.none;
  return Math.max(2, Math.min(def.rungs.length, Math.round(def.rungs.length * share)));
}

/** A fan person is still alive and in your life. */
export function fanAlive(state: LifeState, id: Id): boolean {
  const p = state.people[id];
  const r = state.relationships[id];
  return p !== undefined && p.alive && r !== undefined && r.status !== 'ended';
}

/** The people of your fan lists who are still in your life, for protection from the usual pruning. */
export function fanIds(state: LifeState): Set<Id> {
  const f = state.fame;
  return new Set([...f.people.super, ...f.people.hater, ...f.people.critic].filter((id) => fanAlive(state, id)));
}

/** The fan people of one kind who are alive and in your life; the stalker is the one superfan who has crossed the line. */
export function fanPeople(state: LifeState, type: 'super' | 'hater' | 'critic' | 'stalker'): Id[] {
  if (type === 'stalker') {
    const s = state.fame.stalker;
    return s !== null && fanAlive(state, s.id) ? [s.id] : [];
  }
  return livePeople(state, type);
}

/** Everyone in your fan lists who is alive and in your life, by kind. */
export function livePeople(state: LifeState, type: 'super' | 'hater' | 'critic'): Id[] {
  return state.fame.people[type].filter((id) => fanAlive(state, id));
}

/** The words (labels.ts) fan mood falls in: 0 turned, 1 restless, 2 devoted. */
export function moodBand(mood: number): 0 | 1 | 2 {
  return mood < 30 ? 0 : mood < 60 ? 1 : 2;
}
