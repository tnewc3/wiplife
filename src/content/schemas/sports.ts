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
  /** A multiple on the year's risk of injury. */
  risk: z.number().min(0.2).max(2),
  /** Points on a season's rating. */
  rating: z.number().min(-5).max(10),
});

const share = probability;

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
    /** A rookie deal's multiple by round of the draft (the last applies to every later round). */
    rookieRound: z.array(z.number().min(0.1).max(5)).min(1),
    /** A team that lets you go pays out this share of what is left on the deal. */
    buyout: share,
    /** The least rating a team will re-sign you at without being talked into it, and the chance it keeps a player under that. */
    keep: z.strictObject({ rating: z.int().min(0).max(100), chance: share }),
    /** The years you may go without a team before the phone stops ringing. */
    unsigned: z.int().min(0).max(5),
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
  events: z.strictObject({ maxQueued: z.int().min(1).max(6) }),
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
] as const;
export type SportsTrigger = (typeof SPORTS_TRIGGERS)[number];

export const sportsRegistrySchema = z.strictObject({
  triggers: z.strictObject(Object.fromEntries(SPORTS_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<SportsTrigger, z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>>),
});
export type SportsRegistry = z.infer<typeof sportsRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The history lines the sports systems write (text/sports.yaml). Values: {sport}, {team}, {league}, {pick}, {round}, {position}. */
export const SPORTS_HISTORY_KEYS = ['drafted', 'undrafted', 'signed', 'traded', 'released', 'title', 'allStar', 'retired', 'aged'] as const;
export type SportsHistoryKey = (typeof SPORTS_HISTORY_KEYS)[number];

export const sportsTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(SPORTS_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<SportsHistoryKey, typeof historyLine>),
  /** A season's name, as the work in the season report: values {year}, {team}. */
  seasons: z.array(z.string().trim().min(4)).min(4),
  /** Short quotes about a season by how it was received (same bands as E6b): from the press, from fans. Values: {team}, {sport}. */
  press: z.strictObject({ flop: z.array(z.string().trim().min(8)).min(2), solid: z.array(z.string().trim().min(8)).min(2), hit: z.array(z.string().trim().min(8)).min(2), acclaimed: z.array(z.string().trim().min(8)).min(2), cult: z.array(z.string().trim().min(8)).min(2), crowd: z.array(z.string().trim().min(8)).min(2) }),
  fans: z.strictObject({ flop: z.array(z.string().trim().min(8)).min(2), solid: z.array(z.string().trim().min(8)).min(2), hit: z.array(z.string().trim().min(8)).min(2), acclaimed: z.array(z.string().trim().min(8)).min(2), cult: z.array(z.string().trim().min(8)).min(2), crowd: z.array(z.string().trim().min(8)).min(2) }),
});
export type SportsText = z.infer<typeof sportsTextSchema>;

/** The text values sports events can use: see src/engine/sports/text.ts. */
export const SPORTS_TEXT_VALUES = ['sport', 'team', 'league', 'position', 'stage', 'trophy', 'pick', 'draftRound', 'draftTeam', 'record', 'statLine', 'opponent', 'injury', 'salary', 'season'] as const;
export type SportsTextValue = (typeof SPORTS_TEXT_VALUES)[number];
