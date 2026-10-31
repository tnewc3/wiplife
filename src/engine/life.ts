import { emptyTravel } from './travel/types';
import { emptyMigration } from './migration/types';
import { birthCitizenships } from './migration/citizenship';
import { emptyLanguageLearning, householdLanguages } from './languages';
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
import { giveNeuro, rollNeuro } from './mental/neuro';
import { emptyMental } from './mental/query';
import { produce, setUseStrictIteration } from 'immer';
import { BUSINESS_ROLE, POSSESSION_ROLES, type ChoiceDef, type ContentBundle, type Outcome } from '../content/schemas';
import { evaluate } from './conditions';
import { emptySchoolLife, emptyWorkYear } from './school/state';
import {
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
import { settleEstate } from './estate/settle';
import { lineageAfter } from './estate/reputation';
import { defaultCanCarry, rollCanCarry } from './family/carrying';
import { InvalidInputError, parseCreateLifeOptions, type CreateLifeOptions } from './creation/input';
import { successChance } from './events/checks';
import { applyEffects } from './events/effects';
import { eventLanguageText, keepPossessionText, textContext } from './events/text';
import { familyHelp } from './costs';
import { moodBaseline } from './interactions/mood';
import { totalDebt } from './finance';
import { renderText } from './text';
import { runPipeline, YEAR_PIPELINE, type PipelineStep } from './pipeline';
import { weightedKey, weightedPick } from './random';
import { chance, cloneRng, createRng, pick } from './rng';
import { addHistory, writeFromGroup } from './systems/history';
import { characterDeathChance, pickCause } from './systems/mortality';
import { deadlyConditions } from './health';
import type { Character, Id, LifePhase, LifeState, Look } from './types';
import { ensureStructure } from './web/structure';
import { emptyWeb } from './web/ties';
import { emptyPossessions } from './possessions/query';
import { emptyTeen } from './teen/query';
import { emptyCrime } from './crime/query';
import { emptyFame } from './fame/query';
import { emptySports } from './sports/query';
import { emptyLeague } from './sports/league';
import { emptySetup } from './sports/setup';
import { emptyLater } from './later/query';
import { terminalDeathChance, TERMINAL_ID } from './later/terminal';
import { descriptorsMatching } from './looks/descriptors';
import { customLook, personLook, yourLook } from './looks/query';
import { emptyBelonging } from './belonging/query';
import { emptyBusiness } from './business/query';
import { emptyPastimes } from './pastimes/query';
import { emptyHub } from './hub/query';
import { emptySocial } from './social/query';
import { startBelonging } from './belonging/start';
import { citiesOfCountry, startWeights } from './country';

// A life state is plain data (no symbols, no hidden properties), so Immer can walk it with the faster Object.keys instead of Reflect.ownKeys.
setUseStrictIteration(false);

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
  let personCount = 0;
  const nextId = (): Id => `p${++personCount}`;

  let character: Character;
  let familyRequest: { parents?: 1 | 2; siblings?: number; lastName?: string; characterFirstName?: string };

  if (options.mode === 'random') {
    // W4a: a random life starts in a country by balance/countries.yaml startWeights, in one of its cities.
    // The country comes from its own generator (the seed and "country"), so choosing it draws nothing from the life's:
    // a seed that lands in the United States plays out as it did before countries existed. A random life can also be
    // asked to start in one country (the simulation does, per country).
    const country = content.countries[options.countryId ?? weightedKey(createRng(`${seed}:country`), startWeights(content))]!;
    const cityId = pick(rng, citiesOfCountry(country.id, content));
    const familyWealth = weightedKey(rng, country.familyWealth);
    const identity = rollIdentity(rng, content, rollGenderCategory(rng, content));
    // E2a: women can carry a pregnancy, men can't; a nonbinary character rolls it (only that draws a number).
    const canCarry = rollCanCarry(rng, identity.genderCategory, content);
    const stats = rollStats(rng, content);
    const personality = rollPersonality(rng, content);
    const descriptors = rollAppearance(rng, content);
    character = {
      // Named once the family (and its heritage) is known.
      languages: [],
      citizenships: [],
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
      birthCityId: cityId,
      familyWealth,
      custom: false,
      canCarry,
    };
    familyRequest = {};
  } else {
    const custom = options.custom;
    character = {
      languages: [],
      citizenships: [],
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
      birthCityId: custom.cityId,
      familyWealth: custom.familyWealth,
      custom: true,
      canCarry: custom.canCarry ?? defaultCanCarry(custom.identity.genderCategory),
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
    familyWealth: character.familyWealth,
    nextId,
    ...familyRequest,
  });
  character.name = { first: family.firstName, last: family.lastName };
  character.heritage = family.heritage;
  const caregivers = family.people.filter((p) => family.relationships.some((r) => r.personId === p.id && r.kind === "parent"));
  character.languages = householdLanguages(character.birthCityId, caregivers, birthYear, content);
  // W6: born to citizens of the country (no draws, so replays do not shift).
  character.citizenships = birthCitizenships(character.birthCityId, caregivers.map((p) => ({ citizenships: p.citizenships })), content);

  const life: LifeState = {
    id: `life_${seed}`,
    seed,
    rng,
    birthYear,
    currentYear: birthYear,
    phase: 'yearStart',
    character,
    travel: emptyTravel(),
    migration: emptyMigration(),
    languages: emptyLanguageLearning(),
    people: Object.fromEntries(family.people.map((p) => [p.id, p])),
    relationships: Object.fromEntries(family.relationships.map((r) => [r.personId, r])),
    education: { current: null, credentials: [], admission: null, left: null, applied: [], fund: 0, school: emptySchoolLife() },
    career: { job: null, gig: false, retired: false, history: [], applied: [], openings: [], work: emptyWorkYear() },
    finances: { savings: 0, debts: [], lifestyle: 'comfortable', earnings: { years: 0, total: 0, byCountry: {} }, hardshipYears: 0, dirty: 0 },
    housing: { kind: 'with_parents', cityId: character.cityId, annualCost: 0, since: birthYear },
    health: { conditions: [], mental: emptyMental() },
    legal: { record: [] },
    discovery: { surfaced: {} },
    flags: {},
    eventLog: {},
    scheduled: [],
    pending: [],
    pendingInteraction: null,
    family: { pregnancy: null, process: null, support: null, attempts: 0, lostChildren: 0, miscarriages: 0 },
    history: [],
    inputLog: [{ year: birthYear, kind: 'create', payload: structuredCloneJson(options) }],
    recap: null,
    death: null,
    lifetime: { happinessTotal: 0, years: 0 },
    will: null,
    estate: null,
    lineage: { generation: 1, lineId: `life_${seed}`, familyName: character.name.last, reputation: 50, deeds: [] },
    news: [],
    web: emptyWeb(),
    possessions: emptyPossessions(),
    teen: emptyTeen(),
    crime: emptyCrime(),
    fame: emptyFame(),
    sports: emptySports(),
    league: { ...emptyLeague(), setup: options.teamSetup ?? emptySetup() },
    later: emptyLater(),
    belonging: emptyBelonging(),
    business: emptyBusiness(),
    pastimes: emptyPastimes(),
    hobbies: {},
    hub: emptyHub(),
    social: emptySocial(),
  };
  // P1: how everyone looks (a custom character's own choices, and a roll for the rest). From generators of their own, so the life's random sequence is as it was.
  life.character.look = options.mode === 'custom' ? customLook(life, content, options.custom.look as Partial<Look> | undefined) : yourLook(life, content);
  for (const id of Object.keys(life.people).sort()) life.people[id]!.look = personLook(life, id, content);
  // A look the player chose agrees with the hair and eye text on the Profile.
  if (options.mode === 'custom' && options.custom.look) {
    life.character.appearance.descriptors = descriptorsMatching(life.character.appearance.descriptors, life.character.look, content);
  }
  // M1: ADHD and neurodivergence are inherited in part: your parents and siblings (and grandparents) may have them, and you are likelier to if a parent does.
  for (const person of Object.values(life.people)) {
    const kind = life.relationships[person.id]?.kind;
    if (kind === 'parent' || kind === 'sibling' || kind === 'grandparent') {
      const neuro = rollNeuro(life.rng, content, []);
      if (neuro.length > 0) person.neuro = neuro;
    }
  }
  const parents = Object.values(life.people).filter((p) => life.relationships[p.id]?.kind === 'parent');
  giveNeuro(life, rollNeuro(life.rng, content, parents.map((p) => p.neuro)), content);
  // E1: everyone starts the life in their baseline mood (no randomness: the yearly swing comes with the first year).
  for (const person of Object.values(life.people)) person.mood = person.moodBase = moodBaseline(life, person, content);
  // E4: the ties the family's structure gives (your parents with each other, your siblings with each other and with them).
  ensureStructure(life, life.web, life.rng, content, birthYear);
  // W2: your family's faith and your own (or the one chosen in custom creation), your values, and a hidden pull toward another faith now and then.
  // (From a generator of its own, so adding faith to a life leaves the rest of its random sequence as it was.)
  startBelonging(life, createRng(`${seed}:belonging`), content, { choice: options.mode === 'custom' ? options.custom.faith : undefined });
  return life;
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
  // E1: an outcome card still waiting for a choice has to be answered first; a finished one is just dismissed.
  if (state.pendingInteraction?.choice && state.pendingInteraction.choice.chosen === undefined) {
    throw new PhaseError('Finish the interaction first: its outcome card is waiting for a choice.');
  }
  // E2a: an unplanned pregnancy waits for its decision (the outcome card's close opens it).
  if (state.family.pregnancy?.decision === 'pending') {
    throw new PhaseError('Decide first: an unplanned pregnancy is waiting for your decision.');
  }
  const statsBefore = { ...state.character.stats };
  let next = produce(state, (draft) => {
    draft.inputLog.push({ year: draft.currentYear, kind: 'ageUp', payload: {} });
    draft.pendingInteraction = null;
    // E2b: an heir's "Previously" card is only there until their first year begins.
    delete draft.lineage.previously;
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
    // An event may already have killed the character this year. Otherwise
    // age, Health and genetic risk set the chance, and each health condition
    // adds its own; a death is put down to one of them by its share.
    const base = characterDeathChance(c.age, c.stats.health, c.hidden.geneticRisk, content);
    let deadly = [...deadlyConditions(draft, content)];
    // L1: a death you saw coming has its own chance, which rises with each year since the warning.
    // It stands in for the mortality of the condition behind it, so the illness is not counted twice.
    const foreseen = terminalDeathChance(draft as LifeState, content);
    if (foreseen > 0) {
      const behind = draft.later.terminal?.conditionId;
      if (behind !== undefined) deadly = deadly.filter(([id]) => id !== behind);
      deadly.push([TERMINAL_ID, foreseen] as const);
    }
    const total = Math.min(1, deadly.reduce((sum, [, p]) => sum + p, base));
    let causeId = draft.death?.causeId ?? null;
    if (causeId === null && chance(draft.rng, total)) {
      const from = deadly.length === 0 ? null : weightedPick(draft.rng, [[null, base] as const, ...deadly]);
      causeId =
        from === null
          ? pickCause(draft.rng, c.age, content)
          : from === TERMINAL_ID
            ? (draft.later.terminal?.causeId ?? pickCause(draft.rng, c.age, content))
            : (content.conditions[from]?.cause ?? pickCause(draft.rng, c.age, content));
    }
    draft.pending = [];
    draft.lifetime.happinessTotal += c.stats.happiness;
    draft.lifetime.years += 1;
    if (causeId !== null) {
      const cause = content.causes[causeId]?.text ?? causeId;
      writeFromGroup(draft, content.text.history.death, ['milestone', 'death'], { values: { age: c.age, cause } }, content);
      draft.death = { year: draft.currentYear, age: c.age, causeId };
      draft.phase = 'dead';
      // E2b: the estate is settled and the family's reputation updated; an heir can then carry on.
      draft.estate = settleEstate(draft as LifeState, content);
      Object.assign(draft.lineage, lineageAfter(draft as LifeState, draft.estate, content));
    } else {
      draft.phase = 'yearStart';
    }
    if (draft.recap) draft.recap.statsAfter = { ...c.stats };
  });
}

/**
 * U1: puts an outcome's money in the life log. The line goes on the history entry the event just wrote, or, when it wrote
 * none, on a new low-importance entry with the outcome's own words, so the log shows every amount with the balance after it.
 */
function logEventMoney(
  state: LifeState,
  eventId: string,
  entriesBefore: number,
  money: NonNullable<LifeState['history'][number]['money']>,
  fallbackText: string,
  content: ContentBundle,
): void {
  const mine = state.history.filter((e) => e.year === state.currentYear && e.tags.includes(eventId));
  const written = mine[mine.length - 1];
  if (mine.length > entriesBefore && written && written.money === undefined) written.money = money;
  else addHistory(state, { text: fallbackText, tags: ['event', eventId, 'money'], importance: 1, money }, content);
}

/** The choice id that resolves an event without choices (and a lost event whose definition is gone). */
export const CONTINUE_CHOICE = 'continue';

/**
 * U1, "Surprise me": the choice id that picks one of the card's visible choices at random from the life's seeded
 * generator. It is logged like any other choice (the log keeps this id, not the pick), so a replay draws the same one.
 */
export const SURPRISE_CHOICE = 'surprise';

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
  if (choiceId === SURPRISE_CHOICE) {
    if (!def?.choices) throw new InvalidInputError([{ path: 'choice', message: `Event "${instance.eventId}" has no choices to pick from.` }]);
  } else if (def?.choices) {
    choice = def.choices.find((c) => c.id === choiceId);
    if (!choice || !evaluate(choice.visibleIf, state, { cast: instance.cast, roles: 'strict', content })) {
      throw new InvalidInputError([{ path: 'choice', message: `"${choiceId}" is not a choice in event "${instance.eventId}".` }]);
    }
  } else if (choiceId !== CONTINUE_CHOICE) {
    throw new InvalidInputError([{ path: 'choice', message: `Event "${instance.eventId}" has no choices; use "${CONTINUE_CHOICE}".` }]);
  }

  return produce(state, (draft) => {
    useFastRng(draft, state);
    draft.inputLog.push({ year: draft.currentYear, kind: 'choice', payload: { instanceId, choiceId } });
    const target = draft.pending.find((p) => p.instanceId === instanceId)!;
    if (choiceId === SURPRISE_CHOICE) {
      const visible = def!.choices!.filter((c) => evaluate(c.visibleIf, draft as LifeState, { cast: instance.cast, roles: 'strict', content }));
      if (visible.length === 0) throw new InvalidInputError([{ path: 'choice', message: `Event "${instance.eventId}" has no choice to pick.` }]);
      choice = pick(draft.rng, visible);
    }
    target.resolvedChoiceId = choice?.id ?? choiceId;

    if (def) {
      let outcome: Outcome | undefined = def.autoOutcome;
      if (choice?.outcome) outcome = choice.outcome;
      else if (choice?.check) {
        outcome = chance(draft.rng, successChance(draft, choice.check, content, instance.cast)) ? choice.check.success : choice.check.failure;
      }
      if (outcome) {
        const savings = draft.finances.savings;
        const dirty = draft.finances.dirty;
        const debt = totalDebt(draft);
        const housing = draft.housing.annualCost;
        const entriesOfEvent = (draft.history as LifeState['history']).filter((e) => e.year === draft.currentYear && e.tags.includes(def.id)).length;
        const help = outcome.effects.reduce((sum, e) => sum + (e.type === 'cost' ? familyHelp(draft, e.item, content) : 0), 0);
        // E5: a possession the outcome removes is still named in its text.
        const named = def.bind ? textContext(draft, instance.cast, content, instance.since, true) : undefined;
        if (named) target.card = { title: renderText(def.title, named), text: renderText(eventLanguageText(draft, def, instance.cast, content), named) };
        // E6c: a pinned card keeps the words it was shown with (a playoff series moves on when you choose).
        const pinned = def.pin ? textContext(draft, instance.cast, content, instance.since, true) : undefined;
        if (pinned) target.card = { title: renderText(def.title, pinned), text: renderText(eventLanguageText(draft, def, instance.cast, content), pinned) };
        applyEffects(draft, outcome.effects, { def, cast: instance.cast, rng: draft.rng, content, ...(instance.since !== undefined ? { since: instance.since } : {}), ...(named ? { named } : {}) });
        // Written after the effects, so it can tell what they did ({sentence}, new pronouns).
        if (outcome.text) {
          const now = textContext(draft, instance.cast, content, instance.since);
          const base = named ? keepPossessionText(now, named) : now;
          target.outcomeText = renderText(outcome.text, pinned ? { ...base, values: { ...base.values, stage: pinned.values?.stage ?? '', opponent: pinned.values?.opponent ?? '' } } : base);
        }
        // Every money change shows on the outcome card, with the new balance (C1).
        const change = draft.finances.savings - savings;
        const debtChange = totalDebt(draft) - debt;
        const housingChange = draft.housing.annualCost - housing;
        const dirtyChange = draft.finances.dirty - dirty;
        if (change !== 0 || debtChange !== 0 || help !== 0 || housingChange !== 0 || dirtyChange !== 0) {
          target.money = {
            change,
            balance: draft.finances.savings,
            debtChange,
            ...(help !== 0 ? { familyHelp: help } : {}),
            ...(housingChange !== 0 ? { housing: { change: housingChange, annual: draft.housing.annualCost } } : {}),
            ...(dirtyChange !== 0 ? { dirty: { change: dirtyChange, balance: draft.finances.dirty } } : {}),
          };
        }
        if (change !== 0) logEventMoney(draft as LifeState, def.id, entriesOfEvent, { change, balance: draft.finances.savings }, target.outcomeText ?? renderText(def.title, textContext(draft, instance.cast, content, instance.since)), content);
      }
    }

    // E5: an event about a pet, vehicle or home you no longer have (an earlier one this year took it) doesn't happen.
    draft.pending = draft.pending.filter(
      (p) => p.resolvedChoiceId !== undefined || Object.entries(p.cast).every(([role, id]) => !(Object.values(POSSESSION_ROLES) as string[]).includes(role) || draft.possessions.items.some((q) => q.id === id)),
    );
    // W3: an event about a business you no longer have (an earlier one this year sold or closed it) doesn't happen.
    draft.pending = draft.pending.filter((p) => p.resolvedChoiceId !== undefined || p.cast[BUSINESS_ROLE] === undefined || draft.business.items.some((b) => b.id === p.cast[BUSINESS_ROLE]));
    // A management action's result stays on screen until finishAction.
    if (draft.phase === 'action') return;
    // A death, or being taken to prison, ends the year's remaining events.
    const jailed = state.housing.kind !== 'incarcerated' && draft.housing.kind === 'incarcerated';
    if (draft.death || jailed) draft.pending = draft.pending.filter((p) => p.resolvedChoiceId !== undefined);
    draft.phase = draft.pending.every((p) => p.resolvedChoiceId !== undefined) ? 'yearEnd' : 'events';
  });
}
