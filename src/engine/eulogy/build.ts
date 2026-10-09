/**
 * The eulogy (W1): written from the speaker's point of view out of content
 * pieces (text/eulogy.yaml), never free text. The engine decides what the
 * speaker can say, and only that: they tell memories they actually hold
 * (relationship memories), stories as they believe them (the social web's
 * holders, including twisted versions), and the moments of your life that
 * someone in their place would know. A secret they were never told can show
 * up as the thing they never knew. Their tone comes from affection and trust.
 */
import { EULOGY_MILESTONES, INTIMATE_MILESTONES, UNKNOWN_KINDS, type ContentBundle, type EulogyMilestone } from '../../content/schemas';
import { yearsText } from '../legal';
import { lifeTextRole, relationWord } from '../lives/model';
import { careerPeak } from '../obituary';
import { weightedPick } from '../random';

import { chance, nextInt, pick, type RngState } from '../rng';
import { sinceText } from '../events/text';
import { renderText, TextError, type TextRole } from '../text';
import type { Eulogy, Id, LifeState } from '../types';
import { heardAboutYou } from '../web/query';
import type { SpeakerChoice } from './speaker';
import { getSpouses } from '../selectors';

/** The people a speaker knows well enough to know about the private parts of your life. */
const FAMILY_GROUPS = ['spouse', 'child', 'elder', 'sibling'] as const;

interface Writer {
  life: LifeState;
  content: ContentBundle;
  speaker: SpeakerChoice;
  rng: RngState;
  roles: Record<string, TextRole>;
  values: Record<string, string | number>;
  pieces: string[];
}

/** Renders one piece, or null when it needs something this life does not have (a person who is gone). Records its id when used. */
function say(w: Writer, id: string, template: string, values: Record<string, string | number> = {}, roles: Record<string, TextRole> = {}): string | null {
  try {
    const text = renderText(template, { roles: { ...w.roles, ...roles }, values: { ...w.values, ...values } });
    w.pieces.push(id);
    return text;
  } catch (err) {
    if (err instanceof TextError) return null;
    throw err;
  }
}

/** One of several variants, with its id. */
function variant(w: Writer, path: string, variants: readonly string[], values?: Record<string, string | number>): string | null {
  const index = nextInt(w.rng, 0, variants.length - 1);
  return say(w, `${path}#${index}`, variants[index]!, values);
}

/** Up to `count` items, chosen at random by weight without choosing one twice. */
function chooseSome<T>(rng: RngState, items: readonly (readonly [T, number])[], count: number): T[] {
  const left = items.filter(([, weight]) => weight > 0);
  const out: T[] = [];
  while (out.length < count && left.length > 0) {
    const chosen = weightedPick(rng, left);
    out.push(chosen);
    left.splice(
      left.findIndex(([item]) => item === chosen),
      1,
    );
  }
  return out;
}

function roleOf(life: LifeState, id: Id, content: ContentBundle): TextRole | undefined {
  const person = life.people[id];
  if (!person) return undefined;
  return lifeTextRole(life, id, content) ?? { name: person.name, pronouns: person.identity.pronouns };
}

/** The moments of your life this life has, with the values their lines use. */
function milestonesOf(w: Writer): Map<EulogyMilestone, Record<string, string | number>> {
  const { life, content, speaker } = w;
  const out = new Map<EulogyMilestone, Record<string, string | number>>();
  const peak = careerPeak(life, content);
  if (peak) out.set('career', { title: peak.title, employer: peak.employer });
  const years = life.finances.earnings.years;
  if (life.career.retired && years > 0) out.set('retired', { years: yearsText(years, content) });
  const spouse = getSpouses(life).at(-1);
  if (spouse && speaker.group !== 'spouse') out.set('marriage', { partner: spouse.person.name.first });
  const ex = Object.values(life.relationships).find((r) => r.kind === 'ex' && r.wasSpouse && life.people[r.personId]);
  if (ex) out.set('divorce', { partner: life.people[ex.personId]!.name.first });
  const kids = Object.values(life.relationships).filter((r) => r.kind === 'child').length;
  if (kids > 0) {
    const t = content.text.eulogy.children;
    out.set('children', { children: kids === 1 ? t.one : t.many.replace('{n}', content.text.time.numbers[kids] ?? String(kids)) });
  }
  const prisonYears = life.legal.record.reduce((sum, r) => sum + (r.outcome === 'jail' ? (r.years ?? 0) : 0), 0);
  if (prisonYears > 0) out.set('prison', { years: yearsText(prisonYears, content) });
  if (life.finances.bankruptcyYear !== undefined) out.set('bankruptcy', { year: life.finances.bankruptcyYear });
  if (life.flags.in_recovery) out.set('recovery', {});
  const age = life.character.age;
  if (age < content.balance.aging.obituary.youngAge) out.set('tooSoon', { age });
  if (age >= content.balance.eulogy.longLifeAge) out.set('longLife', { age });
  if (life.flags.fame_famous) out.set('famous', {});
  if (life.flags.sports_hall_of_fame) out.set('hallOfFame', {});
  return out;
}

/** Whether someone in the speaker's place would know about this moment. */
function knows(w: Writer, milestone: EulogyMilestone): boolean {
  if (!INTIMATE_MILESTONES.includes(milestone)) return true;
  return (FAMILY_GROUPS as readonly string[]).includes(w.speaker.group) || w.speaker.combined >= w.content.balance.eulogy.intimateMin;
}

/** The memories the speaker holds that the eulogy has a line for, one for each memory (the latest). */
function heldMemories(w: Writer): { tag: string; year: number }[] {
  const lines = w.content.text.eulogy.memories;
  const latest = new Map<string, number>();
  for (const m of w.life.relationships[w.speaker.personId]!.memories) {
    if (lines[m.tag] && m.year >= (latest.get(m.tag) ?? -Infinity)) latest.set(m.tag, m.year);
  }
  return [...latest].map(([tag, year]) => ({ tag, year })).sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Writes the eulogy the speaker gives: an opening and the moments of your
 * life, their memories and the stories they believe, what they never knew,
 * and a closing. Deterministic for a given life and generator.
 */
export function buildEulogy(life: LifeState, content: ContentBundle, speaker: SpeakerChoice, rng: RngState): Eulogy {
  const text = content.text.eulogy;
  const bal = content.balance.eulogy;
  const rel = life.relationships[speaker.personId]!;
  const person = life.people[speaker.personId]!;
  const self: TextRole = { name: life.character.name, pronouns: life.character.identity.pronouns };
  const w: Writer = {
    life,
    content,
    speaker,
    rng,
    roles: { self, npc: roleOf(life, speaker.personId, content)! },
    values: { known: yearsText(Math.max(1, life.currentYear - rel.since), content), age: life.character.age, year: life.currentYear },
    pieces: [],
  };

  // Opening, then the moments of your life the speaker would know.
  const opening = variant(w, `opening.${speaker.group}.${speaker.tone}`, text.opening[speaker.group][speaker.tone]);
  const moments = milestonesOf(w);
  const wanted = EULOGY_MILESTONES.filter((m) => moments.has(m) && knows(w, m));
  const chosenMoments = new Set(chooseSome(rng, wanted.map((m) => [m, 1] as const), bal.length.milestones));
  const firstParagraph = [
    opening,
    ...EULOGY_MILESTONES.filter((m) => chosenMoments.has(m)).map((m) => say(w, `milestone.${m}`, text.milestones[m], moments.get(m))),
  ];

  // What they remember, and what they believe.
  const bias = bal.memoryBias[speaker.tone];
  const memories = chooseSome(
    rng,
    heldMemories(w).map((m) => [m, bias[text.memories[m.tag]!.valence]] as const),
    bal.length.memories,
  ).sort((a, b) => a.year - b.year || a.tag.localeCompare(b.tag));
  const told = memories.map((m) => say(w, `memory.${m.tag}`, text.memories[m.tag]!.line, { since: sinceText(life, m.year, content) }));
  const secondParagraph = [...(told.some((t) => t !== null) ? told : [variant(w, 'bare', text.bare)])];
  const items = heardAboutYou(life, speaker.personId).filter((item) => {
    const def = content.registries.web.kinds[item.kind as keyof typeof content.registries.web.kinds];
    return def?.versions[item.holders[speaker.personId]!.version] !== undefined;
  });
  const beliefs = chooseSome(
    rng,
    items.map((item) => [item, item.holders[speaker.personId]!.version === item.truth ? 1 : 3] as const),
    bal.length.beliefs,
  );
  for (const item of beliefs) {
    const version = item.holders[speaker.personId]!.version;
    const twisted = version !== item.truth;
    const template = twisted ? text.beliefs.twisted[version] : text.beliefs.true[item.kind];
    const other = item.other !== undefined ? roleOf(life, item.other, content) : undefined;
    if (template) secondParagraph.push(say(w, `belief.${twisted ? 'twisted' : 'true'}.${twisted ? version : item.kind}`, template, {}, other ? { other } : {}));
  }

  // What they never knew, and the closing.
  const hidden = life.web.items.filter(
    (item) =>
      item.subject === 'you' &&
      (UNKNOWN_KINDS as readonly string[]).includes(item.kind) &&
      item.holders[speaker.personId] === undefined &&
      item.other !== speaker.personId,
  );
  const unknownKinds = [...new Set(hidden.map((item) => item.kind))].sort();
  const thirdParagraph: (string | null)[] = [];
  if (unknownKinds.length > 0 && chance(rng, bal.unknownChance)) {
    const kind = pick(rng, unknownKinds) as (typeof UNKNOWN_KINDS)[number];
    thirdParagraph.push(say(w, `unknown.${kind}`, text.unknown[kind]));
  }
  thirdParagraph.push(variant(w, `closing.${speaker.tone}`, text.closing[speaker.tone]));

  const paragraphs = [firstParagraph, secondParagraph, thirdParagraph]
    .map((parts) => parts.filter((p): p is string => p !== null && p.length > 0).join(' '))
    .filter((p) => p.length > 0);
  return {
    speakerName: `${person.name.first} ${person.name.last}`,
    relation: relationWord(person, rel, content),
    group: speaker.group,
    tone: speaker.tone,
    paragraphs,
    pieces: w.pieces,
  };
}

