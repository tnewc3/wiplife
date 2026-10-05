/**
 * Vehicles (E5): buying new or used, with cash or a car loan; value and
 * condition; servicing; insurance premiums and claims; damage, theft and
 * accidents; selling. Every payment goes through the finance module (savings,
 * then debt; a car loan is a debt of kind `auto`). Numbers come from
 * src/content/balance/possessions.yaml.
 */
import type { ContentBundle, DamageSeverityId } from '../../content/schemas';
import { curveAt, powInt } from '../curve';
import { addDebt, amortizedPayment, borrow, earn, isIndependent, spend, wholeDollars } from '../finance';
import { clampInt } from '../random';
import { nextInt } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState, Possession } from '../types';
import { jobNeedsVehicle } from './jobs';
import { costOfLiving, loanIdOf, nextPossessionId, possessionById, vehicleAge, vehicleDef, vehicleOf, vehiclesOf } from './query';

const vb = (content: ContentBundle) => content.balance.possessions.vehicles;

/** A vehicle's market value: the new price, less depreciation for its age, by its condition; never below the floor. */
export function marketValue(price: number, age: number, condition: number, content: ContentBundle): number {
  const d = vb(content).depreciation;
  const aged = age <= 0 ? 1 : (1 - d.first) * powInt(1 - d.yearly, age - 1);
  const value = price * Math.max(d.floor, aged) * curveAt(vb(content).conditionValue, condition);
  return wholeDollars(Math.max(price * d.floor * 0.5, value));
}

/** Recomputes a vehicle's value from its age and condition. */
export function refreshVehicleValue(state: LifeState, p: Possession, content: ContentBundle): void {
  p.value = marketValue(vehicleDef(content, p).price, vehicleAge(state, p), p.condition, content);
}

/** Claims in the years that raise your premium. */
export function recentClaims(state: LifeState, content: ContentBundle): number {
  const { years, max } = vb(content).insurance.claim;
  return Math.min(max, state.possessions.claims.filter((y) => state.currentYear - y < years).length);
}

/** A drunk-driving offense on your record in the years that raise your premium. */
export function recentDui(state: LifeState, content: ContentBundle): boolean {
  const r = vb(content).insurance.record;
  return state.legal.record.some((e) => e.offenseId === r.offenseId && state.currentYear - e.year < r.years);
}

/** This year's premium for one insured vehicle: its base, by your age, your claims and record, and your city. */
export function premium(state: LifeState, p: Possession, content: ContentBundle): number {
  if (!vehicleOf(p).insured) return 0;
  const ins = vb(content).insurance;
  const base = vehicleDef(content, p).insurance * curveAt(ins.age, state.character.age);
  const surcharge = 1 + ins.claim.surcharge * recentClaims(state, content) + (recentDui(state, content) ? ins.record.surcharge : 0);
  const city = 1 + (costOfLiving(state, content) - 1) * ins.cityShare;
  return wholeDollars(base * surcharge * city);
}

/** A vehicle's running costs this year: fuel, parking, registration and routine upkeep, scaled to your city. */
export function vehicleUpkeep(state: LifeState, p: Possession, content: ContentBundle): number {
  return wholeDollars(vehicleDef(content, p).upkeep * costOfLiving(state, content));
}

export type VehicleBlock = 'age' | 'limit' | 'savings' | 'unknown' | 'used';
export type LoanBlock = 'independent' | 'bankruptcy' | 'income';

export interface VehicleQuote {
  defId: Id;
  used: boolean;
  price: number;
  fees: number;
  /** Paying in cash: the price and the fees. */
  cash: number;
  /** Why you can't pay in cash, if you can't. */
  cashBlock: VehicleBlock | null;
  loan: {
    /** What you put down now: the smallest down payment and the fees. */
    down: number;
    amount: number;
    yearlyPayment: number;
    termYears: number;
    block: VehicleBlock | LoanBlock | null;
  };
}

/** What buying a vehicle would cost, in cash or with a car loan. */
export function vehicleQuote(state: LifeState, defId: Id, used: boolean, content: ContentBundle): VehicleQuote {
  const def = content.vehicles[defId];
  const b = vb(content);
  const price = def ? wholeDollars(def.price * (used ? b.used.priceShare : 1)) : 0;
  const fees = wholeDollars(price * b.fees);
  const cash = price + fees;
  let base: VehicleBlock | null = null;
  if (!def || def.retired) base = 'unknown';
  else if (used && !def.used) base = 'used';
  else if (state.character.age < content.balance.possessions.drivingAge) base = 'age';
  else if (vehiclesOf(state).length >= content.balance.possessions.limits.vehicles) base = 'limit';
  const cashBlock = base ?? (state.finances.savings < cash ? 'savings' : null);

  const amount = wholeDollars(price * (1 - b.loan.minDown));
  const down = cash - amount;
  const rate = content.balance.economy.interest.debts.auto;
  const yearlyPayment = amount > 0 ? Math.max(content.balance.economy.debts.minPayment, amortizedPayment(amount, rate, b.loan.termYears)) : 0;
  const income = (state.finances.lastLedger?.gross ?? 0) + (state.finances.lastLedger?.retirement ?? 0);
  const bankrupt = state.finances.bankruptcyYear;
  let loanBlock: VehicleQuote['loan']['block'] = base;
  if (loanBlock === null) {
    if (!isIndependent(state, content)) loanBlock = 'independent';
    else if (state.finances.savings < down) loanBlock = 'savings';
    else if (bankrupt !== undefined && state.currentYear - bankrupt < content.balance.economy.bankruptcy.noMortgageYears) loanBlock = 'bankruptcy';
    else if (yearlyPayment > income * b.loan.maxPaymentShare) loanBlock = 'income';
  }
  return { defId, used, price, fees, cash, cashBlock, loan: { down, amount, yearlyPayment, termYears: b.loan.termYears, block: loanBlock } };
}

/**
 * Buys a vehicle (the caller has checked the quote isn't blocked for this
 * way of paying): cash pays the price and fees; a loan puts the smallest
 * down payment and the fees down and borrows the rest as a car loan. A used
 * vehicle's condition and age are rolled from the life's generator. It is
 * insured at first. Returns the new possession.
 */
export function buyVehicle(state: LifeState, defId: Id, used: boolean, withLoan: boolean, content: ContentBundle): Possession {
  const quote = vehicleQuote(state, defId, used, content);
  const b = vb(content);
  const def = content.vehicles[defId]!;
  const condition = used ? nextInt(state.rng, b.used.condition.min, b.used.condition.max) : 100;
  const startAge = used ? nextInt(state.rng, b.used.age.min, b.used.age.max) : 0;
  const id = nextPossessionId(state);
  const vehicle = { startAge, insured: true } as Possession['vehicle'] & object;
  const p: Possession = { id, kind: 'vehicle', defId, acquired: state.currentYear, value: 0, condition, vehicle };
  if (withLoan) {
    spend(state, quote.loan.down, content);
    vehicle.loanDebtId = addDebt(state, 'auto', quote.loan.amount, content, { termYears: b.loan.termYears }).id;
  } else {
    spend(state, quote.cash, content);
  }
  state.possessions.items.push(p);
  refreshVehicleValue(state, p, content);
  writeFromGroup(state, content.text.possessions.history.vehicleBought, ['possessions', 'vehicleBought', `vehicle:${defId}`], { values: { vehicle: def.name } }, content);
  return p;
}

/** Why you can't sell this vehicle now, or null: it is the only one and a job you hold needs one. */
export function sellBlock(state: LifeState, p: Possession, content: ContentBundle): 'job' | null {
  return vehiclesOf(state).length <= 1 && vehiclesOf(state).some((v) => v.id === p.id) && jobNeedsVehicle(state, content) ? 'job' : null;
}

/** What selling would put in your hands after paying off its loan (negative: the loan is more than it brings). */
export function saleNet(state: LifeState, p: Possession, content: ContentBundle): number {
  const owed = state.finances.debts.find((d) => d.id === loanIdOf(p))?.balance ?? 0;
  return wholeDollars(p.value * vb(content).sellShare) - owed;
}

/** Removes a possession and its attached debt record (the caller settles the money first). */
export function dropPossession(state: LifeState, p: Possession): void {
  state.possessions.items = state.possessions.items.filter((q) => q.id !== p.id);
  const id = loanIdOf(p);
  if (id !== undefined) state.finances.debts = state.finances.debts.filter((d) => d.id !== id);
}

/** Settles a loan from the proceeds of a sale: what is left goes to savings; a shortfall becomes personal debt. */
function settleSale(state: LifeState, p: Possession, proceeds: number, content: ContentBundle): void {
  const owed = state.finances.debts.find((d) => d.id === loanIdOf(p))?.balance ?? 0;
  dropPossession(state, p);
  if (proceeds >= owed) earn(state, proceeds - owed);
  else borrow(state, owed - proceeds, content);
}

/** Sells a vehicle (the caller has checked it can be sold): the sale pays off its loan first. */
export function sellVehicle(state: LifeState, id: Id, content: ContentBundle): void {
  const p = possessionById(state, id);
  if (!p || p.kind !== 'vehicle') return;
  const name = vehicleDef(content, p).name;
  settleSale(state, p, wholeDollars(p.value * vb(content).sellShare), content);
  writeFromGroup(state, content.text.possessions.history.vehicleSold, ['possessions', 'vehicleSold'], { values: { vehicle: name } }, content);
}

/** A full service is possible: once a year, and you can pay for it from savings. */
export function canService(state: LifeState, p: Possession, content: ContentBundle): boolean {
  return vehicleOf(p).serviceYear !== state.currentYear && p.condition < 100 && state.finances.savings >= serviceCost(state, p, content);
}

export function serviceCost(state: LifeState, p: Possession, content: ContentBundle): number {
  return wholeDollars(vehicleDef(content, p).service * costOfLiving(state, content));
}

/** A full service: paid, and the condition goes up. */
export function serviceVehicle(state: LifeState, id: Id, content: ContentBundle): void {
  const p = possessionById(state, id);
  if (!p || p.kind !== 'vehicle') return;
  spend(state, serviceCost(state, p, content), content);
  p.condition = clampInt(p.condition + vb(content).serviceGain, 0, 100);
  vehicleOf(p).serviceYear = state.currentYear;
  refreshVehicleValue(state, p, content);
}

/** Insurance on or off for every vehicle you own. */
export function setVehicleInsurance(state: LifeState, insured: boolean): void {
  for (const p of vehiclesOf(state)) vehicleOf(p).insured = insured;
}

/** What happened to a vehicle: what you paid, what the insurer paid, whether it was lost. */
export interface DamageResult {
  paid: number;
  payout: number;
  claim: boolean;
  lost: boolean;
}

/**
 * A vehicle is damaged by `severity`. Minor and major damage is repaired
 * (the cost is a share of the new price; insured, you pay the deductible and
 * a claim is made, which raises your premiums). A total loss: insured, the
 * insurer pays out a share of the value, uninsured it is simply gone; what
 * you still owe on a car loan stays owed.
 */
export function damageVehicle(state: LifeState, p: Possession, severity: DamageSeverityId, content: ContentBundle): DamageResult {
  const b = vb(content);
  const def = vehicleDef(content, p);
  const insured = vehicleOf(p).insured;
  const result: DamageResult = { paid: 0, payout: 0, claim: false, lost: false };
  if (severity === 'total') {
    result.lost = true;
    if (insured) {
      result.payout = wholeDollars(p.value * b.insurance.totalPayout);
      result.claim = true;
      state.possessions.claims.push(state.currentYear);
    }
    loseVehicle(state, p, result.payout, content);
    return result;
  }
  const repair = b.repair[severity];
  const cost = Math.max(100, wholeDollars(def.price * repair.cost));
  if (insured) {
    result.paid = Math.min(cost, b.insurance.deductible);
    result.claim = true;
    state.possessions.claims.push(state.currentYear);
  } else {
    result.paid = cost;
  }
  spend(state, result.paid, content);
  p.condition = clampInt(p.condition - repair.condition, 0, 100);
  refreshVehicleValue(state, p, content);
  return result;
}

/** A vehicle is gone (a total loss or stolen). A payout goes to savings; the loan on it stays as a personal debt. */
export function loseVehicle(state: LifeState, p: Possession, payout: number, content: ContentBundle): void {
  const name = vehicleDef(content, p).name;
  const owed = state.finances.debts.find((d) => d.id === loanIdOf(p))?.balance ?? 0;
  dropPossession(state, p);
  if (payout >= owed) earn(state, payout - owed);
  else borrow(state, owed - payout, content);
  writeFromGroup(state, content.text.possessions.history.vehicleLost, ['possessions', 'vehicleLost'], { values: { vehicle: name } }, content);
}

/** A vehicle is stolen: the insurer pays out when it is insured. */
export function stealVehicle(state: LifeState, p: Possession, content: ContentBundle): DamageResult {
  const insured = vehicleOf(p).insured;
  const payout = insured ? wholeDollars(p.value * vb(content).insurance.totalPayout) : 0;
  if (insured) state.possessions.claims.push(state.currentYear);
  loseVehicle(state, p, payout, content);
  return { paid: 0, payout, claim: insured, lost: true };
}

/** The yearly chance of an accident in this vehicle: your age, your Risk-taking, its condition and its kind. */
export function accidentChance(state: LifeState, p: Possession, content: ContentBundle): number {
  const a = vb(content).accident;
  const risk = 1 + (a.riskTaking * (state.character.personality.riskTaking - 50)) / 50;
  const chance = curveAt(a.base, state.character.age) * Math.max(0.2, risk) * curveAt(a.condition, p.condition) * vehicleDef(content, p).risk;
  return Math.min(0.6, Math.max(0, chance));
}

/** The yearly chance of a drunk-driving incident: your Vice, much more with an addiction to alcohol. */
export function drunkChance(state: LifeState, content: ContentBundle): number {
  const d = vb(content).accident.drunk;
  let chance = curveAt(d.vice, state.character.hidden.vice);
  if (state.health.conditions.some((c) => d.conditions.includes(c.conditionId))) chance = Math.max(chance, 0.02) * d.conditionMult;
  return Math.min(0.5, chance);
}
