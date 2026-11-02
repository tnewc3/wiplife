/** The `drugs` condition (D1): what you have used, depend on, hold, deal and make. Every field given must hold. */
import type { ContentBundle, DrugsCondition } from '../../content/schemas';
import type { Compare } from '../../content/schemas';
import type { LifeState } from '../types';
import { inRecovery } from './year';
import { liveDealers, maxDependence, totalUnits, usedDrugs } from './query';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

export function drugsHolds(c: DrugsCondition, state: LifeState, content?: ContentBundle): boolean {
  const d = state.drugs;
  const habits = Object.values(d.habits);
  const threshold = content?.balance.drugs.threshold ?? 25;
  if (c.tried !== undefined && (habits.some((h) => h.total > 0)) !== c.tried) return false;
  if (c.using !== undefined && habits.some((h) => h.last >= state.currentYear - 1 && h.total > 0) !== c.using) return false;
  if (c.dependence && !within(maxDependence(state), c.dependence)) return false;
  if (c.addicted !== undefined && (maxDependence(state) >= threshold) !== c.addicted) return false;
  if (c.recovering !== undefined && habits.some((h) => h.peak >= threshold && h.quitYear > 0 && !h.recovered) !== c.recovering) return false;
  if (c.recovered !== undefined && habits.some((h) => h.recovered) !== c.recovered) return false;
  if (c.clean && !within(Math.max(0, ...habits.filter((h) => content !== undefined && inRecovery(h, content)).map((h) => h.clean)), c.clean)) return false;
  if (c.relapses && !within(habits.reduce((n, h) => n + h.relapses, 0), c.relapses)) return false;
  if (c.stock && !within(totalUnits(state), c.stock)) return false;
  if (c.hiding !== undefined && Object.values(d.stock).some((s) => s.hidden && s.units > 0) !== c.hiding) return false;
  if (c.dealer !== undefined && (liveDealers(state).length > 0) !== c.dealer) return false;
  if (c.dealing !== undefined && (d.dealing !== null) !== c.dealing) return false;
  if (c.customers && !within(d.dealing?.customers ?? 0, c.customers)) return false;
  if (c.ops && !within(d.ops.length, c.ops)) return false;
  if (c.signs && !within(d.signs.count > 0 && state.currentYear - d.signs.last <= (content?.balance.drugs.overdose.signsFade ?? 4) ? d.signs.count : 0, c.signs)) return false;
  if (c.drug && !c.drug.some((id) => (d.habits[id]?.total ?? 0) > 0)) return false;
  if (c.hard !== undefined && usedDrugs(state).some((id) => (content?.drugs[id]?.severity ?? 0) >= 4) !== c.hard) return false;
  return true;
}
