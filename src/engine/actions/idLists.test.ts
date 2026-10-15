import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { ACTION_IDS } from '../../content/schemas';
import { lifeAtAge } from '../testFixtures';
import { isLifeActionAvailable, LIFE_ACTION_IDS, PRISON_LIFE_ACTIONS, PRISON_PERSON_ACTIONS, TEMPORARY_STAY_BLOCKED } from './index';

describe('action allow and block lists', () => {
  it('only name actions that exist', () => {
    for (const [name, list] of [
      ['PRISON_LIFE_ACTIONS', PRISON_LIFE_ACTIONS],
      ['TEMPORARY_STAY_BLOCKED', TEMPORARY_STAY_BLOCKED],
    ] as const) {
      const unknown = list.filter((id) => !(LIFE_ACTION_IDS as readonly string[]).includes(id));
      expect(unknown, `${name} names actions that don't exist`).toEqual([]);
    }
    expect(PRISON_PERSON_ACTIONS.filter((id) => !(ACTION_IDS as readonly string[]).includes(id))).toEqual([]);
  });

  it('block a fame or sports career, and a new business or home, during a temporary stay abroad', () => {
    expect(TEMPORARY_STAY_BLOCKED).toContain('enter_fame');
    const life = lifeAtAge('stay-block', 20);
    const params = { pathId: 'music', routeId: 'open_mic' };
    expect(isLifeActionAvailable(life, 'enter_fame', params, content)).toBe(true);
    const away = produce(life, (d) => {
      d.travel.residence = { type: 'student', destinationId: 'paris', homeCityId: d.character.cityId, endYear: d.currentYear + 1, route: 'year' } as never;
    });
    expect(isLifeActionAvailable(away, 'enter_fame', params, content)).toBe(false);
  });
});
