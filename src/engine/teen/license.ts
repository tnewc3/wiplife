/**
 * The driver's license (T1): a learner's permit, driving lessons and the test.
 * The license is what E5 vehicles need before you can buy or drive one.
 * Fees go through the finance module (a minor's family covers what savings
 * can't). Numbers: balance/teen.yaml (license).
 */
import type { ContentBundle } from '../../content/schemas';
import { isIndependent, spend, wholeDollars } from '../finance';
import { clampInt } from '../random';
import { chance } from '../rng';
import { costOfLiving } from '../possessions/query';
import type { LifeState } from '../types';
import { teenHistory } from './cliques';

/** What a fee costs you: its base, in your city, and more once you are grown. */
export function licenseFee(state: LifeState, base: number, content: ContentBundle): number {
  const adult = isIndependent(state, content) ? content.balance.teen.license.adultFeeMultiplier : 1;
  return wholeDollars(base * costOfLiving(state, content) * adult);
}

export type LicenseBlock = 'age' | 'have' | 'permit' | 'lessons' | 'wait' | 'away' | 'max';

const away = (state: LifeState) => state.housing.kind === 'incarcerated';

/** Why you can't get a learner's permit now, or null. */
export function permitBlock(state: LifeState, content: ContentBundle): LicenseBlock | null {
  const l = content.balance.teen.license;
  if (away(state)) return 'away';
  if (state.teen.license.stage !== 'none') return 'have';
  if (state.character.age < l.permitAge) return 'age';
  return null;
}

/** Why you can't take a driving lesson now, or null. */
export function lessonBlock(state: LifeState, content: ContentBundle): LicenseBlock | null {
  const l = content.balance.teen.license;
  if (away(state)) return 'away';
  if (state.teen.license.stage === 'licensed') return 'have';
  if (state.teen.license.stage === 'none') return 'permit';
  if (state.teen.license.lessons >= l.lessons.max) return 'max';
  return null;
}

/** Why you can't sit the license test now, or null. */
export function testBlock(state: LifeState, content: ContentBundle): LicenseBlock | null {
  const l = content.balance.teen.license;
  const t = state.teen.license;
  if (away(state)) return 'away';
  if (t.stage === 'licensed') return 'have';
  if (t.stage === 'none') return 'permit';
  if (state.character.age < l.licenseAge) return 'age';
  if (t.lessons < l.lessons.minToTest) return 'lessons';
  if (t.testYear === state.currentYear) return 'wait';
  return null;
}

/** The chance of passing the test now, in 0–1: your lessons, your age, earlier failures and how you are. */
export function testChance(state: LifeState, content: ContentBundle): number {
  const t = content.balance.teen.license.test;
  const lic = state.teen.license;
  let points = t.base + t.perLesson * lic.lessons - t.perFail * lic.fails;
  const p = state.character.personality;
  for (const [trait, weight] of Object.entries(t.traits)) points += (weight ?? 0) * (p[trait as keyof typeof p] - 50);
  return clampInt(points, t.min, t.max) / 100;
}

/** A learner's permit: the fee is paid. */
export function takePermit(state: LifeState, content: ContentBundle): void {
  spend(state, licenseFee(state, content.balance.teen.license.permitFee, content), content);
  state.teen.license = { ...state.teen.license, stage: 'permit', since: state.currentYear };
  teenHistory(state, 'permit', {}, content);
}

/** A driving lesson (or an hour of practice with someone who has a license): the fee is paid for a lesson, not for practice. */
export function addLesson(state: LifeState, content: ContentBundle, paid: boolean): void {
  const l = content.balance.teen.license;
  if (paid) spend(state, licenseFee(state, l.lessonFee, content), content);
  const lic = state.teen.license;
  lic.lessons = Math.min(l.lessons.max, lic.lessons + 1);
}

/** The test: the fee is paid, the roll is made, and you hold a license or a failure. Returns whether you passed. */
export function takeTest(state: LifeState, content: ContentBundle): boolean {
  spend(state, licenseFee(state, content.balance.teen.license.testFee, content), content);
  const lic = state.teen.license;
  lic.testYear = state.currentYear;
  if (chance(state.rng, testChance(state, content))) {
    state.teen.license = { ...lic, stage: 'licensed', since: state.currentYear };
    teenHistory(state, 'licensePassed', {}, content);
    return true;
  }
  lic.fails += 1;
  teenHistory(state, 'licenseFailed', {}, content);
  return false;
}

/** The license is taken away (a serious driving offense): you are back to a permit. */
export function revokeLicense(state: LifeState): void {
  if (state.teen.license.stage !== 'licensed') return;
  state.teen.license = { ...state.teen.license, stage: 'permit', testYear: state.currentYear };
}

/** The permit or license the event gives you (the `license` effect): never below the ages, never past what you have. */
export function grantStage(state: LifeState, stage: 'permit' | 'licensed', content: ContentBundle): void {
  const l = content.balance.teen.license;
  const lic = state.teen.license;
  if (stage === 'permit') {
    if (lic.stage === 'none' && state.character.age >= l.permitAge) {
      state.teen.license = { ...lic, stage: 'permit', since: state.currentYear };
      teenHistory(state, 'permit', {}, content);
    }
    return;
  }
  if (lic.stage !== 'licensed' && state.character.age >= l.licenseAge) {
    state.teen.license = { ...lic, stage: 'licensed', since: state.currentYear };
    teenHistory(state, 'licensePassed', {}, content);
  }
}
