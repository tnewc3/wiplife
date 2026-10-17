/**
 * A saved life for the romance tests (B1): a man attracted to men, who knows
 * two men: Leo, who is attracted to men too, and Ben, who is attracted to
 * women only. Built with the engine on the test content pack and written
 * into the app's database before it loads.
 */
import { produce } from 'immer';
import type { LifeState } from '../../src/engine/types';
import { peopleLife } from './peopleFixtures';

export function sameGenderLife(seed: string): LifeState {
  return produce(peopleLife(seed), (d) => {
    d.character.identity.genderCategory = 'man';
    d.character.identity.attractedTo = ['man'];
    d.character.identity.pronouns = { subject: 'he', object: 'him', possessive: 'his', possessivePronoun: 'his', reflexive: 'himself', verbPlural: false };
    // Nobody who has a partner of their own, or ties to anyone else.
    for (const [id, first, attractedTo] of [['leo', 'Leo', ['man']], ['ben', 'Ben', ['woman']]] as const) {
      const template = JSON.parse(JSON.stringify(d.people.frd)) as (typeof d.people)[string];
      delete template.life;
      d.people[id] = { ...template, id, name: { first, last: 'Rivera' }, identity: { ...template.identity, genderCategory: 'man', attractedTo: [...attractedTo] } };
      d.relationships[id] = { personId: id, kind: 'friend', status: 'active', affection: 85, trust: 70, memories: [], since: d.currentYear - 6 };
    }
    // Marcus is not the point of these tests.
    delete d.people.frd;
    delete d.relationships.frd;
    d.news = [];
  });
}
