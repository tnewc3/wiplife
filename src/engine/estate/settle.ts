/**
 * Estate settlement (E2b), worked out when a life ends and kept on the life
 * as `estate`. Pure: it reads the life and draws no random numbers.
 *
 * Order, from balance/family.yaml estate:
 *  1. Costs: the funeral (scaled to the city), then legal and settlement
 *     costs, paid from savings (and any money held in trust).
 *  2. Debts other than the mortgage, paid from what is left. Anything the
 *     estate can't pay is sold for: if savings fall short, the home is sold
 *     (selling costs, then the mortgage, then the shortfall). Whatever is
 *     still owed is written off. Debts are never passed on.
 *  3. The home passes with its mortgage to one beneficiary (your spouse
 *     first, then whoever has the largest share) if their share covers its
 *     equity; otherwise it is sold and the equity joins the cash. A home worth
 *     less than its mortgage goes back to the lender: nobody inherits that debt.
 *  4. The rest, cash and equity, is shared by the will (shares to people who
 *     have died are dropped and the rest scaled up), or by the default shares.
 *
 * Estate tax (a share of the cash and equity left, by the size of the estate)
 * comes off before the shares; a home that would have to be sold to pay it is
 * sold. Nothing is created or lost: savings + the home's value = costs +
 * debts paid + tax + the mortgage paid + selling costs + every share + what
 * nobody was left to receive (checked by tests).
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { wholeDollars } from '../finance';
import type { EstateLine, Id, LifeState, Settlement, WillShare } from '../types';
import { passPossessions } from './possessions';
import { fullName, livingWill } from './will';

/** A beneficiary before money: who, how related, and their percent. */
interface Share extends WillShare {
  name: string;
  relation: EstateLine['relation'];
}

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** Splits 100 percent into `n` whole parts, the remainder to the first (the eldest, by order). */
function equalPercents(total: number, n: number): number[] {
  const each = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => each + (i === 0 ? total - each * n : 0));
}

function personShare(state: LifeState, id: Id, percent: number): Share {
  const person = state.people[id]!;
  return { kind: 'person', id, percent, name: fullName(person), relation: state.relationships[id]!.kind };
}

/**
 * Who inherits by default: with a spouse and children, the spouse's share
 * and the children split the rest; a spouse and no children, the spouse's
 * share and living parents and siblings split the rest; children and no
 * spouse, equally; no one else, living parents and then siblings.
 */
export function defaultShares(state: LifeState, content: ContentBundle): Share[] {
  const d = content.balance.family.estate.default;
  const alive = (kinds: readonly string[]) =>
    Object.keys(state.relationships)
      .sort(byId)
      .filter((id) => {
        const rel = state.relationships[id]!;
        return kinds.includes(rel.kind) && rel.status !== 'ended' && state.people[id]?.alive === true;
      });
  const spouse = alive(['spouse'])[0];
  // Children sorted eldest first: the remainder of an uneven split goes to the eldest.
  const children = alive(['child']).sort((a, b) => state.people[a]!.birthYear - state.people[b]!.birthYear || byId(a, b));
  const parents = alive(['parent']);
  const siblings = alive(['sibling']);
  const out: Share[] = [];
  const split = (ids: Id[], total: number) => equalPercents(total, ids.length).forEach((percent, i) => out.push(personShare(state, ids[i]!, percent)));

  if (spouse !== undefined && children.length > 0) {
    out.push(personShare(state, spouse, d.spouseWithChildren));
    split(children, 100 - d.spouseWithChildren);
  } else if (spouse !== undefined) {
    const others = [...parents, ...siblings];
    if (others.length === 0) out.push(personShare(state, spouse, 100));
    else {
      out.push(personShare(state, spouse, d.spouseOnly));
      split(others, 100 - d.spouseOnly);
    }
  } else if (children.length > 0) {
    split(children, 100);
  } else if (parents.length > 0 && siblings.length > 0) {
    split(parents, d.parents);
    split(siblings, 100 - d.parents);
  } else if (parents.length > 0) {
    split(parents, 100);
  } else if (siblings.length > 0) {
    split(siblings, 100);
  }
  return out.filter((s) => s.percent > 0);
}

/** The shares the estate follows: the will (what is left of it) or the defaults. */
export function estateShares(state: LifeState, content: ContentBundle): { source: Settlement['source']; shares: Share[] } {
  const kept = livingWill(state.will, state, content);
  if (kept) {
    const shares = kept.map((s): Share =>
      s.kind === 'cause'
        ? { ...s, name: content.registries.estate.causes[s.id]!.name, relation: 'cause' }
        : personShare(state, s.id, s.percent),
    );
    return { source: 'will', shares };
  }
  return { source: 'default', shares: defaultShares(state, content) };
}

/** Whole-dollar entitlements for the shares of `total`: each is floor(total × percent ÷ 100), the remainder to the largest share (the first on a tie). */
function entitlements(shares: readonly Share[], total: number): number[] {
  const parts = shares.map((s) => Math.floor((total * s.percent) / 100));
  const rest = total - parts.reduce((sum, n) => sum + n, 0);
  if (rest > 0 && shares.length > 0) {
    let top = 0;
    shares.forEach((s, i) => {
      if (s.percent > shares[top]!.percent) top = i;
    });
    parts[top]! += rest;
  }
  return parts;
}

/** How the estate of a life is settled (see the module comment). */
export function settleEstate(life: LifeState, content: ContentBundle): Settlement {
  const { estate } = content.balance.family;
  const selling = content.balance.economy.ownership.sellingCosts;
  const f = life.finances;
  const savings = wholeDollars(f.savings + (f.trust?.balance ?? 0));
  const homeValue = wholeDollars(life.housing.homeValue ?? 0);
  const mortgageDebt = life.finances.debts.find((d) => d.id === life.housing.mortgageDebtId);
  const mortgage = wholeDollars(mortgageDebt?.balance ?? 0);
  const debts = wholeDollars(f.debts.filter((d) => d.id !== life.housing.mortgageDebtId).reduce((sum, d) => sum + d.balance, 0));
  const costOfLiving = content.cities[life.character.cityId]?.costOfLiving ?? 1;
  const costsDue = wholeDollars(estate.funeral * costOfLiving) + wholeDollars((savings + homeValue) * estate.settlementShare);

  // Costs, then debts, from savings.
  let cash = savings;
  const costsFromCash = Math.min(cash, costsDue);
  cash -= costsFromCash;
  const debtsFromCash = Math.min(cash, debts);
  cash -= debtsFromCash;
  let costs = costsFromCash;
  let debtsPaid = debtsFromCash;
  let owedCosts = costsDue - costsFromCash;
  let owedDebts = debts - debtsFromCash;

  let home = 'none' as Settlement['home'];
  let mortgagePaid = 0;
  let saleCosts = 0;
  let equity = 0;
  const sell = () => {
    saleCosts = wholeDollars(homeValue * selling);
    const net = homeValue - saleCosts;
    mortgagePaid = Math.min(mortgage, net);
    let left = net - mortgagePaid;
    const toCosts = Math.min(left, owedCosts);
    costs += toCosts;
    owedCosts -= toCosts;
    left -= toCosts;
    const toDebts = Math.min(left, owedDebts);
    debtsPaid += toDebts;
    owedDebts -= toDebts;
    left -= toDebts;
    cash += left;
    home = 'sold';
  };
  if (homeValue > 0) {
    if (owedCosts + owedDebts > 0) sell();
    else if (homeValue < mortgage) {
      // Underwater: the lender takes the home, and the rest of the mortgage is never inherited.
      home = 'surrendered';
      mortgagePaid = homeValue;
    } else {
      home = 'passes';
      equity = homeValue - mortgage;
    }
  }

  // Estate tax on what is left to share out, from cash; a home that would have to be sold to pay it is sold.
  const estateValue = cash + (home === 'passes' ? equity : 0);
  const taxDue = wholeDollars(estateValue * curveAt(estate.tax, estateValue));
  if (taxDue > cash && home === 'passes') sell();
  const tax = Math.min(taxDue, cash);
  cash -= tax;

  const { source, shares } = estateShares(life, content);
  let lines: EstateLine[] = [];
  let unclaimed = 0;

  if (home === 'passes' && shares.length === 0) {
    // Nobody to take the home: it is sold.
    sell();
  }
  if (home === 'passes') {
    const total = cash + equity;
    const parts = entitlements(shares, total);
    // Your spouse takes the home first; otherwise the largest share. A share must cover the home's equity.
    const order = shares.map((s, i) => ({ s, i })).sort((a, b) => (b.s.relation === 'spouse' ? 1 : 0) - (a.s.relation === 'spouse' ? 1 : 0) || b.s.percent - a.s.percent || a.i - b.i);
    const holder = order.find(({ s, i }) => s.kind === 'person' && parts[i]! >= equity);
    if (holder) {
      lines = shares.map((s, i): EstateLine => ({
        kind: s.kind,
        id: s.id,
        name: s.name,
        relation: s.relation,
        percent: s.percent,
        cash: parts[i]! - (i === holder.i ? equity : 0),
        ...(i === holder.i ? { property: { value: homeValue, mortgage } } : {}),
      }));
    } else {
      sell();
    }
  }
  if (lines.length === 0) {
    // The home is gone (sold, surrendered or never owned): share the cash.
    const parts = entitlements(shares, cash);
    lines = shares.map((s, i): EstateLine => ({ kind: s.kind, id: s.id, name: s.name, relation: s.relation, percent: s.percent, cash: parts[i]! }));
    if (shares.length === 0) unclaimed = cash;
  }

  const possessions = passPossessions(life, lines, content);
  const netEstate = lines.reduce((sum, l) => sum + l.cash + (l.property ? l.property.value - l.property.mortgage : 0), 0) + unclaimed;
  return {
    year: life.currentYear,
    source,
    savings,
    homeValue,
    mortgage,
    costs,
    debtsPaid,
    tax,
    writtenOff: owedDebts + (home === 'sold' || home === 'surrendered' ? mortgage - mortgagePaid : 0),
    home,
    mortgagePaid,
    saleCosts,
    netEstate,
    lines,
    unclaimed,
    possessions,
  };
}
