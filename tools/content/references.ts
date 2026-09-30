import { GENDER_CATEGORIES, type CollectionKey, type ContentBundle } from '../../src/content/schemas';
import type { ContentError } from './compile';

const CREATION = 'balance/creation.yaml';

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

  return errors;
}
