/**
 * Obituary generator, version 1 (templates from src/content/text/obituary.yaml).
 *
 * An obituary is a list of sections, each written by one entry in
 * OBITUARY_SECTIONS. To add to it (for example a career or marriage section
 * in a later stage), add its templates to the obituary content and schema,
 * and add one section here; existing sections don't change.
 */
import type { ContentBundle } from '../content/schemas';
import { createRng, pick, type RngState } from './rng';
import { getFamily, type FamilyMember } from './selectors';
import { renderText, type TextRole } from './text';
import type { LifeState } from './types';

export interface ObituaryContext {
  life: LifeState;
  content: ContentBundle;
  /** False when a new life was started before this one ended. */
  finished: boolean;
  /** A generator of its own, so writing an obituary never changes the life. */
  rng: RngState;
  self: TextRole;
  /** Picks a variant and renders it with `self` and the given values. */
  write: (variants: readonly string[], values?: Record<string, string | number>) => string | null;
  /** Joins items into "a", "a and b" or "a, b, and c". */
  list: (items: string[]) => string;
  /** Relatives in story form ("her mother Ana Ruiz"). */
  relatives: (members: FamilyMember[]) => string;
}

export interface ObituarySection {
  id: string;
  /** Returns the section's text, or null to leave it out. */
  write: (ctx: ObituaryContext) => string | null;
}

function cityName(ctx: ObituaryContext): string {
  const { cityId } = ctx.life.character;
  return ctx.content.cities[cityId]?.name ?? cityId;
}

const fullName = (m: FamilyMember) => `${m.person.name.first} ${m.person.name.last}`;

export const OBITUARY_SECTIONS: readonly ObituarySection[] = [
  {
    id: 'opening',
    write: (ctx) => {
      const { life, content } = ctx;
      const values = { age: life.character.age, year: life.currentYear, city: cityName(ctx) };
      if (!ctx.finished) return ctx.write(content.text.obituary.opening.unfinished, values);
      const causeId = life.death?.causeId ?? '';
      const cause = content.causes[causeId]?.text ?? causeId;
      return ctx.write(content.text.obituary.opening.finished, { ...values, cause });
    },
  },
  {
    id: 'origins',
    write: (ctx) => {
      const parents = getFamily(ctx.life).filter((m) => m.relationship.kind === 'parent');
      if (parents.length === 0) return null;
      return ctx.write(ctx.content.text.obituary.origins, {
        birthYear: ctx.life.birthYear,
        // Nobody moves city before Stage 6, which will record the birth city.
        birthCity: cityName(ctx),
        parents: ctx.list(parents.map(fullName)),
      });
    },
  },
  {
    id: 'survivedBy',
    write: (ctx) => {
      const alive = getFamily(ctx.life).filter((m) => m.person.alive);
      if (!ctx.finished || alive.length === 0) return null;
      return ctx.write(ctx.content.text.obituary.survivedBy, { survivors: ctx.relatives(alive) });
    },
  },
  {
    id: 'predeceasedBy',
    write: (ctx) => {
      const dead = getFamily(ctx.life).filter((m) => !m.person.alive);
      if (!ctx.finished || dead.length === 0) return null;
      return ctx.write(ctx.content.text.obituary.predeceasedBy, { predeceased: ctx.relatives(dead) });
    },
  },
  {
    id: 'mood',
    write: (ctx) => {
      const happiness = ctx.life.character.stats.happiness;
      const band = ctx.content.text.obituary.mood.find((b) => happiness >= b.minHappiness);
      return band ? ctx.write(band.variants) : null;
    },
  },
  {
    id: 'closing',
    write: (ctx) => ctx.write(ctx.finished ? ctx.content.text.obituary.closing.finished : ctx.content.text.obituary.closing.unfinished),
  },
];

/**
 * Writes the obituary for a life that has ended, or (when the life is not in
 * the dead phase) for one being set aside unfinished. Deterministic: the same
 * life always gets the same obituary.
 */
export function writeObituary(
  life: LifeState,
  content: ContentBundle,
  sections: readonly ObituarySection[] = OBITUARY_SECTIONS,
): string {
  const text = content.text.obituary;
  const rng = createRng(`${life.seed}:obituary:${life.currentYear}`);
  const self: TextRole = { name: life.character.name, pronouns: life.character.identity.pronouns };

  const list = (items: string[]): string => {
    if (items.length <= 1) return items[0] ?? '';
    if (items.length === 2) return renderText(text.list.pair, { values: { first: items[0]!, second: items[1]! } });
    return renderText(text.list.serial, {
      values: { items: items.slice(0, -1).join(text.list.separator), last: items[items.length - 1]! },
    });
  };

  const ctx: ObituaryContext = {
    life,
    content,
    finished: life.phase === 'dead',
    rng,
    self,
    write: (variants, values = {}) => (variants.length === 0 ? null : renderText(pick(rng, variants), { roles: { self }, values })),
    list,
    relatives: (members) =>
      list(
        members.flatMap((m) => {
          const words = content.text.relations[m.relationship.kind as keyof typeof content.text.relations];
          if (!words) return [];
          return [
            renderText(text.relative, {
              roles: { self, npc: { name: m.person.name, pronouns: m.person.identity.pronouns } },
              values: { relation: words[m.person.identity.genderCategory] },
            }),
          ];
        }),
      ),
  };

  return sections
    .map((section) => section.write(ctx))
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' ');
}
