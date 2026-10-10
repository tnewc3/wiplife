/**
 * The later-life step of the year pipeline (L1). It runs after the people you
 * know have had their year (E3), so a baby born to one of your children is a
 * grandchild the same year. In order: grandchildren (born, looked after, in
 * need of a home), care near the end, a warning of a death coming, and a
 * chance to make amends. Each queues the event that tells the story
 * (registries/later.yaml); the choices are the player's.
 */
import type { ContentBundle } from '../../content/schemas';
import { runAmends } from './amends';
import { runCare } from './care';
import { runGrandchildren } from './grandchildren';
import { runTerminal } from './terminal';
import type { LifeState } from '../types';

export function runLater(state: LifeState, content: ContentBundle): void {
  runGrandchildren(state, content);
  runCare(state, content);
  runTerminal(state, content);
  runAmends(state, content);
}
