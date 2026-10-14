/** The `migration` effect (W6): see the schema in src/content/schemas/events.ts. What does not fit now is ignored. */
import type { ContentBundle, Effect } from '../../content/schemas';
import { citiesOfCountry, countryIdOfCity } from '../country';
import { spend, wholeDollars } from '../finance';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import type { LifeState } from '../types';
import { becomeUndocumented, commitmentBlock, returnHome } from './move';
import { isSettled, relativesAbroad } from './query';

type MigrationEffect = Extract<Effect, { type: 'migration' }>;

/** The city you would go back to: the one you left, if you are still a citizen of its country, else the first city of a country you belong to. */
export function homeCity(state: LifeState, content: ContentBundle): string | null {
  const left = state.travel.residence?.homeCityId;
  if (left && state.character.citizenships.includes(countryIdOfCity(left, content))) return left;
  const country = state.character.citizenships.find((c) => c !== countryIdOfCity(state.character.cityId, content));
  return country ? citiesOfCountry(country, content)[0] ?? null : null;
}

export function applyMigrationEffect(state: LifeState, effect: MigrationEffect, content: ContentBundle): void {
  const m = state.migration;
  switch (effect.action) {
    case 'remit':
      if (isSettled(state, content) && relativesAbroad(state, content).length > 0) m.remit.level = effect.level!;
      return;
    case 'overstay':
      if (isSettled(state, content)) becomeUndocumented(state, content);
      return;
    case 'leave': {
      const city = homeCity(state, content);
      if (city && isSettled(state, content) && !isIncarcerated(state) && !commitmentBlock(state)) returnHome(state, city, content);
      return;
    }
    case 'ties':
      for (const id of relativesAbroad(state, content)) {
        const rel = state.relationships[id]!;
        rel.affection = clampInt(rel.affection + effect.delta!, 0, 100);
      }
      return;
    case 'prepare':
      if (m.application?.kind === 'naturalization' && m.application.status === 'pending') m.application.prepared = true;
      return;
    case 'withheld': {
      const gross = state.finances.lastLedger?.gross ?? 0;
      const amount = wholeDollars(gross * effect.share!);
      if (amount > 0) {
        spend(state, amount, content);
        m.year.stolen += amount;
        m.counts.stolen = (m.counts.stolen ?? 0) + amount;
      }
      return;
    }
    case 'risk':
      m.exposure = Math.max(0, Math.min(0.5, m.exposure + effect.delta! / 100));
      return;
  }
}
