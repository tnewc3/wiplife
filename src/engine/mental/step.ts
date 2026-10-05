/**
 * Mental health (year pipeline step 7, M1, docs/expansion.md): runs right
 * after the health step, which already ran each mental health condition's
 * course, stat pulls, care costs and onset (the rules live in ./course.ts
 * and ../health.ts). This step is about the people: close people notice you
 * struggling and take it each their own way (./notice.ts), and being leaned
 * on, or living with someone who struggles, wears on them (./care.ts).
 */
import type { ContentBundle } from '../../content/schemas';
import { strainSupporters } from './care';
import { runNotice, struggling } from './notice';
import type { LifeState } from '../types';

export function runMental(state: LifeState, content: ContentBundle): void {
  runNotice(state, content);
  strainSupporters(state, struggling(state, content), content);
}
