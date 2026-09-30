/**
 * Plays a life without a player: every pending event gets a random visible
 * choice from a generator of its own (so the life's own random sequence is
 * the same as with a real player making those choices). Used by the
 * simulation runner (tools/simulate.ts) and by tests.
 */
import type { ContentBundle } from '../content/schemas';
import { beginYear, endYear, resolveChoice } from './life';
import { createRng, pick, type RngState } from './rng';
import { firstUnresolvedEvent, getEventCard } from './selectors';
import type { LifeState } from './types';

export interface AutoplayOptions {
  /** Picks the choices; defaults to a generator seeded from the life's seed. */
  choices?: RngState;
  /** Called after every engine step. */
  onStep?: (life: LifeState) => void;
}

/** Resolves every pending event with random visible choices. */
export function resolveAll(life: LifeState, content: ContentBundle, choices: RngState, onStep?: (life: LifeState) => void): LifeState {
  let current = life;
  while (current.phase === 'events') {
    const index = firstUnresolvedEvent(current)!;
    const card = getEventCard(current, index, content)!;
    current = resolveChoice(current, card.instanceId, pick(choices, card.choices).id, content);
    onStep?.(current);
  }
  return current;
}

/** Plays one year: begin, resolve every event, end. */
export function playYear(life: LifeState, content: ContentBundle, options: AutoplayOptions = {}): LifeState {
  const choices = options.choices ?? createRng(`${life.seed}:choices`);
  let current = beginYear(life, content);
  options.onStep?.(current);
  current = resolveAll(current, content, choices, options.onStep);
  current = endYear(current, content);
  options.onStep?.(current);
  return current;
}

/** Plays a life year by year until it ends. */
export function playLife(life: LifeState, content: ContentBundle, options: AutoplayOptions = {}): LifeState {
  const choices = options.choices ?? createRng(`${life.seed}:choices`);
  let current = life;
  while (current.phase !== 'dead') current = playYear(current, content, { ...options, choices });
  return current;
}
