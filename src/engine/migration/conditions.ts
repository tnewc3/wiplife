/** The `migration` condition (W6): see MigrationCondition in src/content/schemas/events.ts. */
import type { ContentBundle, MigrationCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { isSettled, livingCountry, relativesAbroad, statusKind, yearsInCountry } from './query';
import { naturalizationBlock, permanentBlock, regularizationBlock, spouseCitizen } from './routes';

const inRange = (n: number, c: { gt?: number | undefined; gte?: number | undefined; lt?: number | undefined; lte?: number | undefined; eq?: number | undefined }): boolean =>
  (c.gt === undefined || n > c.gt) && (c.gte === undefined || n >= c.gte) && (c.lt === undefined || n < c.lt) && (c.lte === undefined || n <= c.lte) && (c.eq === undefined || n === c.eq);

export function migrationHolds(q: MigrationCondition, state: LifeState, content: ContentBundle | undefined): boolean {
  if (!content) return false;
  const m = state.migration;
  const r = state.travel.residence;
  const app = m.application;
  if (q.settled !== undefined && q.settled !== isSettled(state, content)) return false;
  if (q.status && !q.status.includes(statusKind(state, content))) return false;
  if (q.application && !q.application.includes(app ? app.status : 'none')) return false;
  if (q.kind && !(app && q.kind.includes(app.kind))) return false;
  if (q.route && !(app?.route && q.route.includes(app.route))) return false;
  if (q.via && !(r && q.via.includes(r.route))) return false;
  if (q.years) {
    const years = yearsInCountry(state);
    if (years === null || !inRange(years, q.years)) return false;
  }
  if (q.dual !== undefined && q.dual !== state.character.citizenships.length > 1) return false;
  if (q.remitting !== undefined && q.remitting !== (m.remit.level !== 'none')) return false;
  if (q.relatives !== undefined && q.relatives !== relativesAbroad(state, content).length > 0) return false;
  if (q.removed !== undefined && q.removed !== (Object.keys(m.removed).length > 0)) return false;
  if (q.closeCall !== undefined && q.closeCall !== (m.year.year === state.currentYear && m.year.closeCall)) return false;
  if (q.expiring !== undefined && q.expiring !== (!!r?.settled && (r.type === 'student' || r.type === 'temporary_worker') && r.endYear <= state.currentYear)) return false;
  if (q.ruleChange !== undefined && q.ruleChange !== (m.ruleChangeUntil !== null && m.ruleChangeUntil >= state.currentYear)) return false;
  if (q.testFails && !inRange(m.testFails, q.testFails)) return false;
  if (q.eligible) {
    const can = (k: 'permanent' | 'naturalization' | 'regularization'): boolean =>
      k === 'permanent' ? permanentBlock(state, content) === null
        : k === 'naturalization' ? naturalizationBlock(state, content) === null
          : (['marriage', 'long_residence', 'rule_change'] as const).some((b) => regularizationBlock(state, b, content) === null);
    if (!q.eligible.some(can)) return false;
  }
  if (q.spouse !== undefined && q.spouse !== spouseCitizen(state, livingCountry(state, content), content)) return false;
  if (q.arrivedNow !== undefined && q.arrivedNow !== (m.arrivedYear === state.currentYear)) return false;
  if (q.removedNow !== undefined && q.removedNow !== Object.values(m.removed).includes(state.currentYear)) return false;
  if (q.childCitizen !== undefined) {
    const here = livingCountry(state, content);
    const has = !state.character.citizenships.includes(here) && Object.values(state.relationships).some((r) => r.kind === 'child' && r.status === 'active' && !!state.people[r.personId]?.alive && state.people[r.personId]!.citizenships.includes(here));
    if (q.childCitizen !== has) return false;
  }
  return true;
}
