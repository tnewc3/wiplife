/**
 * Fame in arts and media (E6b, docs/expansion.md): the four paths (music,
 * acting, social media, writing and art) with their rungs, entry routes and
 * kinds of project (src/content/fame), agents (src/content/agents), awards
 * (src/content/awards), the labels, studios, platforms, publishers, galleries
 * and brands that sign you (src/content/studios), the balance numbers
 * (src/content/balance/fame.yaml), the events the fame step queues
 * (registries/fame.yaml) and the lines it writes (text/fame.yaml).
 *
 * Everything named here is made up. Nothing says anything about real people,
 * companies or groups, and no fame event ever involves romance or sexual
 * content with anyone under 18 (the content build checks it, tools/content/fame.ts).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, idSchema } from './common';
import { sportSchema } from './sports';

const probability = z.number().min(0).max(1);
const positive = z.number().positive().max(1_000_000_000);
const points = z.number().min(-100).max(100);

export const FAME_STYLES = ['commercial', 'artistic'] as const;
export const FAME_RISKS = ['safe', 'bold'] as const;
export const FAME_COMMITMENTS = ['back', 'steady', 'all'] as const;
export const FAME_SCENES = ['low', 'social', 'entourage', 'lavish'] as const;
export const FAME_TERMS = ['standard', 'tough', 'generous'] as const;
export const FAME_STALKER_STAGES = ['watching', 'reported', 'ordered', 'charged'] as const;
export const FAME_FAN_TYPES = ['super', 'hater', 'critic'] as const;
/** How a project was received, by what critics and fans made of it. */
export const FAME_BANDS = ['flop', 'solid', 'hit', 'acclaimed', 'cult', 'crowd'] as const;
export const FAME_COMPANY_KINDS = ['label', 'studio', 'platform', 'publisher', 'gallery', 'brand'] as const;
/** How big a payment (or a cost) in a fame event is; it scales with your rung and your city. */
export const FAME_SIZES = ['petty', 'small', 'solid', 'big', 'major'] as const;

export type FameStyle = (typeof FAME_STYLES)[number];
export type FameRisk = (typeof FAME_RISKS)[number];
export type FameCommitment = (typeof FAME_COMMITMENTS)[number];
export type FameScene = (typeof FAME_SCENES)[number];
export type FameTerms = (typeof FAME_TERMS)[number];
export type FameStalkerStage = (typeof FAME_STALKER_STAGES)[number];
export type FameFanType = (typeof FAME_FAN_TYPES)[number];
export type FameBand = (typeof FAME_BANDS)[number];
export type FameSize = (typeof FAME_SIZES)[number];

export const fameStyleSchema = z.enum(FAME_STYLES);
export const fameRiskSchema = z.enum(FAME_RISKS);
export const fameCommitmentSchema = z.enum(FAME_COMMITMENTS);
export const fameSceneSchema = z.enum(FAME_SCENES);
export const fameTermsSchema = z.enum(FAME_TERMS);
export const fameBandSchema = z.enum(FAME_BANDS);
export const fameSizeSchema = z.enum(FAME_SIZES);

const rungSchema = z.strictObject({
  /** As it reads in a sentence without an article ("open-mic regular"). */
  title: z.string().trim().min(2).max(40),
  /** What it takes to climb to the next rung, shown as the next milestone while you stand here. */
  milestone: z.string().trim().min(8).max(120),
  /** The fame (0–100) that holds this rung. */
  fame: z.int().min(0).max(100),
  /** The quality your recent work needs to climb into it (0–100). */
  quality: z.int().min(0).max(100),
  /** A typical year's earnings here, in dollars at a city pay level of 1. */
  income: z.number().min(0).max(1_000_000_000),
  /** E6c: the youngest age that can climb into this rung (0 for none). */
  minAge: z.int().min(0).max(40).optional(),
});

const kindSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(2).max(40),
  /** What the work is called in a sentence ("single", "film"). */
  noun: z.string().trim().min(2).max(30),
  blurb: z.string().trim().min(8).max(120),
  /** The lowest rung you can take it on at. */
  minRung: z.int().min(1).max(8),
  /** Added to the quality roll (a harder kind of work is negative). */
  difficulty: z.number().min(-20).max(20),
  /** How much fame it can win, and how much it pays, as multiples of the usual. */
  reach: z.number().min(0.2).max(3),
  pay: z.number().min(0.1).max(5),
  /** Batch 4: the skills (the path's `skills`) the work draws on, and how many track titles you may give it (none: it is one piece). */
  skills: z.array(idSchema).max(4).optional(),
  tracks: z.int().min(1).max(20).optional(),
});

const routeSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(2).max(50),
  blurb: z.string().trim().min(8).max(140),
  minAge: z.int().min(5).max(90),
  /** The craft you start with. */
  craft: z.int().min(0).max(60),
  /** E6c: the rung you start on (1 when left out) and the oldest age this way in is open to. */
  rung: z.int().min(1).max(8).optional(),
  maxAge: z.int().min(5).max(90).optional(),
});

/** Batch 4: a skill you can practise in a path (vocals, songwriting): practice raises it, and it adds to the work that draws on it. */
const skillSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(2).max(40),
  blurb: z.string().trim().min(8).max(140),
  /** The skill is playing your instrument: you choose one (the path's `instruments`) before you practise it. */
  instrument: z.literal(true).optional(),
});

/** Batch 4: an instrument (or a part in a band, like the lead vocals): what you play, and what a bandmate plays. */
const instrumentSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(2).max(40),
  /** Who plays it, in a sentence ("a drummer", "the singer"). */
  player: z.string().trim().min(2).max(40),
  /** Only a band part, never your own instrument to practise (the lead vocals are a skill of their own). */
  partOnly: z.literal(true).optional(),
});

/** Batch 4: a kind of show you can play, by rung. */
const venueSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(2).max(40),
  /** In a sentence ("an open mic", "a festival slot"). */
  noun: z.string().trim().min(2).max(40),
  blurb: z.string().trim().min(8).max(140),
  minRung: z.int().min(1).max(8),
});

/** A path (src/content/fame): music, acting, social media or writing and art. */
export const famePathSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  /** What it is called in a sentence ("music", "acting"). */
  noun: z.string().trim().min(2).max(30),
  blurb: z.string().trim().min(10).max(200),
  /** The hidden talents (src/content/talents) that make a real difference here. */
  talents: z.array(idSchema).min(1),
  /** What the craft draws on besides talent: weights on personality traits and stats (they sum to about 1). */
  aptitude: z.partialRecord(z.enum(['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability', 'smarts', 'looks', 'fitness']), z.number().min(0).max(1)),
  /** How much critics count against fans for this path (0 fans only, 1 critics only). */
  criticWeight: probability,
  /** The youngest anyone can start. */
  minAge: z.int().min(5).max(90),
  routes: z.array(routeSchema).min(1),
  rungs: z.array(rungSchema).min(4).max(8),
  kinds: z.array(kindSchema).min(1),
  /** The words for a tour and a press run here ("Tour", "Book tour"). */
  tour: z.strictObject({ label: z.string().trim().min(2).max(30), noun: z.string().trim().min(2).max(30), minRung: z.int().min(1).max(8) }),
  press: z.strictObject({ label: z.string().trim().min(2).max(30), minRung: z.int().min(1).max(8) }),
  /** Retirement: from this age, the chance each year (by age) that the work winds down on its own. */
  retire: z.strictObject({ from: z.int().min(30).max(100), chance: curveSchema }),
  /** What a retired star still earns from the past, as a share of the top rung's usual year. */
  royalties: probability,
  /** E6c: a sport. It is a path like any other (rungs, fame, fans, agents, awards) with a season in place of projects. */
  sport: sportSchema.optional(),
  /**
   * Batch 4: the skills you can practise here (any path can register them;
   * Batch 5 adds a sport's). Numbers: balance/fame.yaml practice.
   */
  skills: z.array(skillSchema).max(8).optional(),
  /** Batch 4: instruments and band parts (music). */
  instruments: z.array(instrumentSchema).max(30).optional(),
  /** Batch 4: bands: the part you take when you sing (an instrument id with partOnly). */
  bands: z.strictObject({ singer: idSchema }).optional(),
  /** Batch 4: the shows you can play, by rung, and the skills a show draws on. Numbers: balance/fame.yaml shows. */
  shows: z.strictObject({ skills: z.array(idSchema).max(4), venues: z.array(venueSchema).min(1).max(8) }).optional(),
  /** Batch 4: genres (src/content/genres) belong to this path: you choose a main one and one for each release. */
  genres: z.literal(true).optional(),
});
export type FameSkillDef = z.infer<typeof skillSchema>;
export type FameInstrumentDef = z.infer<typeof instrumentSchema>;
export type FameVenueDef = z.infer<typeof venueSchema>;

/** Batch 4: a genre (src/content/genres). Affinities between genres are in balance/fame.yaml sound. */
export const fameGenreSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  /** In a sentence, lower case where it should be ("alt rock", "R&B"). */
  noun: z.string().trim().min(2).max(40),
  path: idSchema,
  blurb: z.string().trim().min(8).max(160),
});
export type FameGenreDef = z.infer<typeof fameGenreSchema>;
export type FamePathDef = z.infer<typeof famePathSchema>;
export type FameRungDef = z.infer<typeof rungSchema>;
export type FameKindDef = z.infer<typeof kindSchema>;

/** An agent (src/content/agents): a better one takes a bigger cut and opens bigger doors. */
export const fameAgentSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  blurb: z.string().trim().min(10).max(160),
  tier: z.int().min(1).max(3),
  /** Their cut of what you earn (0–1). */
  cut: probability,
  /** The rung you need to be taken on, and the public image. */
  minRung: z.int().min(1).max(8),
  minImage: z.int().min(0).max(100),
});
export type FameAgentDef = z.infer<typeof fameAgentSchema>;

/** An awards show (src/content/awards). */
export const fameAwardSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(50),
  /** The category as it reads in a sentence ("Album of the Year"). */
  category: z.string().trim().min(2).max(50),
  path: idSchema,
  blurb: z.string().trim().min(10).max(160),
  /** The lowest rung that is considered. */
  minRung: z.int().min(1).max(8),
  /** How much critics decide against fans (0–1). */
  critics: probability,
  /** 1 for a big show, less for a smaller one: the chance of being nominated scales with it. */
  prestige: z.number().min(0.1).max(2),
});
export type FameAwardDef = z.infer<typeof fameAwardSchema>;

/** A label, studio, platform, publisher, gallery or brand (src/content/studios). */
export const fameCompanySchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  path: idSchema,
  kind: z.enum(FAME_COMPANY_KINDS),
  /** 1 signs newcomers, 3 signs the biggest names. */
  tier: z.int().min(1).max(3),
  blurb: z.string().trim().min(10).max(160),
});
export type FameCompanyDef = z.infer<typeof fameCompanySchema>;

const perTerms = <T extends z.ZodType>(value: T) => z.strictObject({ standard: value, tough: value, generous: value });
const perCommitment = <T extends z.ZodType>(value: T) => z.strictObject({ back: value, steady: value, all: value });
const perScene = <T extends z.ZodType>(value: T) => z.strictObject({ low: value, social: value, entourage: value, lavish: value });
const effect = z.strictObject({ critic: points, fan: points });
/** Like a curve, but its values may be negative (fame lost for work that lands badly). */
const signedCurveSchema = z
  .array(z.strictObject({ at: z.number(), x: z.number() }))
  .min(1)
  .refine((pts) => pts.every((p, i) => i === 0 || p.at > pts[i - 1]!.at), 'points must be in increasing "at" order');

/** Fame numbers (src/content/balance/fame.yaml). */
export const fameBalanceSchema = z.strictObject({
  entry: z.strictObject({
    /** Fame, public image, fan mood and fans on the first rung. */
    fame: z.number().min(0).max(30),
    image: z.int().min(0).max(100),
    mood: z.int().min(0).max(100),
    fans: z.int().min(0).max(100_000),
    /** Nobody starts past this age. */
    maxAge: z.int().min(30).max(100),
    /** Craft a person without a route's head start begins with. */
    craft: z.int().min(0).max(60),
  }),
  quality: z.strictObject({
    base: z.number().min(0).max(60),
    /** The most the blend of traits and stats can add. */
    aptitude: z.number().min(0).max(40),
    /** A hidden talent that fits the path, and the extra when you have found it. */
    talent: z.number().min(0).max(60),
    talentFound: z.number().min(0).max(20),
    /** Points per point of craft. */
    craft: z.number().min(0).max(1),
    /** Per tier of agent and of the company that signed you. */
    team: z.strictObject({ agent: z.number().min(0).max(10), company: z.number().min(0).max(10) }),
    /** Per point of luck above 50. */
    luck: z.number().min(0).max(0.5),
    /** The spread of the roll. */
    noise: z.number().min(0).max(30),
    /** Craft gained in a year of work, by craft so far (slower as it grows), plus discipline and a lean toward talent. */
    craftGain: curveSchema,
    craftDiscipline: z.number().min(0).max(0.1),
    /** The most craft you can reach: with a talent that fits the path, and without (practice alone only takes you so far). */
    craftCap: z.strictObject({ talent: z.number().min(0).max(100), none: z.number().min(0).max(100) }),
    /** Craft gained in a year without a project, as a share of a year's work. */
    craftIdle: probability,
  }),
  reception: z.strictObject({
    style: z.strictObject({ commercial: effect, artistic: effect }),
    risk: z.strictObject({
      safe: z.strictObject({ critic: points, fan: points, spread: z.number().min(0.1).max(5) }),
      bold: z.strictObject({ critic: points, fan: points, spread: z.number().min(0.1).max(5) }),
    }),
    /** Per point of fan mood and public image above 50. */
    mood: z.number().min(0).max(1),
    image: z.number().min(0).max(1),
    /** The spread of critics' and fans' separate rolls. */
    noise: z.number().min(0).max(30),
    /** Where each band starts: acclaimed needs both scores, cult is critics high and fans low, crowd the other way. */
    bands: z.strictObject({ acclaimed: z.int().min(0).max(100), hit: z.int().min(0).max(100), solid: z.int().min(0).max(100), high: z.int().min(0).max(100), low: z.int().min(0).max(100) }),
  }),
  gain: z.strictObject({
    /** Fame points a release wins (or loses) by how it was received (0–100). */
    reception: signedCurveSchema,
    /** A multiple by rung (rung 1 first): the higher you are, the slower the climb. */
    rung: z.array(z.number().min(0.05).max(3)).min(4).max(8),
    commitment: perCommitment(z.number().min(0).max(4)),
    /** Multiples: a press run, a tour on the road as the release came out (Batch 4: booked on its own), and per tier of agent. */
    press: z.number().min(1).max(3),
    tour: z.number().min(1).max(3),
    agent: z.number().min(0).max(1),
    /** A comeback: the extra when fame has faded and a project lands. */
    comeback: z.number().min(1).max(4),
    /** The fan base your fame supports (fame → fans), how fast fans follow it, and how much fan mood swings it (0 none, 1 from half to one and a half times). */
    fansAt: curveSchema,
    fansFollow: probability,
    moodFans: probability,
    /** Fan mood moves by this share of (fan score − what fans expected, 55). */
    moodShare: z.number().min(0).max(2),
    /** Public image moves by this share of (critic score − 50) and by the style and risk of the work. */
    imageShare: z.number().min(0).max(1),
  }),
  income: z.strictObject({
    /** A release pays this multiple of the rung's usual year, by how fans took it (0–100). */
    release: curveSchema,
    /** Gigs, royalties and retainers pay this share of the usual year with no new work, as long as you are active. */
    retainer: probability,
    /** Brands: the share added by public image above 50 (per point). */
    image: z.number().min(0).max(0.1),
    /** Money events pay (or cost) this share of the rung's usual year, by size. */
    sizes: z.strictObject({ petty: positive, small: positive, solid: positive, big: positive, major: positive }),
    /** A floor, in dollars at a city pay level of 1, for what a size is worth to someone on the lowest rungs. */
    floor: z.strictObject({ petty: positive, small: positive, solid: positive, big: positive, major: positive }),
  }),
  commitment: z.strictObject({
    /** Fame's yearly toll: affection lost by your partner and children, and by friends and family, a point of health, stress. */
    strain: perCommitment(z.strictObject({ close: z.number().min(0).max(30), other: z.number().min(0).max(30), health: z.number().min(0).max(10), stress: z.number().min(-20).max(20), happiness: z.number().min(-10).max(10) })),
    /** Burnout: gained (or lost) a year at each setting, the level above which it can strike and the chance each year above it, by level. */
    burnout: z.strictObject({ perYear: perCommitment(z.number().min(-50).max(50)), risk: curveSchema, recover: z.number().min(0).max(100), after: z.int().min(0).max(100) }),
    /** A day job suffers: points off the performance review a year, by setting. */
    job: perCommitment(z.number().min(-50).max(0)),
    /** The extra output at each setting: a multiple on what a release pays. */
    output: perCommitment(z.number().min(0.1).max(3)),
    /** Under 18 you can't go all in. */
    minorsMax: fameCommitmentSchema,
  }),
  bigBreak: z.strictObject({
    /** The yearly chance by the quality of your recent work (0–100), times exposure (a press run, a tour) and your rung's room to jump. */
    chance: curveSchema,
    exposure: z.strictObject({ press: z.number().min(1).max(5), tour: z.number().min(1).max(5), agent: z.number().min(0).max(1) }),
    /** Rungs a break jumps. */
    jump: z.strictObject({ min: z.int().min(1).max(4), max: z.int().min(1).max(4) }),
    /** How high a break can take you, as a share of the ladder: with a talent that fits, with none. */
    ceiling: z.strictObject({ talent: probability, none: probability }),
    /** Years before another can strike. */
    cooldown: z.int().min(1).max(30),
    /** Luck counts for a little: per point above 50. */
    luck: z.number().min(0).max(0.02),
  }),
  fade: z.strictObject({
    /** Fame lost in a year with no new work (a share of fame, plus a flat amount), and the extra a rung loses when your recent work is below its quality. */
    share: probability,
    flat: z.number().min(0).max(20),
    thin: z.number().min(0).max(30),
    /** A rung is lost when fame falls this far under the fame that holds it. */
    slack: z.number().min(0).max(30),
    /** Fans drift away without work: a share a year. */
    fans: probability,
    /** Fan mood drifts toward restless without work: points a year. */
    mood: z.number().min(0).max(30),
    /** A career still on its first rung that has put out nothing for this many years has simply ended. */
    dormant: z.int().min(1).max(40),
  }),
  comeback: z.strictObject({
    /** The yearly chance an event offers one to someone whose fame has faded, by years since the last project. */
    chance: curveSchema,
    /** Fame regained of the peak when you go back to work. */
    share: probability,
  }),
  agents: z.strictObject({
    /** The yearly chance an agent comes to you, by rung. */
    offer: curveSchema,
    /** Extra chance per tier of the agent you have for contract offers and for a big break. */
    doors: z.number().min(0).max(1),
    /** What dropping an agent costs your public image. */
    dropImage: z.number().min(0).max(30),
  }),
  contracts: z.strictObject({
    /** Offers come by rung and image, this often each year. */
    offer: curveSchema,
    /** The advance, as a multiple of the rung's usual year, by terms. */
    advance: perTerms(z.number().min(0).max(5)),
    /** The share the company keeps of what the work earns, by terms. */
    share: perTerms(probability),
    /** Years the deal runs, by terms: min and max. */
    years: perTerms(z.strictObject({ min: z.int().min(1).max(10), max: z.int().min(1).max(10) })),
    /** Tough terms are exclusive; the others mostly aren't. */
    exclusive: perTerms(probability),
    /** The least you can hold back while under contract. */
    minCommitment: fameCommitmentSchema,
    /** Breaking one: you repay this share of the advance, and lose this much image and fan mood. */
    breakFee: probability,
    breakImage: z.number().min(0).max(50),
    breakMood: z.number().min(0).max(50),
    /** A parent signs for anyone under 18; the contract is capped at this many years. */
    minorYears: z.int().min(1).max(10),
  }),
  awards: z.strictObject({
    /** The chance of a nomination by the critics' and fans' scores (0–100) and by the award's prestige. */
    nominate: curveSchema,
    /** The chance of winning once nominated, by how the work was received (0–100). */
    win: curveSchema,
    /** Public image and fan mood moves: nominated, won, lost. */
    image: z.strictObject({ nominated: z.number().min(-20).max(20), won: z.number().min(-20).max(30), lost: z.number().min(-20).max(20) }),
    fame: z.strictObject({ nominated: z.number().min(0).max(20), won: z.number().min(0).max(30) }),
  }),
  scene: z.strictObject({
    /** The share of a year's earnings it costs, and the stat pulls: happiness, public image. */
    cost: perScene(probability),
    happiness: perScene(z.number().min(-10).max(10)),
    image: perScene(z.number().min(-10).max(10)),
    /** The chance a year of it gives the tabloids something (times fame), and the extra chance it brings an invitation event. */
    scandal: perScene(probability),
    /** The least earnings (a typical year at the rung) it is sensible to spend this way; the screen only warns. */
    minRung: perScene(z.int().min(1).max(8)),
    /** Owning a vacation home or a car worth more than this adds to the scene. */
    perks: z.strictObject({ value: z.int().min(0).max(1_000_000), image: z.number().min(0).max(10), happiness: z.number().min(0).max(10) }),
  }),
  people: z.strictObject({
    /** The yearly chance a new fan person appears, by fame, for each kind. */
    super: curveSchema,
    hater: curveSchema,
    critic: curveSchema,
    /** The most of each kind at once. */
    max: z.int().min(1).max(10),
    /** How a fan person feels about you at first. */
    affection: z.strictObject({ super: z.int().min(0).max(100), hater: z.int().min(0).max(100), critic: z.int().min(0).max(100) }),
    /** The yearly chance a superfan's devotion turns to stalking (adults only), by fan mood and fame. */
    stalk: curveSchema,
    /** Fan people leave your life after this many years of no news. */
    leaveYears: z.int().min(1).max(30),
  }),
  stalker: z.strictObject({
    /** Each year a stalker is active: the chance things escalate (an event), the chance they give up, and the stress it costs. */
    escalate: probability,
    giveUp: probability,
    stress: z.number().min(0).max(20),
    /** When you report: the chance they are charged, and with an order in place the chance of a violation that gets them charged. */
    charge: probability,
    order: probability,
    violate: probability,
  }),
  tabloids: z.strictObject({
    /** The least fame (not rung) before a secret can go public, and under what age never. */
    minFame: z.int().min(0).max(100),
    minAge: z.int().min(0).max(30),
    /** The yearly chance, by fame, that a secret about you becomes common knowledge. */
    chance: curveSchema,
    /** The scene's pull on that chance is `scene.scandal`; a bad image adds this per point under 50. */
    image: z.number().min(0).max(0.02),
    /** Image and fan mood fall by this much, times how serious the story is (its affection hit). */
    hit: z.strictObject({ image: z.number().min(0).max(30), mood: z.number().min(0).max(30), fame: z.number().min(0).max(10) }),
    /** The headlines the news feed keeps. */
    keep: z.int().min(1).max(20),
  }),
  crossover: z.strictObject({
    /** The rung and fame you need on your first path. */
    rung: z.int().min(2).max(8),
    fame: z.int().min(0).max(100),
    /** What carries over to the second path: shares of your rung, fame and craft. */
    carry: z.strictObject({ rung: probability, fame: probability, craft: probability }),
  }),
  retirement: z.strictObject({
    /** Retired stars still earn royalties, fading by this share a year. */
    fade: probability,
    /** Years of royalties kept. */
    years: z.int().min(1).max(50),
    /** Fans of a retired star drift off by this share a year. */
    fans: probability,
  }),
  minors: z.strictObject({
    /** A parent keeps (or banks) this share of a minor's earnings. */
    trust: probability,
    /** Under this age a parent must be alive in your life to start. */
    parentAge: z.int().min(5).max(18),
  }),
  /** The yearly jobs the fame step queues are capped: events from the registry, most pressing first. */
  events: z.strictObject({ maxQueued: z.int().min(1).max(6) }),
  /**
   * Batch 4: practice. Sessions a year by commitment (a minor has at most
   * steady's), the points a session adds by the skill so far (slower as it
   * grows), each session of the same skill in a year worth this share of the
   * one before (diminishing returns), the most a skill reaches with a talent
   * that fits and without, the multiple for a talent and per point of
   * discipline above 50, the share of a session's gain that also goes to craft,
   * and the quality points per point of the skills a kind of work draws on.
   * Practice never touches health: it causes no injury.
   */
  practice: z.strictObject({
    sessions: perCommitment(z.int().min(0).max(40)),
    gain: curveSchema,
    repeat: probability,
    cap: z.strictObject({ talent: z.number().min(0).max(100), none: z.number().min(0).max(100) }),
    talent: z.number().min(1).max(3),
    discipline: z.number().min(0).max(0.05),
    craft: probability,
    quality: z.number().min(0).max(0.5),
    /** A skill you have not touched starts here; changing your instrument keeps this share of it. */
    start: z.number().min(0).max(50),
    switchKeep: probability,
  }),
  /**
   * Batch 4: shows. At most `perYear` a year. A show's score (0–100) comes from
   * `base`, the aptitude blend, a talent that fits, the show skills, craft, the
   * band and a roll; it lands great, good or rough (`bands`), which multiplies
   * what it brings. By venue: pay (a share of the rung's usual year), fame
   * points, fans (a share of the fans your fame supports, with a floor), craft
   * and stress. A band takes its share of the pay and brings more people in.
   */
  shows: z.strictObject({
    perYear: z.int().min(1).max(20),
    base: z.number().min(0).max(60),
    aptitude: z.number().min(0).max(40),
    talent: z.number().min(0).max(40),
    skills: z.number().min(0).max(1),
    craft: z.number().min(0).max(1),
    noise: z.number().min(0).max(30),
    bands: z.strictObject({ great: z.int().min(0).max(100), good: z.int().min(0).max(100) }),
    outcome: z.strictObject({ great: z.number().min(0).max(3), good: z.number().min(0).max(3), rough: z.number().min(-1).max(3) }),
    venues: z.record(idSchema, z.strictObject({ pay: z.number().min(0).max(1), fame: z.number().min(0).max(10), fans: z.number().min(0).max(0.2), fansFloor: z.int().min(0).max(10000), craft: z.number().min(0).max(5), stress: z.number().min(0).max(10) })),
    /** Bandmates' feelings and the band's chemistry after a show: great, good, rough. */
    affection: z.strictObject({ great: z.number().min(-10).max(10), good: z.number().min(-10).max(10), rough: z.number().min(-10).max(10) }),
    chemistry: z.strictObject({ great: z.number().min(-10).max(10), good: z.number().min(-10).max(10), rough: z.number().min(-10).max(10) }),
    /** The chance a show leaves a story for the coming year (an event). */
    event: probability,
  }),
  /**
   * Batch 4: tours, at most one a year (booked between years, on the road as
   * the year begins). The size goes by how far up the ladder you are (a share
   * of its rungs). By size: what it costs up front and brings in (shares of the
   * rung's usual year; what it brings moves with fan mood), fame points
   * (before the rung's multiple and your commitment's), the share added to
   * your fans, the extra strain on the people close to you and on everyone
   * else, stress and burnout.
   */
  tours: z.strictObject({
    perYear: z.int().min(1).max(4),
    sizes: z.strictObject(Object.fromEntries(['local', 'regional', 'national', 'world'].map((k) => [k, z.strictObject({ from: probability, cost: z.number().min(0).max(5), revenue: z.number().min(0).max(5), fame: z.number().min(0).max(20), fans: z.number().min(0).max(1), close: z.number().min(0).max(20), other: z.number().min(0).max(20), stress: z.number().min(0).max(20), burnout: z.number().min(0).max(40) })])) as Record<'local' | 'regional' | 'national' | 'world', z.ZodObject<{ from: z.ZodNumber; cost: z.ZodNumber; revenue: z.ZodNumber; fame: z.ZodNumber; fans: z.ZodNumber; close: z.ZodNumber; other: z.ZodNumber; stress: z.ZodNumber; burnout: z.ZodNumber }>>),
    /** What it brings in at fan mood 0 and at 100 (a multiple, linear between). */
    mood: z.strictObject({ low: z.number().min(0).max(3), high: z.number().min(0).max(3) }),
  }),
  /**
   * Batch 4: bands. Members besides you (auditions bring between min and
   * max), their skill (0–100) by your rung, how they feel about you at first,
   * the starting chemistry, your share of what the band earns, and what the
   * band adds to the work (per point of the members' mean skill, and per
   * point of chemistry above 50). Yearly: chemistry follows how members feel by this
   * share; drama by chemistry (the chance of a clash, a member quitting and
   * a split), a poaching chance per member by their skill, and the chance of
   * an offer from a band in your city by rung. Leaving: affection lost by
   * members, and the share of fans that stay with you (going solo keeps more).
   */
  band: z.strictObject({
    size: z.strictObject({ min: z.int().min(1).max(6), max: z.int().min(1).max(8) }),
    skill: curveSchema,
    affection: z.int().min(0).max(100),
    chemistry: z.int().min(0).max(100),
    cut: probability,
    quality: z.strictObject({ skill: z.number().min(0).max(0.5), chemistry: z.number().min(0).max(0.5) }),
    showFans: z.number().min(1).max(3),
    drift: probability,
    clash: curveSchema,
    quit: curveSchema,
    split: curveSchema,
    poach: curveSchema,
    offer: curveSchema,
    /** Kicking someone out: their affection lost, and chemistry lost (or won, when they were the trouble). */
    kick: z.strictObject({ affection: z.int().min(0).max(100), chemistry: z.number().min(-30).max(30) }),
    leave: z.strictObject({ affection: z.int().min(0).max(100), fans: probability }),
    solo: z.strictObject({ affection: z.int().min(0).max(100), fans: probability }),
    /** The youngest a bandmate of an adult can be; a minor's bandmates are within this many years of their age. */
    adultMin: z.int().min(16).max(30),
    minorSpread: z.int().min(1).max(5),
  }),
  /**
   * Batch 4: your sound. Affinity between two genres (0–1; pairs not listed
   * have `other`); distance is 1 minus it. A release outside your genre:
   * critics judge it as they would any (no change); fans' score moves by
   * `fanScore` per point of distance, fan mood by `mood`, a share of fans
   * leave (`leave`) and new ones come by how fans took it (`gain`, at a fan
   * score of 100). Changing your main genre: fans leave and mood falls by
   * distance.
   */
  sound: z.strictObject({
    affinity: z.array(z.strictObject({ a: idSchema, b: idSchema, x: probability })),
    other: probability,
    offGenre: z.number().min(0).max(1),
    fanScore: z.number().min(0).max(40),
    mood: z.number().min(0).max(40),
    leave: probability,
    gain: probability,
    switchLeave: probability,
    switchMood: z.number().min(0).max(40),
  }),
});
export type FameBalance = z.infer<typeof fameBalanceSchema>;

/** The events the fame step queues (registries/fame.yaml). */
export const FAME_TRIGGERS = [
  'flop',
  'solid',
  'hit',
  'acclaimed',
  'cult',
  'crowd',
  'bigBreak',
  'fade',
  'comeback',
  'burnout',
  'agent',
  'contract',
  'contractEnd',
  'won',
  'lost',
  'tabloid',
  'scandal',
  'superfan',
  'hater',
  'critic',
  'stalker',
  'retire',
  'crossover',
  'tour',
  'press',
  // Batch 4: bands, shows, tours, your sound and practice.
  'bandClash',
  'bandQuit',
  'bandPoached',
  'bandSplit',
  'bandOffer',
  'bandFormed',
  'show',
  'tourHome',
  'genreSwitch',
  'offGenre',
  'practice',
] as const;
export type FameTrigger = (typeof FAME_TRIGGERS)[number];

export const fameRegistrySchema = z.strictObject({
  triggers: z.strictObject(
    Object.fromEntries(FAME_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      FameTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type FameRegistry = z.infer<typeof fameRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The history lines the fame systems write (text/fame.yaml). Values: {path}, {rung}, {project}, {company}, {award}. */
export const FAME_HISTORY_KEYS = [
  'entered',
  'climbed',
  'faded',
  'break',
  'signed',
  'agent',
  'award',
  'burnout',
  'retired',
  'comeback',
  'crossover',
  'stalker',
  'tabloid',
  // Batch 4: what you put out (by title), bands and your sound.
  'released',
  'bandFormed',
  'bandJoined',
  'bandLeft',
  'bandSolo',
  'bandSplit',
  'bandRenamed',
  'genre',
  'tour',
] as const;
export type FameHistoryKey = (typeof FAME_HISTORY_KEYS)[number];

const quotes = z.strictObject(Object.fromEntries(FAME_BANDS.map((b) => [b, z.array(z.string().trim().min(8)).min(2)])) as Record<FameBand, z.ZodArray<z.ZodString>>);

export const fameTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(FAME_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<FameHistoryKey, typeof historyLine>),
  /** Short quotes from critics and from fans, by how the work was received. Values: {project}, {noun}. */
  critic: quotes,
  fan: quotes,
  /** Titles for projects, by path (Batch 4: the suggestions the project step offers). */
  titles: z.record(idSchema, z.array(z.string().trim().min(2).max(40)).min(8)),
  /** Batch 4: band names: suggestions when you form one, and the names of bands that ask you to join. */
  bandNames: z.array(z.string().trim().min(2).max(40)).min(20),
  /** Batch 4: the word for each size of tour ("a {size} tour"). */
  tourSizes: z.strictObject({ local: z.string().trim().min(2).max(20), regional: z.string().trim().min(2).max(20), national: z.string().trim().min(2).max(20), world: z.string().trim().min(2).max(20) }),
  /** Tabloid headlines, by the kind of story (registries/web.yaml kinds) and a few general ones. Values: {name}. */
  tabloid: z.record(idSchema, z.array(z.string().trim().min(8)).min(1)),
});
export type FameText = z.infer<typeof fameTextSchema>;

/** The text values fame events can use: see src/engine/fame/text.ts. */
export const FAME_TEXT_VALUES = ['project', 'noun', 'review', 'fanLine', 'rungTitle', 'nextTitle', 'pathNoun', 'company', 'agent', 'award', 'headline', 'secondPath', 'bandName', 'genre', 'releaseGenre', 'venue', 'tourNoun', 'offerName'] as const;
export type FameTextValue = (typeof FAME_TEXT_VALUES)[number];
