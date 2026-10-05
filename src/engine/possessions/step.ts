/**
 * Possessions (year pipeline step 'possessions', E5), after the ledger has
 * charged the year's upkeep and insurance. As each year begins:
 *
 * 1. Pets that died last year are gone.
 * 2. Vacation homes: one whose mortgage is far enough behind is foreclosed;
 *    the rest gain value and wear, and give their stat pulls. Comfort from
 *    renovations (the home you live in and your vacation homes) lifts Happiness.
 * 3. Vehicles lose value and condition; in a year you're free, an accident
 *    or a drunk-driving incident may be queued as an event
 *    (registries/possessions.yaml), with the vehicle it is about.
 * 4. Pets have their year: health, illness, bond, ageing and death (a death queues its event).
 * 5. A job that needs a vehicle you don't have is lost after the grace years.
 */
import type { AccidentKind, ContentBundle, DamageSeverityId } from '../../content/schemas';
import { POSSESSION_ROLES } from '../../content/schemas';
import { endJob } from '../career';
import { eventWeight } from '../events/selection';
import { applyStatEffects, scaledEffects } from '../systems/economy';
import { weightedPick, wholeChange } from '../random';
import { chance } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState } from '../types';
import { comfortPull, foreclosePossession } from './homes';
import { jobDependence, jobNeedsVehicle } from './jobs';
import { petYear } from './pets';
import { homeOf, livingPets, vacationHomesOf, vehicleAge, vehicleOf, vehiclesOf } from './query';
import { accidentChance, drunkChance, refreshVehicleValue } from './vehicles';

/** Queues one of these events (picked by weight among those that fit now) for this year, about the possession in `cast`. */
export function queuePossessionEvent(state: LifeState, ids: readonly Id[], cast: Record<string, Id>, content: ContentBundle): void {
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content, cast);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return;
  const def = weightedPick(state.rng, options);
  if (state.scheduled.some((s) => s.eventId === def.id && s.dueYear === state.currentYear)) return;
  state.scheduled.push({ eventId: def.id, dueYear: state.currentYear, cast });
}

export function runPossessions(state: LifeState, content: ContentBundle): void {
  const b = content.balance.possessions;
  const year = state.currentYear;
  const acted = year - 1;
  const items = state.possessions.items;

  // 1. The dead are gone after their year.
  state.possessions.items = items.filter((p) => p.pet?.died === undefined || p.pet.died >= year);
  if (state.possessions.items.length === 0 && state.possessions.noVehicleYears === 0 && !state.housing.renovations?.length && !jobNeedsVehicle(state, content)) return;

  // 2. Vacation homes and comfort.
  for (const p of [...vacationHomesOf(state)]) {
    const debt = state.finances.debts.find((d) => d.id === homeOf(p).mortgageDebtId);
    if (debt && debt.missed >= content.balance.economy.missed.foreclosureAfter) foreclosePossession(state, p, content);
  }
  const homes = vacationHomesOf(state);
  for (const p of homes) {
    p.value = Math.max(0, Math.round(p.value * (1 + b.homes.vacation.appreciation)));
    p.condition = Math.max(0, p.condition - 1);
  }
  if (homes.length > 0) applyStatEffects(state, scaledEffects(b.homes.vacation.effects, homes.length));
  const pull = comfortPull(state, content);
  if (pull.perYear > 0) applyStatEffects(state, { happiness: pull });

  // 3. Vehicles.
  const inside = state.housing.kind === 'incarcerated';
  const job = state.career.job;
  for (const p of vehiclesOf(state)) {
    const v = vehicleOf(p);
    if (!inside) {
      const serviced = v.serviceYear !== undefined && v.serviceYear >= acted;
      const use = job ? jobDependence(job.jobId, state.character.cityId, content) : 0;
      const wear = wholeChange(state.rng, b.vehicles.wear.base + b.vehicles.wear.perAge * vehicleAge(state, p) + (serviced ? 0 : b.vehicles.wear.unserviced) + b.vehicles.wear.jobUse * use);
      p.condition = Math.max(0, p.condition - wear);
    }
    refreshVehicleValue(state, p, content);
  }
  const drivers = inside ? [] : vehiclesOf(state);
  if (drivers.length > 0 && state.character.age >= b.drivingAge) {
    const first = drivers[0]!;
    if (chance(state.rng, drunkChance(state, content))) {
      queuePossessionEvent(state, content.registries.possessions.accidents.drunk.events, { [POSSESSION_ROLES.vehicle]: first.id }, content);
    } else {
      for (const p of drivers) {
        if (!chance(state.rng, accidentChance(state, p, content))) continue;
        const severity = weightedPick(state.rng, (Object.entries(b.vehicles.accident.severity) as [DamageSeverityId, number][]).filter(([, w]) => w > 0));
        queuePossessionEvent(state, content.registries.possessions.accidents[severity as AccidentKind].events, { [POSSESSION_ROLES.vehicle]: p.id }, content);
        break;
      }
    }
  }

  // 4. Pets.
  for (const p of [...livingPets(state)]) {
    if (petYear(state, p, content)) queuePossessionEvent(state, content.registries.possessions.petDied.events, { [POSSESSION_ROLES.pet]: p.id }, content);
  }

  // 5. A job that needs a vehicle you don't have.
  if (jobNeedsVehicle(state, content) && vehiclesOf(state).length === 0) {
    state.possessions.noVehicleYears += 1;
    if (state.possessions.noVehicleYears >= b.jobs.graceYears) {
      endJob(state, 'laid_off', content);
      state.possessions.noVehicleYears = 0;
      writeFromGroup(state, content.text.possessions.history.noVehicleJobLost, ['possessions', 'noVehicleJobLost'], {}, content);
    }
  } else {
    state.possessions.noVehicleYears = 0;
  }
}
