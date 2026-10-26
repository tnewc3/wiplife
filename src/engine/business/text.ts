/**
 * Values business events can use in their text (W3): {business} (the name of
 * the business the event is about), {bizType} (what kind it is, as a noun),
 * {bizCity}, {bizStyle} (its style, in words) and {bizTitle} (what its workers
 * are called). The content build checks that an event using one requires a business.
 */
import type { ContentBundle } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { businessById, castBusinessId } from './query';

export const BUSINESS_TEXT_VALUES = ['business', 'bizType', 'bizCity', 'bizStyle', 'bizTitle', 'product', 'supplier', 'location', 'locCity'] as const;

export function businessTextValues(state: LifeState, cast: Record<string, Id>, content: ContentBundle): Record<string, string> {
  const b = businessById(state, castBusinessId(cast)) ?? state.business.items[0];
  const def = b && content.businesses[b.defId];
  // B2: the line, supplier and location the latest news is about (else the best-selling line, the main supplier, the first location).
  const focus = b?.focus;
  const lineId = focus?.productId ?? [...(b?.report?.lines ?? [])].sort((x, y) => y.revenue - x.revenue)[0]?.productId ?? b?.lines.find((l) => l.on)?.productId;
  const product = def && lineId !== undefined ? def.products.find((p) => p.id === lineId) : undefined;
  const category = focus?.category ?? (product ? (product.supplier ?? def?.pools.find((x) => x.id === product.pool?.id)?.supplier) : undefined);
  const names = category !== undefined ? content.registries.business.suppliers[category]?.names : undefined;
  const supplier = names && b ? names[Math.abs([...`${b.id}${category}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % names.length]! : '';
  const loc = b?.locations.find((l) => l.id === focus?.locationId) ?? b?.locations[0];
  return {
    product: product ? product.name.toLowerCase() : '',
    supplier,
    location: loc && b ? `${content.cities[loc.cityId]?.name ?? ''}${b.locations.filter((l) => l.cityId === loc.cityId).length > 1 ? ` (${def?.styles[loc.style].label.toLowerCase() ?? ''})` : ''}` : '',
    locCity: loc ? (content.cities[loc.cityId]?.name ?? '') : '',
    business: b?.name ?? '',
    bizType: def?.noun ?? '',
    bizCity: b ? (content.cities[b.cityId]?.name ?? '') : '',
    bizStyle: b && def ? def.styles[b.style].label.toLowerCase() : '',
    bizTitle: def?.staffTitle ?? '',
  };
}
