/**
 * The event sandbox (development only) gives its throwaway life the pet,
 * vehicle or vacation home an event binds, so the event can be previewed and
 * played: a pet of a species the requirements name (or a dog), a vehicle, a
 * vacation home in another city. Never used by a real life.
 */
import type { Condition, ContentBundle, EventDef, PossessionKindId } from '../../content/schemas';
import { POSSESSION_ROLES } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { otherCity } from '../events/casting';
import { addPet } from './pets';
import { nextPossessionId, VACATION_HOME } from './query';
import { createRng } from '../rng';
import { refreshVehicleValue } from './vehicles';

/** The pet species or vehicle type an event's requirements name first, if any. */
function named(condition: Condition | undefined, key: 'species' | 'vehicleDef'): string | undefined {
  if (!condition) return undefined;
  if ('all' in condition) return condition.all.map((c) => named(c, key)).find((v) => v !== undefined);
  if ('any' in condition) return condition.any.map((c) => named(c, key)).find((v) => v !== undefined);
  if ('belongings' in condition) return condition.belongings[key]?.[0];
  return undefined;
}

/** Adds what the event binds to the life and puts it in the cast. */
export function giveSamplePossessions(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  for (const kind of (def.bind ?? []) as PossessionKindId[]) {
    if (kind === 'pet') {
      const species = named(def.requires, 'species') ?? 'dog';
      const pet = addPet(state, content.pets[species] ? species : 'dog', 'shelter', 'Biscuit', content);
      cast[POSSESSION_ROLES.pet] = pet.id;
    } else if (kind === 'vehicle') {
      const defId = named(def.requires, 'vehicleDef') ?? 'sedan';
      const id = nextPossessionId(state);
      state.possessions.items.push({ id, kind: 'vehicle', defId, acquired: state.currentYear, value: 0, condition: 70, vehicle: { startAge: 2, insured: true } });
      refreshVehicleValue(state, state.possessions.items.at(-1)!, content);
      cast[POSSESSION_ROLES.vehicle] = id;
    } else {
      const id = nextPossessionId(state);
      const city = otherCity(state, createRng(`${state.seed}:sample-city`), content);
      state.possessions.items.push({ id, kind: 'home', defId: VACATION_HOME, acquired: state.currentYear, value: 250_000, condition: 80, home: { cityId: city, insured: true, renovations: [] } });
      cast[POSSESSION_ROLES.home] = id;
    }
  }
}
