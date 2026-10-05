/**
 * Template and pronoun renderer (docs/technical.md, section M, "Text templates
 * and pronouns"). Content text uses placeholders in braces:
 *
 * - `{value}` inserts a named value, such as `{age}` or `{city}`.
 * - `{role.field}` inserts part of a person cast in a role: `name` (first
 *   name), `last`, `fullName`, or a pronoun form: `they`, `them`, `their`,
 *   `theirs`, `themself`. Capitalized forms (`{npc.They}`) start a sentence.
 *   E3: a person's own life adds `relation` (what they are to you: "sister"),
 *   `partner` (their partner's first name), `city` (where they live) and
 *   `job` (their job with its article: "an electrician"); an event may use
 *   one only when its requirements guarantee it (the content build checks).
 * - `{role:singular|plural}` picks the verb form that agrees with the role's
 *   pronouns: `{npc:is|are}`, `{self:was|were}`.
 *
 * The obituary casts the player character as `self`. The content build checks
 * every placeholder against the roles and values its template may use.
 */
import type { Pronouns } from './types';

export interface TextRole {
  name: { first: string; last: string };
  pronouns: Pronouns;
  /** E3: what they are to you ("sister", "friend"). */
  relation?: string;
  /** E3: their partner's first name, when their partner isn't on your list. */
  partner?: string;
  /** E3: the city they live in. */
  city?: string;
  /** E3: their job, with its article. */
  job?: string;
}

export interface TextContext {
  roles?: Record<string, TextRole>;
  values?: Record<string, string | number>;
}

const PRONOUN_FORMS = {
  they: 'subject',
  them: 'object',
  their: 'possessive',
  theirs: 'possessivePronoun',
  themself: 'reflexive',
} as const satisfies Record<string, keyof Pronouns>;

type PronounField = keyof typeof PRONOUN_FORMS;
const NAME_FIELDS = ['name', 'last', 'fullName'] as const;
/** E3: facts about a person's life; a role may lack them (the renderer then throws). */
export const LIFE_FIELDS = ['relation', 'partner', 'city', 'job'] as const;

export type Placeholder =
  | { kind: 'value'; raw: string; name: string }
  | { kind: 'role'; raw: string; role: string; field: string; capitalized: boolean }
  | { kind: 'verb'; raw: string; role: string; singular: string; plural: string };

export class TextError extends Error {
  override name = 'TextError';
}

const PLACEHOLDER = /\{([^{}]*)\}/g;
const IDENT = /^[a-zA-Z][a-zA-Z0-9]*$/;

function parsePlaceholder(raw: string): Placeholder {
  const body = raw.slice(1, -1);
  const colon = body.indexOf(':');
  if (colon >= 0) {
    const role = body.slice(0, colon);
    const forms = body.slice(colon + 1).split('|');
    if (!IDENT.test(role) || forms.length !== 2 || forms.some((f) => f.trim().length === 0)) {
      throw new TextError(`"${raw}" must look like {role:singular|plural}`);
    }
    return { kind: 'verb', raw, role, singular: forms[0]!, plural: forms[1]! };
  }
  const dot = body.indexOf('.');
  if (dot >= 0) {
    const role = body.slice(0, dot);
    const field = body.slice(dot + 1);
    if (!IDENT.test(role) || !IDENT.test(field)) throw new TextError(`"${raw}" must look like {role.field}`);
    const lower = field.charAt(0).toLowerCase() + field.slice(1);
    const capitalized = field !== lower && lower in PRONOUN_FORMS;
    const known = (NAME_FIELDS as readonly string[]).includes(field) || (LIFE_FIELDS as readonly string[]).includes(field) || field in PRONOUN_FORMS || capitalized;
    if (!known) throw new TextError(`"${raw}": unknown field "${field}"`);
    return { kind: 'role', raw, role, field: capitalized ? lower : field, capitalized };
  }
  if (!IDENT.test(body)) throw new TextError(`"${raw}" is not a valid placeholder`);
  return { kind: 'value', raw, name: body };
}

/** Every placeholder in a template, in order. Throws TextError for a malformed one. */
export function placeholders(template: string): Placeholder[] {
  const opens = (template.match(/\{/g) ?? []).length;
  const closes = (template.match(/\}/g) ?? []).length;
  const found = [...template.matchAll(PLACEHOLDER)].map((m) => parsePlaceholder(m[0]));
  if (opens !== found.length || closes !== found.length) throw new TextError('unbalanced braces');
  return found;
}

/**
 * Lists what is wrong with a template given the roles and values it may use
 * (empty when fine). Used by the content build.
 */
export function checkTemplate(template: string, allowed: { roles?: readonly string[]; values?: readonly string[] }): string[] {
  let found: Placeholder[];
  try {
    found = placeholders(template);
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }
  const errors: string[] = [];
  for (const p of found) {
    if (p.kind === 'value' && !allowed.values?.includes(p.name)) {
      errors.push(`${p.raw}: unknown value (allowed: ${allowed.values?.join(', ') || 'none'})`);
    }
    if (p.kind !== 'value' && !allowed.roles?.includes(p.role)) {
      errors.push(`${p.raw}: unknown role "${p.role}" (allowed: ${allowed.roles?.join(', ') || 'none'})`);
    }
  }
  return errors;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function roleField(role: TextRole, field: string): string {
  if ((LIFE_FIELDS as readonly string[]).includes(field)) {
    const value = role[field as (typeof LIFE_FIELDS)[number]];
    if (value === undefined) throw new TextError(`no ${field} for {${field}}`);
    return value;
  }
  switch (field) {
    case 'name':
      return role.name.first;
    case 'last':
      return role.name.last;
    case 'fullName':
      return `${role.name.first} ${role.name.last}`;
    default:
      return role.pronouns[PRONOUN_FORMS[field as PronounField]];
  }
}

/** Fills a template. Throws TextError for a missing role or value. */
export function renderText(template: string, context: TextContext = {}): string {
  const found = placeholders(template);
  let i = 0;
  return template.replace(PLACEHOLDER, () => {
    const p = found[i++]!;
    if (p.kind === 'value') {
      const value = context.values?.[p.name];
      if (value === undefined) throw new TextError(`no value for ${p.raw}`);
      return String(value);
    }
    const role = context.roles?.[p.role];
    if (!role) throw new TextError(`no one is cast as "${p.role}" in ${p.raw}`);
    if (p.kind === 'verb') return role.pronouns.verbPlural ? p.plural : p.singular;
    const text = roleField(role, p.field);
    return p.capitalized ? capitalize(text) : text;
  });
}
