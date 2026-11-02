import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { ROLE_IDS } from './load';

/** C2: the hub is in range, its skills are real and its marks agree with them. */
export function hubFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (m: string) => failures.push(`hub: ${m}`);
  const h = state.hub;
  const inRange = (v: number, max = 100) => Number.isFinite(v) && v >= 0 && v <= max;
  if (!inRange(h.burnout) || !inRange(h.load, 400) || !inRange(h.peakLoad, 400)) fail('burnout or load out of range');
  for (const [role, level] of Object.entries(h.commit)) {
    if (!(ROLE_IDS as readonly string[]).includes(role)) fail(`commitment for unknown role "${role}"`);
    if (level !== 'back' && level !== 'steady' && level !== 'all') fail(`commitment "${String(level)}" for ${role}`);
  }
  for (const [key, rec] of Object.entries(h.skills)) {
    if (key.startsWith('sport.')) {
      // A sport left behind (a young player's switch): its skills wait on the shelf.
      const [, sport, skill] = key.split('.');
      if (!content.famePaths[sport ?? '']?.sport || !content.famePaths[sport!]!.skills?.some((x) => x.id === skill)) fail(`shelved skill "${key}" is not a sport's`);
    } else if (!key.startsWith('hobby.') || !content.pastimes[key.slice(6)]?.hobby) fail(`skill "${key}" is not a hobby`);
    if (!inRange(rec.level) || !inRange(rec.peak) || rec.peak < rec.level || rec.last > state.currentYear) fail(`skill "${key}" has an impossible record`);
  }
  for (const [key, mark] of Object.entries(h.marks)) {
    if (!inRange(mark.peak) || mark.last > state.currentYear) fail(`mark "${key}" is impossible`);
  }
  for (const m of state.fame.band?.members ?? []) if (!inRange(m.skill)) fail(`bandmate ${m.id} has skill ${m.skill}`);
  const e = h.enhancers;
  if (e.on && state.sports.sport === null) fail('enhancers taken without a sport');
  if (e.positives > e.tests) fail('more positive tests than tests');
  if (h.pool && (h.pool.candidates.length === 0 || h.pool.candidates.some((c) => !inRange(c.skill)))) fail('the audition pool is wrong');
  for (const hobby of Object.keys(state.hobbies)) if (!h.skills[`hobby.${hobby}`]) fail(`hobby "${hobby}" has no skill`);
  return failures;
}
