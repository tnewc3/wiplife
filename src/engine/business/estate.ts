/**
 * Businesses in an estate (W3, the extension point E2b and E5 left): a
 * business passes in kind to the beneficiary with the largest share who is old
 * enough to own one, with the loans taken for it (never more than it is worth:
 * nobody inherits debt beyond a business's value). With no one who can take it,
 * or when the estate cannot pay its costs and debts from cash, it is sold: your
 * share of what it brings, after its loans, joins the cash. A business worth
 * less than its loans goes back to the lenders, and what was owed beyond it is
 * written off. Pure: no random numbers.
 *
 * `receiveBusinesses` gives the heir theirs: the same business, with the dead
 * owner's share now the heir's, the family and friends still in the heir's life
 * still on its staff and among its owners, and the loans as the heir's debts.
 */
import type { ContentBundle } from '../../content/schemas';
import { addDebt, wholeDollars } from '../finance';
import { ageOf } from '../relationships';
import type { Business, BusinessTransfer, Id, LifeState, WillShare } from '../types';
import { loanBalance, yourShare } from './query';
import { salePrice } from './model';
import { refreshWorth } from './value';

export interface BusinessPlan {
  transfers: BusinessTransfer[];
  /** Cash from what was sold: your share after loans and the broker (never negative). */
  sold: number;
  /** Loans on businesses that went back to the lender or sold for less than owed: written off, never passed on. */
  writtenOff: number;
}

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** Decides what happens to every business of the life that ended. */
export function planBusinesses(life: LifeState, shares: readonly (WillShare & { relation: string })[], insolvent: boolean, content: ContentBundle): BusinessPlan {
  const plan: BusinessPlan = { transfers: [], sold: 0, writtenOff: 0 };
  const independence = content.balance.economy.independenceAge;
  const people = shares.filter((s) => s.kind === 'person' && life.people[s.id]?.alive === true);
  for (const b of [...life.business.items].sort((x, y) => byId(x.id, y.id))) {
    const loan = loanBalance(life, b);
    const proceeds = salePrice(b, content);
    const share = yourShare(b);
    if (proceeds < loan) {
      // Underwater: it goes back to the lenders; the rest of the loans is never inherited.
      plan.writtenOff += Math.max(0, loan - proceeds);
      continue;
    }
    const taker = insolvent
      ? undefined
      : [...people].filter((t) => ageOf(life, life.people[t.id]!) >= independence).sort((x, y) => y.percent - x.percent || byId(x.id, y.id))[0];
    if (taker) plan.transfers.push({ businessId: b.id, toPersonId: taker.id, item: JSON.parse(JSON.stringify(b)) as Business, loan });
    else plan.sold += Math.max(0, wholeDollars(((proceeds - loan) * share) / 100));
  }
  return plan;
}

/** Gives the heir the businesses that passed to them. */
export function receiveBusinesses(heir: LifeState, transfers: readonly BusinessTransfer[], content: ContentBundle): void {
  const bs = heir.business;
  for (const t of transfers) {
    const b = JSON.parse(JSON.stringify(t.item)) as Business;
    b.id = `b${bs.nextBusiness++}`;
    b.how = 'inherited';
    const remap = new Map<Id, Id>();
    b.locations = b.locations.map((l) => {
      const id = `l${bs.nextLocation++}`;
      remap.set(l.id, id);
      return { ...l, id };
    });
    delete b.auditedYear;
    b.loanIds = [];
    b.report = null;
    b.profits = b.profits.slice(-2);
    b.lossYears = 0;
    if (t.loan > 0) b.loanIds.push(addDebt(heir, 'business', t.loan, content, { termYears: content.balance.business.funding.loan.termYears }).id);
    // Those still in the heir's life stay on: staff who are alive and active, owners as they were.
    b.staff = b.staff.flatMap((s) => {
      const p = heir.people[s.personId];
      const rel = heir.relationships[s.personId];
      if (!p || !p.alive || !rel || rel.status === 'ended') return [];
      if (!p.tags.includes('staff')) p.tags.push('staff');
      return [{ ...s, locationId: s.locationId === null ? null : (remap.get(s.locationId) ?? b.locations[0]!.id) }];
    });
    if (b.role === 'manager' && !b.staff.some((s) => s.manager)) b.role = 'self';
    for (const o of b.owners) {
      if (o.id === 'you') {
        o.name = `${heir.character.name.first} ${heir.character.name.last}`;
        o.put = 0;
        o.paid = 0;
        o.year = heir.currentYear;
      }
    }
    bs.items.push(b);
  }
  refreshWorth(heir, content);
}
