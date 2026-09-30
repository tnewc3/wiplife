/**
 * Life lifecycle (docs/technical.md, section M): createLife, then each year
 * beginYear → (the player resolves pending events) → endYear.
 *
 * Phases: 'yearStart' waits for the player to age up. beginYear runs the year
 * pipeline and moves to 'events' while events are pending, or straight to
 * 'yearEnd' when none are. endYear runs the death check and returns to
 * 'yearStart', or ends the life in 'dead'. Every function returns a new state
 * and never changes the one it is given, so the game can be saved in any phase.
 */
import { produce } from 'immer';
import type { ChoiceDef, ContentBundle, Outcome } from '../content/schemas';
import { evaluate } from './conditions';
import {
  activeIds,
  completeAppearance,
  rollAppearance,
  rollGenderCategory,
  rollHidden,
  rollIdentity,
  rollLatent,
  rollPersonality,
  rollStats,
} from './creation/character';
import { generateFamily } from './creation/family';
import { InvalidInputError, parseCreateLifeOptions, type CreateLifeOptions } from './creation/input';
import { successChance } from './events/checks';
import { applyEffects } from './events/effects';
import { textContext } from './events/text';
import { renderText } from './text';
import { runPipeline, YEAR_PIPELINE, type PipelineStep } from './pipeline';
import { weightedKey } from './random';
import { chance, cloneRng, createRng, pick } from './rng';
import { writeFromGroup } from './systems/history';
import { characterDeathChance, pickCause } from './systems/mortality';
import type { Character, Id, LifePhase, LifeState } from './types';

export type { CreateLifeOptions, CustomLifeInput } from './creation/input';

/**
 * Builds a new life at age 0 from random or custom options. Deterministic:
 * the same options and content always produce the same life. The options are
 * validated (throws InvalidInputError) and recorded as the first entry of the
 * input log, so the life can be replayed.
 */
export function createLife(input: CreateLifeOptions, content: ContentBundle): LifeState {
  const options = parseCreateLifeOptions(input, content);
  const { seed, birthYear } = options;
  const rng = createRng(seed);
  const creation = content.balance.creation;

  let personCount = 0;
  const nextId = (): Id => `p${++personCount}`;

  let character: Character;
  let familyRequest: { parents?: 1 | 2; siblings?: number; lastName?: string; characterFirstName?: string };

  if (options.mode === 'random') {
    const cityId = pick(rng, activeIds(content.cities));
    const familyWealth = weightedKey(rng, creation.familyWealth);
    const identity = rollIdentity(rng, content, rollGenderCategory(rng, content));
    const stats = rollStats(rng, content);
    const personality = rollPersonality(rng, content);
    const descriptors = rollAppearance(rng, content);
    character = {
      // Named once the family (and its heritage) is known.
      name: { first: '', last: '' },
      age: 0,
      lifeStage: 'early',
      identity,
      latent: {},
      appearance: { descriptors },
      stats,
      personality,
      hidden: rollHidden(rng, content),
      cityId,
      familyWealth,
      custom: false,
    };
    familyRequest = {};
  } else {
    const custom = options.custom;
    character = {
      name: { ...custom.name },
      age: 0,
      lifeStage: 'early',
      identity: {
        ...custom.identity,
        pronouns: { ...custom.identity.pronouns },
        attractedTo: [...custom.identity.attractedTo],
      },
      latent: {},
      appearance: { descriptors: completeAppearance(rng, content, custom.appearance.descriptors) },
      stats: { ...custom.stats },
      personality: { ...custom.personality },
      hidden: rollHidden(rng, content),
      cityId: custom.cityId,
      familyWealth: custom.familyWealth,
      custom: true,
    };
    familyRequest = {
      parents: custom.family.parents,
      siblings: custom.family.siblings,
      lastName: custom.name.last,
      characterFirstName: custom.name.first,
    };
  }

  character.latent = rollLatent(rng, content, character.identity, character.personality);

  const family = generateFamily(rng, content, {
    birthYear,
    cityId: character.cityId,
    pool: namePool(content, character.cityId),
    characterCategory: character.identity.genderCategory,
    nextId,
    ...familyRequest,
  });
  character.name = { first: family.firstName, last: family.lastName };

  return {
    id: `life_${seed}`,
    seed,
    rng,
    birthYear,
    currentYear: birthYear,
    phase: 'yearStart',
    character,
    people: Object.fromEntries(family.people.map((p) => [p.id, p])),
    relationships: Object.fromEntries(family.relationships.map((r) => [r.personId, r])),
    education: { current: null, credentials: [] },
    career: { job: null, gig: false, retired: false, history: [] },
    finances: { savings: 0, debts: [], lifestyle: 'comfortable' },
    housing: { kind: 'with_parents', cityId: character.cityId, annualCost: 0 },
    health: { conditions: [] },
    legal: { record: [] },
    flags: {},
    eventLog: {},
    scheduled: [],
    pending: [],
    history: [],
    inputLog: [{ year: birthYear, kind: 'create', payload: structuredCloneJson(options) }],
    recap: null,
    death: null,
    lifetime: { happinessTotal: 0, years: 0 },
    lineage: { generation: 1 },
  };
}

function namePool(content: ContentBundle, cityId: Id) {
  const city = content.cities[cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) throw new Error(`No name pool for city "${cityId}"`);
  return pool;
}

/** A deep copy through JSON, so the input log holds plain data only. */
function structuredCloneJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** Thrown when an engine function is called in the wrong phase (for example, aging up twice). */
export class PhaseError extends Error {
  override name = 'PhaseError';
}

/**
 * Swaps the draft's generator state for a plain copy, so the many small
 * updates each draw makes skip Immer's proxy (several times faster).
 */
function useFastRng(draft: LifeState, original: LifeState): void {
  draft.rng = cloneRng(original.rng);
}

function expectPhase(state: LifeState, phase: LifePhase, action: string): void {
  if (state.phase !== phase) throw new PhaseError(`Can't ${action} in the "${state.phase}" phase (expected "${phase}").`);
}

/**
 * The player ages up: records the input, runs every year pipeline step in
 * order, and moves to 'events' (or 'yearEnd' when nothing is pending). Throws
 * PhaseError unless the life is in 'yearStart', so a year can never advance twice.
 */
export function beginYear(state: LifeState, content: ContentBundle, steps: readonly PipelineStep[] = YEAR_PIPELINE): LifeState {
  expectPhase(state, 'yearStart', 'age up');
  const statsBefore = { ...state.character.stats };
  let next = produce(state, (draft) => {
    draft.inputLog.push({ year: draft.currentYear, kind: 'ageUp', payload: {} });
  });
  // Each step gets its own draft, so a step can read the life as the earlier
  // steps left it through Immer's original() (fast) instead of the draft.
  for (const step of steps) {
    const before = next;
    next = produce(next, (draft) => {
      useFastRng(draft, before);
      runPipeline(draft, content, [step]);
    });
  }
  return produce(next, (draft) => {
    draft.recap = { year: draft.currentYear, age: draft.character.age, statsBefore, statsAfter: null };
    draft.phase = draft.pending.length > 0 ? 'events' : 'yearEnd';
  });
}

/**
 * Closes the year once every pending event is resolved: runs the death check
 * (writing the death to history) and completes the recap. Throws PhaseError
 * unless the life is in 'yearEnd'.
 */
export function endYear(state: LifeState, content: ContentBundle): LifeState {
  expectPhase(state, 'yearEnd', 'end the year');
  return produce(state, (draft) => {
    useFastRng(draft, state);
    const c = draft.character;
    // An event may already have killed the character this year.
    const causeId =
      draft.death?.causeId ??
      (chance(draft.rng, characterDeathChance(c.age, c.stats.health, c.hidden.geneticRisk, content))
        ? pickCause(draft.rng, c.age, content)
        : null);
    draft.pending = [];
    draft.lifetime.happinessTotal += c.stats.happiness;
    draft.lifetime.years += 1;
    if (causeId !== null) {
      const cause = content.causes[causeId]?.text ?? causeId;
      writeFromGroup(draft, content.text.history.death, ['milestone', 'death'], { values: { age: c.age, cause } }, content);
      draft.death = { year: draft.currentYear, age: c.age, causeId };
      draft.phase = 'dead';
    } else {
      draft.phase = 'yearStart';
    }
    if (draft.recap) draft.recap.statsAfter = { ...c.stats };
  });
}

/** The choice id that resolves an event without choices (and a lost event whose definition is gone). */
export const CONTINUE_CHOICE = 'continue';

/**
 * The player's answer to one pending event: records the input, applies the
 * choice's outcome (rolling its chance check, if any) and keeps the outcome
 * text on the instance for the event card. Events without choices take
 * CONTINUE_CHOICE. When every event is resolved the phase moves to
 * 'yearEnd'; if an outcome kills the character, the rest of the year's
 * events are dropped. In the 'action' phase (a management action's result)
 * the phase stays until finishAction. Throws PhaseError outside 'events' and
 * 'action', and InvalidInputError for an unknown, resolved or hidden choice.
 */
export function resolveChoice(state: LifeState, instanceId: Id, choiceId: Id, content: ContentBundle): LifeState {
  if (state.phase !== 'events' && state.phase !== 'action') {
    throw new PhaseError(`Can't choose in the "${state.phase}" phase (expected "events" or "action").`);
  }
  const instance = state.pending.find((p) => p.instanceId === instanceId);
  if (!instance) throw new InvalidInputError([{ path: 'choice', message: `No pending event "${instanceId}".` }]);
  if (instance.resolvedChoiceId !== undefined) throw new InvalidInputError([{ path: 'choice', message: `Event "${instanceId}" is already resolved.` }]);
  const def = content.events[instance.eventId];

  let choice: ChoiceDef | undefined;
  if (def?.choices) {
    choice = def.choices.find((c) => c.id === choiceId);
    if (!choice || !evaluate(choice.visibleIf, state, { cast: instance.cast, roles: 'strict' })) {
      throw new InvalidInputError([{ path: 'choice', message: `"${choiceId}" is not a choice in event "${instance.eventId}".` }]);
    }
  } else if (choiceId !== CONTINUE_CHOICE) {
    throw new InvalidInputError([{ path: 'choice', message: `Event "${instance.eventId}" has no choices; use "${CONTINUE_CHOICE}".` }]);
  }

  return produce(state, (draft) => {
    useFastRng(draft, state);
    draft.inputLog.push({ year: draft.currentYear, kind: 'choice', payload: { instanceId, choiceId } });
    const target = draft.pending.find((p) => p.instanceId === instanceId)!;
    target.resolvedChoiceId = choiceId;

    if (def) {
      let outcome: Outcome | undefined = def.autoOutcome;
      if (choice?.outcome) outcome = choice.outcome;
      else if (choice?.check) {
        outcome = chance(draft.rng, successChance(draft, choice.check, content, instance.cast)) ? choice.check.success : choice.check.failure;
      }
      if (outcome) {
        if (outcome.text) target.outcomeText = renderText(outcome.text, textContext(draft, instance.cast));
        applyEffects(draft, outcome.effects, { def, cast: instance.cast, rng: draft.rng, content });
      }
    }

    // A management action's result stays on screen until finishAction.
    if (draft.phase === 'action') return;
    // A death ends the year's remaining events.
    if (draft.death) draft.pending = draft.pending.filter((p) => p.resolvedChoiceId !== undefined);
    draft.phase = draft.pending.every((p) => p.resolvedChoiceId !== undefined) ? 'yearEnd' : 'events';
  });
}
