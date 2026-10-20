/**
 * School and work life (Batch 3, docs/post-expansion1-changes.md): exams and
 * the choice at 16, the actions you can take in a school year, the report
 * card, your class and your teachers, the work actions and the coworkers of
 * a workplace. The country decides which exams there are and when
 * (countries/*.yaml school.exams and school.choice); the numbers are in
 * balance/school.yaml; the events the school step queues are in
 * registries/school.yaml; the history lines are in text/school.yaml.
 *
 * Nobody here is romantic: teachers are never romance, and classmates under
 * 18 never are either (the engine checks it whatever the content says).
 */
import { z } from 'zod';
import { chanceModelSchema } from './education';
import { dollarsSchema, idSchema } from './common';
import { EXAM_IDS, EXAM_KINDS, type ExamId } from './schoolIds';

export * from './schoolIds';

const probability = z.number().min(0).max(1);
const spread = z.strictObject({ mean: z.number().min(0).max(100), sd: z.number().min(0).max(50) });
const ageRange = z.strictObject({ min: z.int().min(16).max(100), max: z.int().min(16).max(100) }).refine((r) => r.min <= r.max, 'min must not be greater than max');

const examBalanceSchema = z.strictObject({
  kind: z.enum(EXAM_KINDS),
  /** The score (0–100): this model's chance, in percent, plus a swing. */
  model: chanceModelSchema,
  swing: z.number().min(0).max(30),
  /** The band cut-offs: at least `top` is top, at least `pass` is a pass. */
  top: z.number().min(0).max(100),
  pass: z.number().min(0).max(100),
});

/** Balance for school life (src/content/balance/school.yaml). */
export const schoolBalanceSchema = z.strictObject({
  classes: z.strictObject({
    /** How many classmates a class has, by the stage you are in. */
    size: z.strictObject({
      elementary: z.int().min(0).max(12),
      middle: z.int().min(0).max(12),
      high: z.int().min(0).max(12),
      college: z.int().min(0).max(12),
      trade: z.int().min(0).max(12),
      grad: z.int().min(0).max(12),
    }),
    /** Minors' classmates are your age, give or take this. */
    minorSpread: z.int().min(0).max(3),
    /** Adults' classmates are this far below and above your age (never under the adult age). */
    adultSpread: z.strictObject({ below: z.int().min(0).max(20), above: z.int().min(0).max(30) }),
    /** Each school year, the chance a classmate has moved on (and a new one has joined). */
    churn: probability,
    /** How they feel about you when you meet. */
    affection: spread,
  }),
  teachers: z.strictObject({
    /** Which staff a stage has: the homeroom (form) teacher or professor, the head of the school, someone who supports students. */
    roles: z.strictObject({
      elementary: z.array(z.enum(['homeroom', 'head', 'support'])),
      middle: z.array(z.enum(['homeroom', 'head', 'support'])),
      high: z.array(z.enum(['homeroom', 'head', 'support'])),
      college: z.array(z.enum(['homeroom', 'head', 'support'])),
      trade: z.array(z.enum(['homeroom', 'head', 'support'])),
      grad: z.array(z.enum(['homeroom', 'head', 'support'])),
    }),
    age: z.strictObject({ homeroom: ageRange, head: ageRange, support: ageRange }),
    /** The chance of a new homeroom teacher each school year, by stage. */
    homeroomChange: z.strictObject({
      elementary: probability,
      middle: probability,
      high: probability,
      college: probability,
      trade: probability,
      grad: probability,
    }),
    affection: spread,
  }),
  report: z.strictObject({
    spread: z.strictObject({
      /** A subject's spread from your grade (GPA points): its stat's weight × (value − 50), plus a draw of this sd. */
      sd: z.number().min(0).max(1),
      stat: z.number().min(0).max(0.05),
      /** A spread stays within ±max, and each year this share of it is drawn again. */
      max: z.number().min(0).max(2),
      redraw: probability,
    }),
    /** The chance a new school year's card is worth an event (a subject you shine in, or are failing). */
    eventChance: probability,
    /** The words a subject's grade earns, best first: a GPA of at least `min` reads as that band (the words are in src/ui/labels.ts). */
    bands: z
      .array(z.strictObject({ min: z.number().min(0).max(4), id: z.enum(['top', 'strong', 'solid', 'fair', 'weak', 'failing']) }))
      .min(2)
      .refine((b) => b.every((x, i) => i === 0 || x.min < b[i - 1]!.min), 'bands must go from the highest min down')
      .refine((b) => b[b.length - 1]!.min === 0, 'the last band starts at 0'),
  }),
  /** Things you can do in a school year. Gains are GPA points added to this year's grade. */
  actions: z.strictObject({
    study: z.strictObject({
      grades: z.number().min(0).max(1),
      stress: z.int().min(0).max(20),
      /** Studying a subject in particular raises its spread by this (and lifts the year a little less). */
      subject: z.number().min(0).max(1),
      discipline: z.number().min(0).max(5),
    }),
    slack: z.strictObject({ grades: z.number().min(-1).max(0), stress: z.int().min(-20).max(0), happiness: z.number().min(0).max(10) }),
    tutor: z.strictObject({
      /** Per year, at the national average of US prices (scaled by where you live). */
      cost: dollarsSchema,
      grades: z.number().min(0).max(1),
      stress: z.int().min(-20).max(0),
    }),
    cheat: z.strictObject({
      grades: z.number().min(0).max(1),
      /** The chance of being caught: a base, more for each earlier try this year, never more than max. */
      catch: z.strictObject({ base: probability, perTry: probability, max: probability }),
      maxPerYear: z.int().min(1).max(10),
      /** Youngest age to try. */
      minAge: z.int().min(5).max(18),
      caught: z.strictObject({
        grades: z.number().min(-2).max(0),
        stress: z.int().min(0).max(20),
        standing: z.int().min(0).max(30),
        teacherAffection: z.int().min(-50).max(0),
        parentTrust: z.int().min(-50).max(0),
        /** The chance being caught also gets you suspended (the `suspended` flag). */
        suspend: probability,
      }),
      /** Getting away with it: stress and a nudge to Risk-taking. */
      stress: z.int().min(0).max(10),
    }),
    skip: z.strictObject({
      grades: z.number().min(-1).max(0),
      stress: z.int().min(-20).max(0),
      happiness: z.number().min(0).max(10),
      /** The chance each time that school notices (the existing truancy event follows, or the offense itself from this age). */
      catch: z.strictObject({ base: probability, perTry: probability, max: probability }),
      maxPerYear: z.int().min(1).max(10),
      minAge: z.int().min(5).max(18),
      offenseAge: z.int().min(10).max(18),
      teacherAffection: z.int().min(-50).max(0),
    }),
  }),
  exams: z.strictObject(Object.fromEntries(EXAM_IDS.map((id) => [id, examBalanceSchema])) as Record<ExamId, typeof examBalanceSchema>),
  /** Sitting an exam: points added to the score for how you spent the year. */
  prep: z.strictObject({ study: z.number().min(0).max(30), tutor: z.number().min(0).max(30), slack: z.number().min(-30).max(0) }),
  /** Entrance exams add to a college application: points (in percent) per score point above `pivot`, by tier. */
  admission: z.strictObject({
    pivot: z.number().min(0).max(100),
    college: z.strictObject({ community: z.number().min(0).max(2), state: z.number().min(0).max(2), elite: z.number().min(0).max(2) }),
    trade: z.number().min(0).max(2),
  }),
  /** A leaving exam adds (score − 50) × this to the year's grade (GPA points). A placement exam shifts the next school's grades the same way. */
  leaving: z.number().min(0).max(0.05),
  placement: z.number().min(0).max(0.05),
  /** A conditional place (UK): the score each tier asks for. */
  conditional: z.strictObject({ community: z.number().min(0).max(100), state: z.number().min(0).max(100), elite: z.number().min(0).max(100) }),
  /** The choice at the end of compulsory school: what each path asks of the exam result. */
  choice: z.strictObject({
    stay: z.strictObject({ min: z.number().min(0).max(100) }),
    apprenticeship: z.strictObject({ min: z.number().min(0).max(100), model: chanceModelSchema }),
    /** The grade a college year adds or takes (a different school, a different pace). */
    college: z.strictObject({ grades: z.number().min(-1).max(1) }),
  }),
  /** The yearly step: stress the exams cause in the year they come. */
  examStress: z.int().min(0).max(20),
});
export type SchoolBalance = z.infer<typeof schoolBalanceSchema>;

/** The triggers the school step queues events for (registries/school.yaml). */
export const SCHOOL_TRIGGERS = ['gcse', 'alevels', 'sat', 'provincial', 'mx_placement', 'mx_entrance', 'caught_cheating', 'skipped', 'report'] as const;
export type SchoolTrigger = (typeof SCHOOL_TRIGGERS)[number];

export const schoolRegistrySchema = z.strictObject({
  triggers: z.strictObject(
    Object.fromEntries(SCHOOL_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      SchoolTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type SchoolRegistry = z.infer<typeof schoolRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The history lines the school systems write (text/school.yaml). Values: {exam}, {school}, {path}. */
export const SCHOOL_HISTORY_KEYS = ['examTop', 'examPass', 'examFail', 'choseStay', 'choseCollege', 'choseApprenticeship', 'choseWork', 'noApprenticeship', 'fellBack', 'offerMissed', 'newClass', 'caughtCheating', 'skippedCaught'] as const;
export type SchoolHistoryKey = (typeof SCHOOL_HISTORY_KEYS)[number];
export const schoolTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(SCHOOL_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<SchoolHistoryKey, typeof historyLine>),
});
export type SchoolText = z.infer<typeof schoolTextSchema>;

