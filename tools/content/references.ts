import { GENDER_CATEGORIES, type CollectionKey, type ContentBundle } from '../../src/content/schemas';
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
import { referencesIn, rolesIn } from '../../src/engine/conditions';
import { EFFECT_KINDS, FAMILY_KINDS, isPartnerKind, isRomanceEvent, isRomanticKind } from '../../src/engine/relationships';
import { EVENT_TEXT_VALUES } from '../../src/engine/events/text';
import { CONTINUE_CHOICE } from '../../src/engine/life';
import { checkTemplate } from '../../src/engine/text';
import type { ContentError } from './compile';

const CREATION = 'balance/creation.yaml';
const AGING = 'balance/aging.yaml';
const MORTALITY = 'balance/mortality.yaml';
const HISTORY = 'text/history.yaml';
const OBITUARY = 'text/obituary.yaml';
const MEMORIES = 'registries/memories.yaml';
const ACTIONS = 'registries/actions.yaml';
const TRIGGERS = 'registries/triggers.yaml';

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
  errors.push(...checkTemplates(bundle));
  errors.push(...checkEvents(bundle, fileOf));
  errors.push(...checkActions(bundle, fileOf));
  errors.push(...checkTriggers(bundle, fileOf));

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
function checkTemplates(bundle: ContentBundle): ContentError[] {
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

  const obituary = bundle.text.obituary;
  const self = ['self'];
  all(OBITUARY, 'opening.finished', obituary.opening.finished, { roles: self, values: ['age', 'year', 'city', 'cause'] });
  all(OBITUARY, 'opening.unfinished', obituary.opening.unfinished, { roles: self, values: ['age', 'year', 'city'] });
  all(OBITUARY, 'origins', obituary.origins, { roles: self, values: ['birthYear', 'birthCity', 'parents'] });
  all(OBITUARY, 'survivedBy', obituary.survivedBy, { roles: self, values: ['survivors'] });
  all(OBITUARY, 'predeceasedBy', obituary.predeceasedBy, { roles: self, values: ['predeceased'] });
  obituary.mood.forEach((band, i) => all(OBITUARY, `mood[${i}].variants`, band.variants, { roles: self }));
  all(OBITUARY, 'closing.finished', obituary.closing.finished, { roles: self });
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
  if (obituary.opening.finished.length === 0 || obituary.opening.unfinished.length === 0) {
    errors.push({ file: OBITUARY, message: 'opening: finished and unfinished each need at least one variant' });
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

/** Events: registries, references between events, roles and placeholders. */
function checkEvents(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  const { tags } = bundle.registries.memories;
  const { flags } = bundle.registries.flags;
  const { categories } = bundle.registries.categories;
  const scheduledIds = new Set<string>();
  const actionEvents = new Set(Object.values(bundle.registries.actions.actions).flatMap((a) => a.events));
  const triggerEvents = new Set(Object.values(bundle.registries.triggers.triggers).flatMap((t) => t.events));

  for (const [id, def] of Object.entries(bundle.events)) {
    const file = fileOf('events', id);
    const err = (message: string) => errors.push({ file, message: `${id}: ${message}` });
    const roles = Object.keys(def.cast ?? {});
    const allowed = { roles, values: [...EVENT_TEXT_VALUES] as string[] };
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
    };

    if (!categories[def.category]) err(`category "${def.category}" is not in registries/categories.yaml`);
    template('title', def.title);
    template('text', def.text);
    condition('requires', def.requires);
    (def.weight.modifiers ?? []).forEach((m, i) => condition(`weight.modifiers[${i}]`, m.if));
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      const kind = spec.kind;
      if ((spec.createIfMissing || spec.newChance !== undefined) && !(kind && (CREATABLE_KINDS as readonly string[]).includes(kind))) {
        err(`cast.${role}: only ${CREATABLE_KINDS.join(', ')} can be created`);
      }
      if (spec.romantic && kind && (FAMILY_KINDS.includes(kind) || isPartnerKind(kind))) {
        err(`cast.${role}: a romantic role finds a potential partner, never family or a current partner (kind "${kind}")`);
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
    checkOptionalRoles(def, err);

    let writesHistory = false;
    outcomesOf(def).forEach((outcome, i) => {
      if (outcome.text) template(`outcome[${i}].text`, outcome.text);
      for (const effect of outcome.effects as Effect[]) {
        const where = `outcome[${i}] ${effect.type}`;
        if ('role' in effect && effect.role !== undefined && !roles.includes(effect.role)) err(`${where}: role "${effect.role}" is not in the cast`);
        if (effect.type === 'memory' && !tags[effect.tag]) err(`${where}: memory "${effect.tag}" is not in registries/memories.yaml`);
        if (effect.type === 'flag' && !flags[effect.key]) err(`${where}: flag "${effect.key}" is not in registries/flags.yaml`);
        if (effect.type === 'death' && !bundle.causes[effect.cause]) err(`${where}: unknown cause "${effect.cause}"`);
        if (effect.type === 'relationship' && effect.kind && !EFFECT_KINDS.includes(effect.kind)) {
          err(`${where}: kind can only become ${EFFECT_KINDS.join(', ')}`);
        }
        if (effect.type === 'death' && actionEvents.has(id)) err(`${where}: a management action's result can't kill (it happens between years)`);
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
    if (def.followUpOnly && !def.retired && !scheduledIds.has(id) && !actionEvents.has(id) && !triggerEvents.has(id)) {
      errors.push({ file: fileOf('events', id), message: `${id}: followUpOnly, but no event schedules it and no action or trigger uses it` });
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
