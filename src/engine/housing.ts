/**
 * Housing (docs/design.md, section J; docs/technical.md, Stage 6): where you
 * live and what it costs. Living with parents (they cover part of your costs,
 * by family wealth), renting (alone or with a roommate), owning (a down
 * payment and a mortgage through the debt system) and homelessness. Moving
 * city changes the city you live in; the city you were born in never
 * changes. A partner or spouse can live with you in a rental or a home you
 * own and pay their share of it; they move with you, and move out when the
 * romance ends. Actions, effects and the yearly ledger all use these rules.
 */
import type { CityDef, ContentBundle, HousingKind, Lifestyle } from '../content/schemas';
import { addDebt, amortizedPayment, borrow, isIndependent, wholeDollars } from './finance';
import { relocateChildren } from './family/household';
import { countedRecord } from './record';
import { isCurrentPartner } from './relationships';
import { writeFromGroup } from './systems/history';
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
 * property tax and upkeep (the mortgage is paid as a debt). A partner living
 * with you pays their share of the rent or upkeep.
 */
export function housingCost(state: LifeState, content: ContentBundle): number {
  const eco = content.balance.economy;
  const h = state.housing;
  const city = cityOf(state, content, h.cityId);
  const shared = h.partnerId !== undefined ? eco.housing.partnerShare : 1;
  // In prison you keep a home you own (Stage 9): its upkeep is still due.
  if (h.kind === 'incarcerated') return h.homeValue !== undefined ? wholeDollars(h.homeValue * eco.ownership.upkeep * shared) : 0;
  switch (h.kind) {
    case 'with_parents':
      return isIndependent(state, content) ? wholeDollars(city.baseRent * eco.withParents.rentShare[state.character.familyWealth]) : 0;
    case 'renting':
      return wholeDollars(rentIn(city, h.roommate === true, content) * (h.rentFactor ?? 1) * shared);
    case 'owned':
      return wholeDollars((h.homeValue ?? 0) * eco.ownership.upkeep * shared);
    case 'homeless':
      return 0;
  }
}

/** You own a home: one you live in, or one waiting for you while you're in prison (Stage 9). */
export function ownsHome(state: LifeState): boolean {
  return state.housing.homeValue !== undefined;
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

/** The rent factor after a change of `percent` (C1): within the balance limits, kept to four decimals so saves stay tidy. */
function nextRentFactor(state: LifeState, percent: number, content: ContentBundle): number {
  const { min, max } = content.balance.economy.housing.rentFactor;
  const factor = Math.min(max, Math.max(min, (state.housing.rentFactor ?? 1) * (1 + percent / 100)));
  return Math.round(factor * 10000) / 10000;
}

/**
 * Your rent changes by `percent` of the current rent (C1), for as long as
 * you stay in this rental; it stays within the balance limits of the
 * city's base rent. Renting only.
 */
export function changeRent(state: LifeState, percent: number, content: ContentBundle): void {
  if (state.housing.kind !== 'renting') return;
  state.housing.rentFactor = nextRentFactor(state, percent, content);
  refreshHousingCost(state, content);
}

/** How much your yearly housing cost would change with a rent change of `percent` (C1); 0 when not renting. */
export function rentChangeAmount(state: LifeState, percent: number, content: ContentBundle): number {
  const h = state.housing;
  if (h.kind !== 'renting') return 0;
  const next: LifeState = { ...state, housing: { ...h, rentFactor: nextRentFactor(state, percent, content) } };
  return housingCost(next, content) - housingCost(state, content);
}

/** Recomputes the home's yearly cost shown on the Home screen. */
export function refreshHousingCost(state: LifeState, content: ContentBundle): void {
  state.housing.annualCost = housingCost(state, content);
}

/**
 * Moves you to a new home: its kind and city (the city you live in changes
 * with it). Owning is set up by buyHome; a roommate never moves with you. A
 * partner living with you comes along to a new rental, but not back to your
 * parents' or onto the street. A new home is a fresh start: years behind on
 * the old one no longer count.
 */
export function moveTo(state: LifeState, kind: Exclude<HousingKind, 'owned'>, cityId: Id, content: ContentBundle): void {
  const partnerId = kind === 'renting' ? state.housing.partnerId : undefined;
  state.character.cityId = cityId;
  state.finances.hardshipYears = 0;
  state.housing = { kind, cityId, annualCost: 0, since: state.currentYear };
  if (partnerId !== undefined) livingTogether(state, partnerId);
  // E2a: children who live with you come along.
  relocateChildren(state);
  refreshHousingCost(state, content);
}

/** Records that this partner lives with you (and in your city). */
function livingTogether(state: LifeState, partnerId: Id): void {
  state.housing.partnerId = partnerId;
  const person = state.people[partnerId];
  if (person) person.cityId = state.character.cityId;
}

/**
 * Whether you and this person can move in together: your current partner,
 * fiancé or spouse, not already living with you, you old enough to choose
 * where you live (they are an adult: romance is adults only).
 */
export function canMoveInTogether(state: LifeState, personId: Id, content: ContentBundle): boolean {
  const rel = state.relationships[personId];
  return (
    rel !== undefined &&
    isCurrentPartner(state, rel) &&
    isIndependent(state, content) &&
    state.housing.partnerId !== personId &&
    state.housing.kind !== 'incarcerated'
  );
}

/**
 * You and your partner move in together, in your home: a rental or a home
 * you own. From your parents' or from the street, the two of you rent a
 * place in your city. A roommate moves out.
 */
export function moveInTogether(state: LifeState, personId: Id, content: ContentBundle): void {
  if (!canMoveInTogether(state, personId, content)) return;
  if (state.housing.kind === 'with_parents' || state.housing.kind === 'homeless') moveTo(state, 'renting', state.character.cityId, content);
  delete state.housing.roommate;
  livingTogether(state, personId);
  refreshHousingCost(state, content);
}

/**
 * A partner who lives with you but is no longer your partner (a breakup, a
 * divorce, a death) no longer does: you keep the home and its whole cost.
 * A breakup or divorce writes a history entry; a death has its own.
 */
export function settleHousehold(state: LifeState, content: ContentBundle): void {
  const id = state.housing.partnerId;
  if (id === undefined) return;
  const rel = state.relationships[id];
  const person = state.people[id];
  if (rel && isCurrentPartner(state, rel)) return;
  delete state.housing.partnerId;
  refreshHousingCost(state, content);
  if (person?.alive) {
    writeFromGroup(
      state,
      content.text.history.home.movedApart,
      ['home', 'movedApart', `person:${id}`],
      { roles: { npc: { name: person.name, pronouns: person.identity.pronouns } } },
      content,
    );
  }
}

/**
 * Up-front cost of renting in a city: moving (across town or to another city)
 * plus a deposit. Landlords ask more of someone with probation or prison on
 * their record recently (balance/legal.yaml record, Stage 9); from 18,
 * offenses from before 18 don't count.
 */
export function moveInCost(state: LifeState, cityId: Id, content: ContentBundle): number {
  const { housing } = content.balance.economy;
  const { record } = content.balance.legal;
  const moving = cityId === state.character.cityId ? housing.movingCost : housing.relocationCost;
  const flagged = countedRecord(state, content).some((r) => (r.outcome === 'probation' || r.outcome === 'jail') && state.currentYear - r.year <= record.recentYears);
  const deposit = housing.deposit * (flagged ? record.depositMultiplier : 1);
  return wholeDollars(moving + rentIn(cityOf(state, content, cityId), false, content) * deposit);
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
  const income = (state.finances.lastLedger?.gross ?? 0) + (state.finances.lastLedger?.retirement ?? 0);
  const bankrupt = state.finances.bankruptcyYear;
  let blocked: PurchaseBlock | null = null;
  if (savings < cashNeeded) blocked = 'savings';
  else if (mortgage > 0 && bankrupt !== undefined && state.currentYear - bankrupt < eco.bankruptcy.noMortgageYears) blocked = 'bankruptcy';
  else if (mortgage > 0 && yearlyPayment > income * own.maxPaymentShare) blocked = 'income';
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
  const partnerId = state.housing.partnerId;
  state.finances.hardshipYears = 0;
  state.housing = { kind: 'owned', cityId, annualCost: 0, homeValue: quote.price, since: state.currentYear };
  if (quote.mortgage > 0) state.housing.mortgageDebtId = addDebt(state, 'mortgage', quote.mortgage, content).id;
  if (partnerId !== undefined) livingTogether(state, partnerId);
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
 * You then rent in the same city; in prison (a foreclosure while you're
 * inside) you stay where you are, with no home to go back to, and a partner
 * who lived there no longer lives with you.
 */
export function sellHome(state: LifeState, content: ContentBundle, share?: number): void {
  const proceeds = saleProceeds(state, content, share);
  const owed = mortgageBalance(state);
  state.finances.debts = state.finances.debts.filter((d) => d.id !== state.housing.mortgageDebtId);
  if (proceeds >= owed) state.finances.savings = wholeDollars(state.finances.savings + proceeds - owed);
  else borrow(state, owed - proceeds, content);
  if (state.housing.kind === 'incarcerated') {
    delete state.housing.homeValue;
    delete state.housing.mortgageDebtId;
    delete state.housing.partnerId;
    // E5: the renovations went with the home.
    delete state.housing.renovations;
    refreshHousingCost(state, content);
    return;
  }
  moveTo(state, 'renting', state.character.cityId, content);
}

/** The mortgage on your home, if any. */
export function mortgageBalance(state: LifeState): number {
  return state.finances.debts.find((d) => d.id === state.housing.mortgageDebtId)?.balance ?? 0;
}
