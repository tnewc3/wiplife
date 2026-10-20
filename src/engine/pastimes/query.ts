/**
 * Activities (Batch 2a): what you can do now, what it costs and who can come
 * along. Pure reading; ./perform.ts does the activity. Availability is decided
 * here, in the engine, never by the screen: age and legal age, the country or
 * city, an adults-only category, where the companion is, the yearly limit and
 * the price in your savings.
 */
import {
  OUTCOME_TIERS,
  PASTIME_CATEGORIES,
  type ContentBundle,
  type PastimeRoute,
  type PastimeStake,
  type OutcomeTier,
  type PastimeCategory,
  type PastimeCompanionKind,
  type PastimeDef,
  type PastimeQuality,
} from '../../content/schemas';
import { evaluate } from '../conditions';
import { atLegalAge, countryIdOfCity, legalAgeOf, scaledAmount } from '../country';
import { wholeDollars } from '../finance';
import { whereabouts } from '../presence';
import type { Id, LifeState, PastimesState } from '../types';
import { costOfLiving, valuablesOf } from '../possessions/query';
import { valuableBlock } from '../possessions/valuables';
import { chaseStake, evidenceCount, lastGamblingLoss, fakeIdUsable, loanOffer, nameBlock, scaledFor, stakeMultiplier, type NameChoice } from './risk';

export function emptyPastimes(year = 0): PastimesState {
  return { year, counts: {}, receipts: [] };
}

/** Relationship kinds that count as each kind of companion. */
const COMPANION_KINDS: Record<PastimeCompanionKind, readonly string[]> = {
  partner: ['partner', 'fiance', 'spouse'],
  friend: ['friend'],
  family: ['parent', 'stepparent', 'sibling', 'grandparent', 'relative', 'child', 'stepchild', 'grandchild'],
  ex: ['ex'],
};

/** All the activities that exist, in a fixed order (not retired). */
export function allPastimes(content: ContentBundle): PastimeDef[] {
  return Object.keys(content.pastimes)
    .sort()
    .map((id) => content.pastimes[id]!)
    .filter((def) => !def.retired);
}

/** How many times you did this activity this year. */
export function pastimeCount(state: LifeState, pastimeId: Id): number {
  return state.pastimes.year === state.currentYear ? (state.pastimes.counts[pastimeId] ?? 0) : 0;
}

/** The youngest age you can do it: its own, and the legal age where you live now when it needs one. */
export function pastimeMinAge(state: LifeState, def: PastimeDef, content: ContentBundle): number {
  return Math.max(def.minAge, def.legalAge ? legalAgeOf(state, def.legalAge, content) : 0);
}

/** What it costs now: the price at US prices, at the price level of your country and your city's cost of living, a surgeon's tier, and paying for a companion too. */
export function pastimePrice(state: LifeState, def: PastimeDef, choice: PastimeChoice, content: ContentBundle): number {
  const base = content.balance.pastimes.costs[def.cost] ?? 0;
  const tier = def.quality && choice.quality ? content.balance.pastimes.quality[choice.quality].price : 1;
  // Someone who comes along shares an outing; a lawyer's fee is the same whoever you are suing.
  const together = choice.companionId !== undefined && def.mechanic === 'roll' ? content.balance.pastimes.companionCost : 1;
  const price = wholeDollars(scaledAmount(state, base, content) * costOfLiving(state, content) * tier * together * (def.mechanic === 'gamble' ? stakeMultiplier(choice.stake, content) : 1));
  // Chasing a loss bets the loss back (never less than the stake chosen).
  return def.mechanic === 'gamble' && choice.chase === true ? chaseStake(state, price, content) : price;
}

/** Does this relationship count as a companion of this kind? */
export function isCompanionKind(relKind: string, kinds: readonly PastimeCompanionKind[]): boolean {
  return kinds.some((k) => COMPANION_KINDS[k].includes(relKind));
}

export interface CompanionOption {
  id: Id;
  name: string;
  kind: string;
}

/**
 * Who can come along: living people of the kinds it allows, old enough for it, and (in person) in your city or
 * home. Nobody under the adult age joins an activity that is adults only, and a partner is only ever an adult.
 */
export function companionOptions(state: LifeState, def: PastimeDef, content: ContentBundle): CompanionOption[] {
  if (def.companion === 'none' || !def.companionKinds) return [];
  const minAge = pastimeMinAge(state, def, content);
  const out: CompanionOption[] = [];
  for (const [id, rel] of Object.entries(state.relationships)) {
    const person = state.people[id];
    if (!person || !person.alive || !isCompanionKind(rel.kind, def.companionKinds)) continue;
    if (state.currentYear - person.birthYear < minAge) continue;
    if (def.inPerson && whereabouts(state, id, content) === 'elsewhere') continue;
    out.push({ id, name: person.name.first, kind: rel.kind });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Why you can't do it now. 'age' to 'requires' mean it is not on offer to you; 'limit', 'afford', 'companion' and 'quality' mean it is, but not right now. */
export type PastimeBlock =
  | 'phase' | 'prison' | 'age' | 'country' | 'city' | 'requires' | 'valuable' | 'contacts' | 'limit' | 'afford' | 'companion' | 'quality'
  // Batch 2b: choose a stake, choose how a lawsuit ends, a loan is refused, a name is missing or can't be, a minor needs a parent's agreement, nothing was lost to chase.
  | 'stake' | 'route' | 'approval' | 'name' | 'consent' | 'partner' | 'former' | 'chase';

/** The blocks that hide an activity from the Activities screen (the others show it, disabled, with the reason). */
export const HIDING_BLOCKS: readonly PastimeBlock[] = ['phase', 'prison', 'age', 'country', 'city', 'requires', 'valuable', 'contacts', 'partner', 'former'];

export interface PastimeChoice extends NameChoice {
  companionId?: Id | undefined;
  quality?: PastimeQuality | undefined;
  /** Gambling: how much you put down, and whether you are chasing what you just lost. */
  stake?: PastimeStake | undefined;
  chase?: boolean | undefined;
  /** A lawsuit: settle or go to trial. */
  route?: PastimeRoute | undefined;
}

export function pastimeBlock(state: LifeState, def: PastimeDef, choice: PastimeChoice, content: ContentBundle): PastimeBlock | null {
  if (state.phase !== 'yearStart') return 'phase';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (state.character.age < def.minAge || (def.legalAge !== undefined && !atLegalAge(state, def.legalAge, content) && !fakeIdUsable(state, def, content))) return 'age';
  if (def.countries && !def.countries.includes(countryIdOfCity(state.character.cityId, content))) return 'country';
  if (def.cities && !def.cities.includes(state.character.cityId)) return 'city';
  if (def.requires && !evaluate(def.requires, state, { cast: {}, roles: 'strict', content })) return 'requires';
  // A lawsuit needs something to go on; a shark needs someone who lends that way.
  if (def.evidence && def.companion !== 'required' && evidenceCount(state, def, undefined, content) === 0) return 'requires';
  if (def.mechanic === 'loan' && loanOffer(state, def, content).block === 'contacts') return 'contacts';
  if (def.buys !== undefined && valuableBlock(state, def.buys, content) !== null) return 'valuable';
  if (pastimeCount(state, def.id) >= def.yearlyLimit) return 'limit';
  if (def.quality && choice.quality === undefined) return 'quality';
  if (!def.quality && choice.quality !== undefined) return 'quality';
  if (choice.companionId !== undefined) {
    if (def.companion === 'none' || !companionOptions(state, def, content).some((c) => c.id === choice.companionId)) return 'companion';
  } else if (def.companion === 'required') {
    return 'companion';
  }
  if (def.evidence && def.companion === 'required' && evidenceCount(state, def, choice.companionId, content) === 0) return 'requires';
  if (def.mechanic === 'gamble') {
    if (choice.stake === undefined) return 'stake';
    if (choice.chase === true && lastLoss(state, content) === 0) return 'chase';
  } else if (choice.stake !== undefined || choice.chase !== undefined) return 'stake';
  if (def.mechanic === 'lawsuit') {
    if (choice.route === undefined) return 'route';
  } else if (choice.route !== undefined) return 'route';
  if (def.mechanic === 'loan' && loanOffer(state, def, content).block !== null) return 'approval';
  if (def.mechanic === 'name') {
    const block = nameBlock(state, def, choice, content);
    if (block !== null) return block;
  } else if (choice.first !== undefined || choice.last !== undefined || choice.consentId !== undefined) return 'name';
  // Chasing a loss may borrow a little; every other price comes from savings.
  const price = pastimePrice(state, def, choice, content);
  const borrow = def.mechanic === 'gamble' && choice.chase === true && state.character.age >= content.balance.economy.independenceAge ? scaledFor(state, content.balance.risk.chase.borrow, content) : 0;
  if (state.finances.savings + borrow < price) return 'afford';
  return null;
}

/** The tiers this activity defines, best first. */
export function definedTiers(def: PastimeDef): OutcomeTier[] {
  return OUTCOME_TIERS.filter((t) => def.tiers[t] !== undefined);
}

export const CATEGORY_ORDER: readonly PastimeCategory[] = PASTIME_CATEGORIES;

/** How many valuables you own: the Luxury screen mentions it. */
export const ownedValuables = (state: LifeState): number => valuablesOf(state).length;

function lastLoss(state: LifeState, content: ContentBundle): number {
  return lastGamblingLoss(state, content);
}
