/**
 * Drafts, contracts, trades and releases (E6c). Pay comes from the rung's
 * usual year (the league's pay, the same in every city) times the kind of
 * deal and, for a new deal, a market multiple by your rating. A salary is paid
 * through the yearly ledger as fame income (taxed like any pay, with the
 * agent's cut); a signing bonus and a buyout reach you at once. A pro player
 * lives where the team plays. Numbers: balance/sports.yaml.
 */
import type { ContentBundle, FamePathDef, SportContractKind, SportDef, SportRetireRoute } from '../../content/schemas';
import { curveAt } from '../curve';
import { payFameMoney } from '../fame/ladder';
import { rungDef } from '../fame/query';
import { wholeDollars } from '../finance';
import { chance, nextInt, type RngState } from '../rng';
import type { Id, LifeState, SportsContract } from '../types';
import { sportsHistory } from './text';
import { anotherTeam, draftingTeam, proTeam, proTeamDef, relocateForTeam } from './team';
import { recentRating } from './query';

type SportPath = FamePathDef & { sport: SportDef };

/** A year of pay at a rung of a sport: the league's pay, not the city's. */
export function leaguePay(def: SportPath, rung: number): number {
  return rungDef(def, rung).income;
}

/** What a deal of this kind pays a year, from the rung it is for and (for a deal struck now) your rating. */
export function salaryFor(def: SportPath, kind: SportContractKind, rung: number, rating: number, content: ContentBundle, round = 1): number {
  const b = content.balance.sports.contract;
  const market = kind === 'rookie' || kind === 'minimum' ? 1 : curveAt(b.market, rating);
  const scale = kind === 'rookie' ? (b.rookieRound[Math.min(b.rookieRound.length, Math.max(1, round)) - 1] ?? 1) : 1;
  return wholeDollars(leaguePay(def, rung) * b.kind[kind] * market * scale);
}

function newContract(state: LifeState, def: SportPath, kind: SportContractKind, teamId: Id, rung: number, rating: number, content: ContentBundle, rng: RngState, round = 1): SportsContract {
  const b = content.balance.sports.contract;
  const years = nextInt(rng, b.years[kind].min, Math.max(b.years[kind].min, b.years[kind].max));
  const hasOption = chance(rng, b.option.chance);
  return {
    teamId,
    since: state.currentYear,
    until: state.currentYear + years - 1,
    salary: salaryFor(def, kind, rung, rating, content, round),
    kind,
    option: hasOption ? (chance(rng, b.option.team) ? 'team' : 'player') : 'none',
  };
}

/** Takes you onto a pro team: the deal, the move, the bonus. */
function joinTeam(state: LifeState, def: SportPath, teamId: Id, contract: SportsContract, content: ContentBundle): void {
  const team = proTeamDef(def.sport, teamId);
  if (!team) return;
  const s = state.sports;
  s.pro = true;
  s.team = proTeam(team);
  s.contract = contract;
  s.unsigned = 0;
  s.playOut = false;
  s.ask = null;
  relocateForTeam(state, team.city, content);
  payFameMoney(state, contract.salary * content.balance.sports.contract.bonus, content);
}

/** You are drafted or signed after the draft: the deal on offer takes you to the team that wants you. Returns whether you signed. */
export function signDraftDeal(state: LifeState, content: ContentBundle, rng: RngState, kindOverride?: SportContractKind): boolean {
  const s = state.sports;
  const def = s.sport ? content.famePaths[s.sport] : undefined;
  const path = s.sport ? state.fame.paths[s.sport] : undefined;
  const d = s.draft;
  if (!def?.sport || !path || !d || s.pro || d.teamId === null) return false;
  const sport = def as SportPath;
  const kind: SportContractKind = kindOverride ?? (d.pick > 0 ? 'rookie' : 'minimum');
  const rung = sport.sport.proRung;
  const rating = recentRating(state);
  const contract = newContract(state, sport, kind, d.teamId, rung, rating, content, rng, d.round);
  joinTeam(state, sport, d.teamId, contract, content);
  if (!state.sports.pro) return false;
  path.rung = Math.max(path.rung, rung);
  path.peak = Math.max(path.peak, path.rung);
  path.fame = Math.max(path.fame, rungDef(def, path.rung).fame + 1);
  sportsHistory(state, d.pick > 0 ? 'drafted' : 'signed', content);
  s.draft = null;
  return true;
}

/** You turn the draft down and stay an amateur another year (it comes round again). */
export function declineDraft(state: LifeState): void {
  state.sports.draft = null;
}

/** Where in the draft a prospect goes: the pick (0 for undrafted) and the round. */
export function draftSlot(score: number, def: SportDef, content: ContentBundle): { pick: number; round: number } {
  const d = content.balance.sports.draft;
  const teams = def.leagues.pro.teams.length;
  const total = teams * def.draft.rounds;
  const pick = Math.max(1, Math.round(1 + Math.max(0, d.top - score) * d.perPick));
  if (pick > total) return { pick: 0, round: 0 };
  return { pick, round: Math.ceil(pick / teams) };
}

/** A team makes you an offer after the draft passes you by. */
export function undraftedOffer(def: SportPath, rating: number, content: ContentBundle, rng: RngState): Id | null {
  if (!chance(rng, curveAt(content.balance.sports.draft.undrafted, rating))) return null;
  return anotherTeam(def.sport, null, content, rng).id;
}

/** The team that holds the pick. */
export function pickTeamId(def: SportDef, pick: number, content: ContentBundle): Id | null {
  return pick > 0 ? draftingTeam(def, pick, content).id : null;
}

/** You sign again with your own team, on terms: the market (fair), more because you pushed (rich, which may fail), or less out of loyalty (cheap). */
export function extend(state: LifeState, terms: 'fair' | 'rich' | 'cheap', content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const def = s.sport ? content.famePaths[s.sport] : undefined;
  const path = s.sport ? state.fame.paths[s.sport] : undefined;
  if (!def?.sport || !path || !s.contract || !s.team) return false;
  const sport = def as SportPath;
  const b = content.balance.sports.contract;
  const rating = recentRating(state);
  const kind: SportContractKind = path.rung >= sport.sport.proRung + 2 ? 'star' : 'standard';
  const base = newContract(state, sport, kind, s.contract.teamId, path.rung, rating, content, rng);
  let mult = 1;
  if (terms === 'rich') mult = chance(rng, curveAt(b.push.chance, rating) * (state.fame.agent ? 1.2 : 1)) ? b.push.win : b.push.lose;
  else if (terms === 'cheap') mult = b.push.cheap;
  const old = s.contract;
  s.contract = { ...base, since: old.since, until: Math.max(old.until, state.currentYear) + (base.until - base.since + 1), salary: wholeDollars(base.salary * mult) };
  s.playOut = false;
  s.ask = null;
  payFameMoney(state, s.contract.salary * b.bonus * (terms === 'cheap' ? 1 : 0.5), content);
  return true;
}

/** Another team takes you (a trade, or free agency): the deal moves with you, or a new one is struck. */
export function moveToTeam(state: LifeState, teamId: Id, newDeal: boolean, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const def = s.sport ? content.famePaths[s.sport] : undefined;
  const path = s.sport ? state.fame.paths[s.sport] : undefined;
  if (!def?.sport || !path) return false;
  const sport = def as SportPath;
  const team = proTeamDef(sport.sport, teamId);
  if (!team) return false;
  const old = s.contract;
  const contract: SportsContract = newDeal || !old ? newContract(state, sport, path.rung >= sport.sport.proRung + 2 ? 'star' : 'standard', teamId, path.rung, recentRating(state), content, rng) : { ...old, teamId };
  s.pro = true;
  s.team = proTeam(team);
  s.contract = contract;
  s.unsigned = 0;
  s.playOut = false;
  s.ask = null;
  relocateForTeam(state, team.city, content);
  if (newDeal) payFameMoney(state, contract.salary * content.balance.sports.contract.bonus, content);
  return true;
}

/** The team trades you: another team, the same deal. */
export function tradePlayer(state: LifeState, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const def = s.sport ? content.famePaths[s.sport] : undefined;
  if (!def?.sport || !s.contract) return false;
  const team = anotherTeam((def as SportPath).sport, s.contract.teamId, content, rng);
  if (!moveToTeam(state, team.id, false, content, rng)) return false;
  s.totals.trades += 1;
  s.traded = state.currentYear;
  sportsHistory(state, 'traded', content);
  return true;
}

/** The team lets you go; what is left of the deal is paid out in part. Returns the buyout (paid through this year's income by the caller). */
export function releasePlayer(state: LifeState, content: ContentBundle): number {
  const s = state.sports;
  const c = s.contract;
  if (!c) return 0;
  const left = Math.max(0, c.until - state.currentYear + 1);
  const buyout = wholeDollars(c.salary * left * content.balance.sports.contract.buyout);
  s.contract = null;
  s.team = null;
  s.totals.releases += 1;
  s.released = state.currentYear;
  s.unsigned = 0;
  s.playOut = false;
  s.ask = null;
  sportsHistory(state, 'released', content);
  return buyout;
}

export type { SportRetireRoute };
