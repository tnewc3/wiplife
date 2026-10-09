/**
 * The ladder (E6b): starting a career and crossing over, climbing and
 * falling a rung at a time, big breaks, agents and contracts, retiring and
 * coming back. A rung is held by fame and reached by fame plus the quality of
 * your recent work; without new work fame slowly fades and the rung goes
 * with it, one at a time. Numbers: balance/fame.yaml.
 */
import type { ContentBundle, FameAgentDef, FameCompanyDef, FameHistoryKey, FamePathDef, FameTerms } from '../../content/schemas';
import { curveAt } from '../curve';
import { earn, spend, wholeDollars } from '../finance';
import { clampInt } from '../random';
import { chance, nextInt, pick, type RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { FamePathState, Id, LifeState } from '../types';
import { breakCeiling, isMinorStar, pathDef, rungDef, topRung, usualYear, workedPaths } from './query';
import { fameTextValues } from './text';
import { recentQuality } from './work';

/** Writes one of the fame history lines. */
export function fameHistory(state: LifeState, key: FameHistoryKey, content: ContentBundle, extra: Record<string, string> = {}): void {
  writeFromGroup(state, content.text.fame.history[key], ['fame', key], { values: { ...fameTextValues(state, content), ...extra } }, content);
}

/** Money from your work reaches you: a minor's parent banks part of it in trust until they are grown. */
export function payFameMoney(state: LifeState, amount: number, content: ContentBundle): void {
  const pay = wholeDollars(amount);
  if (pay <= 0) return;
  if (isMinorStar(state, content)) {
    const held = wholeDollars(pay * content.balance.fame.minors.trust);
    if (held > 0) {
      const trust = state.finances.trust;
      state.finances.trust = { balance: wholeDollars((trust?.balance ?? 0) + held), releaseAge: trust?.releaseAge ?? content.balance.economy.independenceAge };
    }
    earn(state, pay - held);
  } else {
    earn(state, pay);
  }
}

function pathState(state: LifeState, id: Id): FamePathState | undefined {
  return state.fame.paths[id];
}

/** A parent or guardian who is alive and in your life: someone to sign for a minor. */
export function hasGuardian(state: LifeState): boolean {
  if (state.housing.guardianId !== undefined) return true;
  return Object.values(state.relationships).some((r) => (r.kind === 'parent' || r.kind === 'stepparent') && r.status === 'active' && state.people[r.personId]?.alive === true);
}

export type EnterBlock = 'unknown' | 'active' | 'age' | 'prison' | 'parent';

/** Why you can't start a career in this path this way, or null. */
export function enterBlock(state: LifeState, pathId: string, routeId: string | undefined, content: ContentBundle): EnterBlock | null {
  const def = pathDef(content, pathId);
  if (!def) return 'unknown';
  const route = routeId === undefined ? undefined : def.routes.find((r) => r.id === routeId);
  if (routeId !== undefined && !route) return 'unknown';
  if (state.fame.active) return 'active';
  if (state.housing.kind === 'incarcerated') return 'prison';
  const age = state.character.age;
  if (age < Math.max(def.minAge, route?.minAge ?? 0) || age > content.balance.fame.entry.maxAge) return 'age';
  if (isMinorStar(state, content) && !hasGuardian(state)) return 'parent';
  return null;
}

/** You start a career in a path (by a route, which gives you a head start in craft). */
export function enterPath(state: LifeState, pathId: string, routeId: string | undefined, content: ContentBundle): boolean {
  if (enterBlock(state, pathId, routeId, content) !== null) return false;
  const def = pathDef(content, pathId)!;
  const e = content.balance.fame.entry;
  const route = def.routes.find((r) => r.id === routeId);
  const f = state.fame;
  const year = state.currentYear;
  f.active = true;
  delete f.retired;
  delete f.fadedFrom;
  delete f.nominated;
  f.main = pathId;
  f.second = null;
  f.paths = { [pathId]: { rung: 1, peak: 1, fame: e.fame, craft: route?.craft ?? e.craft, since: year, last: year, recent: [], breakYear: 0 } };
  f.image = e.image;
  f.mood = e.mood;
  f.fans = e.fans;
  f.burnout = 0;
  f.plan = null;
  f.agent = null;
  f.contract = null;
  f.commitment = 'steady';
  fameHistory(state, 'entered', content);
  return true;
}

export type CrossBlock = 'unknown' | 'inactive' | 'same' | 'second' | 'rung' | 'fame' | 'age' | 'contract' | 'prison';

/** Why you can't cross over into this path now, or null. */
export function crossBlock(state: LifeState, pathId: string, content: ContentBundle): CrossBlock | null {
  const def = pathDef(content, pathId);
  const f = state.fame;
  if (!def) return 'unknown';
  if (!f.active || f.main === null) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (f.main === pathId || f.paths[pathId]) return 'same';
  if (f.second !== null) return 'second';
  const main = f.paths[f.main]!;
  const c = content.balance.fame.crossover;
  if (main.rung < c.rung) return 'rung';
  if (main.fame < c.fame) return 'fame';
  if (state.character.age < def.minAge) return 'age';
  if (f.contract?.exclusive) return 'contract';
  return null;
}

/** You start a second path; part of your fame, rung and craft carries over. */
export function crossOver(state: LifeState, pathId: string, content: ContentBundle): boolean {
  if (crossBlock(state, pathId, content) !== null) return false;
  const def = pathDef(content, pathId)!;
  const f = state.fame;
  const main = f.paths[f.main!]!;
  const c = content.balance.fame.crossover.carry;
  const rung = clampInt(Math.round(main.rung * c.rung), 1, def.rungs.length);
  const fameAt = rungDef(def, rung).fame;
  f.paths[pathId] = {
    rung,
    peak: rung,
    fame: Math.min(fameAt + 1, Math.max(fameAt, main.fame * c.fame)),
    craft: Math.round(main.craft * c.craft),
    since: state.currentYear,
    last: state.currentYear,
    recent: [],
    breakYear: 0,
  };
  f.second = pathId;
  f.totals.crossovers += 1;
  fameHistory(state, 'crossover', content, { secondPath: def.noun });
  return true;
}

/** The fame the rung above asks for (100 at the top). */
function wall(def: FamePathDef, rung: number): number {
  return rung >= def.rungs.length ? 100 : rungDef(def, rung + 1).fame;
}

/** Climbs as many rungs as fame and the quality of your recent work allow; fame waits at the foot of a rung it can't yet climb. Returns the rungs climbed. */
export function climb(state: LifeState, pathId: string, content: ContentBundle): number {
  const def = pathDef(content, pathId);
  const path = pathState(state, pathId);
  if (!def || !path) return 0;
  let climbed = 0;
  while (path.rung < def.rungs.length) {
    const next = rungDef(def, path.rung + 1);
    if (path.fame < next.fame || recentQuality(path) < next.quality) break;
    path.rung += 1;
    climbed += 1;
  }
  if (path.rung < def.rungs.length) path.fame = Math.min(path.fame, wall(def, path.rung) - 0.5);
  path.fame = Math.max(0, Math.min(100, path.fame));
  if (path.rung > path.peak) {
    path.peak = path.rung;
    if (path.peak >= content.balance.fame.crossover.rung) state.flags.fame_famous = true;
    fameHistory(state, 'climbed', content, { rungTitle: rungDef(def, path.rung).title, pathNoun: def.noun });
  }
  return climbed;
}

function dropRung(state: LifeState, def: FamePathDef, path: FamePathState, content: ContentBundle): boolean {
  if (path.rung <= 1) return false;
  if (path.fame >= rungDef(def, path.rung).fame - content.balance.fame.fade.slack) return false;
  path.rung -= 1;
  state.fame.fadedFrom = Math.max(state.fame.fadedFrom ?? 0, path.peak);
  state.fame.totals.fades += 1;
  fameHistory(state, 'faded', content, { rungTitle: rungDef(def, path.rung).title, pathNoun: def.noun });
  return true;
}

/** Fame fades without new work; the rung goes when fame falls far enough under the fame that holds it. Returns whether a rung was lost. */
export function fade(state: LifeState, pathId: string, content: ContentBundle): boolean {
  const def = pathDef(content, pathId);
  const path = pathState(state, pathId);
  if (!def || !path) return false;
  const b = content.balance.fame.fade;
  path.fame = Math.max(0, path.fame - (path.fame * b.share + b.flat));
  return dropRung(state, def, path, content);
}

/** Extra fading when the recent work is thinner than the rung asks for (high on luck or a break, low on quality). */
export function fadeThin(state: LifeState, pathId: string, content: ContentBundle): boolean {
  const def = pathDef(content, pathId);
  const path = pathState(state, pathId);
  if (!def || !path || path.recent.length === 0) return false;
  if (recentQuality(path) >= rungDef(def, path.rung).quality - 6) return false;
  path.fame = Math.max(0, path.fame - content.balance.fame.fade.thin);
  return dropRung(state, def, path, content);
}

/** Whether fame has faded (you stand lower than you once did). */
export function hasFaded(state: LifeState): boolean {
  return state.fame.active && workedPaths(state).some((id) => state.fame.paths[id]!.rung < state.fame.paths[id]!.peak);
}

/** The chance of a big break this year, from the quality of your recent work, the exposure you have and a little luck. 0 while one is too recent or you are already as high as it can take you. */
export function breakChance(state: LifeState, pathId: string, content: ContentBundle, press: boolean, tour: boolean): number {
  const def = pathDef(content, pathId);
  const path = pathState(state, pathId);
  if (!def || !path || path.recent.length === 0) return 0;
  const b = content.balance.fame.bigBreak;
  if (path.breakYear > 0 && state.currentYear - path.breakYear < b.cooldown) return 0;
  if (path.rung >= breakCeiling(state, def, content)) return 0;
  const tier = state.fame.agent ? (content.fameAgents[state.fame.agent.agentId]?.tier ?? 0) : 0;
  const exposure = (press ? b.exposure.press : 1) * (tour ? b.exposure.tour : 1) * (1 + tier * b.exposure.agent);
  const luck = 1 + (state.character.hidden.luck - 50) * b.luck;
  return Math.min(0.5, curveAt(b.chance, recentQuality(path)) * exposure * Math.max(0.2, luck));
}

/** A big break: jumps several rungs, no higher than the ceiling for you. Returns the rungs gained. */
export function bigBreak(state: LifeState, pathId: string, content: ContentBundle, rng: RngState): number {
  const def = pathDef(content, pathId);
  const path = pathState(state, pathId);
  if (!def || !path) return 0;
  const j = content.balance.fame.bigBreak.jump;
  const to = Math.min(breakCeiling(state, def, content), path.rung + nextInt(rng, j.min, Math.max(j.min, j.max)));
  const gained = to - path.rung;
  if (gained <= 0) return 0;
  path.rung = to;
  path.peak = Math.max(path.peak, to);
  if (path.peak >= content.balance.fame.crossover.rung) state.flags.fame_famous = true;
  path.fame = Math.min(Math.max(path.fame, rungDef(def, to).fame + 2), wall(def, to) - 0.5);
  path.breakYear = state.currentYear;
  state.fame.totals.breaks += 1;
  fameHistory(state, 'break', content, { rungTitle: rungDef(def, to).title, pathNoun: def.noun });
  return gained;
}

// ── Agents ─────────────────────────────────────────────────────────────────

export type AgentBlock = 'unknown' | 'inactive' | 'have' | 'rung' | 'image' | 'prison';

/** Why you can't take on this agent now, or null. */
export function agentBlock(state: LifeState, agentId: string, content: ContentBundle): AgentBlock | null {
  const def = content.fameAgents[agentId];
  if (!def || def.retired) return 'unknown';
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (f.agent?.agentId === agentId) return 'have';
  if (f.agent && (content.fameAgents[f.agent.agentId]?.tier ?? 0) >= def.tier) return 'have';
  if (topRung(state) < def.minRung) return 'rung';
  if (f.image < def.minImage) return 'image';
  return null;
}

/** The agents open to you now, best first. */
export function openAgents(state: LifeState, content: ContentBundle): FameAgentDef[] {
  return Object.keys(content.fameAgents)
    .sort()
    .map((id) => content.fameAgents[id]!)
    .filter((a) => !a.retired && agentBlock(state, a.id, content) === null)
    .sort((a, b) => b.tier - a.tier);
}

export function signAgent(state: LifeState, agentId: string, content: ContentBundle): boolean {
  if (agentBlock(state, agentId, content) !== null) return false;
  state.fame.agent = { agentId, since: state.currentYear };
  fameHistory(state, 'agent', content, { agent: content.fameAgents[agentId]!.name });
  return true;
}

export function dropAgent(state: LifeState, content: ContentBundle): void {
  if (!state.fame.agent) return;
  state.fame.agent = null;
  state.fame.image = clampInt(state.fame.image - content.balance.fame.agents.dropImage, 0, 100);
}

/** An agent of this tier signs you (0 parts ways): the best open one of that tier. */
export function setAgentTier(state: LifeState, tier: number, content: ContentBundle): void {
  if (!state.fame.active) return;
  if (tier === 0) {
    dropAgent(state, content);
    return;
  }
  const options = openAgents(state, content).filter((a) => a.tier === tier);
  if (options[0]) signAgent(state, options[0].id, content);
}

// ── Contracts ──────────────────────────────────────────────────────────────

/** The tier of company that fits your rung in a path: the ladder split in three. */
export function companyTierFor(def: FamePathDef, rung: number): number {
  return Math.min(3, Math.max(1, Math.ceil((rung / def.rungs.length) * 3)));
}

/** Companies in a path that sign people at this tier (or the next lower tier that has any). */
export function companiesFor(content: ContentBundle, pathId: string, tier: number): FameCompanyDef[] {
  const all = Object.keys(content.fameCompanies)
    .sort()
    .map((id) => content.fameCompanies[id]!)
    .filter((c) => !c.retired && c.path === pathId);
  for (let t = tier; t >= 1; t--) {
    const at = all.filter((c) => c.tier === t);
    if (at.length > 0) return at;
  }
  return [];
}

export type ContractBlock = 'inactive' | 'have' | 'rung' | 'none' | 'prison';

/** Why you can't sign a deal now, or null. */
export function contractBlock(state: LifeState, content: ContentBundle): ContractBlock | null {
  const f = state.fame;
  if (!f.active || f.main === null) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (f.contract) return 'have';
  const path = f.paths[f.main]!;
  if (path.rung < 2) return 'rung';
  const def = pathDef(content, f.main)!;
  return companiesFor(content, f.main, companyTierFor(def, path.rung)).length > 0 ? null : 'none';
}

/** You sign a deal on these terms with a company that fits your rung. The advance reaches you (a parent signs, and banks part of it, for a minor). */
export function signContract(state: LifeState, terms: FameTerms, content: ContentBundle, rng: RngState): boolean {
  if (contractBlock(state, content) !== null) return false;
  const f = state.fame;
  const pathId = f.main!;
  const def = pathDef(content, pathId)!;
  const path = f.paths[pathId]!;
  const b = content.balance.fame.contracts;
  const company = pick(rng, companiesFor(content, pathId, companyTierFor(def, path.rung)));
  const minor = isMinorStar(state, content);
  const years = Math.min(minor ? b.minorYears : 99, nextInt(rng, b.years[terms].min, Math.max(b.years[terms].min, b.years[terms].max)));
  const advance = wholeDollars(usualYear(state, def, path.rung, content) * b.advance[terms]);
  f.contract = {
    company: company.id,
    path: pathId,
    since: state.currentYear,
    until: state.currentYear + years - 1,
    advance,
    share: b.share[terms],
    terms,
    exclusive: !minor && chance(rng, b.exclusive[terms]),
    byParent: minor,
  };
  payFameMoney(state, advance, content);
  fameHistory(state, 'signed', content);
  return true;
}

/** A deal ends: it ran out, or you walked away and pay back part of the advance and lose public image and fan goodwill. */
export function endContract(state: LifeState, how: 'ended' | 'broken', content: ContentBundle): void {
  const f = state.fame;
  const c = f.contract;
  if (!c) return;
  if (how === 'broken') {
    const b = content.balance.fame.contracts;
    spend(state, wholeDollars(c.advance * b.breakFee), content);
    f.image = clampInt(f.image - b.breakImage, 0, 100);
    f.mood = clampInt(f.mood - b.breakMood, 0, 100);
    state.flags.fame_broke_contract = true;
  }
  f.contract = null;
}

// ── Retiring and coming back ───────────────────────────────────────────────

/** You stop. Fame becomes royalties; the contract ends and the agent goes. */
export function retire(state: LifeState, content: ContentBundle): boolean {
  const f = state.fame;
  if (!f.active) return false;
  f.active = false;
  f.retired = state.currentYear;
  f.plan = null;
  f.contract = null;
  f.agent = null;
  f.burnout = 0;
  fameHistory(state, 'retired', content);
  return true;
}

/** You go back to work: from retirement or from a faded career. Part of the way back to your peak fame returns at once. */
export function comeback(state: LifeState, content: ContentBundle): boolean {
  const f = state.fame;
  if (f.main === null || !f.paths[f.main]) return false;
  if (!f.active && state.housing.kind === 'incarcerated') return false;
  f.active = true;
  delete f.retired;
  const share = content.balance.fame.comeback.share;
  for (const id of workedPaths(state)) {
    const def = pathDef(content, id);
    const path = f.paths[id]!;
    if (!def) continue;
    const peakFame = rungDef(def, path.peak).fame + 2;
    path.fame = Math.max(path.fame, path.fame + (peakFame - path.fame) * share);
    path.last = state.currentYear;
    climb(state, id, content);
  }
  f.totals.comebacks += 1;
  if (workedPaths(state).every((id) => f.paths[id]!.rung >= f.paths[id]!.peak)) delete f.fadedFrom;
  fameHistory(state, 'comeback', content);
  return true;
}
