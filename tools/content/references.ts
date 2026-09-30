import { GENDER_CATEGORIES, type CollectionKey, type ContentBundle } from '../../src/content/schemas';
import { checkTemplate } from '../../src/engine/text';
import type { ContentError } from './compile';

const CREATION = 'balance/creation.yaml';
const AGING = 'balance/aging.yaml';
const MORTALITY = 'balance/mortality.yaml';
const HISTORY = 'text/history.yaml';
const OBITUARY = 'text/obituary.yaml';

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
  check(OBITUARY, 'list.serial', obituary.list.serial, { values: ['items', 'last'] });
  if (!obituary.mood.some((band) => band.minHappiness === 0)) {
    errors.push({ file: OBITUARY, message: 'mood: one band must have minHappiness 0, so every character gets one' });
  }
  if (obituary.opening.finished.length === 0 || obituary.opening.unfinished.length === 0) {
    errors.push({ file: OBITUARY, message: 'opening: finished and unfinished each need at least one variant' });
  }
  return errors;
}
