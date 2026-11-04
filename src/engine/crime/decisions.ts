/**
 * A leader's decisions (O1), made between years from the Organization screen: the job each member does this year,
 * promoting, disciplining or cutting a member, your cut, an informant, the cartel you buy from, an attack on a
 * neighborhood, and moves toward a rival (a truce, an alliance). Each checks its block first; what it does takes effect
 * at once or in the year that follows. Numbers: balance/orgs.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { CutLevel, Id, LifeState, WorldOrg } from '../types';
import { removeMember } from './crew';
import { addHeat, dirtyCost, payLevel, takeDirty } from './money';
import { holdings, memberName, myOrg, worldOrg } from './orgs';
import { jobsFor, say } from './orgYear';
import { isLeader, rankTitle, topRank } from './query';

export type LeadBlock = 'leader' | 'away' | 'jail' | 'member' | 'job' | 'rank' | 'money' | 'target' | 'already' | 'tried' | 'none';

/** You run the organization, are home and are free. */
export function leadBlock(state: LifeState, content: ContentBundle): LeadBlock | null {
  const crew = state.crime.crew;
  if (!crew || !isLeader(state, content)) return 'leader';
  if (crew.cityId !== state.character.cityId) return 'away';
  if (isIncarcerated(state)) return 'jail';
  return null;
}

function memberBlock(state: LifeState, content: ContentBundle, id: Id): LeadBlock | null {
  const b = leadBlock(state, content);
  if (b) return b;
  return state.crime.crew!.roster?.[id] && state.crime.crew!.members.includes(id) ? null : 'member';
}

export function assignBlock(state: LifeState, content: ContentBundle, id: Id, jobId: Id): LeadBlock | null {
  const b = memberBlock(state, content, id);
  if (b) return b;
  const m = state.crime.crew!.roster![id]!;
  if (m.jailed !== undefined && m.jailed >= state.currentYear) return 'jail';
  return jobsFor(state, content, id).some((j) => j.id === jobId) ? null : 'job';
}

export function assignJob(state: LifeState, content: ContentBundle, id: Id, jobId: Id): boolean {
  if (assignBlock(state, content, id, jobId) !== null) return false;
  state.crime.crew!.roster![id]!.job = jobId;
  return true;
}

export function promoteBlock(state: LifeState, content: ContentBundle, id: Id): LeadBlock | null {
  const b = memberBlock(state, content, id);
  if (b) return b;
  const crew = state.crime.crew!;
  return crew.roster![id]!.rank >= topRank(content, crew.defId) - 1 ? 'rank' : null;
}

export function promoteMember(state: LifeState, content: ContentBundle, id: Id): boolean {
  if (promoteBlock(state, content, id) !== null) return false;
  const crew = state.crime.crew!;
  const d = content.balance.orgs.decisions.promote;
  const m = crew.roster![id]!;
  m.rank += 1;
  m.loyalty = clampInt(m.loyalty + d.loyalty, 0, 100);
  state.crime.standing = clampInt(state.crime.standing + d.standing, 0, 100);
  state.orgs.totals.promoted += 1;
  say(state, 'memberPromoted', { member: memberName(state, id), job: rankTitle(content, crew.defId, m.rank) }, content);
  return true;
}

export function disciplineBlock(state: LifeState, content: ContentBundle, id: Id): LeadBlock | null {
  return memberBlock(state, content, id);
}

/** Puts a member in line: they work harder and trust you less, and some walk. Returns whether they left. */
export function disciplineMember(state: LifeState, content: ContentBundle, id: Id): boolean {
  if (disciplineBlock(state, content, id) !== null) return false;
  const crew = state.crime.crew!;
  const d = content.balance.orgs.decisions.discipline;
  const m = crew.roster![id]!;
  const name = memberName(state, id);
  m.loyalty = clampInt(m.loyalty + d.loyalty, 0, 100);
  m.skill = clampInt(m.skill + d.skill, 0, 100);
  state.crime.standing = clampInt(state.crime.standing + d.standing, 0, 100);
  const rel = state.relationships[id];
  if (rel) rel.affection = clampInt(rel.affection - 3, 0, 100);
  say(state, 'memberDisciplined', { member: name }, content);
  if (chance(state.rng, d.quitChance * (1 - m.loyalty / 150))) {
    removeMember(state, id);
    say(state, 'memberQuit', { member: name }, content);
    return true;
  }
  return false;
}

export function cutBlock(state: LifeState, content: ContentBundle, id: Id): LeadBlock | null {
  return memberBlock(state, content, id);
}

/** Cuts a member loose: they know things, and the others notice. */
export function cutMember(state: LifeState, content: ContentBundle, id: Id): boolean {
  if (cutBlock(state, content, id) !== null) return false;
  const crew = state.crime.crew!;
  const d = content.balance.orgs.decisions.cutLoose;
  const name = memberName(state, id);
  removeMember(state, id);
  const rel = state.relationships[id];
  if (rel) rel.affection = clampInt(rel.affection - 15, 0, 100);
  for (const m of Object.values(crew.roster ?? {})) m.loyalty = clampInt(m.loyalty + d.loyalty / 2, 0, 100);
  addHeat(state, d.heat);
  state.orgs.totals.cut += 1;
  say(state, 'memberCut', { member: name }, content);
  return true;
}

export function setCut(state: LifeState, content: ContentBundle, level: CutLevel): boolean {
  if (leadBlock(state, content) !== null) return false;
  state.crime.crew!.cut = level;
  return true;
}

export type InformantWay = 'confront' | 'pay';

export function informantBlock(state: LifeState, content: ContentBundle, way: InformantWay): LeadBlock | null {
  const b = leadBlock(state, content);
  if (b) return b;
  const crew = state.crime.crew!;
  if (crew.informant === undefined) return 'target';
  if (way === 'pay' && state.finances.dirty < dirtyCost(state, 'small', content)) return 'money';
  return null;
}

/** Deals with the member who is talking to the police: face them (they are out, and it may not work), or pay them to stop. */
export function dealWithInformant(state: LifeState, content: ContentBundle, way: InformantWay): boolean {
  if (informantBlock(state, content, way) !== null) return false;
  const crew = state.crime.crew!;
  const d = content.balance.orgs.decisions.informant;
  const id = crew.informant!;
  if (way === 'pay') {
    takeDirty(state, dirtyCost(state, 'small', content));
    delete crew.informant;
    const m = crew.roster?.[id];
    if (m) m.loyalty = clampInt(m.loyalty + 10, 0, 100);
    return true;
  }
  const odds = (d.confront + state.crime.standing / 4) / 100;
  if (chance(state.rng, odds)) {
    removeMember(state, id);
    const rel = state.relationships[id];
    if (rel) rel.affection = clampInt(rel.affection - 25, 0, 100);
  } else addHeat(state, d.heat);
  for (const m of Object.values(crew.roster ?? {})) m.loyalty = clampInt(m.loyalty + (d.silenceLoyalty > 0 ? d.silenceLoyalty : 0), 0, 100);
  return true;
}

// ---- Territory and rivals --------------------------------------------------------------------------------------------

export function expandBlock(state: LifeState, content: ContentBundle, hoodId: Id): LeadBlock | null {
  const b = leadBlock(state, content);
  if (b) return b;
  const crew = state.crime.crew!;
  const map = state.orgs.hoods[crew.cityId];
  if (!map || !(hoodId in map) || map[hoodId] === crew.defId) return 'target';
  if (crew.plan?.expand !== undefined) return 'already';
  if (state.finances.dirty < expandCost(state, content)) return 'money';
  return null;
}

export function expandCost(state: LifeState, content: ContentBundle): number {
  return Math.round(content.balance.orgs.territory.expandCost * payLevel(state, content));
}

/** Orders an attack on a neighborhood for the coming year; it costs dirty money now. */
export function planExpand(state: LifeState, content: ContentBundle, hoodId: Id): boolean {
  if (expandBlock(state, content, hoodId) !== null) return false;
  takeDirty(state, expandCost(state, content));
  (state.crime.crew!.plan ??= {}).expand = hoodId;
  return true;
}

export function supplierBlock(state: LifeState, content: ContentBundle, orgId: Id | null): LeadBlock | null {
  const b = leadBlock(state, content);
  if (b) return b;
  if (orgId === null) return null;
  const crew = state.crime.crew!;
  const org = worldOrg(state, crew.cityId, orgId);
  return org && content.orgKinds[org.kind]?.supplies && org.status !== 'war' ? null : 'target';
}

export function setSupplier(state: LifeState, content: ContentBundle, orgId: Id | null): boolean {
  if (supplierBlock(state, content, orgId) !== null) return false;
  const crew = state.crime.crew!;
  if (orgId === null) delete crew.supplier;
  else crew.supplier = orgId;
  return true;
}

export type Move = 'truce' | 'alliance';

export function moveBlock(state: LifeState, content: ContentBundle, orgId: Id, move: Move): LeadBlock | null {
  const b = leadBlock(state, content);
  if (b) return b;
  const crew = state.crime.crew!;
  const org = worldOrg(state, crew.cityId, orgId);
  if (!org || org.id === crew.defId) return 'target';
  if (org.tried === state.currentYear) return 'tried';
  if (move === 'truce' && org.status !== 'war') return 'target';
  if (move === 'alliance' && (org.status === 'war' || org.status === 'allied')) return 'target';
  return null;
}

/** The chance a move toward an organization is taken now (it reads how the organization feels about you). */
export function moveOdds(org: WorldOrg, move: Move, content: ContentBundle): number {
  const w = content.balance.orgs.war;
  return curveAt(move === 'truce' ? w.truceOdds : w.allianceOdds, org.attitude);
}

/** Offers a truce to an organization you are at war with, or proposes an alliance. Returns whether it was taken. */
export function makeMove(state: LifeState, content: ContentBundle, orgId: Id, move: Move): boolean {
  if (moveBlock(state, content, orgId, move) !== null) return false;
  const crew = state.crime.crew!;
  const org = worldOrg(state, crew.cityId, orgId)!;
  const w = content.balance.orgs.war;
  org.tried = state.currentYear;
  if (!chance(state.rng, moveOdds(org, move, content))) {
    org.attitude = clampInt(org.attitude - 3, -100, 100);
    return false;
  }
  if (move === 'truce') {
    org.status = 'truce';
    org.truceSince = state.currentYear;
    org.war = Math.max(0, org.war - w.truceWar);
    org.attitude = clampInt(org.attitude + w.attitude.truce, -100, 100);
    if (crew.war === org.id) delete crew.war;
    say(state, 'truceMade', { rival: org.name }, content);
  } else {
    org.status = 'allied';
    org.attitude = clampInt(org.attitude + w.attitude.alliance, -100, 100);
    say(state, 'allied', { rival: org.name }, content);
  }
  return true;
}

/** Whether the organization you are in holds any neighborhood (for the screen). */
export function heldCount(state: LifeState): number {
  const crew = state.crime.crew;
  return crew ? holdings(state, crew.cityId, crew.defId).length : 0;
}

export { myOrg };
