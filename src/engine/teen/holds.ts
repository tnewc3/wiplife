/**
 * The `teen` condition (T1): your crowd, standing, focus, passion, license,
 * teen job, teams and clubs, and the rules at home. Every field given must hold.
 */
import type { Compare, TeenCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { cliqueById, focusOf, isGrounded, myClique, penaltyActive, ruleOf } from './query';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

export function teenHolds(c: TeenCondition, state: LifeState): boolean {
  const t = state.teen;
  const mine = myClique(state);
  if (c.clique !== undefined && (mine !== undefined) !== c.clique) return false;
  if (c.crowd !== undefined && !(mine !== undefined && c.crowd.includes(mine.defId))) return false;
  if (c.rival !== undefined && (mine?.rival !== undefined) !== c.rival) return false;
  if (c.clash !== undefined && (t.clash !== undefined) !== c.clash) return false;
  if (c.invited !== undefined && (cliqueById(state, t.invite) !== undefined) !== c.invited) return false;
  if (c.standing && !within(t.standing, c.standing)) return false;
  if (c.focus && !c.focus.includes(focusOf(state))) return false;
  if (c.passion && !within(t.passion, c.passion)) return false;
  if (c.license && !c.license.includes(t.license.stage)) return false;
  if (c.lessons && !within(t.license.lessons, c.lessons)) return false;
  if (c.job !== undefined) {
    if (typeof c.job === 'boolean') {
      if ((t.job !== null) !== c.job) return false;
    } else if (!(t.job !== null && c.job.includes(t.job.jobId))) return false;
  }
  if (c.activity !== undefined) {
    if (typeof c.activity === 'boolean') {
      if ((t.activities.length > 0) !== c.activity) return false;
    } else if (!t.activities.some((a) => (c.activity as string[]).includes(a.id))) return false;
  }
  if (c.rules && !within(t.home?.rules.length ?? 0, c.rules)) return false;
  if (c.rule) {
    const rule = ruleOf(state, c.rule.domain);
    if (!rule || (c.rule.level && !within(rule.level, c.rule.level))) return false;
  }
  if (c.caught !== undefined) {
    const caught = t.caught !== undefined && t.caught.year >= state.currentYear - 1;
    if (typeof c.caught === 'boolean') {
      if (caught !== c.caught) return false;
    } else if (!(caught && c.caught.includes(t.caught!.ruleId as (typeof c.caught)[number]))) return false;
  }
  if (c.grounded !== undefined && isGrounded(state) !== c.grounded) return false;
  if (c.restricted && !c.restricted.some((d) => penaltyActive(state, 'privilege', d))) return false;
  if (c.sealed !== undefined && (t.sealed === true) !== c.sealed) return false;
  return true;
}
