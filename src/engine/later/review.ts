/**
 * The life review (L1): regrets and proud moments, written at the end of a
 * life from what actually happened in it. Every line is a template in
 * text/review.yaml that says what proves it: a person in your life (their
 * relationship to you, what is between you, whether they are alive) and/or a
 * condition on your life (flags, memories, career, family, health...). A
 * line is told only when its proof holds, so nothing is invented. Pure and
 * deterministic: the same life always has the same review, from a generator
 * of its own, so writing it never changes the life.
 */
import type { ContentBundle, ReviewTemplate } from '../../content/schemas';
import { evaluate } from '../conditions';
import { lifeTextRole } from '../lives/model';
import { weightedPick } from '../random';
import { createRng, type RngState } from '../rng';
import { renderText, TextError } from '../text';
import type { Id, LifeReview, LifeState, ReviewLine } from '../types';

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

type Who = NonNullable<ReviewTemplate['who']>;

function within(value: number, c: { gt?: number | undefined; gte?: number | undefined; lt?: number | undefined; lte?: number | undefined; eq?: number | undefined }): boolean {
  return (c.gt === undefined || value > c.gt) && (c.gte === undefined || value >= c.gte) && (c.lt === undefined || value < c.lt) && (c.lte === undefined || value <= c.lte) && (c.eq === undefined || value === c.eq);
}

/** Whether this person is who a line is about. */
export function whoFits(life: LifeState, id: Id, who: Who): boolean {
  const rel = life.relationships[id];
  const person = life.people[id];
  if (!rel || !person || rel.status === 'ended') return false;
  if (who.kinds && !who.kinds.includes(rel.kind)) return false;
  if (who.status && !who.status.includes(rel.status)) return false;
  if (who.memory !== undefined && !rel.memories.some((m) => m.tag === who.memory)) return false;
  if (who.alive !== undefined && person.alive !== who.alive) return false;
  if (who.affection && !within(rel.affection, who.affection)) return false;
  if (who.trust && !within(rel.trust, who.trust)) return false;
  return true;
}

interface Option {
  template: ReviewTemplate;
  personId?: Id;
}

/** Every line that is true of this life, with the person it is about, in a fixed order. */
export function reviewOptions(life: LifeState, templates: readonly ReviewTemplate[], content: ContentBundle): Option[] {
  const out: Option[] = [];
  const ids = Object.keys(life.relationships).sort(byId);
  for (const template of templates) {
    if (template.who === undefined) {
      if (template.when && evaluate(template.when, life, { roles: 'strict', content })) out.push({ template });
      continue;
    }
    for (const id of ids) {
      if (!whoFits(life, id, template.who)) continue;
      if (template.when && !evaluate(template.when, life, { cast: { npc: id }, roles: 'strict', content })) continue;
      out.push({ template, personId: id });
    }
  }
  return out;
}

function render(life: LifeState, option: Option, content: ContentBundle): ReviewLine | null {
  const self = { name: life.character.name, pronouns: life.character.identity.pronouns };
  const npc = option.personId === undefined ? undefined : lifeTextRole(life, option.personId, content);
  try {
    return { id: option.template.id, text: renderText(option.template.text, { roles: { self, ...(npc ? { npc } : {}) }, values: { age: life.character.age } }) };
  } catch (err) {
    if (err instanceof TextError) return null;
    throw err;
  }
}

/** Picks up to `max` lines by weight: each template once, each person at most once in the list. */
function choose(life: LifeState, options: Option[], max: number, rng: RngState, content: ContentBundle): ReviewLine[] {
  const lines: ReviewLine[] = [];
  const usedTemplates = new Set<string>();
  const usedPeople = new Set<Id>();
  let pool = options;
  while (lines.length < max && pool.length > 0) {
    const picked = weightedPick(rng, pool.map((o) => [o, o.template.weight] as const));
    pool = pool.filter((o) => o !== picked && o.template.id !== picked.template.id && !(picked.personId !== undefined && o.personId === picked.personId));
    if (usedTemplates.has(picked.template.id) || (picked.personId !== undefined && usedPeople.has(picked.personId))) continue;
    const line = render(life, picked, content);
    if (line === null) continue;
    usedTemplates.add(picked.template.id);
    if (picked.personId !== undefined) usedPeople.add(picked.personId);
    lines.push(line);
  }
  return lines;
}

/** The regrets and proud moments of a life that ended; null for a life that is still going or was set aside unfinished. */
export function writeReview(life: LifeState, content: ContentBundle): LifeReview | null {
  if (life.phase !== 'dead') return null;
  const b = content.balance.later.review;
  const rng = createRng(`${life.seed}:review:${life.currentYear}`);
  const t = content.text.review;
  return {
    regrets: choose(life, reviewOptions(life, t.regrets, content), b.maxRegrets, rng, content),
    proud: choose(life, reviewOptions(life, t.proud, content), b.maxProud, rng, content),
  };
}
