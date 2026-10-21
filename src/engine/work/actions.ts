/**
 * Things you can do at work (Batch 3): work harder, slack off, spend time with
 * your coworkers, go to the office party, report a coworker. Each moves your
 * job performance and stress now, and the stance (harder or slack) is added to
 * the aim of the next yearly review (../career.ts performanceAim), so it is
 * not forgotten at once. Socializing and the party change how your coworkers
 * and your boss feel about you (and, through the web step, who becomes friends
 * or rivals with whom). Numbers: balance/careers.yaml (workActions).
 */
import type { ContentBundle } from '../../content/schemas';
import { currentBoss, currentCoworkers } from '../career';
import { bumpStat } from '../school/query';
import { clampInt } from '../random';
import { chance, nextInt } from '../rng';
import { emptyWorkYear } from '../school/state';
import type { Id, LifeState, WorkYearActions } from '../types';

export type WorkActionBlock = 'job' | 'away' | 'done' | 'stance' | 'people' | 'limit' | 'unknown';

/** What you did at work this year (empty when it isn't this year's record). */
export function workThisYear(state: LifeState): WorkYearActions {
  const w = state.career.work;
  return w.year === state.currentYear ? w : emptyWorkYear(state.currentYear);
}

/** The record to change: this year's, started fresh when it is last year's. */
function record(state: LifeState): WorkYearActions {
  if (state.career.work.year !== state.currentYear) state.career.work = emptyWorkYear(state.currentYear);
  return state.career.work;
}

/** How your stance last year moves this year's review aim (read by performanceAim, when the new year has begun). */
export function workEffortAim(state: LifeState, content: ContentBundle): number {
  const w = state.career.work;
  if (w.year !== state.currentYear - 1) return 0;
  const a = content.balance.careers.workActions;
  return w.effort === 'hard' ? a.hard.aim : w.effort === 'slack' ? a.slack.aim : 0;
}

export function workActionBlock(
  state: LifeState,
  action: 'hard' | 'slack' | 'socialize' | 'party' | 'report',
  content: ContentBundle,
  coworkerId?: Id,
): WorkActionBlock | null {
  if (!state.career.job) return 'job';
  if (state.housing.kind === 'incarcerated') return 'away';
  const w = workThisYear(state);
  const a = content.balance.careers.workActions;
  switch (action) {
    case 'hard':
      return w.effort === null ? null : w.effort === 'hard' ? 'done' : 'stance';
    case 'slack':
      return w.effort === null ? null : w.effort === 'slack' ? 'done' : 'stance';
    case 'socialize':
      if (currentCoworkers(state).length === 0) return 'people';
      return w.socialized >= a.socialize.maxPerYear ? 'limit' : null;
    case 'party':
      if (currentCoworkers(state).length === 0 && currentBoss(state) === null) return 'people';
      return w.party ? 'done' : null;
    case 'report':
      if (coworkerId === undefined || !currentCoworkers(state).includes(coworkerId)) return 'unknown';
      if (currentBoss(state) === null) return 'people';
      return w.reported >= a.report.maxPerYear ? 'limit' : null;
  }
}

function addPerformance(state: LifeState, delta: number): void {
  const job = state.career.job!;
  job.performance = clampInt(job.performance + delta, 0, 100);
}

function warm(state: LifeState, id: Id, affection: number, trust = 0): void {
  const rel = state.relationships[id];
  if (!rel) return;
  rel.affection = clampInt(rel.affection + affection, 0, 100);
  rel.trust = clampInt(rel.trust + trust, 0, 100);
}

export function workHarder(state: LifeState, content: ContentBundle): void {
  const a = content.balance.careers.workActions.hard;
  record(state).effort = 'hard';
  addPerformance(state, a.performance);
  bumpStat(state, 'stress', a.stress);
}

export function slackAtWork(state: LifeState, content: ContentBundle): void {
  const a = content.balance.careers.workActions.slack;
  record(state).effort = 'slack';
  addPerformance(state, a.performance);
  bumpStat(state, 'stress', a.stress);
  bumpStat(state, 'happiness', a.happiness);
}

/** Time with a few of your coworkers (the ones you are least close to first, so it widens the circle). */
export function socializeAtWork(state: LifeState, content: ContentBundle): void {
  const a = content.balance.careers.workActions.socialize;
  record(state).socialized += 1;
  const people = [...currentCoworkers(state)].sort((x, y) => state.relationships[x]!.affection - state.relationships[y]!.affection || (x < y ? -1 : 1)).slice(0, a.people);
  for (const id of people) {
    warm(state, id, a.affection);
    state.relationships[id]!.memories.push({ tag: 'got_to_know_at_work', year: state.currentYear });
  }
  addPerformance(state, a.performance);
  bumpStat(state, 'stress', a.stress);
  bumpStat(state, 'happiness', a.happiness);
}

/** How likely the party is to go well for you: your sociability and confidence help, a taste for risk does not. */
export function partyGoodChance(state: LifeState, content: ContentBundle): number {
  const g = content.balance.careers.workActions.party.good;
  const p = state.character.personality;
  return Math.min(g.max, Math.max(g.min, g.base + g.sociability * (p.sociability - 50) + g.confidence * (p.confidence - 50) - g.riskTaking * (p.riskTaking - 50)));
}

export type PartyOutcome = 'great' | 'fine' | 'bad';

export function officeParty(state: LifeState, content: ContentBundle): PartyOutcome {
  const a = content.balance.careers.workActions.party;
  record(state).party = true;
  const roll = chance(state.rng, partyGoodChance(state, content)) ? 'great' : chance(state.rng, a.badShare) ? 'bad' : 'fine';
  const boss = currentBoss(state);
  const coworkers = currentCoworkers(state);
  if (roll === 'great') {
    bumpStat(state, 'happiness', a.great.happiness);
    addPerformance(state, a.great.performance);
    if (boss !== null) warm(state, boss, a.great.bossAffection);
    for (const id of coworkers.slice(0, 3)) warm(state, id, a.great.coworkerAffection);
  } else if (roll === 'bad') {
    bumpStat(state, 'stress', a.bad.stress);
    addPerformance(state, a.bad.performance);
    if (boss !== null) warm(state, boss, a.bad.bossAffection);
    if (coworkers.length > 0) {
      const one = coworkers[nextInt(state.rng, 0, coworkers.length - 1)]!;
      warm(state, one, a.bad.coworkerAffection);
      state.relationships[one]!.memories.push({ tag: 'saw_you_at_the_party', year: state.currentYear });
    }
  }
  return roll;
}

/** You report a coworker to the boss: they cool toward you a lot, the boss warms a little, the others are wary. */
export function reportCoworker(state: LifeState, coworkerId: Id, content: ContentBundle): void {
  const a = content.balance.careers.workActions.report;
  record(state).reported += 1;
  warm(state, coworkerId, a.coworkerAffection, a.coworkerTrust);
  state.relationships[coworkerId]!.memories.push({ tag: 'reported_you', year: state.currentYear });
  const boss = currentBoss(state);
  if (boss !== null) warm(state, boss, a.bossAffection, a.bossTrust);
  for (const id of currentCoworkers(state)) if (id !== coworkerId) warm(state, id, a.othersAffection);
  addPerformance(state, a.performance);
  bumpStat(state, 'stress', a.stress);
}
