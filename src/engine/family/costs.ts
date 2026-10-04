/**
 * What children cost, and child support (E2a): both go through the yearly
 * ledger (src/engine/systems/economy.ts). Each child under the adult age
 * who lives with you costs the balance's yearly amount for their age in your
 * city, by your lifestyle (half in shared custody, and your share only when
 * their other parent lives with you). Child support is paid when your
 * children live with their other parent (a share of your pay) and received
 * when they live with you (by the other parent's wealth), until the children
 * are grown. Numbers: balance/family.yaml (costs, support).
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { wholeDollars } from '../finance';
import { livingChildren } from './children';
import { livesWithYou } from './household';
import type { Id, LifeState } from '../types';

function costOfLiving(state: LifeState, content: ContentBundle): number {
  return content.cities[state.character.cityId]?.costOfLiving ?? 1;
}

/** What your children cost this year (whole dollars; nothing while you're in prison, where someone else has them). */
export function childCosts(state: LifeState, content: ContentBundle): number {
  if (state.housing.kind === 'incarcerated') return 0;
  const { costs } = content.balance.family;
  const { adultAge } = content.balance.relationships;
  let total = 0;
  for (const person of livingChildren(state, true)) {
    const age = state.currentYear - person.birthYear;
    if (age >= adultAge) continue;
    const shared = person.child.custody === 'shared' && state.relationships[person.id]?.kind === 'child';
    if (!livesWithYou(state, person.id) && !shared) continue;
    let amount = curveAt(costs.perChild, age) * costOfLiving(state, content) * costs.lifestyle[state.finances.lifestyle];
    if (shared) amount *= costs.sharedShare;
    // The other parent lives here too: they pay their share.
    if (person.child.otherParentId !== undefined && person.child.otherParentId === state.housing.partnerId) amount *= costs.partnerShare;
    total += amount;
  }
  return wholeDollars(total);
}

/** The minor children you have with this person, living with you ('you') or with them ('other'). */
export function supportChildren(state: LifeState, personId: Id, living: 'you' | 'other', content: ContentBundle): Id[] {
  const { untilAge } = content.balance.family.support;
  return livingChildren(state)
    .filter((p) => p.child.otherParentId === personId && p.child.custody === living && state.currentYear - p.birthYear < untilAge)
    .map((p) => p.id);
}

export interface SupportDue {
  paid: number;
  received: number;
}

/** This year's child support: what you pay and what you receive, from this year's gross income. Zero without an arrangement or any child it covers. */
export function childSupportDue(state: LifeState, gross: number, content: ContentBundle): SupportDue {
  const arrangement = state.family.support;
  if (!arrangement) return { paid: 0, received: 0 };
  const { support } = content.balance.family;
  const other = state.people[arrangement.personId];
  const scale = costOfLiving(state, content);
  if (arrangement.direction === 'pay') {
    const n = supportChildren(state, arrangement.personId, 'other', content).length;
    if (n === 0) return { paid: 0, received: 0 };
    const share = support.pay[Math.min(n, support.pay.length) - 1]!;
    return { paid: wholeDollars(Math.max(support.payMin * scale, gross * share)), received: 0 };
  }
  const n = supportChildren(state, arrangement.personId, 'you', content).length;
  if (n === 0 || !other?.alive) return { paid: 0, received: 0 };
  const more = n >= 2 ? support.receiveMore[Math.min(n, 3) - 2]! : 1;
  return { paid: 0, received: wholeDollars(support.receive[other.wealthLevel] * scale * more) };
}
