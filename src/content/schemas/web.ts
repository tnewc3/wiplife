/**
 * The social web (E4, docs/expansion.md): the balance numbers
 * (src/content/balance/web.yaml) for ties between the people you know, feuds,
 * gossip and what people make of it, and the registry
 * (registries/web.yaml) of the events that follow a change in the web and of
 * the kinds of knowledge that spread: each with the versions of its story,
 * how a version can twist into another, and how someone takes it.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { idSchema } from './common';
import { RELATIONSHIP_KINDS } from './relationships';
import { templateSchema } from './text';

const probability = z.number().min(0).max(1);
const score = z.int().min(0).max(100);

/** How two people you know are connected. */
export const TIE_KINDS = ['married', 'dating', 'siblings', 'parentChild', 'inLaw', 'friends'] as const;
export const tieKindSchema = z.enum(TIE_KINDS);
export type TieKindId = z.infer<typeof tieKindSchema>;

/** How a tie reads: close, normal, strained, or feuding (a feud is its own state). */
export const TIE_STATUSES = ['close', 'normal', 'strained', 'feuding'] as const;
export const tieStatusSchema = z.enum(TIE_STATUSES);
export type TieStatusId = z.infer<typeof tieStatusSchema>;

/** How a tie begins. */
export const TIE_ORIGINS = ['family', 'partner', 'context', 'introduced'] as const;
export const tieOriginSchema = z.enum(TIE_ORIGINS);

/**
 * The kinds of knowledge that spread (the engine knows how to notice each; the
 * registry says what each one is like). The first six (through mentalHealth, M1) are secrets.
 */
export const KNOWLEDGE_KINDS = ['affair', 'unknownCrime', 'hiddenDebt', 'addiction', 'identity', 'mentalHealth', 'jobLoss', 'arrest', 'breakup', 'illness'] as const;
export const knowledgeKindSchema = z.enum(KNOWLEDGE_KINDS);
export type KnowledgeKindId = z.infer<typeof knowledgeKindSchema>;
export const SECRET_KINDS: readonly KnowledgeKindId[] = ['affair', 'unknownCrime', 'hiddenDebt', 'addiction', 'identity', 'mentalHealth'];

/** What a change in the web can lead to: an event that involves you. */
export const WEB_TRIGGERS = [
  'feudBegan',
  'feudLong',
  'feudEnded',
  'tieStrained',
  'tieClose',
  'partnerMet',
  'coupleFormed',
  'coupleWed',
  'introducedWell',
  'introducedBadly',
  'introducedCouple',
  'betrayed',
  'public',
] as const;
export type WebTrigger = (typeof WEB_TRIGGERS)[number];
export const webTriggerSchema = z.enum(WEB_TRIGGERS);

const perTieKind = <T extends z.ZodType>(value: T) =>
  z.strictObject(Object.fromEntries(TIE_KINDS.map((k) => [k, value])) as Record<TieKindId, T>);

const startSchema = z.strictObject({ mean: score, sd: z.number().min(0).max(40) });

/** The social web: ties, feuds, gossip and reactions (src/content/balance/web.yaml). */
export const webBalanceSchema = z.strictObject({
  ties: z.strictObject({
    /** Affection a new tie starts at, by kind: a roll around the mean. */
    start: perTieKind(startSchema),
    /** Rivalries and feuds from an introduction start here. */
    introduced: z.strictObject({ friends: startSchema, rivalry: startSchema, feud: startSchema, romance: startSchema }),
    drift: z.strictObject({
      /** Where each kind settles on its own. */
      means: perTieKind(score),
      /** The share of the gap to that mean closed each year. */
      pull: z.number().min(0).max(1),
      /** A yearly wobble (standard deviation, in points). */
      sd: z.number().min(0).max(30),
      /** Points per point of fit between two people's Kindness (the mean rises for kind pairs, falls for unkind ones). */
      kindness: z.number().min(0).max(1),
      /** Points per point of difference in Sociability or Discipline (unlike people grate). */
      unlike: z.number().min(0).max(1),
    }),
    /** A sudden falling-out (or making up) now and then. */
    shock: z.strictObject({
      chance: probability,
      /** Share of shocks that are for the worse. */
      worse: probability,
      fall: z.strictObject({ min: z.int().min(1).max(60), max: z.int().min(1).max(60) }),
      rise: z.strictObject({ min: z.int().min(1).max(60), max: z.int().min(1).max(60) }),
    }),
    /** Status bands: at or above `close` is close; below `strained` is strained; in between, normal. */
    status: z.strictObject({ close: score, strained: score }),
    /** The most ties one person has. */
    maxPerPerson: z.int().min(2).max(30),
    /** Minors are only tied to minors, within this many years of each other (adults are tied to adults). */
    minorAgeGap: z.int().min(0).max(30),
    /** When your partner meets your people: yearly chances, once they have been together for `afterYears`. */
    meet: z.strictObject({
      afterYears: z.int().min(0).max(10),
      inLaw: probability,
      friends: probability,
      /** Multiplies the chance for an engaged or married partner. */
      committed: z.number().min(1).max(5),
      /** A partner who lives with you meets everyone at once. */
      household: z.number().min(1).max(5),
    }),
    /** Friends who share a city: a few pairs are drawn each year. */
    context: z.strictObject({
      draws: z.int().min(0).max(30),
      chance: probability,
      maxPerYear: z.int().min(0).max(10),
      /** A drawn pair of single, unrelated adults who are attracted to each other becomes a couple with this chance. */
      romance: probability,
    }),
    couple: z.strictObject({
      /** Yearly chance a couple who have been dating at least `afterYears` marry. */
      marry: probability,
      afterYears: z.int().min(0).max(10),
      /** Yearly chance a dating couple split (their tie drops), by years together. */
      breakup: curveSchema,
      /** The affection a couple who split lose. */
      breakupDrop: z.int().min(0).max(100),
      /** A couple formed by chance are at most this many years apart. */
      maxAgeGap: z.int().min(0).max(60),
    }),
  }),
  feud: z.strictObject({
    /** A tie that falls below this becomes a feud (not in the year it began). */
    start: score,
    /** A feuding tie that climbs to this ends its feud. */
    end: score,
    /** Time heals: the yearly chance, and by how much. */
    heal: z.strictObject({ chance: probability, min: z.int().min(0).max(30), max: z.int().min(0).max(30) }),
    /** Your affection lost with each side, each year you stay neutral. */
    neutralCost: z.int().min(0).max(20),
    /** Years of feuding before a mediation event can come. */
    mediateAfter: z.int().min(1).max(20),
    /** The chance a new feud leads to a side-taking event, and that a long one leads to a mediation. */
    sideChance: probability,
    mediateChance: probability,
    /** Where a tie sits when its feud ends. */
    endAffection: score,
  }),
  /** Events from the web: at most this many a year (they count toward the pacing budget, like requests). */
  events: z.strictObject({
    maxPerYear: z.int().min(0).max(6),
    /** Chance a tie that turned strained leads to an event. */
    strainedChance: probability,
    closeChance: probability,
    /** Chance a new tie (a partner meeting your people, a couple) leads to an event. */
    formedChance: probability,
    /** Years after an introduction before its follow-up looks at how it went. */
    introFollowYears: z.int().min(1).max(10),
    introChance: probability,
    /** Years between events about the same tie. */
    tieCooldownYears: z.int().min(0).max(20),
    /** You must be at least this old for the web to reach you. */
    minAge: z.int().min(0).max(30),
  }),
  knowledge: z.strictObject({
    /** The most items kept at once; the oldest closed ones go first. */
    maxItems: z.int().min(2).max(60),
    /** The most new items a year (the rest wait). */
    newPerYear: z.int().min(1).max(10),
    /** How many noticed facts are remembered, so each becomes an item once. */
    remember: z.int().min(10).max(1000),
    /** Years before an item fades from what people talk about. */
    expireYears: z.strictObject({ secret: z.int().min(1).max(80), rumor: z.int().min(1).max(40) }),
    spread: z.strictObject({
      /** Yearly chance a holder tells one person they're connected to, before the weights below. */
      base: probability,
      /** By how the tie reads. */
      closeness: z.strictObject({ close: z.number().min(0).max(5), normal: z.number().min(0).max(5), strained: z.number().min(0).max(5), feuding: z.number().min(0).max(5) }),
      /** How much gossip tendency counts: 0 ignores it; 1 scales the chance by tendency / 50. */
      gossip: z.number().min(0).max(2),
      /** Secrets spread at this share of the rate of other news. */
      secret: probability,
      /** Someone who is fond of you and trusts you tells less about you: the share their trust and affection take off (at 100). */
      loyalty: probability,
      /** A holder you asked to keep it quiet spreads at this share of the rate, for `hushYears`. */
      hushed: probability,
      hushYears: z.int().min(0).max(30),
      /** The most people one holder tells in a year. */
      perHolder: z.int().min(1).max(6),
    }),
    /** The chance a story changes each time it is passed on (before the version's own twists). */
    twist: z.strictObject({ chance: probability, secret: probability }),
    /** What seeing or hearing something first-hand needs: debts and addictions this bad become secrets. */
    detect: z.strictObject({
      hiddenDebt: z.int().min(0).max(1_000_000),
      /** Years before another hidden debt is noticed. */
      debtRepeatYears: z.int().min(1).max(50),
      addictionSeverity: z.int().min(1).max(100),
      illnessSeverity: z.int().min(1).max(100),
    }),
    reaction: z.strictObject({
      /** How much a version's feelings count, by what the person is to you; kinds not listed count as 1. */
      scale: z.partialRecord(z.enum(RELATIONSHIP_KINDS), z.number().min(0).max(4)),
      /** How much they count for something about someone else (it moves the tie between them). */
      aboutOthers: z.number().min(0).max(2),
      /** The most reactions that become events in a year, and the chance a reaction does. */
      maxEvents: z.int().min(0).max(6),
      eventChance: probability,
      /** A secret held by this share of your circle (and at least `publicMin` people) has become common knowledge. */
      publicShare: probability,
      publicMin: z.int().min(2).max(30),
    }),
  }),
});
export type WebBalance = z.infer<typeof webBalanceSchema>;

/** How one version of a story reads, twists and lands. */
export const versionSchema = z.strictObject({
  /** What someone has heard about you, after "has heard": "that you were fired for stealing". `{self.name}` and (for an affair or a breakup) `{other.name}` work. */
  heard: templateSchema,
  /** The same about someone else, in the third person: "that {about.name} was fired for stealing". Needed for the kinds that can be about other people (the ones that aren't secrets). */
  heardAbout: templateSchema.optional(),
  /** The versions this one can turn into when it is passed on, by weight. */
  twists: z.array(z.strictObject({ to: idSchema, weight: z.number().positive() })).default([]),
  /** How someone feels on first hearing it: points on their affection and trust for the person it is about (about someone else, for the tie), scaled by what they are to you. */
  affection: z.int().min(-40).max(20).default(0),
  trust: z.int().min(-40).max(20).default(0),
  /** A light version is funny; the rest are serious. */
  light: z.literal(true).optional(),
});
export type VersionDef = z.infer<typeof versionSchema>;

/** One kind of knowledge. */
export const knowledgeKindDefSchema = z.strictObject({
  /** A secret starts known only to who saw it; other news starts with who it happened to. */
  secret: z.boolean(),
  /** Who knows it at first, and how likely (see src/engine/web/knowledge.ts). */
  witness: z.strictObject({
    who: z.enum(['other', 'household', 'closest', 'random']),
    chance: probability,
    count: z.int().min(1).max(4).default(1),
  }),
  /**
   * What the engine looks for to know it happened: `memory` (a tag on a
   * person: an affair), `flags` (things you did that nobody is known to have
   * seen, with the flag that says it came out instead, `unless`).
   */
  sources: z
    .strictObject({
      memory: idSchema.optional(),
      flags: z.array(idSchema).default([]),
      unless: z.record(idSchema, idSchema).default({}),
    })
    .default({ flags: [], unless: {} }),
  /** The versions that can be true, and the rest (the twisted ones). The engine picks the true one by what happened; the first is the default. */
  truths: z.array(idSchema).min(1),
  versions: z.record(idSchema, versionSchema),
  /** Events queued when someone learns it from another person, one picked by weight among those that fit. */
  reactions: z.array(idSchema).min(1),
});
export type KnowledgeKindDef = z.infer<typeof knowledgeKindDefSchema>;

/**
 * The events a change in the web can lead to (registries/web.yaml), and the
 * kinds of knowledge. A tie's event casts its two people as `a` and `b` (in
 * whichever order the event's requirements accept); a reaction casts the
 * person who heard as `npc`.
 */
export const webRegistrySchema = z.strictObject({
  /** When several things happen in a year, the most pressing trigger goes first; every trigger exactly once. */
  priority: z
    .array(webTriggerSchema)
    .refine((list) => new Set(list).size === WEB_TRIGGERS.length && list.length === WEB_TRIGGERS.length, 'list every trigger exactly once'),
  triggers: z.strictObject(
    Object.fromEntries(WEB_TRIGGERS.map((t) => [t, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      WebTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
  kinds: z.strictObject(Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, knowledgeKindDefSchema])) as Record<KnowledgeKindId, typeof knowledgeKindDefSchema>),
});
export type WebRegistry = z.infer<typeof webRegistrySchema>;
