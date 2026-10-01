/** Small text helpers shared by the obituary and event text. */
import type { ContentBundle } from '../content/schemas';
import { renderText } from './text';

/** Joins words into a list ("a and b", "a, b, and c"), with text/obituary.yaml list. */
export function listText(items: readonly string[], content: ContentBundle): string {
  const text = content.text.obituary;
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return renderText(text.list.pair, { values: { first: items[0]!, second: items[1]! } });
  return renderText(text.list.serial, {
    values: { items: items.slice(0, -1).join(text.list.separator), last: items[items.length - 1]! },
  });
}
