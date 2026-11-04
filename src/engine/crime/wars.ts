/**
 * Territory and war effects events can have (O1): a neighborhood gained or lost, a war started with the organization
 * that is at odds with you, a truce or an alliance with it. They move the same world state the yearly contests do.
 */
import type { ContentBundle } from '../../content/schemas';
import { clampInt } from '../random';
import { pick } from '../rng';
import type { LifeState } from '../types';
import { holdings, myOrg, worldOrg } from './orgs';
import { say } from './orgYear';

/** The organization you are most at odds with: the one you are at war with, else the most hostile one in the city. */
function opponent(state: LifeState) {
  const crew = state.crime.crew;
  if (!crew) return undefined;
  const at = worldOrg(state, crew.cityId, crew.war);
  if (at) return at;
  return [...(state.orgs.cities[crew.cityId] ?? [])].filter((o) => o.id !== crew.defId && o.status !== 'allied').sort((a, b) => a.attitude - b.attitude || (a.id < b.id ? -1 : 1))[0];
}

/** Your organization gains (delta > 0) or loses (delta < 0) a neighborhood, taken from or given to the opponent. */
export function changeTerritory(state: LifeState, delta: number): void {
  const crew = state.crime.crew;
  const mine = myOrg(state);
  if (!crew || !mine) return;
  const map = state.orgs.hoods[crew.cityId];
  if (!map) return;
  if (delta > 0) {
    const theirs = Object.keys(map).filter((h) => map[h] !== null && map[h] !== mine.id).sort();
    const free = Object.keys(map).filter((h) => map[h] === null).sort();
    const pool = free.length > 0 ? free : theirs;
    if (pool.length > 0) map[pick(state.rng, pool)] = mine.id;
  } else {
    const held = holdings(state, crew.cityId, mine.id);
    const to = opponent(state);
    if (held.length > 1 && to) map[pick(state.rng, held)] = to.id;
  }
}

/** The war with the opponent starts (or burns hotter). */
export function declareWar(state: LifeState, content: ContentBundle): void {
  const crew = state.crime.crew;
  const o = opponent(state);
  if (!crew || !o) return;
  o.war = clampInt(Math.max(o.war, content.balance.orgs.war.at) + 5, 0, 100);
  o.attitude = clampInt(o.attitude + content.balance.orgs.war.attitude.fight, -100, 100);
  if (o.status !== 'war') {
    o.status = 'war';
    delete o.truceSince;
    state.orgs.totals.wars += 1;
    say(state, 'warStarted', { rival: o.name }, content);
  }
  crew.war = o.id;
}

/** An end to the fighting: a truce, or (allied) an alliance. */
export function endWar(state: LifeState, content: ContentBundle, how: 'truce' | 'allied'): void {
  const crew = state.crime.crew;
  const o = opponent(state);
  if (!crew || !o) return;
  const w = content.balance.orgs.war;
  if (how === 'truce') {
    o.status = 'truce';
    o.truceSince = state.currentYear;
    o.war = Math.max(0, o.war - w.truceWar);
    o.attitude = clampInt(o.attitude + w.attitude.truce, -100, 100);
    say(state, 'truceMade', { rival: o.name }, content);
  } else {
    o.status = 'allied';
    o.war = 0;
    o.attitude = clampInt(o.attitude + w.attitude.alliance, -100, 100);
    say(state, 'allied', { rival: o.name }, content);
  }
  if (crew.war === o.id) delete crew.war;
}
