/**
 * Why an edit was refused (G1, docs/expansion.md). The engine returns a code and the facts behind it; the sentence for each
 * code is an interface word in src/ui/labels.ts, so nothing player-facing is written here.
 */
import type { Id } from '../types';

export const REFUSAL_CODES = [
  // The gate.
  'not_between_years',
  'card_open',
  'life_over',
  // The payload.
  'invalid_value',
  'too_many_fields',
  'too_large',
  'nothing_changed',
  'unknown_id',
  'field_unavailable',
  // Content rules.
  'minor_romance',
  'family_kind',
  'place_kind',
  'second_partner',
  'no_attraction',
  'taken',
  'partner_status',
  'dead_person',
  'age_fixed',
  'age_bounds',
  // Presence.
  'lives_with_you',
  'works_with_you',
  'move_other_country',
  'move_minor',
  'move_owned_home',
  'move_probation',
  'move_prison',
  'move_abroad',
  // The areas.
  'job_requirements',
  'job_retired',
  'job_prison',
  'job_vehicle',
  'job_language',
  'job_school',
  'job_status',
  'job_age',
  'money_range',
  'debt_locked',
  'debt_kind',
  'child_debt',
  'no_native_language',
  'language_duplicate',
  'citizenship_empty',
  'citizenship_first',
  'citizenship_duplicate',
  'citizenship_dual',
  'talent_missing',
  'condition_duplicate',
  'condition_age',
  'trouble_limit',
  'faith_strength',
  'latent_faith_same',
  'carrying',
  'appearance',
  'child_traits',
  // The safety nets.
  'invariant',
  'internal',
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** One reason an edit can't be saved. */
export interface EditRefusal {
  code: RefusalCode;
  /** The area of the editor it belongs to (the key of the payload), for pointing at the field. */
  area: string;
  field?: string;
  /** The person it is about, if any. */
  person?: Id;
  /** The numbers and words the sentence needs (names are filled in by the interface from `person`). */
  facts: Record<string, string | number>;
}

export function refusal(code: RefusalCode, area: string, extra: { field?: string; person?: Id; facts?: Record<string, string | number> } = {}): EditRefusal {
  return { code, area, ...(extra.field !== undefined ? { field: extra.field } : {}), ...(extra.person !== undefined ? { person: extra.person } : {}), facts: extra.facts ?? {} };
}

/** Thrown by performEdit when an edit is refused; the life is untouched. */
export class EditRefusedError extends Error {
  override name = 'EditRefusedError';
  constructor(readonly refusals: EditRefusal[]) {
    super(`Edit refused: ${refusals.map((r) => r.code).join(', ')}`);
  }
}

export type EditResult = { ok: true } | { ok: false; refusals: EditRefusal[] };
