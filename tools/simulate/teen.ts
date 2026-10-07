/**
 * The teen years, simulated and measured (T1): the simulated player's
 * choices from 12 to 17 (a yearly focus, finding a crowd, switching, the
 * license, a first car, a teen job, teams and clubs, asking for a rule to be
 * loosened, breaking one) and what they lead to: who belongs to a crowd and
 * which, clashes, how the focus shifts grades, friendships, money and talent,
 * licenses and first cars, teen jobs, house rules by how strict the parent
 * is, rule-breaking, getting caught and how the parent answers, juvenile
 * trouble and its sealing, and (must be zero) romance involving anyone under
 * 18. The watcher compares each year's state before and after `beginYear`,
 * so nothing here touches the engine.
 */
import { FOCUS_IDS, type ContentBundle, type TeenFocusId } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { weightedPick } from '../../src/engine/random';
import { chance, pick, type RngState } from '../../src/engine/rng';
import { vehiclesOf } from '../../src/engine/possessions/query';
import { vehicleQuote } from '../../src/engine/possessions/vehicles';
import { joinChance } from '../../src/engine/teen/cliques';
import { romanceUnderAgeFailures } from '../../src/engine/teen/invariants';
import { isJuvenileEntry } from '../../src/engine/teen/trouble';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type TeenAction = [LifeActionId, LifeActionParams];
export type FocusPlan = TeenFocusId | 'none';
const PLANS: readonly FocusPlan[] = ['none', ...FOCUS_IDS];

/** Chances describing the simulated player (like the other bots'), not the game. */
const POLICY = {
  /** The plan for the whole of the teen years: a share of lives each (the same for every year, so the plans can be compared). */
  plans: { none: 0.2, school: 0.2, friends: 0.2, work: 0.2, passion: 0.2 } as Record<FocusPlan, number>,
  rebel: 0.28,
  /** Yearly chances. */
  join: { joiner: 0.6, shy: 0.2 },
  switch: 0.04,
  leave: 0.02,
  permit: 0.9,
  lesson: 0.85,
  test: 0.95,
  firstCar: 0.2,
  job: { worker: 0.22, other: 0.06 },
  quit: 0.03,
  team: { joiner: 0.45, other: 0.12 },
  leaveTeam: 0.05,
  negotiate: { talker: 0.5, other: 0.1 },
  break: 0.35,
};

export interface TeenProfile {
  plan: FocusPlan;
  /** Breaks house rules on purpose. */
  rebel: boolean;
  /** Looks for a crowd, a job and a team more often. */
  joiner: boolean;
  worker: boolean;
  talker: boolean;
}

export function rollTeenProfile(rng: RngState): TeenProfile {
  const plan = weightedPick(rng, PLANS.map((p) => [p, POLICY.plans[p]] as const));
  return { plan, rebel: chance(rng, POLICY.rebel), joiner: chance(rng, 0.5), worker: chance(rng, 0.35), talker: chance(rng, 0.5) };
}

/** The teen actions the simulated player takes this year, drawing from `rng`. */
export function chooseTeenActions(life: LifeState, content: ContentBundle, rng: RngState, profile: TeenProfile): TeenAction[] {
  const out: TeenAction[] = [];
  if (life.phase !== 'yearStart') return out;
  const can = (id: LifeActionId, params: LifeActionParams = {}) => isLifeActionAvailable(life, id, params, content);
  const age = life.character.age;
  const t = life.teen;
  if (age >= content.balance.relationships.adultAge) {
    // A grown life without a license gets one, in time.
    if (t.license.stage !== 'licensed' && chance(rng, 0.4)) {
      if (t.license.stage === 'none' && can('get_permit')) out.push(['get_permit', {}]);
      else if (t.license.stage === 'permit') {
        if (can('driving_lesson')) out.push(['driving_lesson', {}]);
        if (can('take_license_test')) out.push(['take_license_test', {}]);
      }
    }
    return out;
  }
  if (age < content.balance.teen.ages.from - 1) return out;

  if (profile.plan !== 'none' && can('choose_focus', { focus: profile.plan })) out.push(['choose_focus', { focus: profile.plan }]);

  // A crowd: look for one, now and then change or leave.
  if (t.school) {
    const open = t.cliques.filter((c) => can('join_clique', { cliqueId: c.id }));
    if (!t.member && open.length > 0 && chance(rng, profile.joiner ? POLICY.join.joiner : POLICY.join.shy)) {
      const c = weightedPick(rng, open.map((x) => [x, Math.max(0.05, joinChance(life, x, content))] as const));
      out.push(['join_clique', { cliqueId: c.id }]);
    } else if (t.member && open.length > 0 && chance(rng, POLICY.switch)) {
      out.push(['join_clique', { cliqueId: pick(rng, open).id }]);
    } else if (t.member && chance(rng, POLICY.leave) && can('leave_clique')) {
      out.push(['leave_clique', {}]);
    }
  }

  // The license, and a first car. (Availability is checked as each action is taken: a permit and its lessons can come in one year.)
  if (t.license.stage !== 'licensed') {
    if (t.license.stage === 'none' && chance(rng, POLICY.permit)) out.push(['get_permit', {}]);
    if (chance(rng, POLICY.lesson)) out.push(['driving_lesson', {}]);
    if (chance(rng, POLICY.lesson)) out.push(['driving_lesson', {}]);
    if (age >= content.balance.teen.license.licenseAge && chance(rng, POLICY.test)) out.push(['take_license_test', {}]);
  }
  if (t.license.stage === 'licensed' && vehiclesOf(life).length === 0 && age >= 16 && chance(rng, POLICY.firstCar)) {
    const ids = Object.keys(content.vehicles).sort().filter((id) => content.vehicles[id]!.used);
    const cheapest = ids
      .map((id) => [id, vehicleQuote(life, id, true, content)] as const)
      .filter(([, q]) => q.cashBlock === null)
      .sort((a, b) => a[1].cash - b[1].cash)[0];
    if (cheapest && can('buy_vehicle', { defId: cheapest[0], used: true, loan: false })) out.push(['buy_vehicle', { defId: cheapest[0], used: true, loan: false }]);
  }

  // A job and a team or club.
  if (!t.job && age >= 13 && chance(rng, profile.worker ? POLICY.job.worker : POLICY.job.other)) {
    const jobs = Object.keys(content.teenJobs).sort().filter((id) => can('take_teen_job', { teenJobId: id }));
    if (jobs.length > 0) out.push(['take_teen_job', { teenJobId: pick(rng, jobs) }]);
  } else if (t.job && chance(rng, POLICY.quit)) out.push(['quit_teen_job', {}]);
  if (t.activities.length === 0 && chance(rng, profile.joiner ? POLICY.team.joiner : POLICY.team.other)) {
    const ids = Object.keys(content.activities).sort().filter((id) => can('join_activity', { activityId: id }));
    if (ids.length > 0) out.push(['join_activity', { activityId: pick(rng, ids) }]);
  } else if (t.activities.length > 0 && chance(rng, POLICY.leaveTeam)) out.push(['leave_activity', { activityId: t.activities[0]!.id }]);

  // The rules at home: ask for one to ease up, and break one now and then.
  const rules = t.home?.rules ?? [];
  if (rules.length > 0 && chance(rng, profile.talker ? POLICY.negotiate.talker : POLICY.negotiate.other)) {
    const open = rules.filter((r) => can('negotiate_rule', { ruleId: r.ruleId }));
    if (open.length > 0) out.push(['negotiate_rule', { ruleId: pick(rng, open).ruleId }]);
  }
  if (profile.rebel && rules.length > 0 && chance(rng, POLICY.break)) {
    const open = rules.filter((r) => can('break_rule', { ruleId: r.ruleId }));
    if (open.length > 0) out.push(['break_rule', { ruleId: pick(rng, open).ruleId }]);
  }
  return out;
}

interface PlanStats {
  lives: number;
  /** The diploma GPA of those who graduated, and how many did. */
  gpaSum: number;
  gpaN: number;
  /** The mean affection with the closest friends and classmates at the end of the teen years. */
  friendSum: number;
  friendN: number;
  /** Earned income in the teen years (gross, summed), and the lives and years. */
  incomeSum: number;
  incomeYears: number;
  /** Lives whose hidden talent had come to light by 18, and lives that had one. */
  talentFound: number;
  talentLives: number;
  passionSum: number;
}

interface StyleBand {
  homes: number;
  rules: number;
  levelSum: number;
  caught: number;
  grounded: number;
  privilege: number;
  mild: number;
}

export interface TeenReport {
  lives: number;
  /** Lives that reached 18. */
  teens: number;
  teenYears: number;
  crowds: {
    schools: number;
    generated: number;
    rivalPairs: number;
    byDef: Record<string, { generated: number; memberYears: number; joins: number; turnedAway: number }>;
    memberLives: number;
    joins: number;
    switches: number;
    leaves: number;
    turnedAway: number;
    invites: number;
    clashes: number;
    clashLives: number;
    peopleBrought: number;
    memberTies: number;
    clashFeuds: number;
  };
  focus: Record<FocusPlan, PlanStats>;
  license: {
    permit: number;
    licensed17: number;
    licensed18: number;
    passes: number;
    fails: number;
    ages: number[];
    firstCarLives: number;
    firstCarAges: number[];
    carBeforeAdult: number;
  };
  jobs: { lives: number; years: number; ended: number; byJob: Record<string, number>; incomeSum: number; incomeYears: number };
  activities: { lives: number; teamLives: number; years: number; byActivity: Record<string, number>; injuries: number };
  rules: {
    homes: number;
    homeYears: number;
    rulesSum: number;
    byBand: { strict: StyleBand; usual: StyleBand; relaxed: StyleBand };
    byAffection: { close: StyleBand; distant: StyleBand };
    brokeLives: number;
    broken: number;
    caught: number;
    negotiated: number;
    won: number;
    penalties: { grounded: number; privilege: number; mild: number };
    loosenedByAge: number;
  };
  trouble: {
    juvenileLives: number;
    entries: number;
    byOutcome: Record<string, number>;
    byOffense: Record<string, number>;
    sealedLives: number;
    sealedEntriesHidden: number;
    addictionLives: number;
    suspendedLives: number;
    juvenileEvents: number;
    parentsAnswered: number;
  };
  romanceUnder18: number;
  events: { fired: number; byCategory: Record<string, number>; teenYears: number };
  invariantFailures: number;
}

const emptyBand = (): StyleBand => ({ homes: 0, rules: 0, levelSum: 0, caught: 0, grounded: 0, privilege: 0, mild: 0 });
const emptyPlan = (): PlanStats => ({ lives: 0, gpaSum: 0, gpaN: 0, friendSum: 0, friendN: 0, incomeSum: 0, incomeYears: 0, talentFound: 0, talentLives: 0, passionSum: 0 });

export function emptyTeenReport(content: ContentBundle): TeenReport {
  return {
    lives: 0,
    teens: 0,
    teenYears: 0,
    crowds: {
      schools: 0,
      generated: 0,
      rivalPairs: 0,
      byDef: Object.fromEntries(Object.keys(content.cliques).sort().map((id) => [id, { generated: 0, memberYears: 0, joins: 0, turnedAway: 0 }])),
      memberLives: 0,
      joins: 0,
      switches: 0,
      leaves: 0,
      turnedAway: 0,
      invites: 0,
      clashes: 0,
      clashLives: 0,
      peopleBrought: 0,
      memberTies: 0,
      clashFeuds: 0,
    },
    focus: Object.fromEntries(PLANS.map((p) => [p, emptyPlan()])) as Record<FocusPlan, PlanStats>,
    license: { permit: 0, licensed17: 0, licensed18: 0, passes: 0, fails: 0, ages: [], firstCarLives: 0, firstCarAges: [], carBeforeAdult: 0 },
    jobs: { lives: 0, years: 0, ended: 0, byJob: {}, incomeSum: 0, incomeYears: 0 },
    activities: { lives: 0, teamLives: 0, years: 0, byActivity: {}, injuries: 0 },
    rules: {
      homes: 0,
      homeYears: 0,
      rulesSum: 0,
      byBand: { strict: emptyBand(), usual: emptyBand(), relaxed: emptyBand() },
      byAffection: { close: emptyBand(), distant: emptyBand() },
      brokeLives: 0,
      broken: 0,
      caught: 0,
      negotiated: 0,
      won: 0,
      penalties: { grounded: 0, privilege: 0, mild: 0 },
      loosenedByAge: 0,
    },
    trouble: { juvenileLives: 0, entries: 0, byOutcome: {}, byOffense: {}, sealedLives: 0, sealedEntriesHidden: 0, addictionLives: 0, suspendedLives: 0, juvenileEvents: 0, parentsAnswered: 0 },
    romanceUnder18: 0,
    events: { fired: 0, byCategory: {}, teenYears: 0 },
    invariantFailures: 0,
  };
}

const TEEN_CATEGORIES = ['crowds', 'houserules', 'driving', 'teenwork', 'teamsclubs', 'future'];

/** Watches one life through its teen years: each year's change, before and after `beginYear`. */
export class TeenWatcher {
  private plan: FocusPlan;
  private everMember = false;
  private everClash = false;
  private everRecord = false;
  private everJob = false;
  private everActivity = false;
  private everTeam = false;
  private brokeLife = false;
  private permitSeen = false;
  private firstCarAge: number | undefined;
  private readonly addictionSeen = new Set<string>();
  private readonly hiddenTalent: boolean;
  private friendsAt17: number | undefined;
  private passionAt17 = 0;
  private talentBy17 = false;
  private prev: LifeState;
  private incomeSum = 0;
  private incomeYears = 0;
  private knownCliques = new Set<string>();
  private readonly teamIds: Set<string>;
  private readonly teenEvents = new Set<string>();
  private readonly juvenileEvents: Set<string>;
  private sawTeen = false;

  constructor(
    private readonly r: TeenReport,
    private readonly content: ContentBundle,
    profile: TeenProfile,
    life: LifeState,
  ) {
    this.plan = profile.plan;
    this.prev = life;
    this.hiddenTalent = life.character.hidden.talent !== null;
    this.teamIds = new Set(Object.values(content.activities).filter((a) => a.kind === 'team').map((a) => a.id));
    for (const def of Object.values(content.events)) if (TEEN_CATEGORIES.includes(def.category)) this.teenEvents.add(def.id);
    this.juvenileEvents = new Set(content.registries.teen.triggers.juvenile.events);
  }

  /** An action the player took (the life as it was before it). */
  acted(actionId: LifeActionId, params: LifeActionParams, before: LifeState, after: LifeState): void {
    const r = this.r;
    if (actionId === 'join_clique') {
      const def = after.teen.member ? after.teen.cliques.find((c) => c.id === after.teen.member!.cliqueId)?.defId : undefined;
      const clique = before.teen.cliques.find((c) => c.id === params.cliqueId);
      if (after.teen.member?.cliqueId === params.cliqueId) {
        r.crowds.joins++;
        r.crowds.peopleBrought += Object.keys(after.people).length - Object.keys(before.people).length;
        r.crowds.memberTies += Object.keys(after.web.ties).length - Object.keys(before.web.ties).length;
        if (def) r.crowds.byDef[def]!.joins++;
        if (before.teen.member) r.crowds.switches++;
      } else if (clique) {
        r.crowds.turnedAway++;
        r.crowds.byDef[clique.defId]!.turnedAway++;
      }
    }
    if (actionId === 'leave_clique') r.crowds.leaves++;
    if (actionId === 'take_license_test') {
      if (after.teen.license.stage === 'licensed') {
        r.license.passes++;
        r.license.ages.push(after.character.age);
      } else r.license.fails++;
    }
    if (actionId === 'buy_vehicle' && this.firstCarAge === undefined) this.firstCarAge = after.character.age;
  }

  /** A year has begun: `before` is the life as the year began, `after` as the pipeline left it (events picked). */
  observe(before: LifeState, after: LifeState): void {
    const r = this.r;
    const age = after.character.age;
    const teenYear = age >= this.content.balance.teen.ages.from && age < this.content.balance.relationships.adultAge;
    r.romanceUnder18 += romanceUnderAgeFailures(after, this.content).length;
    if (!this.permitSeen && after.teen.license.stage !== 'none') {
      this.permitSeen = true;
      r.license.permit++;
    }
    if (age === 17 && after.teen.license.stage === 'licensed') r.license.licensed17++;
    if (age === 18 && after.teen.license.stage === 'licensed') r.license.licensed18++;
    if (this.firstCarAge === undefined && vehiclesOf(after).length > 0 && age < 30) this.firstCarAge = age;
    if (!teenYear) {
      // The record is sealed in the first year of adulthood.
      if (age === this.content.balance.relationships.adultAge && after.teen.sealed && !before.teen.sealed) {
        r.trouble.sealedLives++;
        r.trouble.sealedEntriesHidden += after.legal.record.filter((e) => e.sealed).length;
      }
      return;
    }
    this.sawTeen = true;
    r.teenYears++;
    const t = after.teen;

    // Crowds.
    for (const c of t.cliques) {
      if (!this.knownCliques.has(`${t.school?.key}:${c.id}`)) {
        this.knownCliques.add(`${t.school?.key}:${c.id}`);
        r.crowds.generated++;
        r.crowds.byDef[c.defId]!.generated++;
        if (c.rival !== undefined && c.id < c.rival) r.crowds.rivalPairs++;
      }
    }
    if (t.school && before.teen.school?.key !== t.school.key) r.crowds.schools++;
    if (t.member) {
      this.everMember = true;
      const def = t.cliques.find((c) => c.id === t.member!.cliqueId)?.defId;
      if (def) r.crowds.byDef[def]!.memberYears++;
    }
    if (t.invite && !before.teen.invite) r.crowds.invites++;
    if (t.clash && (!before.teen.clash || before.teen.clash.since !== t.clash.since)) {
      r.crowds.clashes++;
      if (!this.everClash) {
        this.everClash = true;
        r.crowds.clashLives++;
      }
      r.crowds.clashFeuds += Object.values(after.web.ties).filter((tie) => tie.feud?.since === after.currentYear && tie.origin === 'context').length > 0 ? 1 : 0;
    }

    // The focus: what the year's step gave (the plan counts when it was chosen for this year).
    // Earned income this year (the ledger for the year that has begun), by plan and, with a teen job, for the job.
    this.incomeYears += 1;
    const ledger = after.finances.lastLedger;
    if (ledger && ledger.year === after.currentYear) {
      this.incomeSum += ledger.gross;
      if (t.job) {
        r.jobs.incomeSum += ledger.gross;
        r.jobs.incomeYears += 1;
      }
    }

    // A teen job, teams and clubs.
    const prev = this.prev;
    if (t.job) {
      this.everJob = true;
      r.jobs.years++;
      r.jobs.byJob[t.job.jobId] = (r.jobs.byJob[t.job.jobId] ?? 0) + 1;
    }
    if (prev.teen.job && !t.job) r.jobs.ended++;
    if (t.activities.length > 0) {
      this.everActivity = true;
      r.activities.years++;
      if (t.activities.some((a) => this.teamIds.has(a.id))) this.everTeam = true;
      for (const a of t.activities) r.activities.byActivity[a.id] = (r.activities.byActivity[a.id] ?? 0) + 1;
    }
    if (t.activities.length > 0 && after.health.conditions.some((c) => c.conditionId === 'broken_bone' && c.since === after.currentYear)) r.activities.injuries++;
    // The rules at home.
    if (t.home && t.home.rules.length > 0) {
      r.rules.homeYears++;
      r.rules.rulesSum += t.home.rules.length;
      if (!prev.teen.home) r.rules.homes++;
      const strictest = Math.max(...Object.values(t.home.styles).map((s) => s.strictness), 0);
      const band = strictest >= 62 ? 'strict' : strictest <= 40 ? 'relaxed' : 'usual';
      const stat = r.rules.byBand[band];
      stat.homes++;
      stat.rules += t.home.rules.length;
      stat.levelSum += t.home.rules.reduce((sum, x) => sum + x.level, 0);
    }
    // Rules broken and caught this year (the totals move), and what the parent did.
    const dBroken = t.totals.broken - prev.teen.totals.broken;
    const dCaught = t.totals.caught - prev.teen.totals.caught;
    if (dBroken > 0) this.brokeLife = true;
    r.rules.broken += dBroken;
    r.rules.caught += dCaught;
    r.rules.negotiated += t.totals.negotiated - prev.teen.totals.negotiated;
    r.rules.won += t.totals.won - prev.teen.totals.won;
    if (dCaught > 0) {
      const by = t.caught ? after.teen.home?.styles[t.caught.by] : undefined;
      const fresh = t.penalties.filter((x) => !prev.teen.penalties.some((y) => y.kind === x.kind && y.until === x.until && y.domain === x.domain));
      const kind = fresh.some((x) => x.kind === 'grounded') ? 'grounded' : fresh.some((x) => x.kind === 'privilege') ? 'privilege' : 'mild';
      r.rules.penalties[kind] += dCaught;
      if (by) {
        const band = by.strictness >= 62 ? 'strict' : by.strictness <= 40 ? 'relaxed' : 'usual';
        r.rules.byBand[band].caught += dCaught;
        r.rules.byBand[band][kind] += dCaught;
        const rel = after.relationships[t.caught!.by];
        const close = (rel?.affection ?? 50) >= 65;
        const affBand = close ? r.rules.byAffection.close : r.rules.byAffection.distant;
        affBand.caught += dCaught;
        affBand[kind] += dCaught;
      }
    }

    // Trouble: juvenile cases, addictions started, a suspension.
    for (const c of after.health.conditions) {
      if (this.content.conditions[c.conditionId]?.kind === 'addiction' && !this.addictionSeen.has(c.conditionId)) {
        this.addictionSeen.add(c.conditionId);
        r.trouble.addictionLives++;
      }
    }
    // Events of this system and the parent's answer to a juvenile case.
    for (const p of after.pending) {
      if (this.teenEvents.has(p.eventId)) {
        r.events.fired++;
        const cat = this.content.events[p.eventId]!.category;
        r.events.byCategory[cat] = (r.events.byCategory[cat] ?? 0) + 1;
      }
      if (this.juvenileEvents.has(p.eventId)) r.trouble.juvenileEvents++;
    }
    r.events.teenYears++;
    // The end of the teen years, as measured by the plans: friends, passion and talent at 17.
    if (age === this.content.balance.relationships.adultAge - 1) {
      const friends = Object.values(after.relationships)
        .filter((x) => (x.kind === 'friend' || x.kind === 'classmate') && x.status === 'active' && after.people[x.personId]?.alive)
        .sort((a, b) => b.affection - a.affection)
        .slice(0, this.content.balance.teen.friends.people);
      if (friends.length > 0) this.friendsAt17 = friends.reduce((s, x) => s + x.affection, 0) / friends.length;
      this.passionAt17 = t.passion;
      this.talentBy17 = after.character.hidden.talent !== null && after.character.hidden.talentDiscovered;
    }
    this.prev = after;
    void this.hiddenTalent;
  }

  finish(life: LifeState): void {
    const r = this.r;
    r.lives++;
    if (!this.sawTeen) return;
    r.teens++;
    const plan = r.focus[this.plan];
    plan.lives++;
    plan.incomeSum += this.incomeSum;
    plan.incomeYears += this.incomeYears;
    const diploma = life.education.credentials.find((c) => c.type === 'hs_diploma');
    if (diploma?.gpa !== undefined) {
      plan.gpaSum += diploma.gpa;
      plan.gpaN++;
    }
    // The people close to you (friends and classmates), your passion and your talent, at the end of your teen years.
    if (this.friendsAt17 !== undefined) {
      plan.friendSum += this.friendsAt17;
      plan.friendN++;
    }
    plan.passionSum += this.passionAt17;
    if (this.hiddenTalent) {
      plan.talentLives++;
      if (this.talentBy17) plan.talentFound++;
    }
    // Juvenile cases: what is on the record from before 18 (sealed or not).
    for (const e of life.legal.record) {
      if (!isJuvenileEntry(life, e, this.content)) continue;
      r.trouble.entries++;
      r.trouble.byOutcome[e.outcome] = (r.trouble.byOutcome[e.outcome] ?? 0) + 1;
      r.trouble.byOffense[e.offenseId] = (r.trouble.byOffense[e.offenseId] ?? 0) + 1;
      if (!this.everRecord) {
        this.everRecord = true;
        r.trouble.juvenileLives++;
      }
    }
    if (this.everMember) r.crowds.memberLives++;
    if (this.everJob) r.jobs.lives++;
    if (this.everActivity) r.activities.lives++;
    if (this.everTeam) r.activities.teamLives++;
    if (this.brokeLife) r.rules.brokeLives++;
    if (this.firstCarAge !== undefined) {
      r.license.firstCarLives++;
      r.license.firstCarAges.push(this.firstCarAge);
      if (this.firstCarAge < this.content.balance.relationships.adultAge) r.license.carBeforeAdult++;
    }
    if (life.flags.suspended === true) r.trouble.suspendedLives++;
  }
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 2) => (d === 0 ? 'n/a' : (n / d).toFixed(digits));
const median = (xs: number[]) => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!);

/** The T1 section of the simulation report. */
export function formatTeen(r: TeenReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'The teen years (T1):'];
  lines.push(`  lives ${r.lives}; reached 18: ${r.teens}; teen-years ${r.teenYears}`);
  const c = r.crowds;
  lines.push(
    `  crowds: ${c.schools} schools set up, ${c.generated} crowds (${c.rivalPairs} rival pairs); ${pct(c.memberLives, r.teens)} of teens belonged to one; ${c.joins} joins ` +
      `(${c.switches} switches, ${c.leaves} leaves, ${c.turnedAway} turned away); ${c.invites} invitations; ${c.peopleBrought} people brought into your life, ${c.memberTies} friend ties among them; ` +
      `${c.clashes} clashes in ${c.clashLives} lives (${c.clashFeuds} with a feud tie)`,
  );
  for (const [id, d] of Object.entries(c.byDef)) {
    lines.push(`    ${content.cliques[id]!.name.padEnd(20)} generated ${String(d.generated).padStart(5)}  joined ${String(d.joins).padStart(5)}  member-years ${String(d.memberYears).padStart(6)}  turned away ${String(d.turnedAway).padStart(5)}`);
  }
  lines.push('  focus, by plan (the same plan every teen year):');
  lines.push('    plan       lives  diploma GPA  friend closeness  teen income/yr  talent found  passion at 17');
  for (const p of PLANS) {
    const s = r.focus[p];
    lines.push(
      `    ${p.padEnd(9)} ${String(s.lives).padStart(6)}  ${per(s.gpaSum, s.gpaN).padStart(11)}  ${per(s.friendSum, s.friendN, 1).padStart(16)}  ${per(s.incomeSum, s.incomeYears, 0).padStart(14)}  ${pct(s.talentFound, s.talentLives).padStart(12)}  ${per(s.passionSum, s.lives, 1).padStart(13)}`,
    );
  }
  const l = r.license;
  lines.push(
    `  license: ${pct(l.permit, r.teens)} got a permit; licensed by 17 ${pct(l.licensed17, r.teens)}, by 18 ${pct(l.licensed18, r.teens)}; ${l.passes} passes, ${l.fails} failures; median age at the license ${l.ages.length ? median(l.ages) : '-'}; ` +
      `first car: ${pct(l.firstCarLives, r.teens)} owned one by 30, ${l.carBeforeAdult} before 18 (median age ${l.firstCarAges.length ? median(l.firstCarAges) : '-'})`,
  );
  const j = r.jobs;
  lines.push(`  teen jobs: ${pct(j.lives, r.teens)} had one (${j.years} job-years, ${j.ended} ended); pay in a year with a job: $${per(j.incomeSum, j.incomeYears, 0)} a year; ${Object.entries(j.byJob).sort().map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const a = r.activities;
  lines.push(`  teams and clubs: ${pct(a.lives, r.teens)} belonged to one (${pct(a.teamLives, r.teens)} to a team); ${a.years} years; ${a.injuries} years with an injury while in one`);
  const ru = r.rules;
  lines.push(`  house rules: ${per(ru.rulesSum, ru.homeYears, 1)} rules a year in a home that sets any; ${ru.homes} homes`);
  for (const [name, band] of [['strict-style parent', ru.byBand.strict], ['usual-style parent', ru.byBand.usual], ['relaxed-style parent', ru.byBand.relaxed]] as const) {
    lines.push(`    ${name.padEnd(22)} home-years ${String(band.homes).padStart(6)}  rules ${per(band.rules, band.homes, 1)}  mean level ${per(band.levelSum, band.rules, 2)} (0 relaxed to 2 strict)  caught ${String(band.caught).padStart(5)}: grounded ${pct(band.grounded, band.caught)}, lost a privilege ${pct(band.privilege, band.caught)}, a talk or chores ${pct(band.mild, band.caught)}`);
  }
  for (const [name, band] of [['close to the parent', ru.byAffection.close], ['distant', ru.byAffection.distant]] as const) {
    lines.push(`    ${name.padEnd(22)} caught ${String(band.caught).padStart(5)}: grounded ${pct(band.grounded, band.caught)}, lost a privilege ${pct(band.privilege, band.caught)}, a talk or chores ${pct(band.mild, band.caught)}`);
  }
  lines.push(
    `  rule-breaking: ${pct(ru.brokeLives, r.teens)} of teens broke a rule; ${per(ru.broken, r.teens, 1)} breaks and ${per(ru.caught, r.teens, 1)} catches per teen (${pct(ru.caught, ru.broken)} caught); ` +
      `asked for a rule to be loosened ${ru.negotiated} times, ${pct(ru.won, ru.negotiated)} said yes`,
  );
  const tr = r.trouble;
  lines.push(
    `  trouble: ${pct(tr.juvenileLives, r.teens)} of teens had a juvenile case (${tr.entries} entries: ${Object.entries(tr.byOutcome).sort().map(([k, n]) => `${k} ${n}`).join(', ')}); ` +
      `${Object.entries(tr.byOffense).sort().map(([k, n]) => `${k} ${n}`).join(', ')}; ${pct(tr.addictionLives, r.teens)} started an addiction before 18; ${tr.juvenileEvents} juvenile follow-ups; ${tr.sealedLives} records sealed at 18 (${tr.sealedEntriesHidden} entries)`,
  );
  lines.push(`  romance involving anyone under 18 (must be 0): ${r.romanceUnder18}`);
  const ev = Object.entries(r.events.byCategory).sort().map(([k, n]) => `${k} ${n}`).join(', ');
  lines.push(`  events: ${r.events.fired} teen events in ${r.events.teenYears} teen-years (${per(r.events.fired, r.events.teenYears)} a year): ${ev}`);
  lines.push(`  invariant failures in this section's checks: ${r.invariantFailures}`);
  return lines;
}

/** The T1 targets (balance/targets.yaml, teen), judged on the careful player's lives. */
export function teenTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.teen;
  const r = report.teen;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    const text = `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`;
    out.push({ label, value: fmt(value), short: fmt(value), goal: text, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const mean = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('teens who belonged to a crowd', share(r.crowds.memberLives, r.teens), t.crowdMembers);
  range('crowd members who switched crowds', share(r.crowds.switches, Math.max(1, r.crowds.memberLives)), t.switches);
  range('crowd members who were in a clash', share(r.crowds.clashLives, Math.max(1, r.crowds.memberLives)), t.clashLives);
  range('people each crowd you join brings into your life', mean(r.crowds.peopleBrought, Math.max(1, r.crowds.joins)), t.peoplePerCrowd, (n) => n.toFixed(2));
  range('teens licensed by 18', share(r.license.licensed18, r.teens), t.licensedBy18);
  range('teens who owned a car before 18', share(r.license.carBeforeAdult, r.teens), t.carBefore18);
  range('teens with a teen job', share(r.jobs.lives, r.teens), t.jobLives);
  range('teens on a team or in a club', share(r.activities.lives, r.teens), t.activityLives);
  range('house rules a year in a home that sets any', mean(r.rules.rulesSum, r.rules.homeYears), t.rulesPerHome, (n) => n.toFixed(2));
  const band = (b: StyleBand) => mean(b.levelSum, b.rules);
  range('mean rule level: strict-style parent minus relaxed-style parent', band(r.rules.byBand.strict) - band(r.rules.byBand.relaxed), t.strictVsRelaxed, (n) => n.toFixed(2));
  range('breaks per teen', mean(r.rules.broken, r.teens), t.breaksPerTeen, (n) => n.toFixed(2));
  range('share of breaks that were caught', share(r.rules.caught, r.rules.broken), t.caughtShare);
  range('grounded share of catches: strict-style minus relaxed-style parent', share(r.rules.byBand.strict.grounded, Math.max(1, r.rules.byBand.strict.caught)) - share(r.rules.byBand.relaxed.grounded, Math.max(1, r.rules.byBand.relaxed.caught)), t.groundedStrictVsRelaxed);
  range('mild share of catches: close minus distant from the parent', share(r.rules.byAffection.close.mild, Math.max(1, r.rules.byAffection.close.caught)) - share(r.rules.byAffection.distant.mild, Math.max(1, r.rules.byAffection.distant.caught)), t.mildCloseVsDistant);
  range('teens with a juvenile case', share(r.trouble.juvenileLives, r.teens), t.juvenileLives);
  range('teens who started an addiction before 18', share(r.trouble.addictionLives, r.teens), t.addictionLives);
  const gpa = (p: FocusPlan) => mean(r.focus[p].gpaSum, r.focus[p].gpaN);
  const friends = (p: FocusPlan) => mean(r.focus[p].friendSum, r.focus[p].friendN);
  const income = (p: FocusPlan) => mean(r.focus[p].incomeSum, r.focus[p].incomeYears);
  const talent = (p: FocusPlan) => mean(r.focus[p].talentFound, r.focus[p].talentLives);
  range('diploma GPA: focus on school minus focus on friends', gpa('school') - gpa('friends'), t.focusGrades, (n) => n.toFixed(2));
  range('friend closeness: focus on friends minus focus on school', friends('friends') - friends('school'), t.focusFriends, (n) => n.toFixed(1));
  range('teen income: focus on work as a multiple of no focus', income('work') / Math.max(1, income('none')), t.focusMoney, (n) => n.toFixed(2));
  range('talent found: focus on a passion minus no focus', talent('passion') - talent('none'), t.focusTalent);
  range('romance involving anyone under 18', r.romanceUnder18, t.romanceUnder18, (n) => n.toFixed(0));
  return out;
}
