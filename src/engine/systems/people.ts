/**
 * NPC aging (year pipeline step 2). NPC ages follow from their birth years;
 * each year every living NPC may die, and a relative's death is written to
 * the history.
 */
import type { ContentBundle } from '../../content/schemas';
import { chance } from '../rng';
import type { LifeState, Relationship } from '../types';
import { writeFromGroup } from './history';
import { npcDeathChance } from './mortality';

type FamilyKind = keyof ContentBundle['text']['relations'];

function isFamilyKind(kind: Relationship['kind'], content: ContentBundle): kind is FamilyKind {
  return kind in content.text.relations;
}

/** Step 2: age NPCs, and check whether any die. People are checked in id order. */
export function ageNpcs(state: LifeState, content: ContentBundle): void {
  const ids = Object.keys(state.people).sort();
  for (const id of ids) {
    const person = state.people[id]!;
    if (!person.alive) continue;
    const age = state.currentYear - person.birthYear;
    if (!chance(state.rng, npcDeathChance(age, content))) continue;

    person.alive = false;
    person.deathYear = state.currentYear;

    const rel = state.relationships[id];
    if (rel && isFamilyKind(rel.kind, content)) {
      const relation = content.text.relations[rel.kind][person.identity.genderCategory];
      writeFromGroup(
        state,
        content.text.history.familyDeath,
        ['milestone', 'familyDeath', `person:${id}`],
        { roles: { npc: { name: person.name, pronouns: person.identity.pronouns } }, values: { relation, age } },
        content,
      );
    }
  }
}
