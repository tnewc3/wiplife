/**
 * Doing an activity (Batch 2a): the one engine path behind every entry on the
 * Activities screen. The caller (the `do_activity` life action) has checked it
 * is available and recorded the input. Here:
 *
 * 1. The price is paid through the finance module (savings; never debt, the
 *    action isn't available when you can't pay).
 * 2. The tier is rolled from the activity's odds profile (balance/pastimes.yaml),
 *    tilted by your traits and a price tier, and pushed toward the lower tiers
 *    by every earlier time you did the same activity this year.
 * 3. The tier's effects run through the event effect handlers (stats, health,
 *    the law, relationships, memories); gains shrink with repeats, losses
 *    don't. A companion gets affection and trust the same way.
 * 4. Chances inside the tier (a complication, a fight, an addiction) are
 *    rolled with the life's generator and run through the same handlers.
 * 5. A Luxury activity acquires its valuable.
 * 6. A receipt is kept: the words, the money and the new balance, and the
 *    stats that moved. A drunk drive home (E5) or a follow-up event that casts
 *    someone (a stranger, a date) is then opened as a result event.
 */
import { POSSESSION_ROLES, type ContentBundle, type Effect, type OutcomeTier, type PastimeDef, type PastimeTier } from '../../content/schemas';
import { fittingResults, queueResult } from '../actions/result';
import { tryQueueCastEvent } from '../actions/castResult';
import { curveAt } from '../curve';
import { atLegalAge, formatMoney, moneyDisplayOf } from '../country';
import { totalDebt, spend } from '../finance';
import { applyEffects } from '../events/effects';
import { scoreOf } from '../events/checks';
import { textContext } from '../events/text';
import { evaluate } from '../conditions';
import { clampInt } from '../random';
import { weightedPick } from '../random';
import { chance, nextInt } from '../rng';
import { renderText } from '../text';
import { hasLicense } from '../teen/query';
import { vehiclesOf } from '../possessions/query';
import { addValuable } from '../possessions/valuables';
import type { Id, LifeState, PastimeReceipt } from '../types';
import { definedTiers, pastimeCount, pastimePrice, type PastimeChoice } from './query';

/** The role the companion plays in an activity's effects and wording. */
export const COMPANION_ROLE = 'companion';

const STATS = ['health', 'happiness', 'smarts', 'looks', 'fitness', 'stress'] as const;

/** What a gain is multiplied by after `repeats` earlier times this year. */
export function returnsFactor(repeats: number, content: ContentBundle): number {
  const r = content.balance.pastimes.returns;
  return Math.max(r.floor, r.repeat ** repeats);
}

/** The relative weight of each tier of this activity now (best first; tiers it doesn't define are left out). */
export function tierWeights(state: LifeState, def: PastimeDef, choice: PastimeChoice, repeats: number, content: ContentBundle): [OutcomeTier, number][] {
  const b = content.balance.pastimes;
  const profile = b.profiles[def.profile]!;
  let tilt = 1;
  for (const t of profile.tilt) tilt += (t.weight * (scoreOf(state, t.key) - 50)) / 50;
  tilt = Math.max(0.25, tilt);
  const qualityOdds = def.quality && choice.quality ? b.quality[choice.quality].odds : 1;
  const good = tilt * qualityOdds * b.returns.tierShift ** repeats;
  const bad = 1 / (tilt * qualityOdds);
  const side: Record<OutcomeTier, number> = { great: good, good, neutral: 1, bad, backfire: bad };
  return definedTiers(def).map((t) => [t, profile[t] * side[t]] as [OutcomeTier, number]).filter(([, w]) => w > 0);
}

/** The chance of a chance named in a tier now. */
export function chanceNow(state: LifeState, key: string, choice: PastimeChoice, repeats: number, content: ContentBundle): number {
  const c = content.balance.pastimes.chances[key];
  if (!c) return 0;
  let p = c.base * c.repeat ** repeats;
  for (const f of c.factors) p *= curveAt(f.curve, scoreOf(state, f.key));
  if (c.quality && choice.quality) p *= content.balance.pastimes.quality[choice.quality].complication;
  return Math.min(1, Math.max(0, p));
}

/** Gains shrink with repeats (a stat that rises, a stress that falls); losses don't. */
function scaleEffects(effects: readonly Effect[], factor: number): Effect[] {
  return effects.flatMap((e): Effect[] => {
    if (e.type !== 'stat') return [e];
    const gain = e.key === 'stress' ? e.delta < 0 : e.delta > 0;
    if (!gain) return [e];
    const delta = Math.round(e.delta * factor);
    return delta === 0 ? [] : [{ ...e, delta }];
  });
}

function statsOf(state: LifeState): Record<(typeof STATS)[number], number> {
  const s = state.character.stats;
  return { health: s.health, happiness: s.happiness, smarts: s.smarts, looks: s.looks, fitness: s.fitness, stress: s.stress };
}

/** Does the follow-up the tier names come about? */
function eventComes(state: LifeState, tier: PastimeTier, choice: PastimeChoice, repeats: number, content: ContentBundle): boolean {
  return tier.eventChance === undefined || chance(state.rng, chanceNow(state, tier.eventChance, choice, repeats, content));
}

export interface PastimeInput extends PastimeChoice {
  pastimeId: Id;
}

/** Does the activity; see the file comment. The caller has checked it is available (pastimeBlock) and recorded the input. */
export function performPastime(state: LifeState, def: PastimeDef, input: PastimeChoice, content: ContentBundle): void {
  const year = state.currentYear;
  if (state.pastimes.year !== year) state.pastimes = { year, counts: {}, receipts: [] };
  const repeats = pastimeCount(state, def.id);
  const savings = state.finances.savings;
  const debt = totalDebt(state);
  const before = statsOf(state);

  // 1. The price, through the finance module.
  const price = pastimePrice(state, def, input, content);
  spend(state, price, content);

  // 2. The tier.
  const tier: OutcomeTier = weightedPick(state.rng, tierWeights(state, def, input, repeats, content));
  const outcome = def.tiers[tier]!;
  const factor = returnsFactor(repeats, content);
  const companionId = input.companionId;
  const cast: Record<string, Id> = companionId !== undefined ? { [COMPANION_ROLE]: companionId } : {};

  // The words are written before the effects run, so they say what was true when it happened.
  const ctx = textContext(state, cast, content, undefined, true);
  if (ctx.values) ctx.values.cost = formatMoney(price, moneyDisplayOf(state, content));
  const wordings = companionId !== undefined ? outcome.together! : outcome.text!;
  const text = renderText(wordings[nextInt(state.rng, 0, wordings.length - 1)]!, ctx);

  // 3. The effects.
  const effectCtx = { def: { id: def.id, rarity: 'common' as const }, cast, rng: state.rng, content };
  applyEffects(state, scaleEffects(outcome.effects as Effect[], factor), effectCtx);
  let affection = 0;
  if (companionId !== undefined && outcome.companion) {
    const rel = state.relationships[companionId];
    if (rel) {
      const gain = (delta: number) => (delta > 0 ? Math.round(delta * factor) : delta);
      const a = gain(outcome.companion.affection);
      const t = gain(outcome.companion.trust);
      const was = rel.affection;
      rel.affection = clampInt(rel.affection + a, 0, 100);
      rel.trust = clampInt(rel.trust + t, 0, 100);
      affection = rel.affection - was;
    }
  }

  // 4. Chances inside the outcome.
  const notes: string[] = [];
  for (const extra of outcome.extras) {
    if (extra.if && !evaluate(extra.if, state, { cast, roles: 'strict', content })) continue;
    if (!chance(state.rng, chanceNow(state, extra.chance, input, repeats, content))) continue;
    applyEffects(state, extra.effects as Effect[], effectCtx);
    if (extra.note) notes.push(renderText(extra.note, ctx));
  }

  // 5. A Luxury activity acquires its valuable.
  if (def.buys !== undefined) addValuable(state, def.buys, price, content);

  // 6. The receipt.
  const after = statsOf(state);
  const changes: PastimeReceipt['changes'] = {};
  for (const key of STATS) if (after[key] !== before[key]) changes[key] = after[key] - before[key];
  const receipt: PastimeReceipt = { year, pastimeId: def.id, tier, text, notes, changes };
  const change = state.finances.savings - savings;
  const debtChange = totalDebt(state) - debt;
  if (change !== 0 || debtChange !== 0) receipt.money = { change, balance: state.finances.savings, debtChange };
  const person = companionId !== undefined ? state.people[companionId] : undefined;
  if (companionId !== undefined && person) receipt.companion = { id: companionId, name: person.name.first, affection };
  state.pastimes.counts[def.id] = repeats + 1;
  state.pastimes.receipts.push(receipt);
  const keep = content.balance.pastimes.receipts;
  if (state.pastimes.receipts.length > keep) state.pastimes.receipts = state.pastimes.receipts.slice(-keep);

  // 7. What follows: a drunk drive home, then someone you meet.
  if (state.phase !== 'yearStart') return;
  if (outcome.drunkDrive !== undefined && chance(state.rng, chanceNow(state, outcome.drunkDrive, input, repeats, content))) {
    const car = vehiclesOf(state)[0];
    if (car && hasLicense(state) && atLegalAge(state, 'driving', content)) {
      const cars = { [POSSESSION_ROLES.vehicle]: car.id };
      const options = fittingResults(state, content.registries.possessions.accidents.drunk.events, cars, content);
      if (options.length > 0) {
        queueResult(state, options, cars);
        return;
      }
    }
  }
  if (outcome.events.length > 0 && eventComes(state, outcome, input, repeats, content)) tryQueueCastEvent(state, outcome.events, content);
}
