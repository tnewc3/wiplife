/** Interactions (E1, docs/expansion.md): the per-person menu. */
export { INTERACTION_ROLE, availableInteractions, isInteractionAvailable, activeInteractions } from './availability';
export { betray, canAffordGift, giftPrice, giveMoney, rollAskedAmount } from './links';
export { isClose, moodBand, moodBaseline, moodView, runMoods, shiftMood, type MoodBand, type MoodView } from './mood';
export { closeInteraction, parseInteractParams, performInteraction, resolveInteractionChoice, type InteractParams } from './perform';
export { reactionScore, repeatsThisYear, returnsFactor, rollTier, tierForScore, type Repeats } from './reaction';
export { getInteractionMenu, getInteractionOutcome, type InteractionMenuGroup, type InteractionMenuItem, type InteractionOutcomeView } from './views';
export { WEALTH_LEVELS, blendWealth, rollWealth, wealthFromSalary } from './wealth';
