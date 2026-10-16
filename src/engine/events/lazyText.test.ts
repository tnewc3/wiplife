import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { countryTextValues } from '../country';
import { discoveryValues } from '../discovery';
import { sentenceText } from '../legal';
import { migrationTextValues } from '../migration/text';
import { travelValues } from '../travel/travel';
import { teenTextValues } from '../teen/text';
import { crimeTextValues } from '../crime/text';
import { fameTextValues } from '../fame/text';
import { sportsTextValues } from '../sports/text';
import { belongingTextValues } from '../belonging/text';
import { businessTextValues } from '../business/text';
import { heardFor } from '../web/knowledge';
import { ITEM_ROLE } from '../web/query';
import { lifeAtAge } from '../testFixtures';
import type { Id, LifeState } from '../types';
import { sinceText, textContext } from './text';

/** The values as they were built before they became lazy: every system's, merged in order. */
function reference(state: LifeState, cast: Record<string, Id>): Record<string, string | number> {
  const holderId = cast.npc ?? cast.person;
  return {
    ...travelValues(state, content),
    ...migrationTextValues(state, content),
    studiedLanguage: content.languages[state.languages.classId ?? '']?.name ?? '',
    ...countryTextValues(state, content),
    age: state.character.age,
    ...discoveryValues(state, content),
    sentence: sentenceText(state, content),
    since: sinceText(state, 3, content),
    heard: holderId === undefined ? '' : heardFor(state, holderId, cast[ITEM_ROLE], content),
    ...teenTextValues(state, content),
    ...crimeTextValues(state, content),
    ...fameTextValues(state, content),
    ...sportsTextValues(state, content),
    ...belongingTextValues(state, cast, content),
    ...businessTextValues(state, cast, content),
  };
}

describe('lazy text values', () => {
  const lives = [4, 16, 35, 70].flatMap((age) => ['lazy-a', 'lazy-b'].map((seed) => lifeAtAge(`${seed}-${age}`, age)));

  it('give exactly the values that merging every system gives, lazily or eagerly', () => {
    for (const life of lives) {
      const friend = Object.keys(life.relationships)[0];
      for (const cast of [{}, ...(friend ? [{ npc: friend }] : [])]) {
        const expected = reference(life, cast);
        for (const eager of [false, true]) {
          const { values } = textContext(life, cast, content, 3, eager);
          for (const [key, value] of Object.entries(expected)) expect(values![key], `${key} (${eager ? 'eager' : 'lazy'})`).toEqual(value);
          // Spreading (as the outcome text and the history do) gives the same.
          expect({ ...values }).toMatchObject(expected);
        }
      }
    }
  });

  it('let a possession name win over the system value, also when spread', () => {
    const life = lives[0]!;
    const { values } = textContext(life, {}, content);
    values!.homeCity = 'Somewhere';
    values!.petKind = 'dog';
    expect(values!.homeCity).toBe('Somewhere');
    expect({ ...values }).toMatchObject({ homeCity: 'Somewhere', petKind: 'dog' });
  });
});
