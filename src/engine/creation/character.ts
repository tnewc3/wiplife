/** Rolls for a new character's identity, stats, hidden values and latent traits. */
import { GENDER_CATEGORIES, type ContentBundle, type GenderCategory } from '../../content/schemas';
import { chance, nextInt, pick, type RngState } from '../rng';
import { rollScore, sample, weightedKey, weightedPick } from '../random';
import type { Character, HiddenValues, Identity, Personality, PersonalityTrait, Pronouns, Stats } from '../types';

export const STAT_KEYS = ['health', 'happiness', 'smarts', 'looks', 'fitness', 'stress'] as const satisfies readonly (keyof Stats)[];
export const PERSONALITY_TRAITS = [
  'ambition',
  'confidence',
  'kindness',
  'riskTaking',
  'discipline',
  'sociability',
] as const satisfies readonly PersonalityTrait[];

/** Active entries of a content record, sorted by id so rolls never depend on file order. */
export function activeIds<T extends { retired?: boolean | undefined }>(record: Record<string, T>): string[] {
  return Object.keys(record)
    .filter((id) => !record[id]!.retired)
    .sort();
}

export function pronounsFromPreset(content: ContentBundle, presetId: string): Pronouns {
  const preset = content.pronouns[presetId];
  if (!preset) throw new Error(`Unknown pronoun preset "${presetId}"`);
  const { subject, object, possessive, possessivePronoun, reflexive, verbPlural } = preset;
  return { subject, object, possessive, possessivePronoun, reflexive, verbPlural };
}

export function rollPronouns(rng: RngState, content: ContentBundle, category: GenderCategory): Pronouns {
  return pronounsFromPreset(content, weightedKey(rng, content.balance.creation.pronouns[category]));
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Rolls who someone is attracted to; `mustInclude` forces a category (a partner's). */
export function rollAttraction(
  rng: RngState,
  content: ContentBundle,
  category: GenderCategory,
  mustInclude?: GenderCategory,
): GenderCategory[] {
  const options = content.balance.creation.attraction[category].filter(
    (o) => mustInclude === undefined || o.to.includes(mustInclude),
  );
  if (options.length === 0 || !options.some((o) => o.weight > 0)) return mustInclude ? [mustInclude] : [];
  return [...weightedPick(rng, options.map((o) => [o.to, o.weight] as const))];
}

export function rollGenderCategory(rng: RngState, content: ContentBundle): GenderCategory {
  return weightedKey(rng, content.balance.creation.genderCategory);
}

/** A full identity for a character or relative of the given category. */
export function rollIdentity(
  rng: RngState,
  content: ContentBundle,
  category: GenderCategory,
  mustBeAttractedTo?: GenderCategory,
): Identity {
  const options = content.character.identity.categories[category];
  return {
    genderIdentity: pick(rng, options.identities),
    genderCategory: category,
    genderExpression: options.defaultExpression,
    pronouns: rollPronouns(rng, content, category),
    attractedTo: rollAttraction(rng, content, category, mustBeAttractedTo),
  };
}

export function rollStats(rng: RngState, content: ContentBundle): Stats {
  const spreads = content.balance.creation.stats;
  const stats = {} as Stats;
  for (const key of STAT_KEYS) stats[key] = rollScore(rng, spreads[key]);
  return stats;
}

export function rollPersonality(rng: RngState, content: ContentBundle): Personality {
  const spread = content.balance.creation.personality;
  const personality = {} as Personality;
  for (const trait of PERSONALITY_TRAITS) personality[trait] = rollScore(rng, spread);
  return personality;
}

/** A few rolled traits for a relative (Person.traits is partial). */
export function rollRelativeTraits(rng: RngState, content: ContentBundle): Partial<Personality> {
  const { relativeTraitCount } = content.balance.creation.family;
  const traits: Partial<Personality> = {};
  for (const trait of sample(rng, PERSONALITY_TRAITS, relativeTraitCount)) {
    traits[trait] = rollScore(rng, content.balance.creation.personality);
  }
  return traits;
}

export function rollHidden(rng: RngState, content: ContentBundle): HiddenValues {
  const { hidden, talentChance } = content.balance.creation;
  const luck = rollScore(rng, hidden.luck);
  const reputation = rollScore(rng, hidden.reputation);
  const geneticRisk = rollScore(rng, hidden.geneticRisk);
  const vice = rollScore(rng, hidden.vice);
  const talents = activeIds(content.talents);
  const talent = chance(rng, talentChance) && talents.length > 0 ? pick(rng, talents) : null;
  const happinessBaseline = rollScore(rng, hidden.happinessBaseline);
  return { luck, reputation, geneticRisk, vice, innerConflict: 0, happinessBaseline, talent, talentDiscovered: false };
}

export function rollAppearance(rng: RngState, content: ContentBundle): string[] {
  const { groups, features } = content.character.appearance;
  const descriptors = groups.map((g) => pick(rng, g.options));
  if (chance(rng, content.balance.creation.appearance.featureChance)) descriptors.push(pick(rng, features));
  return descriptors;
}

/**
 * A custom character's appearance: the option the player chose for each group,
 * or a roll for any group left to chance ("Surprise me"), then any extras.
 */
export function completeAppearance(rng: RngState, content: ContentBundle, chosen: readonly string[]): string[] {
  const fromGroups = content.character.appearance.groups.map(
    (g) => chosen.find((d) => g.options.includes(d)) ?? pick(rng, g.options),
  );
  return [...fromGroups, ...chosen.filter((d) => !fromGroups.includes(d))];
}

/**
 * Rolls hidden traits that differ from how the character starts: another
 * orientation, gender, expression or personality tendency. Used for random
 * and custom characters alike, so any life can bring surprises.
 */
export function rollLatent(
  rng: RngState,
  content: ContentBundle,
  identity: Identity,
  personality: Personality,
): Character['latent'] {
  const { latent: chances } = content.balance.creation;
  const latentIdentity: Partial<Identity> = {};

  if (chance(rng, chances.orientationChance)) {
    const options = content.balance.creation.attraction[identity.genderCategory].filter(
      (o) => !sameSet(o.to, identity.attractedTo),
    );
    if (options.length > 0) {
      const weighted = options.some((o) => o.weight > 0) ? options : options.map((o) => ({ ...o, weight: 1 }));
      latentIdentity.attractedTo = [...weightedPick(rng, weighted.map((o) => [o.to, o.weight] as const))];
    }
  }

  if (chance(rng, chances.genderChance)) {
    const others = GENDER_CATEGORIES.filter((c) => c !== identity.genderCategory);
    const category = pick(rng, others);
    latentIdentity.genderCategory = category;
    latentIdentity.genderIdentity = pick(rng, content.character.identity.categories[category].identities);
  }

  if (chance(rng, chances.expressionChance)) {
    const others = content.character.identity.expressions.filter((e) => e !== identity.genderExpression);
    if (others.length > 0) latentIdentity.genderExpression = pick(rng, others);
  }

  const latent: Character['latent'] = {};
  if (Object.keys(latentIdentity).length > 0) latent.identity = latentIdentity;

  if (chance(rng, chances.personalityChance)) {
    const trait = pick(rng, PERSONALITY_TRAITS);
    const current = personality[trait];
    const shift = nextInt(rng, chances.personalityShift.min, chances.personalityShift.max);
    const canRise = current + shift <= 100;
    const canFall = current - shift >= 0;
    const rise = canRise && canFall ? chance(rng, 0.5) : canRise;
    const value = Math.min(100, Math.max(0, rise ? current + shift : current - shift));
    if (value !== current) latent.personality = { [trait]: value };
  }

  return latent;
}
