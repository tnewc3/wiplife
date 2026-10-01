/**
 * A simple model of a player's choices for the simulation runner: between
 * years it sometimes asks someone out, proposes, gets married, or ends
 * things when affection has run low; and (from Stage 6) takes gig work,
 * picks a lifestyle, moves out, rents, relocates, buys a home, and reaches
 * for a roommate, home or a debt plan when money gets tight; and (from
 * Stage 7) applies to school, drops out, gets a GED or goes back; and (from
 * Stage 8) looks for work, changes jobs, asks for raises and retires. These chances describe
 * the simulated player, not the game, so they live here rather than in the
 * balance files; Stage 12's strategy bots replace this.
 */
import { ACTION_IDS, LIFESTYLES, type ActionId, type ChoiceDef, type ContentBundle, type JobDef, type Lifestyle } from '../../src/content/schemas';
import type { ChoicePicker } from '../../src/engine/autoplay';
import { availableActions, isLifeActionAvailable, LIFE_ACTION_IDS, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { activeJob, canAskRaise, canRetire, jobApplyBlock, levelPay, startLevel } from '../../src/engine/career';
import { referencesIn } from '../../src/engine/conditions';
import { applicationGpa } from '../../src/engine/education';
import { livingCost, rentIn } from '../../src/engine/housing';
import { weightedPick } from '../../src/engine/random';
import { chance, nextFloat, pick, type RngState } from '../../src/engine/rng';
import { getApplicationOptions } from '../../src/engine/selectors';
import type { FamilyWealth, LifeState } from '../../src/engine/types';

/** Yearly chance the bot takes each action when it can, by how the person feels about you. */
const POLICY: Record<ActionId, (affection: number) => number> = {
  ask_out: (a) => (a >= 55 ? 0.3 : 0.08),
  propose: (a) => (a >= 60 ? 0.35 : 0.05),
  move_in: (a) => (a >= 55 ? 0.35 : 0.05),
  marry: () => 0.6,
  break_up: (a) => (a < 35 ? 0.35 : 0.03),
  divorce: (a) => (a < 25 ? 0.3 : 0.004),
  cut_contact: (a) => (a < 15 ? 0.05 : 0),
  reconcile: () => 0.1,
};

/** Asking out, at most one person a year. */
const ONCE_A_YEAR: ActionId[] = ['ask_out'];

/** The actions the bot takes this year, as [actionId, personId], drawing from `rng`. */
export function chooseActions(life: LifeState, content: ContentBundle, rng: RngState): [ActionId, string][] {
  const taken: [ActionId, string][] = [];
  const askable: string[] = [];
  for (const id of Object.keys(life.relationships).sort()) {
    const affection = life.relationships[id]!.affection;
    for (const action of availableActions(life, id, content)) {
      if (ONCE_A_YEAR.includes(action.id)) {
        if (chance(rng, POLICY[action.id](affection))) askable.push(id);
      } else if (chance(rng, POLICY[action.id](affection))) {
        taken.push([action.id, id]);
      }
    }
  }
  if (askable.length > 0) taken.push(['ask_out', pick(rng, askable)]);
  return taken;
}

/**
 * How one simulated player handles money, fixed for the life: whether they
 * work (gig work, the only income before careers) and the lifestyle they
 * like. Like POLICY above, these chances describe the simulated player.
 */
export interface MoneyProfile {
  /** Works at all (gig work, and jobs if a job seeker). */
  worker: boolean;
  /** Applies for jobs (Stage 8); the rest stick to gig work. */
  jobSeeker: boolean;
  lifestyle: Lifestyle;
  /** The age they'd like to retire at (Stage 8). */
  retireAge: number;
  /** Goes to trade school when eligible instead of college (Stage 8 follow-up: so trades get played). */
  tradeMinded: boolean;
}

export function rollMoneyProfile(rng: RngState): MoneyProfile {
  const roll = nextFloat(rng);
  const lifestyle: Lifestyle = roll < 0.25 ? 'frugal' : roll < 0.8 ? 'comfortable' : 'lavish';
  // With jobs to apply for (Stage 8), nearly every simulated player works; a
  // few never do, and some stick to gig work.
  const profile = { worker: chance(rng, 0.97), jobSeeker: chance(rng, 0.95), lifestyle, retireAge: 60 + Math.floor(nextFloat(rng) * 11) };
  return { ...profile, tradeMinded: chance(rng, SCHOOL_POLICY.tradeMinded) };
}

/** Yearly chances for the money player model. */
const MONEY_POLICY = {
  teenGig: 0.35,
  moveOut: 0.25,
  /** Moves out only on income at least this many times a year's rent and living costs there (Stage 8: jobs make it possible). */
  moveOutIncome: 1.3,
  relocate: 0.03,
  buy: 0.3,
  sell: 0.01,
  moveHomeWhenStruggling: 0.5,
  roommateWhenStruggling: 0.7,
  debtPlan: 0.5,
  /** Stops gig work each year once the retirement benefit is paid. */
  retire: 0.5,
  /** Lives lavishly (if that's their taste) only with at least this much saved (Stage 8). */
  lavishCushion: 20_000,
  /** Pays off a debt when savings exceed its balance by this much. */
  payOffCushion: 10_000,
};

type MoneyAction = [LifeActionId, LifeActionParams];

/** The money and home actions the bot takes this year, drawing from `rng`. */
export function chooseMoneyActions(life: LifeState, content: ContentBundle, rng: RngState, profile: MoneyProfile): MoneyAction[] {
  const out: MoneyAction[] = [];
  const can = (id: LifeActionId, params: LifeActionParams = {}) => isLifeActionAvailable(life, id, params, content);
  const age = life.character.age;
  const adult = age >= content.balance.economy.independenceAge;
  const struggling = (life.finances.lastLedger?.borrowed ?? 0) > 0 || life.finances.debts.some((d) => d.missed > 0);

  const retired = age >= content.balance.economy.retirement.age || life.career.retired;
  if (profile.worker && !retired && can('start_gig') && (adult || chance(rng, MONEY_POLICY.teenGig))) out.push(['start_gig', {}]);
  if (retired && can('stop_gig') && chance(rng, MONEY_POLICY.retire)) out.push(['stop_gig', {}]);
  if (!adult) return out;

  // Lavish living only with a cushion of savings; frugal while struggling.
  const cushioned = profile.lifestyle !== 'lavish' || life.finances.savings >= MONEY_POLICY.lavishCushion;
  const wanted: Lifestyle = struggling && profile.lifestyle !== 'frugal' ? 'frugal' : cushioned ? profile.lifestyle : 'comfortable';
  if (can('set_lifestyle', { lifestyle: wanted })) out.push(['set_lifestyle', { lifestyle: wanted }]);

  const kind = life.housing.kind;
  if (kind === 'homeless') {
    if (can('move_home') && chance(rng, MONEY_POLICY.moveHomeWhenStruggling)) out.push(['move_home', {}]);
    else if (can('rent_home')) out.push(['rent_home', {}]);
  } else if (kind === 'with_parents') {
    const city = content.cities[life.character.cityId]!;
    const costs = rentIn(city, false, content) + livingCost({ ...life, housing: { ...life.housing, kind: 'renting' } }, content);
    const income = (life.finances.lastLedger?.gross ?? 0) + (life.career.job?.salary ?? 0);
    if (can('rent_home') && age >= 19 && income >= costs * MONEY_POLICY.moveOutIncome && chance(rng, MONEY_POLICY.moveOut)) out.push(['rent_home', {}]);
  } else if (kind === 'renting' && struggling) {
    if (can('find_roommate') && chance(rng, MONEY_POLICY.roommateWhenStruggling)) out.push(['find_roommate', {}]);
    else if (can('move_home') && chance(rng, MONEY_POLICY.moveHomeWhenStruggling)) out.push(['move_home', {}]);
  }
  if (kind === 'renting' && !struggling && can('buy_home') && chance(rng, MONEY_POLICY.buy)) out.push(['buy_home', {}]);
  if (kind === 'owned' && can('sell_home') && chance(rng, MONEY_POLICY.sell)) out.push(['sell_home', {}]);
  if (kind !== 'owned' && chance(rng, MONEY_POLICY.relocate)) {
    const cities = Object.keys(content.cities)
      .sort()
      .filter((cityId) => can('relocate', { cityId }));
    if (cities.length > 0) out.push(['relocate', { cityId: pick(rng, cities) }]);
  }

  if (can('debt_plan') && chance(rng, MONEY_POLICY.debtPlan)) out.push(['debt_plan', {}]);
  const target = [...life.finances.debts]
    .filter((d) => d.kind !== 'mortgage' && life.finances.savings >= d.balance + MONEY_POLICY.payOffCushion)
    .sort((a, b) => b.annualRate - a.annualRate)[0];
  if (target) out.push(['pay_debt', { debtId: target.id }]);
  return out;
}

/**
 * How the simulated player handles school (Stage 7). Like the policies
 * above, these chances describe the simulated player, not the game. The
 * wish to go to college grows with family wealth and grades; the cost
 * (what's left to borrow) puts some off.
 */
const SCHOOL_POLICY = {
  /** Chance of applying to college in the last year of high school, by family wealth. */
  college: { poor: 0.45, working: 0.55, middle: 0.7, affluent: 0.85, rich: 0.92 } as Record<FamilyWealth, number>,
  /** Multiplies that chance by high school GPA. */
  byGpa: [
    { below: 2.0, x: 0.3 },
    { below: 2.5, x: 0.6 },
    { below: 3.0, x: 0.9 },
    { below: 5, x: 1.1 },
  ],
  /** Shies away from a year's loan above this. */
  loanWorry: 20_000,
  /** Tries an elite university too, with a GPA at least this. */
  eliteGpa: 3.5,
  elite: 0.6,
  /** Trade school, when not going to college. */
  trade: 0.3,
  /** Share of players who go to trade school whenever eligible, instead of college (until licensed, up to returnLaterUntil). */
  tradeMinded: 0.15,
  /** Drops out of high school each year with a GPA below this... */
  dropoutGpa: 2.6,
  dropout: 0.1,
  /** ...or out of college, trade or grad school. */
  collegeDropoutGpa: 1.8,
  collegeDropout: 0.25,
  ged: 0.25,
  /** Each year, an adult without a degree goes back to school (or applies late). */
  returnLater: 0.02,
  /** ...up to this age. */
  returnLaterUntil: 40,
  goBack: 0.15,
  /** Grad school after a bachelor's with a GPA at least this. */
  gradGpa: 3.2,
  grad: 0.25,
  /** ...within this many years of finishing it, and only one grad degree. */
  gradWithin: 3,
  changeMajor: 0.05,
};

export function chooseSchoolActions(life: LifeState, content: ContentBundle, rng: RngState, profile: MoneyProfile): MoneyAction[] {
  const out: MoneyAction[] = [];
  const can = (id: LifeActionId, params: LifeActionParams = {}) => isLifeActionAvailable(life, id, params, content);
  const edu = life.education;
  const cur = edu.current;
  const age = life.character.age;
  const majors = Object.keys(content.majors).sort();
  const gpaFactor = (gpa: number) => SCHOOL_POLICY.byGpa.find((b) => gpa < b.below)!.x;
  const applyCollege = (tier: 'community' | 'state' | 'elite') => {
    const params: LifeActionParams = { program: 'college', tier, majorId: pick(rng, majors) };
    if (can('apply_school', params)) out.push(['apply_school', params]);
  };

  if (cur && can('drop_out')) {
    const limit = cur.program === 'high' ? SCHOOL_POLICY.dropoutGpa : SCHOOL_POLICY.collegeDropoutGpa;
    const odds = cur.program === 'high' ? SCHOOL_POLICY.dropout : SCHOOL_POLICY.collegeDropout;
    if (cur.gpa < limit && chance(rng, odds)) return [['drop_out', {}]];
  }
  if (cur?.program === 'college' && chance(rng, SCHOOL_POLICY.changeMajor)) {
    const majorId = pick(rng, majors);
    if (can('choose_major', { majorId })) out.push(['choose_major', { majorId }]);
  }
  if (can('take_ged') && chance(rng, SCHOOL_POLICY.ged)) out.push(['take_ged', {}]);
  if (can('return_to_school') && chance(rng, SCHOOL_POLICY.goBack)) return [...out, ['return_to_school', {}]];

  const options = getApplicationOptions(life, content);
  // A trade-minded player applies to trade school whenever eligible, until licensed.
  if (profile.tradeMinded) {
    const licensed = edu.credentials.some((c) => c.type === 'trade_license');
    const eligible = (cur === null || (cur.program === 'high' && cur.year >= cur.lengthYears)) && !edu.admission;
    if (!licensed && eligible && age <= SCHOOL_POLICY.returnLaterUntil) {
      const open = options.trade.filter((o) => o.block === null);
      if (open.length > 0) return [...out, ['apply_school', { program: 'trade', tradeId: pick(rng, open).id! }]];
    }
    if (!licensed) return out;
  }
  // Last year of high school (or later, now and then): college or trade school.
  const hsSenior = cur?.program === 'high' && cur.year >= cur.lengthYears;
  const lateStarter = !cur && !edu.admission && age >= 19 && age <= SCHOOL_POLICY.returnLaterUntil && !edu.credentials.some((c) => c.type !== 'hs_diploma' && c.type !== 'ged');
  if ((hsSenior || (lateStarter && chance(rng, SCHOOL_POLICY.returnLater))) && !edu.admission) {
    const gpa = applicationGpa(life, 'college', content);
    const state = options.college.find((o) => o.tier === 'state')!;
    const wants = SCHOOL_POLICY.college[life.character.familyWealth] * gpaFactor(gpa) * (state.bill.loan > SCHOOL_POLICY.loanWorry ? 0.5 : 1);
    if (chance(rng, Math.min(0.97, hsSenior ? wants : 1))) {
      applyCollege(gpa >= 2.6 ? 'state' : 'community');
      if (gpa >= SCHOOL_POLICY.eliteGpa && chance(rng, SCHOOL_POLICY.elite)) applyCollege('elite');
    } else if (chance(rng, SCHOOL_POLICY.trade)) {
      // Nothing may be open (a record or prison can block every option).
      const open = options.trade.filter((o) => o.block === null);
      if (open.length > 0) out.push(['apply_school', { program: 'trade', tradeId: pick(rng, open).id! }]);
    }
  }
  // State university after community college.
  if (cur?.program === 'college' && cur.tier === 'community' && cur.year >= cur.lengthYears && chance(rng, 0.4)) {
    const params: LifeActionParams = { program: 'college', tier: 'state', majorId: cur.majorId! };
    if (can('apply_school', params)) out.push(['apply_school', params]);
  }
  // A rejected student tries community college the next year.
  const rejected = life.history.some((e) => e.year === life.currentYear - 1 && e.tags.includes('rejected'));
  if (!cur && !edu.admission && rejected && age <= 21 && chance(rng, 0.6)) applyCollege('community');
  // Grad school after a good bachelor's.
  const bachelor = edu.credentials.find((c) => c.type === 'bachelor');
  const finishing = cur?.program === 'college' && cur.tier !== 'community' && cur.year >= cur.lengthYears;
  const recent = finishing || (bachelor !== undefined && life.currentYear - bachelor.year <= SCHOOL_POLICY.gradWithin);
  const firstGrad = !edu.credentials.some((c) => c.type === 'grad');
  const gpa = finishing ? cur.gpa : (bachelor?.gpa ?? 0);
  if (recent && firstGrad && gpa >= SCHOOL_POLICY.gradGpa && !edu.admission && (!cur || finishing) && chance(rng, SCHOOL_POLICY.grad)) {
    const grad = options.grad.filter((o) => o.block === null);
    if (grad.length > 0) out.push(['apply_school', { program: 'grad', gradProgramId: pick(rng, grad).id! }]);
  }
  return out;
}

/**
 * How the simulated player works (Stage 8). Like the policies above, these
 * chances describe the simulated player, not the game.
 */
const CAREER_POLICY = {
  /** Each year with a job, looks for a better-paying one... */
  switchLook: 0.08,
  /** ...paying at least this much more. */
  switchGain: 1.2,
  /** Doesn't retire (again) from a job started this recently. */
  settleYears: 4,
  /** Retires before the retirement benefit starts only with savings of this many years of costs. */
  earlyRetireYears: 12,
  /** Asks for a raise when it can. */
  askRaise: 0.2,
  /** Quits for no reason in particular. */
  quit: 0.01,
  /** Leans this much more toward a job that uses their degree or license. */
  trainingPull: 4,
};

/** The work actions the bot takes this year, drawing from `rng`. */
export function chooseCareerActions(life: LifeState, content: ContentBundle, rng: RngState, profile: MoneyProfile): MoneyAction[] {
  const out: MoneyAction[] = [];
  const c = life.career;
  if (!profile.worker || !profile.jobSeeker || c.retired) return out;
  const job = c.job;
  const settled = !job || life.currentYear - job.since >= CAREER_POLICY.settleYears;
  const ledger = life.finances.lastLedger;
  const yearlyCosts = ledger ? ledger.housing + ledger.living + ledger.debtPayments : 0;
  const affordable =
    life.character.age >= content.balance.economy.retirement.age || life.finances.savings >= yearlyCosts * CAREER_POLICY.earlyRetireYears;
  if (life.character.age >= profile.retireAge && settled && affordable && canRetire(life, content)) return [['retire', {}]];
  if (job) {
    if (chance(rng, CAREER_POLICY.quit)) return [['quit_job', {}]];
    if (canAskRaise(life) && chance(rng, CAREER_POLICY.askRaise)) out.push(['ask_raise', {}]);
    if (!chance(rng, CAREER_POLICY.switchLook)) return out;
  }
  // Openings it can apply for, up to the yearly limit, picked with a lean
  // toward better pay (a track's average level pay, squared).
  let options = c.openings
    .filter((id) => jobApplyBlock(life, id, content) === null)
    .map((id) => {
      const def = activeJob(content, id)!;
      const start = levelPay(life, def, startLevel(life, def), content);
      const average = def.levels.reduce((sum, _l, i) => sum + levelPay(life, def, i + 1, content), 0) / def.levels.length;
      // A job that uses your degree or license appeals more.
      const uses = usesTraining(life, def) ? CAREER_POLICY.trainingPull : 1;
      return { id, start, weight: (average / 10_000) ** 2 * uses };
    })
    .filter((o) => !job || o.start >= job.salary * CAREER_POLICY.switchGain);
  while (options.length > 0 && out.filter(([a]) => a === 'apply_job').length < content.balance.careers.maxApplications) {
    const picked = weightedPick(rng, options.map((o) => [o, o.weight] as const));
    out.push(['apply_job', { jobId: picked.id }]);
    options = options.filter((o) => o !== picked);
  }
  return out;
}

/** The job needs a degree or license in a field you hold (or are finishing). */
export function usesTraining(life: LifeState, def: JobDef): boolean {
  const fields = referencesIn(def.requires).fields;
  return fields.length > 0 && life.education.credentials.some((c) => c.refId !== undefined && fields.includes(c.refId));
}

/**
 * The careless player (a second simulation run, shown beside the one
 * above): no caution rules and no plans. Each year it takes each kind of
 * money, home, school and work action that's available with a flat chance,
 * with parameters picked at random, and each relationship action with a
 * smaller one. Event choices are random for both players. Like the policies
 * above, these chances describe the simulated player, not the game.
 */
const CARELESS = {
  /** Chance of each kind of money, home, school or work action a year. */
  lifeAction: 0.15,
  /** Chance of each relationship action with each person a year. */
  personAction: 0.05,
};

/** Every parameter set worth trying for an action. */
function paramOptions(life: LifeState, content: ContentBundle, actionId: LifeActionId): LifeActionParams[] {
  switch (actionId) {
    case 'set_lifestyle':
      return LIFESTYLES.map((lifestyle) => ({ lifestyle }));
    case 'pay_debt':
      return life.finances.debts.map((d) => ({ debtId: d.id }));
    case 'relocate':
      return Object.keys(content.cities)
        .sort()
        .map((cityId) => ({ cityId }));
    case 'choose_major':
      return Object.keys(content.majors)
        .sort()
        .map((majorId) => ({ majorId }));
    case 'apply_school': {
      const majors = Object.keys(content.majors).sort();
      return [
        ...(['community', 'state', 'elite'] as const).flatMap((tier) => majors.map((majorId) => ({ program: 'college' as const, tier, majorId }))),
        ...Object.keys(content.trades)
          .sort()
          .map((tradeId) => ({ program: 'trade' as const, tradeId })),
        ...Object.keys(content.gradPrograms)
          .sort()
          .map((gradProgramId) => ({ program: 'grad' as const, gradProgramId })),
      ];
    }
    case 'apply_job':
      return life.career.openings.map((jobId) => ({ jobId }));
    default:
      return [{}];
  }
}

/** The money, home, school and work actions the careless player takes this year, drawing from `rng`. */
export function chooseCarelessLifeActions(life: LifeState, content: ContentBundle, rng: RngState): MoneyAction[] {
  const out: MoneyAction[] = [];
  for (const actionId of LIFE_ACTION_IDS) {
    if (!chance(rng, CARELESS.lifeAction)) continue;
    const available = paramOptions(life, content, actionId).filter((params) => isLifeActionAvailable(life, actionId, params, content));
    if (available.length > 0) out.push([actionId, pick(rng, available)]);
  }
  return out;
}

/** The relationship actions the careless player takes this year, drawing from `rng`. */
export function chooseCarelessActions(life: LifeState, content: ContentBundle, rng: RngState): [ActionId, string][] {
  const out: [ActionId, string][] = [];
  for (const id of Object.keys(life.relationships).sort()) {
    for (const action of availableActions(life, id, content)) {
      if (ACTION_IDS.includes(action.id) && chance(rng, CARELESS.personAction)) out.push([action.id, id]);
    }
  }
  return out;
}

/**
 * How the simulated player looks after their health (Stage 9). Like the
 * policies above, these chances describe the simulated player, not the game.
 */
const HEALTH_POLICY = {
  /** Sees a doctor in a year with an untreated condition... */
  untreated: 0.5,
  /** ...and for a checkup otherwise. */
  checkup: 0.1,
};

/** The doctor visit the careful player makes this year, if any, drawing from `rng`. */
export function chooseHealthActions(life: LifeState, content: ContentBundle, rng: RngState): MoneyAction[] {
  if (!isLifeActionAvailable(life, 'see_doctor', {}, content)) return [];
  const untreated = life.health.conditions.some((c) => !c.treated);
  return chance(rng, untreated ? HEALTH_POLICY.untreated : HEALTH_POLICY.checkup) ? [['see_doctor', {}]] : [];
}

/** What a choice can lead to, for the player model below (Stage 9). */
export interface ChoiceTraits {
  /** Some outcome puts an offense on your record (a legal effect). */
  illegal: boolean;
  /** It rolls a chance check (and isn't illegal). */
  risky: boolean;
  /** Some outcome feeds a vice (raises vice). */
  vice: boolean;
  /** Its outcomes, all told, raise or lower how someone feels about you. */
  kind: boolean;
  unkind: boolean;
}

const traitsCache = new WeakMap<ChoiceDef, ChoiceTraits>();

export function choiceTraits(choice: ChoiceDef): ChoiceTraits {
  let traits = traitsCache.get(choice);
  if (!traits) {
    const outcomes = choice.outcome ? [choice.outcome] : choice.check ? [choice.check.success, choice.check.failure] : [];
    const effects = outcomes.flatMap((o) => o.effects);
    const affection = effects.reduce((sum, e) => sum + (e.type === 'relationship' ? (e.affection ?? 0) : 0), 0);
    const illegal = effects.some((e) => e.type === 'legal');
    traits = {
      illegal,
      risky: !illegal && choice.check !== undefined,
      vice: effects.some((e) => e.type === 'stat' && e.key === 'vice' && e.delta > 0),
      kind: affection > 0,
      unkind: affection < 0,
    };
    traitsCache.set(choice, traits);
  }
  return traits;
}

/**
 * How the careful player picks event choices (Stage 9): weighted by
 * personality. Risk-taking draws them to risky and illegal choices,
 * Discipline holds them back from illegal ones and vices, vice
 * susceptibility pulls toward vices, and Kindness toward choices that leave
 * people feeling better about them. Like the policies above, these numbers
 * describe the simulated player, not the game.
 */
const CHOICE_POLICY = {
  illegal: { base: 0.2, riskTaking: 1.6, discipline: 0.8 },
  risky: { base: 0.5, riskTaking: 1 },
  vice: { base: 0.4, vice: 1.2, discipline: 0.6 },
  kind: { base: 0.5, kindness: 1 },
};

/** The careful player's weight for a choice: 1 for a plain one, more or less by personality. */
export function choiceWeight(life: LifeState, traits: ChoiceTraits): number {
  const p = life.character.personality;
  const share = (v: number) => v / 100;
  const c = CHOICE_POLICY;
  let w = 1;
  // Each factor is 1 for an average personality (50) and moves either way from there.
  if (traits.illegal) w *= (c.illegal.base + c.illegal.riskTaking * share(p.riskTaking)) * (1 + c.illegal.discipline * (0.5 - share(p.discipline)));
  if (traits.risky) w *= c.risky.base + c.risky.riskTaking * share(p.riskTaking);
  if (traits.vice) w *= (c.vice.base + c.vice.vice * share(life.character.hidden.vice)) * (1 + c.vice.discipline * (0.5 - share(p.discipline)));
  if (traits.kind) w *= c.kind.base + c.kind.kindness * share(p.kindness);
  if (traits.unkind) w *= c.kind.base + c.kind.kindness * (1 - share(p.kindness));
  return Math.max(0.01, w);
}

/** The careful player's choice on a card, by personality (drawing from `rng`). */
export function personalityChoice(content: ContentBundle): ChoicePicker {
  return (life, card, rng) => {
    const def = content.events[life.pending.find((p) => p.instanceId === card.instanceId)?.eventId ?? ''];
    const options = card.choices.map((c) => {
      const choice = def?.choices?.find((d) => d.id === c.id);
      return [c.id, choice ? choiceWeight(life, choiceTraits(choice)) : 1] as const;
    });
    return weightedPick(rng, options);
  };
}
