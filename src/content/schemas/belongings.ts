/**
 * E5 constants shared by the event schema (conditions, effects) and the
 * possessions content types (./possessions.ts). Kept apart so the event
 * schema can use them without importing the larger file.
 */

/** What you can own: a pet, a vehicle, or a vacation home (the home you live in is housing, not a possession). */
export const POSSESSION_KINDS = ['pet', 'vehicle', 'home'] as const;
export type PossessionKindId = (typeof POSSESSION_KINDS)[number];

/** A pet's personality: it changes events and how it takes to an interaction. */
export const PET_PERSONALITIES = ['playful', 'anxious', 'stubborn', 'lazy'] as const;
export type PetPersonalityId = (typeof PET_PERSONALITIES)[number];

/** A vehicle's type, for events and for what a job needs. */
export const VEHICLE_KINDS = ['car', 'truck', 'van', 'motorcycle'] as const;
export type VehicleKindId = (typeof VEHICLE_KINDS)[number];

/** How badly a vehicle or a home is damaged. A total loss is gone. */
export const DAMAGE_SEVERITIES = ['minor', 'major', 'total'] as const;
export type DamageSeverityId = (typeof DAMAGE_SEVERITIES)[number];

/** Where a pet comes from. */
export const PET_SOURCES = ['shelter', 'breeder', 'stray'] as const;
export type PetSourceId = (typeof PET_SOURCES)[number];

/** Pseudo-roles in an event's cast: the possession the event is about (a possession's id, like the story in E4). */
export const POSSESSION_ROLES = { pet: '@pet', vehicle: '@vehicle', home: '@home' } as const;
export type PossessionRoleKey = keyof typeof POSSESSION_ROLES;

/** The effect actions on possessions (events only; the Belongings screen has its own actions). */
export const POSSESSION_EFFECT_ACTIONS = [
  'vehicle_damage',
  'vehicle_stolen',
  'vehicle_sell',
  'vehicle_condition',
  'home_damage',
  'pet_adopt',
  'pet_health',
  'pet_bond',
  'pet_vet',
  'pet_leaves',
  'pet_dies',
  'insure',
] as const;
export type PossessionEffectAction = (typeof POSSESSION_EFFECT_ACTIONS)[number];

/** The events the possessions step queues (registries/possessions.yaml). */
export const ACCIDENT_KINDS = ['minor', 'major', 'total', 'drunk'] as const;
export type AccidentKind = (typeof ACCIDENT_KINDS)[number];
