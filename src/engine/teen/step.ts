/**
 * The teen step of the year pipeline (T1): runs after education, so the
 * grade points a focus, a crowd, a team or a job adds count toward the year
 * that has just begun. For ages 13 to 17: the juvenile case answered at home,
 * the rules at home (and what you break without meaning to), the crowds at your
 * school, your focus, your teams and clubs and your teen job. At the adult age
 * the teen job, teams and house rules end and the juvenile record is sealed.
 * In prison the step does only the record.
 */
import type { ContentBundle } from '../../content/schemas';
import { clampInt } from '../random';
import type { LifeState } from '../types';
import { runActivities } from './activities';
import { runCliques } from './cliques';
import { runFocus } from './focus';
import { endTeenJob, runJob } from './jobs';
import { runRules } from './rules';
import { runTrouble } from './trouble';

/** What ends when you are an adult. */
function growUp(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  if (t.job) endTeenJob(state, content);
  t.activities = [];
  t.home = null;
  t.penalties = [];
  delete t.caught;
  delete t.invite;
  delete t.clash;
  t.member = null;
  t.cliques = [];
  t.school = null;
  t.turnedAway = {};
  t.passion = clampInt(t.passion - content.balance.teen.passion.decay, 0, 100);
}

export function runTeen(state: LifeState, content: ContentBundle): void {
  const age = state.character.age;
  runTrouble(state, content);
  if (age >= content.balance.relationships.adultAge) {
    growUp(state, content);
    return;
  }
  if (age < content.balance.teen.ages.from || state.housing.kind === 'incarcerated') return;
  runRules(state, content);
  runCliques(state, content);
  runFocus(state, content);
  runActivities(state, content);
  runJob(state, content);
}
