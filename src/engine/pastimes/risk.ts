/**
 * Risk and legal activities (Batch 2b): the rules that crime, the black market,
 * gambling, lawsuits, a legal name change and loans add to Batch 2a's
 * activities. Everything here only reads state, except the name change, which
 * rewrites your name. The consequences of an outcome run through the systems
 * that already own them: the law (sentences, records, juvenile handling and
 * sealing), the finance module (spending, earning, debts), health and vice
 * (addiction conditions) and E6a's crime state (heat, standing, dirty money).
 * Numbers: balance/risk.yaml (and pastimes.yaml for prices and odds, economy.yaml
 * for the rates and terms of the new debt kinds).
 */
import type { ContentBundle, DebtKind, LoanProduct, PastimeDef, PastimeStake } from '../../content/schemas';
import { evaluate } from '../conditions';
import { creditBlocked } from '../migration/query';
import { crewsIn } from '../crime/crew';
import { inCrew } from '../crime/query';
import { personNameSchema } from '../creation/input';
import { scaledAmount } from '../country';
import { totalDebt, wholeDollars } from '../finance';
import { atLegalAge } from '../country';
import { countedRecord, unsealedRecord } from '../record';
import { costOfLiving } from '../possessions/query';
import { nextInt, type RngState } from '../rng';
import type { Id, LifeState } from '../types';

/** The flag a fake ID sets (registries/flags.yaml). */
export const FAKE_ID_FLAG = 'fake_id';

/** Crime and the black market: heat, a record and a crew make the bad tiers likelier. */
export const EXPOSED_CATEGORIES: readonly string[] = ['crime', 'black_market'];

/** Everything in the amounts table of balance/risk.yaml is written at US prices; this is what it comes to for you now. */
export function scaledFor(state: LifeState, usd: number, content: ContentBundle): number {
  return wholeDollars(scaledAmount(state, usd, content) * costOfLiving(state, content));
}

/** A range of balance/risk.yaml amounts, scaled to your country and city. */
export function amountRange(state: LifeState, key: string, content: ContentBundle): { min: number; max: number } {
  const r = content.balance.risk.amounts[key];
  return r ? { min: scaledFor(state, r.min, content), max: scaledFor(state, r.max, content) } : { min: 0, max: 0 };
}

/** Rolls an amount from balance/risk.yaml amounts (scaled), multiplied by `share`. Draws from `rng`. */
export function rollAmount(state: LifeState, key: string, share: number, rng: RngState, content: ContentBundle): number {
  const r = amountRange(state, key, content);
  return wholeDollars(nextInt(rng, r.min, Math.max(r.min, r.max)) * share);
}

/** How many entries of your record count against you in a court and with a lender. */
export function recordSize(state: LifeState): number {
  return unsealedRecord(state).length;
}

/**
 * The multiplier on the chance of the two bad tiers (caught, caught and hurt) of a crime or a black market
 * dealing: 1, plus heat, plus each entry on your record (up to a limit), plus a crew's attention.
 */
export function exposure(state: LifeState, content: ContentBundle): number {
  const e = content.balance.risk.exposure;
  return 1 + e.heat * state.crime.heat + e.record * Math.min(e.recordMax, recordSize(state)) + (inCrew(state) ? e.crew : 0);
}

/** How many of the activity's pieces of evidence hold now (the ex you are suing is the role `companion`). */
export function evidenceCount(state: LifeState, def: PastimeDef, companionId: Id | undefined, content: ContentBundle): number {
  if (!def.evidence) return 0;
  const cast = companionId !== undefined ? { companion: companionId } : {};
  return def.evidence.filter((c) => evaluate(c, state, { cast, roles: 'strict', content })).length;
}

/** The house edge of a game: the share of every stake it keeps on average. */
export function houseEdge(game: { outcomes: readonly { chance: number; multiple: number }[] }): number {
  return 1 - game.outcomes.reduce((sum, o) => sum + o.chance * o.multiple, 0);
}

/** What the most recent gambling this year lost you (0 if it did not lose, or you have not gambled this year). */
export function lastGamblingLoss(state: LifeState, content: ContentBundle): number {
  if (state.pastimes.year !== state.currentYear) return 0;
  for (let i = state.pastimes.receipts.length - 1; i >= 0; i--) {
    const r = state.pastimes.receipts[i]!;
    if (content.pastimes[r.pastimeId]?.category !== 'gambling') continue;
    return r.money && r.money.change < 0 ? -r.money.change : 0;
  }
  return 0;
}

/** The stake a chase bets: the last loss, never less than the stake you chose, at most the cap. */
export function chaseStake(state: LifeState, chosen: number, content: ContentBundle): number {
  const c = content.balance.risk.chase;
  return Math.max(chosen, Math.min(scaledFor(state, c.cap, content), wholeDollars(lastGamblingLoss(state, content) * c.share)));
}

/** What a stake costs: the game's base price times the stake you chose. */
export function stakeMultiplier(stake: PastimeStake | undefined, content: ContentBundle): number {
  return stake ? content.balance.risk.stakes[stake].price : 1;
}

/** Holding a fake ID (and old enough to be the adult nightlife is for) lets you in where you are under the drinking age. */
export function fakeIdUsable(state: LifeState, def: PastimeDef, content: ContentBundle): boolean {
  return def.legalAge === 'drinking' && state.flags[FAKE_ID_FLAG] === true && !atLegalAge(state, 'drinking', content);
}

// --- Loans ------------------------------------------------------------------------------------------------------

export type LoanBlock = 'status' | 'income' | 'record' | 'bankruptcy' | 'debt' | 'open' | 'contacts';

export interface LoanOffer {
  /** Why they say no, or null. 'contacts' means it isn't on offer to you at all. */
  block: LoanBlock | null;
  kind: DebtKind;
  amount: number;
  fee: number;
  rate: number;
  termYears: number;
}

/** Last year's income, which is what lenders look at. */
export function incomeOf(state: LifeState): number {
  const l = state.finances.lastLedger;
  return (l?.gross ?? 0) + (l?.retirement ?? 0);
}

/** Do you know someone who lends this way: you are in a crew, there is heat on you, or a crew works in your city. */
export function knowsALender(state: LifeState, content: ContentBundle): boolean {
  return inCrew(state) || state.crime.heat > 0 || crewsIn(content, state.character.cityId).length > 0;
}

function shortBy(state: LifeState, p: LoanProduct, content: ContentBundle): LoanBlock | null {
  const income = incomeOf(state);
  if (p.contacts && !knowsALender(state, content)) return 'contacts';
  if (p.kind !== 'shark' && creditBlocked(state)) return 'status';
  if (income < scaledFor(state, p.minIncome, content)) return 'income';
  if (countedRecord(state, content).length > p.maxRecord) return 'record';
  const filed = state.finances.bankruptcyYear;
  if (p.bankruptcyYears > 0 && filed !== undefined && state.currentYear - filed < p.bankruptcyYears) return 'bankruptcy';
  const owed = totalDebt(state) - state.finances.debts.filter((d) => d.kind === 'mortgage').reduce((s, d) => s + d.balance, 0);
  if (p.maxDebtShare > 0 && owed > income * p.maxDebtShare) return 'debt';
  if (state.finances.debts.filter((d) => d.kind === p.kind).length >= p.maxOpen) return 'open';
  return null;
}

/** What the lender offers you now (or why not). The amount is a share of last year's income between their limits. */
export function loanOffer(state: LifeState, def: PastimeDef, content: ContentBundle): LoanOffer {
  const p = content.balance.risk.loans[def.loan ?? '']!;
  const lo = scaledFor(state, p.amount.min, content);
  const hi = scaledFor(state, p.amount.max, content);
  const amount = wholeDollars(Math.min(hi, Math.max(lo, incomeOf(state) * p.incomeShare)));
  const eco = content.balance.economy;
  return {
    block: shortBy(state, p, content),
    kind: p.kind,
    amount,
    fee: wholeDollars(amount * p.fee),
    rate: eco.interest.debts[p.kind],
    termYears: eco.debts.termYears[p.kind],
  };
}

// --- A legal name change ----------------------------------------------------------------------------------------

export type NameBlock = 'name' | 'consent' | 'partner' | 'former';

/** Validates a typed name: letters from any script, spaces, hyphens, apostrophes and periods; at most 30 characters. Null when it is wrong. */
export function parseLegalName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const r = personNameSchema('a name').safeParse(value);
  return r.success ? r.data : null;
}

/** The living parents (or step-parents) who could agree to a minor's name change: in your home or city, and caring enough. */
export function consentOptions(state: LifeState, content: ContentBundle): { id: Id; name: string }[] {
  const need = content.balance.risk.identity.consentAffection;
  const out: { id: Id; name: string }[] = [];
  for (const [id, rel] of Object.entries(state.relationships)) {
    const person = state.people[id];
    if (!person || !person.alive || (rel.kind !== 'parent' && rel.kind !== 'stepparent')) continue;
    if (rel.affection < need || person.cityId !== state.character.cityId) continue;
    out.push({ id, name: person.name.first });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Your partner (or fiancé or spouse), alive and an adult, whose last name you could take. */
export function partnerOf(state: LifeState): { id: Id; last: string } | null {
  for (const [id, rel] of Object.entries(state.relationships)) {
    const person = state.people[id];
    if (person?.alive && (rel.kind === 'partner' || rel.kind === 'fiance' || rel.kind === 'spouse') && rel.status === 'active') return { id, last: person.name.last };
  }
  return null;
}

export interface NameChoice {
  first?: string | undefined;
  last?: string | undefined;
  consentId?: Id | undefined;
}

/** The name you would have after this change, or why you can't have it. */
export function nameAfter(state: LifeState, def: PastimeDef, choice: NameChoice): { first: string; last: string } | NameBlock {
  const now = state.character.name;
  switch (def.nameChange) {
    case 'first':
      return choice.first !== undefined && choice.first !== now.first ? { first: choice.first, last: now.last } : 'name';
    case 'last':
      return choice.last !== undefined && choice.last !== now.last ? { first: now.first, last: choice.last } : 'name';
    case 'both':
      return choice.first !== undefined && choice.last !== undefined && (choice.first !== now.first || choice.last !== now.last) ? { first: choice.first, last: choice.last } : 'name';
    case 'partner': {
      const p = partnerOf(state);
      return p ? (p.last !== now.last ? { first: now.first, last: p.last } : 'name') : 'partner';
    }
    case 'former': {
      const f = state.character.formerNames?.at(-1);
      return f ? { first: f.first, last: f.last } : 'former';
    }
    default:
      return 'name';
  }
}

/** Why you can't change your name now, or null: a typed name that is missing, the same or wrong; no partner; no former name; a minor with no parent's agreement. */
export function nameBlock(state: LifeState, def: PastimeDef, choice: NameChoice, content: ContentBundle): NameBlock | null {
  const after = nameAfter(state, def, choice);
  if (typeof after === 'string') return after;
  const adult = state.character.age >= content.balance.relationships.adultAge;
  if (!adult) {
    if (state.character.age < content.balance.risk.identity.minorAge) return 'consent';
    if (choice.consentId === undefined || !consentOptions(state, content).some((c) => c.id === choice.consentId)) return 'consent';
  }
  return null;
}
