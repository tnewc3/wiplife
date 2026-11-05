import { content } from '../content';

/** Every city by name, for a choice of city. */
export function cityOptions(): { id: string; label: string }[] {
  return Object.keys(content.cities)
    .sort()
    .map((id) => ({ id, label: content.cities[id]!.name }));
}
