import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { isAdult } from './query';

/** D1: the drugs state is in range, minors never hold, deal or make, and the addiction condition agrees with the habits. */
export function drugsFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (m: string) => failures.push(`drugs: ${m}`);
  const d = state.drugs;
  const inRange = (v: number, max = 100) => Number.isFinite(v) && v >= 0 && v <= max;
  const adult = isAdult(state, content);
  for (const [id, s] of Object.entries(d.stock)) {
    if (!content.drugs[id]) fail(`stock of unknown drug "${id}"`);
    if (!Number.isInteger(s.units) || s.units <= 0 || s.units > content.balance.drugs.buy.cap + 1000) fail(`stock of ${id} is ${s.units}`);
    if (!inRange(s.quality)) fail(`stock of ${id} has quality ${s.quality}`);
    if (!adult && s.units > 0) fail(`a minor holds ${id}`);
  }
  for (const [id, h] of Object.entries(d.habits)) {
    if (!content.drugs[id]) fail(`habit for unknown drug "${id}"`);
    if (!inRange(h.dependence) || !inRange(h.tolerance) || !inRange(h.peak) || h.peak < h.dependence - 0.5) fail(`habit ${id} is out of range`);
    if (h.uses < 0 || h.total < h.uses || h.last > state.currentYear || h.clean < 0 || h.relapses < 0) fail(`habit ${id} has an impossible record`);
    if (state.character.age < content.balance.drugs.ages.use && h.total > 0) fail(`habit ${id} began under ${content.balance.drugs.ages.use}`);
  }
  for (const id of d.dealers) if (!state.people[id]) fail(`dealer ${id} is not a person`);
  if (d.dealers.some((id) => state.people[id] && !state.people[id]!.tags.includes('dealer'))) fail('a dealer is not tagged');
  if (d.dealing) {
    if (!adult) fail('a minor is dealing');
    if (!content.drugs[d.dealing.drugId]) fail('dealing an unknown drug');
    if (!inRange(d.dealing.standing) || d.dealing.customers < 0 || d.dealing.customers > content.balance.drugs.dealing.customers.max) fail('dealing is out of range');
  }
  if (d.ops.length > content.balance.drugs.production.max) fail('too many operations');
  for (const op of d.ops) {
    if (!adult) fail('a minor runs an operation');
    if (!content.operations[op.defId] || !content.drugs[op.drugId]) fail(`operation ${op.id} is not real`);
    if (!inRange(op.quality) || op.assets < 0) fail(`operation ${op.id} is out of range`);
  }
  if (d.signs.count < 0 || d.signs.last > state.currentYear) fail('warning signs are impossible');
  // An overdose death needs a warning sign.
  if (state.death?.causeId === 'overdose' && d.totals.overdoseDeaths > 0 && d.signs.count === 0) fail('an overdose death with no warning sign');
  const t = d.totals;
  if (Object.values(t).some((v) => !Number.isFinite(v) || v < 0)) fail('totals are impossible');
  return failures;
}
