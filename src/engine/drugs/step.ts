/**
 * The drugs step (D1, year pipeline, after the legal step and before the crime step, so the heat it adds counts in the
 * police roll): as each year begins,
 *
 * - every habit has its year (use and what it takes, a year clean, withdrawal, relapse; an overdose when use has been heavy
 *   and warning signs are behind it) and the addiction condition is brought in step with the habits;
 * - a stash can be found by the police or stolen; keeping it hidden costs a little;
 * - dealing sells from stock (dirty money, heat, customers, trouble) and each operation runs its year (output, quality,
 *   upkeep, a raid, a fire or a theft);
 * - the police may arrest someone who holds, sells or makes drugs, by the heat on them, and the court decides;
 * - the year's events are queued, most serious first, up to the balance's limit.
 *
 * In prison nothing is used or sold. Numbers: balance/drugs.yaml. The events: registries/drugs.yaml.
 */
import type { ContentBundle, DrugTrigger } from '../../content/schemas';
import { eventWeight } from '../events/selection';
import { arrestChance, isIncarcerated } from '../legal';
import { weightedPick } from '../random';
import { chance } from '../rng';
import type { LifeState } from '../types';
import { dealingYear } from './dealing';
import { syncAddiction } from './habit';
import { charge, offenseFor } from './legal';
import { opsYear } from './ops';
import { canUseAge, isAdult, holdsAny, rollYear, totalUnits } from './query';
import { say, unitsText } from './text';
import { runHabits } from './year';
import { spend } from '../finance';

/** Queues one of a trigger's events, picked by weight among those that fit now, unless one is already queued for that year. */
export function queueDrugEvent(state: LifeState, trigger: DrugTrigger, content: ContentBundle, dueYear = state.currentYear): boolean {
  const ids = content.registries.drugs.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast: {} });
  return true;
}

function stashYear(state: LifeState, content: ContentBundle): 'found' | 'stolen' | null {
  const st = content.balance.drugs.stash;
  if (!holdsAny(state)) return null;
  // Keeping it hidden costs a little a year.
  const hidden = Object.values(state.drugs.stock).reduce((n, s) => n + (s.hidden ? s.units : 0), 0);
  if (hidden > 0) spend(state, Math.round(hidden * st.hideCost), content);
  const heat = state.crime.heat;
  if (heat > 0 && chance(state.rng, (st.search * heat) / 100)) {
    const find = chance(state.rng, st.hideFind);
    const units = totalUnits(state);
    const first = Object.keys(state.drugs.stock).sort()[0]!;
    const def = content.drugs[first];
    say(state, 'stashFound', { drug: def?.noun ?? '', units: def ? unitsText(units, def) : '' }, content);
    charge(state, 'holding', content, { findHidden: find });
    return 'found';
  }
  if (chance(state.rng, st.theft)) {
    for (const id of Object.keys(state.drugs.stock).sort()) {
      const s = state.drugs.stock[id]!;
      s.units = Math.floor(s.units / 2);
      if (s.units <= 0) delete state.drugs.stock[id];
    }
    const first = Object.keys(content.drugs).sort()[0]!;
    say(state, 'stashStolen', { drug: content.drugs[first]?.noun ?? '' }, content);
    return 'stolen';
  }
  return null;
}

export function runDrugs(state: LifeState, content: ContentBundle): void {
  const d = state.drugs;
  const b = content.balance.drugs;
  const jailed = isIncarcerated(state);
  const active = Object.keys(d.habits).length > 0 || holdsAny(state) || d.dealing !== null || d.ops.length > 0;
  if (!active && !canUseAge(state, content)) {
    rollYear(state);
    return;
  }
  const habits = runHabits(state, content, jailed);
  if (state.death) return;
  if (jailed) {
    syncAddiction(state, content);
    return;
  }

  const stash = stashYear(state, content);
  const deal = dealingYear(state, content);
  const ops = opsYear(state, content);

  // The police: someone who holds, sells or makes drugs is exposed by the heat on them.
  let arrested = false;
  const exposure = d.ops.length > 0 || ops.raided ? 1 : d.dealing ? 1 : holdsAny(state) ? 0.4 : 0;
  if (exposure > 0 && !stash && !ops.raided && chance(state.rng, Math.min(0.9, arrestChance(state, content) * exposure))) {
    arrested = true;
    const situation = d.ops.length > 0 ? 'making' : d.dealing ? 'selling' : 'holding';
    void offenseFor;
    charge(state, situation, content);
  }

  let room = b.events.maxQueued;
  const queue = (trigger: DrugTrigger): void => {
    if (room > 0 && queueDrugEvent(state, trigger, content)) room -= 1;
  };
  if (arrested || stash === 'found' || ops.raided) queue(ops.raided ? 'raid' : 'arrest');
  if (habits.er) queue('er');
  else if (habits.scare) queue('scare');
  if (ops.fire) queue('fire');
  if (deal.trouble === 'robbery') queue('theft');
  else if (deal.trouble === 'rival') queue('rival');
  else if (deal.trouble === 'snitch') queue('snitch');
  if (stash === 'stolen' || ops.stolen) queue('theft');
  if (habits.withdrawal && chance(state.rng, b.events.withdrawal)) queue('withdrawal');
  else if (habits.craving && chance(state.rng, b.events.craving)) queue('craving');
  if (habits.tempted) queue('tempted');
  if (habits.noticed && chance(state.rng, b.events.noticed)) queue('noticed');
  if (deal.sold > 0 && chance(state.rng, 0.4)) queue('customer');
  // Being offered something: young adults and teens at parties, and more for those with a taste for it.
  if (!habits.craving && isAdult(state, content) === false && canUseAge(state, content) && chance(state.rng, b.events.offered * 0.6)) queue('offered');
  else if (isAdult(state, content) && d.dealing === null && !habits.craving && chance(state.rng, b.events.offered * (0.3 + state.character.hidden.vice / 100))) queue('offered');
  else if (isAdult(state, content) && state.drugs.dealers.length === 0 && chance(state.rng, b.events.approach * (0.3 + state.character.hidden.vice / 100))) queue('approach');
}
