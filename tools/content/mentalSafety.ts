/**
 * The mental health safety check (M1, docs/expansion.md, writing guidance):
 * suicide and self-harm are never player choices, the game never describes
 * methods, and medication is described generally, never with doses. The
 * content build fails on:
 *
 *   choice   a choice (its label, or any outcome it leads to) that names or
 *            offers suicide or self-harm
 *   method   any text that describes a method, or gives a medication dose
 *   mention  suicide or self-harm named in an event's own text (a loss told
 *            with care, pointing toward help) without a reason in the
 *            event's `justified.safety`
 *
 * Choices and methods are never allowed; a mention is allowed only when
 * someone has reviewed it. Every other file's text is checked for methods
 * and for any mention.
 */
import type { ContentBundle, EventDef, Outcome } from '../../src/content/schemas';
import type { ContentError } from './compile';

/** Naming suicide or self-harm. */
export const SELF_HARM =
  /\b(?:suicid\w*|self[- ]?harm\w*|self[- ]?injur\w*|kill(?:ing|s)? (?:yourself|myself|himself|herself|themselves|themself)|(?:end|ending|take|taking) (?:your|my|his|her|their) (?:own )?life|end it all|(?:not|no longer) (?:be|want to be) alive|(?:don'?t|doesn'?t|didn'?t) want to (?:be alive|live)|(?:hurt|harm|cut|burn|starve|injure)(?:ing)? (?:yourself|himself|herself|themselves|themself) (?:on purpose|deliberately))\b/i;

/** Describing a method, or giving a medication dose. */
export const METHOD =
  /\b(?:noose|hang(?:ing)? (?:yourself|himself|herself|themselves)|jump(?:ing)? (?:off|from) (?:a |the )?(?:bridge|roof|building|ledge|balcony)|bottle of pills|swallow(?:ed|ing)? (?:the |all the |a handful of )?(?:pills|bottle|tablets)|lethal|razor blade|(?:\d+(?:\.\d+)?|[a-z]+) ?(?:mg|milligrams?|mcg|micrograms?)\b|(?:take|took|taking) (?:two|three|four|five|six|ten|twenty|\d+) (?:pills|tablets|capsules)|dosage|\bdoses?\b|carbon monoxide|exhaust fumes)\b/i;

interface Found {
  kind: 'choice' | 'method' | 'mention';
  where: string;
  said: string;
}

const quote = (text: string, re: RegExp) => `"${text.match(re)![0]}"`;

function outcomeTexts(outcome: Outcome | undefined): string[] {
  return [outcome?.text ?? '', ...(outcome?.effects ?? []).flatMap((e) => (e.type === 'history' ? [e.text] : []))];
}

/** What is wrong with one event's text. */
export function scanEvent(def: EventDef): Found[] {
  const out: Found[] = [];
  const method = (where: string, text: string) => {
    if (METHOD.test(text)) out.push({ kind: 'method', where, said: quote(text, METHOD) });
  };
  for (const [where, text] of [['title', def.title], ['text', def.text], ...outcomeTexts(def.autoOutcome).map((t) => ['autoOutcome', t])] as [string, string][]) {
    method(where, text);
    if (SELF_HARM.test(text)) out.push({ kind: 'mention', where, said: quote(text, SELF_HARM) });
  }
  for (const choice of def.choices ?? []) {
    const texts = [choice.label, ...outcomeTexts(choice.outcome), ...outcomeTexts(choice.check?.success), ...outcomeTexts(choice.check?.failure)];
    for (const text of texts) {
      method(`choices.${choice.id}`, text);
      // A choice's label or what it leads to must never name suicide or self-harm.
      if (SELF_HARM.test(text)) out.push({ kind: 'choice', where: `choices.${choice.id}`, said: quote(text, SELF_HARM) });
    }
  }
  return out;
}

/** Every string under a value, with its path. */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (typeof value === 'object' && value !== null) for (const [k, v] of Object.entries(value)) yield* strings(v, path === '' ? k : `${path}.${k}`);
}

/** The safety errors for the whole content. */
export function mentalSafetyErrors(bundle: ContentBundle, fileOf: (typeKey: 'events' | 'conditions', id: string) => string): ContentError[] {
  const errors: ContentError[] = [];
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const file = fileOf('events', id);
    const found = scanEvent(def);
    for (const f of found) {
      if (f.kind === 'mention' && def.justified?.safety) continue;
      const message =
        f.kind === 'choice'
          ? `${f.where}: a choice must never name or offer suicide or self-harm (${f.said})`
          : f.kind === 'method'
            ? `${f.where}: describes a method or gives a dose (${f.said}); the game never does`
            : `${f.where}: names suicide or self-harm (${f.said}); say why in justified.safety if it is a loss told with care that points toward help`;
      errors.push({ file, message: `${id}: ${message}` });
    }
    if (def.justified?.safety && !found.some((f) => f.kind === 'mention')) {
      errors.push({ file, message: `${id}: justified.safety is set, but nothing is flagged for it (remove it)` });
    }
  }
  // Everything else: methods and doses are never allowed, and a mention of suicide or self-harm has no event to justify it.
  for (const [section, value] of Object.entries({
    conditions: bundle.conditions,
    interactions: bundle.interactions,
    text: bundle.text,
    registries: bundle.registries,
    causes: bundle.causes,
    character: bundle.character,
  })) {
    for (const [path, text] of strings(value, section)) {
      const bad = METHOD.test(text) ? `describes a method or gives a dose (${quote(text, METHOD)})` : SELF_HARM.test(text) ? `names suicide or self-harm (${quote(text, SELF_HARM)})` : null;
      if (bad !== null) errors.push({ file: path.split('.').slice(0, 2).join('/'), message: `${path}: ${bad}` });
    }
  }
  return errors;
}
