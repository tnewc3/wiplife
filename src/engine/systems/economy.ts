/**
 * Economy (year pipeline step 5): the yearly ledger (docs/design.md, section
 * J). Numbers come from src/content/balance/economy.yaml.
 *
 * As each year begins, in this order:
 * 1. An adult with no parent left to live with rents a place of their own;
 *    a partner who is no longer your partner no longer lives with you.
 * 2. Interest: debts grow by their rate, savings earn interest, home values move.
 * 3. Gross earned income (salary and gig pay) and estimated tax; the
 *    retirement benefit from the retirement age (untaxed), from the earnings
 *    record, which this year's earnings then join. A collections debt that
 *    is behind garnishes a share of gross income.
 * 4. Housing and living costs (lifestyle × city). At your parents', the
 *    family covers whatever share of them you can't pay.
 * 5. Minimum debt payments from what is left. A payment savings can't cover
 *    is missed; the costs savings can't cover become personal debt, so
 *    savings never go below zero.
 * 6. Missed payments add up: a debt missed often enough goes to collections,
 *    a mortgage to foreclosure, and years in a row behind on rent (borrowing
 *    for a large share of it) end in eviction. The most serious of these (or a plain
 *    missed payment, or garnishment) queues an event from
 *    registries/triggers.yaml for this year, so a chain begins.
 * 7. Lifestyle, homelessness and missed payments pull on happiness, stress
 *    and health.
 */
import { TRIGGER_IDS, type ContentBundle, type StatEffects, type TriggerId } from '../../content/schemas';
import { eventWeight } from '../events/selection';
import {
  borrow,
  clearPaidDebts,
  isIndependent,
  paymentDue,
  sendToCollections,
  wholeDollars,
} from '../finance';
import { housingCost, livingCost, moveTo, refreshHousingCost, sellHome, settleHousehold, supportingParent } from '../housing';
import { recordEarnings, retirementBenefit } from '../retirement';
import { clampInt, weightedPick } from '../random';
import { chance } from '../rng';
import type { Debt, LifeState, StatKey } from '../types';
import { yearIncome } from './career';
import { writeFromGroup } from './history';

/** Estimated tax on a year's gross income: marginal brackets from balance, rounded to whole dollars. */
export function taxOn(gross: number, content: ContentBundle): number {
  const { brackets } = content.balance.economy.tax;
  let tax = 0;
  brackets.forEach((bracket, i) => {
    const top = brackets[i + 1]?.from ?? Infinity;
    const taxed = Math.min(gross, top) - bracket.from;
    if (taxed > 0) tax += taxed * bracket.rate;
  });
  return wholeDollars(tax);
}

/** Debts are paid in this order when money is short: the home first, collections last. */
const PAYMENT_ORDER: Record<Debt['kind'], number> = { mortgage: 0, student: 1, medical: 2, personal: 3, collections: 4 };

/** Applies yearly stat pulls (fractions happen by chance). */
export function applyStatEffects(state: LifeState, effects: StatEffects): void {
  for (const key of Object.keys(effects).sort() as StatKey[]) {
    const pull = effects[key];
    if (!pull || pull.perYear === 0) continue;
    const size = Math.abs(pull.perYear);
    const whole = Math.floor(size);
    const points = whole + (size > whole && chance(state.rng, size - whole) ? 1 : 0);
    const value = state.character.stats[key];
    const next = pull.perYear > 0 ? Math.max(value, Math.min(pull.limit, value + points)) : Math.min(value, Math.max(pull.limit, value - points));
    state.character.stats[key] = clampInt(next, 0, 100);
  }
}

function cityName(state: LifeState, content: ContentBundle): string {
  return content.cities[state.character.cityId]?.name ?? state.character.cityId;
}

/**
 * Queues the most serious trigger's event for this year: one that fits (by
 * weight, like any event: requirements, cooldowns, one-time rules), picked
 * from registries/triggers.yaml. The pacing director shows it first.
 */
export function queueTrigger(state: LifeState, triggers: ReadonlySet<TriggerId>, content: ContentBundle): void {
  for (const id of TRIGGER_IDS) {
    if (!triggers.has(id)) continue;
    const options = content.registries.triggers.triggers[id].events.flatMap((eventId) => {
      const def = content.events[eventId];
      if (!def || def.retired) return [];
      const weight = eventWeight(state, def, content);
      return weight > 0 ? [[def, weight] as const] : [];
    });
    if (options.length === 0) continue;
    const def = weightedPick(state.rng, options);
    if (!state.scheduled.some((s) => s.eventId === def.id && s.dueYear <= state.currentYear)) {
      state.scheduled.push({ eventId: def.id, dueYear: state.currentYear, cast: {} });
    }
    return;
  }
}

/** Step 5: run the yearly ledger. */
export function runEconomy(state: LifeState, content: ContentBundle): void {
  const eco = content.balance.economy;
  const f = state.finances;
  const adult = isIndependent(state, content);
  const triggers = new Set<TriggerId>();
  const history = content.text.history;

  // 1. Nobody left to live with.
  settleHousehold(state, content);
  if (adult && state.housing.kind === 'with_parents' && !supportingParent(state)) {
    moveTo(state, 'renting', state.character.cityId, content);
    writeFromGroup(state, history.home.familyHomeGone, ['home', 'familyHomeGone'], { values: { city: cityName(state, content) } }, content);
  }

  // 2. Interest and home values.
  const interest = wholeDollars(f.savings * eco.interest.savings);
  let debtInterest = 0;
  for (const debt of f.debts) {
    const added = wholeDollars(debt.balance * debt.annualRate);
    debt.balance = wholeDollars(debt.balance + added);
    debtInterest += added;
  }
  if (state.housing.kind === 'owned' && state.housing.homeValue !== undefined) {
    state.housing.homeValue = Math.max(0, wholeDollars(state.housing.homeValue * (1 + eco.ownership.appreciation)));
  }

  // 3. Income, tax and garnishment. The benefit comes from the record so far.
  const gross = yearIncome(state, content);
  const tax = taxOn(gross, content);
  const retirement = retirementBenefit(state, content);
  recordEarnings(state, gross, content);
  const garnishedOn = new Map<string, number>();
  let garnishable = f.debts.some((d) => d.kind === 'collections' && d.missed > 0) ? wholeDollars(gross * eco.missed.garnishShare) : 0;
  for (const debt of f.debts) {
    if (debt.kind !== 'collections' || debt.missed === 0 || garnishable <= 0) continue;
    const taken = Math.min(garnishable, debt.balance);
    debt.balance -= taken;
    garnishable -= taken;
    garnishedOn.set(debt.id, taken);
  }
  const garnished = [...garnishedOn.values()].reduce((a, b) => a + b, 0);
  if (garnished > 0) triggers.add('garnishment');

  // 4. Costs.
  let housing = housingCost(state, content);
  let living = livingCost(state, content);
  const before = f.savings + interest + gross + retirement - tax - garnished;
  let support = 0;
  if (state.housing.kind === 'with_parents' && before < housing + living) {
    support = Math.min(housing + living, housing + living - Math.max(0, before));
    const fromLiving = Math.min(living, support);
    living -= fromLiving;
    housing -= support - fromLiving;
  }

  // 5. Minimum payments from what is left, then any shortfall is borrowed.
  let available = before - housing - living;
  let debtPayments = garnished;
  let missedAny = false;
  const ordered = [...f.debts].sort((a, b) => PAYMENT_ORDER[a.kind] - PAYMENT_ORDER[b.kind]);
  for (const debt of ordered) {
    const already = garnishedOn.get(debt.id) ?? 0;
    const due = Math.max(0, paymentDue({ ...debt, balance: debt.balance + already }) - already);
    const paid = Math.max(0, Math.min(due, available));
    debt.balance -= paid;
    available -= paid;
    debtPayments += paid;
    if (paid < due) {
      debt.missed += 1;
      missedAny = true;
    } else {
      debt.missed = 0;
    }
  }
  const net = gross + retirement + interest - tax - housing - living - debtPayments;
  let borrowed = 0;
  if (available >= 0) {
    f.savings = wholeDollars(available);
  } else {
    f.savings = 0;
    // A child's family covers what they can't (children have no costs of their own).
    if (adult) borrowed = borrow(state, -available, content);
  }
  f.hardshipYears = housing > 0 && borrowed >= housing * eco.missed.evictionShare ? f.hardshipYears + 1 : 0;
  if (missedAny) triggers.add('missed_payment');

  // 6. Consequences of falling behind.
  for (const debt of [...f.debts]) {
    if (debt.kind === 'mortgage' || debt.kind === 'collections' || debt.missed < eco.missed.collectionsAfter) continue;
    sendToCollections(state, debt, content);
    if (!triggers.has('collections')) writeFromGroup(state, history.money.collections, ['money', 'collections'], {}, content);
    triggers.add('collections');
  }
  const mortgage = f.debts.find((d) => d.id === state.housing.mortgageDebtId);
  if (state.housing.kind === 'owned' && mortgage && mortgage.missed >= eco.missed.foreclosureAfter) {
    sellHome(state, content, eco.missed.foreclosureSale);
    triggers.add('foreclosure');
    writeFromGroup(state, history.home.foreclosed, ['home', 'foreclosed'], { values: { city: cityName(state, content) } }, content);
  }
  if (state.housing.kind === 'renting' && f.hardshipYears >= eco.missed.evictionAfter) {
    moveTo(state, 'homeless', state.character.cityId, content);
    triggers.add('eviction');
    writeFromGroup(state, history.home.evicted, ['home', 'evicted'], { values: { city: cityName(state, content) } }, content);
  }
  clearPaidDebts(state, content);

  // 7. How your circumstances feel.
  if (adult) {
    if (state.housing.kind === 'homeless') applyStatEffects(state, eco.homeless.effects);
    else if (state.housing.kind !== 'incarcerated') applyStatEffects(state, eco.lifestyle[f.lifestyle].effects);
    if (missedAny) applyStatEffects(state, eco.missed.effects);
  }

  f.lastLedger = {
    year: state.currentYear,
    gross,
    retirement,
    tax,
    housing,
    living,
    debtPayments,
    interest,
    debtInterest,
    borrowed,
    support,
    net,
  };
  refreshHousingCost(state, content);
  queueTrigger(state, triggers, content);
}
