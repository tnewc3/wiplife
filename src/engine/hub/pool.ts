/**
 * The audition pool (C2): who turns up when you look for a bandmate. The
 * quality of the pool depends on your fame, your city's size and your
 * reputation; elite players are rare early on and show up as you grow.
 * Numbers: balance/skills.yaml band.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { clampInt, rollNormal } from '../random';
import { chance, nextInt, type RngState } from '../rng';
import type { BandCandidate, Id, LifeState } from '../types';

/** Your fame across the paths you work (0 with none). */
export function bandFame(state: LifeState): number {
  return Object.values(state.fame.paths).reduce((best, p) => Math.max(best, p.fame), 0);
}

/** The skill of one person who turns up to an audition now. */
export function poolSkill(state: LifeState, content: ContentBundle, rng: RngState): number {
  const B = content.balance.skills.band;
  const fame = bandFame(state);
  const city = content.cities[state.character.cityId]?.jobMarket.professional ?? 50;
  const mean = B.mean.base + fame * B.mean.fame + city * B.mean.city + state.character.hidden.reputation * B.mean.reputation;
  const rolled = rollNormal(rng, { mean: Math.min(100, Math.max(0, mean)), sd: B.mean.sd });
  return clampInt(Math.round(Math.min(curveAt(B.cap, fame), rolled)), 0, 100);
}

/** How many people come to an audition now. */
export function poolSize(state: LifeState, content: ContentBundle): number {
  const B = content.balance.skills.band.pool;
  return Math.min(B.max, Math.max(1, Math.round(B.base + bandFame(state) * B.perFame)));
}

/** The people who come to an audition for a part. */
export function auditionPool(state: LifeState, part: Id, ages: { min: number; max: number }, content: ContentBundle, rng: RngState): BandCandidate[] {
  const B = content.balance.skills.band;
  const out: BandCandidate[] = [];
  for (let i = 0; i < poolSize(state, content); i++) {
    const skill = poolSkill(state, content, rng);
    const temper = chance(rng, B.temper.fiery) ? 'fiery' : chance(rng, B.temper.flaky / (1 - B.temper.fiery)) ? 'flaky' : 'steady';
    out.push({ part, skill, age: nextInt(rng, ages.min, ages.max), temper });
  }
  return out.sort((a, b) => b.skill - a.skill || a.age - b.age);
}
