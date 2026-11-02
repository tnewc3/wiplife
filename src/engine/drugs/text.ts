/** Drugs (D1): history lines and one-line notes, filled from text/drugs.yaml. */
import type { ContentBundle, DrugHistoryKey, DrugNoteKey } from '../../content/schemas';
import { formatMoney, moneyDisplayOf } from '../country';
import { writeFromGroup } from '../systems/history';
import { renderText } from '../text';
import type { LifeState } from '../types';

export type DrugValues = Partial<Record<'drug' | 'units' | 'amount' | 'source' | 'name' | 'sentence', string>>;

export function say(state: LifeState, key: DrugHistoryKey, values: DrugValues, content: ContentBundle): void {
  writeFromGroup(state, content.text.drugs.history[key], ['drugs', key], { values: fill(values) }, content);
}

/** A one-line note for an action's result. Placeholders left out render as nothing. */
export function note(key: DrugNoteKey, values: DrugValues, content: ContentBundle): string {
  return renderText(content.text.drugs.notes[key], { values: fill(values) });
}

function fill(values: DrugValues): Record<string, string> {
  return { drug: '', units: '', amount: '', source: '', name: '', sentence: '', ...values };
}

export const dollarText = (state: LifeState, amount: number, content: ContentBundle): string => formatMoney(Math.abs(amount), moneyDisplayOf(state, content));

/** "3 bags" / "1 bag". */
export function unitsText(n: number, def: { unit: { one: string; many: string } }): string {
  return `${n} ${n === 1 ? def.unit.one : def.unit.many}`;
}
