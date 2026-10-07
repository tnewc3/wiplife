/**
 * Homes beyond the one you live in (E5): vacation homes as extra owned
 * properties (a price, a mortgage through the debt system, yearly upkeep
 * and insurance, a value that grows), damage and foreclosure, and
 * renovations, which raise a home's value and make it more comfortable to
 * live in (for the home you own and live in, and for a vacation home).
 * Every payment goes through the finance module. Numbers come from
 * src/content/balance/possessions.yaml and the economy's ownership numbers.
 */
import type { ContentBundle, DamageSeverityId, RenovationDef } from '../../content/schemas';
import { addDebt, amortizedPayment, borrow, earn, isIndependent, spend, wholeDollars } from '../finance';
import { refreshHousingCost } from '../housing';
import { clampInt } from '../random';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState, Possession, Renovation } from '../types';
import { dropPossession } from './vehicles';
import { homeOf, loanIdOf, nextPossessionId, possessionById, vacationHomesOf, VACATION_HOME } from './query';


const hb = (content: ContentBundle) => content.balance.possessions.homes;

function cityName(content: ContentBundle, cityId: Id): string {
  return content.cities[cityId]?.name ?? cityId;
}

export type VacationBlock = 'age' | 'limit' | 'savings' | 'bankruptcy' | 'income' | 'prison' | 'unknown';

export interface VacationQuote {
  cityId: Id;
  price: number;
  downPayment: number;
  closingCosts: number;
  mortgage: number;
  yearlyPayment: number;
  rate: number;
  /** Savings needed for the down payment and closing costs. */
  cashNeeded: number;
  blocked: VacationBlock | null;
}

/** What buying a vacation home in this city would take. */
export function vacationQuote(state: LifeState, cityId: Id, content: ContentBundle): VacationQuote {
  const eco = content.balance.economy;
  const v = hb(content).vacation;
  const city = content.cities[cityId];
  const price = city ? wholeDollars(city.baseHomePrice * v.priceShare) : 0;
  const closingCosts = wholeDollars(price * eco.ownership.closingCosts);
  const downPayment = wholeDollars(price * eco.ownership.downPayment);
  const mortgage = price - downPayment;
  const rate = eco.interest.debts.mortgage + v.rateExtra;
  const yearlyPayment = mortgage > 0 ? Math.max(eco.debts.minPayment, amortizedPayment(mortgage, rate, eco.debts.termYears.mortgage)) : 0;
  const cashNeeded = downPayment + closingCosts;
  const income = (state.finances.lastLedger?.gross ?? 0) + (state.finances.lastLedger?.retirement ?? 0);
  const existing = state.finances.debts.filter((d) => d.kind === 'mortgage').reduce((sum, d) => sum + d.minPayment, 0);
  const bankrupt = state.finances.bankruptcyYear;
  let blocked: VacationBlock | null = null;
  if (!city || city.retired) blocked = 'unknown';
  else if (!isIndependent(state, content)) blocked = 'age';
  else if (state.housing.kind === 'incarcerated') blocked = 'prison';
  else if (vacationHomesOf(state).length >= content.balance.possessions.limits.vacationHomes) blocked = 'limit';
  else if (state.finances.savings < cashNeeded) blocked = 'savings';
  else if (bankrupt !== undefined && state.currentYear - bankrupt < eco.bankruptcy.noMortgageYears) blocked = 'bankruptcy';
  else if (existing + yearlyPayment > income * v.maxPaymentShare) blocked = 'income';
  return { cityId, price, downPayment, closingCosts, mortgage, yearlyPayment, rate, cashNeeded, blocked };
}

/** Buys a vacation home (the caller has checked the quote isn't blocked): the down payment and closing costs from savings, the rest a mortgage in the debt system. */
export function buyVacationHome(state: LifeState, cityId: Id, content: ContentBundle): Possession {
  const quote = vacationQuote(state, cityId, content);
  spend(state, quote.downPayment + quote.closingCosts, content);
  const home = { cityId, insured: true, renovations: [] as Renovation[] } as NonNullable<Possession['home']>;
  if (quote.mortgage > 0) home.mortgageDebtId = addDebt(state, 'mortgage', quote.mortgage, content, { annualRate: quote.rate }).id;
  const p: Possession = { id: nextPossessionId(state), kind: 'home', defId: VACATION_HOME, acquired: state.currentYear, value: quote.price, condition: 85, home };
  state.possessions.items.push(p);
  writeFromGroup(state, content.text.possessions.history.vacationBought, ['possessions', 'vacationBought', `city:${cityId}`], { values: { city: cityName(content, cityId) } }, content);
  return p;
}

/** What selling a vacation home would leave you after selling costs and its mortgage (negative: the mortgage is more). */
export function vacationSaleNet(state: LifeState, p: Possession, content: ContentBundle): number {
  const owed = state.finances.debts.find((d) => d.id === loanIdOf(p))?.balance ?? 0;
  return wholeDollars(p.value * (1 - content.balance.economy.ownership.sellingCosts)) - owed;
}

function settleHomeSale(state: LifeState, p: Possession, proceeds: number, content: ContentBundle): void {
  const owed = state.finances.debts.find((d) => d.id === loanIdOf(p))?.balance ?? 0;
  dropPossession(state, p);
  if (proceeds >= owed) earn(state, proceeds - owed);
  else borrow(state, owed - proceeds, content);
}

/** Sells a vacation home: selling costs, then its mortgage, and what's left goes to savings (a shortfall becomes personal debt). */
export function sellVacationHome(state: LifeState, id: Id, content: ContentBundle): void {
  const p = possessionById(state, id);
  if (!p || p.kind !== 'home') return;
  const city = cityName(content, homeOf(p).cityId);
  settleHomeSale(state, p, wholeDollars(p.value * (1 - content.balance.economy.ownership.sellingCosts)), content);
  writeFromGroup(state, content.text.possessions.history.vacationSold, ['possessions', 'vacationSold'], { values: { city } }, content);
}

/** The lender takes a vacation home after missed payments: it sells at the foreclosure share of its value. */
export function foreclosePossession(state: LifeState, p: Possession, content: ContentBundle): void {
  const city = cityName(content, homeOf(p).cityId);
  settleHomeSale(state, p, wholeDollars(p.value * content.balance.economy.missed.foreclosureSale), content);
  writeFromGroup(state, content.text.possessions.history.vacationForeclosed, ['possessions', 'vacationForeclosed'], { values: { city } }, content);
}

/** Yearly upkeep (property tax, maintenance) on your vacation homes, and their insurance. */
export function vacationUpkeep(state: LifeState, content: ContentBundle): { upkeep: number; insurance: number } {
  const v = hb(content).vacation;
  let upkeep = 0;
  let insurance = 0;
  for (const p of vacationHomesOf(state)) {
    upkeep += wholeDollars(p.value * v.upkeep);
    if (homeOf(p).insured) insurance += wholeDollars(p.value * v.insurance);
  }
  return { upkeep, insurance };
}

/** Insurance on or off for every vacation home you own. */
export function setHomeInsurance(state: LifeState, insured: boolean): void {
  for (const p of vacationHomesOf(state)) homeOf(p).insured = insured;
}

/**
 * A vacation home is damaged by `severity`. Minor and major damage is
 * repaired (a share of its value; insured, you pay the deductible and a
 * claim is made). A total loss: insured, the insurer pays out a share of the
 * value (its mortgage paid from that); uninsured it is gone and the mortgage
 * stays owed as personal debt. Returns what you paid, what the insurer paid, and whether it was lost.
 */
export function damageHome(state: LifeState, p: Possession, severity: DamageSeverityId, content: ContentBundle): { paid: number; payout: number; claim: boolean; lost: boolean } {
  const h = hb(content).vacation;
  const insured = homeOf(p).insured;
  const out = { paid: 0, payout: 0, claim: false, lost: false };
  if (severity === 'total') {
    out.lost = true;
    if (insured) {
      out.payout = wholeDollars(p.value * h.totalPayout);
      out.claim = true;
      state.possessions.claims.push(state.currentYear);
    }
    const city = cityName(content, homeOf(p).cityId);
    settleHomeSale(state, p, out.payout, content);
    writeFromGroup(state, content.text.possessions.history.vacationSold, ['possessions', 'vacationLost'], { values: { city } }, content);
    return out;
  }
  const cost = Math.max(200, wholeDollars(p.value * h.repair[severity]));
  if (insured) {
    out.paid = Math.min(cost, content.balance.possessions.vehicles.insurance.deductible);
    out.claim = true;
    state.possessions.claims.push(state.currentYear);
  } else {
    out.paid = cost;
  }
  spend(state, out.paid, content);
  p.condition = clampInt(p.condition - (severity === 'major' ? 12 : 3), 0, 100);
  return out;
}

/** A renovation's comfort now: full for `lastsYears`, then fading to nothing over `fadeYears`. */
export function renovationComfort(r: Renovation, year: number, content: ContentBundle): number {
  const def = content.renovations[r.id];
  if (!def) return 0;
  const reno = hb(content).renovation;
  const age = year - r.year;
  if (age <= reno.lastsYears) return def.comfort;
  const left = 1 - (age - reno.lastsYears) / reno.fadeYears;
  return left > 0 ? def.comfort * left : 0;
}

/** Renovations that still count toward comfort (they haven't faded away). */
export function activeRenovations(list: readonly Renovation[], year: number, content: ContentBundle): Renovation[] {
  return list.filter((r) => renovationComfort(r, year, content) > 0);
}

/** Where a renovation can happen: the home you own and live in ('main'), or one of your vacation homes (its possession id). */
export type RenovationTarget = 'main' | Id;

/** A target's current value, renovations and city name, or null when you can't renovate there. */
export function renovationSite(state: LifeState, target: RenovationTarget): { value: number; renovations: Renovation[]; city: Id } | null {
  if (target === 'main') {
    const h = state.housing;
    if ((h.kind !== 'owned' && !(h.kind === 'incarcerated' && h.homeValue !== undefined)) || h.homeValue === undefined) return null;
    return { value: h.homeValue, renovations: h.renovations ?? [], city: h.cityId };
  }
  const p = possessionById(state, target);
  if (!p || p.kind !== 'home') return null;
  return { value: p.value, renovations: homeOf(p).renovations, city: homeOf(p).cityId };
}

export type RenovationBlock = 'nowhere' | 'savings' | 'cooldown' | 'limit' | 'prison' | 'unknown';

export interface RenovationQuote {
  cost: number;
  /** The value it adds. */
  gain: number;
  blocked: RenovationBlock | null;
}

/** What a renovation would cost and add at this home, and whether it can be done now. */
export function renovationQuote(state: LifeState, target: RenovationTarget, def: RenovationDef | undefined, content: ContentBundle): RenovationQuote {
  const site = renovationSite(state, target);
  if (!def || def.retired) return { cost: 0, gain: 0, blocked: 'unknown' };
  if (!site) return { cost: 0, gain: 0, blocked: 'nowhere' };
  const cost = wholeDollars(site.value * def.cost);
  const gain = wholeDollars(site.value * def.value);
  let blocked: RenovationBlock | null = null;
  if (state.housing.kind === 'incarcerated') blocked = 'prison';
  else if (site.renovations.some((r) => r.id === def.id && state.currentYear - r.year < def.cooldownYears)) blocked = 'cooldown';
  else if (activeRenovations(site.renovations, state.currentYear, content).length >= hb(content).renovation.maxActive) blocked = 'limit';
  else if (state.finances.savings < cost) blocked = 'savings';
  return { cost, gain, blocked };
}

/** Renovates (the caller has checked the quote isn't blocked): paid from savings, the home's value goes up, and it is more comfortable to live in. */
export function renovate(state: LifeState, target: RenovationTarget, def: RenovationDef, content: ContentBundle): void {
  const quote = renovationQuote(state, target, def, content);
  const site = renovationSite(state, target)!;
  spend(state, quote.cost, content);
  const done: Renovation = { id: def.id, year: state.currentYear };
  if (target === 'main') {
    state.housing.homeValue = (state.housing.homeValue ?? 0) + quote.gain;
    state.housing.renovations = [...(state.housing.renovations ?? []), done];
    refreshHousingCost(state, content);
  } else {
    const p = possessionById(state, target)!;
    p.value += quote.gain;
    p.condition = clampInt(p.condition + def.comfort * 3, 0, 100);
    homeOf(p).renovations.push(done);
  }
  const s = state.character.stats;
  s.happiness = clampInt(s.happiness + def.happiness, 0, 100);
  writeFromGroup(state, content.text.possessions.history.renovated, ['possessions', 'renovated', `renovation:${def.id}`], { values: { renovation: def.name.toLowerCase(), city: cityName(content, site.city) } }, content);
}

/** The comfort of every home you own right now, in points (the home you live in and your vacation homes). */
export function totalComfort(state: LifeState, content: ContentBundle): number {
  let total = 0;
  for (const r of state.housing.renovations ?? []) total += renovationComfort(r, state.currentYear, content);
  for (const p of vacationHomesOf(state)) for (const r of homeOf(p).renovations) total += renovationComfort(r, state.currentYear, content);
  return total;
}

/** The stat pulls comfort and vacation homes bring each year, as a happiness pull (the caller applies it). */
export function comfortPull(state: LifeState, content: ContentBundle): { perYear: number; limit: number } {
  const r = hb(content).renovation;
  return { perYear: Math.min(r.max, totalComfort(state, content) * r.perPoint), limit: r.limit };
}
