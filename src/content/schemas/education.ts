/**
 * Education (docs/design.md, section I; docs/technical.md, Stage 7): school
 * programs, college tiers and credentials, the content types for majors,
 * trades and grad programs (src/content/majors, trades, grad), and the
 * education balance numbers (src/content/balance/education.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, dollarsSchema, idSchema, scoreKeySchema } from './common';
import { statEffectsSchema } from './economy';

/** Automatic school (elementary, middle, high) and the programs you apply to. */
export const PROGRAMS = ['elementary', 'middle', 'high', 'college', 'trade', 'grad'] as const;
export const programSchema = z.enum(PROGRAMS);
export type Program = z.infer<typeof programSchema>;

/** Programs you apply to (and pay for). */
export const APPLY_PROGRAMS = ['college', 'trade', 'grad'] as const;
export const applyProgramSchema = z.enum(APPLY_PROGRAMS);
export type ApplyProgram = z.infer<typeof applyProgramSchema>;

export const TIERS = ['community', 'state', 'elite'] as const;
export const tierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof tierSchema>;

export const CREDENTIAL_TYPES = ['hs_diploma', 'ged', 'associate', 'bachelor', 'trade_license', 'grad'] as const;
export const credentialTypeSchema = z.enum(CREDENTIAL_TYPES);
export type CredentialType = z.infer<typeof credentialTypeSchema>;

const nameSchema = z.string().trim().min(1).max(40);
const lineSchema = z.string().trim().min(1).max(100);
/** How hard a program is, 1 (easy) to 5 (demanding): harder programs grade lower. */
const difficultySchema = z.int().min(1).max(5);

/** A college major (src/content/majors). Jobs point at majors (Stage 8), so a major lists its careers as text only. */
export const majorSchema = baseDefSchema.extend({
  /** Shown in lists: "Computer Science". */
  name: nameSchema,
  /** In a sentence: "studying computer science". */
  subject: nameSchema,
  /** One line for the major picker. */
  blurb: lineSchema,
  /** Where it tends to lead, for the major picker. */
  careers: lineSchema,
  difficulty: difficultySchema,
});
export type MajorDef = z.infer<typeof majorSchema>;

/** A trade taught at trade school (src/content/trades). Finishing it earns its license. */
export const tradeSchema = baseDefSchema.extend({
  /** Shown in lists: "Electrician". */
  name: nameSchema,
  /** In a sentence: "training in electrical work". */
  subject: nameSchema,
  /** The license it earns, in a sentence: "electrician's license". */
  license: nameSchema,
  blurb: lineSchema,
  careers: lineSchema,
  /** Years of trade school. */
  years: z.int().min(1).max(4),
  difficulty: difficultySchema,
});
export type TradeDef = z.infer<typeof tradeSchema>;

/** A graduate program (src/content/grad). Every one needs a bachelor's degree. */
export const gradProgramSchema = baseDefSchema.extend({
  /** Shown in lists: "Law school". */
  name: nameSchema,
  /** In a sentence: "studying law". */
  subject: nameSchema,
  /** The degree it earns, in a sentence: "a law degree". */
  degree: nameSchema,
  blurb: lineSchema,
  careers: lineSchema,
  years: z.int().min(1).max(8),
  difficulty: difficultySchema,
  /** Only a bachelor's degree in one of these majors qualifies (any major when left out). */
  majors: z.array(idSchema).min(1).optional(),
});
export type GradProgramDef = z.infer<typeof gradProgramSchema>;

const perWealth = <T extends z.ZodType>(value: T) =>
  z.strictObject({ poor: value, working: value, middle: value, affluent: value, rich: value });
const perTier = <T extends z.ZodType>(value: T) => z.strictObject({ community: value, state: value, elite: value });
const share = z.number().min(0).max(1);
const percent = z.number().min(0).max(100);
const gpaSchema = z.number().min(0).max(4);

/**
 * A chance in percent: base + gpa × (GPA − gpaPivot) + each stat's weight ×
 * (value − 50) + luck + bonuses, never outside min–max.
 */
export const chanceModelSchema = z
  .strictObject({
    base: z.number().min(-100).max(200),
    /** Percentage points per GPA point above (or below) the pivot. */
    gpa: z.number().min(0).max(100).optional(),
    stats: z.array(z.strictObject({ key: scoreKeySchema, weight: z.number().min(-2).max(2) })).default([]),
    /** Percentage points by family wealth (connections, legacy). */
    wealth: perWealth(z.number().min(-50).max(50)).partial().optional(),
    /** Percentage points for flags from your past (registries/flags.yaml). */
    flags: z.record(idSchema, z.number().min(-50).max(50)).optional(),
    min: percent,
    max: percent,
  })
  .refine((m) => m.min <= m.max, 'min must not be greater than max');
export type ChanceModel = z.infer<typeof chanceModelSchema>;

/** Education: school years, grades, admissions and paying for school (src/content/balance/education.yaml). */
export const educationBalanceSchema = z.strictObject({
  school: z.strictObject({
    /** The age you start school (kindergarten). */
    startAge: z.int().min(3).max(8),
    /** Years of each automatic school. */
    elementary: z.int().min(1).max(8),
    middle: z.int().min(1).max(5),
    high: z.int().min(1).max(5),
    /** From this age you can leave high school (drop out, or be expelled). */
    dropoutAge: z.int().min(12).max(18),
    /** A high school year graded below this is repeated (held back)... */
    repeatBelow: gpaSchema,
    /** ...at most this many times; after that you are passed along. */
    maxRepeats: z.int().min(0).max(2),
    /** From this age you can apply to college, trade school or grad school. */
    applyAge: z.int().min(14).max(21),
  }),
  grades: z.strictObject({
    /** A school year's grade, in GPA points: base + weight × (value − 50) for each stat... */
    base: gpaSchema,
    stats: z.array(z.strictObject({ key: scoreKeySchema, weight: z.number().min(-0.2).max(0.2) })).min(1),
    /** ...times this, by Stress (stress wears grades down)... */
    stress: curveSchema,
    /** ...plus this, by family wealth (tutors, a quiet room, fewer worries)... */
    wealth: perWealth(z.number().min(-1).max(1)),
    /** ...plus (difficulty − 3) × this for a major, trade or grad program... */
    difficulty: z.number().min(-1).max(1),
    /** ...plus this by college tier... */
    tier: perTier(z.number().min(-1).max(1)),
    /** ...plus a random swing of up to this either way, plus what events added. Clamped to 0–4. */
    swing: z.number().min(0).max(2),
    /** Letter grades, best first: a GPA of at least `min` shows as `letter`. The last starts at 0. */
    letters: z
      .array(z.strictObject({ min: gpaSchema, letter: z.string().trim().min(1).max(3) }))
      .min(2)
      .refine((l) => l.every((x, i) => i === 0 || x.min < l[i - 1]!.min), 'letters must go from the highest min down')
      .refine((l) => l[l.length - 1]!.min === 0, 'the last letter starts at 0'),
  }),
  /** Yearly stat pulls while you are in each program (what school does to you). */
  yearEffects: z.strictObject({
    elementary: statEffectsSchema,
    middle: statEffectsSchema,
    high: statEffectsSchema,
    college: statEffectsSchema,
    trade: statEffectsSchema,
    grad: statEffectsSchema,
  }),
  college: z.strictObject({
    /** Years of each tier: community earns an associate degree, state and elite a bachelor's. */
    years: perTier(z.int().min(1).max(6)),
    /** An associate degree counts for this many years toward a bachelor's. */
    transferCredit: z.int().min(0).max(4),
    /** Changing major in these first years is free; later, each change adds a year. */
    freeChangeYears: z.int().min(0).max(6),
  }),
  admission: z.strictObject({
    /** GPA the admission models compare against. */
    gpaPivot: gpaSchema,
    /** A record without a GPA (a GED) counts as this. */
    noGpa: gpaSchema,
    /** Each application costs this. */
    fee: dollarsSchema,
    college: perTier(chanceModelSchema),
    trade: chanceModelSchema,
    /** By grad program id; every grad program needs one. */
    grad: z.record(idSchema, chanceModelSchema),
  }),
  /** Yearly tuition: by college tier, by trade and by grad program id. */
  tuition: z.strictObject({
    college: perTier(dollarsSchema),
    trade: z.record(idSchema, dollarsSchema),
    grad: z.record(idSchema, dollarsSchema),
  }),
  scholarships: z.strictObject({
    /** Merit aid: a share of tuition, by the GPA you applied with. */
    merit: curveSchema,
    /** Need-based aid: a share of tuition, by family wealth. */
    need: perWealth(share),
    /** Grad programs give this share of the need-based aid. */
    gradNeed: share,
    /** Scholarships never cover more than this share of tuition. */
    maxShare: share,
  }),
  familyHelp: z.strictObject({
    /** The share of tuition left after scholarships your family pays, by wealth, while a parent is there to help. */
    share: perWealth(share),
    /** Families help students up to this age. */
    maxAge: z.int().min(16).max(100),
  }),
  /** The GED: a high school equivalency exam for anyone without a diploma. */
  ged: z.strictObject({
    minAge: z.int().min(14).max(30),
    fee: dollarsSchema,
    pass: chanceModelSchema,
  }),
  /** While you're in college, trade school or grad school, gig work is part-time: pay × this. */
  studentGigShare: share,
});
export type EducationBalance = z.infer<typeof educationBalanceSchema>;

/** Schools in a city, by the program they teach (fictional institutions). */
export const citySchoolsSchema = z.strictObject({
  high: nameSchema.max(60),
  community: nameSchema.max(60),
  state: nameSchema.max(60),
  elite: nameSchema.max(60),
  trade: nameSchema.max(60),
  grad: nameSchema.max(60),
});
