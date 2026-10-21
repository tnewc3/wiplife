/**
 * The country-level pieces of school life (Batch 3): which exams there are,
 * the choice at the end of compulsory school, the subjects of a report card.
 * Kept apart from ./school.ts (the balance, registry and text) because the
 * country schema in ./education.ts uses them.
 */
import { z } from 'zod';
import { idSchema, scoreKeySchema } from './common';

const wordSchema = z.string().trim().min(1).max(60);

/** The exams a country can hold. Each one's numbers are in balance/school.yaml exams; when it is sat is the country's (school.exams). */
export const EXAM_IDS = ['gcse', 'alevels', 'sat', 'provincial', 'mx_placement', 'mx_entrance'] as const;
export const examIdSchema = z.enum(EXAM_IDS);
export type ExamId = z.infer<typeof examIdSchema>;

/**
 * What an exam is for. gate: its result decides which of the choices at the end of compulsory school are open
 * (the GCSEs). confirm: a place you were offered depends on it (A-levels). entrance: it adds to your chances at
 * college (the SAT, a university entrance exam). leaving: it counts toward your final grade (provincial exams).
 * placement: it decides how good your next school is (a placement exam).
 */
export const EXAM_KINDS = ['gate', 'confirm', 'entrance', 'leaving', 'placement'] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];

/** Results: the band an exam score falls in. Flags `exam_<id>` hold it for events (registries/flags.yaml). */
export const EXAM_BANDS = ['top', 'pass', 'fail'] as const;
export type ExamBand = (typeof EXAM_BANDS)[number];

/** The choices at the end of compulsory school (the UK: stay on, a college, an apprenticeship or work). */
export const SCHOOL_PATHS = ['stay', 'college', 'apprenticeship', 'work'] as const;
export const schoolPathSchema = z.enum(SCHOOL_PATHS);
export type SchoolPath = z.infer<typeof schoolPathSchema>;

/** The subjects of a report card. A subject's stat pulls its spread (math toward Smarts, sport toward Fitness...). */
export const subjectSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(30),
  stat: scoreKeySchema,
});
export type SubjectDef = z.infer<typeof subjectSchema>;

/** A country's curriculum: 4 to 6 subjects per stage. `upper` replaces `high` after the choice (the UK's sixth form). */
export const curriculumSchema = z
  .strictObject({
    elementary: z.array(subjectSchema).min(4).max(6),
    middle: z.array(subjectSchema).min(4).max(6),
    high: z.array(subjectSchema).min(4).max(6),
    upper: z.array(subjectSchema).min(4).max(6).optional(),
  })
  .refine((c) => Object.values(c).every((list) => list === undefined || new Set(list.map((s) => s.id)).size === list.length), 'subject ids must be unique within a stage');
export type Curriculum = z.infer<typeof curriculumSchema>;

/** An exam a country holds: sat when the `year` of `program` finishes (a held-back year is sat again). */
export const examSlotSchema = z.strictObject({
  id: examIdSchema,
  program: z.enum(['middle', 'high']),
  year: z.int().min(1).max(6),
});
export type ExamSlot = z.infer<typeof examSlotSchema>;

/**
 * The choice at the end of compulsory school: made in `year` of high school (before the exam's results), taken
 * up when the next year begins. Which paths are open depends on the exam result (balance/school.yaml choice).
 */
export const schoolChoiceSchema = z.strictObject({
  year: z.int().min(1).max(5),
  exam: examIdSchema,
  options: z
    .array(schoolPathSchema)
    .min(2)
    .refine((o) => o.includes('stay'), 'staying on must be one of the options')
    .refine((o) => new Set(o).size === o.length, 'options must be unique'),
});
export type SchoolChoice = z.infer<typeof schoolChoiceSchema>;

/** What a school's words call a choice, an exam and the staff (countries/*.yaml words). */
export const schoolPathWordsSchema = z.strictObject({
  stay: wordSchema,
  college: wordSchema,
  apprenticeship: wordSchema,
  work: wordSchema,
});

