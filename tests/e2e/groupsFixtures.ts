/**
 * A saved adult for the Groups tests (W2): 40 years old, a faith, and (as asked)
 * a club they belong to. Built with the engine on the test content pack and
 * written into the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { cityGroups, ensureCity } from '../../src/engine/belonging/cities';
import { joinGroup } from '../../src/engine/belonging/groups';
import type { LifeState } from '../../src/engine/types';
import { familyLife } from './heirFixtures';

const pack = () => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

export interface GroupsLife {
  seed: string;
  /** Belong to a club already, as a committed member. */
  member?: boolean;
}

export function groupsLife(options: GroupsLife): LifeState {
  const content = pack();
  const base = familyLife({ seed: options.seed, kids: [], age: 40 });
  return produce(base, (d) => {
    d.belonging.faith = { id: 'buddhist', strength: 60, raised: 'buddhist', since: null, changes: 0 };
    d.belonging.household = { faith: 'buddhist', devotion: 60 };
    ensureCity(d, d.character.cityId, content);
    if (options.member) {
      const club = cityGroups(d, d.character.cityId, content).find((g) => content.groups[g.defId]!.type === 'club' && content.groups[g.defId]!.maxAge === undefined);
      if (club) joinGroup(d, club.id, 'committed', content);
    }
  });
}

/** The first club of the life's city (for the tests to look for). */
export function aClubOf(life: LifeState): { id: string; name: string } {
  const content = pack();
  const club = cityGroups(life, life.character.cityId, content).find((g) => content.groups[g.defId]!.type === 'club' && content.groups[g.defId]!.maxAge === undefined);
  if (!club) throw new Error('no club in the city');
  return { id: club.id, name: club.name };
}
