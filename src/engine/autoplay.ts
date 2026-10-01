/**
 * Plays a life without a player: every pending event gets a random visible
 * choice from a generator of its own (so the life's own random sequence is
 * the same as with a real player making those choices). Used by the
 * simulation runner (tools/simulate.ts) and by tests.
 */
import type { ActionId, ContentBundle } from '../content/schemas';
import { finishAction, performAction } from './actions';
import { beginYear, endYear, resolveChoice } from './life';
import { createRng, pick, type RngState } from './rng';
import { firstUnresolvedEvent, getEventCard, type EventCardView } from './selectors';
import type { LifeState } from './types';

export interface AutoplayOptions {
  /** Picks the choices; defaults to a generator seeded from the life's seed. */
  choices?: RngState;
  /** Called after every engine step. */
  onStep?: (life: LifeState) => void;
}

/**
 * Picks one of a card's visible choices: the simulation's player models pass
 * their own (Stage 9); the default is a random visible choice.
 */
export type ChoicePicker = (life: LifeState, card: EventCardView, rng: RngState) => string;

const randomChoice: ChoicePicker = (_life, card, rng) => pick(rng, card.choices).id;

/** Resolves every pending event (of the year, or of a management action) with random visible choices, or `picker`'s. */
export function resolveAll(
  life: LifeState,
  content: ContentBundle,
  choices: RngState,
  onStep?: (life: LifeState) => void,
  picker: ChoicePicker = randomChoice,
): LifeState {
  let current = life;
  while (current.phase === 'events' || (current.phase === 'action' && firstUnresolvedEvent(current) !== null)) {
    const index = firstUnresolvedEvent(current)!;
    const card = getEventCard(current, index, content)!;
    current = resolveChoice(current, card.instanceId, picker(current, card, choices), content);
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

/** Takes a management action and resolves its result event with a random visible choice. */
export function playAction(
  life: LifeState,
  content: ContentBundle,
  actionId: ActionId,
  personId: string,
  choices: RngState,
  onStep?: (life: LifeState) => void,
  picker?: ChoicePicker,
): LifeState {
  let current = performAction(life, actionId, { personId }, content);
  onStep?.(current);
  current = resolveAll(current, content, choices, onStep, picker);
  current = finishAction(current);
  onStep?.(current);
  return current;
}
