/**
 * Self-discovery (docs/design.md, section F; docs/technical.md, Stage 9): the
 * balance numbers for surfacing, resurfacing and inner conflict
 * (src/content/balance/discovery.yaml), the events the self-discovery step
 * queues (src/content/registries/discovery.yaml) and the words its event
 * text uses (src/content/text/discovery.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { DISCOVERY_KINDS, idSchema, LATENT_KINDS, TRAIT_KEYS, type DiscoveryKind, type LatentKind } from './common';

const share = z.number().min(0).max(1);
const surfacingSchema = z.strictObject({
  /** Nothing surfaces before this age (questions of self-understanding come from the teen years). */
  minAge: z.int().min(0).max(120),
  /** Yearly chance by age that a latent trait you haven't noticed yet comes to the surface. */
  chance: curveSchema,
});

/** Self-discovery numbers (src/content/balance/discovery.yaml). */
export const discoveryBalanceSchema = z.strictObject({
  surfacing: z.strictObject(
    Object.fromEntries(DISCOVERY_KINDS.map((k) => [k, surfacingSchema])) as Record<DiscoveryKind, typeof surfacingSchema>,
  ),
  /** A trait you noticed and haven't accepted comes back. */
  resurfacing: z.strictObject({
    /** Years after it last surfaced before it can come back. */
    afterYears: z.int().min(1).max(50),
    /** Yearly chance it comes back, by inner conflict. */
    chance: curveSchema,
  }),
  /** At high inner conflict, a resurfacing can be a crisis instead (registries/discovery.yaml crisis). */
  crisis: z.strictObject({ minConflict: z.int().min(0).max(100), chance: share, cooldownYears: z.int().min(1).max(50) }),
  innerConflict: z.strictObject({
    /** Gained each year for each trait you know about and haven't accepted... */
    perYear: z.number().min(0).max(20),
    /** ...plus this for each time beyond the first it surfaced and you pushed it down. */
    perSuppression: z.number().min(0).max(20),
    /** Most gained in one year. */
    maxPerYear: z.number().min(0).max(50),
    /** Lost each year when you hold nothing back. */
    decay: z.number().min(0).max(20),
    /** Stress gained and Happiness lost each year, by inner conflict (fractions by chance), never past the limits. */
    stress: curveSchema,
    stressLimit: z.int().min(0).max(100),
    happiness: curveSchema,
    happinessLimit: z.int().min(0).max(100),
    /** Inner conflict lost when you accept a trait (an event or matching edit in the Profile sheet). */
    acceptRelief: z.int().min(0).max(100),
    /** Inner conflict lost when you edit your identity in the Profile sheet and it matches a latent trait. */
    editRelief: z.int().min(0).max(100),
  }),
  talent: z.strictObject({
    /** Job performance points (the review's aim) in a job that uses your discovered talent. */
    performanceBonus: z.number().min(0).max(50),
  }),
});
export type DiscoveryBalance = z.infer<typeof discoveryBalanceSchema>;

const eventsSchema = z.strictObject({ events: z.array(idSchema).min(1) });
const perKind = <K extends readonly string[]>(kinds: K) =>
  z.strictObject(Object.fromEntries(kinds.map((k) => [k, eventsSchema])) as Record<K[number], typeof eventsSchema>);

/**
 * The events the self-discovery step queues (registries/discovery.yaml):
 * a latent trait (or talent) coming to the surface for the first time, a
 * trait you pushed down coming back, a crisis when inner conflict runs high,
 * and coming out (after accepting a change, or editing your identity and
 * asking to tell people). Every event listed is followUpOnly.
 */
export const discoveryRegistrySchema = z.strictObject({
  surfacing: perKind(DISCOVERY_KINDS),
  resurfacing: perKind(LATENT_KINDS),
  crisis: eventsSchema,
  comingOut: eventsSchema,
});
export type DiscoveryRegistry = z.infer<typeof discoveryRegistrySchema>;

const phrase = z.string().trim().min(1).max(80);

/**
 * Words for self-discovery event text (text/discovery.yaml): the people a
 * latent attraction is to ({latentPeople}), and what a latent personality
 * tendency feels like ({latentTrait}: higher or lower than you've shown).
 */
export const discoveryTextSchema = z.strictObject({
  people: z.strictObject({ man: phrase, woman: phrase, nonbinary: phrase, nobody: phrase }),
  traits: z.strictObject(
    Object.fromEntries(TRAIT_KEYS.map((k) => [k, z.strictObject({ higher: phrase, lower: phrase })])) as Record<
      (typeof TRAIT_KEYS)[number],
      z.ZodObject<{ higher: typeof phrase; lower: typeof phrase }>
    >,
  ),
});
export type DiscoveryText = z.infer<typeof discoveryTextSchema>;

export type { DiscoveryKind, LatentKind };
