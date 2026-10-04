/**
 * Doing an interaction (E1): validates the input, records it in the input
 * log, rolls the reaction with the life's seeded generator, applies the
 * outcome tier's consequences (with diminishing returns) through the
 * existing effect handlers, and leaves the outcome card in the life
 * (`pendingInteraction`) so it survives a reload. A big moment opens a choice
 * inside the card, answered by resolveInteractionChoice; closeInteraction
 * dismisses the card.
 */
import { produce, type Draft } from 'immer';
import { z } from 'zod';
import {
  GIFT_TIERS,
  type ContentBundle,
  type Effect,
  type GiftTier,
  type InteractionChoiceOption,
  type InteractionDef,
  type InteractionTier,
  type OutcomeTier,
} from '../../content/schemas';
import { fittingResults, queueResult } from '../actions/result';
import { InvalidInputError } from '../creation/input';
import { curveAt } from '../curve';
import { evaluate } from '../conditions';
import { textContext } from '../events/text';
import { applyEffects } from '../events/effects';
import { spend, totalDebt } from '../finance';
import { PhaseError } from '../life';
import { clampInt } from '../random';
import { chance, cloneRng, nextInt } from '../rng';
import { renderText } from '../text';
import type { Id, InteractionCounters, LifeState, MoneyChange, PendingInteraction } from '../types';
import { INTERACTION_ROLE, isInteractionAvailable } from './availability';
import { canAffordGift, extraChance, giftPrice } from './links';
import { shiftMood } from './mood';
import { availableTier, reactionScore, repeatsThisYear, returnsFactor, rollTier, type Repeats } from './reaction';

export interface InteractParams {
  interactionId: Id;
  personId: Id;
  /** Which gift price tier, for a gift interaction. */
  giftTier?: GiftTier;
}

const paramsSchema = z.strictObject({
  interactionId: z.string().min(1),
  personId: z.string().min(1),
  giftTier: z.enum(GIFT_TIERS).optional(),
});

/** Validates the player's input. Throws InvalidInputError for anything that isn't an interaction request. */
export function parseInteractParams(params: unknown): InteractParams {
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    throw new InvalidInputError(parsed.error.issues.map((i) => ({ path: `interaction.${i.path.join('.')}`.replace(/\.$/, ''), message: i.message })));
  }
  const { interactionId, personId, giftTier } = parsed.data;
  return { interactionId, personId, ...(giftTier ? { giftTier } : {}) };
}

type Consequence = Pick<InteractionTier, 'affection' | 'trust' | 'mood' | 'effects' | 'extras'>;

interface Moment {
  def: InteractionDef;
  personId: Id;
  /** Multiplies gains: diminishing returns, and a gift's warmth. */
  factor: number;
  pending: PendingInteraction;
}

const cast = (personId: Id) => ({ [INTERACTION_ROLE]: personId });

function counters(rel: { interactions?: InteractionCounters }, year: number): InteractionCounters {
  if (!rel.interactions || rel.interactions.year !== year) {
    rel.interactions = { year, counts: {}, gained: { affection: 0, trust: 0 }, annoyed: false };
  }
  return rel.interactions;
}

/** Your own stat gains shrink with repeats too (a hug that cheers you up less each time); losses don't. */
function scaleEffects(effects: readonly Effect[], factor: number): Effect[] {
  return effects.flatMap((e): Effect[] => {
    // E2a: parenting gains (a warm or involved moment) shrink with repeats too; losses don't.
    if (e.type === 'parenting') {
      const scale = (v: number | undefined) => (v !== undefined && v > 0 ? Math.round(v * factor) : v);
      const next = { ...e, ...(e.warmth !== undefined ? { warmth: scale(e.warmth) } : {}), ...(e.strictness !== undefined ? { strictness: scale(e.strictness) } : {}), ...(e.involvement !== undefined ? { involvement: scale(e.involvement) } : {}) };
      return next.warmth || next.strictness || next.involvement ? [next as Effect] : [];
    }
    if (e.type !== 'stat') return [e];
    const gain = e.key === 'stress' ? e.delta < 0 : e.delta > 0;
    if (!gain) return [e];
    const delta = Math.round(e.delta * factor);
    return delta === 0 ? [] : [{ ...e, delta }];
  });
}

/** Applies one tier's (or choice option's) consequences and records what changed on the card. */
function applyConsequence(draft: Draft<LifeState>, moment: Moment, c: Consequence, content: ContentBundle): void {
  const { def, personId, factor, pending } = moment;
  const rel = draft.relationships[personId]!;
  const person = draft.people[personId]!;
  const year = draft.currentYear;
  const cap = content.balance.interactions.returns.yearlyCap;
  const count = counters(rel, year);
  const before = { affection: rel.affection, trust: rel.trust, mood: person.mood };

  const returns = content.balance.interactions.returns;
  const gain = (delta: number, level = 0) => (delta > 0 ? Math.round(delta * factor * (level > 0 ? curveAt(returns.byLevel, level) : 1)) : delta);
  let affection = gain(c.affection, rel.affection);
  let trust = gain(c.trust, rel.trust);
  if (affection > 0) {
    affection = Math.max(0, Math.min(affection, cap.affection - count.gained.affection));
    count.gained.affection += affection;
  }
  if (trust > 0) {
    trust = Math.max(0, Math.min(trust, cap.trust - count.gained.trust));
    count.gained.trust += trust;
  }
  rel.affection = clampInt(rel.affection + affection, 0, 100);
  rel.trust = clampInt(rel.trust + trust, 0, 100);
  shiftMood(person, gain(c.mood));

  const effectCtx = { def: { id: def.id, rarity: 'common' as const }, cast: cast(personId), rng: draft.rng, content };
  applyEffects(draft, scaleEffects(c.effects as Effect[], factor), effectCtx);
  const textCtx = () => textContext(draft, cast(personId), content);
  for (const extra of c.extras) {
    if (extra.if && !evaluate(extra.if, draft, { cast: cast(personId), roles: 'strict', content })) continue;
    if (extra.chance && !chance(draft.rng, extraChance(draft, extra.chance, personId, content))) continue;
    applyEffects(draft, extra.effects as Effect[], effectCtx);
    if (extra.note) pending.notes.push(renderText(extra.note, textCtx()));
  }

  pending.changes.affection += rel.affection - before.affection;
  pending.changes.trust += rel.trust - before.trust;
  pending.changes.mood += person.mood - before.mood;
}

/** What your money did since the snapshot, for the card: undefined when nothing changed. */
function moneyChange(draft: LifeState, savings: number, debt: number): MoneyChange | undefined {
  const change = draft.finances.savings - savings;
  const debtChange = totalDebt(draft) - debt;
  return change === 0 && debtChange === 0 ? undefined : { change, balance: draft.finances.savings, debtChange };
}

/** Folds a later money change into the card's (a choice's), keeping the first one's starting point. */
function addMoney(pending: PendingInteraction, now: MoneyChange | undefined): void {
  if (!now) return;
  pending.money = pending.money
    ? { change: pending.money.change + now.change, balance: now.balance, debtChange: pending.money.debtChange + now.debtChange }
    : now;
}

/**
 * Does an interaction with a person: the Interact sheet's one action.
 * Records the input, rolls the tier from the person's reaction, applies it,
 * and leaves the outcome card in `pendingInteraction`. Throws PhaseError
 * outside 'yearStart' and InvalidInputError for bad params, an interaction
 * that isn't available with this person now, a gift without a price tier (or
 * one you can't pay for), or a moment still waiting for your choice.
 */
export function performInteraction(state: LifeState, params: unknown, content: ContentBundle): LifeState {
  if (state.phase !== 'yearStart') throw new PhaseError(`Can't interact in the "${state.phase}" phase (expected "yearStart").`);
  const p = parseInteractParams(params);
  const def = content.interactions[p.interactionId];
  const bad = (message: string) => new InvalidInputError([{ path: 'interaction', message }]);
  if (!def || def.retired) throw bad(`Unknown interaction "${p.interactionId}".`);
  if (state.pendingInteraction?.choice && state.pendingInteraction.choice.chosen === undefined) throw bad('Finish the moment first: it is waiting for a choice.');
  if (!isInteractionAvailable(state, def, p.personId, content)) throw bad(`"${def.id}" isn't available with "${p.personId}" now.`);
  if ((def.gift === true) !== (p.giftTier !== undefined)) throw bad(def.gift ? 'A gift needs a price tier.' : `"${def.id}" takes no gift tier.`);
  if (p.giftTier && !canAffordGift(state, p.giftTier, content)) throw bad('You can’t afford that gift.');

  return produce(state, (draft) => {
    draft.rng = cloneRng(state.rng);
    const year = draft.currentYear;
    draft.inputLog.push({ year, kind: 'interact', payload: { interactionId: p.interactionId, personId: p.personId, ...(p.giftTier ? { giftTier: p.giftTier } : {}) } });
    const rel = draft.relationships[p.personId]!;
    const person = draft.people[p.personId]!;
    const savings = draft.finances.savings;
    const debt = totalDebt(draft);

    const repeats: Repeats = repeatsThisYear(state, state.relationships[p.personId]!, def.id);
    const balance = content.balance.interactions;
    const profile = balance.profiles[def.profile]!;
    const score = reactionScore(state, def, state.relationships[p.personId]!, state.people[p.personId]!, repeats, p.giftTier, content);
    const tier: OutcomeTier = availableTier(def, rollTier(draft.rng, score, content));
    const outcome = def.outcomes[tier]!;

    // A gift costs real money: savings first, then (a little) debt, through the finance module.
    if (p.giftTier) spend(draft, giftPrice(state, p.giftTier, content), content);

    const count = counters(rel, year);
    count.counts[def.id] = (count.counts[def.id] ?? 0) + 1;
    if (tier === 'bad' || tier === 'backfire' || repeats.same + 1 >= balance.reaction.annoyedAfter) count.annoyed = true;

    let factor = returnsFactor(repeats, content);
    if (p.giftTier) factor *= balance.gifts.tiers[p.giftTier].warmth * balance.gifts.wealthValue[person.wealthLevel];

    const variant = outcome.text[nextInt(draft.rng, 0, outcome.text.length - 1)]!;
    const pending: PendingInteraction = {
      interactionId: def.id,
      personId: p.personId,
      tier,
      ...(p.giftTier ? { giftTier: p.giftTier } : {}),
      text: '',
      notes: [],
      changes: { affection: 0, trust: 0, mood: 0 },
      annoyed: false,
    };
    const moment: Moment = { def, personId: p.personId, factor, pending };
    applyConsequence(draft, moment, outcome, content);
    // Asking again and again costs trust, whatever came of it.
    if (profile.repeatTrust > 0 && repeats.same > 0) {
      const lost = Math.min(rel.trust, Math.round(profile.repeatTrust * repeats.same));
      rel.trust -= lost;
      pending.changes.trust -= lost;
    }
    pending.text = renderText(variant, textContext(draft, cast(p.personId), content));
    pending.annoyed = count.annoyed;
    const money = moneyChange(draft, savings, debt);
    if (money) pending.money = money;
    if (outcome.choice) {
      const ctx = textContext(draft, cast(p.personId), content);
      pending.choice = {
        prompt: renderText(outcome.choice.prompt, ctx),
        options: outcome.choice.options.map((o) => ({ id: o.id, label: renderText(o.label, ctx) })),
      };
    }
    draft.pendingInteraction = pending;
  });
}

/**
 * Answers the choice a moment opened (walk away or keep going): records the
 * input, applies the option's consequences (with the same diminishing
 * returns as the interaction) and adds its text to the card. Throws
 * PhaseError outside 'yearStart' and InvalidInputError without a waiting
 * choice or for an unknown option.
 */
export function resolveInteractionChoice(state: LifeState, choiceId: unknown, content: ContentBundle): LifeState {
  if (state.phase !== 'yearStart') throw new PhaseError(`Can't choose in the "${state.phase}" phase (expected "yearStart").`);
  const pending = state.pendingInteraction;
  const bad = (message: string) => new InvalidInputError([{ path: 'interaction.choice', message }]);
  if (!pending?.choice || pending.choice.chosen !== undefined) throw bad('No choice is waiting.');
  const def = content.interactions[pending.interactionId];
  const option: InteractionChoiceOption | undefined = def?.outcomes[pending.tier]?.choice?.options.find((o) => o.id === choiceId);
  if (!def || !option || typeof choiceId !== 'string') throw bad(`"${String(choiceId)}" isn't an option here.`);

  return produce(state, (draft) => {
    draft.rng = cloneRng(state.rng);
    draft.inputLog.push({ year: draft.currentYear, kind: 'interactChoice', payload: { choiceId } });
    const card = draft.pendingInteraction!;
    const savings = draft.finances.savings;
    const debt = totalDebt(draft);
    // The choice is part of the same moment: the repeats before it count, not itself.
    const rel = draft.relationships[pending.personId]!;
    const now = rel.interactions!;
    const repeats: Repeats = { same: (now.counts[def.id] ?? 1) - 1, total: Object.values(now.counts).reduce((sum, n) => sum + n, 0) - 1 };
    const factor = returnsFactor(repeats, content);
    const moment: Moment = { def, personId: pending.personId, factor, pending: card };
    applyConsequence(draft, moment, option, content);
    card.choice!.chosen = choiceId;
    card.choice!.result = renderText(option.text, textContext(draft, cast(pending.personId), content));
    card.annoyed = now.annoyed;
    addMoney(card, moneyChange(draft, savings, debt));
  });
}

/**
 * Closes the outcome card. An intimate night that began an unplanned
 * pregnancy then opens its decision event (keep it, place the baby for
 * adoption, or end it), moving to the 'action' phase like a management
 * action's result. Throws InvalidInputError when there is no card, or its
 * choice is still waiting.
 */
export function closeInteraction(state: LifeState, content: ContentBundle): LifeState {
  const pending = state.pendingInteraction;
  const bad = (message: string) => new InvalidInputError([{ path: 'interaction', message }]);
  if (!pending) throw bad('No outcome card is open.');
  if (pending.choice && pending.choice.chosen === undefined) throw bad('The moment is waiting for a choice.');
  return produce(state, (draft) => {
    draft.rng = cloneRng(state.rng);
    draft.inputLog.push({ year: draft.currentYear, kind: 'interactClose', payload: {} });
    draft.pendingInteraction = null;
    const pregnancy = draft.family.pregnancy;
    if (pregnancy?.decision === 'pending') {
      const cast: Record<Id, Id> = pregnancy.otherParentId !== undefined ? { other: pregnancy.otherParentId } : {};
      const options = fittingResults(draft, content.registries.family.decision, cast, content);
      // The decision always has an event (the content build checks); without one the pregnancy simply goes on.
      if (options.length > 0) queueResult(draft, options, cast);
      else pregnancy.decision = 'keep';
    }
  });
}
