/**
 * The crime effects events can have (E6a): joining, leaving and moving up or
 * down in a crew, heat, standing, rivalry, a job done, an investigation, and
 * dirty money. The engine ignores what doesn't fit (a join under 18 or
 * while in a crew, a promotion with no crew), and never what would break a
 * rule: no one under 18 is ever in a crew.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { demote, joinCrew, leaveCrew, promote, removeMember } from './crew';
import { addDirty, addHeat, closeInvestigation, dirtyCost, jobPayout, loseDirty, openInvestigation, takeDirty } from './money';

type CrimeEffect = Extract<Effect, { type: 'crime' }>;
type DirtyEffect = Extract<Effect, { type: 'dirtyMoney' }>;

export function applyCrimeEffect(state: LifeState, effect: CrimeEffect, cast: Record<string, Id>, content: ContentBundle): void {
  const crime = state.crime;
  const b = content.balance.crime;
  const role = effect.role === undefined ? undefined : cast[effect.role];
  switch (effect.action) {
    case 'join':
      joinCrew(state, content, role);
      return;
    case 'leave':
      leaveCrew(state, effect.how ?? 'left', content);
      return;
    case 'heat':
      addHeat(state, effect.delta!);
      return;
    case 'standing':
      if (crime.crew) crime.standing = clampInt(crime.standing + effect.delta!, 0, 100);
      return;
    case 'rivalry':
      if (crime.crew?.rival) crime.rivalry = clampInt(crime.rivalry + effect.delta!, 0, 100);
      return;
    case 'promote':
      promote(state, content);
      return;
    case 'demote':
      demote(state, content);
      return;
    case 'job': {
      if (!crime.crew) return;
      const size = b.jobs.sizes[effect.size!];
      if (crime.jobs.year !== state.currentYear) crime.jobs = { year: state.currentYear, count: 0, last: crime.jobs.year === state.currentYear - 1 ? crime.jobs.count : 0 };
      crime.jobs.count += 1;
      crime.totals.jobs += 1;
      addHeat(state, size.heat);
      crime.standing = clampInt(crime.standing + size.standing, 0, 100);
      if (crime.crew.rival) crime.rivalry = clampInt(crime.rivalry + b.rivalry.perJob, 0, 100);
      return;
    }
    case 'investigate':
      openInvestigation(state, content);
      return;
    case 'close':
      closeInvestigation(state, content);
      return;
    case 'remove':
      if (role !== undefined) removeMember(state, role);
      return;
  }
}

export function applyDirtyMoneyEffect(state: LifeState, effect: DirtyEffect, rng: RngState, content: ContentBundle): void {
  if (effect.gain !== undefined) {
    // (A job outside a crew pays as a first-rank job would.)
    addDirty(state, jobPayout(state, effect.gain, content, rng));
  } else if (effect.pay !== undefined) {
    takeDirty(state, dirtyCost(state, effect.pay, content));
  } else if (effect.lose !== undefined) {
    loseDirty(state, Math.ceil(state.finances.dirty * effect.lose));
  }
}
