/**
 * NPC aging (year pipeline step 2). NPC ages follow from their birth years;
 * each year every living NPC may die, and the death of a relative, partner
 * or friend (anyone with words in text/relations.yaml who is still in your
 * life) is written to the history.
 */
import { isDraft, original } from 'immer';
import type { ContentBundle } from '../../content/schemas';
import { chance } from '../rng';
import type { LifeState, Relationship } from '../types';
import { writeFromGroup } from './history';
import { troubleDeathChance } from '../lives/model';
import { npcDeathChance } from './mortality';

type WordedKind = keyof ContentBundle['text']['relations'];

function hasRelationWords(kind: Relationship['kind'], content: ContentBundle): kind is WordedKind {
  return kind in content.text.relations;
}

/** Step 2: age NPCs, and check whether any die. People are checked in id order. */
export function ageNpcs(state: LifeState, content: ContentBundle): void {
  // Read through the life as the earlier steps left it (faster than the draft).
  const view = isDraft(state) ? (original(state) as LifeState) : state;
  const ids = Object.keys(view.people).sort();
  for (const id of ids) {
    const seen = view.people[id]!;
    // E2a: your children and stepchildren are handled by the family step (a death there leads to its own events).
    if (!seen.alive || seen.child) continue;
    const age = state.currentYear - seen.birthYear;
    // E3: the illnesses and addictions someone has add to their chance.
    if (!chance(state.rng, Math.min(1, npcDeathChance(age, content) + troubleDeathChance(seen.life, content)))) continue;

    const person = state.people[id]!;
    person.alive = false;
    person.deathYear = state.currentYear;

    const rel = state.relationships[id];
    if (rel && rel.status !== 'ended' && hasRelationWords(rel.kind, content)) {
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
