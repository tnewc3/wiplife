/**
 * A saved life for the god mode tests (G1): a man of 40 attracted to men, who knows Leo (attracted to men), Ben (attracted to
 * women only) and Kit, a 16-year-old friend. Built with the engine on the test content pack and written into the app's
 * database before it loads.
 */
import { produce } from 'immer';
import type { LifeState } from '../../src/engine/types';
import { sameGenderLife } from './loveFixtures';

export function godmodeLife(seed: string): LifeState {
  return produce(sameGenderLife(seed), (d) => {
    const template = JSON.parse(JSON.stringify(d.people.leo)) as (typeof d.people)[string];
    d.people.kit = { ...template, id: 'kit', name: { first: 'Kit', last: 'Rivera' }, birthYear: d.currentYear - 16, identity: { ...template.identity, genderCategory: 'man', attractedTo: ['man'] } };
    delete d.people.kit.life;
    d.relationships.kit = { personId: 'kit', kind: 'friend', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 3 };
    d.character.stats.happiness = 40;
  });
}
