/**
 * The funeral of a life that ended (W1): who speaks and what they say
 * (build.ts), and who stayed away or could not come (attendance.ts). Pure
 * and deterministic: the same life always has the same funeral, from
 * generators of their own, so writing it never changes the life.
 */
import type { ContentBundle } from '../../content/schemas';
import { createRng } from '../rng';
import type { Funeral, LifeState } from '../types';
import { getAttendance } from './attendance';
import { buildEulogy } from './build';
import { chooseSpeaker } from './speaker';

/** The funeral for a life that has died; null for a life that is still going or was set aside unfinished. */
export function writeFuneral(life: LifeState, content: ContentBundle): Funeral | null {
  if (life.phase !== 'dead') return null;
  const speaker = chooseSpeaker(life, content);
  const eulogy = speaker ? buildEulogy(life, content, speaker, createRng(`${life.seed}:eulogy:${life.currentYear}`)) : null;
  const attendance = getAttendance(life, content, speaker?.personId, createRng(`${life.seed}:funeral:${life.currentYear}`));
  return { eulogy, ...attendance };
}
