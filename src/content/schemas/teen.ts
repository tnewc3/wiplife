/**
 * The teen years (T1, docs/expansion.md): the crowds at a school
 * (src/content/cliques), teams and clubs (activities), teen jobs (teenJobs),
 * the rules parents set (houseRules), the balance numbers
 * (src/content/balance/teen.yaml), the events the teen step queues
 * (registries/teen.yaml) and the history lines it writes (text/teen.yaml).
 *
 * Nothing here is romantic: the teen years are friendship, rivalry, loyalty
 * and belonging, and the content build rejects romantic or sexual wording in
 * anything a teen can see (tools/content/teen.ts).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, dollarsSchema, idSchema, scoreSchema, STAT_KEYS, TRAIT_KEYS } from './common';
import { statEffectsSchema } from './economy';

const probability = z.number().min(0).max(1);
const nonneg = z.number().min(0).max(1000);
const range = z
  .strictObject({ min: z.int().min(0).max(100), max: z.int().min(0).max(100) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** Where a year's energy goes (the yearly focus). */
export const FOCUS_IDS = ['school', 'friends', 'work', 'passion'] as const;
export type TeenFocusId = (typeof FOCUS_IDS)[number];
export const focusIdSchema = z.enum(FOCUS_IDS);

/** A year with no focus chosen: an even one. */
export const FOCUS_KEYS = ['none', ...FOCUS_IDS] as const;

/** What a house rule is about; a rule's id is its domain. */
export const RULE_DOMAINS = ['curfew', 'chores', 'grades', 'screens', 'friends', 'parties', 'car', 'check_in', 'money'] as const;
export type RuleDomainId = (typeof RULE_DOMAINS)[number];
export const ruleDomainSchema = z.enum(RULE_DOMAINS);

/** What a parent does when they catch you. */
export const PUNISHMENTS = ['talking_to', 'grounded', 'privilege', 'chores'] as const;
export type PunishmentId = (typeof PUNISHMENTS)[number];

export const LICENSE_STAGE_IDS = ['none', 'permit', 'licensed'] as const;

const traitKey = z.enum(TRAIT_KEYS);
const statKey = z.enum(STAT_KEYS);
const traitWeights = z.partialRecord(traitKey, z.number().min(-1).max(1));

/**
 * A crowd at school (src/content/cliques). Names are made up and say nothing
 * about anyone's race, religion, background or money: a crowd is what its
 * members do together and how they treat each other.
 */
export const cliqueSchema = baseDefSchema.extend({
  /** As it reads in a sentence ("Back Bleacher", "The Lantern Crew"). */
  name: z.string().trim().min(2).max(30),
  blurb: z.string().trim().min(10).max(200),
  /** How common this crowd is among schools. */
  weight: z.number().positive().max(10),
  /** The personality its members lean toward (added to each member's traits, from 50). */
  traits: z.partialRecord(traitKey, z.int().min(-30).max(30)),
  /** What it looks for in a newcomer: each weight times how far your trait is from 50 (in fiftieths). */
  likes: traitWeights,
  /** How much the crowd counts at school (0–100). */
  standing: scoreSchema,
  /** Pulls on your stats each year you belong. */
  effects: statEffectsSchema,
  /** GPA points a year of belonging adds to (or takes from) your grade. */
  grades: z.number().min(-0.4).max(0.4),
  /** Affection points a year with each member, on top of what a focus gives. */
  friends: z.int().min(0).max(8),
  /** A multiplier on teen job pay (tips, leads, shifts picked up). */
  money: z.number().min(0.5).max(2),
  /** Passion points a year. */
  passion: z.int().min(0).max(10),
  /** A multiplier on the chance you break a house rule unprompted, and on trouble events that name this crowd. */
  trouble: z.number().min(0).max(3),
});
export type CliqueDef = z.infer<typeof cliqueSchema>;

/** A team or a club (src/content/activities). */
export const activitySchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  kind: z.enum(['team', 'club']),
  blurb: z.string().trim().min(10).max(200),
  minAge: z.int().min(10).max(17),
  /** Teams cut people: the chance of making it is `base` plus each stat's weight times its distance from 50. Clubs take everyone. */
  tryout: z
    .strictObject({
      base: z.number().min(0).max(100),
      stats: z.array(z.strictObject({ key: z.union([statKey, traitKey]), weight: z.number().min(-2).max(2) })).min(1),
    })
    .optional(),
  /** What it costs a year, in whole dollars at a cost of living of 1 (fees, gear, trips). */
  cost: dollarsSchema,
  effects: statEffectsSchema,
  /** GPA points a year of belonging adds to (or takes from) your grade. */
  grades: z.number().min(-0.4).max(0.4),
  /** Affection points a year with the people in it (your classmates). */
  friends: z.int().min(0).max(8),
  /** The talent it feeds (an id in src/content/talents), and the passion points a year. */
  talent: idSchema.optional(),
  passion: z.int().min(0).max(10),
  /** Chance each year of getting hurt (a broken bone). */
  injury: probability,
});
export type ActivityDef = z.infer<typeof activitySchema>;

/** A teen job (src/content/teenJobs): part-time, around school. */
export const teenJobSchema = baseDefSchema.extend({
  /** As it reads in a sentence ("bag groceries" is the title: "grocery bagger"). */
  name: z.string().trim().min(2).max(40),
  blurb: z.string().trim().min(10).max(200),
  minAge: z.int().min(13).max(17),
  /** Hours a week and the hourly wage in whole dollars at a salary multiplier of 1. */
  hours: z.int().min(3).max(30),
  wage: z.int().min(5).max(40),
  /** Fictional employers, one picked when you are hired. */
  employers: z.array(z.string().trim().min(2).max(40)).min(1),
  /** Pulls on your stats each year you work. */
  effects: statEffectsSchema,
  /** The least you need of a stat or trait to be taken on. */
  needs: z.partialRecord(z.union([statKey, traitKey]), z.int().min(0).max(100)),
  /** A job where you drive: you need your license. */
  needsLicense: z.boolean().optional(),
});
export type TeenJobDef = z.infer<typeof teenJobSchema>;

/** A kind of house rule (src/content/houseRules); its id is its domain. */
export const houseRuleSchema = baseDefSchema
  .extend({
    domain: ruleDomainSchema,
    name: z.string().trim().min(2).max(30),
    /** How the rule reads at each level: relaxed, usual, strict. */
    levels: z.array(z.string().trim().min(4).max(80)).length(3),
    /**
     * How much a parent's style and personality tighten it: each weight times
     * the parent's value's distance from 50, added to `balance rules.tightness.base`.
     */
    tight: z.strictObject({
      strictness: z.number().min(-2).max(2),
      warmth: z.number().min(-2).max(2),
      involvement: z.number().min(-2).max(2),
      traits: traitWeights,
    }),
    /** A parent whose tightness is below this sets no such rule. */
    absentBelow: z.number().min(0).max(100),
    /** How tempting it is to break, before who you are (yearly chance). */
    temptation: probability,
    /** How easily a parent notices a break (chance, before the parent and the level). */
    watch: probability,
    /** When it binds you: always, only once you have your license, only with a teen job, only in school. */
    applies: z.enum(['always', 'licensed', 'job', 'school']),
  })
  .refine((r) => r.id === r.domain, 'a house rule\'s id must be its domain');
export type HouseRuleDef = z.infer<typeof houseRuleSchema>;

const distribution = z.strictObject({ mean: z.number(), sd: z.number().min(0) });

/** What one yearly focus does (or `none`, a year without one). */
const focusEffectSchema = z.strictObject({
  /** GPA points added to the year's grade. */
  grades: z.number().min(-1).max(1),
  /** Affection points a year with each of your closest friends and classmates (up to `friends.people`). */
  friends: z.int().min(-10).max(20),
  /** A multiplier on teen job pay. */
  income: z.number().min(0).max(5),
  /** Dollars a year from odd jobs, for a focus on work, when you have no job of your own (before the city's multiplier). */
  odd: dollarsSchema,
  /** Passion points a year. */
  passion: z.int().min(0).max(40),
  /** The chance a hidden talent comes to light this year, on top of the usual. */
  talentChance: probability,
  stats: statEffectsSchema,
});
export type FocusEffect = z.infer<typeof focusEffectSchema>;

const perFocus = <T extends z.ZodType>(value: T) => z.strictObject({ none: value, school: value, friends: value, work: value, passion: value });

const consequenceSchema = z.strictObject({
  /** Its weight when a parent picks: `base` + each style line (and how you two get on) × its distance from 50, never below 0. */
  weight: z.strictObject({ base: nonneg, warmth: z.number().min(-1).max(1), strictness: z.number().min(-1).max(1), involvement: z.number().min(-1).max(1), affection: z.number().min(-1).max(1) }),
  /** Years it lasts (0: over at once). */
  years: z.int().min(0).max(3),
  /** Stat changes now. */
  stats: z.partialRecord(statKey, z.int().min(-20).max(20)),
  /** How you and that parent feel after. */
  affection: z.int().min(-30).max(30),
  trust: z.int().min(-30).max(30),
  /** Your standing at school. */
  standing: z.int().min(-20).max(20),
});

/** Teen balance (src/content/balance/teen.yaml). Starting proposals; the simulation targets say where they should land. */
export const teenBalanceSchema = z.strictObject({
  ages: z.strictObject({
    /** The teen systems (a school's crowds, house rules, the yearly focus) begin at this age and end at the adult age. */
    from: z.int().min(10).max(16),
  }),
  school: z.strictObject({
    /** Crowds at a school, drawn without repeats from src/content/cliques. */
    cliques: range,
    /** The chance a crowd has a rival crowd at its school (pairs, never more than one each). */
    rivalChance: probability,
    /** A crowd's standing at your school: its own, plus or minus up to this much. */
    standingNoise: z.int().min(0).max(30),
  }),
  cliques: z.strictObject({
    /** The people a crowd brings into your life when you first join it. */
    members: range,
    /** Their ages compared with yours. */
    memberAge: z.strictObject({ below: z.int().min(0).max(3), above: z.int().min(0).max(3) }),
    /** How they start out feeling about you and about each other (affection). */
    memberAffection: distribution,
    tieAffection: distribution,
    /** The chance a crowd takes you in when you try: base, plus fit (its likes, summed, in chance points), plus standing (your standing against its own), clamped. */
    join: z.strictObject({ base: probability, fit: z.number().min(0).max(1), standing: z.number().min(0).max(1), min: probability, max: probability }),
    /** Years a crowd that turned you away (or that you left) won't have you back. */
    coolOff: z.int().min(1).max(10),
    /** Leaving a crowd: how its members feel about it, and the chance the crowd (a switch, to a rival especially) holds it against you. */
    leave: z.strictObject({ affection: z.int().min(-30).max(0), standing: z.int().min(-30).max(0), clashChance: probability, rivalClashChance: probability }),
    yearly: z.strictObject({
      /** Chance each year a crowd you don't belong to notices you (more with standing). */
      inviteChance: probability,
      /** Chance each year of a clash with a rival crowd while you belong to one that has a rival. */
      clashChance: probability,
      /** Years a clash lasts, unless it is settled. */
      clashYears: range,
      /** Each year of a clash after its first, the chance it brings an event. */
      clashEventChance: probability,
      /** Affection with each member drifts this many points a year toward where the crowd sits. */
      rank: z.int().min(0).max(20),
      /** The pull on your standing each year toward the crowd's own, as a share of the gap. */
      standingPull: z.number().min(0).max(1),
      /** Without a crowd, at school: yearly pulls. */
      alone: statEffectsSchema,
      /** The share of a member's affection (above 50) that fades each year after you leave. */
      fade: z.number().min(0).max(1),
    }),
    /** Your standing before you've found a place. */
    standingStart: scoreSchema,
    /** How a clash moves your standing and feelings. */
    clash: z.strictObject({ standing: z.int().min(-20).max(20), stress: z.int().min(0).max(20), affection: z.int().min(-30).max(0), feud: z.int().min(1).max(40) }),
  }),
  focus: perFocus(focusEffectSchema),
  passion: z.strictObject({
    /** Passion points lost a year when it isn't the focus (and the crowd or a team doesn't feed it). */
    decay: z.int().min(0).max(20),
    /** From this much a passion counts (events, scholarships). */
    counts: scoreSchema,
    /** A hidden talent can come to light by itself from this much passion. */
    discoverAt: scoreSchema,
  }),
  friends: z.strictObject({ people: z.int().min(1).max(12) }),
  license: z.strictObject({
    /** The youngest age for a learner's permit, and for the license itself. */
    permitAge: z.int().min(14).max(17),
    licenseAge: z.int().min(15).max(18),
    /** Fees in whole dollars at a cost of living of 1 (a minor's family covers what savings can't). */
    permitFee: dollarsSchema,
    lessonFee: dollarsSchema,
    testFee: dollarsSchema,
    /** Lessons you can take (and the least you need, with a permit, to be allowed to test). */
    lessons: z.strictObject({ max: z.int().min(1).max(20), minToTest: z.int().min(0).max(10) }),
    /** The chance of passing the test, in percent: base, plus per lesson, per year of age after the license age, per earlier failure, and each trait's weight × its distance from 50; clamped. */
    test: z.strictObject({
      base: z.number().min(0).max(100),
      perLesson: z.number().min(0).max(30),
      perFail: z.number().min(0).max(30),
      traits: traitWeights,
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
    }),
    /** The pace of the test: you can sit it once a year. */
    adultFeeMultiplier: z.number().min(1).max(5),
  }),
  jobs: z.strictObject({
    /** Weeks worked a year. */
    weeks: z.int().min(10).max(52),
    /** GPA points lost a year for each weekly hour beyond `freeHours`. */
    gradePerHour: z.number().min(0).max(0.1),
    freeHours: z.int().min(0).max(20),
    /** The chance each year the job ends (laid off or let go), by Discipline; and the share of pay a parent takes (the `money` rule) at each level. */
    endChance: curveSchema,
    parentShare: z.array(z.number().min(0).max(1)).length(3),
    /** Pay swings by this share either way. */
    swing: z.number().min(0).max(0.5),
  }),
  activities: z.strictObject({
    /** Teams and clubs you can belong to at once. */
    max: z.int().min(1).max(4),
    /** Years a cut team won't take you again. */
    cutWait: z.int().min(1).max(5),
  }),
  rules: z.strictObject({
    /**
     * A parent's style, worked out once from who they are (the parenting
     * style of E2a is kept for the children you raise; your own parents have
     * their personality and what you remember of them). Each line is 50 plus
     * these weights times how far a trait (or how fond you two are, from 60)
     * is from 50. `memory`: points a remembered warm or cold home, strict or
     * easy rules, or a parent always there or never around adds or takes.
     */
    style: z.strictObject({
      warmth: z.strictObject({ kindness: z.number().min(-2).max(2), affection: z.number().min(-2).max(2) }),
      strictness: z.strictObject({ discipline: z.number().min(-2).max(2), riskTaking: z.number().min(-2).max(2), ambition: z.number().min(-2).max(2) }),
      involvement: z.strictObject({ sociability: z.number().min(-2).max(2), kindness: z.number().min(-2).max(2), affection: z.number().min(-2).max(2) }),
      memory: z.number().min(0).max(40),
      stepparent: z.number().min(-40).max(0),
    }),
    /** A parent's tightness for a rule: this plus the rule's weights. */
    tightness: z.strictObject({ base: z.number().min(0).max(100), levelAt: z.array(z.number().min(0).max(100)).length(2) }),
    /** Multiplies a break's temptation and the chance of being noticed, by level (relaxed, usual, strict). */
    levelTemptation: z.array(z.number().min(0).max(5)).length(3),
    levelWatch: z.array(z.number().min(0).max(5)).length(3),
    /** The yearly chance you break a rule unprompted, by Risk-taking and by Discipline (both multiply the rule's temptation). */
    riskTaking: curveSchema,
    discipline: curveSchema,
    /** A parent's involvement (0–100) multiplies the chance of being noticed. */
    involvement: curveSchema,
    /** While you are grounded, breaking a rule is this much less likely, and friends and passion gain this share as much. */
    groundedBreak: z.number().min(0).max(1),
    groundedGain: z.number().min(0).max(1),
    /** How many rules a parent can break the same year at most. */
    maxBreaksPerYear: z.int().min(1).max(5),
    /** What breaking a rule gives you, whether or not you are caught. */
    thrill: z.strictObject({ happiness: z.int().min(0).max(10), standing: z.int().min(0).max(10), riskTaking: z.int().min(0).max(5), vice: z.int().min(0).max(5) }),
    consequences: z.strictObject({ talking_to: consequenceSchema, grounded: consequenceSchema, privilege: consequenceSchema, chores: consequenceSchema }),
    /** Pulls while you are grounded or have lost a privilege. */
    restricted: statEffectsSchema,
    /** Asking a parent to loosen a rule. */
    negotiate: z.strictObject({
      base: z.number().min(0).max(100),
      /** Percentage points per point of how much they like you and trust you, from 50. */
      affection: z.number().min(0).max(2),
      trust: z.number().min(0).max(2),
      /** Per point of the parent's warmth and strictness from 50. */
      warmth: z.number().min(-2).max(2),
      strictness: z.number().min(-2).max(2),
      /** Points per GPA point above 2.5 (grades back a request), and per level above relaxed (a strict rule is harder to move). */
      grades: z.number().min(0).max(30),
      perLevel: z.number().min(-40).max(0),
      /** Points off for breaking rules lately (each time you have been caught, up to a limit). */
      caught: z.number().min(-30).max(0),
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
      /** How it moves how they feel about you. */
      win: z.strictObject({ affection: z.int().min(-10).max(10), trust: z.int().min(-10).max(10) }),
      lose: z.strictObject({ affection: z.int().min(-10).max(10), trust: z.int().min(-10).max(10) }),
      /** Rules you can ask about in a year. */
      perYear: z.int().min(1).max(10),
      /** At the ages in `looserAt`, a parent who is fond of you and trusts you (at least these) loosens each strict or usual rule a level. */
      ageTrust: z.strictObject({ affection: z.int().min(0).max(100), trust: z.int().min(0).max(100) }),
      /** A rule left alone for this many years tightens or loosens with your age: one level looser at each of these ages. */
      looserAt: z.array(z.int().min(13).max(18)),
    }),
  }),
  trouble: z.strictObject({
    /** When a juvenile case lands on your record, how your parents take it. */
    parents: z.strictObject({ affection: z.int().min(-30).max(0), trust: z.int().min(-30).max(0) }),
    /** The chance such a case brings a talk with them as an event the same year. */
    eventChance: probability,
  }),
});
export type TeenBalance = z.infer<typeof teenBalanceSchema>;

/** The events the teen step queues (registries/teen.yaml). */
export const TEEN_TRIGGERS = ['caught', 'invited', 'clash', 'juvenile'] as const;
export type TeenTrigger = (typeof TEEN_TRIGGERS)[number];

export const teenRegistrySchema = z.strictObject({
  triggers: z.strictObject(
    Object.fromEntries(TEEN_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      TeenTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type TeenRegistry = z.infer<typeof teenRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The history lines the teen systems write (text/teen.yaml). Values: {clique}, {school}, {job}, {employer}, {activity}, {rule}, {parent}. */
export const TEEN_HISTORY_KEYS = [
  'newSchool',
  'cliqueJoined',
  'cliqueTurnedAway',
  'cliqueSwitched',
  'cliqueLeft',
  'cliqueClash',
  'permit',
  'licensePassed',
  'licenseFailed',
  'jobStarted',
  'jobEnded',
  'activityJoined',
  'activityCut',
  'activityLeft',
  'ruleCaught',
  'ruleLoosened',
  'sealed',
] as const;
export type TeenHistoryKey = (typeof TEEN_HISTORY_KEYS)[number];

export const teenTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(TEEN_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<TeenHistoryKey, typeof historyLine>),
});
export type TeenText = z.infer<typeof teenTextSchema>;
