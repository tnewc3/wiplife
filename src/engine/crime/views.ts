/**
 * What the screens show of a crime career (E6a): the Work tab's crime card
 * (crew, rank, standing, heat and rivalry as bands the UI turns into words) and
 * the Money tab's dirty money card (the balance, the businesses you can launder
 * through, spending). Read-only.
 */
import type { ContentBundle } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { arrestChance } from '../legal';
import { isLifeActionAvailable } from '../actions/life';
import { frontsFor, launderBlock, launderRisk, spendBlock, type LaunderBlock, type SpendBlock } from './money';
import { bandOf, crewDef, crewName, inCrew, isFormer, liveMembers, rankTitle } from './query';

export interface CrimeMemberView {
  id: Id;
  name: string;
  /** "runs the crew" for the one who does; otherwise empty. */
  leads: boolean;
}

export interface CrimeView {
  /** Show the card at all: in a crew, once in one, or carrying heat or dirty money. */
  show: boolean;
  member: boolean;
  former: boolean;
  crew: string;
  blurb: string;
  rank: number;
  ranks: number;
  rankTitle: string;
  /** The title of the next rank up, or null at the top. */
  nextTitle: string | null;
  /** The crew would offer you the next rank now, if it were to ask (standing and time at the rank both reach it). */
  readyForNext: boolean;
  /** Bands, 0 (lowest) up: the UI has a word for each. */
  standingBand: number;
  heatBand: number;
  rivalryBand: number | null;
  investigated: boolean;
  informant: boolean;
  /** Living far from the crew: how long, and how much the crew suspects you (a band, 0 up), or null. */
  away: { years: number; suspicionBand: number; city: string } | null;
  rival: string | null;
  members: CrimeMemberView[];
  jobsThisYear: number;
  years: number;
  /** For a former member: the crew, how it ended and the best rank held. */
  past: { crew: string; how: string; topTitle: string; yearsAgo: number } | null;
}

export function getCrimeView(state: LifeState, content: ContentBundle): CrimeView {
  const k = state.crime;
  const b = content.balance.crime;
  const crew = k.crew;
  const last = k.past.at(-1);
  const next = crew ? b.ranks[k.rank] : undefined;
  const person = (id: Id): CrimeMemberView => {
    const p = state.people[id]!;
    return { id, name: `${p.name.first} ${p.name.last}`, leads: crew?.leader === id };
  };
  return {
    show: crew !== null || isFormer(state) || k.heat > 0 || state.finances.dirty > 0,
    member: crew !== null,
    former: isFormer(state),
    crew: crewName(content, crew?.defId ?? last?.crewId),
    blurb: crewDef(content, crew?.defId ?? last?.crewId)?.blurb ?? '',
    rank: k.rank,
    ranks: b.ranks.length,
    rankTitle: crew ? rankTitle(content, crew.defId, k.rank) : '',
    nextTitle: crew && next ? rankTitle(content, crew.defId, k.rank + 1) : null,
    readyForNext: crew !== null && next?.reach !== undefined && k.standing >= next.reach.standing && state.currentYear - k.rankSince >= next.reach.years,
    standingBand: bandOf(k.standing, b.standing.bands),
    heatBand: bandOf(k.heat, b.heat.bands),
    rivalryBand: crew?.rival ? bandOf(k.rivalry, b.rivalry.bands) : null,
    investigated: k.investigation !== undefined,
    informant: crew?.informant !== undefined,
    away: crew?.away ? { years: k.awayYears, suspicionBand: bandOf(crew.away.suspicion, b.away.suspicion.bands), city: content.cities[crew.cityId]?.name ?? '' } : null,
    rival: crew?.rival ? crewName(content, crew.rival) : null,
    members: liveMembers(state).map(person),
    jobsThisYear: k.jobs.year === state.currentYear ? k.jobs.count : 0,
    years: crew ? state.currentYear - crew.since : 0,
    past: last ? { crew: crewName(content, last.crewId), how: last.how, topTitle: rankTitle(content, last.crewId, last.topRank), yearsAgo: state.currentYear - last.toYear } : null,
  };
}

export interface FrontView {
  id: Id;
  name: string;
  blurb: string;
  tier: number;
  /** What it keeps, as a share (0–1). */
  fee: number;
  /** 0 (low), 1 or 2: how risky a minimum deposit is now. */
  riskBand: number;
  /** What it will still take this year. */
  left: number;
}

export interface DirtyView {
  balance: number;
  /** Show the card: you hold dirty money, or have been in a crew. */
  show: boolean;
  fronts: FrontView[];
  minLaunder: number;
  minSpend: number;
  heatBand: number;
  /** Laundering and spending can happen now: between years, an adult, not in prison, with some to use. */
  canAct: boolean;
  /** What you have put through in all, and the fees paid. */
  cleaned: number;
  fees: number;
}

export function getDirtyView(state: LifeState, content: ContentBundle): DirtyView {
  const b = content.balance.crime;
  const dirty = state.finances.dirty;
  const between = state.phase === 'yearStart';
  const min = Math.min(b.dirty.laundering.minimum, Math.max(dirty, 1));
  const fronts = frontsFor(state, content).map((f): FrontView => {
    const risk = launderRisk(state, f.id, Math.min(dirty, Math.max(min, 1)), content);
    return { id: f.id, name: f.name, blurb: f.blurb, tier: f.tier, fee: f.fee, riskBand: bandOf(risk, b.dirty.laundering.riskBands), left: f.left };
  });
  return {
    balance: dirty,
    show: dirty > 0 || inCrew(state) || isFormer(state) || state.crime.totals.cleaned > 0,
    fronts,
    minLaunder: min,
    minSpend: Math.min(b.dirty.spend.minimum, Math.max(dirty, 1)),
    heatBand: bandOf(state.crime.heat, b.heat.bands),
    canAct: between && dirty > 0 && isLifeActionAvailable(state, 'spend_dirty', { amount: Math.max(1, Math.min(dirty, b.dirty.spend.minimum)) }, content),
    cleaned: state.crime.totals.cleaned,
    fees: state.crime.totals.fees,
  };
}

/** Why this amount can't be put through this business now, or null (the Money tab checks what was typed). */
export function getLaunderBlock(state: LifeState, frontId: Id, amount: number, content: ContentBundle): LaunderBlock | null {
  return launderBlock(state, frontId, amount, content);
}

/** Why this amount can't be spent now, or null. */
export function getSpendBlock(state: LifeState, amount: number, content: ContentBundle): SpendBlock | null {
  return spendBlock(state, amount, content);
}

/** How likely an arrest is this year, for the simulation and tests. */
export function arrestOdds(state: LifeState, content: ContentBundle): number {
  return arrestChance(state, content);
}
