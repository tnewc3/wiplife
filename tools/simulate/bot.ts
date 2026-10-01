/**
 * A simple model of a player's choices for the simulation runner: between
 * years it sometimes asks someone out, proposes, gets married, or ends
 * things when affection has run low; and (from Stage 6) takes gig work,
 * picks a lifestyle, moves out, rents, relocates, buys a home, and reaches
 * for a roommate, home or a debt plan when money gets tight; and (from
 * Stage 7) applies to school, drops out, gets a GED or goes back. These chances describe
 * the simulated player, not the game, so they live here rather than in the
 * balance files; Stage 12's strategy bots replace this.
 */
import type { ActionId, ContentBundle, Lifestyle } from '../../src/content/schemas';
import { availableActions, isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { applicationGpa } from '../../src/engine/education';
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
  worker: boolean;
  lifestyle: Lifestyle;
}

export function rollMoneyProfile(rng: RngState): MoneyProfile {
  const roll = nextFloat(rng);
  return { worker: chance(rng, 0.85), lifestyle: roll < 0.25 ? 'frugal' : roll < 0.8 ? 'comfortable' : 'lavish' };
}

/** Yearly chances for the money player model. */
const MONEY_POLICY = {
  teenGig: 0.35,
  moveOut: 0.25,
  relocate: 0.03,
  buy: 0.3,
  sell: 0.01,
  moveHomeWhenStruggling: 0.5,
  roommateWhenStruggling: 0.7,
  debtPlan: 0.5,
  /** Stops gig work each year once the retirement benefit is paid. */
  retire: 0.5,
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

  const retired = age >= content.balance.economy.retirement.age;
  if (profile.worker && !retired && can('start_gig') && (adult || chance(rng, MONEY_POLICY.teenGig))) out.push(['start_gig', {}]);
  if (retired && can('stop_gig') && chance(rng, MONEY_POLICY.retire)) out.push(['stop_gig', {}]);
  if (!adult) return out;

  const wanted: Lifestyle = struggling && profile.lifestyle !== 'frugal' ? 'frugal' : profile.lifestyle;
  if (can('set_lifestyle', { lifestyle: wanted })) out.push(['set_lifestyle', { lifestyle: wanted }]);

  const kind = life.housing.kind;
  if (kind === 'homeless') {
    if (can('move_home') && chance(rng, MONEY_POLICY.moveHomeWhenStruggling)) out.push(['move_home', {}]);
    else if (can('rent_home')) out.push(['rent_home', {}]);
  } else if (kind === 'with_parents') {
    if (can('rent_home') && age >= 19 && chance(rng, MONEY_POLICY.moveOut)) out.push(['rent_home', {}]);
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

export function chooseSchoolActions(life: LifeState, content: ContentBundle, rng: RngState): MoneyAction[] {
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
      const trade = pick(rng, options.trade.filter((o) => o.block === null));
      if (trade) out.push(['apply_school', { program: 'trade', tradeId: trade.id! }]);
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
