/**
 * Values business events can use in their text (W3): {business} (the name of
 * the business the event is about), {bizType} (what kind it is, as a noun),
 * {bizCity}, {bizStyle} (its style, in words) and {bizTitle} (what its workers
 * are called). The content build checks that an event using one requires a business.
 */
import type { ContentBundle } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { businessById, castBusinessId } from './query';

export const BUSINESS_TEXT_VALUES = ['business', 'bizType', 'bizCity', 'bizStyle', 'bizTitle'] as const;

export function businessTextValues(state: LifeState, cast: Record<string, Id>, content: ContentBundle): Record<string, string> {
  const b = businessById(state, castBusinessId(cast)) ?? state.business.items[0];
  const def = b && content.businesses[b.defId];
  return {
    business: b?.name ?? '',
    bizType: def?.noun ?? '',
    bizCity: b ? (content.cities[b.cityId]?.name ?? '') : '',
    bizStyle: b && def ? def.styles[b.style].label.toLowerCase() : '',
    bizTitle: def?.staffTitle ?? '',
  };
}
