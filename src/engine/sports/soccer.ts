/**
 * Soccer's world (Batch 6): youth academies tied to a club (a trial abroad for a UK player), the club's promotion of an academy
 * graduate to its first team, loans the parent club decides, the transfer window with its fees, release clauses and an agent who
 * negotiates, and the two leagues of a country with clubs promoted and relegated between them.
 *
 * - An academy is a youth team named for a pro club. At the draft age the club promotes a graduate to its first team (a deal on
 *   offer, signed by an event) or lets the player go.
 * - A loan is a season at a weaker club. The club that holds your contract decides: it offers (or you ask, and it may agree);
 *   turning one down may not be allowed. Your pay stays with the parent club.
 * - The window: each year a pro with a contract draws offers by rating, age and the years left on the deal; the fee is between
 *   the clubs, and the player's share is a signing-on payment through the ledger. A met release clause lets a club buy you without
 *   your club's say. Your agent can push for better terms and may lose the offer.
 * - Leagues: each year the bottom clubs of a country's top league go down and the top clubs of its second league go up, by strengths
 *   that depend on nothing but the life's seed and the year (and, for your own club, how its season really went).
 *
 * Numbers: balance/sports.yaml soccer. Money: whole base dollars.
 */
import type { ContentBundle, FamePathDef, SportDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { countryIdOfCity, scaledAmount } from '../country';
import { agentTier } from '../fame/work';
import { payFameMoney } from '../fame/ladder';
import { wholeDollars } from '../finance';
import { clampInt, rollNormal } from '../random';
import { chance, createRng, nextFloat, nextInt, type RngState } from '../rng';
import type { Id, LifeState, SportsContract, SportsTeam, TransferOffer } from '../types';
import { clubPay, leaguePay, salaryFor } from './contract';
import { awayOf, divisionOf, hasDivisions, homeLeagueTeams, teamById, teamsOf, playingCountry, type ProTeam } from './league';
import { recentRating } from './query';
import { sportsHistory } from './text';
import { anotherTeam, keepPermit, proTeam, relocateForTeam, stablePick } from './team';

type SportPath = FamePathDef & { sport: SportDef };

// ── Academies ──────────────────────────────────────────────────────────────

/** The sport has youth academies tied to a club. */
export function hasAcademies(def: SportDef): boolean {
  return def.academy !== undefined;
}

/** The ages a child can be taken by an academy. */
export function academyAges(def: SportDef): { min: number; max: number; abroad: number } {
  return { min: def.academy?.minAge ?? 99, max: def.academy?.maxAge ?? 0, abroad: def.academy?.abroadMinAge ?? 99 };
}

/** The academy a child of your city can join: a pro club of your city (a stable pick for the life), else of your country. */
export function homeAcademyClub(state: LifeState, sportId: Id, content: ContentBundle): ProTeam | undefined {
  const home = state.character.cityId;
  const clubs = homeLeagueTeams(state, sportId, home, content);
  const here = clubs.filter((t) => t.city === home && t.cityName === undefined);
  const pool = here.length > 0 ? here : clubs;
  return pool.length === 0 ? undefined : stablePick(state, `academy:${home}`, [...pool].sort((a, b) => (a.id < b.id ? -1 : 1)));
}

/**
 * The clubs of a country the game does not model that take a trial from a UK child (one for each country, a stable pick for the
 * life); the child lives at home and commutes. Nobody else has one: a trial abroad for a child of another country would be a move
 * to another country, which a child cannot make.
 */
export function abroadAcademyClubs(state: LifeState, sportId: Id, content: ContentBundle): ProTeam[] {
  const home = state.character.cityId;
  const here = countryIdOfCity(home, content);
  const clubs = teamsOf(state, sportId, content).filter((t) => t.futureCountry === true && content.cities[t.city] !== undefined && countryIdOfCity(t.city, content) === here);
  const countries = [...new Set(clubs.map((t) => t.country!))].sort();
  return countries.map((c) => stablePick(state, `trial:${c}`, clubs.filter((t) => t.country === c).sort((a, b) => (a.id < b.id ? -1 : 1))));
}

/** A club's academy team, as the sports record keeps it. */
export function academyTeam(_state: LifeState, club: ProTeam, _sportId: Id, quality: number, content: ContentBundle): SportsTeam {
  const away = awayOf(club);
  return {
    id: null,
    name: `${club.name} ${content.text.sports.tiers.academy.suffix}`.trim(),
    city: club.city,
    level: 'youth',
    quality,
    tier: 'academy',
    ...(club.cityName !== undefined ? { place: club.cityName } : {}),
    ...(away !== undefined ? { away } : {}),
    ...(club.country !== undefined ? { country: club.country } : {}),
  };
}

/**
 * At the draft age the club decides about an academy graduate (Batch 6): its first team offers a deal (the draft's: a rookie deal
 * by where the club ranks you), or the academy lets you go. Returns the trigger it asks for, or null.
 */
export function academyIntake(state: LifeState, path: SportPath, score: number, content: ContentBundle, slot: { pick: number; round: number }): 'academy' | 'academyReleased' | null {
  const s = state.sports;
  const a = s.academy;
  const b = content.balance.sports;
  if (!a || s.pro || s.draft !== null) return null;
  const age = state.character.age;
  if (age < path.sport.draft.age) return null;
  const club = teamById(state, path.id, a.clubId, content);
  const keeps = club !== undefined && score + b.soccer.academy.promote.bonus >= b.draft.declare - b.soccer.academy.promote.keep;
  if (keeps && club) {
    const total = Math.max(1, homeLeagueTeams(state, path.id, state.character.cityId, content).length * path.sport.draft.rounds);
    const pick = slot.pick > 0 ? slot.pick : Math.max(1, total);
    s.draft = { year: state.currentYear, pick, round: Math.max(1, Math.ceil(pick / Math.max(1, homeLeagueTeams(state, path.id, state.character.cityId, content).length))), teamId: club.id, academy: true };
    s.combine = 0;
    return 'academy';
  }
  if (age >= path.sport.draft.force || !keeps) {
    s.academy = null;
    s.academyOut = state.currentYear;
    if (s.club?.tier === 'academy') s.club = null;
    if (s.team?.tier === 'academy') {
      s.team = null;
      s.teamless = true;
    }
    sportsHistory(state, 'academyReleased', content, { parent: club?.name ?? '' });
    return 'academyReleased';
  }
  return null;
}

// ── Loans ──────────────────────────────────────────────────────────────────

/** Clubs that would take you on loan: weaker than your own by about the balance's drop, in your country, in the same league or the one below. */
export function loanHosts(state: LifeState, path: SportPath, parent: ProTeam, content: ContentBundle): ProTeam[] {
  const L = content.balance.sports.soccer.loan;
  const home = state.character.cityId;
  const division = divisionOf(state, parent);
  return homeLeagueTeams(state, path.id, home, content, true).filter(
    (t) => t.id !== parent.id && t.quality <= parent.quality - L.drop / 2 && divisionOf(state, t) >= division && countryIdOfCity(t.city, content) === countryIdOfCity(home, content),
  );
}

/** Your club offers you a loan (a host club is picked for you). Returns whether it is on the table. */
export function offerLoan(state: LifeState, path: SportPath, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  if (!s.contract || s.loan || s.loanOffer) return false;
  const parent = teamById(state, path.id, s.contract.teamId, content);
  if (!parent) return false;
  const hosts = loanHosts(state, path, parent, content);
  if (hosts.length === 0) return false;
  s.loanOffer = { hostId: hosts[nextInt(rng, 0, hosts.length - 1)]!.id, year: state.currentYear };
  return true;
}

/** You go on loan: a season at the host club, the contract and its pay stay with your own. */
export function takeLoan(state: LifeState, path: SportPath, content: ContentBundle): boolean {
  const s = state.sports;
  const offer = s.loanOffer;
  const host = offer ? teamById(state, path.id, offer.hostId, content) : undefined;
  if (!offer || !host || !s.contract) return false;
  s.loanOffer = null;
  s.loan = { parentId: s.contract.teamId, hostId: host.id, since: state.currentYear, until: state.currentYear + 1 };
  s.team = proTeam(state, host, path.id, content);
  s.role = 'starter';
  s.ask = null;
  s.totals.loans += 1;
  relocateForTeam(state, host.city, content, s.contract.until);
  sportsHistory(state, 'loan', content);
  return true;
}

/** The loan ends: you are back with your own club. */
export function endLoan(state: LifeState, path: SportPath, content: ContentBundle): void {
  const s = state.sports;
  const loan = s.loan;
  if (!loan) return;
  s.loan = null;
  const parent = teamById(state, path.id, loan.parentId, content);
  if (parent && s.contract) {
    s.team = proTeam(state, parent, path.id, content);
    relocateForTeam(state, parent.city, content, s.contract.until);
  } else {
    // The deal ended while you were away: you are without a team.
    s.team = null;
  }
}

/** The club holds your contract, and sends you on loan or recalls you when its rules say so. Returns the triggers it asks for. */
export function loanStep(state: LifeState, path: SportPath, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const L = content.balance.sports.soccer.loan;
  if (s.loan && s.loan.until < state.currentYear) endLoan(state, path, content);
  if (s.loan || !s.contract || state.character.age > L.maxAge) return false;
  if (s.loanOffer && s.loanOffer.year < state.currentYear) s.loanOffer = null;
  const wanted = s.ask === 'loan' ? chance(rng, L.asked) : chance(rng, s.role === 'reserve' ? L.reserve : s.role === 'rotation' ? L.rotation : 0);
  if (s.ask === 'loan') {
    s.ask = null;
    if (!wanted) {
      state.fame.mood = clampInt(state.fame.mood - L.refusedMood, 0, 100);
      return false;
    }
  }
  return wanted && offerLoan(state, path, content, rng);
}

// ── Transfers ──────────────────────────────────────────────────────────────

/** What the market thinks a player is worth to a club (whole base dollars): years of the rung's pay times value by rating, by age and the years left on the deal. */
export function transferValue(state: LifeState, path: SportPath, content: ContentBundle): number {
  const T = content.balance.sports.soccer.transfer;
  const s = state.sports;
  const rating = recentRating(state);
  const rung = Math.max(state.fame.paths[path.id]?.rung ?? path.sport.proRung, path.sport.proRung);
  const left = s.contract ? Math.max(0, s.contract.until - state.currentYear + 1) : 0;
  return wholeDollars(leaguePay(path, rung) * T.fee * curveAt(T.value, rating) * curveAt(T.age, state.character.age) * (1 + T.yearsLeft * left));
}

/** A fresh window's offers: how many follows from your rating (more if you asked to be sold). Replaces the last window's. */
export function openWindow(state: LifeState, path: SportPath, content: ContentBundle, rng: RngState): number {
  const s = state.sports;
  const T = content.balance.sports.soccer.transfer;
  s.transfer = null;
  const mine = s.contract;
  if (!mine) return 0;
  const rating = recentRating(state);
  const asked = s.ask === 'trade';
  const expected = curveAt(T.offers, rating) * (asked ? T.asked : 1);
  let count = Math.floor(expected);
  if (nextFloat(rng) < expected - count) count += 1;
  count = Math.min(T.max, count);
  const offers: TransferOffer[] = [];
  const used = new Set<Id>([mine.teamId]);
  const rung = Math.max(state.fame.paths[path.id]?.rung ?? path.sport.proRung, path.sport.proRung);
  const value = transferValue(state, path, content);
  for (let i = 0; i < count; i++) {
    let club: ProTeam | undefined;
    for (let tries = 0; tries < 4 && !club; tries++) {
      const t = anotherTeam(state, path.id, mine.teamId, state.character.cityId, content, rng, rating);
      if (!used.has(t.id)) club = t;
    }
    if (!club) break;
    used.add(club.id);
    const pay = clubPay(state, path, club.id, content);
    const kind = rung >= path.sport.proRung + 2 ? 'star' : 'standard';
    const mult = T.wage.min + (T.wage.max - T.wage.min) * nextFloat(rng);
    const wage = wholeDollars(salaryFor(path, kind, rung, rating, content) * mult * pay);
    const fee = wholeDollars(value * pay);
    const years = nextInt(rng, T.years.min, Math.max(T.years.min, T.years.max));
    const clause = chance(rng, T.clause.chance) ? wholeDollars(fee * T.clause.multiple) : 0;
    offers.push({ id: `${state.currentYear}-${i}`, clubId: club.id, fee, wage, years, clause });
  }
  s.transfer = { year: state.currentYear, offers };
  return offers.length;
}

/** Why an offer can't be taken now, or null. */
export type TransferBlock = 'none' | 'gone' | 'loan' | 'prison';

export function transferBlock(state: LifeState, offerId: string, _content: ContentBundle): TransferBlock | null {
  const s = state.sports;
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (s.loan) return 'loan';
  if (!s.transfer || !s.contract) return 'none';
  return s.transfer.offers.some((o) => o.id === offerId) ? null : 'gone';
}

/** The best offer: the one that pays most, then the biggest club. */
export function bestOffer(state: LifeState, content: ContentBundle): TransferOffer | undefined {
  const offers = state.sports.transfer?.offers ?? [];
  const def = state.sports.sport ? content.famePaths[state.sports.sport] : undefined;
  const q = (o: TransferOffer): number => (def ? (teamById(state, def.id, o.clubId, content)?.quality ?? 0) : 0);
  return [...offers].sort((a, b) => b.wage - a.wage || q(b) - q(a) || (a.id < b.id ? -1 : 1))[0];
}

export type TransferResult = 'moved' | 'refused' | 'walked' | 'blocked';

/**
 * You take an offer. Your club has a say unless the fee meets your release clause: it agrees by the fee against your worth (a
 * reserve is easier to sell). With `push` your agent negotiates: the wage rises and a clause may be added if it works, and the
 * club may walk away if it does not. The fee moves between the clubs; your share is a signing-on payment through the ledger.
 */
export function takeTransfer(state: LifeState, path: SportPath, offerId: string, push: boolean, content: ContentBundle, rng: RngState): TransferResult {
  const s = state.sports;
  const T = content.balance.sports.soccer.transfer;
  if (transferBlock(state, offerId, content) !== null || !s.transfer || !s.contract) return 'blocked';
  const offer = s.transfer.offers.find((o) => o.id === offerId)!;
  const club = teamById(state, path.id, offer.clubId, content);
  if (!club) return 'blocked';
  const value = Math.max(1, transferValue(state, path, content));
  // Your club's say: none when the fee meets your release clause.
  const clause = s.contract.release ?? 0;
  const forced = clause > 0 && offer.fee >= clause;
  if (!forced) {
    const p = clampInt(100 * (T.consent.base + T.consent.slope * (offer.fee / value - 1) + (s.role === 'reserve' ? T.consent.reserve : 0)), 3, 97) / 100;
    if (!chance(rng, p)) {
      s.transfer.offers = s.transfer.offers.filter((o) => o.id !== offerId);
      state.fame.mood = clampInt(state.fame.mood - content.balance.sports.trade.refusedMood, 0, 100);
      return 'refused';
    }
  }
  let wage = offer.wage;
  let newClause = offer.clause;
  if (push && state.fame.agent) {
    if (chance(rng, curveAt(T.push.chance, agentTier(state, content)))) {
      wage = wholeDollars(wage * T.push.win);
      if (newClause === 0) newClause = wholeDollars(offer.fee * T.clause.multiple);
    } else if (chance(rng, T.push.walk)) {
      s.transfer.offers = s.transfer.offers.filter((o) => o.id !== offerId);
      return 'walked';
    }
  }
  const rung = Math.max(state.fame.paths[path.id]?.rung ?? path.sport.proRung, path.sport.proRung);
  const kind = rung >= path.sport.proRung + 2 ? 'star' : 'standard';
  const contract: SportsContract = {
    teamId: club.id,
    since: state.currentYear,
    until: state.currentYear + offer.years - 1,
    salary: wage,
    kind,
    option: 'none',
    ...(newClause > 0 ? { release: newClause } : {}),
  };
  s.pro = true;
  s.contract = contract;
  s.team = proTeam(state, club, path.id, content);
  s.teamless = false;
  s.unsigned = 0;
  s.playOut = false;
  s.ask = null;
  s.loan = null;
  s.loanOffer = null;
  s.transfer = null;
  s.traded = state.currentYear;
  s.totals.transfers += 1;
  s.totals.fees += offer.fee;
  relocateForTeam(state, club.city, content, contract.until);
  keepPermit(state, content);
  payFameMoney(state, offer.fee * T.signing, content);
  sportsHistory(state, 'transfer', content, { suitor: club.name });
  return 'moved';
}

/** Your club puts a release clause in a new deal (an extension): the sum is a multiple of what you are worth. */
export function addClause(state: LifeState, path: SportPath, content: ContentBundle, rng: RngState): void {
  const c = state.sports.contract;
  const T = content.balance.sports.soccer.transfer;
  if (!c || c.release !== undefined || !chance(rng, T.clause.chance)) return;
  c.release = wholeDollars(transferValue(state, path, content) * T.clause.multiple);
}

// ── The leagues ────────────────────────────────────────────────────────────

/** A club's strength in a year: its quality and the luck of that year, which depends on nothing but the life's seed, the club and the year. */
export function clubStrength(state: LifeState, t: ProTeam, year: number, content: ContentBundle): number {
  const rng = createRng(`${state.seed}:strength:${year}:${t.id}`);
  return t.quality + rollNormal(rng, { mean: 0, sd: content.balance.sports.league.strengthSd });
}

/**
 * The year's leagues are settled: in every country with two leagues the bottom clubs of the top league go down and the top clubs of
 * the second go up. Your own club's strength is how its season really went (`own`). Returns how your club moved, if it did.
 */
export function settleLeagues(state: LifeState, sportId: Id, content: ContentBundle, own: { teamId: Id; strength: number } | null): 'up' | 'down' | null {
  const def = content.famePaths[sportId]?.sport;
  if (!def || !hasDivisions(def)) return null;
  const moves = content.balance.sports.soccer.tiers.moves;
  const year = state.currentYear;
  const L = state.league;
  if (L.tierYear >= year) return null;
  const teams = teamsOf(state, sportId, content);
  const countries = [...new Set(teams.map((t) => playingCountry(t, content)))].sort();
  let mine: 'up' | 'down' | null = null;
  for (const c of countries) {
    const here = teams.filter((t) => playingCountry(t, content) === c);
    const strength = (t: ProTeam): number => (own && t.id === own.teamId ? own.strength : clubStrength(state, t, year, content));
    const rank = (div: 1 | 2): ProTeam[] => here.filter((t) => divisionOf(state, t) === div).sort((a, b) => strength(b) - strength(a) || (a.id < b.id ? -1 : 1));
    const top = rank(1);
    const second = rank(2);
    // Keep each league from emptying: never move more than half of a league.
    const n = Math.min(moves, Math.floor(top.length / 2), Math.floor(second.length / 2));
    const down = top.slice(top.length - n);
    const up = second.slice(0, n);
    const set = (t: ProTeam, div: 1 | 2): void => {
      if (div === t.tier) delete L.tiers[t.id];
      else L.tiers[t.id] = div;
      if (own && t.id === own.teamId) mine = div === 1 ? 'up' : 'down';
    };
    for (const t of down) set(t, 2);
    for (const t of up) set(t, 1);
  }
  L.tierYear = year;
  return mine;
}

/** The pay a signing-on payment is, for the report: the player's share of a fee. */
export function signingShare(fee: number, content: ContentBundle): number {
  return wholeDollars(fee * content.balance.sports.soccer.transfer.signing);
}

/** What an academy trial abroad costs in travel, scaled to where you live. */
export function trialFee(state: LifeState, content: ContentBundle): number {
  return scaledAmount(state, content.balance.sports.soccer.academy.abroad.fee, content);
}
