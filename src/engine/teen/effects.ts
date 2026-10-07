/**
 * The `teen` event effect (T1): your standing, your place in your crowd,
 * joining, leaving and clashing, breaking a house rule (and what follows),
 * grounding, loosening and tightening rules, driving practice, the permit and
 * license, passion, a teen job, a team or club. The engine ignores whatever
 * doesn't fit (no crowd to leave, no rule of that kind, too young for the permit).
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import type { Id, LifeState } from '../types';
import { activityBlock, joinActivity, leaveActivity } from './activities';
import { crowdToJoin, endClash, joinClique, leaveClique, queueTeenEvent, rankOf, startClash } from './cliques';
import { hireJob, endTeenJob } from './jobs';
import { addLesson, grantStage, revokeLicense } from './license';
import { adjustRule, breakRule } from './rules';
import { householdParents, livingMembers, myClique, rivalClique } from './query';

type TeenEffect = Extract<Effect, { type: 'teen' }>;

export function applyTeenEffect(state: LifeState, effect: TeenEffect, _cast: Record<string, Id>, content: ContentBundle): void {
  const t = state.teen;
  switch (effect.action) {
    case 'standing':
      t.standing = clampInt(t.standing + effect.delta!, 0, 100);
      return;
    case 'rank': {
      for (const id of livingMembers(state, myClique(state))) {
        const rel = state.relationships[id]!;
        rel.affection = clampInt(rel.affection + effect.delta!, 0, 100);
      }
      if (t.member) t.member.rank = rankOf(state);
      return;
    }
    case 'join': {
      const crowd = crowdToJoin(state, content);
      // The event has had its say (a crowd that asked you in, or a check): no second roll.
      if (crowd) joinClique(state, crowd.id, content, false);
      return;
    }
    case 'leave':
      leaveClique(state, content);
      return;
    case 'clash': {
      const rival = rivalClique(state);
      if (rival) startClash(state, rival.id, content);
      return;
    }
    case 'settle':
      endClash(state, content);
      return;
    case 'break': {
      const result = breakRule(state, effect.rule!, content);
      if (result?.caught && result.parentId !== undefined) queueTeenEvent(state, 'caught', { parent: result.parentId }, content, 'next');
      return;
    }
    case 'ground':
      if (householdParents(state, content).length > 0) t.penalties.push({ kind: 'grounded', until: state.currentYear + (effect.years ?? 1) });
      return;
    case 'loosen':
      adjustRule(state, effect.rule!, -1, content);
      return;
    case 'tighten':
      adjustRule(state, effect.rule!, 1, content);
      return;
    case 'practice': {
      if (t.license.stage === 'licensed') return;
      if (t.license.stage === 'none') grantStage(state, 'permit', content);
      if (t.license.stage === 'permit') addLesson(state, content, false);
      return;
    }
    case 'license':
      if (effect.stage === 'revoke') revokeLicense(state);
      else grantStage(state, effect.stage!, content);
      return;
    case 'passion':
      t.passion = clampInt(t.passion + effect.delta!, 0, 100);
      return;
    case 'hire':
      hireJob(state, effect.jobId!, content);
      return;
    case 'quit':
      endTeenJob(state, content);
      return;
    case 'enroll':
      if (activityBlock(state, effect.activityId!, content) === null) joinActivity(state, effect.activityId!, content);
      return;
    case 'withdraw':
      leaveActivity(state, effect.activityId!, content);
      return;
  }
}
