/**
 * Saved lives for the mini-game tests (G1): an athlete with a big moment waiting in the event sheet, a crew member caught
 * in the act, and a grown-up with money for the casino and a burglary, built with the engine on the test content pack.
 */
import { produce } from 'immer';
import type { LifeState } from '../../src/engine/types';
import { activitiesLife } from './activitiesFixtures';
import { sportsLife } from './sportsFixtures';

/** Puts one event waiting in the event sheet of a life that is at the start of a year. */
function withEvent(life: LifeState, eventId: string): LifeState {
  return produce(life, (d) => {
    d.phase = 'events';
    d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
    d.lifetime = { happinessTotal: d.character.stats.happiness * (d.character.age - 1), years: d.character.age - 1 };
    d.pending = [{ instanceId: `g1-${d.currentYear}`, eventId, cast: {} }];
  });
}

/** A pro in `sport` with a big moment (an event of its own) waiting; a playoff event comes with the run it belongs to. */
export function momentLife(options: { seed: string; sport: string; eventId: string }): LifeState {
  const life = withEvent(sportsLife({ seed: options.seed, pro: true, sport: options.sport }), options.eventId);
  if (!options.eventId.startsWith('playoffs_')) return life;
  return produce(life, (d) => {
    d.sports.run = { year: d.currentYear, won: 0, alive: true, strength: 64, rival: 56 };
    d.sports.seasons.push({ ...d.sports.seasons.at(-1)!, year: d.currentYear, result: 'out' });
  });
}

/** A crew member with the lights coming on (the run is played as the getaway). */
export function caughtLife(seed: string): LifeState {
  return withEvent(activitiesLife({ seed, age: 30 }), 'arrest_caught_in_the_act');
}

/** A grown-up with money to gamble and a burglary on offer. */
export function casinoLife(seed: string, vice = 20): LifeState {
  return activitiesLife({ seed, age: 36, savings: 60_000, vice });
}
