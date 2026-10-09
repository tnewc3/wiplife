/**
 * The work (E6b): a project's quality roll (talent, skill, team and the
 * creative choices), what critics and fans each made of it, the fame, fans,
 * mood and image it moves, and what it earns. Talent counts most: a hidden
 * talent that fits the path is worth more than anything else you can bring,
 * and the quality your recent work reaches decides which rungs you can climb
 * into. Numbers: balance/fame.yaml.
 */
import type { ContentBundle, FameAgentDef, FameBand, FameKindDef, FamePathDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { clampInt, rollNormal } from '../random';
import { pick, type RngState } from '../rng';
import type { FamePathState, FamePlan, FameProject, LifeState } from '../types';
import { hasTalentFor, kindDef, payLevel, rungDef, usualYear } from './query';

/** What the path draws on besides talent: your traits and stats, weighted by the path (0–1). */
export function aptitude(state: LifeState, def: FamePathDef): number {
  const c = state.character;
  let total = 0;
  let weights = 0;
  for (const [key, weight] of Object.entries(def.aptitude)) {
    if (weight === undefined) continue;
    const value = key in c.stats ? c.stats[key as keyof typeof c.stats] : c.personality[key as keyof typeof c.personality];
    total += weight * value;
    weights += weight;
  }
  return weights === 0 ? 0.5 : total / weights / 100;
}

/** The agent you have, as a definition. */
export function agentDef(state: LifeState, content: ContentBundle): FameAgentDef | undefined {
  const a = state.fame.agent;
  return a ? content.fameAgents[a.agentId] : undefined;
}

export function agentTier(state: LifeState, content: ContentBundle): number {
  return agentDef(state, content)?.tier ?? 0;
}

/** The tier of the company you are under contract with (0 for none). */
export function companyTier(state: LifeState, content: ContentBundle): number {
  const c = state.fame.contract;
  return c ? (content.fameCompanies[c.company]?.tier ?? 0) : 0;
}

/** How a work was received, from the critics' and the fans' scores. */
export function bandFor(critics: number, fans: number, criticWeight: number, content: ContentBundle): FameBand {
  const b = content.balance.fame.reception.bands;
  if (critics >= b.acclaimed && fans >= b.acclaimed) return 'acclaimed';
  if (critics >= b.high && fans < b.low) return 'cult';
  if (fans >= b.high && critics < b.low) return 'crowd';
  const blend = critics * criticWeight + fans * (1 - criticWeight);
  return blend >= b.hit ? 'hit' : blend >= b.solid ? 'solid' : 'flop';
}

export interface Roll {
  quality: number;
  critics: number;
  fans: number;
  band: FameBand;
}

/**
 * The quality of a piece of work and what critics and fans each made of it.
 * Quality comes from your aptitude, a talent that fits (most of all), your
 * craft, your team (agent and company), luck, the kind of work and a roll
 * whose spread grows with a bold swing. Critics and fans then each judge it
 * with their own bias for the style and the risk, and their own roll, so
 * they can disagree.
 */
export function rollWork(state: LifeState, plan: FamePlan, path: FamePathState, def: FamePathDef, kind: FameKindDef, content: ContentBundle, rng: RngState): Roll {
  const b = content.balance.fame;
  const q = b.quality;
  const r = b.reception;
  const spread = r.risk[plan.risk].spread;
  const talent = hasTalentFor(state, def) ? q.talent + (state.character.hidden.talentDiscovered ? q.talentFound : 0) : 0;
  const base =
    q.base +
    q.aptitude * aptitude(state, def) +
    talent +
    path.craft * q.craft +
    q.team.agent * agentTier(state, content) +
    q.team.company * companyTier(state, content) +
    (state.character.hidden.luck - 50) * q.luck +
    kind.difficulty;
  const quality = clampInt(Math.round(base + rollNormal(rng, { mean: 0, sd: q.noise * spread })), 0, 100);
  const f = state.fame;
  const critics = clampInt(Math.round(quality + r.style[plan.style].critic + r.risk[plan.risk].critic + rollNormal(rng, { mean: 0, sd: r.noise * spread })), 0, 100);
  const fans = clampInt(
    Math.round(quality + r.style[plan.style].fan + r.risk[plan.risk].fan + (f.mood - 50) * r.mood + (f.image - 50) * r.image + rollNormal(rng, { mean: 0, sd: r.noise * spread })),
    0,
    100,
  );
  return { quality, critics, fans, band: bandFor(critics, fans, def.criticWeight, content) };
}

/** The average quality of your last few releases in a path (0 with none). */
export function recentQuality(path: FamePathState): number {
  return path.recent.length === 0 ? 0 : path.recent.reduce((a, b) => a + b, 0) / path.recent.length;
}

/** How many releases a rung's gate looks at. */
export const RECENT = 3;

/** Craft gained by a year of work (or a share of one without): slower as it grows, quicker with discipline and a talent that fits. */
export function craftGrowth(state: LifeState, def: FamePathDef, path: FamePathState, worked: boolean, content: ContentBundle): number {
  const q = content.balance.fame.quality;
  const discipline = 1 + (state.character.personality.discipline - 50) * q.craftDiscipline;
  const talent = hasTalentFor(state, def) ? 1.3 : 1;
  // E6c: a sport's training focus shapes how much the year teaches.
  const focus = def.sport ? content.balance.sports.performance.focus[state.sports.focus].craft : 1;
  const room = Math.max(0, (hasTalentFor(state, def) ? q.craftCap.talent : q.craftCap.none) - path.craft);
  return Math.min(room, curveAt(q.craftGain, path.craft) * Math.max(0.3, discipline) * talent * focus * (worked ? 1 : q.craftIdle));
}

/** What a release earns before anyone takes a cut: the rung's usual year times the kind's pay, by how fans took it, at your commitment's output; and a tour on top. */
export function releaseGross(state: LifeState, plan: FamePlan, path: FamePathState, def: FamePathDef, kind: FameKindDef, fans: number, content: ContentBundle): { release: number; tour: number } {
  const b = content.balance.fame;
  const usual = usualYear(state, def, path.rung, content);
  const release = usual * kind.pay * curveAt(b.income.release, fans) * b.commitment.output[state.fame.commitment];
  const tour = plan.tour ? usual * b.income.tour : 0;
  return { release: Math.round(release), tour: Math.round(tour) };
}

/** What your name brings in a year with no new work: gigs, royalties, retainers and brands, in each path you work. */
export function retainer(state: LifeState, content: ContentBundle): number {
  const b = content.balance.fame;
  const brand = Math.min(1.6, Math.max(0.6, 1 + (state.fame.image - 50) * b.income.image));
  let total = 0;
  for (const id of [state.fame.main, state.fame.second]) {
    if (id === null) continue;
    const def = content.famePaths[id];
    const path = state.fame.paths[id];
    if (def && path) total += usualYear(state, def, path.rung, content) * b.income.retainer * brand;
  }
  return Math.round(total);
}

/** The default work a company assigns when you have planned none: the first kind your rung allows, commercial and safe. */
export function assignedPlan(state: LifeState, content: ContentBundle): FamePlan | null {
  const c = state.fame.contract;
  const path = c ? state.fame.paths[c.path] : undefined;
  const def = c ? content.famePaths[c.path] : undefined;
  if (!c || !path || !def || def.sport) return null;
  const kind = def.kinds.find((k) => k.minRung <= path.rung);
  return kind ? { path: c.path, kind: kind.id, style: 'commercial', risk: 'safe', tour: false, press: false } : null;
}

/** Whether a plan can be carried out now: your path, a kind your rung allows, and the extras your rung allows. Returns the reason it can't, or null. */
export function planBlock(state: LifeState, plan: FamePlan, content: ContentBundle): string | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  const def = content.famePaths[plan.path];
  const path = f.paths[plan.path];
  if (!def || !path || ![f.main, f.second].includes(plan.path)) return 'path';
  if (def.sport) return 'sport';
  const kind = kindDef(def, plan.kind);
  if (!kind) return 'kind';
  if (kind.minRung > path.rung) return 'rung';
  if (plan.tour && path.rung < def.tour.minRung) return 'tour';
  if (plan.press && path.rung < def.press.minRung) return 'press';
  if (f.contract?.exclusive && f.contract.path !== plan.path) return 'exclusive';
  return null;
}

/** A title for a new project in a path, not used by one of your last releases. */
export function projectTitle(state: LifeState, pathId: string, content: ContentBundle, rng: RngState): string {
  const titles = content.text.fame.titles[pathId] ?? [];
  const used = new Set(state.fame.projects.map((p) => p.title));
  const fresh = titles.filter((t) => !used.has(t));
  const pool = fresh.length > 0 ? fresh : titles;
  return pool.length === 0 ? 'Untitled' : pick(rng, pool);
}

/** The projects of the last years in a path, newest last. */
export function projectsOf(state: LifeState, pathId: string): FameProject[] {
  return state.fame.projects.filter((p) => p.path === pathId);
}

export { payLevel, rungDef };
