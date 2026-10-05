/**
 * What the UI needs about interactions (E1), read through selectors: the
 * grouped menu of interactions available with a person (gifts with their
 * price tiers), and the outcome card.
 */
import type { ContentBundle, GiftTier, InteractionGroup, OutcomeTier } from '../../content/schemas';
import { GIFT_TIERS } from '../../content/schemas';
import type { Id, LifeState, MoneyChange } from '../types';
import { availableInteractions, groupInteractions } from './availability';
import { canAffordGift, giftPrice } from './links';

export interface InteractionMenuItem {
  id: Id;
  name: string;
  blurb: string;
  /** A gift: its price tiers, with whether you can pay. */
  gift?: { tier: GiftTier; price: number; affordable: boolean }[];
  /** E4: needs a choice first: another person to introduce them to, or a story they have heard (distorted ones, or secrets). */
  pick?: 'other' | 'distorted' | 'secret';
}

export interface InteractionMenuGroup {
  group: InteractionGroup;
  items: InteractionMenuItem[];
}

/** The interactions available with this person now, by group; nothing for someone you can't interact with. */
export function getInteractionMenu(state: LifeState, personId: Id, content: ContentBundle): InteractionMenuGroup[] {
  return groupInteractions(availableInteractions(state, personId, content)).map(({ group, defs }) => ({
    group,
    items: defs.map((def) => ({
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      ...(def.other ? { pick: 'other' as const } : def.topic ? { pick: def.topic } : {}),
      ...(def.gift
        ? { gift: GIFT_TIERS.map((tier) => ({ tier, price: giftPrice(state, tier, content), affordable: canAffordGift(state, tier, content) })) }
        : {}),
    })),
  }));
}

export interface InteractionOutcomeView {
  interactionName: string;
  /** The person's first name, for headings. */
  personName: string;
  personId: Id;
  tier: OutcomeTier;
  giftTier?: GiftTier;
  text: string;
  notes: string[];
  changes: { affection: number; trust: number; mood: number };
  annoyed: boolean;
  money?: MoneyChange;
  choice?: { prompt: string; options: { id: Id; label: string }[]; chosen?: Id; result?: string };
}

/** The outcome card waiting in the life, or null. */
export function getInteractionOutcome(state: LifeState, content: ContentBundle): InteractionOutcomeView | null {
  const p = state.pendingInteraction;
  if (!p) return null;
  const def = content.interactions[p.interactionId];
  const person = state.people[p.personId];
  return {
    interactionName: def?.name ?? p.interactionId,
    personName: person?.name.first ?? '',
    personId: p.personId,
    tier: p.tier,
    ...(p.giftTier ? { giftTier: p.giftTier } : {}),
    text: p.text,
    notes: p.notes,
    changes: p.changes,
    annoyed: p.annoyed,
    ...(p.money ? { money: p.money } : {}),
    ...(p.choice ? { choice: p.choice } : {}),
  };
}
