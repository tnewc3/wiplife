/**
 * Whose age an edit can change, and between which birth years (G1, docs/expansion.md, "Age"). Your own age is never
 * editable: it is the count of age-ups in the input log, and your schooling, work, earnings and health hang from it. Another
 * person's is, for a living friend, acquaintance, partner, fiancé, spouse or ex who is not family, a child, a grandchild,
 * your guardian or the one caring for you, and only to birth years that keep every dated fact about them true.
 */
import type { ContentBundle } from '../../content/schemas';
import { isFamilyKind, isRomanticKind, kindSince } from '../relationships';
import type { Id, LifeState } from '../types';

export type AgeFixedReason = 'family' | 'place' | 'child' | 'dead' | 'guardian' | 'unknown';

export interface AgeBounds {
  /** Their age can be edited. */
  editable: boolean;
  reason?: AgeFixedReason;
  /** The earliest and latest birth year allowed (min ≤ max when editable). */
  minBirthYear: number;
  maxBirthYear: number;
  /** The latest birth year at which a romance they are in was still between adults; later than this is a minor in a romance. */
  romanceMaxBirthYear: number;
}

const PLACE_KINDS = ['coworker', 'boss', 'classmate', 'teacher'];

export function ageBounds(state: LifeState, personId: Id, content: ContentBundle): AgeBounds {
  const none = (reason: AgeFixedReason): AgeBounds => ({ editable: false, reason, minBirthYear: 0, maxBirthYear: 0, romanceMaxBirthYear: 0 });
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person || !rel) return none('unknown');
  if (!person.alive) return none('dead');
  if (person.child || person.grandchild) return none('child');
  if (state.housing.guardianId === personId || state.later.care?.providerId === personId) return none('guardian');
  if (isFamilyKind(rel.kind) || rel.kind === 'teacher') return none('family');
  if (PLACE_KINDS.includes(rel.kind)) return none('place');

  const { adultAge } = content.balance.relationships;
  const { parentAgeAtBirth } = content.balance.creation.family;
  const year = state.currentYear;
  let min = year - content.balance.mortality.maxAge + 1;
  let max = year;
  let romanceMax = Infinity;
  const noLaterThan = (y: number) => {
    max = Math.min(max, y);
  };

  if (isRomanticKind(rel.kind)) {
    romanceMax = kindSince(rel) - adultAge;
    noLaterThan(romanceMax);
  }
  const life = person.life;
  if (life) {
    if (life.partner) noLaterThan(life.partner.since - adultAge);
    if (life.partner || life.ended || life.children.length > 0) noLaterThan(year - adultAge);
    for (const kid of life.children) {
      noLaterThan(kid.birthYear - Math.max(adultAge, parentAgeAtBirth.min));
      min = Math.max(min, kid.birthYear - parentAgeAtBirth.max);
    }
    for (const t of life.troubles) noLaterThan(t.since);
    if (person.occupation !== undefined && life.level > 0) noLaterThan(life.levelSince - content.balance.careers.minAge);
  }
  for (const born of person.priorChildren ?? []) {
    noLaterThan(born - Math.max(adultAge, parentAgeAtBirth.min));
    min = Math.max(min, born - parentAgeAtBirth.max);
  }
  return { editable: min <= max, ...(min <= max ? {} : { reason: 'unknown' as const }), minBirthYear: min, maxBirthYear: max, romanceMaxBirthYear: romanceMax };
}
