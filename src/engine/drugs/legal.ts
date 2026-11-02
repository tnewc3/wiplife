/**
 * Drugs and the law (D1): possession, intent to sell, dealing, trafficking and manufacturing go through the legal system
 * (../legal.ts `sentence`), so a record, probation and prison work as they always did. The offense escalates with what
 * is involved: how serious the drug is (its severity), how much is held or sold, and whether it was made.
 * Numbers: balance/drugs.yaml legal. Offenses: src/content/offenses.
 */
import type { ContentBundle } from '../../content/schemas';
import { addHeat } from '../crime/money';
import { sentence, sentenceText, type Sentence } from '../legal';
import { clampInt } from '../random';
import type { Id, LifeState } from '../types';
import { drugDef, totalUnits } from './query';

export type Situation = 'holding' | 'selling' | 'making';

/** The most serious severity among the drugs you hold (0 for none). */
export function topSeverity(state: LifeState, content: ContentBundle): number {
  let s = 0;
  for (const id of Object.keys(state.drugs.stock)) s = Math.max(s, drugDef(content, id)?.severity ?? 0);
  return s;
}

/** The offense the situation comes to now. Reads only. */
export function offenseFor(state: LifeState, situation: Situation, content: ContentBundle, drugId?: Id): Id {
  const l = content.balance.drugs.legal;
  if (situation === 'making') return l.manufacturing;
  const held = totalUnits(state);
  const sold = state.drugs.dealing?.year.year === state.currentYear ? state.drugs.dealing.year.sold : 0;
  if (situation === 'selling') return sold >= l.soldTrafficking || held >= l.traffickingAt ? l.trafficking : l.dealing;
  if (held >= l.traffickingAt) return l.trafficking;
  if (held >= l.intentAt || state.drugs.dealing !== null) return l.intent;
  const sev = drugId !== undefined ? (drugDef(content, drugId)?.severity ?? 1) : Math.max(1, topSeverity(state, content));
  return l.possession[clampInt(sev, 1, 5) - 1]!;
}

/** Units seized from your stock: everything not hidden, and the hidden part at the search's chance of finding it. */
export function seizeStock(state: LifeState, findHidden: boolean): number {
  let taken = 0;
  for (const [id, s] of Object.entries(state.drugs.stock)) {
    if (s.hidden && !findHidden) continue;
    taken += s.units;
    delete state.drugs.stock[id];
  }
  return taken;
}

/**
 * You are charged for the situation: the court sentences (the usual weights, your record and age), the stock the police
 * found is taken, heat rises and a reputation is lost. A minor is never in this position (they can't hold, deal or make);
 * the sentence function still handles one gently. Returns the sentence.
 */
export function charge(state: LifeState, situation: Situation, content: ContentBundle, opts: { drugId?: Id; findHidden?: boolean } = {}): Sentence | null {
  const offense = offenseFor(state, situation, content, opts.drugId);
  const result = sentence(state, offense, 'sentence', undefined, content);
  state.drugs.totals.arrests += 1;
  state.crime.totals.arrests += 1;
  seizeStock(state, opts.findHidden ?? false);
  addHeat(state, 8);
  const h = state.character.hidden;
  h.reputation = clampInt(h.reputation - 6, 0, 100);
  return result;
}

export { sentenceText };
