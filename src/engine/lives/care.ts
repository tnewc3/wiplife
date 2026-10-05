/**
 * Care for aging relatives (E3). When an older person comes to need care
 * (the lives step) it is a request; you can take them in, pay for their care
 * or leave it to the family. Taking someone in or paying for care costs money
 * every year through the ledger (what it costs is in balance/people.yaml, at
 * the national average, scaled to your city).
 */
import type { ContentBundle } from '../../content/schemas';
import { wholeDollars } from '../finance';
import type { LifeState } from '../types';

/** What looking after the relatives you take in or pay for costs this year (whole dollars). */
export function careCosts(state: LifeState, content: ContentBundle): number {
  if (state.housing.kind === 'incarcerated') return 0;
  const cost = content.balance.people.care.cost;
  let total = 0;
  for (const id of Object.keys(state.people).sort()) {
    const person = state.people[id]!;
    const care = person.life?.care;
    if (!person.alive || state.relationships[id]?.status === 'ended') continue;
    if (care === 'home') total += cost.home;
    else if (care === 'paid') total += cost.paid;
  }
  return wholeDollars(total * (content.cities[state.character.cityId]?.costOfLiving ?? 1));
}

/** Everyone whose care you are paying for or providing at home, in id order. */
export function caredFor(state: LifeState): string[] {
  return Object.keys(state.people)
    .sort()
    .filter((id) => {
      const person = state.people[id]!;
      return person.alive && (person.life?.care === 'home' || person.life?.care === 'paid') && state.relationships[id]?.status !== 'ended';
    });
}
