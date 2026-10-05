/**
 * Possessions in an estate (E5, the extension point E2b left): pets,
 * vehicles and vacation homes pass in kind, not as cash.
 *
 * `planPossessions` runs before the cash is worked out. Debts attached to a
 * possession (a car loan, a vacation home's mortgage) are not the estate's
 * debts: they go with it. A pet goes to the beneficiary best placed to look
 * after it (living in your household, then in your city). A vehicle goes to
 * the beneficiary with the largest share who is old enough to drive (to
 * carry a loan, old enough to borrow); a vacation home to the largest share
 * among those old enough to own a home. One worth less than what is owed on
 * it goes back to the lender; nobody inherits debt beyond what it is worth.
 * With no one who can take it, or when the estate can't pay its costs and
 * debts from cash, a vehicle or home is sold: what it brings, less selling
 * costs and its loan, joins the cash (`possessionSales`). Pure: no random numbers.
 *
 * `receivePossessions` gives the heir theirs (a pet at home, a car in the
 * drive), with any loan.
 */
import type { ContentBundle } from '../../content/schemas';
import { addDebt, wholeDollars } from '../finance';
import { whereabouts } from '../presence';
import { clampInt } from '../random';
import { loanIdOf, nextPossessionId } from '../possessions/query';
import type { Id, LifeState, Possession, PossessionTransfer, WillShare } from '../types';

/** A beneficiary who is a person, as the plan sees them. */
export interface Taker extends WillShare {
  relation: string;
}

export interface PossessionPlan {
  transfers: PossessionTransfer[];
  /** Cash from what was sold, after selling costs and loans (never negative). */
  sold: number;
  /** Loans on what went back to the lender or was sold for less than owed: written off, never passed on. */
  writtenOff: number;
}

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

function ageOfPerson(life: LifeState, id: Id): number {
  const person = life.people[id];
  return person ? life.currentYear - person.birthYear : 0;
}

function owed(life: LifeState, p: Possession): number {
  return life.finances.debts.find((d) => d.id === loanIdOf(p))?.balance ?? 0;
}

/** The best of these takers: the largest share, then the lowest id. */
function largest(takers: readonly Taker[]): Taker | undefined {
  return [...takers].sort((a, b) => b.percent - a.percent || byId(a.id, b.id))[0];
}

/** Decides what happens to every pet, vehicle and vacation home of the life that ended. */
export function planPossessions(life: LifeState, shares: readonly Taker[], insolvent: boolean, content: ContentBundle): PossessionPlan {
  const people = shares.filter((s) => s.kind === 'person' && life.people[s.id]?.alive === true);
  const b = content.balance.possessions;
  const independence = content.balance.economy.independenceAge;
  const plan: PossessionPlan = { transfers: [], sold: 0, writtenOff: 0 };
  const selling = content.balance.economy.ownership.sellingCosts;

  const pass = (p: Possession, taker: Taker, loan: number) => plan.transfers.push({ possessionId: p.id, toPersonId: taker.id, item: JSON.parse(JSON.stringify(p)) as Possession, loan });

  for (const p of [...life.possessions.items].sort((x, y) => byId(x.id, y.id))) {
    if (p.pet?.died !== undefined) continue;
    const loan = owed(life, p);
    if (p.kind === 'pet') {
      const best = [...people].sort((x, y) => {
        const score = (t: Taker) => b.estate.petPresence[whereabouts(life, t.id, content)];
        return score(y) - score(x) || y.percent - x.percent || byId(x.id, y.id);
      })[0];
      if (best) pass(p, best, 0);
      continue;
    }
    const isHome = p.kind === 'home';
    const proceeds = wholeDollars(p.value * (isHome ? 1 - selling : b.vehicles.sellShare));
    if (p.value < loan) {
      // Underwater: it goes back to the lender; the rest of the loan is never inherited.
      plan.writtenOff += Math.max(0, loan - proceeds);
      continue;
    }
    const minAge = isHome || loan > 0 ? independence : b.drivingAge;
    const taker = insolvent ? undefined : largest(people.filter((t) => ageOfPerson(life, t.id) >= minAge));
    if (taker) pass(p, taker, loan);
    else {
      plan.sold += Math.max(0, proceeds - loan);
      plan.writtenOff += Math.max(0, loan - proceeds);
    }
  }
  return plan;
}

/**
 * Moves the transfers made to the heir into the heir's new life: a pet at
 * home, a car in the drive, a vacation home with its mortgage. Loans come
 * with them as debts of the same kind. A pet starts over with no record of
 * this year's care.
 */
export function receivePossessions(heir: LifeState, transfers: readonly PossessionTransfer[], content: ContentBundle): void {
  for (const t of transfers) {
    const item: Possession = JSON.parse(JSON.stringify(t.item)) as Possession;
    item.id = nextPossessionId(heir);
    // It came to the heir this year, and keeps the age it had.
    const lived = Math.max(0, heir.currentYear - item.acquired);
    item.acquired = heir.currentYear;
    if (item.pet) {
      // A pet at the end of its life still has this year with them.
      item.pet.startAge = Math.min(item.pet.startAge + lived, Math.max(0, item.pet.lifespan - 1));
      delete item.pet.interactions;
      delete item.pet.vetYear;
      item.pet.bond = clampInt(item.pet.bond - 10, 0, 100);
    }
    if (item.vehicle) {
      item.vehicle.startAge += lived;
      delete item.vehicle.loanDebtId;
      delete item.vehicle.serviceYear;
      if (t.loan > 0) item.vehicle.loanDebtId = addDebt(heir, 'auto', t.loan, content, { termYears: content.balance.possessions.vehicles.loan.termYears }).id;
    }
    if (item.home) {
      delete item.home.mortgageDebtId;
      if (t.loan > 0) item.home.mortgageDebtId = addDebt(heir, 'mortgage', t.loan, content).id;
    }
    heir.possessions.items.push(item);
  }
}
