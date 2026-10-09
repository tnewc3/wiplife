/**
 * Obituary generator, version 2 (Stage 10; templates from
 * src/content/text/obituary.yaml).
 *
 * An obituary is a list of sections, each written by one entry in
 * OBITUARY_SECTIONS: how the life ended, where it began, school, work,
 * marriage, its notable moments (legendary events first) and deeds, hard
 * chapters, family, mood and a closing line. Tone-matched sections pick their
 * phrasing by the life's tone (lifeTone): bright, mixed or heavy. To add to
 * it, add templates to the obituary content and schema, and one section here;
 * existing sections don't change.
 */
import type { ContentBundle, ObituaryEducationKey, ObituaryTone } from '../content/schemas';
import { yearsText } from './legal';
import { createRng, pick, type RngState } from './rng';
import { getFamily, getSpouses, type FamilyMember } from './selectors';
import { renderText, type TextRole } from './text';
import { listText } from './words';
import type { LifeState } from './types';

export interface ObituaryContext {
  life: LifeState;
  content: ContentBundle;
  /** False when a new life was started before this one ended. */
  finished: boolean;
  /** How the life went, for tone-matched phrasing. */
  tone: ObituaryTone;
  /** A generator of its own, so writing an obituary never changes the life. */
  rng: RngState;
  self: TextRole;
  /** Picks a variant and renders it with `self` (and `npc`, if given) and the given values. */
  write: (variants: readonly string[], values?: Record<string, string | number>, npc?: TextRole) => string | null;
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

/** The city you lived in at the end, or (birth) the city you were born in. */
function cityName(ctx: ObituaryContext, which: 'current' | 'birth' = 'current'): string {
  const { cityId, birthCityId } = ctx.life.character;
  const id = which === 'birth' ? birthCityId : cityId;
  return ctx.content.cities[id]?.name ?? id;
}

/** Average Happiness over the finished years (current Happiness before the first). */
export function lifetimeHappiness(life: LifeState): number {
  const { happinessTotal, years } = life.lifetime;
  return years > 0 ? Math.round(happinessTotal / years) : life.character.stats.happiness;
}

/**
 * The life's tone (balance aging.yaml, obituary): heavy when it ended young
 * or was mostly unhappy, bright when it was mostly happy, mixed otherwise.
 */
export function lifeTone(life: LifeState, content: ContentBundle, finished = life.phase === 'dead'): ObituaryTone {
  const t = content.balance.aging.obituary;
  const happiness = lifetimeHappiness(life);
  if ((finished && life.character.age < t.youngAge) || happiness < t.heavyHappiness) return 'heavy';
  return happiness >= t.brightHappiness ? 'bright' : 'mixed';
}

/** The highest credential, as the obituary's education key, with its words. */
function highestEducation(life: LifeState, content: ContentBundle): { key: ObituaryEducationKey; values: Record<string, string> } {
  const order = ['grad', 'bachelor', 'associate', 'trade_license', 'hs_diploma', 'ged'] as const;
  const creds = life.education.credentials;
  for (const type of order) {
    const cred = creds.find((c) => c.type === type);
    if (!cred) continue;
    const ref = cred.refId ?? '';
    switch (type) {
      case 'grad': {
        const g = content.gradPrograms[ref];
        return { key: 'grad', values: { subject: g?.subject ?? ref, degree: g?.degree ?? 'a graduate degree', license: '' } };
      }
      case 'bachelor':
      case 'associate':
        return { key: type, values: { subject: content.majors[ref]?.subject ?? ref, degree: '', license: '' } };
      case 'trade_license': {
        const tr = content.trades[ref];
        return { key: 'trade', values: { subject: tr?.subject ?? ref, license: tr?.license ?? 'license', degree: '' } };
      }
      case 'hs_diploma':
        return { key: 'highSchool', values: {} };
      case 'ged':
        return { key: 'ged', values: {} };
    }
  }
  return { key: 'none', values: {} };
}

/** The best job held (the highest salary), with its title and employer. */
export function careerPeak(life: LifeState, content: ContentBundle): { title: string; employer: string; level: number } | null {
  const jobs = [...life.career.history, ...(life.career.job ? [life.career.job] : [])];
  let best: (typeof jobs)[number] | null = null;
  for (const j of jobs) if (content.jobs[j.jobId] && (!best || j.salary > best.salary)) best = j;
  if (!best) return null;
  const levels = content.jobs[best.jobId]!.levels;
  const title = levels[Math.min(levels.length, Math.max(1, best.level)) - 1]?.title ?? content.jobs[best.jobId]!.name;
  return { title, employer: best.employer, level: best.level };
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
      return ctx.write(content.text.obituary.opening.finished[ctx.tone], { ...values, cause });
    },
  },
  {
    id: 'origins',
    write: (ctx) => {
      const parents = getFamily(ctx.life).filter((m) => m.relationship.kind === 'parent');
      if (parents.length === 0) return null;
      return ctx.write(ctx.content.text.obituary.origins, {
        birthYear: ctx.life.birthYear,
        birthCity: cityName(ctx, 'birth'),
        parents: ctx.list(parents.map(fullName)),
      });
    },
  },
  {
    id: 'education',
    write: (ctx) => {
      if (ctx.life.character.age < ctx.content.balance.economy.independenceAge) return null;
      const { key, values } = highestEducation(ctx.life, ctx.content);
      return ctx.write(ctx.content.text.obituary.education[key], values);
    },
  },
  {
    id: 'career',
    write: (ctx) => {
      const { life, content } = ctx;
      const text = content.text.obituary.career;
      const years = life.finances.earnings.years;
      const peak = careerPeak(life, content);
      const parts: (string | null)[] = [];
      if (peak) parts.push(ctx.write(peak.level > 1 ? text.peak[ctx.tone] : text.worked, { title: peak.title, employer: peak.employer, years }));
      else if (life.character.age >= content.balance.economy.independenceAge + 4) parts.push(ctx.write(text.never));
      if (life.career.retired && years > 0) parts.push(ctx.write(text.retired, { years }));
      const out = parts.filter((p): p is string => p !== null);
      return out.length > 0 ? out.join(' ') : null;
    },
  },
  {
    id: 'love',
    write: (ctx) => {
      const { life, content } = ctx;
      const text = content.text.obituary.love;
      const role = (m: FamilyMember): TextRole => ({ name: m.person.name, pronouns: m.person.identity.pronouns });
      const exes = Object.values(life.relationships)
        .filter((r) => r.kind === 'ex' && r.wasSpouse)
        .flatMap((r) => {
          const p = life.people[r.personId];
          return p ? [`${p.name.first} ${p.name.last}`] : [];
        });
      const spouses = getSpouses(life);
      const last = spouses.at(-1);
      const parts: (string | null)[] = [];
      if (exes.length > 0) parts.push(ctx.write(text.divorced, { exes: ctx.list(exes) }));
      if (last) {
        const year = last.relationship.kindSince ?? last.relationship.since;
        parts.push(ctx.write(last.person.alive ? text.married[ctx.tone] : text.widowed, { year }, role(last)));
      } else if (exes.length === 0 && life.character.age >= 30) parts.push(ctx.write(text.single));
      const out = parts.filter((p): p is string => p !== null);
      return out.length > 0 ? out.join(' ') : null;
    },
  },
  {
    id: 'moments',
    write: (ctx) => {
      const { life, content } = ctx;
      const { moments, deeds } = content.text.obituary;
      const max = content.balance.aging.obituary.maxMoments;
      const fired = Object.keys(moments).filter((id) => (life.eventLog[id]?.count ?? 0) > 0);
      // Legendary moments first, then the rest in the content's order.
      const legendary = (id: string) => (content.events[id]?.rarity === 'legendary' ? 0 : 1);
      fired.sort((a, b) => legendary(a) - legendary(b));
      const done = Object.keys(deeds).filter((flag) => {
        const v = life.flags[flag];
        return v !== undefined && v !== false && v !== 0 && v !== '';
      });
      const lines = [...fired.map((id) => moments[id]!), ...done.map((flag) => deeds[flag]!)].slice(0, max);
      const out = lines.flatMap((line) => ctx.write([line]) ?? []);
      return out.length > 0 ? out.join(' ') : null;
    },
  },
  {
    id: 'hardship',
    write: (ctx) => {
      const { life, content } = ctx;
      const text = content.text.obituary.hardship;
      const prisonYears = life.legal.record.reduce((sum, r) => sum + (r.outcome === 'jail' ? (r.years ?? 0) : 0), 0);
      const parts: (string | null)[] = [];
      if (prisonYears > 0) parts.push(ctx.write(text.prison, { years: yearsText(prisonYears, content) }));
      if (life.finances.bankruptcyYear !== undefined) parts.push(ctx.write(text.bankrupt, { year: life.finances.bankruptcyYear }));
      const out = parts.filter((p): p is string => p !== null);
      return out.length > 0 ? out.join(' ') : null;
    },
  },
  {
    id: 'survivedBy',
    write: (ctx) => {
      const alive = [...getSpouses(ctx.life), ...getFamily(ctx.life)].filter((m) => m.person.alive);
      if (!ctx.finished || alive.length === 0) return null;
      return ctx.write(ctx.content.text.obituary.survivedBy, { survivors: ctx.relatives(alive) });
    },
  },
  {
    id: 'predeceasedBy',
    write: (ctx) => {
      const dead = [...getSpouses(ctx.life), ...getFamily(ctx.life)].filter((m) => !m.person.alive);
      if (!ctx.finished || dead.length === 0) return null;
      return ctx.write(ctx.content.text.obituary.predeceasedBy, { predeceased: ctx.relatives(dead) });
    },
  },
  {
    id: 'mood',
    write: (ctx) => {
      const happiness = lifetimeHappiness(ctx.life);
      const band = ctx.content.text.obituary.mood.find((b) => happiness >= b.minHappiness);
      return band ? ctx.write(band.variants) : null;
    },
  },
  {
    id: 'closing',
    write: (ctx) => {
      const closing = ctx.content.text.obituary.closing;
      return ctx.write(ctx.finished ? closing.finished[ctx.tone] : closing.unfinished);
    },
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

  const list = (items: string[]): string => listText(items, content);

  const ctx: ObituaryContext = {
    life,
    content,
    finished: life.phase === 'dead',
    tone: lifeTone(life, content),
    rng,
    self,
    write: (variants, values = {}, npc) =>
      variants.length === 0 ? null : renderText(pick(rng, variants), { roles: npc ? { self, npc } : { self }, values }),
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

  return (
    sections
      .map((section) => section.write(ctx))
      .filter((part): part is string => part !== null && part.length > 0)
      .join(' ')
      // A name that ends a sentence and ends in a period itself ("Doorstep Delivery Co.").
      .replace(/(?<!\.)\.\.(?!\.)/g, '.')
  );
}
