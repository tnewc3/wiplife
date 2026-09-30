/**
 * A simple model of a player's choices for the simulation runner: between
 * years it sometimes asks someone out, proposes, gets married, or ends
 * things when affection has run low; and (from Stage 6) takes gig work,
 * picks a lifestyle, moves out, rents, relocates, buys a home, and reaches
 * for a roommate, home or a debt plan when money gets tight. These chances describe
 * the simulated player, not the game, so they live here rather than in the
 * balance files; Stage 12's strategy bots replace this.
 */
import type { ActionId, ContentBundle, Lifestyle } from '../../src/content/schemas';
import { availableActions, isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { chance, nextFloat, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';

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
