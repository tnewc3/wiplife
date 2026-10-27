/**
 * Looks (P1): the text descriptors a character has ("blue eyes", "red hair", character/appearance.yaml) and the portrait
 * colors they stand for (balance/portraits.yaml descriptors). Older lives and the Profile's wording keep using the text.
 */
import type { ContentBundle } from '../../content/schemas';
import type { Look } from '../types';

/** The portrait hair and eye color the descriptors name (nothing for a group they do not cover). */
export function lookFromDescriptors(descriptors: readonly string[], content: ContentBundle): Partial<Pick<Look, 'hair' | 'eyes'>> {
  const { hair, eyes } = content.balance.portraits.descriptors;
  const out: Partial<Pick<Look, 'hair' | 'eyes'>> = {};
  for (const d of descriptors) {
    if (out.hair === undefined && hair[d] !== undefined) out.hair = hair[d]!;
    if (out.eyes === undefined && eyes[d] !== undefined) out.eyes = eyes[d]!;
  }
  return out;
}

/** The descriptors with the hair and eye ones swapped for the text that matches `look`. */
export function descriptorsMatching(descriptors: readonly string[], look: Pick<Look, 'hair' | 'eyes'>, content: ContentBundle): string[] {
  const maps = content.balance.portraits.descriptors;
  const swap = (list: string[], map: Record<string, string>, color: string): string[] => {
    const text = Object.keys(map).find((d) => map[d] === color);
    if (text === undefined) return list;
    const at = list.findIndex((d) => map[d] !== undefined);
    if (at < 0) return [...list, text];
    return list.map((d, i) => (i === at ? text : d)).filter((d, i) => i === at || map[d] === undefined);
  };
  return swap(swap([...descriptors], maps.hair, look.hair), maps.eyes, look.eyes);
}
