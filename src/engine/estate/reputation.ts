/**
 * Family reputation (E2b): what a family is known for, 0–100 with 50
 * unremarkable. It sits on the family line (`lineage.reputation`) and passes
 * to each heir. When a life ends the line's reputation moves part of the way
 * back to 50 and then takes what that life added: its own reputation, a
 * criminal record, wealth left behind, generosity in the will, and notable
 * deeds proven by flags. The deeds the family is known for are kept with it
 * (newest last). All numbers: balance/family.yaml heir.reputation.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { netWorth } from '../finance';
import { clampInt } from '../random';
import type { LifeState, Settlement } from '../types';

function isSet(value: number | boolean | string | undefined): boolean {
  return value !== undefined && value !== false && value !== 0 && value !== '';
}

/** What the line's reputation and deeds become when this life ends. */
export function lineageAfter(life: LifeState, settlement: Settlement, content: ContentBundle): { reputation: number; deeds: string[] } {
  const r = content.balance.family.heir.reputation;
  const old = life.lineage;
  let points = (life.character.hidden.reputation - 50) * r.personal;
  const deeds: string[] = [];

  const record = life.legal.record;
  for (const entry of record) points += r.record[entry.outcome];
  const convictions = record.filter((e) => e.outcome === 'probation' || e.outcome === 'jail').length;
  if (convictions >= r.deedConvictions) deeds.push('conviction');

  const worth = netWorth(life);
  points += curveAt(r.wealth, Math.max(0, worth));
  if (worth >= r.deedWealth) deeds.push('wealth');

  const toCauses = settlement.lines.filter((l) => l.kind === 'cause').reduce((sum, l) => sum + l.percent, 0);
  points += Math.min(r.generosity.max, toCauses * r.generosity.perPercent);
  if (toCauses >= r.generosity.deedAt) deeds.push('generous');

  for (const flag of Object.keys(r.flags).sort()) {
    if (!isSet(life.flags[flag])) continue;
    points += r.flags[flag]!.delta;
    deeds.push(r.flags[flag]!.deed);
  }

  const reputation = clampInt(Math.round(50 + (old.reputation - 50) * r.retention + points), 0, 100);
  // Older deeds stay until newer ones push them out.
  const kept = old.deeds.filter((d) => !deeds.includes(d));
  const all = [...kept, ...[...new Set(deeds)]];
  return { reputation, deeds: all.slice(Math.max(0, all.length - r.maxDeeds)) };
}
