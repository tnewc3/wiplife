/**
 * Content checks for pets, vehicles and homes (E5): the events the
 * possessions step queues exist, only happen that way and bind what they are
 * about; every event that binds a possession requires you to have one (so a
 * life without a pet never meets a pet event); the balance names things that
 * exist; pet interactions use only the pet's role and a profile that exists,
 * and never hardcode a pronoun; history lines use the values they are given.
 */
import type { CollectionKey, ContentBundle, Condition, EventDef } from '../../src/content/schemas';
import { ACCIDENT_KINDS } from '../../src/content/schemas';
import { checkTemplate } from '../../src/engine/text';
import type { ContentError } from './compile';

const REGISTRY = 'registries/possessions.yaml';
const BALANCE = 'balance/possessions.yaml';
const TEXT = 'text/possessions.yaml';

const PRONOUN = /\b(?:he|she|him|his|hers?|himself|herself)\b/i;

/** The conditions a condition always requires: itself, or every part of a top-level `all`. */
function required(condition: Condition | undefined): Condition[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(required);
  return [condition];
}

/** True when the event always requires that you own one of this kind (a count of at least 1, or a field about one). */
function requiresOwning(def: EventDef, kind: 'pet' | 'vehicle' | 'home'): boolean {
  return required(def.requires).some((c) => {
    if (!('belongings' in c)) return false;
    const b = c.belongings;
    const atLeastOne = (cmp: { gt?: number | undefined; gte?: number | undefined; eq?: number | undefined } | undefined) =>
      cmp !== undefined && Math.max(cmp.gte ?? -Infinity, cmp.gt === undefined ? -Infinity : cmp.gt + 1, cmp.eq ?? -Infinity) >= 1;
    if (kind === 'pet') return atLeastOne(b.pets) || b.species !== undefined || b.personality !== undefined || b.petAge !== undefined || b.petHealth !== undefined || b.petBond !== undefined || b.petIll === true;
    if (kind === 'vehicle') return atLeastOne(b.vehicles) || b.vehicleKind !== undefined || b.vehicleDef !== undefined || b.vehicleAge !== undefined || b.vehicleCondition !== undefined || b.insured !== undefined || b.loan === true;
    return atLeastOne(b.vacationHomes) || b.renovated !== undefined;
  });
}

export function checkPossessions(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const reg = bundle.registries.possessions;
  const b = bundle.balance.possessions;

  // The events the possessions step queues.
  const queued: { where: string; id: string; kind: 'pet' | 'vehicle' }[] = [
    ...ACCIDENT_KINDS.flatMap((k) => reg.accidents[k].events.map((id) => ({ where: `accidents.${k}`, id, kind: 'vehicle' as const }))),
    ...reg.petDied.events.map((id) => ({ where: 'petDied', id, kind: 'pet' as const })),
  ];
  if (!partialEvents) {
    for (const { where, id, kind } of queued) {
      const def = bundle.events[id];
      if (!def) {
        err(REGISTRY, `${where}: unknown event "${id}"`);
        continue;
      }
      const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
      if (!def.followUpOnly) e(`answers ${where}, so it must be followUpOnly (the possessions step queues it)`);
      if (!(def.bind ?? []).includes(kind)) e(`answers ${where}, so it must bind a ${kind} (bind: [${kind}])`);
      if (def.cast && Object.keys(def.cast).length > 0 && kind === 'pet') e(`answers ${where}: a pet's death has no cast`);
    }
    // An event that binds a possession needs you to have one (the death of a pet is the exception: it is about one you just lost).
    const deaths = new Set(reg.petDied.events);
    for (const [id, def] of Object.entries(bundle.events)) {
      if (def.retired || deaths.has(id)) continue;
      for (const kind of def.bind ?? []) {
        if (!requiresOwning(def, kind)) err(fileOf('events', id), `${id}: binds a ${kind}, so it must require that you own one (belongings: ...)`);
      }
    }
  }

  // Balance.
  const dui = bundle.offenses[b.vehicles.insurance.record.offenseId];
  if (!dui) err(BALANCE, `vehicles.insurance.record.offenseId: unknown offense "${b.vehicles.insurance.record.offenseId}"`);
  for (const c of b.vehicles.accident.drunk.conditions) if (!bundle.conditions[c]) err(BALANCE, `vehicles.accident.drunk.conditions: unknown condition "${c}"`);
  for (const [key, share] of Object.entries(b.pets.startAgeShare)) {
    if (share.min > share.max) err(BALANCE, `pets.startAgeShare.${key}: min is above max`);
  }
  if (b.pets.health.sick.severity.min > b.pets.health.sick.severity.max) err(BALANCE, 'pets.health.sick.severity: min is above max');
  if (b.vehicles.used.condition.min > b.vehicles.used.condition.max) err(BALANCE, 'vehicles.used.condition: min is above max');
  if (b.vehicles.used.age.min > b.vehicles.used.age.max) err(BALANCE, 'vehicles.used.age: min is above max');
  const accident = b.vehicles.accident.severity;
  if (accident.minor + accident.major + accident.total <= 0) err(BALANCE, 'vehicles.accident.severity: needs a positive weight');

  // Definitions.
  for (const [id, def] of Object.entries(bundle.pets)) {
    const file = fileOf('pets', id);
    if (def.lifespan.min < 2) err(file, `${id}: the shortest lifespan is at least 2 years (a pet joins you aged at most one year less)`);
  }
  for (const [id, def] of Object.entries(bundle.petInteractions)) {
    const file = fileOf('petInteractions', id);
    if (!b.pets.interaction.profiles[def.profile]) err(file, `${id}: unknown profile "${def.profile}" (balance/possessions.yaml pets.interaction.profiles)`);
    for (const [tier, outcome] of Object.entries(def.outcomes)) {
      if (!outcome) continue;
      outcome.text.forEach((t, i) => {
        for (const message of checkTemplate(t, { roles: ['pet', 'self'], values: ['age'] })) err(file, `${id}.${tier}.text[${i}]: ${message}`);
        if (PRONOUN.test(t)) err(file, `${id}.${tier}.text[${i}]: use {pet.they}, {pet.them} and {pet.their}, never a hardcoded pronoun`);
      });
      for (const effect of outcome.effects) {
        if (effect.type === 'cost' && !bundle.balance.economy.costs[effect.item]) err(file, `${id}.${tier}: unknown cost item "${effect.item}"`);
        if (effect.type === 'flag' && !bundle.registries.flags.flags[effect.key]) err(file, `${id}.${tier}: flag "${effect.key}" is not in registries/flags.yaml`);
      }
    }
  }

  // Text.
  const text = bundle.text.possessions;
  if (new Set(text.petNames).size !== text.petNames.length) err(TEXT, 'petNames: a name appears twice');
  const values: Record<string, string[]> = {
    petAdopted: ['pet', 'species'],
    petDied: ['pet', 'species'],
    petLeft: ['pet', 'species'],
    vehicleBought: ['vehicle'],
    vehicleSold: ['vehicle'],
    vehicleLost: ['vehicle'],
    vacationBought: ['city'],
    vacationSold: ['city'],
    vacationForeclosed: ['city'],
    renovated: ['renovation', 'city'],
    noVehicleJobLost: [],
  };
  for (const [key, group] of Object.entries(text.history)) {
    group.variants.forEach((t, i) => {
      for (const message of checkTemplate(t, { values: values[key] ?? [] })) err(TEXT, `history.${key}.variants[${i}]: ${message}`);
    });
  }
  return errors;
}
