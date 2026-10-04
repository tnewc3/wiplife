/**
 * Wealth levels for the people in your life (E1): how well off someone is,
 * from their occupation and family background. Family shares your family's
 * background; people you meet are rolled when they join your life. The
 * numbers are in balance/interactions.yaml wealth.
 */
import type { ContentBundle, RelationshipKindId } from '../../content/schemas';
import { isFamilyKind } from '../relationships';
import { weightedKey } from '../random';
import { chance, nextInt, pick, type RngState } from '../rng';
import type { FamilyWealth, Id, LifeState } from '../types';

export const WEALTH_LEVELS: readonly FamilyWealth[] = ['poor', 'working', 'middle', 'affluent', 'rich'];

/** The wealth level a job's pay points to (the first bracket the pay is under). */
export function wealthFromSalary(salary: number, content: ContentBundle): FamilyWealth {
  for (const bracket of content.balance.interactions.wealth.salaryBrackets) {
    if (bracket.upTo === undefined || salary < bracket.upTo) return bracket.level;
  }
  return 'rich';
}

/** Occupation and background blended by the occupation weight, rounded to a level. */
export function blendWealth(occupation: FamilyWealth, background: FamilyWealth, content: ContentBundle): FamilyWealth {
  const w = content.balance.interactions.wealth.occupationWeight;
  const index = Math.round(WEALTH_LEVELS.indexOf(occupation) * w + WEALTH_LEVELS.indexOf(background) * (1 - w));
  return WEALTH_LEVELS[Math.min(WEALTH_LEVELS.length - 1, Math.max(0, index))]!;
}

export interface RolledWealth {
  occupation?: Id;
  wealthLevel: FamilyWealth;
}

/**
 * Rolls a new person's occupation and wealth level, drawing from `rng`.
 * Family never needs a draw: they share your family's background. People you
 * meet have your background by chance, or one rolled from the usual odds;
 * working-age adults often have a job (your coworkers and boss work in your
 * own field), and the job's pay is blended with the background.
 */
export function rollWealth(state: LifeState, kind: RelationshipKindId, age: number, rng: RngState, content: ContentBundle): RolledWealth {
  const balance = content.balance.interactions.wealth;
  if (isFamilyKind(kind)) return { wealthLevel: state.character.familyWealth };

  const background: FamilyWealth = chance(rng, balance.peerChance)
    ? state.character.familyWealth
    : weightedKey(rng, content.balance.creation.familyWealth);

  const working = age >= content.balance.economy.independenceAge && age < content.balance.economy.retirement.age;
  const colleague = (kind === 'coworker' || kind === 'boss') && state.career.job !== null;
  if (!working || !(colleague || chance(rng, balance.employedShare))) return { wealthLevel: background };

  const jobIds = Object.keys(content.jobs)
    .sort()
    .filter((id) => !content.jobs[id]!.retired);
  const jobId = colleague ? state.career.job!.jobId : pick(rng, jobIds);
  const levels = content.jobs[jobId]?.levels ?? [];
  if (levels.length === 0) return { wealthLevel: background };
  // A boss sits in the upper levels of the track; anyone else is somewhere along it.
  const top = levels.length - 1;
  const level = levels[kind === 'boss' ? nextInt(rng, Math.floor(top / 2), top) : nextInt(rng, 0, top)]!;
  return { occupation: jobId, wealthLevel: blendWealth(wealthFromSalary(level.salary, content), background, content) };
}

/**
 * Your own wealth level (E2a: what your children grow up with): your pay last
 * year, as the usual brackets read it, blended with your family's background.
 */
export function yourWealth(state: LifeState, content: ContentBundle): FamilyWealth {
  const income = (state.finances.lastLedger?.gross ?? 0) + (state.finances.lastLedger?.retirement ?? 0);
  if (income <= 0) return state.character.familyWealth;
  return blendWealth(wealthFromSalary(income, content), state.character.familyWealth, content);
}
