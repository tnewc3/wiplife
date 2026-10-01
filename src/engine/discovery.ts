/**
 * Self-discovery rules (docs/design.md, section F; docs/technical.md,
 * Stage 9): latent traits that differ from who you seem to be, which of them
 * have surfaced, accepting them (identity effects with `fromLatent`), "try
 * it and decide" moments, inner conflict relief, hidden talents, and editing
 * your identity in the Profile sheet. The yearly self-discovery step
 * (./systems/selfDiscovery.ts), effects, actions, conditions, event text and
 * selectors all use these functions, so each rule lives in one place.
 * Numbers come from src/content/balance/discovery.yaml.
 */
import { z } from 'zod';
import {
  GENDER_CATEGORIES,
  type ContentBundle,
  type DiscoveryHistoryKey,
  type DiscoveryKind,
  type GenderCategory,
  type IdentityField,
  type LatentKind,
} from '../content/schemas';
import { pronounsFromPreset, PERSONALITY_TRAITS } from './creation/character';
import { identityInputSchema } from './creation/input';
import { eventWeight } from './events/selection';
import { clampInt, weightedPick } from './random';
import { writeFromGroup } from './systems/history';
import type { Id, LifeState, Pronouns } from './types';
import { listText } from './words';

/** True when you have a latent trait of this kind (or, for a talent, a hidden talent you haven't found). */
export function hasLatent(state: LifeState, kind: DiscoveryKind): boolean {
  const c = state.character;
  const latent = c.latent.identity;
  switch (kind) {
    case 'attraction':
      return latent?.attractedTo !== undefined;
    case 'gender':
      return latent?.genderCategory !== undefined;
    case 'expression':
      return latent?.genderExpression !== undefined;
    case 'personality':
      return c.latent.personality !== undefined && Object.keys(c.latent.personality).length > 0;
    case 'talent':
      return c.hidden.talent !== null && !c.hidden.talentDiscovered;
  }
}

/** A latent trait that has surfaced and you haven't accepted: you know, and you're holding it back. */
export function isKnown(state: LifeState, kind: LatentKind): boolean {
  return state.discovery.surfaced[kind] !== undefined && hasLatent(state, kind);
}

/** Every latent trait you know about and haven't accepted. */
export function knownKinds(state: LifeState): LatentKind[] {
  return (['attraction', 'gender', 'expression', 'personality'] as const).filter((k) => isKnown(state, k));
}

/** Records that a trait (or talent) came to the surface this year. */
export function markSurfaced(state: LifeState, kind: DiscoveryKind): void {
  const had = state.discovery.surfaced[kind];
  state.discovery.surfaced[kind] = { year: state.currentYear, times: (had?.times ?? 0) + 1 };
}

/** Removes a latent trait (it is part of who you are now, or no longer different) and its surfacing record. */
function clearLatent(state: LifeState, kind: LatentKind): void {
  const c = state.character;
  const latent = c.latent.identity;
  if (kind === 'attraction' && latent) delete latent.attractedTo;
  if (kind === 'gender' && latent) {
    delete latent.genderCategory;
    delete latent.genderIdentity;
    delete latent.pronouns;
  }
  if (kind === 'expression' && latent) delete latent.genderExpression;
  if (kind === 'personality') delete c.latent.personality;
  if (c.latent.identity && Object.keys(c.latent.identity).length === 0) delete c.latent.identity;
  delete state.discovery.surfaced[kind];
}

/** Lowers inner conflict. */
function relieve(state: LifeState, amount: number): void {
  const h = state.character.hidden;
  h.innerConflict = clampInt(h.innerConflict - amount, 0, 100);
}

/** Who someone is attracted to, in words ("men and women"), from text/discovery.yaml. */
export function peopleText(categories: readonly GenderCategory[], content: ContentBundle): string {
  const words = content.text.discovery.people;
  if (categories.length === 0) return words.nobody;
  return listText(GENDER_CATEGORIES.filter((c) => categories.includes(c)).map((c) => words[c]), content);
}

/** Your latent personality tendency in words (text/discovery.yaml traits), or '' without one. */
export function traitText(state: LifeState, content: ContentBundle): string {
  const latent = state.character.latent.personality ?? {};
  const trait = PERSONALITY_TRAITS.find((t) => latent[t] !== undefined);
  if (!trait) return '';
  const words = content.text.discovery.traits[trait];
  return latent[trait]! > state.character.personality[trait] ? words.higher : words.lower;
}

/** The usual pronouns for a gender category: its most common preset (balance/creation.yaml pronouns). */
export function defaultPronouns(content: ContentBundle, category: GenderCategory): Pronouns {
  const weights = content.balance.creation.pronouns[category];
  const id = Object.keys(weights)
    .sort()
    .reduce((best, key) => ((weights[key] ?? 0) > (weights[best] ?? 0) ? key : best));
  return pronounsFromPreset(content, id);
}

function pronounLabel(p: Pronouns): string {
  return `${p.subject}/${p.object}`;
}

function discoveryHistory(state: LifeState, key: DiscoveryHistoryKey, values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.history.discovery[key], ['discovery', key], { values }, content);
}

/** Values self-discovery event text may use: {talent}, {latentPeople}, {latentGender}, {latentExpression}, {latentTrait}. */
export function discoveryValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const c = state.character;
  const latent = c.latent.identity;
  const talent = c.hidden.talent ? content.talents[c.hidden.talent] : undefined;
  return {
    talent: talent?.noun ?? '',
    latentPeople: peopleText(latent?.attractedTo ?? c.identity.attractedTo, content),
    latentGender: latent?.genderIdentity ?? c.identity.genderIdentity,
    latentExpression: latent?.genderExpression ?? c.identity.genderExpression,
    latentTrait: traitText(state, content),
  };
}

const sameText = (a: string, b: string) => a.normalize('NFC').trim().toLowerCase() === b.normalize('NFC').trim().toLowerCase();

/**
 * An identity effect: `fromLatent` takes your latent trait for the field
 * (clearing it, easing inner conflict and writing a history entry); does
 * nothing without one. Attraction can take `withRole` (you're attracted to
 * that person's gender too); pronouns a preset id; expression free text.
 */
export function applyIdentity(state: LifeState, field: IdentityField, value: string, roleId: Id | undefined, content: ContentBundle): void {
  const c = state.character;
  const id = c.identity;
  const latent = c.latent.identity;
  const relief = content.balance.discovery.innerConflict.acceptRelief;
  switch (field) {
    case 'attraction': {
      if (value === 'withRole') {
        const person = roleId === undefined ? undefined : state.people[roleId];
        if (!person || id.attractedTo.includes(person.identity.genderCategory)) return;
        id.attractedTo = GENDER_CATEGORIES.filter((g) => g === person.identity.genderCategory || id.attractedTo.includes(g));
        const wanted = latent?.attractedTo;
        if (wanted && wanted.every((g) => id.attractedTo.includes(g))) {
          clearLatent(state, 'attraction');
          relieve(state, relief);
        }
      } else {
        if (!latent?.attractedTo) return;
        id.attractedTo = [...latent.attractedTo];
        clearLatent(state, 'attraction');
        relieve(state, relief);
      }
      discoveryHistory(state, 'attraction', { people: peopleText(id.attractedTo, content) }, content);
      return;
    }
    case 'gender': {
      if (latent?.genderCategory === undefined) return;
      id.genderCategory = latent.genderCategory;
      id.genderIdentity = latent.genderIdentity ?? content.character.identity.categories[latent.genderCategory].identities[0]!;
      clearLatent(state, 'gender');
      relieve(state, relief);
      discoveryHistory(state, 'gender', { gender: id.genderIdentity }, content);
      return;
    }
    case 'expression': {
      const next = value === 'fromLatent' ? latent?.genderExpression : value;
      if (next === undefined || sameText(next, id.genderExpression)) return;
      id.genderExpression = next;
      if (latent?.genderExpression !== undefined && sameText(latent.genderExpression, next)) {
        clearLatent(state, 'expression');
        relieve(state, relief);
      }
      discoveryHistory(state, 'expression', { expression: next }, content);
      return;
    }
    case 'pronouns': {
      const next =
        value === 'fromLatent'
          ? (latent?.pronouns as Pronouns | undefined) ?? defaultPronouns(content, latent?.genderCategory ?? id.genderCategory)
          : content.pronouns[value]
            ? pronounsFromPreset(content, value)
            : undefined;
      if (!next || pronounLabel(next) === pronounLabel(id.pronouns)) return;
      id.pronouns = next;
      discoveryHistory(state, 'pronouns', { pronouns: pronounLabel(next) }, content);
      return;
    }
    case 'personality': {
      const shift = c.latent.personality;
      if (!shift || Object.keys(shift).length === 0) return;
      const trait = traitText(state, content);
      for (const t of PERSONALITY_TRAITS) if (shift[t] !== undefined) c.personality[t] = shift[t];
      clearLatent(state, 'personality');
      relieve(state, relief);
      discoveryHistory(state, 'personality', { trait }, content);
      return;
    }
  }
}

/** You discover your hidden talent (if you have one you haven't found): its boosts apply once, with a history entry. */
export function discoverTalent(state: LifeState, content: ContentBundle): void {
  const h = state.character.hidden;
  const def = h.talent ? content.talents[h.talent] : undefined;
  if (!def || h.talentDiscovered) return;
  h.talentDiscovered = true;
  delete state.discovery.surfaced.talent;
  const c = state.character;
  for (const { key, delta } of def.boost.stats) {
    if (key in c.stats) c.stats[key as keyof typeof c.stats] = clampInt(c.stats[key as keyof typeof c.stats] + delta, 0, 100);
    else if (key in c.personality) c.personality[key as keyof typeof c.personality] = clampInt(c.personality[key as keyof typeof c.personality] + delta, 0, 100);
    else if (key === 'luck' || key === 'reputation' || key === 'vice') h[key] = clampInt(h[key] + delta, 0, 100);
  }
  discoveryHistory(state, 'talent', { talent: def.noun }, content);
}

/** Your discovered talent helps in this job track (its boost lists it). */
export function talentHelpsJob(state: LifeState, jobId: Id, content: ContentBundle): boolean {
  const h = state.character.hidden;
  return h.talentDiscovered && h.talent !== null && (content.talents[h.talent]?.boost.jobs.includes(jobId) ?? false);
}

/**
 * Queues one of these events (by weight, among those that fit now) for this
 * year, so the pacing director shows it first. Returns false when none fits.
 */
export function queueDiscoveryEvent(state: LifeState, eventIds: readonly Id[], dueYear: number, content: ContentBundle): boolean {
  const options = eventIds.flatMap((eventId) => {
    const def = content.events[eventId];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  const def = weightedPick(state.rng, options);
  if (!state.scheduled.some((s) => s.eventId === def.id && s.dueYear === dueYear)) state.scheduled.push({ eventId: def.id, dueYear, cast: {} });
  return true;
}

/** An identity edit from the Profile sheet, after validation. */
export interface IdentityEdit {
  genderCategory: GenderCategory;
  genderIdentity: string;
  genderExpression: string;
  pronouns: Pronouns;
  /** Offer a coming-out event next year (never forced). */
  comingOut: boolean;
}

const identityEditSchema = identityInputSchema.omit({ attractedTo: true }).extend({ comingOut: z.boolean() });

/** Validates and normalizes an identity edit; null when it is wrong. */
export function parseIdentityEdit(params: unknown): IdentityEdit | null {
  const result = identityEditSchema.safeParse(params);
  return result.success ? result.data : null;
}

/** The edit changes something about who you are. */
export function identityEditChanges(state: LifeState, edit: IdentityEdit): boolean {
  const id = state.character.identity;
  const p = edit.pronouns;
  return (
    edit.genderCategory !== id.genderCategory ||
    edit.genderIdentity !== id.genderIdentity ||
    edit.genderExpression !== id.genderExpression ||
    (Object.keys(p) as (keyof Pronouns)[]).some((k) => p[k] !== id.pronouns[k])
  );
}

/**
 * Edits your identity from the Profile sheet (at any age; takes effect at
 * once, so all later text uses it). An edit that matches a latent trait (the
 * gender category of a latent gender, or a latent expression) clears that
 * trait and eases inner conflict. Each change writes a history entry. Asking
 * to tell people queues a coming-out event for next year; nothing else does.
 */
export function editIdentity(state: LifeState, edit: IdentityEdit, content: ContentBundle): void {
  const id = state.character.identity;
  const latent = state.character.latent.identity;
  let matched = false;
  if (latent?.genderCategory !== undefined && latent.genderCategory === edit.genderCategory) {
    clearLatent(state, 'gender');
    matched = true;
  }
  if (latent?.genderExpression !== undefined && sameText(latent.genderExpression, edit.genderExpression)) {
    clearLatent(state, 'expression');
    matched = true;
  }
  if (edit.genderCategory !== id.genderCategory || edit.genderIdentity !== id.genderIdentity) {
    discoveryHistory(state, 'gender', { gender: edit.genderIdentity }, content);
  }
  if (edit.genderExpression !== id.genderExpression) discoveryHistory(state, 'expression', { expression: edit.genderExpression }, content);
  if (pronounLabel(edit.pronouns) !== pronounLabel(id.pronouns)) discoveryHistory(state, 'pronouns', { pronouns: pronounLabel(edit.pronouns) }, content);
  id.genderCategory = edit.genderCategory;
  id.genderIdentity = edit.genderIdentity;
  id.genderExpression = edit.genderExpression;
  id.pronouns = { ...edit.pronouns };
  if (matched) relieve(state, content.balance.discovery.innerConflict.editRelief);
  if (edit.comingOut) queueDiscoveryEvent(state, content.registries.discovery.comingOut.events, state.currentYear + 1, content);
}

/** An identity edit as the Profile sheet sends it (before validation). */
export type IdentityEditInput = z.input<typeof identityEditSchema>;

/** Problems with an identity edit, by field ("genderIdentity", "pronouns.subject"); empty when it is valid. */
export function identityEditIssues(params: unknown): Record<string, string> {
  const result = identityEditSchema.safeParse(params);
  if (result.success) return {};
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) issues[issue.path.join('.')] ??= issue.message;
  return issues;
}
