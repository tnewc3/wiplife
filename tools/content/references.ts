import {
  CAREER_HISTORY_VALUES,
  DISCOVERY_HISTORY_VALUES,
  DISCOVERY_KINDS,
  DOCTOR_RESULTS,
  HEALTH_HISTORY_VALUES,
  LATENT_KINDS,
  LEGAL_HISTORY_VALUES,
  LEGAL_TRIGGERS,
  type DiscoveryHistoryKey,
  type HealthHistoryKey,
  type LegalHistoryKey,
  WORK_RESULT_ROLES,
  WORK_RESULTS,
  type CareerHistoryKey,
  EDUCATION_HISTORY_VALUES,
  GENDER_CATEGORIES,
  TIERS,
  type ChanceModel,
  type CollectionKey,
  type ContentBundle,
  type EducationHistoryKey,
  OBITUARY_EDUCATION_KEYS,
  OBITUARY_TONES,
  type ObituaryTone,
  FAMILY_RESULT_ROLES,
  familyResults,
} from '../../src/content/schemas';
import {
  ACTION_IDS,
  CREATABLE_KINDS,
  TRIGGER_IDS,
  type Condition,
  type Effect,
  type EventDef,
  type Outcome,
} from '../../src/content/schemas';
import { ACTION_ROLE } from '../../src/engine/actions';
import { INTERACTION_ROLE } from '../../src/engine/interactions/availability';
import { referencesIn, rolesIn } from '../../src/engine/conditions';
import { CHILD_KINDS, EFFECT_KINDS, FAMILY_KINDS, isPartnerKind, isRomanceEvent, isRomanticKind } from '../../src/engine/relationships';
import { EVENT_TEXT_VALUES, SELF_ROLE } from '../../src/engine/events/text';
import { CONTINUE_CHOICE } from '../../src/engine/life';
import { checkTemplate } from '../../src/engine/text';
import type { ContentError } from './compile';
import { MONEY } from './consistency';

const CREATION = 'balance/creation.yaml';
const AGING = 'balance/aging.yaml';
const MORTALITY = 'balance/mortality.yaml';
const HISTORY = 'text/history.yaml';
const OBITUARY = 'text/obituary.yaml';
const MEMORIES = 'registries/memories.yaml';
const ACTIONS = 'registries/actions.yaml';
const TRIGGERS = 'registries/triggers.yaml';
const EDUCATION = 'balance/education.yaml';
const CAREERS = 'balance/careers.yaml';
const WORK = 'registries/work.yaml';
const HEALTH_REGISTRY = 'registries/health.yaml';
const LEGAL_REGISTRY = 'registries/legal.yaml';
const DISCOVERY_REGISTRY = 'registries/discovery.yaml';
const TARGETS = 'balance/targets.yaml';

/** The conditions a condition always requires: itself, or every part of a top-level `all`. */
function requiredParts(condition: Condition | undefined): Condition[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(requiredParts);
  return [condition];
}

/** The lowest value a comparison allows, if it has a lower bound (whole numbers). */
function lowerBound(c: { gt?: number | undefined; gte?: number | undefined; eq?: number | undefined }): number | undefined {
  const bounds = [c.gte, c.gt === undefined ? undefined : Math.floor(c.gt) + 1, c.eq].filter((b): b is number => b !== undefined);
  return bounds.length > 0 ? Math.max(...bounds) : undefined;
}

/** True when the condition always requires your age to be at least `min`. */
function requiresAge(condition: Condition | undefined, min: number): boolean {
  return requiredParts(condition).some((c) => 'age' in c && (lowerBound(c.age) ?? -Infinity) >= min);
}

/** True when the condition always requires this role to be cast (and, with `minAge`, at least that old). */
function requiresRole(condition: Condition | undefined, role: string, minAge?: number): boolean {
  return requiredParts(condition).some(
    (c) => 'role' in c && c.role === role && (minAge === undefined || (c.age !== undefined && (lowerBound(c.age) ?? -Infinity) >= minAge)),
  );
}

/**
 * Checks that content files agree with each other: every reference points at
 * something that exists, and ranges are ordered. Runs after every file has
 * passed its own schema.
 */
export function checkReferences(
  bundle: ContentBundle,
  fileOf: (typeKey: CollectionKey, id: string) => string,
  /** The events are a stand-in set (the end-to-end test pack): text that names real events isn't checked against them. */
  options: { partialEvents?: boolean } = {},
): ContentError[] {
  const errors: ContentError[] = [];
  const active = <T extends { retired?: boolean | undefined }>(record: Record<string, T>) =>
    Object.entries(record).filter(([, def]) => !def.retired);

  if (active(bundle.cities).length === 0) errors.push({ file: 'cities/', message: 'at least one active city is required' });
  if (active(bundle.talents).length === 0) errors.push({ file: 'talents/', message: 'at least one active talent is required' });

  for (const [id, city] of Object.entries(bundle.cities)) {
    const pool = bundle.names[city.countryId];
    if (!pool || pool.retired) {
      errors.push({ file: fileOf('cities', id), message: `no name pool for country "${city.countryId}" (add names/${city.countryId}.yaml)` });
    }
  }

  const creation = bundle.balance.creation;
  const countries = new Set(Object.values(bundle.cities).map((c) => c.countryId));
  for (const country of countries) {
    const pool = bundle.names[country];
    if (!pool) continue;
    for (const heritage of Object.keys(creation.names.heritageWeights)) {
      if (!pool.heritages[heritage]) {
        errors.push({ file: CREATION, message: `names.heritageWeights: heritage "${heritage}" is not in names/${country}.yaml` });
      }
    }
  }
  for (const category of GENDER_CATEGORIES) {
    for (const [presetId, weight] of Object.entries(creation.pronouns[category])) {
      const preset = bundle.pronouns[presetId];
      if (!preset) {
        errors.push({ file: CREATION, message: `pronouns.${category}: unknown pronoun preset "${presetId}"` });
      } else if (preset.retired && weight > 0) {
        errors.push({ file: CREATION, message: `pronouns.${category}: pronoun preset "${presetId}" is retired` });
      }
    }
    if (!creation.attraction[category].some((a) => a.weight > 0)) {
      errors.push({ file: CREATION, message: `attraction.${category}: needs a positive weight` });
    }
  }

  const { family, latent } = creation;
  const ordered: [string, number, number][] = [
    ['family.parentAgeAtBirth', family.parentAgeAtBirth.min, family.parentAgeAtBirth.max],
    ['family.siblingSpacing', family.siblingSpacing.min, family.siblingSpacing.max],
    ['latent.personalityShift', latent.personalityShift.min, latent.personalityShift.max],
  ];
  for (const [field, min, max] of ordered) {
    if (min > max) errors.push({ file: CREATION, message: `${field}: min (${min}) is greater than max (${max})` });
  }
  if (!family.siblingWeights.some((w) => w > 0)) {
    errors.push({ file: CREATION, message: 'family.siblingWeights: needs a positive weight' });
  }
  const maxSiblings = family.siblingWeights.length - 1;
  const youngestPossibleParent = family.parentAgeAtBirth.min + maxSiblings * family.siblingSpacing.min;
  if (youngestPossibleParent > family.parentAgeAtBirth.max) {
    errors.push({
      file: CREATION,
      message: `family: ${maxSiblings} older siblings cannot fit between parentAgeAtBirth.min and max with siblingSpacing.min`,
    });
  }

  const groupIds = bundle.character.appearance.groups.map((g) => g.id);
  const dupe = groupIds.find((id, i) => groupIds.indexOf(id) !== i);
  if (dupe) errors.push({ file: 'character/appearance.yaml', message: `duplicate group id "${dupe}"` });

  errors.push(...checkAgingAndMortality(bundle, fileOf));
  errors.push(...checkTemplates(bundle, options.partialEvents === true));
  errors.push(...checkEvents(bundle, fileOf));
  errors.push(...checkActions(bundle, fileOf));
  errors.push(...checkTriggers(bundle, fileOf));
  errors.push(...checkEducation(bundle, fileOf));
  errors.push(...checkCareers(bundle, fileOf));
  errors.push(...checkHealth(bundle, fileOf));
  errors.push(...checkLegal(bundle, fileOf));
  errors.push(...checkDiscovery(bundle, fileOf));
  errors.push(...checkInteractions(bundle, fileOf));
  errors.push(...checkFamily(bundle, fileOf, options.partialEvents === true));

  return errors;
}

function checkAgingAndMortality(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const { lifeStages } = bundle.balance.aging;
  const starts: [string, number][] = [
    ['child', lifeStages.child],
    ['teen', lifeStages.teen],
    ['youngAdult', lifeStages.youngAdult],
    ['adult', lifeStages.adult],
    ['senior', lifeStages.senior],
  ];
  for (let i = 1; i < starts.length; i++) {
    const [prev, prevAge] = starts[i - 1]!;
    const [stage, age] = starts[i]!;
    if (age <= prevAge) errors.push({ file: AGING, message: `lifeStages.${stage} (${age}) must be after ${prev} (${prevAge})` });
  }

  const mortality = bundle.balance.mortality;
  if (lifeStages.senior >= mortality.maxAge) {
    errors.push({ file: AGING, message: `lifeStages.senior must start before mortality maxAge (${mortality.maxAge})` });
  }
  if (mortality.childhood.untilAge >= mortality.maxAge) {
    errors.push({ file: MORTALITY, message: `childhood.untilAge must be below maxAge (${mortality.maxAge})` });
  }
  mortality.causes.forEach((band, i) => {
    const prev = mortality.causes[i - 1];
    if (prev && band.maxAge <= prev.maxAge) {
      errors.push({ file: MORTALITY, message: `causes[${i}].maxAge must be greater than the band before it` });
    }
    for (const [causeId, weight] of Object.entries(band.weights)) {
      const cause = bundle.causes[causeId];
      if (!cause) errors.push({ file: MORTALITY, message: `causes[${i}]: unknown cause "${causeId}"` });
      else if (cause.retired && weight > 0) errors.push({ file: fileOf('causes', causeId), message: `cause "${causeId}" is retired but still weighted` });
    }
  });
  const last = mortality.causes.at(-1);
  if (last && last.maxAge < mortality.maxAge) {
    errors.push({ file: MORTALITY, message: `the last causes band must reach maxAge (${mortality.maxAge})` });
  }
  return errors;
}

/** Every template may only use the roles and values its section provides. */
function checkTemplates(bundle: ContentBundle, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const check = (file: string, field: string, template: string, allowed: { roles?: string[]; values?: string[] }) => {
    for (const message of checkTemplate(template, allowed)) errors.push({ file, message: `${field}: ${message}` });
  };
  const all = (file: string, field: string, templates: readonly string[], allowed: { roles?: string[]; values?: string[] }) =>
    templates.forEach((t, i) => check(file, `${field}[${i}]`, t, allowed));

  const history = bundle.text.history;
  for (const [stage, group] of Object.entries(history.lifeStage)) {
    all(HISTORY, `lifeStage.${stage}.variants`, group.variants, { values: ['age'] });
  }
  all(HISTORY, 'familyDeath.variants', history.familyDeath.variants, { roles: ['npc'], values: ['relation', 'age'] });
  all(HISTORY, 'death.variants', history.death.variants, { values: ['age', 'cause'] });
  for (const [key, group] of Object.entries(history.home)) {
    const allowed = key === 'movedApart' ? { roles: ['npc'] } : { values: key === 'relocated' ? ['city', 'from'] : ['city'] };
    all(HISTORY, `home.${key}.variants`, group.variants, allowed);
  }
  for (const [key, group] of Object.entries(history.money)) all(HISTORY, `money.${key}.variants`, group.variants, {});
  for (const [key, group] of Object.entries(history.family)) all(HISTORY, `family.${key}.variants`, group.variants, { roles: ['npc'] });
  for (const [key, group] of Object.entries(history.education)) {
    all(HISTORY, `education.${key}.variants`, group.variants, { values: [...EDUCATION_HISTORY_VALUES[key as EducationHistoryKey]] });
  }
  for (const [key, group] of Object.entries(history.career)) {
    all(HISTORY, `career.${key}.variants`, group.variants, { values: [...CAREER_HISTORY_VALUES[key as CareerHistoryKey]] });
  }
  for (const [key, group] of Object.entries(history.health)) {
    all(HISTORY, `health.${key}.variants`, group.variants, { values: [...HEALTH_HISTORY_VALUES[key as HealthHistoryKey]] });
  }
  for (const [key, group] of Object.entries(history.legal)) {
    all(HISTORY, `legal.${key}.variants`, group.variants, { values: [...LEGAL_HISTORY_VALUES[key as LegalHistoryKey]] });
  }
  for (const [key, group] of Object.entries(history.discovery)) {
    all(HISTORY, `discovery.${key}.variants`, group.variants, { values: [...DISCOVERY_HISTORY_VALUES[key as DiscoveryHistoryKey]] });
  }
  const legalText = bundle.text.legal;
  for (const [key, template] of Object.entries(legalText.sentence)) {
    check('text/legal.yaml', `sentence.${key}`, template, { values: ['amount', 'years'] });
  }
  check('text/legal.yaml', 'years.one', legalText.years.one, {});
  check('text/legal.yaml', 'years.many', legalText.years.many, { values: ['n'] });
  const time = bundle.text.time.since;
  check('text/time.yaml', 'since.one', time.one, {});
  check('text/time.yaml', 'since.many', time.many, { values: ['n'] });
  check('text/time.yaml', 'since.unknown', time.unknown, {});

  const obituary = bundle.text.obituary;
  const self = ['self'];
  const toned = (field: string, group: Record<ObituaryTone, string[]>, allowed: { roles?: string[]; values?: string[] }) => {
    for (const tone of OBITUARY_TONES) all(OBITUARY, `${field}.${tone}`, group[tone], allowed);
  };
  toned('opening.finished', obituary.opening.finished, { roles: self, values: ['age', 'year', 'city', 'cause'] });
  all(OBITUARY, 'opening.unfinished', obituary.opening.unfinished, { roles: self, values: ['age', 'year', 'city'] });
  all(OBITUARY, 'origins', obituary.origins, { roles: self, values: ['birthYear', 'birthCity', 'parents'] });
  for (const key of OBITUARY_EDUCATION_KEYS) {
    all(OBITUARY, `education.${key}`, obituary.education[key], { roles: self, values: ['subject', 'license', 'degree'] });
  }
  toned('career.peak', obituary.career.peak, { roles: self, values: ['title', 'employer', 'years'] });
  all(OBITUARY, 'career.worked', obituary.career.worked, { roles: self, values: ['title', 'employer', 'years'] });
  all(OBITUARY, 'career.retired', obituary.career.retired, { roles: self, values: ['years'] });
  all(OBITUARY, 'career.never', obituary.career.never, { roles: self });
  toned('love.married', obituary.love.married, { roles: ['self', 'npc'], values: ['year'] });
  all(OBITUARY, 'love.widowed', obituary.love.widowed, { roles: ['self', 'npc'], values: ['year'] });
  all(OBITUARY, 'love.divorced', obituary.love.divorced, { roles: self, values: ['exes'] });
  all(OBITUARY, 'love.single', obituary.love.single, { roles: self });
  for (const [eventId, line] of Object.entries(obituary.moments)) {
    if (!partialEvents && !bundle.events[eventId]) errors.push({ file: OBITUARY, message: `moments.${eventId}: unknown event` });
    check(OBITUARY, `moments.${eventId}`, line, { roles: self });
  }
  for (const [flag, line] of Object.entries(obituary.deeds)) {
    if (!bundle.registries.flags.flags[flag]) errors.push({ file: OBITUARY, message: `deeds.${flag}: flag is not in registries/flags.yaml` });
    check(OBITUARY, `deeds.${flag}`, line, { roles: self });
  }
  all(OBITUARY, 'hardship.prison', obituary.hardship.prison, { roles: self, values: ['years'] });
  all(OBITUARY, 'hardship.bankrupt', obituary.hardship.bankrupt, { roles: self, values: ['year'] });
  all(OBITUARY, 'survivedBy', obituary.survivedBy, { roles: self, values: ['survivors'] });
  all(OBITUARY, 'predeceasedBy', obituary.predeceasedBy, { roles: self, values: ['predeceased'] });
  obituary.mood.forEach((band, i) => all(OBITUARY, `mood[${i}].variants`, band.variants, { roles: self }));
  toned('closing.finished', obituary.closing.finished, { roles: self });
  all(OBITUARY, 'closing.unfinished', obituary.closing.unfinished, { roles: self });
  check(OBITUARY, 'relative', obituary.relative, { roles: ['self', 'npc'], values: ['relation'] });
  check(OBITUARY, 'list.pair', obituary.list.pair, { values: ['first', 'second'] });
  for (const [tag, text] of Object.entries(bundle.registries.memories.tags)) {
    check(MEMORIES, `tags.${tag}`, text, { roles: ['npc'] });
  }
  check(OBITUARY, 'list.serial', obituary.list.serial, { values: ['items', 'last'] });
  if (!obituary.mood.some((band) => band.minHappiness === 0)) {
    errors.push({ file: OBITUARY, message: 'mood: one band must have minHappiness 0, so every character gets one' });
  }
  return errors;
}

/** Every outcome an event can produce. */
function outcomesOf(def: EventDef): Outcome[] {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

/** Every role an effect or check in this outcome uses. */
function outcomeRoles(outcome: Outcome): string[] {
  return (outcome.effects as Effect[]).flatMap((e) =>
    'role' in e && e.role !== undefined ? [e.role] : e.type === 'schedule' ? (e.cast ?? []) : [],
  );
}

/**
 * Romance events are adults only: the event must require you to be at least
 * the adult age, and every role must be an adult too (a partner, fiancé,
 * spouse, ex or potential partner, an age of at least the adult age in its
 * cast, or a { role, age } requirement).
 */
function checkRomance(def: EventDef, bundle: ContentBundle, err: (message: string) => void): void {
  if (!isRomanceEvent(def, bundle)) return;
  const { adultAge } = bundle.balance.relationships;
  if (!requiresAge(def.requires, adultAge)) {
    err(`a romance event must require { age: { gte: ${adultAge} } } in requires (adults only)`);
  }
  for (const [role, spec] of Object.entries(def.cast ?? {})) {
    const adult =
      spec.romantic === true ||
      spec.admirer === true ||
      (spec.kind !== undefined && isRomanticKind(spec.kind)) ||
      (spec.age !== undefined && spec.age.min >= adultAge) ||
      requiresRole(def.requires, role, adultAge);
    if (!adult) err(`cast.${role}: in a romance event every role must be an adult (age: { min: ${adultAge} } or a romantic kind)`);
  }
  const young = def.lifeStages.filter((stage) => stage === 'early' || stage === 'child' || stage === 'teen');
  if (young.length > 0) err(`a romance event can't be in life stages ${young.join(', ')}`);
}

/**
 * Debt and housing effects are for adults: an event that has them must
 * require the independence age, or happen only in life stages that start at
 * it or later (the engine ignores them for a child anyway).
 */
function checkAdultMoney(def: EventDef, bundle: ContentBundle, err: (message: string) => void): void {
  const used = outcomesOf(def).some((o) => (o.effects as Effect[]).some((e) => e.type === 'debt' || e.type === 'housing'));
  if (!used) return;
  const { independenceAge } = bundle.balance.economy;
  const stages = bundle.balance.aging.lifeStages;
  const start: Record<string, number> = { early: 0, ...stages };
  const adultStages = def.lifeStages.every((stage) => (start[stage] ?? 0) >= independenceAge);
  if (!requiresAge(def.requires, independenceAge) && !adultStages) {
    err(`debt and housing effects are for adults: require { age: { gte: ${independenceAge} } } or use adult life stages only`);
  }
}

/**
 * Dropping out and expulsion only happen from the dropout age: an event with
 * them must require it, or happen only in life stages that start at it or later.
 */
function checkLeavingSchool(def: EventDef, bundle: ContentBundle, err: (message: string) => void): void {
  const used = outcomesOf(def).some((o) =>
    (o.effects as Effect[]).some((e) => e.type === 'education' && (e.action === 'drop_out' || e.action === 'expel')),
  );
  if (!used) return;
  const { dropoutAge } = bundle.balance.education.school;
  const start: Record<string, number> = { early: 0, ...bundle.balance.aging.lifeStages };
  if (!requiresAge(def.requires, dropoutAge) && !def.lifeStages.every((stage) => (start[stage] ?? 0) >= dropoutAge)) {
    err(`drop_out and expel happen from the dropout age: require { age: { gte: ${dropoutAge} } } or use later life stages only`);
  }
}

/**
 * An optional role may be missing, so it may only appear in choices whose
 * visibleIf requires it (and in conditions, which fail without it).
 */
function checkOptionalRoles(def: EventDef, err: (message: string) => void): void {
  const optional = Object.entries(def.cast ?? {})
    .filter(([, spec]) => spec.optional)
    .map(([role]) => role);
  if (optional.length === 0) return;
  const mentions = (text: string, role: string) => text.includes(`{${role}.`) || text.includes(`{${role}:`);
  for (const role of optional) {
    if (mentions(def.title, role) || mentions(def.text, role)) err(`optional role "${role}" can't appear in the title or text`);
    if (def.autoOutcome && (outcomeRoles(def.autoOutcome).includes(role) || mentions(def.autoOutcome.text ?? '', role))) {
      err(`optional role "${role}" can't appear in autoOutcome`);
    }
    for (const choice of def.choices ?? []) {
      if (requiresRole(choice.visibleIf, role)) continue;
      const outcomes = choice.outcome ? [choice.outcome] : choice.check ? [choice.check.success, choice.check.failure] : [];
      const used =
        mentions(choice.label, role) ||
        outcomes.some((o) => mentions(o.text ?? '', role) || outcomeRoles(o).includes(role) || (o.effects as Effect[]).some((e) => e.type === 'history' && mentions(e.text, role))) ||
        (choice.check?.stats ?? []).some((st) => 'role' in st && st.role === role);
      if (used) err(`choices.${choice.id}: uses optional role "${role}" without visibleIf: { role: ${role} }`);
    }
  }
}

/**
 * True when `required` always implies `part` (C1, category contracts): the
 * same condition, or a narrower one of the kinds contracts use (school
 * programs, work, romance status, prison).
 */
function implies(required: Condition, part: Condition): boolean {
  if (JSON.stringify(required) === JSON.stringify(part)) return true;
  const subset = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined) => a !== undefined && b !== undefined && a.every((x) => b.includes(x));
  if ('education' in part && 'education' in required) {
    const want = part.education.program;
    const have = required.education.program;
    return want === undefined || (subset(have, want) && !have!.includes('none'));
  }
  if ('career' in part && 'career' in required) {
    const want = part.career;
    const have = required.career;
    // A job always means not retired (taking one ends retirement; retiring ends the job).
    const employed = have.employed === true || have.job !== undefined;
    if (want.employed !== undefined && !(want.employed ? employed : have.employed === false)) return false;
    if (want.retired !== undefined && !(have.retired === want.retired || (want.retired === false && employed))) return false;
    return true;
  }
  if ('romance' in part && 'romance' in required) return subset(required.romance, part.romance);
  if ('legal' in part && 'legal' in required) {
    return (part.legal.incarcerated === undefined || part.legal.incarcerated === required.legal.incarcerated) &&
      (part.legal.probation === undefined || part.legal.probation === required.legal.probation);
  }
  return false;
}

/** C1: the event requires its category's contract, part by part. */
function meetsContract(def: EventDef, contract: Condition): boolean {
  const required = requiredParts(def.requires);
  return requiredParts(contract).every((part) => required.some((r) => implies(r, part)));
}

/** Events: registries, references between events, roles and placeholders. */
function checkEvents(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const { tags } = bundle.registries.memories;
  const { flags } = bundle.registries.flags;
  const { categories } = bundle.registries.categories;
  const scheduledIds = new Set<string>();
  const actionEvents = new Set(Object.values(bundle.registries.actions.actions).flatMap((a) => a.events));
  const triggerEvents = new Set(Object.values(bundle.registries.triggers.triggers).flatMap((t) => t.events));
  const workEvents = new Set(Object.values(bundle.registries.work.results).flatMap((r) => r.events));
  const doctorEvents = new Set(Object.values(bundle.registries.health.doctor).flatMap((r) => r.events));
  const systemEvents = new Set([
    ...doctorEvents,
    ...Object.values(bundle.registries.legal.triggers).flatMap((r) => r.events),
    ...Object.values(bundle.registries.discovery.surfacing).flatMap((r) => r.events),
    ...Object.values(bundle.registries.discovery.resurfacing).flatMap((r) => r.events),
    ...bundle.registries.discovery.crisis.events,
    ...bundle.registries.discovery.comingOut.events,
    ...bundle.registries.interactions.infidelity.flirt.events,
    ...bundle.registries.interactions.infidelity.intimate.events,
    ...familyResults(bundle.registries.family).flatMap((r) => r.events),
  ]);

  for (const [id, def] of Object.entries(bundle.events)) {
    const file = fileOf('events', id);
    const err = (message: string) => errors.push({ file, message: `${id}: ${message}` });
    const roles = Object.keys(def.cast ?? {});
    // {sentence} only where a legal effect has just handed one down (checked per outcome below).
    const allowed = { roles: [...roles, SELF_ROLE], values: EVENT_TEXT_VALUES.filter((v) => v !== 'sentence') as string[] };
    const template = (field: string, text: string) => {
      for (const message of checkTemplate(text, allowed)) err(`${field}: ${message}`);
    };
    const condition = (field: string, cond: Parameters<typeof rolesIn>[0]) => {
      for (const role of rolesIn(cond)) if (!roles.includes(role)) err(`${field}: role "${role}" is not in the cast`);
      const refs = referencesIn(cond);
      for (const f of refs.flags) if (!flags[f]) err(`${field}: flag "${f}" is not in registries/flags.yaml`);
      for (const t of refs.memories) if (!tags[t]) err(`${field}: memory "${t}" is not in registries/memories.yaml`);
      for (const e of refs.events) if (!bundle.events[e]) err(`${field}: unknown event "${e}"`);
      for (const c of refs.cities) if (!bundle.cities[c]) err(`${field}: unknown city "${c}"`);
      for (const m of refs.majors) if (!bundle.majors[m]) err(`${field}: unknown major "${m}"`);
      for (const t of refs.trades) if (!bundle.trades[t]) err(`${field}: unknown trade "${t}"`);
      for (const f of refs.fields) if (!knownField(bundle, f)) err(`${field}: "${f}" is not a major, trade or grad program`);
      for (const j of refs.jobs) if (!bundle.jobs[j]) err(`${field}: unknown job "${j}"`);
      for (const c of refs.conditions) if (!bundle.conditions[c]) err(`${field}: unknown health condition "${c}"`);
    };

    if (!categories[def.category]) err(`category "${def.category}" is not in registries/categories.yaml`);
    // C1, category contracts: every event of a category requires what the category does.
    const contract = categories[def.category]?.requires;
    if (contract && !meetsContract(def, contract)) {
      err(`category "${def.category}" requires ${JSON.stringify(contract)}; add it to requires (C1, category contracts)`);
    }
    template('title', def.title);
    template('text', def.text);
    condition('requires', def.requires);
    (def.weight.modifiers ?? []).forEach((m, i) => condition(`weight.modifiers[${i}]`, m.if));
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      const kind = spec.kind;
      if ((spec.createIfMissing || spec.newChance !== undefined) && !(kind && (CREATABLE_KINDS as readonly string[]).includes(kind))) {
        err(`cast.${role}: only ${CREATABLE_KINDS.join(', ')} can be created`);
      }
      if ((spec.romantic || spec.admirer) && kind && (FAMILY_KINDS.includes(kind) || isPartnerKind(kind))) {
        err(`cast.${role}: a romantic role finds a potential partner, never family or a current partner (kind "${kind}")`);
      }
      if (role === SELF_ROLE) err(`cast.${role}: "${SELF_ROLE}" is always you in event text, so it can't be a cast role`);
      // C1, presence: nobody new joins your household, and a support role finds someone you know.
      if (spec.presence === 'household' && (spec.createIfMissing || spec.newChance !== undefined)) {
        err(`cast.${role}: presence household can't create someone new (nobody new moves in with you)`);
      }
    }
    for (const choice of def.choices ?? []) {
      if (choice.id === CONTINUE_CHOICE) err(`choice id "${CONTINUE_CHOICE}" is reserved`);
      template(`choices.${choice.id}.label`, choice.label);
      condition(`choices.${choice.id}.visibleIf`, choice.visibleIf);
      for (const stat of choice.check?.stats ?? []) {
        if ('role' in stat && !roles.includes(stat.role)) err(`choices.${choice.id}.check: role "${stat.role}" is not in the cast`);
      }
    }
    checkRomance(def, bundle, err);
    checkAdultMoney(def, bundle, err);
    checkLeavingSchool(def, bundle, err);
    checkOptionalRoles(def, err);

    let writesHistory = false;
    outcomesOf(def).forEach((outcome, i) => {
      const sentenced = (outcome.effects as Effect[]).some((e) => e.type === 'legal');
      if (outcome.text) {
        const values = [...allowed.values, ...(sentenced ? ['sentence'] : [])];
        for (const message of checkTemplate(outcome.text, { roles: allowed.roles, values })) {
          err(`outcome[${i}].text: ${message}${message.includes('{sentence}') ? ' ({sentence} needs a legal effect in the same outcome)' : ''}`);
        }
      }
      for (const effect of outcome.effects as Effect[]) {
        const where = `outcome[${i}] ${effect.type}`;
        if ('role' in effect && effect.role !== undefined && !roles.includes(effect.role)) err(`${where}: role "${effect.role}" is not in the cast`);
        if (effect.type === 'memory' && !tags[effect.tag]) err(`${where}: memory "${effect.tag}" is not in registries/memories.yaml`);
        if (effect.type === 'flag' && !flags[effect.key]) err(`${where}: flag "${effect.key}" is not in registries/flags.yaml`);
        if (effect.type === 'death' && !bundle.causes[effect.cause]) err(`${where}: unknown cause "${effect.cause}"`);
        if (effect.type === 'cost' && !bundle.balance.economy.costs[effect.item]) err(`${where}: unknown cost item "${effect.item}" (balance/economy.yaml costs)`);
        if (effect.type === 'relationship' && effect.kind && !EFFECT_KINDS.includes(effect.kind)) {
          err(`${where}: kind can only become ${EFFECT_KINDS.join(', ')}`);
        }
        if (effect.type === 'death' && (actionEvents.has(id) || workEvents.has(id) || doctorEvents.has(id))) {
          err(`${where}: a management action's result can't kill (it happens between years)`);
        }
        if (effect.type === 'job' && effect.jobId !== undefined && !bundle.jobs[effect.jobId]) err(`${where}: unknown job "${effect.jobId}"`);
        if (effect.type === 'health' && !bundle.conditions[effect.conditionId]) err(`${where}: unknown health condition "${effect.conditionId}"`);
        if (effect.type === 'legal') {
          const offense = bundle.offenses[effect.offenseId];
          if (!offense) err(`${where}: unknown offense "${effect.offenseId}"`);
          else if (effect.outcome === 'fine' && !offense.fine) err(`${where}: "${effect.offenseId}" has no fine range for a fine`);
          else if (effect.outcome === 'probation' && effect.years === undefined && !offense.probationYears) err(`${where}: "${effect.offenseId}" has no probationYears; give years`);
          else if (effect.outcome === 'jail' && effect.years === undefined && !offense.jailYears) err(`${where}: "${effect.offenseId}" has no jailYears; give years`);
        }
        if (effect.type === 'identity' && effect.field === 'pronouns' && effect.value !== 'fromLatent' && !bundle.pronouns[effect.value]) {
          err(`${where}: unknown pronoun preset "${effect.value}"`);
        }
        if (effect.type === 'history') {
          writesHistory = true;
          template(`${where}.text`, effect.text);
        }
        if (effect.type === 'schedule') {
          scheduledIds.add(effect.eventId);
          const target = bundle.events[effect.eventId];
          if (!target) err(`${where}: unknown event "${effect.eventId}"`);
          for (const role of effect.cast ?? []) {
            if (!roles.includes(role)) err(`${where}: role "${role}" is not in the cast`);
            if (target && !(role in (target.cast ?? {}))) err(`${where}: "${effect.eventId}" has no role "${role}"`);
          }
        }
      }
    });
    if (def.rarity === 'legendary' && !writesHistory) err('a legendary event must write a history entry (that is where it is recorded)');
  }

  for (const [id, def] of Object.entries(bundle.events)) {
    if (
      def.followUpOnly &&
      !def.retired &&
      !scheduledIds.has(id) &&
      !actionEvents.has(id) &&
      !triggerEvents.has(id) &&
      !workEvents.has(id) &&
      !systemEvents.has(id)
    ) {
      errors.push({ file: fileOf('events', id), message: `${id}: followUpOnly, but no event schedules it and no action or trigger uses it` });
    }
    // C1: {since} says how long ago the event that scheduled this one was.
    if (JSON.stringify(def).includes('{since}') && !(def.followUpOnly && scheduledIds.has(id))) {
      errors.push({ file: fileOf('events', id), message: `${id}: {since} is only for follow-ups another event schedules (C1)` });
    }
  }
  return errors;
}

/** Management actions: every result event exists, only happens through its action, and casts just the person acted on. */
function checkActions(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const scheduled = new Set(
    Object.values(bundle.events).flatMap((def) =>
      outcomesOf(def).flatMap((o) => (o.effects as Effect[]).flatMap((e) => (e.type === 'schedule' ? [e.eventId] : []))),
    ),
  );
  for (const actionId of ACTION_IDS) {
    const { events } = bundle.registries.actions.actions[actionId];
    if (!events.some((id) => bundle.events[id] && !bundle.events[id].retired)) {
      errors.push({ file: ACTIONS, message: `${actionId}: needs at least one active event` });
    }
    for (const id of events) {
      const def = bundle.events[id];
      if (!def) {
        errors.push({ file: ACTIONS, message: `${actionId}: unknown event "${id}"` });
        continue;
      }
      const err = (message: string) => errors.push({ file: fileOf('events', id), message: `${id}: ${message}` });
      if (!def.followUpOnly) err(`answers the "${actionId}" action, so it must be followUpOnly (it only happens when the player acts)`);
      if (scheduled.has(id)) err(`answers the "${actionId}" action, so no event may schedule it`);
      const roles = Object.keys(def.cast ?? {});
      if (roles.length !== 1 || roles[0] !== ACTION_ROLE) err(`answers the "${actionId}" action, so its cast is exactly the role "${ACTION_ROLE}"`);
    }
  }
  return errors;
}

/** Money triggers: every event exists, only happens this way (followUpOnly) and isn't a management action's result. */
function checkTriggers(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const actionEvents = new Set(Object.values(bundle.registries.actions.actions).flatMap((a) => a.events));
  for (const triggerId of TRIGGER_IDS) {
    const { events } = bundle.registries.triggers.triggers[triggerId];
    if (!events.some((id) => bundle.events[id] && !bundle.events[id].retired)) {
      errors.push({ file: TRIGGERS, message: `${triggerId}: needs at least one active event` });
    }
    for (const id of events) {
      const def = bundle.events[id];
      if (!def) {
        errors.push({ file: TRIGGERS, message: `${triggerId}: unknown event "${id}"` });
        continue;
      }
      const err = (message: string) => errors.push({ file: fileOf('events', id), message: `${id}: ${message}` });
      if (!def.followUpOnly) err(`answers the "${triggerId}" trigger, so it must be followUpOnly (it only happens when money trouble does)`);
      if (actionEvents.has(id)) err(`answers the "${triggerId}" trigger, so it can't also answer a management action`);
      const young = def.lifeStages.filter((stage) => stage === 'early' || stage === 'child' || stage === 'teen');
      if (young.length > 0) err(`money trouble is for adults: it can't be in life stages ${young.join(', ')}`);
    }
  }
  return errors;
}

/**
 * Education: the school years fit together, every trade and grad program has
 * its tuition (and every grad program an admission model), nothing in the
 * balance file points at a trade, grad program or flag that doesn't exist,
 * grad programs only name real majors, and every city names its schools.
 */
function checkEducation(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const edu = bundle.balance.education;
  const { flags } = bundle.registries.flags;
  const activeIds = <T extends { retired?: boolean | undefined }>(record: Record<string, T>) =>
    Object.entries(record)
      .filter(([, def]) => !def.retired)
      .map(([id]) => id);

  if (activeIds(bundle.majors).length === 0) errors.push({ file: 'majors/', message: 'at least one active major is required' });
  const { school } = edu;
  const highEnds = school.startAge + school.elementary + school.middle + school.high;
  if (school.dropoutAge >= highEnds) errors.push({ file: EDUCATION, message: `school.dropoutAge must be before high school ends (${highEnds})` });
  if (school.applyAge < highEnds - 1) errors.push({ file: EDUCATION, message: `school.applyAge can't be before the last year of high school (${highEnds - 1})` });
  if (bundle.balance.economy.independenceAge > highEnds) {
    errors.push({ file: EDUCATION, message: 'high school must end at or after the independence age (balance/economy.yaml), so students can take out loans' });
  }
  if (edu.college.transferCredit >= Math.min(edu.college.years.state, edu.college.years.elite)) {
    errors.push({ file: EDUCATION, message: 'college.transferCredit must leave at least one year of a bachelor’s' });
  }

  const model = (field: string, m: ChanceModel) => {
    for (const flag of Object.keys(m.flags ?? {})) if (!flags[flag]) errors.push({ file: EDUCATION, message: `${field}.flags: flag "${flag}" is not in registries/flags.yaml` });
  };
  for (const tier of TIERS) model(`admission.college.${tier}`, edu.admission.college[tier]);
  model('admission.trade', edu.admission.trade);
  model('ged.pass', edu.ged.pass);
  for (const [id, m] of Object.entries(edu.admission.grad)) {
    if (!bundle.gradPrograms[id]) errors.push({ file: EDUCATION, message: `admission.grad: unknown grad program "${id}"` });
    model(`admission.grad.${id}`, m);
  }
  for (const id of Object.keys(edu.tuition.trade)) if (!bundle.trades[id]) errors.push({ file: EDUCATION, message: `tuition.trade: unknown trade "${id}"` });
  for (const id of Object.keys(edu.tuition.grad)) if (!bundle.gradPrograms[id]) errors.push({ file: EDUCATION, message: `tuition.grad: unknown grad program "${id}"` });
  for (const id of activeIds(bundle.trades)) {
    if (edu.tuition.trade[id] === undefined) errors.push({ file: fileOf('trades', id), message: `${id}: no tuition in balance/education.yaml (tuition.trade.${id})` });
  }
  for (const id of activeIds(bundle.gradPrograms)) {
    const file = fileOf('gradPrograms', id);
    if (edu.tuition.grad[id] === undefined) errors.push({ file, message: `${id}: no tuition in balance/education.yaml (tuition.grad.${id})` });
    if (!edu.admission.grad[id]) errors.push({ file, message: `${id}: no admission model in balance/education.yaml (admission.grad.${id})` });
    for (const major of bundle.gradPrograms[id]!.majors ?? []) {
      if (!bundle.majors[major]) errors.push({ file, message: `${id}: unknown major "${major}"` });
    }
  }
  return errors;
}

/** A major, trade or grad program id (what a credential can be in). */
function knownField(bundle: ContentBundle, id: string): boolean {
  return bundle.majors[id] !== undefined || bundle.trades[id] !== undefined || bundle.gradPrograms[id] !== undefined;
}

/**
 * Careers: every job's requirements point at real majors, trades, grad
 * programs and flags, the careers balance numbers fit together, and every
 * work result event exists, only happens through its action, and casts
 * exactly the roles its result provides.
 */
function checkCareers(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const { flags } = bundle.registries.flags;
  const active = Object.entries(bundle.jobs).filter(([, def]) => !def.retired);
  if (active.length === 0) errors.push({ file: 'jobs/', message: 'at least one active job is required' });
  for (const [id, def] of Object.entries(bundle.jobs)) {
    const file = fileOf('jobs', id);
    const refs = referencesIn(def.requires);
    for (const f of refs.fields) if (!knownField(bundle, f)) errors.push({ file, message: `${id}: requires "${f}", which is not a major, trade or grad program` });
    for (const m of refs.majors) if (!bundle.majors[m]) errors.push({ file, message: `${id}: unknown major "${m}"` });
    for (const t of refs.trades) if (!bundle.trades[t]) errors.push({ file, message: `${id}: unknown trade "${t}"` });
    for (const f of refs.flags) if (!flags[f]) errors.push({ file, message: `${id}: flag "${f}" is not in registries/flags.yaml` });
    for (const c of refs.cities) if (!bundle.cities[c]) errors.push({ file, message: `${id}: unknown city "${c}"` });
    if (refs.jobs.length > 0 || refs.events.length > 0 || refs.memories.length > 0 || rolesIn(def.requires).length > 0) {
      errors.push({ file, message: `${id}: job requirements may not depend on jobs, events, memories or cast roles` });
    }
    if (new Set(def.employers).size !== def.employers.length) errors.push({ file, message: `${id}: employers must be distinct` });
  }

  const w = bundle.balance.careers.workplace;
  if (w.coworkers > w.maxCoworkers) errors.push({ file: CAREERS, message: 'workplace.coworkers must not be more than maxCoworkers' });
  if (w.bossAge.max < bundle.balance.careers.minAge) errors.push({ file: CAREERS, message: 'workplace.bossAge.max must reach minAge' });

  const scheduled = new Set(
    Object.values(bundle.events).flatMap((def) =>
      outcomesOf(def).flatMap((o) => (o.effects as Effect[]).flatMap((e) => (e.type === 'schedule' ? [e.eventId] : []))),
    ),
  );
  const elsewhere = new Set([
    ...Object.values(bundle.registries.actions.actions).flatMap((a) => a.events),
    ...Object.values(bundle.registries.triggers.triggers).flatMap((t) => t.events),
  ]);
  for (const result of WORK_RESULTS) {
    const { events } = bundle.registries.work.results[result];
    const roles = [...WORK_RESULT_ROLES[result]].sort().join(', ');
    if (!events.some((id) => bundle.events[id] && !bundle.events[id].retired)) errors.push({ file: WORK, message: `${result}: needs at least one active event` });
    for (const id of events) {
      const def = bundle.events[id];
      if (!def) {
        errors.push({ file: WORK, message: `${result}: unknown event "${id}"` });
        continue;
      }
      const err = (message: string) => errors.push({ file: fileOf('events', id), message: `${id}: ${message}` });
      if (!def.followUpOnly) err(`answers the "${result}" work result, so it must be followUpOnly`);
      if (scheduled.has(id)) err(`answers the "${result}" work result, so no event may schedule it`);
      if (elsewhere.has(id)) err(`answers the "${result}" work result, so it can't also answer another action or trigger`);
      if (Object.keys(def.cast ?? {}).sort().join(', ') !== roles) err(`answers the "${result}" work result, so its cast is exactly: ${roles || 'nobody'}`);
    }
  }
  return errors;
}

/** A registry's events: each exists and is followUpOnly (plus any extra rule). */
function checkRegistryEvents(
  bundle: ContentBundle,
  fileOf: (typeKey: CollectionKey, id: string) => string,
  file: string,
  label: string,
  events: readonly string[],
  extra: (def: EventDef, err: (message: string) => void) => void = () => undefined,
): ContentError[] {
  const errors: ContentError[] = [];
  if (!events.some((id) => bundle.events[id] && !bundle.events[id].retired)) errors.push({ file, message: `${label}: needs at least one active event` });
  for (const id of events) {
    const def = bundle.events[id];
    if (!def) {
      errors.push({ file, message: `${label}: unknown event "${id}"` });
      continue;
    }
    const err = (message: string) => errors.push({ file: fileOf('events', id), message: `${id}: ${message}` });
    if (!def.followUpOnly) err(`answers ${label}, so it must be followUpOnly`);
    extra(def, err);
  }
  return errors;
}

/** Each target names something that exists, and every active definition has one. */
function checkTargets(record: Record<string, unknown>, defs: Record<string, { retired?: boolean | undefined }>, field: string): ContentError[] {
  const errors: ContentError[] = [];
  for (const id of Object.keys(record)) if (!defs[id]) errors.push({ file: TARGETS, message: `${field}: unknown "${id}"` });
  for (const [id, def] of Object.entries(defs)) if (!def.retired && record[id] === undefined) errors.push({ file: TARGETS, message: `${field}: no target for "${id}"` });
  return errors;
}

/**
 * Health (Stage 9): conditions point at real causes and flags, doctor
 * results exist (followUpOnly, nobody cast, never a death: a visit happens
 * between years), and every condition has a target rate.
 */
function checkHealth(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const { flags } = bundle.registries.flags;
  for (const [id, def] of Object.entries(bundle.conditions)) {
    const file = fileOf('conditions', id);
    if (def.cause !== undefined && !bundle.causes[def.cause]) errors.push({ file, message: `${id}: unknown cause "${def.cause}"` });
    const refs = referencesIn(def.onset?.requires);
    for (const f of refs.flags) if (!flags[f]) errors.push({ file, message: `${id}: flag "${f}" is not in registries/flags.yaml` });
    if (rolesIn(def.onset?.requires).length > 0 || refs.memories.length > 0) errors.push({ file, message: `${id}: onset can't depend on cast roles or memories` });
  }
  for (const result of DOCTOR_RESULTS) {
    errors.push(
      ...checkRegistryEvents(bundle, fileOf, HEALTH_REGISTRY, `doctor.${result}`, bundle.registries.health.doctor[result].events, (def, err) => {
        if (Object.keys(def.cast ?? {}).length > 0) err('answers a doctor visit, so it casts nobody');
      }),
    );
  }
  errors.push(...checkTargets(bundle.balance.targets.health.conditions, bundle.conditions, 'health.conditions'));
  return errors;
}

/**
 * The law (Stage 9): legal registry events exist and are followUpOnly; the
 * first year in prison is a prison event and release and probation events
 * aren't; prison events are for adults; every offense has a target rate.
 */
function checkLegal(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const prison = (def: EventDef) => bundle.registries.categories.categories[def.category]?.prison === true;
  for (const trigger of LEGAL_TRIGGERS) {
    errors.push(
      ...checkRegistryEvents(bundle, fileOf, LEGAL_REGISTRY, `triggers.${trigger}`, bundle.registries.legal.triggers[trigger].events, (def, err) => {
        if ((trigger === 'jailed') !== prison(def)) {
          err(trigger === 'jailed' ? 'begins a prison sentence, so it must be a prison event' : `answers ${trigger}, which happens outside prison, so it can't be a prison event`);
        }
      }),
    );
  }
  for (const [id, def] of Object.entries(bundle.events)) {
    if (prison(def) && def.lifeStages.some((s) => s === 'early' || s === 'child' || s === 'teen')) {
      errors.push({ file: fileOf('events', id), message: `${id}: prison is for adults: a prison event can't be in life stages early, child or teen` });
    }
  }
  errors.push(...checkTargets(bundle.balance.targets.legal.offenses, bundle.offenses, 'legal.offenses'));
  return errors;
}

/** Self-discovery (Stage 9): registry events exist and are followUpOnly, and talents name real jobs. */
function checkDiscovery(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const r = bundle.registries.discovery;
  for (const kind of DISCOVERY_KINDS) errors.push(...checkRegistryEvents(bundle, fileOf, DISCOVERY_REGISTRY, `surfacing.${kind}`, r.surfacing[kind].events));
  for (const kind of LATENT_KINDS) errors.push(...checkRegistryEvents(bundle, fileOf, DISCOVERY_REGISTRY, `resurfacing.${kind}`, r.resurfacing[kind].events));
  errors.push(...checkRegistryEvents(bundle, fileOf, DISCOVERY_REGISTRY, 'crisis', r.crisis.events));
  errors.push(...checkRegistryEvents(bundle, fileOf, DISCOVERY_REGISTRY, 'comingOut', r.comingOut.events));
  for (const [id, talent] of Object.entries(bundle.talents)) {
    for (const job of talent.boost.jobs) if (!bundle.jobs[job]) errors.push({ file: fileOf('talents', id), message: `${id}: unknown job "${job}"` });
  }
  const t = bundle.balance.targets.lifespan.median;
  if (t.min > t.max) errors.push({ file: TARGETS, message: 'lifespan.median: min is greater than max' });
  return errors;
}

const INTERACTIONS = 'balance/interactions.yaml';
const INTERACTION_REGISTRY = 'registries/interactions.yaml';

/** An interaction's tiers that exist (great and backfire are optional). */
function tiersOf(def: ContentBundle['interactions'][string]) {
  return Object.entries(def.outcomes).flatMap(([id, tier]) => (tier ? [[id, tier] as const] : []));
}

/**
 * Interactions (E1): profiles, romance rules, references, text and money.
 * Romance interactions need an adult age (the adult age or more) for both
 * people and never include family; being intimate is romance too.
 */
function checkInteractions(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const balance = bundle.balance.interactions;
  const { tags } = bundle.registries.memories;
  const { flags } = bundle.registries.flags;
  const { adultAge } = bundle.balance.relationships;

  // Balance.
  for (const [profileId, profile] of Object.entries(balance.profiles)) {
    for (const tag of Object.keys(profile.memories)) {
      if (!tags[tag]) errors.push({ file: INTERACTIONS, message: `profiles.${profileId}.memories: "${tag}" is not in registries/memories.yaml` });
    }
  }
  const brackets = balance.wealth.salaryBrackets;
  brackets.forEach((b, i) => {
    const last = i === brackets.length - 1;
    if (last !== (b.upTo === undefined)) errors.push({ file: INTERACTIONS, message: 'wealth.salaryBrackets: only the last bracket has no upTo' });
    if (i > 0 && b.upTo !== undefined && brackets[i - 1]!.upTo !== undefined && b.upTo <= brackets[i - 1]!.upTo!) {
      errors.push({ file: INTERACTIONS, message: 'wealth.salaryBrackets: upTo must rise' });
    }
  });
  const { bands } = balance.mood;
  if (!(bands.great > bands.good && bands.good > bands.okay && bands.okay > bands.low)) {
    errors.push({ file: INTERACTIONS, message: 'mood.bands: must fall from great to low' });
  }
  const { small, medium, big } = balance.gifts.tiers;
  if (!(small.price < medium.price && medium.price < big.price)) errors.push({ file: INTERACTIONS, message: 'gifts.tiers: prices must rise from small to big' });

  // The registry.
  for (const act of ['flirt', 'intimate'] as const) {
    errors.push(
      ...checkRegistryEvents(bundle, fileOf, INTERACTION_REGISTRY, `infidelity.${act}`, bundle.registries.interactions.infidelity[act].events),
    );
  }

  for (const [id, def] of Object.entries(bundle.interactions)) {
    if (def.retired) continue;
    const file = fileOf('interactions', id);
    const err = (message: string) => errors.push({ file, message: `${id}: ${message}` });
    if (!balance.profiles[def.profile]) err(`unknown reaction profile "${def.profile}" (balance/interactions.yaml profiles)`);
    const a = def.availability;

    // Romance: adults only, never family; intimacy likewise.
    const allEffects: Effect[] = [];
    const texts: string[] = [];
    for (const [tierId, tier] of tiersOf(def)) {
      const groups = [
        { where: tierId, effects: tier.effects as Effect[], extras: tier.extras, text: tier.text },
        ...(tier.choice?.options ?? []).map((o) => ({ where: `${tierId}.${o.id}`, effects: o.effects as Effect[], extras: o.extras, text: [o.text, o.label] })),
      ];
      for (const g of groups) {
        const extras = g.extras.flatMap((x) => x.effects as Effect[]);
        const here = [...g.effects, ...extras];
        allEffects.push(...here);
        const sentenced = here.some((e) => e.type === 'legal');
        const values = sentenced ? ['age', 'sentence'] : ['age'];
        const template = (field: string, text: string) => {
          for (const message of checkTemplate(text, { roles: [INTERACTION_ROLE, SELF_ROLE], values })) err(`${tierId} ${field}: ${message}`);
        };
        for (const text of g.text) {
          template(g.where, text);
          texts.push(text);
        }
        for (const x of g.extras) {
          if (x.note) {
            template(`${g.where} note`, x.note);
            texts.push(x.note);
          }
        }
        // Money: text that talks about money needs a money change in the same part (a gift always costs money).
        const moves = here.some((e) => e.type === 'moneyFromPerson' || e.type === 'money' || e.type === 'cost');
        const said = [...g.text, ...g.extras.flatMap((x) => (x.note ? [x.note] : []))].find((t) => MONEY.test(t));
        if (said !== undefined && !moves && def.gift !== true) err(`${g.where}: mentions money ("${said.match(MONEY)![0]}") without a money effect`);
      }
      if (tier.choice) {
        const prompt = tier.choice.prompt;
        for (const message of checkTemplate(prompt, { roles: [INTERACTION_ROLE, SELF_ROLE], values: ['age'] })) err(`${tierId} choice.prompt: ${message}`);
      }
    }
    for (const [tierId, tier] of tiersOf(def)) {
      for (const o of tier.choice?.options ?? []) {
        for (const message of checkTemplate(o.label, { roles: [INTERACTION_ROLE, SELF_ROLE], values: ['age'] })) err(`${tierId} ${o.id}.label: ${message}`);
      }
    }

    const romantic = def.romance === true;
    if (def.romance === true) {
      if ((a.you.min ?? 0) < adultAge) err(`romance: availability.you.min must be at least ${adultAge} (adults only)`);
      if ((a.them.min ?? 0) < adultAge) err(`romance: availability.them.min must be at least ${adultAge} (adults only)`);
      const family = a.kinds.filter((k) => FAMILY_KINDS.includes(k));
      if (family.length > 0) err(`romance: can't be available with family (${family.join(', ')})`);
    }
    if (!romantic && allEffects.some((e) => e.type === 'infidelity' || (e.type === 'relationship' && e.kind !== undefined))) {
      err('only a romance interaction can be unfaithful or change a relationship kind');
    }
    if (allEffects.some((e) => e.type === 'relationship' && e.kind !== undefined)) err('an interaction can\'t change a relationship kind (events do that)');

    // Effects.
    for (const effect of allEffects) {
      const where = `${effect.type} effect`;
      if ('role' in effect && effect.role !== undefined && effect.role !== INTERACTION_ROLE) err(`${where}: the only role is "${INTERACTION_ROLE}"`);
      if (effect.type === 'memory' && !tags[effect.tag]) err(`${where}: memory "${effect.tag}" is not in registries/memories.yaml`);
      if (effect.type === 'flag' && !flags[effect.key]) err(`${where}: flag "${effect.key}" is not in registries/flags.yaml`);
      if (effect.type === 'health' && !bundle.conditions[effect.conditionId]) err(`${where}: unknown health condition "${effect.conditionId}"`);
      if (effect.type === 'education' && effect.action !== 'grades') err(`${where}: only grades`);
      if (effect.type === 'legal') {
        const offense = bundle.offenses[effect.offenseId];
        if (!offense) err(`${where}: unknown offense "${effect.offenseId}"`);
      }
      if (effect.type === 'history') {
        for (const message of checkTemplate(effect.text, { roles: [INTERACTION_ROLE, SELF_ROLE], values: ['age'] })) err(`history text: ${message}`);
      }
      if (effect.type === 'schedule') {
        const target = bundle.events[effect.eventId];
        if (!target) err(`${where}: unknown event "${effect.eventId}"`);
        else if (!target.followUpOnly) err(`${where}: "${effect.eventId}" must be followUpOnly`);
        for (const role of effect.cast ?? []) {
          if (role !== INTERACTION_ROLE) err(`${where}: the only role is "${INTERACTION_ROLE}"`);
          if (target && !(role in (target.cast ?? {}))) err(`${where}: "${effect.eventId}" has no role "${role}"`);
        }
      }
    }
    for (const text of texts) {
      if (/\b(he|she|him|her|his|hers)\b/i.test(text.replace(/\{[^}]*\}/g, ''))) err(`text uses a hardcoded pronoun; use placeholders: "${text.slice(0, 50)}"`);
    }

    // Conditions: the only role is the person; flags, memories, conditions exist.
    const condition = (field: string, cond: Parameters<typeof rolesIn>[0]) => {
      for (const role of rolesIn(cond)) if (role !== INTERACTION_ROLE) err(`${field}: the only role is "${INTERACTION_ROLE}" (got "${role}")`);
      const refs = referencesIn(cond);
      for (const f of refs.flags) if (!flags[f]) err(`${field}: flag "${f}" is not in registries/flags.yaml`);
      for (const t of refs.memories) if (!tags[t]) err(`${field}: memory "${t}" is not in registries/memories.yaml`);
      for (const c of refs.conditions) if (!bundle.conditions[c]) err(`${field}: unknown health condition "${c}"`);
    };
    condition('availability.requires', a.requires);
    for (const [tierId, tier] of tiersOf(def)) {
      const extraConditions = [...tier.extras, ...(tier.choice?.options ?? []).flatMap((o) => o.extras)];
      extraConditions.forEach((x, i) => condition(`${tierId} extras[${i}].if`, x.if));
    }

    if (a.status.includes('ended')) err('availability.status: "ended" people have faded out of your life');
    if (def.gift && def.intimate) err('a gift can\'t be intimate');
  }
  return errors;
}

const FAMILY_BALANCE = 'balance/family.yaml';
const FAMILY_REGISTRY = 'registries/family.yaml';

/**
 * Words that make text romantic or sexual. No event or interaction that
 * involves a child (anyone under 18 in your family) may use them: the
 * content rules say there is never romance or sexual content involving a
 * child (AGENTS.md), and the build enforces it.
 */
export const ROMANCE_WORDS =
  /\b(?:dat(?:e|es|ed|ing)|kiss\w*|romanc\w*|romantic|crush(?:es)?|boyfriend|girlfriend|sex|sexy|sexual\w*|naked|nude|flirt\w*|lover|seduc\w*|intimate|intimacy|attractive|desire)\b/i;

/** Every text an event shows (title, text, labels, outcome texts, history lines). */
function eventTexts(def: EventDef): string[] {
  const texts = [def.title, def.text];
  const outcomes = def.autoOutcome ? [def.autoOutcome] : (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
  for (const c of def.choices ?? []) texts.push(c.label);
  for (const o of outcomes) {
    if (o.text) texts.push(o.text);
    for (const e of o.effects as Effect[]) if (e.type === 'history') texts.push(e.text);
  }
  return texts;
}

/**
 * Children and parenting (E2a): the family registry's events fit their
 * results (followUpOnly, only the roles each result passes in), family effects
 * name the right kind of role, the processes start from the right events, and
 * no romance or sexual content ever involves a child: events that cast a
 * child or stepchild, and interactions available with one, can't be romance
 * and can't use romantic or sexual words.
 */
function checkFamily(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const f = bundle.balance.family;
  const err = (file: string, message: string) => errors.push({ file, message });

  // Balance.
  if (f.ivf.minAge > f.ivf.maxAge) err(FAMILY_BALANCE, 'ivf: minAge is greater than maxAge');
  if (f.surrogacy.minAge > f.surrogacy.maxAge) err(FAMILY_BALANCE, 'surrogacy: minAge is greater than maxAge');
  if (f.adoption.minAge > f.adoption.maxAge) err(FAMILY_BALANCE, 'adoption: minAge is greater than maxAge');
  const { case: weights } = f.custody;
  if (Math.abs(weights.involvement + weights.warmth + weights.housing + weights.work - 1) > 0.001) err(FAMILY_BALANCE, 'custody.case: the weights must add up to 1');
  if (!f.stepchildren.count.some((w) => w > 0)) err(FAMILY_BALANCE, 'stepchildren.count: needs a positive weight');
  if (f.parenting.words.low >= f.parenting.words.high) err(FAMILY_BALANCE, 'parenting.words: low must be below high');
  if (f.parenting.memories.low >= f.parenting.memories.high) err(FAMILY_BALANCE, 'parenting.memories: low must be below high');
  const costs = bundle.balance.economy.costs;
  for (const item of ['adoption_fee', 'adoption_placement', 'ivf_cycle', 'surrogacy_agency', 'surrogacy_balance']) {
    if (!costs[item]) err('balance/economy.yaml', `costs.${item}: the family processes need this item`);
  }
  for (const tag of ['parent_always_there', 'parent_never_around', 'parent_warm_home', 'parent_cold_home', 'parent_strict_rules', 'parent_no_rules', 'expecting_together', 'lost_a_pregnancy', 'placed_a_baby']) {
    if (!bundle.registries.memories.tags[tag]) err('registries/memories.yaml', `tags.${tag}: the family system writes this memory`);
  }

  // Registry events.
  const scheduled = new Set(
    Object.values(bundle.events).flatMap((def) => outcomesOf(def).flatMap((o) => (o.effects as Effect[]).flatMap((e) => (e.type === 'schedule' ? [e.eventId] : [])))),
  );
  const processOf = new Map<string, string>();
  for (const result of familyResults(bundle.registries.family)) {
    const roles = FAMILY_RESULT_ROLES[result.id];
    for (const id of result.events) {
      const def = bundle.events[id];
      if (!def) {
        // A stand-in event set (the test pack) answers only what it needs to.
        if (!partialEvents) err(FAMILY_REGISTRY, `${result.where}: unknown event "${id}"`);
        continue;
      }
      const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
      if (!def.followUpOnly) e(`answers ${result.where}, so it must be followUpOnly`);
      if (scheduled.has(id)) e(`answers ${result.where}, so no event may schedule it`);
      const cast = def.cast ?? {};
      for (const role of Object.keys(cast)) if (!(roles.allowed as readonly string[]).includes(role)) e(`answers ${result.where}, so its cast can only be: ${roles.allowed.join(', ') || 'nobody'} (not "${role}")`);
      for (const role of roles.required) if (!(role in cast) || cast[role]!.optional) e(`answers ${result.where}, so it must cast "${role}" (not optional)`);
      if (result.id === 'childDeath' !== Object.values(cast).some((c) => c.deceased === true) && result.id === 'childDeath') e('a child\'s death casts the child as a deceased role');
      if (result.where.endsWith('.start')) processOf.set(id, result.where.split('.')[0]!);
    }
  }
  for (const eventId of bundle.registries.family.decision) {
    const def = bundle.events[eventId];
    if (!def) continue;
    // Always all three choices, written neutrally.
    const choices = (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
    for (const choice of ['keep', 'adoption', 'end'] as const) {
      const offered = (def.choices ?? []).some((c) => {
        const outs = c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : [];
        return !c.visibleIf && outs.length > 0 && outs.every((o) => (o.effects as Effect[]).some((x) => x.type === 'pregnancy' && x.action === 'decide' && x.choice === choice));
      });
      if (!offered) err(fileOf('events', eventId), `${eventId}: an unplanned pregnancy always offers all three choices, and "${choice}" is missing (or hidden)`);
    }
    void choices;
  }

  // Effects name the right kind of role; processes start from their own events.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    const kindOf = (role: string) => def.cast?.[role]?.kind;
    for (const outcome of outcomesOf(def)) {
      for (const effect of outcome.effects as Effect[]) {
        if ((effect.type === 'parenting' || effect.type === 'childStat' || effect.type === 'childTrait') && !(kindOf(effect.role) && CHILD_KINDS.includes(kindOf(effect.role)!))) {
          e(`${effect.type} effect: role "${effect.role}" must be cast as a child or stepchild`);
        }
        if (effect.type === 'custody' && kindOf(effect.role) !== 'ex') e(`custody effect: role "${effect.role}" must be cast as an ex`);
        if (effect.type === 'process' && processOf.get(id) !== effect.process) e(`process effect: only the ${effect.process} start event in registries/family.yaml may start it`);
        if (effect.type === 'pregnancy' && effect.action === 'decide' && !bundle.registries.family.decision.includes(id)) e('pregnancy decide effects belong to the unplanned pregnancy event in registries/family.yaml');
      }
    }
    // A pregnancy effect or a cost the processes use must sit in an event that can happen.
  }

  // No romance or sexual content involving a child.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const childRoles = Object.entries(def.cast ?? {}).filter(([, spec]) => spec.kind !== undefined && CHILD_KINDS.includes(spec.kind));
    if (childRoles.length === 0) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    if (isRomanceEvent(def, bundle)) e('involves a child, so it can\'t be a romance event: there is never romance or sexual content involving a child');
    for (const text of eventTexts(def)) {
      const hit = text.match(ROMANCE_WORDS);
      if (hit) e(`involves a child but uses romantic or sexual wording ("${hit[0]}"): there is never romance or sexual content involving a child`);
    }
  }
  for (const [id, def] of Object.entries(bundle.interactions)) {
    if (def.retired || !def.availability.kinds.some((k) => CHILD_KINDS.includes(k))) continue;
    const e = (message: string) => err(fileOf('interactions', id), `${id}: ${message}`);
    if (def.romance || def.intimate) e('is available with a child, so it can\'t be romance: never romance or sexual content involving a child');
    for (const tier of Object.values(def.outcomes)) {
      if (!tier) continue;
      const texts = [...tier.text, ...(tier.choice ? [tier.choice.prompt, ...tier.choice.options.flatMap((o) => [o.label, o.text])] : []), ...tier.extras.flatMap((x) => (x.note ? [x.note] : []))];
      for (const text of texts) {
        const hit = text.match(ROMANCE_WORDS);
        if (hit) e(`is available with a child but uses romantic or sexual wording ("${hit[0]}")`);
      }
    }
  }
  return errors;
}
