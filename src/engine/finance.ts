/**
 * The debt system (docs/design.md, section J; docs/technical.md, Stage 6):
 * savings, debts of every kind and their minimum payments, spending that
 * savings can't cover, and the ways out (paying off, help, a debt plan,
 * bankruptcy). The yearly ledger, events, actions and later stages (student
 * loans, medical bills) all go through these functions, so there is one
 * debt system. Numbers come from src/content/balance/economy.yaml.
 *
 * Money is whole dollars: every calculation is rounded as it is made, and
 * amounts are kept within safe integer limits.
 */
import type { ContentBundle, DebtKind } from '../content/schemas';
import { writeFromGroup } from './systems/history';
import type { Debt, Id, LifeState } from './types';

/** The largest amount of money the game keeps (safe integer limit). */
export const MAX_MONEY = Number.MAX_SAFE_INTEGER;

/** Rounds to whole dollars within safe limits (NaN counts as zero). */
export function wholeDollars(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(-MAX_MONEY, Math.min(MAX_MONEY, Math.round(value)));
}

/** Old enough to pay your own way, take on debt and choose where you live. */
export function isIndependent(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.economy.independenceAge;
}

/** Everything you owe. */
export function totalDebt(state: LifeState): number {
  return wholeDollars(state.finances.debts.reduce((sum, d) => sum + d.balance, 0));
}

/** Savings (and any money held in trust) plus the value of your home, minus every debt. */
export function netWorth(state: LifeState): number {
  return wholeDollars(state.finances.savings + (state.finances.trust?.balance ?? 0) + (state.housing.homeValue ?? 0) - totalDebt(state));
}

/** The most payments in a row missed on any one debt. */
export function mostMissed(state: LifeState): number {
  return state.finances.debts.reduce((most, d) => Math.max(most, d.missed), 0);
}

/**
 * The yearly payment that pays off `balance` in `years` payments at `rate`,
 * rounded up to whole dollars (the standard loan formula).
 */
export function amortizedPayment(balance: number, rate: number, years: number): number {
  if (balance <= 0) return 0;
  const raw = rate === 0 ? balance / years : (balance * rate) / (1 - Math.pow(1 + rate, -years));
  return wholeDollars(Math.ceil(raw));
}

/** Sets a debt's minimum payment from its balance, rate and its kind's term. */
export function setMinPayment(debt: Debt, content: ContentBundle, termYears?: number): void {
  const { debts } = content.balance.economy;
  const term = termYears ?? debts.termYears[debt.kind];
  debt.minPayment = Math.max(debts.minPayment, amortizedPayment(debt.balance, debt.annualRate, term));
}

/** The payment due on a debt this year: its minimum, or the balance if less. */
export function paymentDue(debt: Debt): number {
  return Math.min(debt.minPayment, debt.balance);
}

/** A debt id not used by any current debt: d1, d2... */
function nextDebtId(state: LifeState): Id {
  let n = 1;
  const used = new Set(state.finances.debts.map((d) => d.id));
  while (used.has(`d${n}`)) n++;
  return `d${n}`;
}

/**
 * Adds a new debt of `amount` (at the kind's usual rate unless given) and
 * returns it. The caller checks the player is independent.
 */
export function addDebt(
  state: LifeState,
  kind: DebtKind,
  amount: number,
  content: ContentBundle,
  terms: { annualRate?: number; termYears?: number } = {},
): Debt {
  const debt: Debt = {
    id: nextDebtId(state),
    kind,
    balance: wholeDollars(Math.max(0, amount)),
    annualRate: terms.annualRate ?? content.balance.economy.interest.debts[kind],
    minPayment: 0,
    missed: 0,
  };
  setMinPayment(debt, content, terms.termYears);
  state.finances.debts.push(debt);
  return debt;
}

/** Adds to a debt's balance and resets its minimum payment. */
function grow(debt: Debt, amount: number, content: ContentBundle, termYears?: number): void {
  debt.balance = wholeDollars(debt.balance + amount);
  setMinPayment(debt, content, termYears);
}

/**
 * Money you had to find without savings: added to your ordinary personal
 * debt (one at the usual personal rate, created if needed). Returns the
 * amount borrowed.
 */
export function borrow(state: LifeState, amount: number, content: ContentBundle): number {
  const owed = wholeDollars(Math.max(0, amount));
  if (owed === 0) return 0;
  const rate = content.balance.economy.interest.debts.personal;
  const existing = state.finances.debts.find((d) => d.kind === 'personal' && d.annualRate === rate);
  if (existing) grow(existing, owed, content);
  else addDebt(state, 'personal', owed, content);
  return owed;
}

/**
 * Tuition you borrow for school (Stage 7): added to your student loan (one at
 * the usual student rate, created if needed), like any other debt. The
 * caller checks you are independent. Returns the amount borrowed.
 */
export function takeStudentLoan(state: LifeState, amount: number, content: ContentBundle): number {
  const owed = wholeDollars(Math.max(0, amount));
  if (owed === 0) return 0;
  const rate = content.balance.economy.interest.debts.student;
  const existing = state.finances.debts.find((d) => d.kind === 'student' && d.annualRate === rate);
  if (existing) grow(existing, owed, content);
  else addDebt(state, 'student', owed, content);
  return owed;
}

/** Adds to savings (never past the money limit). */
export function earn(state: LifeState, amount: number): void {
  state.finances.savings = wholeDollars(Math.min(MAX_MONEY, state.finances.savings + Math.max(0, amount)));
}

/**
 * Pays a cost from savings. Savings never go below zero: once you are
 * independent, the part savings can't cover becomes personal debt; a
 * child's family covers it. Returns the amount borrowed.
 */
export function spend(state: LifeState, amount: number, content: ContentBundle): number {
  const cost = wholeDollars(Math.max(0, amount));
  const f = state.finances;
  if (cost <= f.savings) {
    f.savings -= cost;
    return 0;
  }
  const shortfall = cost - f.savings;
  f.savings = 0;
  return isIndependent(state, content) ? borrow(state, shortfall, content) : 0;
}

/**
 * Removes every paid-off debt. A paid-off mortgage leaves the home yours,
 * with a history entry.
 */
export function clearPaidDebts(state: LifeState, content: ContentBundle): void {
  const f = state.finances;
  const paid = f.debts.filter((d) => d.balance <= 0);
  if (paid.length === 0) return;
  f.debts = f.debts.filter((d) => d.balance > 0);
  for (const debt of paid) {
    if (debt.id !== state.housing.mortgageDebtId) continue;
    delete state.housing.mortgageDebtId;
    writeFromGroup(state, content.text.history.money.mortgagePaidOff, ['money', 'mortgagePaidOff'], {}, content);
  }
}

/** Pays up to `amount` of one debt from savings (never more than you have or owe). Returns the amount paid. */
export function payDebt(state: LifeState, debtId: Id, amount: number, content: ContentBundle): number {
  const debt = state.finances.debts.find((d) => d.id === debtId);
  if (!debt) return 0;
  const paid = Math.max(0, Math.min(wholeDollars(amount), state.finances.savings, debt.balance));
  state.finances.savings -= paid;
  debt.balance -= paid;
  if (paid >= paymentDue({ ...debt, balance: debt.balance + paid })) debt.missed = 0;
  clearPaidDebts(state, content);
  return paid;
}

/** Kinds help or forgiveness can reach by default: everything but the mortgage. */
const FORGIVABLE: readonly DebtKind[] = ['student', 'personal', 'medical', 'collections'];

/** Writes off `share` of every debt of these kinds (someone helped, or a lender settled). */
export function forgiveDebts(state: LifeState, share: number, content: ContentBundle, kinds: readonly DebtKind[] = FORGIVABLE): void {
  for (const debt of state.finances.debts) {
    if (!kinds.includes(debt.kind)) continue;
    const cut = wholeDollars(debt.balance * Math.min(1, Math.max(0, share)));
    if (cut <= 0) continue;
    debt.balance -= cut;
    debt.missed = 0;
    if (debt.balance > 0 && debt.kind !== 'mortgage') setMinPayment(debt, content);
  }
  clearPaidDebts(state, content);
}

/** Debts bankruptcy clears. Student loans survive it, and a mortgage stays with its home. */
const DISCHARGED: readonly DebtKind[] = ['personal', 'medical', 'collections'];

/** Files for bankruptcy: personal, medical and collections debt are cleared. */
export function declareBankruptcy(state: LifeState): void {
  state.finances.debts = state.finances.debts.filter((d) => !DISCHARGED.includes(d.kind));
  state.finances.bankruptcyYear = state.currentYear;
  state.finances.hardshipYears = 0;
}

/** Debts a debt plan rolls together. */
const PLANNED: readonly DebtKind[] = ['personal', 'medical', 'collections'];

/**
 * A debt plan is possible when a personal, medical or collections debt is
 * behind (or in collections), and the last plan was long enough ago.
 */
export function canStartDebtPlan(state: LifeState, content: ContentBundle): boolean {
  if (!isIndependent(state, content)) return false;
  const last = state.finances.debtPlanYear;
  if (last !== undefined && state.currentYear - last < content.balance.economy.debtPlan.cooldownYears) return false;
  return state.finances.debts.some((d) => PLANNED.includes(d.kind) && (d.missed > 0 || d.kind === 'collections'));
}

/**
 * Starts a debt plan: personal, medical and collections debt become one
 * personal loan at the plan's rate (plus its fee), back on track.
 */
export function startDebtPlan(state: LifeState, content: ContentBundle): void {
  const plan = content.balance.economy.debtPlan;
  const rolled = state.finances.debts.filter((d) => PLANNED.includes(d.kind));
  const total = rolled.reduce((sum, d) => sum + d.balance, 0);
  state.finances.debts = state.finances.debts.filter((d) => !PLANNED.includes(d.kind));
  state.finances.debtPlanYear = state.currentYear;
  if (total <= 0) return;
  addDebt(state, 'personal', total + wholeDollars(total * plan.fee), content, { annualRate: plan.rate, termYears: plan.termYears });
}

/**
 * Sends a debt to collections: its balance, plus the collections fee, joins
 * your collections debt (created if needed). The missed count carries over,
 * so garnishment starts while it stays behind.
 */
export function sendToCollections(state: LifeState, debt: Debt, content: ContentBundle): void {
  const { missed, interest } = content.balance.economy;
  const amount = debt.balance + wholeDollars(debt.balance * missed.collectionsFee);
  state.finances.debts = state.finances.debts.filter((d) => d.id !== debt.id);
  const existing = state.finances.debts.find((d) => d.kind === 'collections');
  if (existing) {
    grow(existing, amount, content);
    existing.missed = Math.max(existing.missed, debt.missed);
  } else {
    const added = addDebt(state, 'collections', amount, content, { annualRate: interest.debts.collections });
    added.missed = debt.missed;
  }
}
