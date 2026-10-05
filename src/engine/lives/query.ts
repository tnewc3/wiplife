/**
 * Conditions about a person's own life (E3): the `life` part of a role
 * condition. Kept free of other engine imports so the condition evaluator can
 * use it.
 */
import type { Compare, LifeCondition } from '../../content/schemas';
import type { Person } from '../types';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

/** True when every field given holds for this person's life (`serious` is the severity that counts as serious). */
export function lifeHolds(q: LifeCondition, person: Person, year: number, serious: number): boolean {
  const life = person.life;
  if (!life) return false;
  if (q.tier && !q.tier.includes(life.tier)) return false;
  if (q.employed !== undefined && (person.occupation !== undefined) !== q.employed) return false;
  if (q.partner && !q.partner.includes(life.partner?.status ?? 'none')) return false;
  if (q.ended && !(life.ended !== undefined && year - life.ended.year <= 1 && q.ended.includes(life.ended.how))) return false;
  if (q.children && !within(life.children.length, q.children)) return false;
  if (q.trouble && !life.troubles.some((t) => q.trouble!.includes(t.kind))) return false;
  if (q.serious !== undefined && life.troubles.some((t) => t.kind !== 'crime' && t.severity >= serious) !== q.serious) return false;
  if (q.crime && !life.troubles.some((t) => t.kind === 'crime' && t.stage !== undefined && q.crime!.includes(t.stage))) return false;
  if (q.care && !q.care.includes(life.care ?? 'none')) return false;
  if (q.wealth && !q.wealth.includes(person.wealthLevel)) return false;
  if (q.recovered !== undefined && !life.recovered.some((r) => year - r.year <= q.recovered!)) return false;
  return true;
}
