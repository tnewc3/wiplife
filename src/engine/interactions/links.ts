/**
 * Links from interactions to the systems that already exist (E1): money
 * people give or lend you goes through the finance module (earn and
 * addDebt), and being unfaithful leaves memories, a flag and (sometimes) a
 * follow-up event that finds you out. Gifts, fights, health risks and
 * charges use the finance, health and legal modules through the effects.
 */
import type { ContentBundle, GiftTier } from '../../content/schemas';
import { fittingResults } from '../actions/result';
import { addDebt, earn, isIndependent, wholeDollars } from '../finance';
import { weightedPick } from '../random';
import { currentPartner, isPartnerKind } from '../relationships';
import { chance, nextInt, type RngState } from '../rng';
import type { Id, LifeState } from '../types';

/** What this person gives or lends when asked now: their wealth's range, in your city's prices, less for a child. */
export function rollAskedAmount(state: LifeState, personId: Id, rng: RngState, content: ContentBundle): number {
  const person = state.people[personId];
  if (!person) return 0;
  const balance = content.balance.interactions.money;
  const range = balance.ask[person.wealthLevel];
  let amount = nextInt(rng, range.min, range.max) * (content.cities[state.character.cityId]?.costOfLiving ?? 1);
  if (!isIndependent(state, content)) amount *= balance.childShare;
  // Round to a note-friendly amount, at least $5.
  return Math.max(5, wholeDollars(Math.round(amount / 5) * 5));
}

/**
 * A person gives you money (a gift) or lends it (a loan: a personal debt,
 * paid back through the usual ledger). A child is only ever given it. Writes
 * the memory of it.
 */
export function giveMoney(state: LifeState, personId: Id, mode: 'gift' | 'loan', rng: RngState, content: ContentBundle): void {
  const rel = state.relationships[personId];
  if (!rel) return;
  const amount = rollAskedAmount(state, personId, rng, content);
  earn(state, amount);
  if (mode === 'loan' && isIndependent(state, content)) {
    const loan = content.balance.interactions.money.loan;
    addDebt(state, 'personal', amount, content, { annualRate: loan.annualRate, termYears: loan.termYears });
    rel.memories.push({ tag: 'lent_you_money', year: state.currentYear });
  } else {
    rel.memories.push({ tag: 'gave_you_money', year: state.currentYear });
  }
}

/**
 * Something unfaithful with this person (flirting or being intimate) while
 * you have a partner who isn't them: your partner gets the memory of being
 * cheated on, they get the memory of it, the `unfaithful` flag is set, and it
 * may be found out later by one of the registry's follow-up events. Does
 * nothing when you're single or it's your partner.
 */
export function betray(state: LifeState, personId: Id, act: 'flirt' | 'intimate', rng: RngState, content: ContentBundle): void {
  const partner = currentPartner(state);
  const rel = state.relationships[personId];
  if (!partner || !rel || partner.personId === personId) return;
  const year = state.currentYear;
  partner.memories.push({ tag: 'cheated_on_them', year });
  rel.memories.push({ tag: act === 'intimate' ? 'affair_with_you' : 'flirted_behind_their_back', year });
  state.flags.unfaithful = true;

  const { discovery, inYears } = content.balance.interactions.infidelity;
  if (!chance(rng, discovery[act])) return;
  const events = content.registries.interactions.infidelity[act].events;
  // The follow-up's roles: your partner for a partner kind, the other person otherwise.
  const options = events.flatMap((id) => {
    const def = content.events[id];
    if (!def) return [];
    const cast: Record<string, Id> = {};
    for (const [role, spec] of Object.entries(def.cast ?? {})) cast[role] = spec.kind !== undefined && isPartnerKind(spec.kind) ? partner.personId : personId;
    return fittingResults(state, [id], cast, content).map(([d, weight]) => [{ def: d, cast }, weight] as const);
  });
  if (options.length === 0) return;
  const { def, cast } = weightedPick(rng, options);
  state.scheduled.push({ eventId: def.id, dueYear: year + nextInt(rng, inYears.min, inYears.max), cast, since: year });
}

/** A gift tier's price now: at the national average, in your city's prices, and a fraction of that for a child. */
export function giftPrice(state: LifeState, tier: GiftTier, content: ContentBundle): number {
  const gifts = content.balance.interactions.gifts;
  let price = gifts.tiers[tier].price * (content.cities[state.character.cityId]?.costOfLiving ?? 1);
  if (!isIndependent(state, content)) price *= gifts.childShare;
  return Math.max(1, wholeDollars(price));
}

/** True when you can pay for the gift: savings, plus (once independent) a little borrowing. */
export function canAffordGift(state: LifeState, tier: GiftTier, content: ContentBundle): boolean {
  const reach = state.finances.savings + (isIndependent(state, content) ? content.balance.interactions.gifts.maxBorrow : 0);
  return giftPrice(state, tier, content) <= reach;
}
