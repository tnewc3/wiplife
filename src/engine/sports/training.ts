/**
 * Training sessions (Batch 5): the grind. A session is an action with a yearly budget (Batch 4's practice system: sessions by
 * commitment, a few more with a club team alongside), raising one of the sport's skills (shooting, handling, defense and
 * strength for basketball; each sport's skills are in src/content/fame). Where it happens matters:
 *
 * - with your team: its coaches and facilities, full value (more with a stronger team), no charge;
 * - at a gym: works without a team at a lower gain, with a membership paid once a year;
 * - with a private coach: a better gain, paid for each session.
 *
 * Costs go through finance and scale to where you live; a child's family pays what the child can't. Training never causes an
 * injury (B1): nothing here touches your health, and the injury roll reads only games played, playoffs and playing through pain.
 * Numbers: balance/sports.yaml training, balance/fame.yaml practice.
 */
import type { ContentBundle, TrainingMode } from '../../content/schemas';
import { practiceBlock, practiceBudget, practiceGain, practise, type PracticeBlock, grindView } from '../fame/grind';
import { scaledAmount } from '../country';
import { isIndependent, spend } from '../finance';
import type { Id, LifeState, SportsTraining } from '../types';
import { inSports, mySport } from './query';

export type TrainBlock = PracticeBlock | 'team' | 'money';

/** This year's training record (fresh if the one on record is from another year). Writes. */
export function trainingNow(state: LifeState): SportsTraining {
  if (state.sports.training.year !== state.currentYear) state.sports.training = { year: state.currentYear, team: 0, gym: 0, coach: 0, member: false, spent: 0 };
  return state.sports.training;
}

/** This year's training as it reads. */
export function trainingView(state: LifeState): SportsTraining {
  return state.sports.training.year === state.currentYear ? state.sports.training : { year: state.currentYear, team: 0, gym: 0, coach: 0, member: false, spent: 0 };
}

/** You have a team to train with (an amateur team, or a pro team with a deal). */
export function hasTeam(state: LifeState): boolean {
  const s = state.sports;
  return s.team !== null && !s.teamless && (!s.pro || s.contract !== null);
}

/** What one session costs you now, where you live (a gym membership is charged with the first session of the year there). */
export function trainCost(state: LifeState, mode: TrainingMode, content: ContentBundle): number {
  const T = content.balance.sports.training;
  if (mode === 'gym') return trainingView(state).member ? 0 : scaledAmount(state, T.gym.fee, content);
  if (mode === 'coach') return scaledAmount(state, T.coach.fee, content);
  return 0;
}

/** How much of a session's value the place gives. */
export function trainMultiplier(state: LifeState, mode: TrainingMode, content: ContentBundle): number {
  const T = content.balance.sports.training;
  if (mode === 'team') return Math.max(0, T.team.gain + T.team.quality * ((state.sports.team?.quality ?? 50) - 50));
  return mode === 'gym' ? T.gym.gain : T.coach.gain;
}

/** Why you can't train this skill this way now, or null. */
export function trainBlock(state: LifeState, skillId: Id, mode: TrainingMode, content: ContentBundle): TrainBlock | null {
  const def = inSports(state, content) ? mySport(state, content) : undefined;
  if (!def) return 'inactive';
  const block = practiceBlock(state, def.id, skillId, content);
  if (block !== null) return block;
  if (mode === 'team' && !hasTeam(state)) return 'team';
  // Without a family to pay for it, you cannot afford what you can't pay.
  if (isIndependent(state, content) && trainCost(state, mode, content) > state.finances.savings) return 'money';
  return null;
}

/** What one more session would add now. Reads only. */
export function trainGain(state: LifeState, skillId: Id, mode: TrainingMode, content: ContentBundle): number {
  const def = mySport(state, content);
  return def ? practiceGain(state, def.id, skillId, content, trainMultiplier(state, mode, content)) : 0;
}

/** Sessions left this year. */
export function sessionsLeft(state: LifeState, content: ContentBundle): number {
  return Math.max(0, practiceBudget(state, content) - grindView(state).practice);
}

/**
 * One training session: pays, then raises the skill (less each time it is trained, less at a gym). Returns the points gained
 * (0 when it can't be done). Never touches your health.
 */
export function train(state: LifeState, skillId: Id, mode: TrainingMode, content: ContentBundle): number {
  if (trainBlock(state, skillId, mode, content) !== null) return 0;
  const def = mySport(state, content)!;
  const cost = trainCost(state, mode, content);
  const gain = practise(state, def.id, skillId, content, trainMultiplier(state, mode, content), content.balance.sports.training.craft);
  const t = trainingNow(state);
  if (cost > 0) spend(state, cost, content);
  t.spent += cost;
  if (mode === 'gym') t.member = true;
  t[mode] += 1;
  const totals = state.sports.totals;
  if (mode === 'team') totals.trainedTeam += 1;
  else if (mode === 'gym') totals.trainedGym += 1;
  else totals.trainedCoach += 1;
  return gain;
}
