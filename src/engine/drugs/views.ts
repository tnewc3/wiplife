/** What the drug screens show (D1): read-only views of the market, your stash and habits, recovery, dealing and operations. */
import type { ContentBundle, DealPrice, DrugSource, OperationKind } from '../../content/schemas';
import { isIncarcerated } from '../legal';
import type { DrugResult, Id, LifeState } from '../types';
import { buyBlock, contactPeople, introBlock, quote, sourcesFor, type BuyBlock, type IntroBlock } from './market';
import { demandFor, sellPrice, startBlock, type DealBlock } from './dealing';
import { opCost, opTypes, plannedOutput, raidChance, startOpBlock, type OpBlock } from './ops';
import { quitBlock } from './recovery';
import { addictedTo, canUseAge, drugIds, isAdult, liveDealers, maxDependence, priceRange, totalUsesThisYear, usesThisYear } from './query';
import { useBlock, type UseBlock } from './use';

export interface DrugRowView {
  id: Id;
  name: string;
  noun: string;
  category: string;
  blurb: string;
  unit: { one: string; many: string };
  price: { min: number; max: number };
  severity: number;
  sources: { source: DrugSource; quote: number | null; block: BuyBlock | null }[];
  held: { units: number; quality: number; hidden: boolean } | null;
  dependence: number;
  tolerance: number;
  uses: number;
  useLight: UseBlock | null;
  useHeavy: UseBlock | null;
}

export interface DrugMarketView {
  between: boolean;
  oldEnough: boolean;
  adult: boolean;
  savings: number;
  amounts: number[];
  used: number;
  limit: number;
  drugs: DrugRowView[];
  dealers: { id: Id; name: string }[];
  introBlock: IntroBlock | null;
  contacts: number;
  dealing: boolean;
  resaleMin: number;
  last: DrugResult | null;
}

export function getDrugMarketView(state: LifeState, content: ContentBundle): DrugMarketView {
  const b = content.balance.drugs;
  const between = state.phase === 'yearStart' && !isIncarcerated(state);
  const drugs: DrugRowView[] = drugIds(content).map((id) => {
    const def = content.drugs[id]!;
    const h = state.drugs.habits[id];
    const stock = state.drugs.stock[id];
    const open = sourcesFor(state, id, content);
    return {
      id,
      name: def.name,
      noun: def.noun,
      category: def.category,
      blurb: def.blurb,
      unit: def.unit,
      price: priceRange(state, def, content),
      severity: def.severity,
      sources: def.sources.map((source) => ({ source, quote: open.includes(source) ? (quote(state, id, source, 1, false, content)?.unit ?? null) : null, block: buyBlock(state, id, source, 1, false, content) })),
      held: stock ? { units: stock.units, quality: Math.round(stock.quality), hidden: stock.hidden } : null,
      dependence: Math.round(h?.dependence ?? 0),
      tolerance: Math.round(h?.tolerance ?? 0),
      uses: usesThisYear(state, id),
      useLight: useBlock(state, id, 'light', content),
      useHeavy: useBlock(state, id, 'heavy', content),
    };
  });
  return {
    between,
    oldEnough: canUseAge(state, content),
    adult: isAdult(state, content),
    savings: state.finances.savings,
    amounts: b.buy.amounts,
    used: totalUsesThisYear(state),
    limit: b.use.perYear,
    drugs,
    dealers: liveDealers(state).map((id) => ({ id, name: `${state.people[id]!.name.first} ${state.people[id]!.name.last}` })),
    introBlock: introBlock(state, content),
    contacts: contactPeople(state, content).length,
    dealing: state.drugs.dealing !== null,
    resaleMin: b.dealing.resaleMin,
    last: state.drugs.last,
  };
}

export interface HabitRowView {
  id: Id;
  name: string;
  noun: string;
  dependence: number;
  tolerance: number;
  peak: number;
  clean: number;
  quitYear: number;
  recovered: boolean;
  relapses: number;
  addicted: boolean;
  quit: ReturnType<typeof quitBlock>;
  craving: boolean;
}

export interface RecoveryView {
  between: boolean;
  habits: HabitRowView[];
  addicted: string[];
  worst: number;
  threshold: number;
  years: number;
  /** Recovery activities (ids in pastimes) to point at. */
  activities: Id[];
  last: DrugResult | null;
  total: { quits: number; recoveries: number; relapses: number };
}

export function getRecoveryView(state: LifeState, content: ContentBundle): RecoveryView {
  const b = content.balance.drugs;
  const habits: HabitRowView[] = Object.entries(state.drugs.habits)
    .filter(([id, h]) => content.drugs[id] && h.total > 0 && (h.dependence > 0 || h.tolerance > 0 || h.quitYear > 0 || h.recovered))
    .sort((a, b2) => b2[1].dependence - a[1].dependence || (a[0] < b2[0] ? -1 : 1))
    .map(([id, h]) => ({
      id,
      name: content.drugs[id]!.name,
      noun: content.drugs[id]!.noun,
      dependence: Math.round(h.dependence),
      tolerance: Math.round(h.tolerance),
      peak: Math.round(h.peak),
      clean: h.clean,
      quitYear: h.quitYear,
      recovered: h.recovered,
      relapses: h.relapses,
      addicted: h.dependence >= b.threshold,
      quit: quitBlock(state, id, content),
      craving: h.dependence >= b.habit.craving,
    }));
  return {
    between: state.phase === 'yearStart' && !isIncarcerated(state),
    habits,
    addicted: addictedTo(state, content),
    worst: Math.round(maxDependence(state)),
    threshold: b.threshold,
    years: b.recovery.recoveredYears,
    activities: b.recovery.activities,
    last: state.drugs.last,
    total: { quits: state.drugs.totals.quits, recoveries: state.drugs.totals.recoveries, relapses: state.drugs.totals.relapses },
  };
}

export interface OpRowView {
  id: Id;
  name: string;
  kind: OperationKind;
  drug: string;
  quality: number;
  running: 'low' | 'full';
  output: number;
  raid: number;
  last: number;
}

export interface OpTypeView {
  id: Id;
  name: string;
  kind: OperationKind;
  blurb: string;
  startup: number;
  upkeep: number;
  capacity: number;
  drugs: { id: Id; name: string; block: OpBlock | null }[];
}

export interface DealingView {
  between: boolean;
  adult: boolean;
  dealing: { drugId: Id; drug: string; customers: number; price: DealPrice; standing: number; demand: number; unit: number; sold: number; earned: number; since: number } | null;
  startable: { id: Id; name: string; block: DealBlock | null }[];
  stock: { id: Id; name: string; units: number; quality: number }[];
  dirty: number;
  heat: number;
  ops: OpRowView[];
  opTypes: OpTypeView[];
  maxOps: number;
  totals: { sold: number; earned: number; produced: number; raids: number };
  last: DrugResult | null;
}

export function getDealingView(state: LifeState, content: ContentBundle): DealingView {
  const d = state.drugs.dealing;
  const def = d ? content.drugs[d.drugId] : undefined;
  return {
    between: state.phase === 'yearStart' && !isIncarcerated(state),
    adult: isAdult(state, content),
    dealing: d && def ? { drugId: d.drugId, drug: def.name, customers: d.customers, price: d.price, standing: d.standing, demand: demandFor(state, content), unit: sellPrice(state, content), sold: d.year.sold, earned: d.year.earned, since: d.since } : null,
    startable: drugIds(content).map((id) => ({ id, name: content.drugs[id]!.name, block: startBlock(state, id, content) })),
    stock: Object.entries(state.drugs.stock)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, s]) => ({ id, name: content.drugs[id]?.name ?? id, units: s.units, quality: Math.round(s.quality) })),
    dirty: state.finances.dirty,
    heat: state.crime.heat,
    ops: state.drugs.ops.map((op) => ({ id: op.id, name: op.name, kind: content.operations[op.defId]?.kind ?? 'grow', drug: content.drugs[op.drugId]?.name ?? op.drugId, quality: Math.round(op.quality), running: op.running, output: plannedOutput(op, content), raid: raidChance(state, op, content), last: op.last.units })),
    opTypes: opTypes(content).map((o) => ({
      id: o.id,
      name: o.name,
      kind: o.kind,
      blurb: o.blurb,
      startup: opCost(state, o, content).startup,
      upkeep: opCost(state, o, content).upkeep,
      capacity: o.capacity,
      drugs: o.drugs.map((id) => ({ id, name: content.drugs[id]?.name ?? id, block: startOpBlock(state, o.id, id, content) })),
    })),
    maxOps: content.balance.drugs.production.max,
    totals: { sold: state.drugs.totals.sold, earned: state.drugs.totals.earned, produced: state.drugs.totals.produced, raids: state.drugs.totals.raids },
    last: state.drugs.last,
  };
}
