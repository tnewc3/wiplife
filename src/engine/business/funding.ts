/**
 * Funding a business (W3): your savings, a business loan through the debt
 * system, investors from your circle (with stakes) or a co-founder (with a
 * share). The same rules fund a new business, a purchase and a new location.
 * Numbers: balance/business.yaml funding. Money goes through the finance
 * module: savings are spent, a loan is a debt of kind `business`, and what
 * investors and a co-founder put in comes from outside your finances.
 */
import type { BusinessDef, BusinessFunding, ContentBundle } from '../../content/schemas';
import { creditBlocked } from '../migration/query';
import { addDebt, totalDebt, wholeDollars } from '../finance';
import type { BusinessOwner, FamilyWealth, Id, LifeState, Person } from '../types';
import { ageOf, isFamilyKind } from '../relationships';
import { staffIds } from './query';

export interface InvestorPlan {
  personId: Id;
  amount: number;
}

export interface FundingPlan {
  source: BusinessFunding;
  /** A loan: how much (at most the offer). */
  loan?: number;
  /** Investors: who, and how much each puts in. */
  investors?: InvestorPlan[];
  /** A co-founder: who, and the share (percent) they take. */
  cofounder?: { personId: Id; share: number };
}

export type FundingBlock =
  | 'age'
  | 'away'
  | 'savings'
  | 'loanDeclined'
  | 'loanAmount'
  | 'loanOwn'
  | 'investorsNone'
  | 'investorUnknown'
  | 'investorCapacity'
  | 'investorMax'
  | 'stakeCap'
  | 'cofounderNone'
  | 'cofounderUnknown'
  | 'cofounderShare'
  | 'plan';

/** Last year's income as the bank sees it: pay, draws and any benefit. */
export function incomeBasis(state: LifeState): number {
  const l = state.finances.lastLedger;
  return (l?.gross ?? 0) + (l?.retirement ?? 0);
}

export interface LoanOffer {
  /** The most it will lend for this purchase (0 when declined). */
  limit: number;
  rate: number;
  termYears: number;
  /** Why the bank says no, if it does. */
  block: 'bankruptcy' | 'missed' | 'debt' | 'status' | null;
  /** The savings you must put in yourself. */
  ownNeeded: number;
}

/** What a bank would lend towards `need`, on your income, your record and your plan. */
export function loanOffer(state: LifeState, need: number, def: BusinessDef | undefined, content: ContentBundle): LoanOffer {
  const f = content.balance.business.funding.loan;
  const f0 = state.finances;
  const missed = f0.debts.reduce((most, d) => Math.max(most, d.missed), 0);
  let block: LoanOffer['block'] = null;
  if (creditBlocked(state)) block = 'status';
  else if (f0.bankruptcyYear !== undefined && state.currentYear - f0.bankruptcyYear < f.bankruptcyYears) block = 'bankruptcy';
  else if (missed > 0) block = 'missed';
  // A plan is a trade licence, a year of experience, or a related job.
  const planned =
    (def?.license !== undefined && (state.education.credentials.some((c) => c.type === 'trade_license' && c.refId === def.license!.trade) || state.career.job?.jobId === def.license.job)) ||
    (def !== undefined && (state.business.experience[def.id] ?? 0) > 0) ||
    (def?.occupation !== undefined && (state.career.job?.jobId === def.occupation || state.career.history.some((j) => j.jobId === def.occupation)));
  const multiple = f.incomeMultiple + (planned ? f.planBonus : 0);
  const basis = Math.max(incomeBasis(state), f.incomeFloor);
  const room = Math.max(0, wholeDollars(basis * multiple) - totalDebt(state));
  const missedSurcharge = f.missedSurcharge * missed;
  const limit = block !== null ? 0 : Math.min(wholeDollars(need * f.maxShare), room);
  if (block === null && limit < need * 0.1 && totalDebt(state) > basis * multiple) block = 'debt';
  return { limit, rate: f.rate + missedSurcharge, termYears: f.termYears, block, ownNeeded: Math.max(0, need - limit) };
}

export interface Candidate {
  personId: Id;
  name: string;
  /** The most they can put in (investors) or the skill they bring (co-founders). */
  capacity: number;
  affection: number;
  kind: string;
  willing: boolean;
}

const personName = (p: Person) => `${p.name.first} ${p.name.last}`;

/** People in your circle who could invest: adults who are alive, in your life and fond enough of you, by what they can afford. */
export function investorCandidates(state: LifeState, content: ContentBundle): Candidate[] {
  const f = content.balance.business.funding;
  const taken = new Set<Id>();
  for (const b of state.business.items) for (const o of b.owners) if (o.id !== 'you') taken.add(o.id);
  return Object.keys(state.relationships)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const p = state.people[id];
      if (!p || !p.alive || rel.status !== 'active' || ageOf(state, p) < f.minAge || rel.kind === 'boss') return [];
      if (taken.has(id)) return [];
      const capacity = wholeDollars(f.investors.capacity[p.wealthLevel as FamilyWealth] * (rel.affection / 100));
      if (capacity <= 0) return [];
      return [{ personId: id, name: personName(p), capacity, affection: rel.affection, kind: rel.kind, willing: rel.affection >= f.investors.minAffection }];
    })
    .sort((a, b) => Number(b.willing) - Number(a.willing) || b.capacity - a.capacity);
}

/** People who could be a co-founder: adults you are fond of, in your life, not already a partner in a business. */
export function cofounderCandidates(state: LifeState, content: ContentBundle): Candidate[] {
  const f = content.balance.business.funding;
  const taken = new Set<Id>();
  for (const b of state.business.items) for (const o of b.owners) if (o.id !== 'you') taken.add(o.id);
  const staff = staffIds(state);
  return Object.keys(state.relationships)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const p = state.people[id];
      if (!p || !p.alive || rel.status !== 'active' || ageOf(state, p) < f.cofounder.minAge || ageOf(state, p) > 70 || rel.kind === 'boss' || rel.kind === 'parent' || rel.kind === 'grandparent') return [];
      if (taken.has(id) || staff.has(id)) return [];
      if (isFamilyKind(rel.kind) && rel.kind === 'child' && ageOf(state, p) < 21) return [];
      const skill = Math.round(Math.min(100, Math.max(0, f.cofounder.skill.mean + (p.smarts - 50) * 0.5)));
      return [{ personId: id, name: personName(p), capacity: skill, affection: rel.affection, kind: rel.kind, willing: rel.affection >= f.cofounder.minAffection }];
    })
    .sort((a, b) => Number(b.willing) - Number(a.willing) || b.affection - a.affection);
}

export interface FundingResult {
  /** What you pay from savings. */
  own: number;
  loan: number;
  loanTerms: { rate: number; termYears: number } | null;
  /** The other owners and what they put in. */
  owners: BusinessOwner[];
  /** The money that comes from the others (investors and co-founder). */
  others: number;
}

/** The stake (percent) an investor of `amount` gets when `need` is being raised. */
export function stakeFor(amount: number, need: number, content: ContentBundle): number {
  return Math.max(1, Math.floor((100 * amount) / (need * content.balance.business.funding.investors.premoney)));
}

/** Checks a plan against what is needed; returns what it would do, or why it cannot. */
export function checkFunding(state: LifeState, need: number, plan: FundingPlan, def: BusinessDef | undefined, content: ContentBundle): { block: FundingBlock } | { result: FundingResult } {
  const f = content.balance.business.funding;
  const fail = (block: FundingBlock) => ({ block });
  if (state.character.age < content.balance.business.limits.minAge) return fail('age');
  if (state.housing.kind === 'incarcerated') return fail('away');
  const savings = state.finances.savings;
  const owners: BusinessOwner[] = [];
  let loan = 0;
  let loanTerms: FundingResult['loanTerms'] = null;
  let others = 0;
  if (plan.source === 'loan') {
    const offer = loanOffer(state, need, def, content);
    if (offer.block !== null || offer.limit <= 0) return fail('loanDeclined');
    loan = wholeDollars(plan.loan ?? offer.limit);
    if (loan <= 0 || loan > offer.limit) return fail('loanAmount');
    if (need - loan < need * f.loan.minOwn) return fail('loanOwn');
    loanTerms = { rate: offer.rate, termYears: offer.termYears };
  } else if (plan.source === 'investors') {
    const list = plan.investors ?? [];
    if (list.length === 0) return fail('investorsNone');
    if (list.length > f.investors.max) return fail('investorMax');
    const cands = investorCandidates(state, content);
    const seen = new Set<Id>();
    let stakes = 0;
    for (const inv of list) {
      const c = cands.find((x) => x.personId === inv.personId);
      if (!c || !c.willing || seen.has(inv.personId)) return fail('investorUnknown');
      seen.add(inv.personId);
      const amount = wholeDollars(inv.amount);
      if (amount <= 0 || amount > c.capacity) return fail('investorCapacity');
      const share = stakeFor(amount, need, content);
      stakes += share;
      others += amount;
      owners.push({ id: inv.personId, name: c.name, share, put: amount, year: state.currentYear, paid: 0, role: 'investor' });
    }
    if (stakes > f.investors.maxTotal) return fail('stakeCap');
    if (others >= need) return fail('investorCapacity');
  } else if (plan.source === 'cofounder') {
    const c = plan.cofounder;
    if (!c) return fail('cofounderNone');
    const cand = cofounderCandidates(state, content).find((x) => x.personId === c.personId);
    if (!cand || !cand.willing) return fail('cofounderUnknown');
    if (!f.cofounder.shares.includes(c.share)) return fail('cofounderShare');
    const cash = Math.min(need - 1, wholeDollars(f.cofounder.cashPerShare * (c.share / 100) * need));
    others = cash;
    owners.push({ id: c.personId, name: cand.name, share: c.share, put: cash, year: state.currentYear, paid: 0, role: 'cofounder' });
  }
  const own = need - loan - others;
  if (own > savings) return fail('savings');
  return { result: { own, loan, loanTerms, owners, others } };
}

/** Carries a checked plan out: spends your share, takes the loan as a debt, and returns the debt's id (if any). */
export function applyFunding(state: LifeState, result: FundingResult, content: ContentBundle): { loanId: Id | null } {
  state.finances.savings -= result.own;
  if (result.loan <= 0 || !result.loanTerms) return { loanId: null };
  const debt = addDebt(state, 'business', result.loan, content, { annualRate: result.loanTerms.rate, termYears: result.loanTerms.termYears });
  return { loanId: debt.id };
}
