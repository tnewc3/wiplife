/** Read-only helpers the UI uses to show a life. */
import type { ContentBundle } from '../content/schemas';
import type { LifeStage, LifeState, Person, Relationship } from './types';

export interface FamilyMember {
  person: Person;
  relationship: Relationship;
  /** Age this year, or at death. */
  age: number;
}

export function personAge(person: Person, currentYear: number): number {
  return (person.deathYear ?? currentYear) - person.birthYear;
}

const FAMILY_ORDER: Partial<Record<Relationship['kind'], number>> = {
  parent: 0,
  stepparent: 1,
  grandparent: 2,
  sibling: 3,
};

/** Parents first, then siblings; oldest first within each group. */
export function getFamily(state: LifeState): FamilyMember[] {
  return Object.values(state.relationships)
    .filter((r) => r.kind in FAMILY_ORDER)
    .flatMap((relationship) => {
      const person = state.people[relationship.personId];
      return person ? [{ person, relationship, age: personAge(person, state.currentYear) }] : [];
    })
    .sort(
      (a, b) =>
        FAMILY_ORDER[a.relationship.kind]! - FAMILY_ORDER[b.relationship.kind]! || a.person.birthYear - b.person.birthYear,
    );
}

export interface CharacterSummary {
  fullName: string;
  age: number;
  lifeStage: LifeStage;
  cityName: string;
  /** e.g. "she/her" or "xe/xem". */
  pronounLabel: string;
  housing: LifeState['housing']['kind'];
}

export function getCharacterSummary(state: LifeState, content: ContentBundle): CharacterSummary {
  const c = state.character;
  return {
    fullName: `${c.name.first} ${c.name.last}`,
    age: c.age,
    lifeStage: c.lifeStage,
    cityName: content.cities[c.cityId]?.name ?? c.cityId,
    pronounLabel: `${c.identity.pronouns.subject}/${c.identity.pronouns.object}`,
    housing: state.housing.kind,
  };
}

/** Active cities for pickers, sorted by name. */
export function getCityOptions(content: ContentBundle): { id: string; name: string; blurb: string }[] {
  return Object.values(content.cities)
    .filter((c) => !c.retired)
    .map((c) => ({ id: c.id, name: c.name, blurb: c.blurb }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Active pronoun presets for pickers, most commonly used first (by creation weights). */
export function getPronounPresets(content: ContentBundle) {
  const usage = (id: string) =>
    Object.values(content.balance.creation.pronouns).reduce((sum, weights) => sum + (weights[id] ?? 0), 0);
  return Object.values(content.pronouns)
    .filter((p) => !p.retired)
    .sort((a, b) => usage(b.id) - usage(a.id) || (a.id < b.id ? -1 : 1));
}
