/**
 * Sports (E6c, docs/expansion.md): five sports (basketball, American football,
 * soccer, baseball, hockey) built on E6b's fame paths. A sport is a fame path
 * with a `sport` block: its positions and key stats, how a season runs, the
 * ages that matter, the injuries it brings, and its fictional leagues and
 * teams (src/content/fame). The numbers shared by all sports are in
 * src/content/balance/sports.yaml, the events the sports step queues in
 * registries/sports.yaml and the lines it writes in text/sports.yaml.
 *
 * Everything named here is made up. Nothing says anything about real people,
 * teams, leagues or companies.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { idSchema } from './common';

const probability = z.number().min(0).max(1);

export const SPORT_LEVELS = ['youth', 'school', 'college', 'pro'] as const;
export type SportLevel = (typeof SPORT_LEVELS)[number];
export const SPORT_FOCUSES = ['skills', 'conditioning', 'film'] as const;
export type SportFocus = (typeof SPORT_FOCUSES)[number];
export const SPORT_CONTRACT_KINDS = ['minimum', 'rookie', 'standard', 'star'] as const;
export type SportContractKind = (typeof SPORT_CONTRACT_KINDS)[number];
export const SPORT_OPTIONS = ['none', 'team', 'player'] as const;
export type SportOption = (typeof SPORT_OPTIONS)[number];
/** How the playoffs went: missed them, lost somewhere, lost the final, won it. */
export const SPORT_RESULTS = ['missed', 'out', 'final', 'champion'] as const;
export type SportResult = (typeof SPORT_RESULTS)[number];
export const SPORT_RETIRE_ROUTES = ['coaching', 'broadcast', 'normal'] as const;
export type SportRetireRoute = (typeof SPORT_RETIRE_ROUTES)[number];
/** Batch 5: the kinds of team you can try out for: youth clubs, school teams, college programs. (Pro teams are camps.) */
export const TEAM_TIERS = ['rec', 'club', 'travel', 'academy', 'jv', 'varsity', 'community', 'state', 'elite'] as const;
export type TeamTier = (typeof TEAM_TIERS)[number];
/** How you play a tryout scrimmage (the choices of the tryout events). */
export const TRYOUT_APPROACHES = ['steady', 'hustle', 'showoff', 'listen'] as const;
export type TryoutApproach = (typeof TRYOUT_APPROACHES)[number];
/** How a tryout ended: you made the team, a fallback took you, or no team did. */
export const TRYOUT_RESULTS = ['made', 'fallback', 'cut'] as const;
export type TryoutResult = (typeof TRYOUT_RESULTS)[number];
/** Where you stand on your team. */
export const SPORT_ROLES = ['starter', 'rotation', 'reserve'] as const;
export type SportRole = (typeof SPORT_ROLES)[number];
/** The ways to train: with your team's coaches and facilities, at a gym, or with a private coach. */
export const TRAINING_MODES = ['team', 'gym', 'coach'] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];

const text = (max: number) => z.string().trim().min(2).max(max);
/** A curve whose values may be negative (an age's effect on play). */
const signedCurveSchema = z
  .array(z.strictObject({ at: z.number(), x: z.number() }))
  .min(1)
  .refine((pts) => pts.every((p, i) => i === 0 || p.at > pts[i - 1]!.at), 'points must be in increasing "at" order');

const statSchema = z.strictObject({
  id: idSchema,
  label: text(30),
  /** How many decimals the number shows (a batting average needs three, points per game one). */
  decimals: z.int().min(0).max(3),
  /** What the number is per ("per game", "per match"); empty for a total or a rate. */
  per: z.string().trim().max(20),
});

const positionSchema = z.strictObject({
  id: idSchema,
  label: text(30),
  blurb: z.string().trim().min(8).max(120),
  /** What the position asks of you: weights on stats and traits, like a path's aptitude (they sum to about 1). */
  fit: z.partialRecord(z.enum(['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability', 'smarts', 'looks', 'fitness']), z.number().min(0).max(1)),
  /** How much one player here moves the team (0.5 a bit part, 1.5 the heart of the side). */
  impact: z.number().min(0.4).max(1.6),
  /** The numbers a player here puts up: a season's value runs from `low` (a rating of 0) to `high` (a rating of 100). */
  stats: z.array(z.strictObject({ id: idSchema, low: z.number(), high: z.number() })).min(2).max(4),
});

const proTeamSchema = z.strictObject({
  id: idSchema,
  name: text(40),
  /** One of the game's cities (src/content/cities): a pro player lives where the team plays. */
  city: idSchema,
  quality: z.int().min(0).max(100),
});

const amateurLeagueSchema = z.strictObject({
  name: text(50),
  /** Team names. School and college teams are a school of the city plus one of these; youth teams are the city plus one of these. */
  nicknames: z.array(text(30)).min(4),
});

const injurySchema = z.strictObject({
  /** A condition of kind injury (src/content/conditions). */
  id: idSchema,
  weight: z.number().positive().max(100),
  /** How bad it starts (severity, 1–100). */
  min: z.int().min(1).max(100),
  max: z.int().min(1).max(100),
});

/** The `sport` block of a fame path (src/content/fame). */
export const sportSchema = z.strictObject({
  positions: z.array(positionSchema).min(3).max(8),
  stats: z.array(statSchema).min(3).max(8),
  season: z.strictObject({
    /** Games in a pro season. */
    games: z.int().min(10).max(200),
    /** A game can end level (soccer): wins, draws and losses. */
    draws: z.boolean(),
    /** Teams that reach the playoffs in the pro league. */
    playoffTeams: z.int().min(2).max(32),
    /** What the season is called in a sentence ("the regular season"). */
    noun: text(30),
  }),
  /** The three series of a playoff run, as they read in a sentence ("the first round", "the conference final", "the final"). */
  stages: z.array(text(40)).length(3),
  /** What the title is called ("the championship", "the cup"). */
  title: text(40),
  /** The rung where pro play begins (a draft or a signing gets you there). */
  proRung: z.int().min(2).max(7),
  /** You age out of a level when you are older than this: one age for each level below pro. */
  ageOut: z.array(z.int().min(8).max(30)).min(1).max(3),
  draft: z.strictObject({
    name: text(40),
    /** The youngest age you can declare, and the age you must. */
    age: z.int().min(18).max(25),
    force: z.int().min(18).max(28),
    rounds: z.int().min(1).max(8),
  }),
  /** Points added to a season's rating by age: where a player peaks and how fast they decline. */
  ageCurve: signedCurveSchema,
  /** How rough the sport is on a body (1 is the middle). */
  hazard: z.number().min(0.2).max(3),
  injuries: z.array(injurySchema).min(2),
  leagues: z.strictObject({
    youth: amateurLeagueSchema,
    school: amateurLeagueSchema,
    college: amateurLeagueSchema,
    pro: z.strictObject({ name: text(50), teams: z.array(proTeamSchema).min(8).max(32) }),
  }),
});
export type SportDef = z.infer<typeof sportSchema>;
export type SportPositionDef = z.infer<typeof positionSchema>;
export type SportProTeamDef = z.infer<typeof proTeamSchema>;

const focusSchema = z.strictObject({
  /** A multiple on the craft a year of play teaches. */
  craft: z.number().min(0).max(3),
  /** Fitness gained a year (minus is lost). */
  fitness: z.number().min(-3).max(3),
  /** Points on a season's rating. */
  rating: z.number().min(-5).max(10),
});

const share = probability;

const tierSchema = z.strictObject({
  /** The level of play. */
  level: z.enum(SPORT_LEVELS).refine((l) => l !== 'pro', 'a team tier is below the pros'),
  /** Which of `league.quality` this tier starts from, and the shift from it. */
  base: z.enum(['youth', 'high', 'community', 'state', 'elite']),
  shift: z.int().min(-30).max(30),
  /** The rating a prospect needs to make the team on a normal day. */
  bar: z.int().min(0).max(100),
  /** What a year costs, whole dollars in the base currency (scaled to where you live). */
  fee: z.int().min(0).max(100000),
  /** Ages that can try out. */
  minAge: z.int().min(5).max(30),
  maxAge: z.int().min(5).max(40),
  /** The tier of the same level that takes you if you are cut (none for the bottom of a level). */
  fallback: z.enum(TEAM_TIERS).nullable(),
});

/** Sports numbers (src/content/balance/sports.yaml). */
export const sportsBalanceSchema = z.strictObject({
  performance: z.strictObject({
    /** Points of rating per point of Fitness above 50. */
    fitness: z.number().min(0).max(1),
    /** Points of rating for a perfect fit with your position (and the same lost for the worst fit). */
    fit: z.number().min(0).max(40),
    /** Points of rating per point your team stands above 50 (good teams make good players look better). */
    team: z.number().min(0).max(0.5),
    /** Points of rating lost per point of severity of an injury you play with. */
    injury: z.number().min(0).max(1),
    /** Points of rating for each point of form events gave you. */
    form: z.number().min(0).max(5),
    /** Each yearly training focus. */
    focus: z.strictObject({ skills: focusSchema, conditioning: focusSchema, film: focusSchema }),
    /** Craft lost by moving to another position. */
    switchCraft: z.int().min(0).max(30),
    /** Rating bonus for a position when film study is the focus, per point of smarts above 50. */
    film: z.number().min(0).max(0.5),
  }),
  league: z.strictObject({
    /** How far a team's strength swings in a year. */
    strengthSd: z.number().min(0).max(30),
    /** How far one player of impact 1 moves his team, per rating point above 50. */
    playerShare: z.number().min(0).max(1),
    /** Strength points that make a team twice as likely to win as to lose a game. */
    winScale: z.number().min(2).max(60),
    /** Rivals in an amateur league, and the share of them that reach the playoffs. */
    rivals: z.int().min(4).max(20),
    amateurPlayoffs: share,
    /** Games in an amateur season, by level. */
    games: z.strictObject({ youth: z.int().min(4).max(60), school: z.int().min(4).max(60), college: z.int().min(4).max(60) }),
    /** How much the team's record moves what critics and fans make of your season: points per point of win share above half. */
    reception: z.strictObject({ critics: z.number().min(0).max(1), fans: z.number().min(0).max(1) }),
    /** The quality of amateur teams: a youth team, and a school of each tier. */
    quality: z.strictObject({ youth: z.int().min(0).max(100), high: z.int().min(0).max(100), community: z.int().min(0).max(100), state: z.int().min(0).max(100), elite: z.int().min(0).max(100) }),
    /** Draws in a soccer-type game, as a share of games between level sides. */
    draws: share,
    /** A rating at or above this makes the all-star team (pro only). */
    allStar: z.int().min(0).max(100),
  }),
  playoffs: z.strictObject({
    /** The chance of winning a series left to the engine (a run nobody played out), by the gap between your strength and theirs. */
    settle: curveSchema,
    /** Fame won for each series won, and for the title. */
    fame: z.strictObject({ series: z.number().min(0).max(10), title: z.number().min(0).max(30) }),
    /** Fan mood gained for the title. */
    mood: z.number().min(0).max(30),
  }),
  injury: z.strictObject({
    /** The yearly chance at a hazard of 1, a middling Fitness, age 25 and a steady commitment. */
    base: probability,
    /** A multiple by level of play. */
    level: z.strictObject({ youth: z.number().min(0).max(3), school: z.number().min(0).max(3), college: z.number().min(0).max(3), pro: z.number().min(0).max(3) }),
    /** A multiple by age. */
    age: curveSchema,
    /** A multiple by Fitness. */
    fitness: curveSchema,
    commitment: z.strictObject({ back: z.number().min(0).max(3), steady: z.number().min(0).max(3), all: z.number().min(0).max(3) }),
    /** The multiple on next year's risk for playing through pain. */
    pain: z.number().min(1).max(5),
    /** Playing through pain: the chance each year it makes the injury worse, how much worse, and the severity at which a career ends. */
    aggravate: z.strictObject({ chance: probability, min: z.int().min(1).max(100), max: z.int().min(1).max(100), endsAt: z.int().min(1).max(200) }),
    /** A new injury at least this severe may end a career outright: the chance (times the sport's hazard). */
    catastrophic: z.strictObject({ from: z.int().min(1).max(100), chance: probability }),
    /** The share of a season's games missed per point of severity (0.01 means severity 50 misses half). */
    missed: z.number().min(0).max(0.02),
    /** Resting treats the injury: the healing bonus is in the condition's treated course. A pro team pays; anyone else pays this size of cost. */
    treatment: z.enum(['petty', 'small', 'solid', 'big', 'major']),
    /** Chance a long career leaves worn joints at retirement: per season of pro play, up to a limit. */
    worn: z.strictObject({ perSeason: probability, max: probability }),
    /** The worn-joints condition's starting severity. */
    wornSeverity: z.int().min(1).max(100),
  }),
  draft: z.strictObject({
    /** What a prospect looks like to scouts: the quality of recent work, fame, and a roll. */
    score: z.strictObject({ quality: z.number().min(0).max(2), fame: z.number().min(0).max(2), noise: z.number().min(0).max(30) }),
    /** A prospect at or above this declares (under the forced age). */
    declare: z.int().min(0).max(120),
    /** A score at or above this is a first-round pick; every point under it pushes the pick back this many places. */
    top: z.int().min(0).max(120),
    perPick: z.number().min(0.1).max(5),
    /** The chance an undrafted prospect gets a minimum deal, by rating. */
    undrafted: curveSchema,
    /** Batch 5: the league's need for your position that year moves your score by up to this much either way; combine events add up to `combine` either way. */
    need: z.number().min(0).max(20),
    combine: z.number().min(0).max(30),
    /** The words for where you are projected to go: a pick share (pick over total picks) up to which each phrase holds, in order. */
    projection: z.array(z.strictObject({ upTo: z.number().min(0).max(1.5), id: idSchema })).min(2).max(8),
  }),
  contract: z.strictObject({
    /** A contract's yearly pay as a multiple of the rung's usual year (the league's pay, not the city's), by kind. */
    kind: z.strictObject({ minimum: z.number().min(0.05).max(5), rookie: z.number().min(0.05).max(5), standard: z.number().min(0.05).max(5), star: z.number().min(0.05).max(5) }),
    /** Years, by kind. */
    years: z.strictObject({
      minimum: z.strictObject({ min: z.int().min(1).max(10), max: z.int().min(1).max(10) }),
      rookie: z.strictObject({ min: z.int().min(1).max(10), max: z.int().min(1).max(10) }),
      standard: z.strictObject({ min: z.int().min(1).max(10), max: z.int().min(1).max(10) }),
      star: z.strictObject({ min: z.int().min(1).max(10), max: z.int().min(1).max(10) }),
    }),
    /** A multiple on pay by rating, for deals struck in a year (a better player asks for more). */
    market: curveSchema,
    /** A signing bonus, as a share of a year's pay. */
    bonus: share,
    /** The chance a new deal carries an option, and whose it is. */
    option: z.strictObject({ chance: share, team: share }),
    /** Pushing for a better deal (a negotiated extension): the pay multiple when it works and when the team refuses, and the chance by rating. */
    push: z.strictObject({ win: z.number().min(1).max(2), lose: z.number().min(0.3).max(1), cheap: z.number().min(0.3).max(1), chance: curveSchema }),
    /** A team that lets you go pays out this share of what is left on the deal. */
    buyout: share,
    /** The least rating a team will re-sign you at without being talked into it, and the chance it keeps a player under that. */
    keep: z.strictObject({ rating: z.int().min(0).max(100), chance: share }),
    /** The age after which a player who is unsigned is done (the phone stops ringing). Until then they can keep going to camps and open tryouts. */
    chaseAge: z.int().min(20).max(50),
    /** Batch 5: a rookie deal's pay as a multiple of the rung's usual year, by overall pick (straight lines between the points), and the signing bonus as a share of a year's pay by pick. */
    rookiePick: curveSchema,
    signing: curveSchema,
    /** Skill incentives: the most a year can add, as a share of the salary, and the rating at which it starts and at which it is all paid. */
    incentive: z.strictObject({ share: share, from: z.int().min(0).max(100), full: z.int().min(0).max(100) }),
    /** The chance a free agent finds a team in a year, by rating. */
    freeAgent: curveSchema,
  }),
  trade: z.strictObject({
    /** The yearly chance of a trade for a pro under contract. */
    chance: probability,
    /** A multiple on that chance if you asked, and the chance a team gives in when you ask. */
    asked: z.number().min(1).max(10),
    grant: share,
    /** What a refusal costs: fan mood. */
    refusedMood: z.number().min(0).max(20),
  }),
  release: z.strictObject({
    /** The yearly chance of being cut when your rating is under the rung's quality: per point under, up to a limit. */
    perPoint: probability,
    max: probability,
    /** Rating under the rung's quality that is tolerated for a young player. */
    slack: z.number().min(0).max(30),
  }),
  retire: z.strictObject({
    /** The media path (a fame path in arts and media) a retired athlete crosses over into when they go into broadcasting. */
    broadcastPath: idSchema,
    /** Years after retiring that the Hall of Fame ballot comes round. */
    hallYears: z.int().min(1).max(30),
    /** The yearly chance someone this old with a rating under the rung's quality hangs it up unprompted, by age. */
    quit: curveSchema,
    /** Fame a Hall of Fame class needs (rung and titles are in the event). */
    hallRung: z.int().min(1).max(8),
  }),
  events: z.strictObject({
    maxQueued: z.int().min(1).max(6),
    /** Batch 5: the yearly chance of each season choice: the pre-draft workouts for a prospect, the captain's band for a starter who qualifies, a fight for a place (and, for a reserve or rotation player, the chance of one anyway), and the offseason plan. */
    combine: z.number().min(0).max(1),
    captain: z.number().min(0).max(1),
    role: z.strictObject({ starter: z.number().min(0).max(1), other: z.number().min(0).max(1) }),
    offseason: z.number().min(0).max(1),
  }),
  /** Batch 5: tryouts for specific teams. */
  tryout: z.strictObject({
    tiers: z.strictObject(Object.fromEntries(TEAM_TIERS.map((t) => [t, tierSchema])) as Record<TeamTier, typeof tierSchema>),
    /** The spread (standard deviation, in rating points) of how a day goes. */
    luck: z.number().min(0).max(30),
    /** How each way of playing the scrimmage moves your rating and the day's spread (a multiple). */
    approach: z.strictObject(Object.fromEntries(TRYOUT_APPROACHES.map((a) => [a, z.strictObject({ bonus: z.number().min(-10).max(10), spread: z.number().min(0).max(4) })])) as Record<TryoutApproach, z.ZodObject<{ bonus: z.ZodNumber; spread: z.ZodNumber }>>),
    /** Rating points per point of discipline and of smarts above 50 for hustling and for listening. */
    hustleDiscipline: z.number().min(0).max(0.5),
    listenSmarts: z.number().min(0).max(0.5),
    /** Years before a team that cut you looks at you again. */
    cutWait: z.int().min(0).max(5),
    /** A fallback team asks this many points less of you than its bar (cut from the top, the next one down is kinder). */
    fallbackEase: z.number().min(0).max(20),
    /** When the engine tries out for you (you did not choose), it aims at the best team whose bar is within this many points of your rating. */
    autoSlack: z.number().min(-20).max(20),
    /** A pro camp's bar: this plus `perQuality` for each point the team's quality stands above 50, and `perYear` for each year you are older than `ageFrom` (teams prefer the young). */
    camp: z.strictObject({ bar: z.int().min(0).max(100), perQuality: z.number().min(0).max(1), ageFrom: z.int().min(18).max(40), perYear: z.number().min(0).max(5), fee: z.int().min(0).max(100000) }),
    /** Fame at least this much of the new level's rung is given when you make a team a level up. */
    fameFloor: z.int().min(0).max(20),
    /** The most tryouts in a year. */
    perYear: z.int().min(1).max(10),
  }),
  /** Batch 5: training sessions (Batch 4's practice system, with a sport's skills). */
  training: z.strictObject({
    /** With a team: a multiple on the gain, plus this for each point its quality stands above 50 (coaches and facilities). */
    team: z.strictObject({ gain: z.number().min(0).max(3), quality: z.number().min(0).max(0.02) }),
    /** A gym: a lower multiple, and a membership paid once a year (whole dollars, scaled to where you live). */
    gym: z.strictObject({ gain: z.number().min(0).max(3), fee: z.int().min(0).max(100000) }),
    /** A private coach: a multiple, and a fee for each session. */
    coach: z.strictObject({ gain: z.number().min(0).max(3), fee: z.int().min(0).max(100000) }),
    /** Rating points for each point the mean of a sport's skills stands above where skills start. */
    rating: z.number().min(0).max(0.5),
    /** The share of a session's gain that also goes to craft (a sport's craft grows with its seasons; training adds a little). */
    craft: z.number().min(0).max(1),
    /** A club or travel team alongside a school team: craft a year, and extra sessions a year. */
    club: z.strictObject({ craft: z.number().min(0).max(10), sessions: z.int().min(0).max(8) }),
  }),
  /** Batch 5: athletic scholarships. */
  scholarship: z.strictObject({
    /** Offers come to players of these ages (the last years of high school). */
    ages: z.strictObject({ from: z.int().min(14).max(20), to: z.int().min(14).max(22) }),
    /** What a recruiter sees: recent rating, fame, grades (points per GPA point above 2) and the program's need for your position. */
    score: z.strictObject({ rating: z.number().min(0).max(2), fame: z.number().min(0).max(2), gpa: z.number().min(0).max(30), need: z.number().min(0).max(3) }),
    /** For each program: the recruiting score where an offer begins, and where it is the most the country pays. */
    tiers: z.strictObject({
      community: z.strictObject({ from: z.number(), full: z.number() }),
      state: z.strictObject({ from: z.number(), full: z.number() }),
      elite: z.strictObject({ from: z.number(), full: z.number() }),
    }),
    /** The smallest share an offer is, and the yearly chance a program that qualifies makes an offer. */
    minShare: share,
    chance: share,
    /** The grade you must hold to stay eligible. */
    floor: z.number().min(0).max(4),
    /** Years under the floor before eligibility goes (the first is a warning). */
    warnYears: z.int().min(1).max(3),
    /** The spread of a program's need for a position, in recruiting score points. */
    need: z.number().min(0).max(30),
  }),
  /** Batch 5: roles on a team, captaincy. */
  role: z.strictObject({
    /** How much of the games each role plays (a multiple). */
    played: z.strictObject({ starter: z.number().min(0.1).max(1), rotation: z.number().min(0.1).max(1), reserve: z.number().min(0.1).max(1) }),
    /** Your rating less the team's quality: at or above `starter` you start, at or above `rotation` you rotate, under it you sit. */
    starter: z.number().min(-60).max(60),
    rotation: z.number().min(-60).max(60),
    /** A captain: rating points, fan mood a year. */
    captain: z.strictObject({ rating: z.number().min(0).max(10), mood: z.number().min(0).max(10), after: z.int().min(0).max(10) }),
  }),
});
export type SportsBalance = z.infer<typeof sportsBalanceSchema>;

/** The events the sports step queues (registries/sports.yaml). */
export const SPORTS_TRIGGERS = [
  'draft',
  'undrafted',
  'signed',
  'contractYear',
  'freeAgency',
  'traded',
  'released',
  'injury',
  'agedOut',
  'playoffs',
  'stalled',
  'ended',
  'declining',
  'retirement',
  'hall',
  'suspended',
  'bigGame',
  'slump',
  'breakout',
  'locker',
  'rookie',
  'rivalry',
  'endorsement',
  // Batch 5: recruiting and scholarships, the combine, camps for players without a team, and the season's choices.
  'recruited',
  'probation',
  'scholarshipLost',
  'combine',
  'camp',
  'role',
  'offseason',
  'number',
  'captain',
] as const;
export type SportsTrigger = (typeof SPORTS_TRIGGERS)[number];

export const sportsRegistrySchema = z.strictObject({
  triggers: z.strictObject(Object.fromEntries(SPORTS_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<SportsTrigger, z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>>),
  /** Batch 5: the scrimmage events a tryout plays, by the level of the team. */
  tryouts: z.strictObject({
    youth: z.array(idSchema).min(1),
    school: z.array(idSchema).min(1),
    college: z.array(idSchema).min(1),
    pro: z.array(idSchema).min(1),
  }),
});
export type SportsRegistry = z.infer<typeof sportsRegistrySchema>;

/** The tryout scrimmage events (registries/sports.yaml `tryouts`): one list for each level of play. */
export const TRYOUT_LEVELS = ['youth', 'school', 'college', 'pro'] as const;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The history lines the sports systems write (text/sports.yaml). Values: {sport}, {team}, {league}, {pick}, {round}, {position}. */
export const SPORTS_HISTORY_KEYS = ['drafted', 'undrafted', 'signed', 'traded', 'released', 'title', 'allStar', 'retired', 'aged', 'madeTeam', 'cutTeam', 'scholarship', 'scholarshipEnded', 'captain', 'signedCamp'] as const;
export type SportsHistoryKey = (typeof SPORTS_HISTORY_KEYS)[number];

const lines = (min = 8) => z.array(z.string().trim().min(min)).min(2);

export const sportsTextSchema = z.strictObject({
  /** Batch 5: the kinds of team you try out for, in words. */
  tiers: z.strictObject(Object.fromEntries(TEAM_TIERS.map((t) => [t, z.strictObject({ label: z.string().trim().min(2).max(40), blurb: z.string().trim().min(8).max(120), suffix: z.string().trim().max(12).default('') })])) as Record<TeamTier, z.ZodObject<{ label: z.ZodString; blurb: z.ZodString; suffix: z.ZodDefault<z.ZodString> }>>),
  /** What the list says after a tryout (values {team}, {tier}, {sport}): you made it, a fallback team took you, nobody did, and the pro camps. */
  tryout: z.strictObject({ made: lines(), fallback: lines(), cut: lines(), signed: lines(), camp: lines() }),
  /** A pro camp, in words. */
  camp: z.strictObject({ label: z.string().trim().min(2).max(40), blurb: z.string().trim().min(8).max(120) }),
  /** Where a prospect is projected to go, by `balance/sports.yaml draft.projection` ids. */
  projection: z.record(idSchema, z.strictObject({ label: z.string().trim().min(3).max(40), line: z.string().trim().min(8).max(160) })),
  history: z.strictObject(Object.fromEntries(SPORTS_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<SportsHistoryKey, typeof historyLine>),
  /** A season's name, as the work in the season report: values {year}, {team}. */
  seasons: z.array(z.string().trim().min(4)).min(4),
  /** Short quotes about a season by how it was received (same bands as E6b): from the press, from fans. Values: {team}, {sport}. */
  press: z.strictObject({ flop: z.array(z.string().trim().min(8)).min(2), solid: z.array(z.string().trim().min(8)).min(2), hit: z.array(z.string().trim().min(8)).min(2), acclaimed: z.array(z.string().trim().min(8)).min(2), cult: z.array(z.string().trim().min(8)).min(2), crowd: z.array(z.string().trim().min(8)).min(2) }),
  fans: z.strictObject({ flop: z.array(z.string().trim().min(8)).min(2), solid: z.array(z.string().trim().min(8)).min(2), hit: z.array(z.string().trim().min(8)).min(2), acclaimed: z.array(z.string().trim().min(8)).min(2), cult: z.array(z.string().trim().min(8)).min(2), crowd: z.array(z.string().trim().min(8)).min(2) }),
});
export type SportsText = z.infer<typeof sportsTextSchema>;

/** The text values sports events can use: see src/engine/sports/text.ts. */
export const SPORTS_TEXT_VALUES = ['sport', 'team', 'league', 'position', 'stage', 'trophy', 'pick', 'draftRound', 'draftTeam', 'record', 'statLine', 'opponent', 'injury', 'salary', 'season', 'number', 'tryout', 'tier', 'campus', 'share', 'scholarship', 'prospect'] as const;
export type SportsTextValue = (typeof SPORTS_TEXT_VALUES)[number];
