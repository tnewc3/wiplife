/**
 * A saved life for the Career hub tests (C2): a 15-year-old in school who plays basketball, with a band beside it, built with the
 * engine on the test content pack.
 */
import { produce } from 'immer';
import { crossOver } from '../../src/engine/fame/ladder';
import { formBand } from '../../src/engine/fame/band';
import { createRng } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import { sportsLife } from './sportsFixtures';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ContentBundle } from '../../src/content/schemas';

const pack = (): ContentBundle => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

export function careerLife(seed: string, withBand = true): LifeState {
  const life = sportsLife({ seed, age: 15 });
  const realContent = pack();
  return produce(life, (d) => {
    d.education.current = { program: 'high', year: 2, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 1 };
    if (!withBand) return;
    crossOver(d as LifeState, 'music', realContent);
    formBand(d as LifeState, 'The Night Shift', 'guitar', realContent, createRng(`${seed}:band`));
    d.fame.band!.members.forEach((m, i) => (m.skill = i === 0 ? 20 : 60));
  });
}
