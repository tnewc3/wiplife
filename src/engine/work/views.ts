/**
 * What the Work tab's job card shows about the people you work with (Batch 3):
 * your boss, your coworkers (each opens the interaction menu), who among them
 * are friends or at odds with each other (the web's ties), the workplace's
 * size and what you can do at work this year.
 */
import type { ContentBundle } from '../../content/schemas';
import { currentBoss, currentCoworkers, workplaceSize } from '../career';
import { getTie, tieStatus } from '../web/query';
import type { Id, LifeState } from '../types';
import { workActionBlock, workThisYear, type WorkActionBlock } from './actions';

export interface WorkPersonLine {
  id: Id;
  name: string;
  age: number;
  affection: number;
  /** Coworkers they are friends with, and coworkers they are at odds with (strained or feuding), by first name. */
  friends: string[];
  rivals: string[];
}

export interface WorkLifeView {
  boss: WorkPersonLine | null;
  coworkers: WorkPersonLine[];
  /** How many coworkers a workplace like yours has at most. */
  maxCoworkers: number;
  effort: 'hard' | 'slack' | null;
  socialized: number;
  party: boolean;
  reported: number;
  blocks: Record<'hard' | 'slack' | 'socialize' | 'party', WorkActionBlock | null>;
  /** Reporting a coworker is blocked as a whole (no boss to tell, or already this year); a coworker is picked when you do it. */
  reportBlock: WorkActionBlock | null;
}

function line(state: LifeState, id: Id, others: readonly Id[], content: ContentBundle): WorkPersonLine {
  const p = state.people[id]!;
  const friends: string[] = [];
  const rivals: string[] = [];
  for (const other of others) {
    if (other === id) continue;
    const tie = getTie(state.web, id, other);
    if (!tie) continue;
    const status = tieStatus(tie, content);
    const name = state.people[other]!.name.first;
    if (status === 'feuding' || status === 'strained') rivals.push(name);
    else friends.push(name);
  }
  return { id, name: `${p.name.first} ${p.name.last}`, age: state.currentYear - p.birthYear, affection: state.relationships[id]!.affection, friends, rivals };
}

/** The boss and coworkers of your job, with the work actions you can take. Null without a job. */
export function getWorkLifeView(state: LifeState, content: ContentBundle): WorkLifeView | null {
  if (!state.career.job) return null;
  const between = state.phase === 'yearStart';
  const coworkers = currentCoworkers(state);
  const bossId = currentBoss(state);
  const w = workThisYear(state);
  const block = (a: 'hard' | 'slack' | 'socialize' | 'party') => (between ? workActionBlock(state, a, content) : ('job' as const));
  return {
    boss: bossId !== null ? line(state, bossId, coworkers, content) : null,
    coworkers: coworkers.map((id) => line(state, id, coworkers, content)),
    maxCoworkers: workplaceSize(state, content).max,
    effort: w.effort,
    socialized: w.socialized,
    party: w.party,
    reported: w.reported,
    blocks: { hard: block('hard'), slack: block('slack'), socialize: block('socialize'), party: block('party') },
    reportBlock: between ? (coworkers.length === 0 ? 'people' : workActionBlock(state, 'report', content, coworkers[0])) : 'job',
  };
}
