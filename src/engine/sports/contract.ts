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
import { chance, createRng, nextFloat, nextInt, type RngState } from '../rng';
import type { Id, LifeState, SportsContract } from '../types';
import { sportsHistory } from './text';
import { anotherTeam, draftingTeam, proTeam, proTeamDef, proTeamsIn, relocateForTeam, teamAtHome } from './team';
import { divisionOf, hasDivisions } from './league';
import { recentRating } from './query';

type SportPath = FamePathDef & { sport: SportDef };

/** A year of pay at a rung of a sport: the league's pay, not the city's. */
export function leaguePay(def: SportPath, rung: number): number {
  return rungDef(def, rung).income;
}

/** The share of the draft's picks gone before a pick (percent): 0 for the first pick, near 100 for the last. */
export function pickShare(pick: number, total: number): number {
  return total <= 1 ? 0 : (100 * (Math.max(1, Math.min(total, pick)) - 1)) / total;
}

/**
 * What a rookie is paid by where they were picked: the rung's usual year in the league times a smooth curve by the share of
 * picks gone (the first pick is paid most), the signing bonus (a share of that year's pay, also by the pick), and the most
 * skill incentives can add a year.
 */
export function rookiePay(def: SportPath, pick: number, total: number, content: ContentBundle): { salary: number; signing: number; incentive: number } {
  const b = content.balance.sports.contract;
  const share = pickShare(pick, total);
  const salary = wholeDollars(leaguePay(def, def.sport.proRung) * b.kind.rookie * curveAt(b.rookiePick, share));
  return { salary, signing: wholeDollars(salary * curveAt(b.signing, share)), incentive: wholeDollars(salary * b.incentive.share) };
}

/** What a deal of this kind pays a year, from the rung it is for and (for a deal struck now) your rating. A rookie deal is by the pick (about the middle without one). */
export function salaryFor(def: SportPath, kind: SportContractKind, rung: number, rating: number, content: ContentBundle, pickAt?: { pick: number; total: number }): number {
  const b = content.balance.sports.contract;
  if (kind === 'rookie') return pickAt ? rookiePay(def, pickAt.pick, pickAt.total, content).salary : rookiePay(def, 1 + Math.floor(DEFAULT_TOTAL / 2), DEFAULT_TOTAL, content).salary;
  const market = kind === 'minimum' ? 1 : curveAt(b.market, rating);
  return wholeDollars(leaguePay(def, rung) * b.kind[kind] * market);
}

/** Picks assumed for a rookie deal struck outside a draft (a pick in the middle). */
const DEFAULT_TOTAL = 40;

/** What a club pays against the league's usual pay: the second league of a sport with two pays less (Batch 6). */
export function clubPay(state: LifeState, def: SportPath, teamId: Id | null | undefined, content: ContentBundle): number {
  if (!hasDivisions(def.sport)) return 1;
  const team = proTeamDef(state, def.id, teamId, content);
  return team && divisionOf(state, team) === 2 ? content.balance.sports.soccer.tiers.pay : 1;
}

export function newContract(state: LifeState, def: SportPath, kind: SportContractKind, teamId: Id, rung: number, rating: number, content: ContentBundle, rng: RngState, pickAt?: { pick: number; total: number }): SportsContract {
  const b = content.balance.sports.contract;
  const years = nextInt(rng, b.years[kind].min, Math.max(b.years[kind].min, b.years[kind].max));
  const hasOption = chance(rng, b.option.chance);
  const pay = clubPay(state, def, teamId, content);
  return {
    teamId,
    since: state.currentYear,
    until: state.currentYear + years - 1,
    salary: wholeDollars(salaryFor(def, kind, rung, rating, content, pickAt) * pay),
    kind,
    option: hasOption ? (chance(rng, b.option.team) ? 'team' : 'player') : 'none',
    ...(kind === 'rookie' ? { incentive: wholeDollars(rookiePay(def, pickAt?.pick ?? 1 + Math.floor(DEFAULT_TOTAL / 2), pickAt?.total ?? DEFAULT_TOTAL, content).incentive * pay) } : {}),
  };
}

/** Takes you onto a pro team: the deal, the move, the bonus (a rookie's by the pick; otherwise a share of a year's pay). */
function joinTeam(state: LifeState, def: SportPath, teamId: Id, contract: SportsContract, content: ContentBundle, bonus?: number): void {
  const team = teamAtHome(state, def.id, proTeamDef(state, def.id, teamId, content), state.character.cityId, content);
  if (!team) return;
  const s = state.sports;
  contract = { ...contract, teamId: team.id };
  s.pro = true;
  s.team = proTeam(state, team, def.id, content);
  s.teamless = false;
  s.contract = contract;
  s.unsigned = 0;
  s.playOut = false;
  s.ask = null;
  s.academy = null;
  s.loan = null;
  s.transfer = null;
  relocateForTeam(state, team.city, content, contract.until);
  payFameMoney(state, bonus ?? contract.salary * content.balance.sports.contract.bonus, content);
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
  const total = draftTotal(state, sport.id, state.character.cityId, content);
  const pickAt = d.pick > 0 ? { pick: d.pick, total } : undefined;
  const contract = newContract(state, sport, kind, d.teamId, rung, rating, content, rng, pickAt);
  const signing = kind === 'rookie' && pickAt ? rookiePay(sport, pickAt.pick, pickAt.total, content).signing : undefined;
  joinTeam(state, sport, d.teamId, contract, content, signing);
  if (!state.sports.pro) return false;
  path.rung = Math.max(path.rung, rung);
  path.peak = Math.max(path.peak, path.rung);
  path.fame = Math.max(path.fame, rungDef(def, path.rung).fame + 1);
  sportsHistory(state, d.academy === true ? 'academy' : d.pick > 0 ? 'drafted' : 'signed', content);
  if (d.academy === true) s.totals.graduates += 1;
  if (s.passed > 0) s.totals.signedAfterUndrafted += 1;
  s.draft = null;
  s.passed = 0;
  s.combine = 0;
  return true;
}

/**
 * A camp, an open tryout or a call from a team signs you (Batch 5), for a player the draft passed by or a pro without a deal. The
 * deal is a minimum one unless you rate well above what the rung asks. Returns whether you signed.
 */
export function signCampDeal(state: LifeState, teamId: Id, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const def = s.sport ? content.famePaths[s.sport] : undefined;
  const path = s.sport ? state.fame.paths[s.sport] : undefined;
  if (!def?.sport || !path || state.character.age < def.sport.draft.age) return false;
  const sport = def as SportPath;
  const rung = sport.sport.proRung;
  const rating = recentRating(state);
  const kind: SportContractKind = rating >= rungDef(sport, rung).quality + 8 ? 'standard' : 'minimum';
  const afterDraft = !s.pro;
  const contract = newContract(state, sport, kind, teamId, Math.max(path.rung, rung), rating, content, rng);
  joinTeam(state, sport, teamId, contract, content);
  if (!state.sports.pro) return false;
  path.rung = Math.max(path.rung, rung);
  path.peak = Math.max(path.peak, path.rung);
  path.fame = Math.max(path.fame, rungDef(def, path.rung).fame + 1);
  sportsHistory(state, 'signedCamp', content);
  if (s.passed > 0 || !afterDraft) s.totals.signedAfterUndrafted += 1;
  s.draft = null;
  s.passed = 0;
  s.combine = 0;
  return true;
}

/** You turn the draft down and stay an amateur another year (it comes round again). */
export function declineDraft(state: LifeState): void {
  state.sports.draft = null;
}

/** The picks in the draft: every team, every round. */
export function draftTotal(state: LifeState, sportId: Id, home: Id, content: ContentBundle): number {
  const def = content.famePaths[sportId]!.sport!;
  return Math.max(1, proTeamsIn(state, sportId, home, content).length) * def.draft.rounds;
}

/** Where in the draft a prospect goes: the pick (0 for undrafted) and the round. */
export function draftSlot(state: LifeState, sportId: Id, score: number, home: Id, content: ContentBundle): { pick: number; round: number } {
  const def = content.famePaths[sportId]!.sport!;
  const d = content.balance.sports.draft;
  const teams = Math.max(1, proTeamsIn(state, sportId, home, content).length);
  const total = teams * def.draft.rounds;
  const pick = Math.max(1, Math.round(1 + Math.max(0, d.top - score) * d.perPick));
  if (pick > total) return { pick: 0, round: 0 };
  return { pick, round: Math.ceil(pick / teams) };
}

/**
 * The league's need for your position this year, in score points (stable for a life and a year): a team short at the position
 * lifts a prospect, a crowded position costs one.
 */
export function positionNeed(state: LifeState, content: ContentBundle): number {
  const position = state.sports.position ?? '';
  const u = nextFloat(createRng(`${state.seed}:need:${state.currentYear}:${position}`));
  return Math.round((u * 2 - 1) * content.balance.sports.draft.need * 10) / 10;
}

/** What scouts make of you before the noise: recent rating, fame, the combine and the league's need for your position. */
export function draftScoreBase(state: LifeState, pathFame: number, content: ContentBundle): number {
  const d = content.balance.sports.draft;
  const combine = Math.max(-d.combine, Math.min(d.combine, state.sports.combine));
  return recentRating(state) * d.score.quality + pathFame * d.score.fame + combine + positionNeed(state, content);
}

/** A team makes you an offer after the draft passes you by. */
export function undraftedOffer(state: LifeState, def: SportPath, rating: number, home: Id, content: ContentBundle, rng: RngState): Id | null {
  if (!chance(rng, curveAt(content.balance.sports.draft.undrafted, rating))) return null;
  return anotherTeam(state, def.id, null, home, content, rng).id;
}

/** The team that holds the pick. */
export function pickTeamId(state: LifeState, sportId: Id, pick: number, home: Id, content: ContentBundle): Id | null {
  return pick > 0 ? draftingTeam(state, sportId, pick, home, content).id : null;
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
  const team = teamAtHome(state, sport.id, proTeamDef(state, sport.id, teamId, content), state.character.cityId, content);
  if (!team) return false;
  teamId = team.id;
  const old = s.contract;
  const contract: SportsContract = newDeal || !old ? newContract(state, sport, path.rung >= sport.sport.proRung + 2 ? 'star' : 'standard', teamId, path.rung, recentRating(state), content, rng) : { ...old, teamId };
  s.pro = true;
  s.team = proTeam(state, team, sport.id, content);
  s.teamless = false;
  s.contract = contract;
  s.unsigned = 0;
  s.playOut = false;
  s.ask = null;
  s.loan = null;
  s.transfer = null;
  relocateForTeam(state, team.city, content, contract.until);
  if (newDeal) payFameMoney(state, contract.salary * content.balance.sports.contract.bonus, content);
  return true;
}

/** The team trades you: another team, the same deal. */
export function tradePlayer(state: LifeState, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const def = s.sport ? content.famePaths[s.sport] : undefined;
  if (!def?.sport || !s.contract) return false;
  const team = anotherTeam(state, (def as SportPath).id, s.contract.teamId, state.character.cityId, content, rng);
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

/**
 * Where scouts project you in the draft, in words (Batch 5): the band your score falls in on average, and the best and worst
 * bands it could fall in (one spread of the day's noise either way). Reads only. Null before a player is old enough to be drafted.
 */
export function draftProjection(state: LifeState, def: SportPath, content: ContentBundle): { likely: string; best: string; worst: string } | null {
  const d = content.balance.sports.draft;
  const path = state.fame.paths[def.id];
  if (!path || state.sports.pro || state.character.age < def.sport.draft.age - 1) return null;
  const total = draftTotal(state, def.id, state.character.cityId, content);
  const score = draftScoreBase(state, path.fame, content);
  const bandAt = (x: number): string => {
    const pick = Math.max(1, Math.round(1 + Math.max(0, d.top - x) * d.perPick));
    const share = pick / total;
    return (d.projection.find((b) => share <= b.upTo) ?? d.projection[d.projection.length - 1]!).id;
  };
  return { likely: bandAt(score), best: bandAt(score + d.score.noise), worst: bandAt(score - d.score.noise) };
}
