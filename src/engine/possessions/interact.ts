/**
 * Pet interactions (E5), part of the E1 menu: play, a walk, a treat,
 * training. Each is content (src/content/petInteractions) with five outcome
 * tiers; the roll uses the pet's personality, its bond with you and its
 * health (balance/possessions.yaml pets.interaction), with the same tier
 * thresholds as the people interactions. Repeats give less each year, and
 * a pet can get fed up. The outcome is the same card as any interaction
 * (`pendingInteraction`, with `pet: true` and the pet's id as `personId`).
 */
import { produce } from 'immer';
import { POSSESSION_ROLES, type ContentBundle, type Effect, type OutcomeTier, type PetInteractionDef } from '../../content/schemas';
import { InvalidInputError } from '../creation/input';
import { applyEffects } from '../events/effects';
import { textContext } from '../events/text';
import { totalDebt } from '../finance';
import { powInt } from '../curve';
import { PhaseError } from '../life';
import { clampInt } from '../random';
import { cloneRng, nextInt } from '../rng';
import { rollTier } from '../interactions/reaction';
import { renderText } from '../text';
import type { Id, LifeState, PendingInteraction, Possession } from '../types';
import { petOf, possessionById } from './query';

/** The pet interactions in the content, active ones, in id order. */
export function activePetInteractions(content: ContentBundle): PetInteractionDef[] {
  return Object.keys(content.petInteractions)
    .sort()
    .map((id) => content.petInteractions[id]!)
    .filter((def) => !def.retired);
}

/** You can spend time with this pet now: between years, it is alive, and you're not in prison. */
export function canInteractWithPet(state: LifeState, petId: Id): boolean {
  const p = possessionById(state, petId);
  return state.phase === 'yearStart' && p?.kind === 'pet' && petOf(p).died === undefined && state.housing.kind !== 'incarcerated';
}

/** The pet interactions you can do with this pet now (all of them while you can spend time with it). */
export function petInteractionMenu(state: LifeState, petId: Id, content: ContentBundle): PetInteractionDef[] {
  return canInteractWithPet(state, petId) ? activePetInteractions(content) : [];
}

function counters(p: Possession, year: number) {
  const pet = petOf(p);
  if (!pet.interactions || pet.interactions.year !== year) pet.interactions = { year, counts: {}, gained: 0, annoyed: false };
  return pet.interactions;
}

/** The interaction's pull before the roll: its profile, the pet's personality, bond and health, minus points for repeats this year. */
export function petReactionScore(def: PetInteractionDef, p: Possession, same: number, total: number, content: ContentBundle): number {
  const b = content.balance.possessions.pets.interaction;
  const profile = b.profiles[def.profile];
  if (!profile) throw new Error(`Pet interaction "${def.id}" uses an unknown profile "${def.profile}".`);
  const pet = petOf(p);
  return profile.base + b.bondWeight * (pet.bond - 50) + b.healthWeight * (p.condition - 50) + profile.personality[pet.personality] - profile.repeat.same * same - profile.repeat.total * total;
}

/** Whether a payload is a pet interaction's (it names a pet, not a person). */
export function isPetInteractionInput(params: unknown): params is { interactionId: string; petId: string } {
  return typeof params === 'object' && params !== null && typeof (params as { petId?: unknown }).petId === 'string';
}

/** Does a pet interaction: records the input, rolls the pet's reaction and leaves the outcome card. */
export function performPetInteraction(state: LifeState, params: unknown, content: ContentBundle): LifeState {
  if (state.phase !== 'yearStart') throw new PhaseError(`Can't interact in the "${state.phase}" phase (expected "yearStart").`);
  const bad = (message: string) => new InvalidInputError([{ path: 'interaction', message }]);
  const p = params as { interactionId?: unknown; petId?: unknown };
  const keys = Object.keys(params as object);
  if (typeof p.interactionId !== 'string' || typeof p.petId !== 'string' || keys.some((k) => k !== 'interactionId' && k !== 'petId')) throw bad('A pet interaction needs an interactionId and a petId.');
  const def = content.petInteractions[p.interactionId];
  if (!def || def.retired) throw bad(`Unknown pet interaction "${p.interactionId}".`);
  if (state.pendingInteraction?.choice && state.pendingInteraction.choice.chosen === undefined) throw bad('Finish the moment first: it is waiting for a choice.');
  if (!canInteractWithPet(state, p.petId)) throw bad(`"${p.petId}" isn't a pet you can spend time with now.`);
  const petId = p.petId;

  return produce(state, (draft) => {
    draft.rng = cloneRng(state.rng);
    const year = draft.currentYear;
    draft.inputLog.push({ year, kind: 'interact', payload: { interactionId: def.id, petId } });
    const pet = possessionById(draft, petId)!;
    const savings = draft.finances.savings;
    const debt = totalDebt(draft);
    const b = content.balance.possessions.pets.interaction;
    const before = petOf(state.possessions.items.find((q) => q.id === petId)!).interactions;
    const same = before && before.year === year ? (before.counts[def.id] ?? 0) : 0;
    const total = before && before.year === year ? Object.values(before.counts).reduce((s, n) => s + n, 0) : 0;
    const score = petReactionScore(def, state.possessions.items.find((q) => q.id === petId)!, same, total, content);
    const rolled = rollTier(draft.rng, score, content);
    // A missing great counts as good and a missing backfire as bad.
    const tier: OutcomeTier = def.outcomes[rolled] ? rolled : rolled === 'great' ? 'good' : 'bad';
    const outcome = def.outcomes[tier]!;

    const count = counters(pet, year);
    count.counts[def.id] = (count.counts[def.id] ?? 0) + 1;
    if (tier === 'bad' || tier === 'backfire' || same + 1 >= b.annoyedAfter) count.annoyed = true;
    const factor = powInt(b.returnsSame, same) * powInt(b.returnsTotal, total);

    const bondBefore = petOf(pet).bond;
    let bond = outcome.bond > 0 ? Math.round(outcome.bond * factor) : outcome.bond;
    if (bond > 0) {
      bond = Math.max(0, Math.min(bond, content.balance.possessions.pets.bond.yearlyCap - count.gained));
      count.gained += bond;
    }
    petOf(pet).bond = clampInt(petOf(pet).bond + bond, 0, 100);
    pet.condition = clampInt(pet.condition + (outcome.health > 0 ? Math.round(outcome.health * factor) : outcome.health), 0, 100);

    const cast = { [POSSESSION_ROLES.pet]: petId };
    const scaled = outcome.effects.flatMap((e): Effect[] => {
      if (e.type !== 'stat') return [e];
      const gain = e.key === 'stress' ? e.delta < 0 : e.delta > 0;
      if (!gain) return [e];
      const delta = Math.round(e.delta * factor);
      return delta === 0 ? [] : [{ ...e, delta }];
    });
    applyEffects(draft, scaled, { def: { id: def.id, rarity: 'common' }, cast, rng: draft.rng, content });
    const variant = outcome.text[nextInt(draft.rng, 0, outcome.text.length - 1)]!;
    const change = draft.finances.savings - savings;
    const debtChange = totalDebt(draft) - debt;
    const card: PendingInteraction = {
      interactionId: def.id,
      personId: petId,
      pet: true,
      tier,
      text: renderText(variant, textContext(draft, cast, content)),
      notes: [],
      changes: { affection: petOf(pet).bond - bondBefore, trust: 0, mood: 0 },
      annoyed: count.annoyed,
      ...(change !== 0 || debtChange !== 0 ? { money: { change, balance: draft.finances.savings, debtChange } } : {}),
    };
    draft.pendingInteraction = card;
  });
}
