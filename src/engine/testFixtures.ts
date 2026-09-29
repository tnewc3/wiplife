/** Shared test data for engine, store and persistence tests. */
import type { CustomLifeInput } from './creation/input';

/** A complete, valid custom character; override any part. */
export function customInput(overrides: Partial<CustomLifeInput> = {}): CustomLifeInput {
  return {
    name: { first: 'Robin', last: 'Okafor' },
    identity: {
      genderIdentity: 'genderfluid',
      genderCategory: 'nonbinary',
      genderExpression: 'androgynous',
      pronouns: {
        subject: 'xe',
        object: 'xem',
        possessive: 'xyr',
        possessivePronoun: 'xyrs',
        reflexive: 'xemself',
        verbPlural: false,
      },
      attractedTo: ['man', 'nonbinary'],
    },
    appearance: { descriptors: ['red hair', 'freckles'] },
    cityId: 'chicago',
    familyWealth: 'working',
    family: { parents: 2, siblings: 2 },
    stats: { health: 100, happiness: 0, smarts: 73, looks: 12, fitness: 50, stress: 99 },
    personality: { ambition: 0, confidence: 100, kindness: 55, riskTaking: 100, discipline: 100, sociability: 1 },
    ...overrides,
  };
}
