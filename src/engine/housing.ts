/**
 * Housing (docs/design.md, section J; docs/technical.md, Stage 6): where you
 * live and what it costs. Living with parents (they cover part of your costs,
 * by family wealth), renting (alone or with a roommate), owning (a down
 * payment and a mortgage through the debt system) and homelessness. Moving
 * city changes the city you live in; the city you were born in never
 * changes. Actions, effects and the yearly ledger all use these rules.
 */
import type { CityDef, ContentBundle, HousingKind, Lifestyle } from '../content/schemas';
import { addDebt, amortizedPayment, borrow, isIndependent, wholeDollars } from './finance';
import type { Id, LifeState, Person } from './types';

function cityOf(state: LifeState, content: ContentBundle, cityId: Id = state.character.cityId): CityDef {
  const city = content.cities[cityId];
  if (!city) throw new Error(`Unknown city "${cityId}"`);
  return city;
}

/**
 * A parent (or stepparent) who would take you in: alive and still in your
 * life (not estranged). The closest one, by affection, then id.
 */
export function supportingParent(state: LifeState): Person | null {
  let best: Person | null = null;
  let bestAffection = -1;
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if ((rel.kind !== 'parent' && rel.kind !== 'stepparent') || rel.status !== 'active' || !person?.alive) continue;
    if (rel.affection > bestAffection) {
      best = person;
      bestAffection = rel.affection;
    }
  }
  return best;
}

/** A year's rent in a city, alone or with a roommate. */
export function rentIn(city: CityDef, roommate: boolean, content: ContentBundle): number {
  return wholeDollars(city.baseRent * (roommate ? content.balance.economy.housing.roommateShare : 1));
}

/**
 * This year's cost of your home as the ledger charges it: your share of the
 * rent at your parents' (nothing as a child), your rent, or an owned home's
 * property tax and upkeep (the mortgage is paid as a debt).
 */
export function housingCost(state: LifeState, content: ContentBundle): number {
  const eco = content.balance.economy;
  const h = state.housing;
  const city = cityOf(state, content, h.cityId);
  switch (h.kind) {
    case 'with_parents':
      return isIndependent(state, content) ? wholeDollars(city.baseRent * eco.withParents.rentShare[state.character.familyWealth]) : 0;
    case 'renting':
      return rentIn(city, h.roommate === true, content);
    case 'owned':
      return wholeDollars((h.homeValue ?? 0) * eco.ownership.upkeep);
    case 'homeless':
    case 'incarcerated':
      return 0;
  }
}

/**
 * This year's living costs: the lifestyle tier in your city; a share of that
 * at your parents' (by family wealth); a bare share without a home; nothing
 * while your family pays for everything (childhood).
 */
export function livingCost(state: LifeState, content: ContentBundle, lifestyle: Lifestyle = state.finances.lifestyle): number {
  if (!isIndependent(state, content)) return 0;
  const eco = content.balance.economy;
  const base = eco.livingCost * cityOf(state, content).costOfLiving;
  switch (state.housing.kind) {
    case 'homeless':
      return wholeDollars(base * eco.homeless.livingShare);
    case 'incarcerated':
      return 0;
    case 'with_parents':
      return wholeDollars(base * eco.lifestyle[lifestyle].living * eco.withParents.livingShare[state.character.familyWealth]);
    default:
      return wholeDollars(base * eco.lifestyle[lifestyle].living);
  }
}

/** Recomputes the home's yearly cost shown on the Home screen. */
export function refreshHousingCost(state: LifeState, content: ContentBundle): void {
  state.housing.annualCost = housingCost(state, content);
}

/**
 * Moves you to a new home: its kind and city (the city you live in changes
 * with it). Owning is set up by buyHome; a roommate never moves with you. A
 * new home is a fresh start: years behind on the old one no longer count.
 */
export function moveTo(state: LifeState, kind: Exclude<HousingKind, 'owned'>, cityId: Id, content: ContentBundle): void {
  state.character.cityId = cityId;
  state.finances.hardshipYears = 0;
  state.housing = { kind, cityId, annualCost: 0, since: state.currentYear };
  refreshHousingCost(state, content);
}

/** Up-front cost of renting in a city: moving (across town or to another city) plus a deposit. */
export function moveInCost(state: LifeState, cityId: Id, content: ContentBundle): number {
  const { housing } = content.balance.economy;
  const moving = cityId === state.character.cityId ? housing.movingCost : housing.relocationCost;
  return wholeDollars(moving + rentIn(cityOf(state, content, cityId), false, content) * housing.deposit);
}

export type PurchaseBlock = 'savings' | 'income' | 'bankruptcy';

export interface PurchaseQuote {
  price: number;
  /** What you'd put down: as much as savings allow above the reserve, never below the minimum. */
  downPayment: number;
  closingCosts: number;
  mortgage: number;
  /** The mortgage's yearly payment. */
  yearlyPayment: number;
  /** Savings needed for the smallest down payment plus closing costs. */
  cashNeeded: number;
  /** Why a bank won't sell to you now, if it won't. */
  blocked: PurchaseBlock | null;
}

/** What buying a starter home in your city would take. */
export function purchaseQuote(state: LifeState, content: ContentBundle): PurchaseQuote {
  const eco = content.balance.economy;
  const own = eco.ownership;
  const price = cityOf(state, content).baseHomePrice;
  const closingCosts = wholeDollars(price * own.closingCosts);
  const minDown = wholeDollars(price * own.downPayment);
  const cashNeeded = minDown + closingCosts;
  const savings = state.finances.savings;
  const downPayment = Math.min(price, Math.max(minDown, savings - closingCosts - own.cashReserve));
  const mortgage = price - downPayment;
  const rate = eco.interest.debts.mortgage;
  const yearlyPayment = mortgage > 0 ? Math.max(eco.debts.minPayment, amortizedPayment(mortgage, rate, eco.debts.termYears.mortgage)) : 0;
  const gross = state.finances.lastLedger?.gross ?? 0;
  const bankrupt = state.finances.bankruptcyYear;
  let blocked: PurchaseBlock | null = null;
  if (savings < cashNeeded) blocked = 'savings';
  else if (mortgage > 0 && bankrupt !== undefined && state.currentYear - bankrupt < eco.bankruptcy.noMortgageYears) blocked = 'bankruptcy';
  else if (mortgage > 0 && yearlyPayment > gross * own.maxPaymentShare) blocked = 'income';
  return { price, downPayment, closingCosts, mortgage, yearlyPayment, cashNeeded, blocked };
}

/**
 * Buys a starter home in your city (the caller checks the quote isn't
 * blocked): savings pay the down payment and closing costs, and the rest is
 * a mortgage in the debt system.
 */
export function buyHome(state: LifeState, content: ContentBundle): void {
  const quote = purchaseQuote(state, content);
  state.finances.savings -= quote.downPayment + quote.closingCosts;
  const cityId = state.character.cityId;
  state.finances.hardshipYears = 0;
  state.housing = { kind: 'owned', cityId, annualCost: 0, homeValue: quote.price, since: state.currentYear };
  if (quote.mortgage > 0) state.housing.mortgageDebtId = addDebt(state, 'mortgage', quote.mortgage, content).id;
  refreshHousingCost(state, content);
}

/** What selling your home would bring in, after selling costs (before the mortgage is paid). */
export function saleProceeds(state: LifeState, content: ContentBundle, share = 1 - content.balance.economy.ownership.sellingCosts): number {
  return wholeDollars((state.housing.homeValue ?? 0) * share);
}

/**
 * Sells your home (at `share` of its value; a foreclosure sale brings in
 * less): the mortgage is paid from the proceeds and the rest goes to savings.
 * Proceeds that fall short leave the rest of the mortgage as personal debt.
 * You then rent in the same city.
 */
export function sellHome(state: LifeState, content: ContentBundle, share?: number): void {
  const proceeds = saleProceeds(state, content, share);
  const owed = mortgageBalance(state);
  state.finances.debts = state.finances.debts.filter((d) => d.id !== state.housing.mortgageDebtId);
  if (proceeds >= owed) state.finances.savings = wholeDollars(state.finances.savings + proceeds - owed);
  else borrow(state, owed - proceeds, content);
  moveTo(state, 'renting', state.character.cityId, content);
}

/** The mortgage on your home, if any. */
export function mortgageBalance(state: LifeState): number {
  return state.finances.debts.find((d) => d.id === state.housing.mortgageDebtId)?.balance ?? 0;
}
