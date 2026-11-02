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
 *
 * Batch 2b adds four ways of working an outcome out, by the activity's
 * `mechanic` (see ./risk.ts and balance/risk.yaml): `gamble` rolls a game's
 * payout table (the house always keeps an edge) and pays the winnings through
 * the finance module; `lawsuit` weighs the route (settle or trial), the
 * evidence you hold and the lawyer's tier; `loan` makes a debt of one of the
 * new kinds if the lender approves; `name` changes your legal name. Crime and
 * the black market tilt the odds with heat, your record and a crew, and pay
 * loot (savings, or dirty money for the serious ones); a caught outcome runs
 * the law's own sentencing, juvenile handling included.
 */
import { POSSESSION_ROLES, type ContentBundle, type Effect, type OutcomeTier, type PastimeDef, type PastimeTier } from '../../content/schemas';
import { addDirty } from '../crime/money';
import { inCrew } from '../crime/query';
import { sentence } from '../legal';
import { writeFromGroup } from '../systems/history';
import { fittingResults, queueResult } from '../actions/result';
import { tryQueueCastEvent } from '../actions/castResult';
import { curveAt } from '../curve';
import { atLegalAge, formatMoney, moneyDisplayOf } from '../country';
import { addDebt, earn, totalDebt, spend, wholeDollars } from '../finance';
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
import { definedTiers, pastimePrice, type PastimeChoice } from './query';
import { applyLook, practiceHobby, repeatsOf } from './activities';
import { EXPOSED_CATEGORIES, FAKE_ID_FLAG, evidenceCount, exposure, fakeIdUsable, loanOffer, nameAfter, rollAmount } from './risk';

/** The role the companion plays in an activity's effects and wording. */
export const COMPANION_ROLE = 'companion';

const STATS = ['health', 'happiness', 'smarts', 'looks', 'fitness', 'stress'] as const;

/** What a gain is multiplied by after `repeats` earlier times this year. */
export function returnsFactor(repeats: number, content: ContentBundle): number {
  const r = content.balance.activities.returns;
  return Math.max(r.floor, r.repeat ** repeats);
}

/** The relative weight of each tier of this activity now (best first; tiers it doesn't define are left out). */
export function tierWeights(state: LifeState, def: PastimeDef, choice: PastimeChoice, repeats: number, content: ContentBundle): [OutcomeTier, number][] {
  const b = content.balance.pastimes;
  if (def.mechanic === 'lawsuit') {
    // The route sets the odds, the evidence you hold and the lawyer you pay lean them your way.
    const r = content.balance.risk.lawsuits;
    const route = r.routes[choice.route ?? 'trial']!;
    const edge = (1 + r.evidenceStep) ** evidenceCount(state, def, choice.companionId, content) * (def.quality && choice.quality ? b.quality[choice.quality].odds : 1);
    const side: Record<OutcomeTier, number> = { great: edge, good: edge, neutral: 1, bad: 1 / edge, backfire: 1 / edge };
    return definedTiers(def).map((t) => [t, route.weights[t] * side[t]] as [OutcomeTier, number]).filter(([, w]) => w > 0);
  }
  const profile = b.profiles[def.profile!]!;
  let tilt = 1;
  for (const t of profile.tilt) tilt += (t.weight * (scoreOf(state, t.key) - 50)) / 50;
  tilt = Math.max(0.25, tilt);
  const qualityOdds = def.quality && choice.quality ? b.quality[choice.quality].odds : 1;
  const returns = content.balance.activities.returns;
  const good = tilt * qualityOdds * returns.tierShift ** repeats;
  // Crime and the black market: heat, a record and a crew make getting caught likelier. A1: so does every repeat in a year.
  const bad = (1 / (tilt * qualityOdds)) * (EXPOSED_CATEGORIES.includes(def.category) ? exposure(state, content) : 1) * (1 + returns.badRise * repeats);
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
  if (c.stake && choice.stake) p *= content.balance.risk.stakes[choice.stake].addiction;
  if (choice.chase === true) p *= c.chase;
  return Math.min(1, Math.max(0, p));
}

/** Gains shrink with repeats (a stat that rises, a stress that falls); losses don't. A crew member working alone draws more heat. */
function scaleEffects(effects: readonly Effect[], factor: number, heat: number): Effect[] {
  return effects.flatMap((e): Effect[] => {
    if (e.type === 'crime' && e.action === 'heat' && e.delta !== undefined && e.delta > 0) return heat === 0 ? [] : [{ ...e, delta: Math.round(e.delta * heat) }];
    if (e.type !== 'stat') return [e];
    const gain = e.key === 'stress' ? e.delta < 0 : e.delta > 0;
    if (!gain) return [e];
    const delta = Math.round(e.delta * factor);
    return delta === 0 ? [] : [{ ...e, delta }];
  });
}

/** C2: whatever lowers your Stress (a walk, meditation, yoga, the outdoors, leisure, a spa) lowers burnout too, by a share of it and with the same diminishing returns (the Stress it took off is already smaller each time). */
function relieveBurnout(state: LifeState, stressDrop: number, content: ContentBundle): void {
  if (stressDrop <= 0) return;
  const r = content.balance.careers.hub.relief;
  const relief = Math.min(r.max, Math.round(stressDrop * r.share));
  if (relief <= 0) return;
  const hub = state.hub;
  const before = hub.burnout;
  hub.burnout = clampInt(hub.burnout - relief, 0, 100);
  hub.totals.relieved += before - hub.burnout;
  if (state.fame.active) state.fame.burnout = clampInt(state.fame.burnout - relief, 0, 100);
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

/** The categories whose words are written after the outcome has happened ({sentence}, a new name). */
const WRITTEN_AFTER: readonly string[] = ['crime', 'black_market', 'gambling', 'lawsuits', 'identity', 'loans'];

interface Before {
  savings: number;
  debt: number;
  dirty: number;
  stats: ReturnType<typeof statsOf>;
}

function snapshot(state: LifeState): Before {
  return { savings: state.finances.savings, debt: totalDebt(state), dirty: state.finances.dirty, stats: statsOf(state) };
}

/** Writes the receipt (the words, what moved, the money and the new balance) and counts the activity. */
function keepReceipt(state: LifeState, def: PastimeDef, tier: OutcomeTier, text: string, notes: string[], before: Before, companion: { id: Id; affection: number } | undefined, content: ContentBundle): void {
  // A bet that comes back even is still a bet: the receipt always shows the money for it.
  const always = def.mechanic === 'gamble' || def.mechanic === 'loan';
  const after = statsOf(state);
  const changes: PastimeReceipt['changes'] = {};
  for (const key of STATS) if (after[key] !== before.stats[key]) changes[key] = after[key] - before.stats[key];
  const receipt: PastimeReceipt = { year: state.currentYear, pastimeId: def.id, tier, text, notes, changes };
  const change = state.finances.savings - before.savings;
  const debtChange = totalDebt(state) - before.debt;
  const dirty = state.finances.dirty - before.dirty;
  if (always || change !== 0 || debtChange !== 0 || dirty !== 0) {
    receipt.money = { change, balance: state.finances.savings, debtChange };
    if (dirty !== 0) receipt.money.dirty = { change: dirty, balance: state.finances.dirty };
  }
  const person = companion ? state.people[companion.id] : undefined;
  if (companion && person) receipt.companion = { id: companion.id, name: person.name.first, affection: companion.affection };
  state.pastimes.counts[def.id] = (state.pastimes.counts[def.id] ?? 0) + 1;
  // A1: and against the activity of the Activities tab it is an option of (its yearly limit, and its repeats when its options share them).
  if (def.hub !== undefined) state.pastimes.counts[`hub:${def.hub}`] = (state.pastimes.counts[`hub:${def.hub}`] ?? 0) + 1;
  state.pastimes.receipts.push(receipt);
  const keep = content.balance.pastimes.receipts;
  if (state.pastimes.receipts.length > keep) state.pastimes.receipts = state.pastimes.receipts.slice(-keep);
}

/** The words of an outcome: the lawsuit's settlement wording when you settle, the companion's when someone is involved, else yours alone. */
function wordingsOf(def: PastimeDef, outcome: PastimeTier, input: PastimeChoice): readonly string[] {
  if (def.mechanic === 'lawsuit' && input.route === 'settle' && outcome.settle) return outcome.settle;
  return (input.companionId !== undefined ? outcome.together : outcome.text) ?? outcome.together ?? outcome.text!;
}

/** Does the activity; see the file comment. The caller has checked it is available (pastimeBlock) and recorded the input. */
export function performPastime(state: LifeState, def: PastimeDef, input: PastimeChoice, content: ContentBundle): void {
  const year = state.currentYear;
  if (state.pastimes.year !== year) state.pastimes = { year, counts: {}, receipts: [] };
  if (def.mechanic === 'loan') return performLoan(state, def, content);
  if (def.mechanic === 'name') return performName(state, def, input, content);
  const repeats = repeatsOf(state, def, content);
  const before = snapshot(state);
  const usedFakeId = fakeIdUsable(state, def, content);

  // 1. The price, through the finance module (a chase may borrow the last of it).
  const price = pastimePrice(state, def, input, content);
  spend(state, price, content);

  // 2. The tier. A game is its payout table; everything else is an odds profile.
  let multiple = 0;
  let tier: OutcomeTier;
  if (def.mechanic === 'gamble') {
    const game = content.balance.risk.games[def.game!]!;
    const result = weightedPick(state.rng, game.outcomes.map((o) => [o, o.chance] as [(typeof game.outcomes)[number], number]));
    tier = result.tier;
    multiple = result.multiple;
  } else {
    tier = weightedPick(state.rng, tierWeights(state, def, input, repeats, content));
  }
  const outcome = def.tiers[tier]!;
  const factor = returnsFactor(repeats, content);
  const companionId = input.companionId;
  const cast: Record<string, Id> = companionId !== undefined ? { [COMPANION_ROLE]: companionId } : {};

  // Money that comes with the outcome: winnings, loot, a settlement or court costs.
  let amount = 0;
  if (def.mechanic === 'gamble') amount = wholeDollars(price * multiple);
  else if (outcome.money) {
    const routeShare = def.mechanic === 'lawsuit' ? content.balance.risk.lawsuits.routes[input.route ?? 'trial']!.share : 1;
    amount = rollAmount(state, outcome.money.key, outcome.money.share * routeShare, state.rng, content);
  }

  // The words are written before the effects run, so they say what was true when it happened ...
  const writtenAfter = WRITTEN_AFTER.includes(def.category);
  const early = writtenAfter ? undefined : textContext(state, cast, content, undefined, true);
  const words = (): string => {
    const ctx = early ?? textContext(state, cast, content, undefined, false);
    if (ctx.values) {
      const display = moneyDisplayOf(state, content);
      ctx.values.cost = formatMoney(price, display);
      ctx.values.amount = formatMoney(amount, display);
    }
    const wordings = wordingsOf(def, outcome, input);
    return renderText(wordings[nextInt(state.rng, 0, wordings.length - 1)]!, ctx);
  };
  let text = writtenAfter ? '' : words();

  // 3. The effects.
  const minor = state.character.age < content.balance.relationships.adultAge;
  const heat = minor ? 0 : inCrew(state) && def.category === 'crime' ? content.balance.risk.crew.heat : 1;
  const effectCtx = { def: { id: def.id, rarity: 'common' as const }, cast, rng: state.rng, content };
  const stressBefore = state.character.stats.stress;
  applyEffects(state, scaleEffects(outcome.effects as Effect[], factor, heat), effectCtx);
  relieveBurnout(state, stressBefore - state.character.stats.stress, content);
  if (def.category === 'crime' && state.crime.crew) state.crime.standing = clampInt(state.crime.standing - content.balance.risk.crew.standing, 0, 100);
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

  // A1: salon and shopping change your portrait; a hobby practiced grows its skill (gains shrink with repeats).
  if (def.look !== undefined && input.look !== undefined) applyLook(state, def.look, input.look, content);
  if (def.hobby) practiceHobby(state, def, Math.round(def.hobby.skill[tier] * factor), repeats, content);

  // The money moves, through the finance module (dirty money is E6a's).
  if (amount > 0) {
    const mode = def.mechanic === 'gamble' ? 'earn' : (outcome.money?.mode ?? 'earn');
    if (mode === 'earn') earn(state, amount);
    else if (mode === 'dirty') addDirty(state, amount);
    else spend(state, amount, content);
  }

  // 4. Chances inside the outcome.
  const notes: string[] = [];
  for (const extra of outcome.extras) {
    if (extra.if && !evaluate(extra.if, state, { cast, roles: 'strict', content })) continue;
    if (!chance(state.rng, chanceNow(state, extra.chance, input, repeats, content))) continue;
    applyEffects(state, extra.effects as Effect[], effectCtx);
    if (extra.note) notes.push(renderText(extra.note, early ?? textContext(state, cast, content, undefined, false)));
  }

  // 5. A Luxury activity acquires its valuable.
  if (def.buys !== undefined) addValuable(state, def.buys, price, content);

  // A fake ID that got you in may be caught: the law's own entry, and the ID is gone.
  if (usedFakeId && chance(state.rng, content.balance.risk.fakeId.caught)) {
    delete state.flags[FAKE_ID_FLAG];
    sentence(state, content.balance.risk.fakeId.offense, 'sentence', undefined, content);
    writeFromGroup(state, content.text.history.legal.fakeIdCaught, ['legal', 'fakeIdCaught'], {}, content);
  }

  // A lawsuit goes into your life history: won, settled or lost.
  if (def.mechanic === 'lawsuit' && tier !== 'neutral') {
    const key = tier === 'bad' || tier === 'backfire' ? 'lawsuitLost' : input.route === 'settle' ? 'lawsuitSettled' : 'lawsuitWon';
    writeFromGroup(state, content.text.history.risk[key], ['risk', key], { values: key === 'lawsuitLost' ? {} : { amount: formatMoney(amount, moneyDisplayOf(state, content)) } }, content);
  }

  if (writtenAfter) text = words();

  // 6. The receipt.
  keepReceipt(state, def, tier, text, notes, before, companionId !== undefined ? { id: companionId, affection } : undefined, content);

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

/** A loan: the lender has said yes (pastimeBlock checked); the money comes in as a debt of its own kind, with the lender's fee out of it. */
function performLoan(state: LifeState, def: PastimeDef, content: ContentBundle): void {
  const before = snapshot(state);
  const offer = loanOffer(state, def, content);
  addDebt(state, offer.kind, offer.amount, content, { annualRate: offer.rate, termYears: offer.termYears });
  earn(state, offer.amount);
  spend(state, offer.fee, content);
  const outcome = def.tiers.good;
  const cast: Record<string, Id> = {};
  const effectCtx = { def: { id: def.id, rarity: 'common' as const }, cast, rng: state.rng, content };
  applyEffects(state, outcome.effects as Effect[], effectCtx);
  writeFromGroup(state, content.text.history.risk.loanTaken, ['risk', 'loanTaken'], { values: { amount: formatMoney(offer.amount, moneyDisplayOf(state, content)), lender: def.lender ?? 'a lender' } }, content);
  const ctx = textContext(state, cast, content, undefined, false);
  if (ctx.values) {
    const display = moneyDisplayOf(state, content);
    ctx.values.cost = formatMoney(offer.fee, display);
    ctx.values.amount = formatMoney(offer.amount, display);
    ctx.values.rate = `${Math.round(offer.rate * 100)}%`;
  }
  const text = renderText(outcome.text![nextInt(state.rng, 0, outcome.text!.length - 1)]!, ctx);
  keepReceipt(state, def, 'good', text, [], before, undefined, content);
}

/** A legal name change: the name becomes the new one (the old one is remembered), the people close to you answer, and every text from now on uses it. */
function performName(state: LifeState, def: PastimeDef, input: PastimeChoice, content: ContentBundle): void {
  const before = snapshot(state);
  const after = nameAfter(state, def, input);
  if (typeof after === 'string') return;
  const b = content.balance.risk.identity;
  const price = pastimePrice(state, def, input, content);
  spend(state, price, content);
  const old = state.character.name;
  const former = [...(state.character.formerNames ?? [])];
  // Going back to a former name takes it off the list; the name you are leaving goes on it.
  if (def.nameChange === 'former') former.pop();
  former.push({ first: old.first, last: old.last, year: state.currentYear });
  state.character.formerNames = former.slice(-b.formerMax);
  state.character.name = { first: after.first, last: after.last };
  state.flags.changed_name = true;
  writeFromGroup(state, content.text.history.risk.nameChanged, ['risk', 'nameChanged'], { values: { oldName: `${old.first} ${old.last}`, newName: `${after.first} ${after.last}` } }, content);
  // The people close to you: parents mind a name they gave you being dropped; a partner is moved when you take theirs.
  for (const [id, rel] of Object.entries(state.relationships)) {
    const person = state.people[id];
    if (!person?.alive || rel.status !== 'active') continue;
    if ((rel.kind === 'parent' || rel.kind === 'stepparent') && def.nameChange !== 'former' && def.nameChange !== 'partner') rel.affection = clampInt(rel.affection + b.reactions.parents, 0, 100);
    else if (rel.kind === 'partner' || rel.kind === 'fiance' || rel.kind === 'spouse') {
      rel.affection = clampInt(rel.affection + (def.nameChange === 'partner' ? b.reactions.partnerTakes : b.reactions.partnerOther), 0, 100);
    }
  }
  const outcome = def.tiers.good;
  const effectCtx = { def: { id: def.id, rarity: 'common' as const }, cast: {}, rng: state.rng, content };
  applyEffects(state, outcome.effects as Effect[], effectCtx);
  const ctx = textContext(state, {}, content, undefined, false);
  if (ctx.values) ctx.values.cost = formatMoney(price, moneyDisplayOf(state, content));
  const text = renderText(outcome.text![nextInt(state.rng, 0, outcome.text!.length - 1)]!, ctx);
  keepReceipt(state, def, 'good', text, [], before, undefined, content);
}
