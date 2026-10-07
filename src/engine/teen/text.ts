/**
 * Values teen events can use in their text (T1): {clique} (your crowd, or the
 * one that has noticed you, or the one you are at odds with), {rival} (the
 * crowd at odds with yours), {school}, {rule} (the rule you were caught
 * breaking), {activity} (a team or club you belong to) and {job} (your teen
 * job). The content build checks that an event using one requires what it
 * names (tools/content/teen.ts).
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { schoolNameOf } from './cliques';
import { cliqueById, cliqueName, myClique, rivalClique } from './query';

export const TEEN_TEXT_VALUES = ['clique', 'rival', 'school', 'rule', 'activity', 'job'] as const;

export function teenTextValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const t = state.teen;
  const mine = myClique(state);
  const named = mine ?? cliqueById(state, t.invite) ?? cliqueById(state, t.clash?.cliqueId);
  const rival = rivalClique(state, mine) ?? cliqueById(state, t.clash?.cliqueId);
  const activity = t.activities[0] && content.activities[t.activities[0].id];
  const job = t.job && content.teenJobs[t.job.jobId];
  return {
    clique: cliqueName(content, named),
    rival: cliqueName(content, rival),
    school: t.school ? schoolNameOf(state, content) : '',
    rule: t.caught ? (content.houseRules[t.caught.ruleId]?.name.toLowerCase() ?? '') : '',
    activity: activity ? activity.name : '',
    job: job ? job.name : '',
  };
}
