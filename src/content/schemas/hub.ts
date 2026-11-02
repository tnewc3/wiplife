import { z } from 'zod';
import { curveSchema } from './balance';

const commitCosts = z.strictObject({ back: z.number().min(0).max(100), steady: z.number().min(0).max(100), all: z.number().min(0).max(100) });
const share = z.number().min(0).max(1);

/** C2: the roles that take your time, and their cost by commitment. The hub section of balance/careers.yaml. */
export const hubBalanceSchema = z.strictObject({
  /** Points of load each role takes (100 is every waking hour you could give). `proSports` is a pro contract: it counts as a full-time job. */
  roles: z.strictObject({
    school: commitCosts,
    job: commitCosts,
    gig: commitCosts,
    sports: commitCosts,
    proSports: commitCosts,
    fame: commitCosts,
    band: commitCosts,
    business: commitCosts,
    crime: commitCosts,
    social: commitCosts,
  }),
  /** The total you can carry without paying for it. Above it, the points over it cost Stress and burnout and take from performance. */
  comfortable: z.number().min(20).max(100),
  over: z.strictObject({
    /** Per point over: Stress gained a year, burnout gained a year, performance lost (in each role's own scale). */
    stress: z.number().min(0).max(2),
    burnout: z.number().min(0).max(3),
    performance: z.number().min(0).max(2),
    /** A role at all-in carries a little of this extra regardless (a hard push in one place). */
    allIn: z.number().min(0).max(10),
    /** The points over at which something gives, and how likely it is each year past that, by the points over. */
    giveAt: z.number().min(5).max(100),
    give: curveSchema,
  }),
  burnout: z.strictObject({
    /** Burnout lost in a year under the comfortable load, and extra when you rest (a light load). */
    recover: z.number().min(0).max(40),
    light: z.number().min(0).max(40),
    /** Above this, burnout takes performance (per point) and Happiness (per point, a year). */
    above: z.number().min(0).max(100),
    performance: z.number().min(0).max(1),
    happiness: z.number().min(0).max(1),
  }),
  /** What giving costs: grade points off the year, performance off the job, the form that gets you benched, chemistry lost. */
  gives: z.strictObject({ grades: z.number().min(0).max(2), job: z.number().min(0).max(30), bench: z.number().min(0).max(30), band: z.number().min(0).max(30) }),
  /** The Activities that lower Stress and burnout are in balance/activities.yaml; their burnout relief is this share of the Stress they take off. */
  relief: z.strictObject({ share: share, max: z.number().min(0).max(20) }),
  /** A second career beside a sport or a fame path (a band beside a team): the least age, and the commitment it starts at. */
  side: z.strictObject({ minAge: z.int().min(8).max(30) }),
  /** A young player (under this age) can join, quit and switch sports with no wait; the skill they leave behind keeps its peak. */
  youthAge: z.int().min(10).max(21),
  /** Tryouts a young player can take in a year (a switch has no wait). */
  youthTries: z.int().min(1).max(20),
});
export type HubBalance = z.infer<typeof hubBalanceSchema>;

/** C2: skills (balance/skills.yaml). */
export const skillsBalanceSchema = z.strictObject({
  /** Points a year of use adds, by the level it is at (slower as it grows). */
  growth: z.strictObject({
    year: curveSchema,
    /** A practice session or rehearsal, as a share of a year of use. */
    session: z.number().min(0).max(1),
    commitment: z.strictObject({ back: z.number(), steady: z.number(), all: z.number() }),
    /** Times it grows when your talent fits it. */
    talent: z.number().min(1).max(3),
    /** The highest a skill can grow with use: with a talent that fits, without. */
    cap: z.strictObject({ talent: z.number().min(0).max(100), none: z.number().min(0).max(100) }),
  }),
  fade: z.strictObject({
    /** Years idle before it starts to fade (so 2 means it fades from the third year untouched). */
    idleYears: z.int().min(1).max(10),
    /** Points lost for each year idle after that. */
    perYear: z.number().min(0).max(20),
    /** It never fades below this share of the highest level it ever reached. */
    floor: share,
  }),
  /** Where a skill starts when first used, and the words for levels. */
  start: z.number().min(0).max(30),
  levels: z.array(z.number().min(1).max(100)).length(4),
  /** The band: how auditions and rehearsal work. */
  band: z.strictObject({
    /** Candidates at an audition: base, plus per point of fame, never over max. */
    pool: z.strictObject({ base: z.number().min(1).max(10), perFame: z.number().min(0).max(0.2), max: z.int().min(1).max(10) }),
    /** The mean skill of a candidate: base plus the weights on fame, your city's size (its professional job market, 0–100) and your reputation. */
    mean: z.strictObject({ base: z.number(), fame: z.number(), city: z.number(), reputation: z.number(), sd: z.number().min(1).max(40) }),
    /** The best candidate there can be at this fame: elite players are rare early on. */
    cap: curveSchema,
    ages: z.strictObject({ min: z.int().min(10).max(60), spread: z.int().min(1).max(20) }),
    temper: z.strictObject({ fiery: share, flaky: share }),
    /** Skill a bandmate gains in a year of rehearsal: the member's own curve by level, times the band's chemistry (a share of 1 at 50). */
    rehearsal: z.strictObject({ year: curveSchema, baseline: z.number().min(0).max(1), chemistry: z.number().min(0).max(0.05), perSession: z.number().min(0).max(1) }),
    /** Sessions with the band a year, by commitment. */
    sessions: z.strictObject({ back: z.int(), steady: z.int(), all: z.int() }),
    /** Replacing a member: affection lost with the one asked to go, and the ones who watch. */
    replace: z.strictObject({ affection: z.int().max(0), others: z.int().max(0) }),
    /** What the band's strength is: the mean member skill and chemistry, and how many points it adds to the work's quality at full strength. */
    strength: z.strictObject({ skill: z.number(), chemistry: z.number() }),
  }),
  /** Performance enhancers (sports). */
  enhancers: z.strictObject({
    minAge: z.int().min(14).max(30),
    /** Rating points of form it adds a year, health lost a year, and Stress. */
    form: z.number().min(0).max(30),
    health: z.number().min(0).max(10),
    /** Chance of a test in a season by level, and of the test finding it. */
    test: z.strictObject({ pro: share, college: share, school: share, youth: share }),
    detect: share,
    /** After a positive test: fame lost, fan mood lost, years of suspension, and the reputation lost. */
    caught: z.strictObject({ fame: z.number().min(0).max(50), mood: z.number().min(0).max(50), reputation: z.number().min(0).max(50) }),
  }),
});
export type SkillsBalance = z.infer<typeof skillsBalanceSchema>;

const variants = z.array(z.string().trim().min(1).max(400)).min(1);
const historyGroup = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants });

/** C2: the words of the Career hub (src/content/text/hub.yaml). */
export const hubTextSchema = z.strictObject({
  history: z.strictObject({
    /** Written when the load makes something give. {role} is not used: each is about one thing. */
    gaveGrades: historyGroup,
    gaveJob: historyGroup,
    gaveBench: historyGroup,
    gaveBand: historyGroup,
    /** Performance enhancers. {sport} */
    enhancersStarted: historyGroup,
    enhancersCaught: historyGroup,
    enhancersStopped: historyGroup,
  }),
  /** The short training card: the result lines. {skill}, {gain}, {part}, {name} */
  training: z.strictObject({
    skill: z.string().min(1),
    stat: z.string().min(1),
    grades: z.string().min(1),
    member: z.array(z.string().min(1)).min(1),
    band: z.string().min(1),
    nothing: z.string().min(1),
  }),
});
export type HubText = z.infer<typeof hubTextSchema>;
