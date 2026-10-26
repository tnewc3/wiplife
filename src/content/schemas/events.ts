/**
 * Event content (docs/technical.md, sections M and N, and the Content
 * Pipeline). Events live in src/content/events/<lifeStage>/<category>/ as one
 * file per event, or as <chain>.chain.yaml holding a chain's events together.
 */
import { z } from 'zod';
import { familyWealthSchema } from './balance';
import {
  baseDefSchema,
  HIDDEN_KEYS,
  mentalCareSchema,
  type MentalCareId,
  idSchema,
  LATENT_KINDS,
  scoreKeySchema,
  STAT_KEYS,
  TRAIT_KEYS,
} from './common';
import { DAMAGE_SEVERITIES, PET_PERSONALITIES, PET_SOURCES, POSSESSION_EFFECT_ACTIONS, POSSESSION_KINDS, VALUABLE_CLASSES, VEHICLE_KINDS } from './belongings';
import { debtKindSchema, housingKindSchema, lifestyleSchema } from './economy';
import { FAMILY_DEEDS, GUARDIAN_KINDS, familyProcessSchema, parentingKeySchema } from './family';
import { credentialTypeSchema, programSchema, tierSchema, type Tier } from './education';
import { lifeTierSchema } from './people';
import { jobSizeSchema } from './crime';
import { SPORT_LEVELS, SPORT_RESULTS, SPORT_RETIRE_ROUTES, SPORT_CONTRACT_KINDS, SPORT_ROLES, TRYOUT_APPROACHES, TRYOUT_RESULTS, type SportLevel, type SportResult, type SportRole, type TryoutResult } from './sports';
import { SOCIAL_TRIGGERS, type SocialTrigger } from './social';
import { fameBandSchema, fameCommitmentSchema, fameSceneSchema, fameSizeSchema, fameTermsSchema, FAME_FAN_TYPES, FAME_STALKER_STAGES, type FameBand, type FameCommitment, type FameStalkerStage } from './fame';
import { FOCUS_KEYS, LICENSE_STAGE_IDS, ruleDomainSchema, type RuleDomainId, type TeenFocusId } from './teen';
import { relationshipKindSchema, relationshipStatusSchema, romanceStatusSchema } from './relationships';
import { AMENDS_RESULTS, CARE_OPTIONS, HOSPICE_CHOICES, LATER_ACTIONS, TEACH_KEYS } from './laterIds';
import { APPLICATION_KINDS, APPLICATION_STATUSES, MIGRATION_ACTIONS, REMIT_LEVELS, ROUTES, STATUS_KINDS, type ApplicationKind, type ApplicationStatus, type RouteId, type StatusKind } from './immigrationIds';
import { STAY_ROUTES, TRIP_ACTIVITIES, TRIP_STYLES, type TripActivity, type TripStyle } from './travel';
import { COMMITMENTS, FAITH_ACTIONS, GROUP_ACTIONS, GROUP_NEWS_KINDS, GROUP_TYPES, VALUE_IDS } from './belongingIds';
import { BUSINESS_ACTIONS, BUSINESS_KINDS, BUSINESS_PEOPLE, BUSINESS_STYLES, ECONOMY_PHASES, OWNER_ROLES, ORDER_LEVELS, PRICE_LEVELS, STOCK_STATES } from './businessIds';
import { templateSchema } from './text';
import { reactionSchema, type ReactionId } from './mental';
import { knowledgeKindSchema, tieKindSchema, tieStatusSchema, type KnowledgeKindId, type TieKindId, type TieStatusId } from './web';
import { countryIdSchema, type CountryId, type LegalAges } from './country';

export const LIFE_STAGE_IDS = ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'] as const;
export const lifeStageSchema = z.enum(LIFE_STAGE_IDS);


/** Where a cast person must be (C1, the presence rule). */
export const PRESENCE_VALUES = ['household', 'city', 'nearby', 'elsewhere', 'anywhere'] as const;
export type Presence = (typeof PRESENCE_VALUES)[number];

/** Kinds casting may create; family, partners and work relationships come from other systems. */
export const CREATABLE_KINDS = ['friend', 'classmate', 'acquaintance'] as const;

export const toneSchema = z.enum(['light', 'neutral', 'serious', 'dark']);
export type Tone = z.infer<typeof toneSchema>;
export const raritySchema = z.enum(['common', 'uncommon', 'rare', 'legendary']);
export type Rarity = z.infer<typeof raritySchema>;

/** A role name in an event's cast, used in placeholders as {role.name}. */
const roleSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'role names are lowerCamelCase, e.g. "npc" or "oldFriend"');

/** Comparison against a number; at least one bound. */
export const compareSchema = z
  .strictObject({
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    eq: z.number().optional(),
  })
  .refine((c) => Object.keys(c).length > 0, 'needs at least one of gt, gte, lt, lte, eq');
export type Compare = z.infer<typeof compareSchema>;

const compareFields = {
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  eq: z.number().optional(),
};
const hasBound = (c: Record<string, unknown>) => ['gt', 'gte', 'lt', 'lte', 'eq'].some((k) => c[k] !== undefined);

const flagValueSchema = z.union([z.number(), z.boolean(), z.string()]);

/**
 * Structured conditions (docs/technical.md, "Condition language"). Adding a
 * condition type means adding a case here and in src/engine/conditions.ts.
 */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { age: Compare }
  | { lifeStage: (typeof LIFE_STAGE_IDS)[number][] }
  | ({ stat: (typeof STAT_KEYS)[number] } & Compare)
  | ({ trait: (typeof TRAIT_KEYS)[number] } & Compare)
  | ({ hidden: (typeof HIDDEN_KEYS)[number] } & Compare)
  | { money: Compare }
  | { city: string }
  | { travel: { active?: boolean; destinationId?: string; kind?: 'trip' | 'study' | 'work'; style?: TripStyle; activity?: TripActivity; souvenir?: boolean; family?: boolean; business?: boolean; encounter?: boolean; romance?: boolean; companion?: boolean } }
  | { language: { id?: string; skill?: Compare; native?: boolean; role?: string; sharedWith?: string; count?: Compare; level?: 'basic' | 'conversational' | 'fluent'; teachableTo?: string; learnableFrom?: string; homeWith?: string; heritageLost?: true } }
  | { country: CountryId[] }
  | { migration: MigrationCondition }
  | { legalAge: keyof LegalAges }
  | { familyWealth: z.infer<typeof familyWealthSchema>[] }
  | { flag: string; eq?: number | boolean | string }
  | { fired: string }
  | { relative: { kind: z.infer<typeof relationshipKindSchema>; alive?: boolean } }
  | { romance: z.infer<typeof romanceStatusSchema>[] }
  | { finances: FinancesCondition }
  | { home: HomeCondition }
  | { education: EducationCondition }
  | { career: CareerCondition }
  | { record: RecordCondition }
  | { health: HealthCondition }
  | { mental: MentalCondition }
  | { legal: LegalCondition }
  | { discovery: DiscoveryCondition }
  | { family: FamilyCondition }
  | { belongings: BelongingsCondition }
  | { teen: TeenCondition }
  | { crime: CrimeCondition }
  | { fame: FameCondition }
  | { social: SocialCondition }
  | { sports: SportsCondition }
  | { later: LaterCondition }
  | { group: GroupCondition }
  | { business: BusinessCondition }
  | { faith: FaithCondition }
  | ({ value: (typeof VALUE_IDS)[number] } & Compare)
  | { memory: { role: string; tag: string } }
  | {
      role: string;
      alive?: boolean;
      age?: Compare;
      affection?: Compare;
      trust?: Compare;
      kind?: z.infer<typeof relationshipKindSchema>[];
      status?: z.infer<typeof relationshipStatusSchema>[];
      /** Years since the relationship took its current kind (dating, married...). */
      years?: Compare;
      /** C1: where they are: living with you, elsewhere in your city, or in another city. */
      where?: ('household' | 'city' | 'elsewhere')[];
      /** E2a: a child's grades this school year (0–4). */
      gpa?: Compare;
      /** E2a: your parenting style with this child (each line 0–100). */
      style?: Partial<Record<'warmth' | 'strictness' | 'involvement', Compare>>;
      /** E2a: where a child lives: with you, in shared custody, or with their other parent. */
      custody?: ('you' | 'shared' | 'other')[];
      /** E2a: a grown child has moved out (or not). */
      movedOut?: boolean;
      /** L1: how a child came to you: a grandchild you are raising has the origin `grandchild`. */
      origin?: ('birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step' | 'grandchild')[];
      /** W2: their faith against yours. */
      faith?: RoleFaithCondition;
      /** E3: their own life now (job, partner, children, troubles, care). */
      life?: LifeCondition;
      /** E4: what they have heard. */
      heard?: HeardCondition;
      /** M1: they have noticed you struggling (or not), and took it this way. */
      mental?: { noticed?: boolean; reaction?: ReactionId[] };
      /** B1: they are attracted to your gender category (true) or not (false). */
      attractedToYou?: boolean;
    }
  | { tie: TieCondition };

/**
 * W6, emigration and citizenship. Every field given must hold. settled: you moved to the country you live in and are
 * not a citizen (with or without papers); status: where you stand there (citizen, permanent, temporary, undocumented);
 * application: the state of your application ('none' for no application); kind and route: what it is for; via: how
 * your permit began; years: years since you arrived; dual: you hold two citizenships; remitting: you send money home;
 * relatives: someone close lives in another country than you; removed: a country has removed you; closeCall: this
 * year brought one; expiring: your permit ends this year; ruleChange: a window to ask for status is open; testFails:
 * citizenship tests failed; eligible: you could apply for this now; spouse: married to a citizen of where you live;
 * arrivedNow: you arrived this year; removedNow: a country removed you this year; childCitizen: a child of yours is a citizen of the country you live in and you are not.
 */
export interface MigrationCondition {
  settled?: boolean;
  status?: StatusKind[];
  application?: (ApplicationStatus | 'none')[];
  kind?: ApplicationKind[];
  route?: RouteId[];
  via?: (typeof STAY_ROUTES)[number][];
  years?: Compare;
  dual?: boolean;
  remitting?: boolean;
  relatives?: boolean;
  removed?: boolean;
  closeCall?: boolean;
  expiring?: boolean;
  ruleChange?: boolean;
  testFails?: Compare;
  eligible?: ('permanent' | 'naturalization' | 'regularization')[];
  spouse?: boolean;
  arrivedNow?: boolean;
  removedNow?: boolean;
  childCitizen?: boolean;
}

/**
 * E3: a cast person's own life. Every field given must hold. tier: how
 * closely their life is followed; employed: they have a job (or not);
 * partner: their partner's status, 'none' for no partner; ended: how their
 * last relationship ended, in the past year (their ex's name is then
 * {role.partner}); children: how many
 * they have; trouble: they have a trouble of one of these kinds right now;
 * serious: an illness or addiction at least as bad as the balance calls
 * serious; crime: a crime case at one of these stages; care: care for them
 * (needed, at your home, paid for by you, left to the family) or 'none';
 * wealth: their wealth level; recovered: they recovered from an addiction
 * within this many years.
 */
export interface LifeCondition {
  tier?: z.infer<typeof lifeTierSchema>[];
  employed?: boolean;
  partner?: ('dating' | 'engaged' | 'married' | 'none')[];
  ended?: ('broke_up' | 'divorced' | 'widowed')[];
  children?: Compare;
  trouble?: ('illness' | 'crime' | 'addiction')[];
  serious?: boolean;
  crime?: ('held' | 'bailed' | 'probation' | 'jail')[];
  care?: ('needed' | 'home' | 'paid' | 'sibling' | 'none')[];
  wealth?: z.infer<typeof familyWealthSchema>[];
  recovered?: number;
  /** W6: they moved to another country, and (papers) with or without papers. */
  emigrated?: boolean;
  papers?: boolean;
}

/**
 * T1, the teen years. Every field given must hold. clique: you belong to a
 * crowd at school (or don't); crowd: it is one of these (an id in
 * src/content/cliques); rival: your crowd has a rival crowd at your school;
 * clash: you are in a clash with one; invited: a crowd has noticed you;
 * standing: your standing at school (0-100); focus: where this year's energy
 * goes ('none': nothing chosen); passion: how far a passion has taken you;
 * license: your stage (none, permit, licensed); lessons: driving lessons and
 * practice so far; job: you have a teen job (or one of these); activity: you
 * belong to a team or club (or one of these); rules: how many
 * house rules there are; rule: a rule of this domain is set, at a level in
 * `level` (0 relaxed, 1 usual, 2 strict); caught: a parent caught you breaking
 * a rule this year (of this domain, if given); grounded: you are grounded;
 * restricted: you have lost this privilege; sealed: your juvenile record was sealed.
 */
export interface TeenCondition {
  clique?: boolean;
  crowd?: string[];
  rival?: boolean;
  clash?: boolean;
  invited?: boolean;
  standing?: Compare;
  focus?: (TeenFocusId | 'none')[];
  passion?: Compare;
  license?: (typeof LICENSE_STAGE_IDS)[number][];
  lessons?: Compare;
  job?: boolean | string[];
  activity?: boolean | string[];
  rules?: Compare;
  rule?: { domain: RuleDomainId; level?: Compare };
  caught?: boolean | RuleDomainId[];
  grounded?: boolean;
  restricted?: RuleDomainId[];
  sealed?: boolean;
}

/**
 * E6a, crime careers. Every field given must hold. member: you are in a crew;
 * former: you were in one and are not now; rank: your rank (1 to 5; 5 runs the
 * crew); leader: you run it; standing: your standing in it (0-100); heat: how
 * much police attention you carry (0-100); investigated: an investigation into
 * you is open; rivalry: how hot things are with the rival crew (0-100); rival:
 * your crew has a rival; informant: someone in your crew is talking to the
 * police; jobs: jobs you have done this year; years: years in the crew (or, for
 * a former member, years since you left); crew: you are in (or were in) one of
 * these crews; arrests: arrests so far in your life of crime. away: you live in
 * another city from your crew (your rank is frozen); awayYears: years you have
 * been away; suspicion: how much your crew suspects you ran or talked (0-100,
 * while you are away); returned: you came back to your crew's city this year;
 * local: a crew works in the city you live in now.
 */
export interface CrimeCondition {
  member?: boolean;
  former?: boolean;
  rank?: Compare;
  leader?: boolean;
  standing?: Compare;
  heat?: Compare;
  investigated?: boolean;
  rivalry?: Compare;
  rival?: boolean;
  informant?: boolean;
  jobs?: Compare;
  years?: Compare;
  crew?: string[];
  arrests?: Compare;
  away?: boolean;
  awayYears?: Compare;
  suspicion?: Compare;
  returned?: boolean;
  local?: boolean;
}

/**
 * E6b, fame in arts and media. Every field given must hold. active: you have a
 * career in one of the paths (and haven't retired); retired: you did; path:
 * your main path is one of these; second: you have crossed over into a second
 * path; rung / peak: your rung now, and the highest you reached (1 and up);
 * fame / image / mood: 0–100; fans: how many fans you have; commitment: your
 * setting; burnout: 0–100; agent: your agent's tier (0 for none); contract: you
 * are under contract; released: a project came out this year; last: how this
 * year's release was received; faded: you stand lower than your peak; gap:
 * years since your last project; years: years in the business; stalker: someone
 * is stalking you (or in this stage); ceremony: this year's awards night went
 * this way; tabloid: a tabloid ran a story about you this year; scandal: one
 * of them was about the scene you keep, not a secret; crossable: you
 * could cross over now; top: you are on the top rung; plan: you have a project
 * lined up.
 */
export interface FameCondition {
  /** E6c: your main path is a sport (true) or arts and media (false). */
  sport?: boolean;
  active?: boolean;
  retired?: boolean;
  path?: string[];
  second?: boolean;
  rung?: Compare;
  peak?: Compare;
  fame?: Compare;
  image?: Compare;
  mood?: Compare;
  fans?: Compare;
  commitment?: FameCommitment[];
  burnout?: Compare;
  agent?: Compare;
  contract?: boolean;
  released?: boolean;
  last?: FameBand[];
  faded?: boolean;
  gap?: Compare;
  years?: Compare;
  stalker?: boolean | FameStalkerStage[];
  ceremony?: ('won' | 'lost')[];
  tabloid?: boolean;
  scandal?: boolean;
  crossable?: boolean;
  top?: boolean;
  plan?: boolean;
  /** Batch 4: you are in a band; you lead it; this year's release was outside your sound; you went on tour as this year began; shows you played going into this year; you have a main genre; a band has asked you in. */
  band?: boolean;
  leader?: boolean;
  offGenre?: boolean;
  toured?: boolean;
  shows?: Compare;
  genre?: boolean;
  offer?: boolean;
}

/**
 * Batch 8, social media. Every field given must hold. account: you have at
 * least one; creator: you work in the social media career; platform: you have
 * an account on one of these; accounts / followers / top / engagement: how many
 * accounts, your followers in all, on your biggest account, and its engagement;
 * niche: your biggest account is about one of these; private: every account is
 * private; byParent: an account was set up by a parent (you opened it under
 * 18); monetized: a platform pays you; demonetized: one has stopped; sponsor:
 * you have a brand sponsorship; controversy: a row is brewing or has blown up
 * (or in this stage); happened: the social step made one of these happen as the
 * year began (the triggers of registries/social.yaml); promotable: you have
 * work you could promote.
 */
export interface SocialCondition {
  account?: boolean;
  creator?: boolean;
  platform?: string[];
  accounts?: Compare;
  followers?: Compare;
  top?: Compare;
  engagement?: Compare;
  niche?: string[];
  private?: boolean;
  byParent?: boolean;
  monetized?: boolean;
  demonetized?: boolean;
  sponsor?: boolean;
  controversy?: boolean | ('brewing' | 'cancelled')[];
  happened?: SocialTrigger[];
  promotable?: boolean;
}

/**
 * E6c, sports. Every field given must hold. active: your main path is a sport
 * and you play (haven't retired); sport: your sport is one of these paths;
 * level: youth, school, college or pro; position: your position; contract:
 * you are under a pro contract; contractYear: its last year is this one;
 * freeAgent: you have no team; run: a playoff run is alive; round: the series
 * you are about to play (1 to 3); result: how this year's playoffs went;
 * injured: a sports injury is keeping you from your best; pain: you are
 * playing through one; drafted / undrafted: the draft went this way for you
 * this year, and offered: a team has put a deal in front of you (pick: where you went); traded / released / agedOut / suspended: it happened this year;
 * rating: this year's rating (0–100); titles / seasons / allStars: career
 * totals; retired: you have left your sport; stage: the highest rung you
 * reached was below the pro level (true) or at it (false).
 */
export interface SportsCondition {
  active?: boolean;
  sport?: string[];
  level?: SportLevel[];
  position?: string[];
  contract?: boolean;
  contractYear?: boolean;
  freeAgent?: boolean;
  run?: boolean;
  round?: Compare;
  result?: SportResult[];
  injured?: boolean;
  pain?: boolean;
  drafted?: boolean;
  undrafted?: boolean;
  offered?: boolean;
  pick?: Compare;
  traded?: boolean;
  released?: boolean;
  agedOut?: boolean;
  suspended?: boolean;
  rating?: Compare;
  titles?: Compare;
  seasons?: Compare;
  allStars?: Compare;
  retired?: boolean;
  amateur?: boolean;
  /** Batch 5: a tryout is waiting to be played (the scrimmage events require it). */
  tryout?: boolean;
  /** How the latest tryout this year went: you made the team, a fallback took you, or none did. */
  tried?: TryoutResult[];
  /** A program's offer of an athletic scholarship is on the table (of one of these tiers), and whether you hold a scholarship now (`warned`: under the grade floor). */
  offers?: Tier[];
  scholarship?: boolean;
  warned?: boolean;
  /** Where you stand on the team; whether you captain it; whether you have picked a jersey number. */
  role?: SportRole[];
  captain?: boolean;
  number?: boolean;
  /** You have no team (a pro without a deal, or an amateur who left or was cut) / the draft passed you by and no team signed you. */
  teamless?: boolean;
  passed?: boolean;
  /** Old enough to be drafted, and still an amateur. */
  prospect?: boolean;
  /** Your combine points. */
  combine?: Compare;
  /** You play for a club or travel team alongside your school team. */
  club?: boolean;
  /** Batch 6: you are on loan at another club; you belong to a club's academy; the club promoted you from it this year; it let you go this year. */
  loan?: boolean;
  /** Your club has offered to send you on loan (you have not answered). */
  loanOffered?: boolean;
  academy?: boolean;
  /** Your academy is at a club in a country the game does not model (you commute to it). */
  academyAbroad?: boolean;
  graduated?: boolean;
  academyOut?: boolean;
  /** Clubs have offers on the table (the transfer window). */
  window?: boolean;
  /** The league your club plays in (1 is the top league, 2 the second), and whether it moved between them this year. */
  division?: (1 | 2)[];
  moved?: ('up' | 'down')[];
  /** The national side called you up this year; it is a year of the international tournament and you were called up. */
  calledUp?: boolean;
  tournament?: boolean;
  /** Your club has a rival (same city or region). */
  derby?: boolean;
  /** Your club plays away from the city you live in: in a city the game does not model yet, or in another country (you commute). */
  away?: ('city' | 'country')[];
  /** You moved to another country for a club this year. */
  abroad?: boolean;
  /** Games for the national side so far. */
  caps?: Compare;
  /** Your contract has a release clause. */
  clause?: boolean;
  /** The tryout waiting to be played is for a club's academy (`academy`), or for one in another country (`abroad`). */
  trial?: ('academy' | 'abroad')[];
}

/** Your money situation. Every field given must hold. */
export interface FinancesCondition {
  /** E6a: your dirty money (cash from crime you have not laundered). */
  dirty?: Compare;
  /** Total debt balance. */
  debt?: Compare;
  /** Most missed payments in a row on any one debt. */
  missed?: Compare;
  /** True: a debt is in collections; false: none is. */
  collections?: boolean;
  /** You have a debt of one of these kinds. */
  kinds?: z.infer<typeof debtKindSchema>[];
  lifestyle?: z.infer<typeof lifestyleSchema>[];
  /** Doing gig work (or not). */
  gig?: boolean;
  /** Filed for bankruptcy within this many years. */
  bankruptWithin?: number;
  /** Set up a debt plan within this many years. */
  planWithin?: number;
  /** Last year's gross income. */
  income?: Compare;
}

/** Where you live. Every field given must hold. */
export interface HomeCondition {
  kind?: z.infer<typeof housingKindSchema>[];
  /** Years since you moved into this home. */
  years?: Compare;
  /** Sharing a rental with a roommate (or not). */
  roommate?: boolean;
  /** Living in a different city from the one you were born in (or not). */
  relocated?: boolean;
  /** Your partner or spouse lives with you (or not). */
  partner?: boolean;
}

/** School and credentials (Stage 7). Every field given must hold. */
export interface EducationCondition {
  /** The program you're in now; 'none' when you're not in school. */
  program?: (z.infer<typeof programSchema> | 'none')[];
  /** College tier you're in now. */
  tier?: z.infer<typeof tierSchema>[];
  /** Your major now (college). */
  major?: string[];
  /** Your trade now (trade school). */
  trade?: string[];
  /** The year of your current program (1 is the first). */
  year?: Compare;
  /** In (or not in) the final year of your current program. */
  final?: boolean;
  /** GPA in your current program (0–4). */
  gpa?: Compare;
  /** You hold at least one of these credentials. */
  credential?: z.infer<typeof credentialTypeSchema>[];
  /**
   * You hold a credential in one of these majors, trades or grad programs
   * (Stage 8; of a type in `credential`, when that is given too).
   */
  field?: string[];
  /** You left a program before finishing it (and could go back), or not. */
  left?: boolean;
  /** You have a place to start at next year, or not. */
  admission?: boolean;
}

/** Your work (Stage 8). Every field given must hold. */
export interface CareerCondition {
  /** You have a job (or not). Gig work doesn't count. */
  employed?: boolean;
  /** Your job is in one of these tracks. */
  job?: string[];
  /** Your level in your job (1 is the first). */
  level?: Compare;
  /** Whole years since you were hired. */
  years?: Compare;
  /** Your job performance (0–100). */
  performance?: Compare;
  /** You're retired (or not). */
  retired?: boolean;
  /** You were fired or laid off within this many years. */
  lostWithin?: number;
}

export const RECORD_OUTCOMES = ['warning', 'fine', 'probation', 'jail'] as const;

/**
 * Your criminal record (records themselves arrive in Stage 9): you have an
 * entry on it (with one of these outcomes, from within this many years).
 * `{ record: {} }` is any record at all.
 */
export interface RecordCondition {
  outcome?: (typeof RECORD_OUTCOMES)[number][];
  within?: number;
}

/**
 * Your health (Stage 9): you have one of these conditions (any, when left
 * out), treated or not and of this severity, as given. Every field given
 * must hold for the same condition.
 */
export interface HealthCondition {
  conditions?: string[];
  treated?: boolean;
  severity?: Compare;
  /**
   * M1 (mental health and neurodivergence): `named` is true once it has been
   * diagnosed (false while it has shown only in your stats); `within`: the
   * diagnosis was in this year or the last N years; `care`: you care for it
   * in one of these ways now; `uncared`: you care for it in none.
   */
  named?: boolean;
  within?: number;
  care?: MentalCareId[];
  uncared?: boolean;
}

/**
 * M1: how your mind is doing, beyond the conditions. trauma: how much you
 * carry (0–100); support: how much your closest people give you (0–100);
 * crisis: you had a crisis within this many years (true: ever; false: never);
 * recovered: you recovered from one of these conditions (they can come
 * back); noticed: someone has noticed you struggling (or nobody has);
 * sideEffects: medication gave you a side effect in the past year.
 */
export interface MentalCondition {
  trauma?: Compare;
  support?: Compare;
  crisis?: number | boolean;
  recovered?: string[];
  noticed?: boolean;
  sideEffects?: boolean;
}

/** The law (Stage 9): in prison, on probation (or not). */
export interface LegalCondition {
  incarcerated?: boolean;
  probation?: boolean;
}

/**
 * W2, groups. Every field given must hold. With a group bound to the event
 * (`bindGroup`, or one the engine passes in), the fields describe that group
 * and your place in it; without one, `member` and the fields about a place in
 * a group hold for any group you belong to that fits every field given.
 * member: you belong to it (false: you don't, or, with no group bound,
 * belong to none of this type); count: how many groups you belong to; type,
 * def and religion: what kind of group (a faith group's religion);
 * commitment, rung (0 is a plain member), leader (at the top rung), years in,
 * standing (0–100); welcome, strict and intense: the group's own traits
 * (0–100); hours: the hours a week all your groups take.
 */
export interface GroupCondition {
  member?: boolean;
  count?: Compare;
  type?: (typeof GROUP_TYPES)[number][];
  def?: string[];
  religion?: string[];
  commitment?: (typeof COMMITMENTS)[number][];
  rung?: Compare;
  leader?: boolean;
  years?: Compare;
  standing?: Compare;
  welcome?: Compare;
  strict?: Compare;
  intense?: Compare;
  hours?: Compare;
  /** Your standing in your city beyond any one group (0–100). */
  community?: Compare;
}


/**
 * W3, businesses. Every field given must hold. With a business bound to the
 * event (`bindBusiness`, or one the engine passes in), the fields describe that
 * business; without one, `owned` and the fields about a business hold for any
 * business of yours that fits every field given.
 * owned: you own one (false: you own none, or none that fits); count: how many
 * you own; type and kind: what sort; style; role: run by you or a manager;
 * years: since it was founded; locations; staff: named workers (not counting a
 * manager); morale, reputation, quality (0–100); profit: last year's, in dollars;
 * cash: in the business; lossYears: years of loss in a row; chain; investors and
 * cofounder: someone else owns a share; loan: it has debts; manager: it has one;
 * licensed: someone holds the licence it needs (false: nobody does; a business
 * that needs none never fits); needsLicense; skimmed: a manager has taken money;
 * rival: a competitor is hurting it; failedWithin and soldWithin: you had one
 * fail or sold one within this many years; experience: years you have owned any.
 */
export interface BusinessCondition {
  owned?: boolean;
  count?: Compare;
  type?: string[];
  kind?: (typeof BUSINESS_KINDS)[number][];
  style?: (typeof BUSINESS_STYLES)[number][];
  role?: (typeof OWNER_ROLES)[number][];
  years?: Compare;
  locations?: Compare;
  staff?: Compare;
  morale?: Compare;
  reputation?: Compare;
  quality?: Compare;
  profit?: Compare;
  cash?: Compare;
  lossYears?: Compare;
  chain?: boolean;
  investors?: boolean;
  cofounder?: boolean;
  loan?: boolean;
  manager?: boolean;
  licensed?: boolean;
  needsLicense?: boolean;
  skimmed?: boolean;
  rival?: boolean;
  failedWithin?: number;
  soldWithin?: number;
  experience?: Compare;
  /** B2: a product it sells (any of these is on); the economy's phase; how its stock stood last year (short: a line ran out; surplus: a lot spoiled); heads; crew heads; franchises; the worst franchise's brand risk; a location has a manager; room for another named person; it has earned the right to sell franchises. */
  sells?: string[];
  economy?: (typeof ECONOMY_PHASES)[number][];
  stocked?: (typeof STOCK_STATES)[number][];
  headcount?: Compare;
  crew?: Compare;
  franchises?: Compare;
  brandRisk?: Compare;
  hasLocationManager?: boolean;
  namedRoom?: boolean;
  franchiseReady?: boolean;
  /** B2: last year's report said it was short of people or overworked. */
  understaffed?: boolean;
}

/**
 * W2, faith. Every field given must hold. id: your faith is one of these
 * ('none' for no faith); strength: how strongly you believe (0–100; 0 with no
 * faith); wavering: belief at or below the wavering line (with a faith);
 * devout: at or above the devout line; raised: the faith you were raised in
 * (or 'none'); changed: years since your faith last changed (never changed
 * does not hold); leaning: a pull toward another faith, or away from yours, you
 * haven't acted on (the latent trait); pull: which way it leans (find: toward a faith when you have
 * none, lose: away from the one you have, convert: toward another); congregation: you belong to a group of
 * your religion (false: you have a faith and none of its groups).
 */
export interface FaithCondition {
  id?: (string | 'none')[];
  strength?: Compare;
  wavering?: boolean;
  devout?: boolean;
  raised?: (string | 'none')[];
  changed?: Compare;
  leaning?: boolean;
  pull?: ('find' | 'lose' | 'convert')[];
  congregation?: boolean;
}

/** W2: the person in a role: their faith against yours, or what it is. */
export interface RoleFaithCondition {
  same?: boolean;
  none?: boolean;
  id?: (string | 'none')[];
  strength?: Compare;
}

/**
 * Self-discovery (Stage 9). latent: you have a latent trait of one of these
 * kinds; known: one of these latent traits has surfaced and you haven't
 * accepted it; innerConflict: how much you hold back; talent: a hidden talent
 * you haven't found ('hidden'), one you have ('found') or none at all.
 */
export interface DiscoveryCondition {
  latent?: (typeof LATENT_KINDS)[number][];
  known?: (typeof LATENT_KINDS)[number][];
  innerConflict?: Compare;
  talent?: 'hidden' | 'found' | 'none';
}

/**
 * Children and family (E2a). Every field given must hold. pregnant: you or
 * someone carrying your child is pregnant; children counts your living
 * children (not stepchildren), minors those under 18; youngest and oldest
 * their ages; process the adoption, IVF or surrogacy under way ('none': no
 * process); attempts the years of trying that haven't worked yet; canCarry
 * you can carry a pregnancy; support child support you 'pay' or 'receive'
 * (or 'none'); steps your living stepchildren; lost: you have lost a child.
 * E2b: heir: you carried on from a parent's life; generation: which one in your
 * family line (1 is the first); reputation: your family's reputation (0–100,
 * 50 is unremarkable); deeds: the family is known for one of these; guardian:
 * who a minor lives with (a parent, stepparent, grandparent, relative, older
 * sibling, 'foster' care or 'none'); trust: money is held in trust for you;
 * will: you have written a will.
 */
export interface FamilyCondition {
  pregnant?: boolean;
  children?: Compare;
  minors?: Compare;
  youngest?: Compare;
  oldest?: Compare;
  steps?: Compare;
  process?: (z.infer<typeof familyProcessSchema> | 'none')[];
  attempts?: Compare;
  canCarry?: boolean;
  support?: ('pay' | 'receive' | 'none')[];
  lost?: boolean;
  heir?: boolean;
  generation?: Compare;
  reputation?: Compare;
  deeds?: (typeof FAMILY_DEEDS)[number][];
  guardian?: ((typeof GUARDIAN_KINDS)[number] | 'foster' | 'none')[];
  trust?: boolean;
  will?: boolean;
}

/**
 * Later life (L1). Every field given must hold. grandchildren counts your
 * grandchildren who are alive and on your People list (not ones you are
 * raising, who are your children then), minors those under 18; raising: you
 * are raising a grandchild; care: you need care in your last years;
 * careOption: how it is provided ('none': needed, not arranged yet);
 * terminal: you have been told your death is coming (a diagnosis or a long
 * decline); hospice: where you chose to spend your last months ('none': not
 * chosen yet); wishes: you have set your final wishes; willOutOfDate: you have
 * no will, or it leaves out someone who matters (a child, a grandchild, a
 * spouse); amends: how many amends you have made.
 */
export interface LaterCondition {
  grandchildren?: Compare;
  minors?: Compare;
  raising?: boolean;
  care?: boolean;
  careOption?: ((typeof CARE_OPTIONS)[number] | 'none')[];
  terminal?: boolean;
  hospice?: ((typeof HOSPICE_CHOICES)[number] | 'none')[];
  wishes?: boolean;
  willOutOfDate?: boolean;
  amends?: Compare;
}

/**
 * E5, what you own. pets, vehicles and vacationHomes count them (a pet that
 * has died doesn't count). The other fields describe one pet, one vehicle or
 * one home: the one the event is about (it binds it, see `bind`), or, in a
 * requirement that doesn't bind, any that fits every field given. species,
 * personality, petAge, petHealth, petBond and petIll are about a pet;
 * vehicleKind, vehicleDef, vehicleAge, vehicleCondition, insured and loan
 * about a vehicle (insured: it is; loan: a car loan is being paid on it);
 * renovated: a home you own has been renovated (the one you live in or a
 * vacation home; bound to one, that one); claims: insurance claims
 * in the years that count toward the premium.
 */
export interface BelongingsCondition {
  pets?: Compare;
  vehicles?: Compare;
  vacationHomes?: Compare;
  species?: string[];
  personality?: (typeof PET_PERSONALITIES)[number][];
  petAge?: Compare;
  petHealth?: Compare;
  petBond?: Compare;
  petIll?: boolean;
  vehicleKind?: (typeof VEHICLE_KINDS)[number][];
  vehicleDef?: string[];
  vehicleAge?: Compare;
  vehicleCondition?: Compare;
  insured?: boolean;
  loan?: boolean;
  renovated?: boolean;
  claims?: Compare;
  /** Batch 2a: valuables you own (a count), the class of the one the event is about or any you own, and whether it is insured. */
  valuables?: Compare;
  valuableClass?: (typeof VALUABLE_CLASSES)[number][];
  valuableInsured?: boolean;
}

const atLeastOneField = (c: Record<string, unknown>) => Object.values(c).some((v) => v !== undefined);
const lifeConditionSchema = z
  .strictObject({
    tier: z.array(lifeTierSchema).min(1).optional(),
    employed: z.boolean().optional(),
    partner: z.array(z.enum(['dating', 'engaged', 'married', 'none'])).min(1).optional(),
    ended: z.array(z.enum(['broke_up', 'divorced', 'widowed'])).min(1).optional(),
    children: compareSchema.optional(),
    trouble: z.array(z.enum(['illness', 'crime', 'addiction'])).min(1).optional(),
    serious: z.boolean().optional(),
    crime: z.array(z.enum(['held', 'bailed', 'probation', 'jail'])).min(1).optional(),
    care: z.array(z.enum(['needed', 'home', 'paid', 'sibling', 'none'])).min(1).optional(),
    wealth: z.array(familyWealthSchema).min(1).optional(),
    recovered: z.int().min(1).max(50).optional(),
    emigrated: z.boolean().optional(),
    papers: z.boolean().optional(),
  })
  .refine(atLeastOneField, 'needs at least one field');
/** E4: what a person has heard about you (or about someone else): a kind of knowledge, a version, how they came to know it. */
const heardConditionSchema = z
  .strictObject({
    kinds: z.array(knowledgeKindSchema).min(1).optional(),
    versions: z.array(idSchema).min(1).optional(),
    /** They believe a version that isn't the true one (or, false, the true one). */
    distorted: z.boolean().optional(),
    /** The item is a secret kind. */
    secret: z.boolean().optional(),
    /** The version they heard is a funny one. */
    light: z.boolean().optional(),
    /** Who told them: you, nobody (they saw it), or another person (gossip). */
    learned: z.array(z.enum(['you', 'saw', 'gossip'])).min(1).optional(),
    /** They haven't reacted to it yet. */
    fresh: z.boolean().optional(),
  })
  .refine(atLeastOneField, 'needs at least one field');
export interface HeardCondition {
  kinds?: KnowledgeKindId[];
  versions?: string[];
  distorted?: boolean;
  secret?: boolean;
  light?: boolean;
  learned?: ('you' | 'saw' | 'gossip')[];
  fresh?: boolean;
}

/** E4: the tie between two cast people. */
const tieConditionSchema = z
  .strictObject({
    a: roleSchema,
    b: roleSchema,
    kind: z.array(tieKindSchema).min(1).optional(),
    status: z.array(tieStatusSchema).min(1).optional(),
    /** Years the feud has lasted. */
    feudYears: compareSchema.optional(),
    /** You have taken a side (true), or haven't (false). */
    sided: z.boolean().optional(),
    /** You said you would stay out of it. */
    neutral: z.boolean().optional(),
  })
  .refine((t) => t.a !== t.b, 'a tie is between two different roles');
export interface TieCondition {
  a: string;
  b: string;
  kind?: TieKindId[];
  status?: TieStatusId[];
  feudYears?: Compare;
  sided?: boolean;
  neutral?: boolean;
}

const latentKindSchema = z.enum(LATENT_KINDS);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
    z.strictObject({ age: compareSchema }),
    z.strictObject({ lifeStage: z.array(lifeStageSchema).min(1) }),
    z.strictObject({ stat: z.enum(STAT_KEYS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({ trait: z.enum(TRAIT_KEYS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({ hidden: z.enum(HIDDEN_KEYS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({ money: compareSchema }),
    z.strictObject({ city: idSchema }),
    z.strictObject({ travel: z.strictObject({ active: z.boolean().optional(), destinationId: idSchema.optional(), kind: z.enum(['trip', 'study', 'work']).optional(), style: z.enum(TRIP_STYLES).optional(), activity: z.enum(TRIP_ACTIVITIES).optional(), souvenir: z.boolean().optional(), family: z.boolean().optional(), business: z.boolean().optional(), encounter: z.boolean().optional(), romance: z.boolean().optional(), companion: z.boolean().optional() }) }),
    z.strictObject({
      language: z
        .strictObject({
          id: idSchema.optional(), skill: compareSchema.optional(), native: z.boolean().optional(), role: idSchema.optional(), sharedWith: idSchema.optional(),
          // Batch 10: how many languages you speak at a level (certificates count); a language you could pass on to a child, or practice with a person; a heritage language you have lost.
          count: compareSchema.optional(), level: z.enum(['basic', 'conversational', 'fluent']).optional(), teachableTo: idSchema.optional(), learnableFrom: idSchema.optional(), homeWith: idSchema.optional(), heritageLost: z.literal(true).optional(),
        })
        .refine((l) => l.id !== undefined || l.sharedWith !== undefined || l.count !== undefined || l.teachableTo !== undefined || l.learnableFrom !== undefined || l.homeWith !== undefined || l.heritageLost !== undefined, 'needs id, sharedWith, count, teachableTo, learnableFrom, homeWith or heritageLost')
        .refine((l) => (l.count === undefined) === (l.level === undefined), 'count and level go together'),
    }),
    z.strictObject({ country: z.array(countryIdSchema).min(1) }),
    z.strictObject({
      migration: z.strictObject({
        settled: z.boolean().optional(),
        status: z.array(z.enum(STATUS_KINDS)).min(1).optional(),
        application: z.array(z.enum([...APPLICATION_STATUSES, 'none'])).min(1).optional(),
        kind: z.array(z.enum(APPLICATION_KINDS)).min(1).optional(),
        route: z.array(z.enum(ROUTES)).min(1).optional(),
        via: z.array(z.enum(STAY_ROUTES)).min(1).optional(),
        years: compareSchema.optional(),
        dual: z.boolean().optional(),
        remitting: z.boolean().optional(),
        relatives: z.boolean().optional(),
        removed: z.boolean().optional(),
        closeCall: z.boolean().optional(),
        expiring: z.boolean().optional(),
        ruleChange: z.boolean().optional(),
        testFails: compareSchema.optional(),
        eligible: z.array(z.enum(['permanent', 'naturalization', 'regularization'])).min(1).optional(),
        spouse: z.boolean().optional(),
        arrivedNow: z.boolean().optional(),
        removedNow: z.boolean().optional(),
        childCitizen: z.boolean().optional(),
      }).refine((m) => Object.keys(m).length > 0, 'needs at least one field'),
    }),
    z.strictObject({ legalAge: z.enum(['drinking', 'gambling', 'driving', 'permit', 'marriage']) }),
    z.strictObject({ familyWealth: z.array(familyWealthSchema).min(1) }),
    z.strictObject({ flag: idSchema, eq: flagValueSchema.optional() }),
    z.strictObject({ fired: idSchema }),
    z.strictObject({ relative: z.strictObject({ kind: relationshipKindSchema, alive: z.boolean().optional() }) }),
    z.strictObject({ romance: z.array(romanceStatusSchema).min(1) }),
    z.strictObject({
      finances: z
        .strictObject({
          debt: compareSchema.optional(),
          missed: compareSchema.optional(),
          collections: z.boolean().optional(),
          kinds: z.array(debtKindSchema).min(1).optional(),
          lifestyle: z.array(lifestyleSchema).min(1).optional(),
          gig: z.boolean().optional(),
          bankruptWithin: z.int().min(1).max(100).optional(),
          planWithin: z.int().min(1).max(100).optional(),
          income: compareSchema.optional(),
          dirty: compareSchema.optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      home: z
        .strictObject({
          kind: z.array(housingKindSchema).min(1).optional(),
          years: compareSchema.optional(),
          roommate: z.boolean().optional(),
          relocated: z.boolean().optional(),
          partner: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      education: z
        .strictObject({
          program: z.array(z.union([programSchema, z.literal('none')])).min(1).optional(),
          tier: z.array(tierSchema).min(1).optional(),
          major: z.array(idSchema).min(1).optional(),
          trade: z.array(idSchema).min(1).optional(),
          year: compareSchema.optional(),
          final: z.boolean().optional(),
          gpa: compareSchema.optional(),
          credential: z.array(credentialTypeSchema).min(1).optional(),
          field: z.array(idSchema).min(1).optional(),
          left: z.boolean().optional(),
          admission: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      career: z
        .strictObject({
          employed: z.boolean().optional(),
          job: z.array(idSchema).min(1).optional(),
          level: compareSchema.optional(),
          years: compareSchema.optional(),
          performance: compareSchema.optional(),
          retired: z.boolean().optional(),
          lostWithin: z.int().min(1).max(100).optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      record: z.strictObject({
        outcome: z.array(z.enum(RECORD_OUTCOMES)).min(1).optional(),
        within: z.int().min(1).max(120).optional(),
      }),
    }),
    z.strictObject({
      health: z
        .strictObject({
          conditions: z.array(idSchema).min(1).optional(),
          treated: z.boolean().optional(),
          severity: compareSchema.optional(),
          named: z.boolean().optional(),
          within: z.int().min(0).max(100).optional(),
          care: z.array(mentalCareSchema).min(1).optional(),
          uncared: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      mental: z
        .strictObject({
          trauma: compareSchema.optional(),
          support: compareSchema.optional(),
          crisis: z.union([z.int().min(1).max(100), z.boolean()]).optional(),
          recovered: z.array(idSchema).min(1).optional(),
          noticed: z.boolean().optional(),
          sideEffects: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      legal: z
        .strictObject({ incarcerated: z.boolean().optional(), probation: z.boolean().optional() })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      discovery: z
        .strictObject({
          latent: z.array(latentKindSchema).min(1).optional(),
          known: z.array(latentKindSchema).min(1).optional(),
          innerConflict: compareSchema.optional(),
          talent: z.enum(['hidden', 'found', 'none']).optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      family: z
        .strictObject({
          pregnant: z.boolean().optional(),
          children: compareSchema.optional(),
          minors: compareSchema.optional(),
          youngest: compareSchema.optional(),
          oldest: compareSchema.optional(),
          steps: compareSchema.optional(),
          process: z.array(z.union([familyProcessSchema, z.literal('none')])).min(1).optional(),
          attempts: compareSchema.optional(),
          canCarry: z.boolean().optional(),
          support: z.array(z.enum(['pay', 'receive', 'none'])).min(1).optional(),
          lost: z.boolean().optional(),
          heir: z.boolean().optional(),
          generation: compareSchema.optional(),
          reputation: compareSchema.optional(),
          deeds: z.array(z.enum(FAMILY_DEEDS)).min(1).optional(),
          guardian: z.array(z.enum([...GUARDIAN_KINDS, 'foster', 'none'])).min(1).optional(),
          trust: z.boolean().optional(),
          will: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      teen: z
        .strictObject({
          clique: z.boolean().optional(),
          crowd: z.array(idSchema).min(1).optional(),
          rival: z.boolean().optional(),
          clash: z.boolean().optional(),
          invited: z.boolean().optional(),
          standing: compareSchema.optional(),
          focus: z.array(z.enum(FOCUS_KEYS)).min(1).optional(),
          passion: compareSchema.optional(),
          license: z.array(z.enum(LICENSE_STAGE_IDS)).min(1).optional(),
          lessons: compareSchema.optional(),
          job: z.union([z.boolean(), z.array(idSchema).min(1)]).optional(),
          activity: z.union([z.boolean(), z.array(idSchema).min(1)]).optional(),
          rules: compareSchema.optional(),
          rule: z.strictObject({ domain: ruleDomainSchema, level: compareSchema.optional() }).optional(),
          caught: z.union([z.boolean(), z.array(ruleDomainSchema).min(1)]).optional(),
          grounded: z.boolean().optional(),
          restricted: z.array(ruleDomainSchema).min(1).optional(),
          sealed: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      crime: z
        .strictObject({
          member: z.boolean().optional(),
          former: z.boolean().optional(),
          rank: compareSchema.optional(),
          leader: z.boolean().optional(),
          standing: compareSchema.optional(),
          heat: compareSchema.optional(),
          investigated: z.boolean().optional(),
          rivalry: compareSchema.optional(),
          rival: z.boolean().optional(),
          informant: z.boolean().optional(),
          jobs: compareSchema.optional(),
          years: compareSchema.optional(),
          crew: z.array(idSchema).min(1).optional(),
          arrests: compareSchema.optional(),
          away: z.boolean().optional(),
          awayYears: compareSchema.optional(),
          suspicion: compareSchema.optional(),
          returned: z.boolean().optional(),
          local: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      fame: z
        .strictObject({
          sport: z.boolean().optional(),
          active: z.boolean().optional(),
          retired: z.boolean().optional(),
          path: z.array(idSchema).min(1).optional(),
          second: z.boolean().optional(),
          rung: compareSchema.optional(),
          peak: compareSchema.optional(),
          fame: compareSchema.optional(),
          image: compareSchema.optional(),
          mood: compareSchema.optional(),
          fans: compareSchema.optional(),
          commitment: z.array(fameCommitmentSchema).min(1).optional(),
          burnout: compareSchema.optional(),
          agent: compareSchema.optional(),
          contract: z.boolean().optional(),
          released: z.boolean().optional(),
          last: z.array(fameBandSchema).min(1).optional(),
          faded: z.boolean().optional(),
          gap: compareSchema.optional(),
          years: compareSchema.optional(),
          stalker: z.union([z.boolean(), z.array(z.enum(FAME_STALKER_STAGES)).min(1)]).optional(),
          ceremony: z.array(z.enum(['won', 'lost'])).min(1).optional(),
          tabloid: z.boolean().optional(),
          scandal: z.boolean().optional(),
          crossable: z.boolean().optional(),
          top: z.boolean().optional(),
          plan: z.boolean().optional(),
          band: z.boolean().optional(),
          leader: z.boolean().optional(),
          offGenre: z.boolean().optional(),
          toured: z.boolean().optional(),
          shows: compareSchema.optional(),
          genre: z.boolean().optional(),
          offer: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      social: z
        .strictObject({
          account: z.boolean().optional(),
          creator: z.boolean().optional(),
          platform: z.array(idSchema).min(1).optional(),
          accounts: compareSchema.optional(),
          followers: compareSchema.optional(),
          top: compareSchema.optional(),
          engagement: compareSchema.optional(),
          niche: z.array(idSchema).min(1).optional(),
          private: z.boolean().optional(),
          byParent: z.boolean().optional(),
          monetized: z.boolean().optional(),
          demonetized: z.boolean().optional(),
          sponsor: z.boolean().optional(),
          controversy: z.union([z.boolean(), z.array(z.enum(['brewing', 'cancelled'])).min(1)]).optional(),
          happened: z.array(z.enum(SOCIAL_TRIGGERS)).min(1).optional(),
          promotable: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      sports: z
        .strictObject({
          active: z.boolean().optional(),
          sport: z.array(idSchema).min(1).optional(),
          level: z.array(z.enum(SPORT_LEVELS)).min(1).optional(),
          position: z.array(idSchema).min(1).optional(),
          contract: z.boolean().optional(),
          contractYear: z.boolean().optional(),
          freeAgent: z.boolean().optional(),
          run: z.boolean().optional(),
          round: compareSchema.optional(),
          result: z.array(z.enum(SPORT_RESULTS)).min(1).optional(),
          injured: z.boolean().optional(),
          pain: z.boolean().optional(),
          drafted: z.boolean().optional(),
          undrafted: z.boolean().optional(),
          offered: z.boolean().optional(),
          pick: compareSchema.optional(),
          traded: z.boolean().optional(),
          released: z.boolean().optional(),
          agedOut: z.boolean().optional(),
          suspended: z.boolean().optional(),
          rating: compareSchema.optional(),
          titles: compareSchema.optional(),
          seasons: compareSchema.optional(),
          allStars: compareSchema.optional(),
          retired: z.boolean().optional(),
          amateur: z.boolean().optional(),
          tryout: z.boolean().optional(),
          tried: z.array(z.enum(TRYOUT_RESULTS)).min(1).optional(),
          offers: z.array(tierSchema).min(1).optional(),
          scholarship: z.boolean().optional(),
          warned: z.boolean().optional(),
          role: z.array(z.enum(SPORT_ROLES)).min(1).optional(),
          captain: z.boolean().optional(),
          number: z.boolean().optional(),
          teamless: z.boolean().optional(),
          passed: z.boolean().optional(),
          prospect: z.boolean().optional(),
          combine: compareSchema.optional(),
          club: z.boolean().optional(),
          loan: z.boolean().optional(),
          loanOffered: z.boolean().optional(),
          academy: z.boolean().optional(),
          academyAbroad: z.boolean().optional(),
          graduated: z.boolean().optional(),
          academyOut: z.boolean().optional(),
          window: z.boolean().optional(),
          division: z.array(z.union([z.literal(1), z.literal(2)])).min(1).optional(),
          moved: z.array(z.enum(['up', 'down'])).min(1).optional(),
          calledUp: z.boolean().optional(),
          tournament: z.boolean().optional(),
          derby: z.boolean().optional(),
          away: z.array(z.enum(['city', 'country'])).min(1).optional(),
          abroad: z.boolean().optional(),
          caps: compareSchema.optional(),
          clause: z.boolean().optional(),
          trial: z.array(z.enum(['academy', 'abroad'])).min(1).optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      group: z
        .strictObject({
          member: z.boolean().optional(),
          count: compareSchema.optional(),
          type: z.array(z.enum(GROUP_TYPES)).min(1).optional(),
          def: z.array(idSchema).min(1).optional(),
          religion: z.array(idSchema).min(1).optional(),
          commitment: z.array(z.enum(COMMITMENTS)).min(1).optional(),
          rung: compareSchema.optional(),
          leader: z.boolean().optional(),
          years: compareSchema.optional(),
          standing: compareSchema.optional(),
          welcome: compareSchema.optional(),
          strict: compareSchema.optional(),
          intense: compareSchema.optional(),
          hours: compareSchema.optional(),
          community: compareSchema.optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      business: z
        .strictObject({
          owned: z.boolean().optional(),
          count: compareSchema.optional(),
          type: z.array(idSchema).min(1).optional(),
          kind: z.array(z.enum(BUSINESS_KINDS)).min(1).optional(),
          style: z.array(z.enum(BUSINESS_STYLES)).min(1).optional(),
          role: z.array(z.enum(OWNER_ROLES)).min(1).optional(),
          years: compareSchema.optional(),
          locations: compareSchema.optional(),
          staff: compareSchema.optional(),
          morale: compareSchema.optional(),
          reputation: compareSchema.optional(),
          quality: compareSchema.optional(),
          profit: compareSchema.optional(),
          cash: compareSchema.optional(),
          lossYears: compareSchema.optional(),
          chain: z.boolean().optional(),
          investors: z.boolean().optional(),
          cofounder: z.boolean().optional(),
          loan: z.boolean().optional(),
          manager: z.boolean().optional(),
          licensed: z.boolean().optional(),
          needsLicense: z.boolean().optional(),
          skimmed: z.boolean().optional(),
          rival: z.boolean().optional(),
          failedWithin: z.int().min(0).max(40).optional(),
          soldWithin: z.int().min(0).max(40).optional(),
          experience: compareSchema.optional(),
          sells: z.array(idSchema).min(1).optional(),
          economy: z.array(z.enum(ECONOMY_PHASES)).min(1).optional(),
          stocked: z.array(z.enum(STOCK_STATES)).min(1).optional(),
          headcount: compareSchema.optional(),
          crew: compareSchema.optional(),
          franchises: compareSchema.optional(),
          brandRisk: compareSchema.optional(),
          hasLocationManager: z.boolean().optional(),
          namedRoom: z.boolean().optional(),
          franchiseReady: z.boolean().optional(),
          understaffed: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      faith: z
        .strictObject({
          id: z.array(idSchema).min(1).optional(),
          strength: compareSchema.optional(),
          wavering: z.boolean().optional(),
          devout: z.boolean().optional(),
          raised: z.array(idSchema).min(1).optional(),
          changed: compareSchema.optional(),
          leaning: z.boolean().optional(),
          pull: z.array(z.enum(['find', 'lose', 'convert'])).min(1).optional(),
          congregation: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({ value: z.enum(VALUE_IDS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({
      later: z
        .strictObject({
          grandchildren: compareSchema.optional(),
          minors: compareSchema.optional(),
          raising: z.boolean().optional(),
          care: z.boolean().optional(),
          careOption: z.array(z.enum([...CARE_OPTIONS, 'none'])).min(1).optional(),
          terminal: z.boolean().optional(),
          hospice: z.array(z.enum([...HOSPICE_CHOICES, 'none'])).min(1).optional(),
          wishes: z.boolean().optional(),
          willOutOfDate: z.boolean().optional(),
          amends: compareSchema.optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({ memory: z.strictObject({ role: roleSchema, tag: idSchema }) }),
    z.strictObject({
      role: roleSchema,
      alive: z.boolean().optional(),
      age: compareSchema.optional(),
      affection: compareSchema.optional(),
      trust: compareSchema.optional(),
      kind: z.array(relationshipKindSchema).min(1).optional(),
      status: z.array(relationshipStatusSchema).min(1).optional(),
      years: compareSchema.optional(),
      where: z.array(z.enum(['household', 'city', 'elsewhere'])).min(1).optional(),
      gpa: compareSchema.optional(),
      style: z.partialRecord(parentingKeySchema, compareSchema).optional(),
      custody: z.array(z.enum(['you', 'shared', 'other'])).min(1).optional(),
      movedOut: z.boolean().optional(),
      origin: z.array(z.enum(['birth', 'adopted', 'ivf', 'surrogacy', 'step', 'grandchild'])).min(1).optional(),
      faith: z
        .strictObject({ same: z.boolean().optional(), none: z.boolean().optional(), id: z.array(idSchema).min(1).optional(), strength: compareSchema.optional() })
        .refine(atLeastOneField, 'needs at least one field')
        .optional(),
      life: lifeConditionSchema.optional(),
      heard: heardConditionSchema.optional(),
      attractedToYou: z.boolean().optional(),
      mental: z
        .strictObject({ noticed: z.boolean().optional(), reaction: z.array(reactionSchema).min(1).optional() })
        .refine(atLeastOneField, 'needs at least one field')
        .optional(),
    }),
    z.strictObject({ tie: tieConditionSchema }),
    z.strictObject({
      belongings: z
        .strictObject({
          pets: compareSchema.optional(),
          vehicles: compareSchema.optional(),
          vacationHomes: compareSchema.optional(),
          species: z.array(idSchema).min(1).optional(),
          personality: z.array(z.enum(PET_PERSONALITIES)).min(1).optional(),
          petAge: compareSchema.optional(),
          petHealth: compareSchema.optional(),
          petBond: compareSchema.optional(),
          petIll: z.boolean().optional(),
          vehicleKind: z.array(z.enum(VEHICLE_KINDS)).min(1).optional(),
          vehicleDef: z.array(idSchema).min(1).optional(),
          vehicleAge: compareSchema.optional(),
          vehicleCondition: compareSchema.optional(),
          insured: z.boolean().optional(),
          loan: z.boolean().optional(),
          renovated: z.boolean().optional(),
          claims: compareSchema.optional(),
          valuables: compareSchema.optional(),
          valuableClass: z.array(z.enum(VALUABLE_CLASSES)).min(1).optional(),
          valuableInsured: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
  ]),
) as z.ZodType<Condition>;

const rangeSchema = z
  .strictObject({ min: z.int(), max: z.int() })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** How an event finds (or creates) the person for one role. */
export const castSpecSchema = z
  .strictObject({
    /** Someone with this relationship to you. Every role needs a kind, unless it is a support role. */
    kind: relationshipKindSchema.optional(),
    /**
     * A support role: the most trusted person who would step in for you
     * (trust and affection from balance/relationships.yaml support), of any
     * close kind. Never creates anyone.
     */
    support: z.boolean().optional(),
    /**
     * M1: someone who has noticed you struggling and took it one of these
     * ways (supportive, neutral, dismissive), closest first. It may also name
     * a `kind` (the parent who noticed); on its own it needs no kind. It never creates anyone.
     */
    noticed: z.array(reactionSchema).min(1).optional(),
    /**
     * A potential partner: an adult you're attracted to who is attracted to
     * you, found or (with createIfMissing) created. Never family.
     */
    romantic: z.boolean().optional(),
    /**
     * Someone who is attracted to you, of a gender you're not (yet) attracted
     * to: the other person in a "try it and decide" moment (Stage 9). An
     * adult, never family; found or (with createIfMissing) created, leaning
     * toward a gender your latent attraction includes. A romance role: the
     * event is adults only.
     */
    admirer: z.boolean().optional(),
    /**
     * When nobody fits, the event still happens with this role empty. The role
     * may then only be used in choices whose visibleIf requires it ({ role: name }).
     */
    optional: z.boolean().optional(),
    /** Their age minus yours, for existing people and new ones. */
    ageOffset: rangeSchema.optional(),
    /** Their age in years, for existing people and new ones. */
    age: rangeSchema.optional(),
    /** Create someone new when nobody fits (friend, classmate or acquaintance only). */
    createIfMissing: z.boolean().optional(),
    /** Chance of creating someone new even when someone fits. */
    newChance: z.number().min(0).max(1).optional(),
    /**
     * Where the person must be (C1, the presence rule): living with you
     * (household), in your city but not with you (city), either of those
     * (nearby, for in-person moments), in another city (elsewhere), or
     * anywhere at all. Casting picks only people who fit,
     * a scheduled follow-up whose person no longer fits doesn't happen, and
     * someone new is created in your city (so never for elsewhere or household).
     */
    presence: z.enum(PRESENCE_VALUES),
    /**
     * E2a: someone who has died (a child, in the events about losing them).
     * Never found by casting: the engine (or a scheduled follow-up) passes
     * them in. Needs presence anywhere, and the role can't be used in the
     * conditions or choices of someone alive.
     */
    deceased: z.literal(true).optional(),
    /**
     * T1: someone from a crowd at your school: your own crowd (yours) or the
     * crowd it is at odds with (rival). The person is one of its members (a
     * friend or classmate of yours), found only, never created.
     */
    crowd: z.enum(['yours', 'rival']).optional(),
    /**
     * E6a: someone from a crew: your own crew (yours), the person who runs it
     * above you (boss), the member who is talking to the police (informant),
     * or a person from the rival crew (rival, who may be created: they are met, not known).
     */
    crew: z.enum(['yours', 'boss', 'informant', 'rival']).optional(),
    /**
     * E6b: a fan person of yours: a superfan, a hater or a critic. Found among
     * the ones you already have, or (createIfMissing) made on the spot and
     * added to them. `stalker` is the superfan who has crossed the line.
     */
    fan: z.enum([...FAME_FAN_TYPES, 'stalker']).optional(),
    /**
     * W2: someone from a group of yours: a member of the group the event is
     * about (or, with none bound, of any group you belong to). A friend,
     * found only, never created.
     */
    group: z.literal('yours').optional(),
    /**
     * W3: someone from the business the event is about (or, with none bound,
     * any business of yours): a worker, its manager, an investor, its
     * co-founder or a worker who holds its licence. Found, never created, and
     * they need no kind.
     */
    business: z.enum(BUSINESS_PEOPLE).optional(),
    /**
     * Batch 4: someone from your band: a member (or the one who leads it, when
     * you don't). A friend, found only, never created (the fame step names the
     * member a band event is about).
     */
    band: z.enum(['member', 'leader']).optional(),
    /**
     * Batch 6: a person made for this role takes the name pool of the country your team plays in (a club in a country the game
     * does not model, or the country of its city) instead of your city's. Only for a role that may be created.
     */
    heritage: z.literal('team').optional(),
  })
  .refine((s) => (s.kind !== undefined && s.support === true) === false && (s.kind !== undefined || s.support === true || s.noticed !== undefined || s.business !== undefined), 'a role needs one of kind or support: true (or noticed, alone or with a kind; or business)')
  .refine((s) => s.deceased !== true || (s.presence === 'anywhere' && s.support !== true && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined), 'a deceased role has presence anywhere and is only passed in')
  .refine(
    (s) => (s.support !== true && s.noticed === undefined) || (!s.createIfMissing && s.newChance === undefined && !s.romantic && !s.admirer),
    'a support or noticed role finds someone you know: no createIfMissing, newChance, romantic or admirer',
  )
  .refine((s) => !(s.romantic && s.admirer), 'a role is romantic or an admirer, not both')
  .refine(
    (s) => s.crowd === undefined || ((s.kind === 'friend' || s.kind === 'classmate') && !s.support && !s.noticed && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined),
    'a crowd role is a friend or classmate who is found, never created, and not a support, noticed, romantic or admirer role',
  )
  .refine(
    (s) => s.crew === undefined || (!s.crowd && !s.support && !s.noticed && !s.romantic && !s.admirer && (s.crew === 'rival' ? s.kind === 'acquaintance' : s.kind === 'friend') && (s.crew === 'rival' || (!s.createIfMissing && s.newChance === undefined))),
    'a crew role is a friend (your crew, boss or informant: found, never created) or an acquaintance (rival), and not a crowd, support, noticed, romantic or admirer role',
  )
  .refine(
    (s) => s.group === undefined || (s.kind === 'friend' && !s.crew && !s.crowd && !s.fan && !s.support && !s.noticed && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined),
    'a group role is a friend who is found, never created, and not a crew, crowd, fan, support, noticed, romantic or admirer role',
  )
  .refine(
    (s) => s.business === undefined || (s.kind === undefined && !s.crew && !s.crowd && !s.fan && !s.group && !s.support && !s.noticed && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined),
    'a business role is found, never created, and has no kind and is not a crew, crowd, fan, group, support, noticed, romantic or admirer role',
  )
  .refine(
    (s) => s.band === undefined || (s.kind === 'friend' && !s.crew && !s.crowd && !s.fan && !s.group && s.business === undefined && !s.support && !s.noticed && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined),
    'a band role is a friend who is found, never created, and not a crew, crowd, fan, group, business, support, noticed, romantic or admirer role',
  )
  .refine((s) => s.heritage === undefined || (s.createIfMissing === true || s.newChance !== undefined), 'a heritage role is made up for the team: it needs createIfMissing or newChance')
  .refine(
    (s) => s.fan === undefined || (s.kind === 'acquaintance' && !s.crew && !s.crowd && !s.support && !s.noticed && !s.romantic && !s.admirer && (s.fan !== 'stalker' || (!s.createIfMissing && s.newChance === undefined))),
    'a fan role is an acquaintance (a stalker is found, never created) and not a crew, crowd, support, noticed, romantic or admirer role: fans are never romantic',
  );
export type CastSpec = z.infer<typeof castSpecSchema>;

const statKeySchema = scoreKeySchema;

/** What an identity effect can change (Stage 9). */
export const IDENTITY_FIELDS = ['attraction', 'gender', 'expression', 'pronouns', 'personality'] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/** Effect types. Adding one means a schema here and a handler in src/engine/events/effects.ts. */
export const effectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('language'), id: idSchema }),
  /**
   * Batch 10: language skill from a person or a child. `practice`: skill in the language of the person cast in `role` that you are
   * weakest at (a share of the practice gain, by `size`, from balance/languages.yaml practice). `home`: you start speaking a language of yours at home with your child cast
   * in `role` (they take it as a first language when young enough). `heritage`: a heritage language of yours that had been lost comes back.
   */
  z.strictObject({ type: z.literal('languageBond'), action: z.enum(['practice', 'home', 'heritage']), role: roleSchema.optional(), size: z.enum(['great', 'good', 'neutral']).optional() }).refine((e) => (e.action === 'heritage') === (e.role === undefined), 'practice and home need a role; heritage has none').refine((e) => (e.action === 'practice') === (e.size !== undefined), 'practice needs a size (great, good or neutral); only practice has one'),
  z.strictObject({ type: z.literal('stat'), key: statKeySchema, delta: z.int().min(-100).max(100) }),
  /**
   * Savings. Savings never go below zero: from the independence age, a cost
   * larger than your savings leaves the rest as personal debt (a child's
   * family covers it).
   */
  z.strictObject({ type: z.literal('money'), delta: z.int().min(-1_000_000_000).max(1_000_000_000) }),
  /**
   * C1: money that scales with your rent: `months` months of your current
   * yearly housing cost (negative to pay, positive to get back), through
   * savings like money. Nothing when you pay no rent.
   */
  z.strictObject({ type: z.literal('rentMonths'), months: z.number().min(-24).max(24).refine((n) => n !== 0, 'months must not be 0') }),
  /**
   * C1: a one-time cost from balance/economy.yaml costs (a wedding), scaled
   * by your city; your family may chip in; savings pay first and the rest
   * becomes personal debt.
   */
  z.strictObject({ type: z.literal('cost'), item: idSchema }),
  /**
   * Debt (adults only; refused before the independence age). add: a new
   * student, personal or medical debt of `amount`. forgive: `share` of every
   * debt of `kinds` (default: all but the mortgage) is written off.
   * bankruptcy: personal, medical and collections debt is cleared. plan: a
   * debt plan (personal, medical and collections debt rolled into one loan).
   */
  z
    .strictObject({
      type: z.literal('debt'),
      action: z.enum(['add', 'forgive', 'bankruptcy', 'plan']),
      kind: z.enum(['student', 'personal', 'medical']).optional(),
      amount: z.int().min(1).max(100_000_000).optional(),
      /** E3: instead of `amount`, a cost item from balance/economy.yaml costs (scaled by your city): what you owe if someone you cosigned for defaults. */
      item: idSchema.optional(),
      kinds: z.array(debtKindSchema).min(1).optional(),
      share: z.number().gt(0).max(1).optional(),
    })
    .refine(
      (e) => (e.action === 'add') === (e.kind !== undefined && (e.amount !== undefined) !== (e.item !== undefined)),
      'add needs kind and either amount or item (and only add has them)',
    )
    .refine((e) => (e.action === 'forgive') === (e.share !== undefined), 'forgive needs share (and only forgive has it)')
    .refine((e) => e.kinds === undefined || e.action === 'forgive', 'only forgive takes kinds'),
  /**
   * Where you live (adults only). move_home: back in with a parent who would
   * have you. rent: a rental in your city. homeless: out on the street.
   * roommate / live_alone: share your rental or stop sharing. sell: sell your
   * home and rent. move_in_together: `role` (your partner, fiancé or spouse)
   * moves in with you and pays their share. The engine ignores a move that
   * doesn't fit (no parent to go to, a home you own and haven't sold...).
   * rent_change (C1): your rent changes by `percent` of the current rent
   * from now on (renting only).
   */
  z
    .strictObject({
      type: z.literal('housing'),
      action: z.enum(['move_home', 'rent', 'homeless', 'roommate', 'live_alone', 'sell', 'move_in_together', 'rent_change']),
      role: roleSchema.optional(),
      /** rent_change (C1): the rent goes up (or down) by this percentage of your current rent, for as long as you stay. */
      percent: z.number().min(-50).max(100).refine((n) => n !== 0, 'percent must not be 0').optional(),
    })
    .refine((e) => (e.action === 'move_in_together') === (e.role !== undefined), 'move_in_together needs role (and only it has one)')
    .refine((e) => (e.action === 'rent_change') === (e.percent !== undefined), 'rent_change needs percent (and only it has one)'),
  /**
   * School (Stage 7). grades: `value` GPA points (−1 to 1) added to this
   * school year's grade (while you're in school). scholarship: `value`
   * dollars that pay future tuition. drop_out / expel: you leave high school
   * (from the dropout age), college, trade school or grad school; you can go
   * back later. The engine ignores what doesn't fit (no school, too young).
   */
  z
    .strictObject({
      type: z.literal('education'),
      action: z.enum(['grades', 'scholarship', 'drop_out', 'expel']),
      value: z.number().optional(),
    })
    .refine(
      (e) =>
        e.action === 'grades'
          ? e.value !== undefined && e.value >= -1 && e.value <= 1 && e.value !== 0
          : e.action === 'scholarship'
            ? e.value !== undefined && Number.isInteger(e.value) && e.value >= 1 && e.value <= 1_000_000
            : e.value === undefined,
      'grades needs a value from -1 to 1; scholarship a whole-dollar value from 1 to 1,000,000; drop_out and expel take no value',
    ),
  /**
   * Work (Stage 8), while you have a job (offer: also without one).
   * performance: `value` points (−50 to 50) on your job performance. raise:
   * the raise you'd get for asking (balance careers.yaml raises.asked).
   * promote: up a level (not past the top). fire: you're fired. quit: you
   * walk away. offer: you take a job in track `jobId`, if you're old enough,
   * out of school and meet its requirements (leaving any job you have).
   */
  z
    .strictObject({
      type: z.literal('job'),
      action: z.enum(['performance', 'raise', 'promote', 'fire', 'quit', 'offer']),
      value: z.int().min(-50).max(50).optional(),
      jobId: idSchema.optional(),
    })
    .refine((e) => (e.action === 'performance') === (e.value !== undefined && e.value !== 0), 'performance needs a non-zero value (and only it has one)')
    .refine((e) => (e.action === 'offer') === (e.jobId !== undefined), 'offer needs jobId (and only it has one)'),
  z.strictObject({
    type: z.literal('relationship'),
    role: roleSchema,
    affection: z.int().min(-100).max(100).optional(),
    trust: z.int().min(-100).max(100).optional(),
    /** E1: their mood (0–100) moves by this much. */
    mood: z.int().min(-100).max(100).optional(),
    status: relationshipStatusSchema.optional(),
    /** Changes the kind (a friend becomes a partner); the engine refuses changes that break the relationship rules. */
    kind: relationshipKindSchema.optional(),
  }),
  z.strictObject({ type: z.literal('memory'), role: roleSchema, tag: idSchema }),
  z.strictObject({ type: z.literal('flag'), key: idSchema, value: flagValueSchema }),
  z.strictObject({
    type: z.literal('schedule'),
    eventId: idSchema,
    /** Years from now; at least 1, so the follow-up comes in a later year. */
    inYears: z.tuple([z.int().min(1), z.int().min(1)]).refine(([a, b]) => a <= b, 'inYears must be [min, max]'),
    /** Roles carried over to the follow-up (same role names). */
    cast: z.array(roleSchema).optional(),
  }),
  z.strictObject({ type: z.literal('history'), text: templateSchema, importance: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.strictObject({ type: z.literal('death'), cause: idSchema }),
  /**
   * The law (Stage 9): an entry on your record for `offenseId`. `sentence`
   * lets the court decide (the offense's likely outcomes, your record, your
   * age); warning, fine, probation and jail hand down that outcome. `years`
   * sets the years of probation or prison (otherwise the offense's range).
   * Before the independence age, jail becomes probation.
   */
  z
    .strictObject({
      type: z.literal('legal'),
      offenseId: idSchema,
      outcome: z.enum([...RECORD_OUTCOMES, 'sentence']),
      years: z.int().min(1).max(50).optional(),
    })
    .refine((e) => e.years === undefined || e.outcome === 'probation' || e.outcome === 'jail', 'only probation and jail take years'),
  /**
   * Health (Stage 9): `severity` points on a condition (a positive change
   * gives it to you if you don't have it; it is gone at 0). `treated` marks
   * it treated or not (rehab, stopping your medication).
   */
  z
    .strictObject({
      type: z.literal('health'),
      conditionId: idSchema,
      severity: z.int().min(-100).max(100).optional(),
      treated: z.boolean().optional(),
    })
    .refine((e) => (e.severity !== undefined && e.severity !== 0) || e.treated !== undefined, 'needs a non-zero severity or treated'),
  /**
   * M1, mental health. trauma: you carry `amount` more trauma (accidents,
   * violence, mistreatment; it fades, and PTSD's onset reads it). diagnose: a
   * condition you have is named (`conditionId`; without one, every condition
   * not named yet that you're old enough for), through an `assessment`
   * (default), a `doctor` or a `therapist`. start / stop: you begin or stop
   * caring for a named condition (`conditionId`; without one, each that
   * takes it) with `care`: therapy and medication pay their first visit,
   * leaning on people reaches out to the people you can lean on. pay: a
   * one-time medical cost `item` from balance/mental-health.yaml costs
   * (savings, then medical debt; a child's family pays). crisis: a crisis
   * happens: what you carry is named and gets worse before it gets better.
   * confide: you tell the person cast in `role` you are struggling; they take
   * it by who they are, and `then` names the follow-up event for each way
   * (it comes the next year). The engine ignores what doesn't fit.
   */
  z
    .strictObject({
      type: z.literal('mental'),
      action: z.enum(['trauma', 'diagnose', 'start', 'stop', 'pay', 'crisis', 'confide']),
      amount: z.int().min(1).max(100).optional(),
      conditionId: idSchema.optional(),
      care: mentalCareSchema.optional(),
      via: z.enum(['assessment', 'doctor', 'therapist']).optional(),
      item: idSchema.optional(),
      role: roleSchema.optional(),
      then: z.partialRecord(reactionSchema, idSchema).optional(),
    })
    .refine((e) => (e.action === 'trauma') === (e.amount !== undefined), 'trauma needs amount (and only trauma has one)')
    .refine((e) => (e.action === 'start' || e.action === 'stop') === (e.care !== undefined), 'start and stop need care (and only they have one)')
    .refine((e) => (e.action === 'pay') === (e.item !== undefined), 'pay needs item (and only pay has one)')
    .refine((e) => (e.action === 'confide') === (e.role !== undefined), 'confide needs role (and only confide has one)')
    .refine((e) => e.then === undefined || e.action === 'confide', 'only confide takes then')
    .refine((e) => e.via === undefined || e.action === 'diagnose', 'only diagnose takes via')
    .refine((e) => e.conditionId === undefined || e.action === 'diagnose' || e.action === 'start' || e.action === 'stop', 'only diagnose, start and stop take conditionId'),
  /**
   * Who you are (Stage 9). field: attraction, gender (identity and
   * category), expression, pronouns or personality. value 'fromLatent'
   * takes your latent trait (and clears it; nothing happens without one).
   * Attraction can also take value 'withRole' and a role: you're attracted
   * to their gender too (a "try it and decide" moment). Pronouns can take a
   * pronoun preset id; 'fromLatent' takes the usual pronouns of your latent
   * gender. Expression can take a free-text value.
   */
  z
    .strictObject({
      type: z.literal('identity'),
      field: z.enum(IDENTITY_FIELDS),
      value: z.string().trim().min(1).max(40),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.value === 'withRole') === (e.role !== undefined), "value 'withRole' needs a role (and only it has one)")
    .refine((e) => e.value !== 'withRole' || e.field === 'attraction', "only attraction takes value 'withRole'")
    .refine(
      (e) => e.value === 'fromLatent' || e.value === 'withRole' || e.field === 'pronouns' || e.field === 'expression',
      "attraction, gender and personality take value 'fromLatent' (attraction also 'withRole')",
    ),
  /** Inner conflict (Stage 9): pushing something down raises it; making peace lowers it. */
  /**
   * E6a, a life in a crew (adults only; the engine and the content build both
   * say so). join: you are taken in by a crew that works in your city (the
   * rest of the life is the same as before). leave: you leave (how: left by
   * choice, pushed out, caught, drifted, or a deal); the people stay in your
   * life, the heat stays on you. heat / standing / rivalry: move by `delta`.
   * promote / demote: one rank up or down (to the top you run the crew).
   * job: you did a job of this size (its heat, its standing, and your count
   * for the year). investigate: an investigation into you opens; close: it
   * ends. remove: the person in `role` is no longer in the crew. join may
   * bring the person in `role` (whoever brought you in) into the crew too.
   * suspicion: what the crew you moved away from suspects of you moves by
   * `delta`. transfer: while you are away, you leave that crew (how: moved) and
   * join one that works where you live now, below your best rank. leave's how
   * can also be moved.
   */
  z
    .strictObject({
      type: z.literal('crime'),
      action: z.enum(['join', 'leave', 'heat', 'standing', 'rivalry', 'suspicion', 'promote', 'demote', 'job', 'investigate', 'close', 'remove', 'transfer']),
      delta: z.int().min(-100).max(100).optional(),
      size: jobSizeSchema.optional(),
      how: z.enum(['left', 'pushed', 'drifted', 'deal', 'moved']).optional(),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.action === 'heat' || e.action === 'standing' || e.action === 'rivalry' || e.action === 'suspicion') === (e.delta !== undefined && e.delta !== 0), 'heat, standing, rivalry and suspicion need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'job') === (e.size !== undefined), 'job needs size (and only job has it)')
    .refine((e) => (e.action === 'leave') || e.how === undefined, 'only leave takes how')
    .refine((e) => (e.action === 'remove' ? e.role !== undefined : e.action === 'join' || e.role === undefined), 'remove needs role; join may bring a person with it; no other action has one'),
  /**
   * E6a, dirty money (cash from crime you have not laundered). gain: a job's
   * take of this size, times your rank's multiplier and your city's pay level,
   * varying a little. pay: you hand over this size of cost out of it
   * (hush money, a bribe; no more than you hold). lose: a share of what you
   * hold is seized, stolen or burned.
   */
  z
    .strictObject({
      type: z.literal('dirtyMoney'),
      gain: jobSizeSchema.optional(),
      pay: jobSizeSchema.optional(),
      lose: z.number().gt(0).max(1).optional(),
      /** Your yearly cut of the crew's business (the top two ranks), with the little heat it adds. */
      cut: z.literal(true).optional(),
    })
    .refine((e) => [e.gain, e.pay, e.lose, e.cut].filter((v) => v !== undefined).length === 1, 'needs exactly one of gain, pay, lose or cut'),
  /**
   * E6b, fame in arts and media. enter: you start a career in `path` (by
   * `route`, a way in; any age the path allows, a parent signs for you under
   * 18). cross: you start a second path. rung: you move up or down `delta`
   * rungs (never past the ladder). break: a big break jumps you `delta` rungs
   * (at most the ladder's ceiling for you). fame / image / mood / craft /
   * burnout: move by `delta`. fans: your fan base moves by `delta` percent.
   * commitment: you set it. agent: you sign with an agent of this tier (0 to
   * part ways). contract: you sign a deal on these terms with a company that
   * fits; end_contract: it ends (ended: it ran out; broken: you walked away
   * and pay for it). scene: your lifestyle. retire / comeback: you stop, or go
   * back to work. stalker: the superfan in `role` starts stalking you
   * (start); you report it (report); a restraining order is granted (order);
   * it ends (end).
   */
  z
    .strictObject({
      type: z.literal('fame'),
      action: z.enum(['enter', 'cross', 'rung', 'break', 'fame', 'image', 'mood', 'craft', 'burnout', 'fans', 'commitment', 'agent', 'contract', 'end_contract', 'scene', 'retire', 'comeback', 'stalker']),
      delta: z.int().min(-100).max(100).optional(),
      path: idSchema.optional(),
      route: idSchema.optional(),
      value: fameCommitmentSchema.optional(),
      scene: fameSceneSchema.optional(),
      tier: z.int().min(0).max(3).optional(),
      terms: fameTermsSchema.optional(),
      how: z.enum(['ended', 'broken']).optional(),
      step: z.enum(['start', 'report', 'order', 'end']).optional(),
      role: roleSchema.optional(),
    })
    .refine((e) => (['rung', 'break', 'fame', 'image', 'mood', 'craft', 'burnout', 'fans'] as string[]).includes(e.action) === (e.delta !== undefined && e.delta !== 0), 'rung, break, fame, image, mood, craft, burnout and fans need a non-zero delta (and only they have one)')
    .refine((e) => e.action !== 'break' || (e.delta !== undefined && e.delta > 0 && e.delta <= 4), 'break jumps 1 to 4 rungs')
    .refine((e) => (e.action === 'enter' || e.action === 'cross') === (e.path !== undefined), 'enter and cross need path (and only they have one)')
    .refine((e) => e.route === undefined || e.action === 'enter', 'only enter takes route')
    .refine((e) => (e.action === 'commitment') === (e.value !== undefined), 'commitment needs value (and only it has one)')
    .refine((e) => (e.action === 'scene') === (e.scene !== undefined), 'scene needs scene (and only it has one)')
    .refine((e) => (e.action === 'agent') === (e.tier !== undefined), 'agent needs tier (and only it has one)')
    .refine((e) => (e.action === 'contract') === (e.terms !== undefined), 'contract needs terms (and only it has them)')
    .refine((e) => (e.action === 'end_contract') === (e.how !== undefined), 'end_contract needs how (and only it has one)')
    .refine((e) => (e.action === 'stalker') === (e.step !== undefined), 'stalker needs step (and only it has one)')
    .refine((e) => e.role === undefined || (e.action === 'stalker' && e.step === 'start'), 'only a stalker start takes a role'),
  /**
   * Batch 4, bands. chemistry: the band's chemistry moves by `delta`. quit:
   * the member in `role` leaves the band (quits, or is poached away). split:
   * the band breaks up. join: you take up the newest offer from a band in
   * your city. lead: you take over leading the band.
   */
  z
    .strictObject({
      type: z.literal('band'),
      action: z.enum(['chemistry', 'quit', 'split', 'join', 'lead']),
      delta: z.int().min(-50).max(50).optional(),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.action === 'chemistry') === (e.delta !== undefined && e.delta !== 0), 'chemistry needs a non-zero delta (and only it has one)')
    .refine((e) => (e.action === 'quit') === (e.role !== undefined), 'quit needs role (and only it has one)'),
  /**
   * E6b, money from the work, sized for where you are on the ladder: gain pays
   * a size of payment (a share of your rung's usual year, with a floor), cost
   * takes one (as savings, then debt, like any cost). The outcome card shows
   * the amount and the new balance.
   */
  z
    .strictObject({ type: z.literal('famePay'), gain: fameSizeSchema.optional(), cost: fameSizeSchema.optional() })
    .refine((e) => (e.gain === undefined) !== (e.cost === undefined), 'needs exactly one of gain or cost'),
  /**
   * Batch 8, social media. followers: your following on the account in
   * `platform` (the one the event is about, without it) moves by `delta`
   * percent. engagement: its engagement moves by `delta` points. private: every
   * account goes private (`value: true`) or public. open: you open an account
   * on `platform`, with a handle suggested for you and your best niche (only
   * what the platform's age and a parent's say-so allow). close: the account
   * goes. restore: the platform pays you again after an appeal. clear: a row
   * that was brewing blows over. cancel: you are cancelled: followers, public
   * image, fan mood and fame fall, the tabloids may run it and the web talks.
   * sponsor: you sign a sponsorship, a contract on these `terms` with a
   * (fictional) brand that fits your rung; a parent signs for anyone under 18.
   */
  z
    .strictObject({
      type: z.literal('social'),
      action: z.enum(['followers', 'engagement', 'private', 'open', 'close', 'restore', 'clear', 'cancel', 'sponsor']),
      delta: z.int().min(-100).max(500).optional(),
      platform: idSchema.optional(),
      value: z.boolean().optional(),
      terms: fameTermsSchema.optional(),
    })
    .refine((e) => (e.action === 'sponsor') === (e.terms !== undefined), 'sponsor needs terms (and only it has them)')
    .refine((e) => (e.action === 'followers' || e.action === 'engagement') === (e.delta !== undefined && e.delta !== 0), 'followers and engagement need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'private') === (e.value !== undefined), 'private needs value (and only it has one)')
    .refine((e) => e.action !== 'open' || e.platform !== undefined, 'open needs a platform'),
  /**
   * E6c, sports. form: `delta` points of form for the next season (and the
   * playoffs now), −10 to 10. rating: `delta` points on this year's rating,
   * already played. series: the playoff series just played ends in a win or a
   * loss (a win moves a run on, the last one wins the title). sign: you sign
   * the contract you were offered (the draft's deal, or a minimum deal);
   * decline: you turn the draft down and stay an amateur another year.
   * extend: your team signs you again on `terms` (fair: the market; rich:
   * you push and may win; cheap: you take less, for loyalty). playout: you
   * play out your contract to test free agency. trade: the trade you asked
   * for (or the one on offer) happens now; ask: you ask for a trade or a new
   * deal through your agent; refuse: you stay where you are. injury: rest
   * (the injury is treated, you sit), pain (you play through it), surgery
   * (treated, and the best chance of healing). suspend: a ban for a season.
   * retire: you leave your sport by `route`. position: you move to another
   * position (the one in `position`). Batch 6: loan: accept the loan on offer
   * (`on: true`) or turn it down (`on: false`; the club may make you go).
   * transfer: handle the window's offers: take the best one (`mode: best`),
   * ask your agent to shop around for more (`shop`), or stay (`stay`).
   * cap: you play for the national side. tournament and derby: the result
   * (`win` or `lose`) of the international tournament or the derby.
   */
  z
    .strictObject({
      type: z.literal('sports'),
      action: z.enum(['form', 'rating', 'series', 'sign', 'decline', 'extend', 'playout', 'trade', 'ask', 'refuse', 'injury', 'suspend', 'retire', 'position', 'tryout', 'role', 'number', 'captain', 'scholarship', 'combine', 'camp', 'loan', 'transfer', 'cap', 'tournament', 'derby']),
      delta: z.int().min(-30).max(30).optional(),
      approach: z.enum(TRYOUT_APPROACHES).optional(),
      tier: tierSchema.optional(),
      value: z.int().min(0).max(99).optional(),
      on: z.boolean().optional(),
      result: z.enum(['win', 'lose']).optional(),
      terms: z.enum(['fair', 'rich', 'cheap']).optional(),
      what: z.enum(['trade', 'contract', 'rest', 'pain', 'surgery']).optional(),
      route: z.enum(SPORT_RETIRE_ROUTES).optional(),
      position: idSchema.optional(),
      kind: z.enum(SPORT_CONTRACT_KINDS).optional(),
      mode: z.enum(['best', 'shop', 'stay']).optional(),
    })
    .refine((e) => (e.action === 'form' || e.action === 'rating' || e.action === 'role' || e.action === 'combine') === (e.delta !== undefined && e.delta !== 0), 'form, rating, role and combine need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'tryout') === (e.approach !== undefined), 'tryout needs approach (and only it has one)')
    .refine((e) => (e.action === 'number') === (e.value !== undefined), 'number needs value (and only it has one)')
    .refine((e) => (e.action === 'captain' || e.action === 'loan') === (e.on !== undefined), 'captain and loan need on (and only they have one)')
    .refine((e) => e.tier === undefined || e.action === 'scholarship', 'only scholarship takes tier (leave it out to turn the offers down)')
    .refine((e) => (e.action === 'series' || e.action === 'tournament' || e.action === 'derby') === (e.result !== undefined), 'series, tournament and derby need result (and only they have one)')
    .refine((e) => (e.action === 'transfer') === (e.mode !== undefined), 'transfer needs mode (and only it has one)')
    .refine((e) => (e.action === 'extend') === (e.terms !== undefined), 'extend needs terms (and only it has them)')
    .refine((e) => (e.action === 'ask' || e.action === 'injury') === (e.what !== undefined), 'ask and injury need what (and only they have one)')
    .refine((e) => e.action !== 'ask' || e.what === 'trade' || e.what === 'contract', 'ask is for a trade or a contract')
    .refine((e) => e.action !== 'injury' || e.what === 'rest' || e.what === 'pain' || e.what === 'surgery', 'injury is rest, pain or surgery')
    .refine((e) => (e.action === 'retire') === (e.route !== undefined), 'retire needs route (and only it has one)')
    .refine((e) => (e.action === 'position') === (e.position !== undefined), 'position needs position (and only it has one)')
    .refine((e) => e.kind === undefined || e.action === 'sign', 'only sign takes kind'),
  /**
   * L1, later life. care: you choose how your care is provided (`option`; for
   * family care `role` is the relative who steps up, and they move in
   * nearby). hospice: where you spend your last months. amends: records an
   * amends chance and its result (`source` in registries/later.yaml, `role`
   * the person). raise: you take the grandchild `role` in and raise them (they
   * become your child; their parent can ask for them back); return: a
   * grandchild you raise goes back to their parent. teach: you nudge the
   * grandchild `role`'s trait or smarts by `delta`. The engine ignores what
   * doesn't fit now.
   */
  z
    .strictObject({
      type: z.literal('later'),
      action: z.enum(LATER_ACTIONS),
      role: roleSchema.optional(),
      option: z.enum(CARE_OPTIONS).optional(),
      choice: z.enum(HOSPICE_CHOICES).optional(),
      source: idSchema.optional(),
      result: z.enum(AMENDS_RESULTS).optional(),
      key: z.enum(TEACH_KEYS).optional(),
      delta: z.int().min(-12).max(12).optional(),
    })
    .refine((e) => (e.action === 'care') === (e.option !== undefined), 'care needs option (and only care has one)')
    .refine((e) => (e.action === 'hospice') === (e.choice !== undefined), 'hospice needs choice (and only hospice has one)')
    .refine((e) => (e.action === 'amends') === (e.source !== undefined && e.result !== undefined), 'amends needs source and result (and only amends has them)')
    .refine((e) => (e.action === 'teach') === (e.key !== undefined && e.delta !== undefined && e.delta !== 0), 'teach needs key and a non-zero delta (and only teach has them)')
    .refine((e) => e.action === 'care' || e.action === 'hospice' || e.role !== undefined || e.action === 'amends', 'raise, return and teach need role')
    .refine((e) => e.action !== 'care' || e.option !== 'family' || e.role !== undefined, 'family care needs the role of the relative who steps up'),
  /**
   * W2, groups. They act on the group the event is about (`bindGroup`, or the
   * one the engine passed in; else the one group you belong to that fits).
   * join: you join it (as `level`, casual by default; `defId` instead joins
   * one of that kind in your city); leave; commit: change your commitment to
   * `level`; promote and demote: a rung up or down; standing: its standing
   * (0–100) moves by `delta`; community: your standing in the city moves by
   * `delta`; news: starts the story `kind` (about you, or the person at `role`)
   * to travel by gossip. The engine ignores what doesn't fit now.
   */
  z
    .strictObject({
      type: z.literal('group'),
      action: z.enum(GROUP_ACTIONS),
      level: z.enum(COMMITMENTS).optional(),
      defId: idSchema.optional(),
      delta: z.int().min(-30).max(30).optional(),
      kind: z.enum(GROUP_NEWS_KINDS).optional(),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.action === 'commit') === (e.level !== undefined) || e.action === 'join', 'commit needs level (only commit and join have one)')
    .refine((e) => (e.action === 'standing' || e.action === 'community') === (e.delta !== undefined && e.delta !== 0), 'standing and community need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'news') === (e.kind !== undefined), 'news needs kind (and only news has one)')
    .refine((e) => e.defId === undefined || e.action === 'join', 'only join takes defId')
    .refine((e) => e.role === undefined || e.action === 'news', 'only news takes role'),
  /**
   * W2, faith. strengthen and weaken: belief moves by `delta`; lose: you stop
   * believing (no faith); convert: you take the faith `id`, or the faith of
   * the person at `role`, or of the group the event is about (`group: true`);
   * return: back to the faith you were raised in; fromLatent: you act on the
   * pull you felt. With `who`, strengthen, weaken, lose and convert (with an
   * `id`) change that person's faith instead of yours.
   */
  z
    .strictObject({
      type: z.literal('faith'),
      action: z.enum(FAITH_ACTIONS),
      delta: z.int().min(1).max(60).optional(),
      id: idSchema.optional(),
      role: roleSchema.optional(),
      group: z.literal(true).optional(),
      who: roleSchema.optional(),
    })
    .refine((e) => (e.action === 'strengthen' || e.action === 'weaken') === (e.delta !== undefined), 'strengthen and weaken need a delta (and only they have one)')
    .refine((e) => e.action === 'convert' || (e.id === undefined && e.group === undefined && e.role === undefined), 'only convert takes id, role or group')
    .refine((e) => e.action !== 'convert' || [e.id !== undefined, e.role !== undefined, e.group === true].filter(Boolean).length === 1, 'convert takes exactly one of id, role or group: true')
    .refine((e) => e.who === undefined || ['strengthen', 'weaken', 'lose', 'convert'].includes(e.action), 'who is for strengthen, weaken, lose and convert')
    .refine((e) => e.who === undefined || e.action !== 'convert' || e.id !== undefined, 'convert with who needs an id')
    .refine((e) => (e.action !== 'return' && e.action !== 'fromLatent') || e.who === undefined, 'return and fromLatent are about you'),
  /**
   * W3, businesses. They act on the business the event is about (`bindBusiness`,
   * or the one the engine passed in; else the first you own). pay and receive:
   * `share` of a year's revenue (at least `floor` dollars) leaves or reaches your
   * savings; quality, reputation and morale (everyone's) move by `delta`; buzz and
   * rival: demand moves by `delta` percent for `years` years (a viral moment, a
   * competitor next door); staffQuit, staffFire, staffRaise, staffMorale and theft
   * act on the worker at `role` (theft also costs `share` of a year's revenue); hire: the person at `role`, someone you know, joins the staff;
   * buyout: the investor or co-founder at `role` is bought out; expand: a new
   * location in the same city (if you can pay for it); sell and close end it;
   * audit: you look at the books (a manager's skimming then shows). The engine
   * ignores what does not fit now.
   */
  z
    .strictObject({
      type: z.literal('business'),
      action: z.enum(BUSINESS_ACTIONS),
      share: z.number().gt(0).max(2).optional(),
      floor: z.int().min(0).max(1_000_000).optional(),
      delta: z.int().min(-60).max(60).optional(),
      years: z.int().min(1).max(10).optional(),
      role: roleSchema.optional(),
      /** B2: price and order act on the line (or supply pool) at `product`, or the one the event is about; `level` is a price level or an order level. */
      product: idSchema.optional(),
      level: z.enum([...PRICE_LEVELS, ...ORDER_LEVELS]).optional(),
    })
    .refine((e) => (e.action === 'pay' || e.action === 'receive' || e.action === 'theft' || e.action === 'buyAhead') === (e.share !== undefined) || e.action === 'writeOff', 'pay, receive, theft and buyAhead need share (and only they, and writeOff, have one)')
    .refine((e) => e.action !== 'writeOff' || (e.share !== undefined && e.share <= 1), 'writeOff needs share (of the stock, up to 1)')
    .refine((e) => e.floor === undefined || (e.share !== undefined && e.action !== 'writeOff'), 'floor goes with share (not writeOff)')
    .refine((e) => (['quality', 'reputation', 'morale', 'buzz', 'rival', 'staffMorale', 'supplier', 'shortage', 'brand'] as string[]).includes(e.action) === (e.delta !== undefined && e.delta !== 0), 'quality, reputation, morale, buzz, rival, staffMorale, supplier, shortage and brand need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'buzz' || e.action === 'rival' || e.action === 'supplier' || e.action === 'shortage') === (e.years !== undefined), 'buzz, rival, supplier and shortage need years (and only they have it)')
    .refine((e) => (['staffQuit', 'staffFire', 'staffRaise', 'staffMorale', 'hire', 'theft', 'buyout', 'transfer', 'appoint'] as string[]).includes(e.action) === (e.role !== undefined), 'staffQuit, staffFire, staffRaise, staffMorale, hire, theft, buyout, transfer and appoint need role (and only they have one)')
    .refine((e) => (e.action === 'price' || e.action === 'order') === (e.level !== undefined), 'price and order need level (and only they have one)')
    .refine((e) => e.action !== 'price' || (PRICE_LEVELS as readonly string[]).includes(e.level!), 'price takes a price level')
    .refine((e) => e.action !== 'order' || (ORDER_LEVELS as readonly string[]).includes(e.level!), 'order takes an order level')
    .refine((e) => e.product === undefined || e.action === 'price' || e.action === 'order', 'product goes with price and order'),
  /** W2: a value moves by `delta`; a share of it sticks to your temperament (balance/belonging.yaml values.sticks). */
  /**
   * W6, emigration. remit: you send `level` of your income home from now on; overstay: your permit ends and you stay
   * without papers; leave: you go home; ties: everyone close who lives in another country than you feels `delta`
   * more (or less) for you; prepare: you prepare for the citizenship test; withheld: pay is kept back from you, a
   * `share` of last year's earnings; risk: you drew attention (`delta` percentage points of risk added to next year's).
   * The engine ignores what does not fit now.
   */
  z
    .strictObject({
      type: z.literal('migration'),
      action: z.enum(MIGRATION_ACTIONS),
      level: z.enum(REMIT_LEVELS).optional(),
      delta: z.int().min(-30).max(30).optional(),
      share: z.number().gt(0).max(0.5).optional(),
    })
    .refine((e) => (e.action === 'remit') === (e.level !== undefined), 'remit needs level (and only remit has one)')
    .refine((e) => (e.action === 'ties' || e.action === 'risk') === (e.delta !== undefined && e.delta !== 0), 'ties and risk need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'withheld') === (e.share !== undefined), 'withheld needs share (and only withheld has one)'),
  z.strictObject({ type: z.literal('value'), key: z.enum(VALUE_IDS), delta: z.int().min(-30).max(30).refine((n) => n !== 0, 'delta must not be 0') }),
  z.strictObject({ type: z.literal('innerConflict'), delta: z.int().min(-100).max(100) }),
  /** You discover your hidden talent, if you have one you haven't found (Stage 9). */
  z.strictObject({ type: z.literal('talent') }),
  /**
   * C1: the person cast in `role` moves to another city (a friend moving
   * across the country). Nobody who lives with you moves this way.
   */
  z.strictObject({ type: z.literal('moveAway'), role: roleSchema }),
  /**
   * E1: the person cast in `role` gives or lends you money when you ask
   * (interactions only). The amount comes from their wealth level
   * (balance/interactions.yaml money), scaled to your city. A gift is yours;
   * a loan is a personal debt through the finance module (a child is always
   * given it). It leaves a memory of the loan.
   */
  z.strictObject({ type: z.literal('moneyFromPerson'), role: roleSchema, mode: z.enum(['gift', 'loan']) }),
  /**
   * E1: an act with the person cast in `role` that is unfaithful when you
   * have a partner who isn't them (interactions only): the partner gets a
   * memory of it, it may be found out later (registries/interactions.yaml),
   * and the `cheated` flag is set. Nothing happens when you're single or the
   * person is your partner.
   */
  z.strictObject({ type: z.literal('infidelity'), role: roleSchema, act: z.enum(['flirt', 'intimate']) }),
  /**
   * E2a: a pregnancy. begin: one begins, how 'trying' (from a try-for-a-baby
   * moment) or 'unplanned' (from an intimate night), with `role` the other
   * parent; the carrier is whichever of you two can carry (the engine
   * ignores it when neither or both can, or when someone is already
   * pregnant). decide (the unplanned pregnancy event): keep it, place the
   * baby for adoption, or end the pregnancy. attempt: a year of trying that
   * didn't work.
   */
  z
    .strictObject({
      type: z.literal('pregnancy'),
      action: z.enum(['begin', 'decide', 'attempt']),
      how: z.enum(['trying', 'unplanned']).optional(),
      role: roleSchema.optional(),
      choice: z.enum(['keep', 'adoption', 'end']).optional(),
    })
    .refine((e) => (e.action === 'begin') === (e.how !== undefined && e.role !== undefined), 'begin needs how and role (and only begin has them)')
    .refine((e) => (e.action === 'decide') === (e.choice !== undefined), 'decide needs choice (and only decide has it)'),
  /** E2a: your parenting style with a child moves (each line by up to ±50; style lines stay 0–100). */
  z
    .strictObject({
      type: z.literal('parenting'),
      role: roleSchema,
      warmth: z.int().min(-50).max(50).optional(),
      strictness: z.int().min(-50).max(50).optional(),
      involvement: z.int().min(-50).max(50).optional(),
    })
    .refine((e) => e.warmth !== undefined || e.strictness !== undefined || e.involvement !== undefined, 'needs at least one style line'),
  /** E2a: a child's own stat or personality trait moves (the person cast in `role` must be your child or stepchild). */
  z.strictObject({ type: z.literal('childStat'), role: roleSchema, key: z.enum(STAT_KEYS), delta: z.int().min(-30).max(30) }),
  z.strictObject({ type: z.literal('childTrait'), role: roleSchema, key: z.enum(TRAIT_KEYS), delta: z.int().min(-30).max(30) }),
  /**
   * E2a: custody of the children you had with the person cast in `role` (the
   * other parent): they live with you (full), you share (shared) or they
   * live with that parent (other). Sets child support to match.
   */
  z.strictObject({ type: z.literal('custody'), role: roleSchema, choice: z.enum(['full', 'shared', 'other']) }),
  /** E2a: start an adoption, IVF or surrogacy process (its fees are a separate cost effect). */
  z.strictObject({ type: z.literal('process'), action: z.literal('start'), process: familyProcessSchema }),
  /**
   * E3: you step in for the person cast in `role`, through the systems that
   * already exist (the money for it is a separate cost effect). bail: they
   * are out on bail until their case is decided (legal); rehab: an addiction
   * goes into treatment; treatment: an illness is treated; job_lead: they
   * find work (a job in a track they fit); move_in: someone who needs care
   * moves into your home; pay_care: you pay for their care; leave_care: you
   * leave their care to the family. The engine ignores what doesn't fit.
   */
  z.strictObject({
    type: z.literal('lifeHelp'),
    role: roleSchema,
    action: z.enum(['bail', 'rehab', 'treatment', 'job_lead', 'move_in', 'pay_care', 'leave_care']),
  }),
  /**
   * E3: money paid back to you: `share` of what the cost item costs in your
   * city (balance/economy.yaml costs), such as a loan coming back.
   */
  z.strictObject({ type: z.literal('repay'), item: idSchema, share: z.number().gt(0).max(2) }),
  /**
   * E4: something between two people you know (cast as `a` and `b`). side:
   * you take `with`'s side (a feud you said you'd stay out of is no longer
   * neutral); neutral: you stay out of it (it costs you with both, each
   * year); mend / worsen: their affection for each other moves by `delta`
   * (a feud ends when it climbs far enough); reconcile: the feud is over.
   * Changes to how they feel about you are relationship effects beside this one.
   */
  z
    .strictObject({
      type: z.literal('tie'),
      a: roleSchema,
      b: roleSchema,
      action: z.enum(['side', 'neutral', 'mend', 'worsen', 'reconcile']),
      with: roleSchema.optional(),
      delta: z.int().min(1).max(40).optional(),
    })
    .refine((e) => (e.action === 'side') === (e.with !== undefined), 'side needs with (and only side has it)')
    .refine((e) => (e.action === 'mend' || e.action === 'worsen') === (e.delta !== undefined), 'mend and worsen need delta (and only they have it)')
    .refine((e) => e.with === undefined || e.with === e.a || e.with === e.b, 'with is one of a and b'),
  /**
   * E4: what the person in `role` has heard about you. correct: they now
   * believe the true version; confirm: you admit it (the true version, and
   * they have reacted); hush: they keep it quiet for a while; leak: they tell
   * one person they know; tell: you tell them yourself (they learn the true
   * version, and it isn't gossip). Without `kind`, it is the item the event
   * or interaction is about.
   */
  z
    .strictObject({
      type: z.literal('knowledge'),
      /** Who it is about; announce has no one: everyone you know hears it. */
      role: roleSchema.optional(),
      action: z.enum(['correct', 'confirm', 'hush', 'leak', 'tell', 'announce']),
      kind: knowledgeKindSchema.optional(),
    })
    .refine((e) => (e.action === 'announce') === (e.role === undefined), 'announce has no role (everyone hears it), and every other action needs one')
    .refine((e) => e.action !== 'announce' || e.kind !== undefined, 'announce needs kind'),
  /**
   * E4: you introduce the person in `role` to the person in `with`. friends,
   * rivalry and feud start a tie of that feeling; romance starts a couple if
   * both are single, unrelated adults who are attracted to each other (and
   * friends otherwise). The engine refuses what doesn't fit.
   */
  z.strictObject({
    type: z.literal('introduce'),
    role: roleSchema,
    with: roleSchema,
    result: z.enum(['friends', 'romance', 'rivalry', 'feud']),
  }),
  /**
   * E5, what you own (the event must bind what it acts on, except pet_adopt).
   * vehicle_damage / home_damage: your vehicle (or vacation home) is damaged
   * by `severity`: you pay the repair (insured, you pay the deductible and a
   * claim is made, which raises premiums; a total loss is paid out by the
   * insurer, or lost). vehicle_stolen: it is gone (paid out when insured).
   * vehicle_sell: you sell it at its market price (its loan paid first).
   * vehicle_condition: its condition moves by `delta` (a repair, a breakdown).
   * pet_adopt: a pet of `species` joins you from `source` (a stray, a family
   * pet), if you have room. pet_health / pet_bond: the pet's health or bond
   * moves by `delta`. pet_vet: a vet visit, paid. pet_leaves: it goes
   * somewhere else (rehomed, left with the family you've parted from). pet_dies: it
   * dies (only an old or failing pet; the engine ignores it otherwise).
   * insure: your vehicles' insurance is cancelled (`insured: false`) or restored.
   */
  z
    .strictObject({
      type: z.literal('possession'),
      action: z.enum(POSSESSION_EFFECT_ACTIONS),
      severity: z.enum(DAMAGE_SEVERITIES).optional(),
      delta: z.int().min(-100).max(100).optional(),
      species: idSchema.optional(),
      source: z.enum(PET_SOURCES).optional(),
      insured: z.boolean().optional(),
    })
    .refine((e) => (e.action === 'vehicle_damage' || e.action === 'home_damage') === (e.severity !== undefined), 'vehicle_damage and home_damage need severity (and only they have one)')
    .refine((e) => (e.action === 'pet_health' || e.action === 'pet_bond' || e.action === 'vehicle_condition') === (e.delta !== undefined && e.delta !== 0), 'pet_health, pet_bond and vehicle_condition need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'pet_adopt') === (e.species !== undefined && e.source !== undefined), 'pet_adopt needs species and source (and only it has them)')
    .refine((e) => (e.action === 'insure') === (e.insured !== undefined), 'insure needs insured (and only it has it)'),
  /**
   * T1, the teen years. standing: your standing at school moves by `delta`.
   * rank: your place in your crowd moves by `delta`. join: you join the crowd
   * that has noticed you (nothing without an invitation). leave: you leave
   * your crowd. clash: your crowd and its rival fall out (nothing without a
   * rival). settle: the clash is over. break: you break the house rule of
   * `rule` (if there is one): you may be caught, and the parent answers as
   * they would. ground: you are grounded for `years` (1 by default). loosen /
   * tighten: the rule of `rule` goes one level looser or stricter. practice:
   * driving practice adds a lesson. license: your stage becomes `stage`
   * (permit or licensed; revoke takes the license away). passion: your passion
   * moves by `delta`. hire: you take the teen job `jobId` (if you may). quit:
   * you leave your teen job. enroll: you try out for (or sign up to) the
   * team or club `activityId`; withdraw: you leave it. The engine ignores what doesn't fit, and never
   * what would break a rule (an under-18 romance, a license below the age).
   */
  z
    .strictObject({
      type: z.literal('teen'),
      action: z.enum(['standing', 'rank', 'join', 'leave', 'clash', 'settle', 'break', 'ground', 'loosen', 'tighten', 'practice', 'license', 'passion', 'hire', 'quit', 'enroll', 'withdraw']),
      delta: z.int().min(-100).max(100).optional(),
      rule: ruleDomainSchema.optional(),
      years: z.int().min(1).max(3).optional(),
      stage: z.enum(['permit', 'licensed', 'revoke']).optional(),
      jobId: idSchema.optional(),
      activityId: idSchema.optional(),
    })
    .refine((e) => (e.action === 'standing' || e.action === 'rank' || e.action === 'passion') === (e.delta !== undefined && e.delta !== 0), 'standing, rank and passion need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'break' || e.action === 'loosen' || e.action === 'tighten') === (e.rule !== undefined), 'break, loosen and tighten need rule (and only they have one)')
    .refine((e) => e.years === undefined || e.action === 'ground', 'only ground takes years')
    .refine((e) => (e.action === 'license') === (e.stage !== undefined), 'license needs stage (and only license has it)')
    .refine((e) => (e.action === 'hire') === (e.jobId !== undefined), 'hire needs jobId (and only hire has it)')
    .refine((e) => (e.action === 'enroll' || e.action === 'withdraw') === (e.activityId !== undefined), 'enroll and withdraw need activityId (and only they have it)'),
]);
export type Effect = z.infer<typeof effectSchema>;
/** W3: the `business` effect. */
export type BusinessEffect = Extract<Effect, { type: 'business' }>;

export const outcomeSchema = z.strictObject({
  text: templateSchema.optional(),
  effects: z.array(effectSchema).default([]),
});
export type Outcome = z.infer<typeof outcomeSchema>;

const checkWeightSchema = z.number().min(-2).max(2);
/** A character stat, trait or hidden value; how a cast person feels about you; or your job performance (50 without a job). */
export const checkStatSchema = z.union([
  z.strictObject({ key: statKeySchema, weight: checkWeightSchema }),
  z.strictObject({ role: roleSchema, key: z.enum(['affection', 'trust']), weight: checkWeightSchema }),
  z.strictObject({ job: z.literal('performance'), weight: checkWeightSchema }),
  /** E6a: your standing in the crew, your rank (1 to 5, centred on 3 at 50) or the heat on you, each 0-100. */
  z.strictObject({ crime: z.enum(['standing', 'rank', 'heat']), weight: checkWeightSchema }),
  /** E6b: your craft, the quality of your latest work, your fame, public image, fan mood (each 0–100), or your rung (0–100 across the ladder). */
  z.strictObject({ fame: z.enum(['craft', 'quality', 'fame', 'image', 'mood', 'rung']), weight: checkWeightSchema }),
  /** E6c: this year's rating, your team's strength, your form, or how well you fit your position (each 0–100). */
  z.strictObject({ sports: z.enum(['rating', 'team', 'form', 'fit']), weight: checkWeightSchema }),
  /**
   * E2a: your chance of having a baby with the person in `role` this year
   * (fertility, or fertilityPlanned when you plan around it: from the ages
   * and health of you both, in percent; each point above 50 adds weight), or
   * how strong your custody case is for the children you had with them
   * (custody: 0–100).
   */
  z.strictObject({ family: z.enum(['fertility', 'fertilityPlanned', 'custody']), role: roleSchema, weight: checkWeightSchema }),
]);
export type CheckStat = z.infer<typeof checkStatSchema>;

export const checkSchema = z.strictObject({
  /** Success chance in percent before stats. */
  base: z.number().min(0).max(100),
  /** Each stat adds weight × (value − 50) percentage points. */
  stats: z.array(checkStatSchema).min(1),
  success: outcomeSchema,
  failure: outcomeSchema,
});
export type Check = z.infer<typeof checkSchema>;

export const choiceSchema = z
  .strictObject({
    id: idSchema,
    label: z.string().trim().min(1).max(60),
    visibleIf: conditionSchema.optional(),
    outcome: outcomeSchema.optional(),
    check: checkSchema.optional(),
  })
  .refine((c) => (c.outcome === undefined) !== (c.check === undefined), 'a choice needs exactly one of outcome or check');
export type ChoiceDef = z.infer<typeof choiceSchema>;

export const eventSchema = baseDefSchema
  .extend({
    title: z.string().trim().min(1).max(60),
    text: templateSchema,
    tone: toneSchema,
    category: idSchema,
    rarity: raritySchema,
    lifeStages: z.array(lifeStageSchema).min(1),
    requires: conditionSchema.optional(),
    /**
     * W4a, the country tag: the event happens only in these countries (an event with no tag fits every country, so it
     * must read right in all of them: amounts as {$300}, school words as {highSchool}). The content build turns the
     * tag into the matching requirement and keeps country-specific wording (registries/categories.yaml countryTags)
     * to tagged events.
     */
    countries: z.array(countryIdSchema).min(1).max(4).optional(),
    languageBarrier: z.strictObject({ role: idSchema, text: templateSchema }).optional(),
    weight: z.strictObject({
      base: z.number().positive(),
      modifiers: z.array(z.strictObject({ if: conditionSchema, x: z.number().nonnegative() })).optional(),
    }),
    cooldownYears: z.int().min(1).optional(),
    once: z.boolean().optional(),
    /**
     * C1: meant to come back in the same life (a holiday, a checkup, a
     * yearly ritual). Repeats of events not marked recurring are kept rare
     * (balance/targets.yaml consistency.maxRepeatShare); a recurring event
     * can't also be once.
     */
    recurring: z.literal(true).optional(),
    /**
     * C1: content-build warnings that were reviewed and kept, with the reason
     * (tools/content/consistency.ts; docs/consistency-review.md).
     */
    justified: z
      .strictObject({ time: z.string().trim().min(10).optional(), money: z.string().trim().min(10).optional(), past: z.string().trim().min(10).optional(), safety: z.string().trim().min(10).optional() })
      .optional(),
    /**
     * Only happens when scheduled by another event (the later steps of a
     * chain) or queued by a management action (registries/actions.yaml).
     */
    followUpOnly: z.boolean().optional(),
    cast: z.record(roleSchema, castSpecSchema).optional(),
    /**
     * E5: the possessions the event is about: a pet, a vehicle, a vacation
     * home. One of each is picked among those that fit the requirements, and
     * the event's text can name them ({pet.name}, {vehicle}, {homeCity}).
     */
    bind: z.array(z.enum(POSSESSION_KINDS)).min(1).optional(),
    /**
     * W2: the event is about one of your groups (or, for an offer, one in your
     * city you could join): one is picked among those that make its
     * requirements true, and the text can name it ({group}, {role}, {religion}).
     */
    bindGroup: z.literal(true).optional(),
    /**
     * W3: the event is about one of your businesses: one is picked among those
     * that make its requirements true, and the text can name it ({business},
     * {bizType}, {bizCity}, {bizStyle}, {bizTitle}).
     */
    bindBusiness: z.literal(true).optional(),
    /**
     * E6c: the card keeps the words it was shown with, and the outcome keeps {stage} and
     * {opponent} as they were, even though the choice moves a playoff run on.
     */
    pin: z.literal(true).optional(),
    choices: z.array(choiceSchema).min(2).max(4).optional(),
    autoOutcome: outcomeSchema.optional(),
  })
  .refine((e) => (e.choices === undefined) !== (e.autoOutcome === undefined), 'an event needs either choices or autoOutcome')
  .refine((e) => !e.choices || new Set(e.choices.map((c) => c.id)).size === e.choices.length, 'choice ids must be unique')
  .refine((e) => !(e.recurring && e.once), 'a recurring event can’t also be once');
export type EventDef = z.infer<typeof eventSchema>;

/** A chain file: several events written together. */
export const chainFileSchema = z.strictObject({
  chain: idSchema,
  events: z.array(eventSchema).min(2),
});

/**
 * Every memory tag, with readable text (registries/memories.yaml). The text is
 * a template: the person the memory is about is cast as {npc}.
 */
export const memoryRegistrySchema = z.strictObject({ tags: z.record(idSchema, z.string().trim().min(1).max(120)) });
/** Every flag, with a one-line description (registries/flags.yaml). */
export const flagRegistrySchema = z.strictObject({ flags: z.record(idSchema, z.string().trim().min(1).max(200)) });
/** Event categories (registries/categories.yaml). */
export const categoryRegistrySchema = z.strictObject({
  /**
   * W4a, the country-tag contract: an event tagged `countries: [...]` happens only there (the build adds the
   * requirement), and wording that belongs to one country alone may appear only in events tagged for that country
   * alone. `terms` lists, per country, the words that are its own (case-sensitive patterns); `neutral` is what an
   * untagged event writes instead (amounts as {$300}, a school as {highSchool}...).
   */
  countryTags: z.strictObject({
    terms: z.array(z.strictObject({ countries: z.array(countryIdSchema).min(1), patterns: z.array(z.string().min(1)).min(1) })).min(1),
    neutral: z.string().trim().min(1).max(300),
    /** Words an untagged event writes as a placeholder, because each country says it differently. */
    placeholders: z.array(z.strictObject({ pattern: z.string().min(1), use: z.string().min(1) })).default([]),
  }),
  categories: z.record(
    idSchema,
    z.strictObject({
      label: z.string().trim().min(1).max(40),
      /** After an event of this category, others of it wait this many years. */
      cooldownYears: z.int().min(1).optional(),
      /** Dating, sex and romance: adults only, enforced by the engine and the content build. */
      romance: z.boolean().optional(),
      /**
       * Prison (Stage 9): events of this category happen only while you're
       * in prison, and while you are, only these happen.
       */
      prison: z.boolean().optional(),
      /**
       * C1, the category contract: conditions every event of this category
       * must require. The content build rejects an event whose requirements
       * don't include them, and an event that fires without them is an
       * invariant failure.
       */
      requires: conditionSchema.optional(),
      /**
       * Home, health and wellbeing (C1, the household rule): a partner who
       * lives with you is preferred for the event's support and partner roles.
       */
      household: z.boolean().optional(),
    }),
  ),
});
