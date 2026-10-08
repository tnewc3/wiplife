/**
 * What the screens show about the lives of the people you know (E3): the
 * news feed (Home and the year recap) and a person's page (job, partner,
 * children, city, troubles). Read-only; the words are in src/ui/labels.ts.
 */
import type { ContentBundle } from '../../content/schemas';
import type { CareState, FamilyWealth, Id, LifeState, PartnerStatus } from '../types';
import { whereabouts } from '../presence';
import { defaultLife, jobTitle } from './model';

export interface NewsItem {
  personId: Id;
  /** The line as it was written when it happened. */
  text: string;
  /** E6b: a tabloid headline about you (there is no person it is about). */
  tabloid?: true;
}

export interface NewsFeedView {
  year: number;
  items: NewsItem[];
}

/** The news for one year (the newest kept year by default); null when there was none. */
export function getNews(state: LifeState, year?: number): NewsFeedView | null {
  // E6b: the tabloids' headlines about you count too; with no year given, the newest year with either.
  const newestLines = state.news[state.news.length - 1]?.year;
  const newestHeadline = state.fame.headlines.at(-1)?.year;
  const shown = year ?? Math.max(newestLines ?? -Infinity, newestHeadline ?? -Infinity);
  if (!Number.isFinite(shown)) return null;
  const entry = state.news.find((n) => n.year === shown);
  const tabloid: NewsItem[] = state.fame.headlines.filter((h) => h.year === shown).map((h) => ({ personId: '', text: h.text, tabloid: true as const }));
  const lines = entry?.lines ?? [];
  if (lines.length === 0 && tabloid.length === 0) return null;
  return { year: shown, items: [...tabloid, ...lines.map((l) => ({ personId: l.personId, text: l.text }))] };
}

export type TroubleView =
  | { kind: 'illness' | 'addiction'; name: string; treated: boolean; serious: boolean }
  | { kind: 'crime'; name: string; stage: 'held' | 'bailed' | 'probation' | 'jail'; until: number | null };

export interface PersonLifeView {
  /** Their job as a title ("electrician"), their wealth level, and that they have retired. */
  job: string | null;
  retired: boolean;
  wealth: FamilyWealth;
  city: { id: Id; name: string; yours: boolean; withYou: boolean };
  /** Their partner when that isn't you: first name, last name and how far along. */
  partner: { name: string; status: PartnerStatus; years: number } | null;
  /** How their last relationship ended, when they have no partner now. */
  ended: { how: 'broke_up' | 'divorced' | 'widowed'; year: number; partner: string } | null;
  children: { name: string; age: number }[];
  troubles: TroubleView[];
  care: CareState | null;
}

/** A person's own life, as the page shows it. Null for someone you don't know. */
export function getPersonLifeView(state: LifeState, personId: Id, content: ContentBundle): PersonLifeView | null {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person || !rel) return null;
  const life = person.life ?? defaultLife(state, person, rel, content);
  const serious = content.balance.people.trouble.serious;
  const troubles: TroubleView[] = life.troubles.flatMap((t): TroubleView[] => {
    if (t.kind === 'crime') {
      const offense = content.offenses[t.refId];
      return offense && t.stage ? [{ kind: 'crime', name: offense.name, stage: t.stage, until: t.until ?? null }] : [];
    }
    const def = content.conditions[t.refId];
    return def ? [{ kind: t.kind, name: def.name, treated: t.treated, serious: t.severity >= serious }] : [];
  });
  const title = jobTitle(person, life, content);
  return {
    job: title ?? null,
    retired: life.retired === true,
    wealth: person.wealthLevel,
    city: { id: person.cityId, name: content.cities[person.cityId]?.name ?? person.cityId, yours: person.cityId === state.character.cityId, withYou: whereabouts(state, personId, content) === 'household' },
    partner: life.partner
      ? { name: `${life.partner.name.first} ${life.partner.name.last}`, status: life.partner.status, years: state.currentYear - life.partner.since }
      : null,
    ended: !life.partner && life.ended ? { how: life.ended.how, year: life.ended.year, partner: life.ended.partner } : null,
    children: life.children.map((c) => ({ name: c.first, age: state.currentYear - c.birthYear })),
    troubles,
    care: life.care ?? null,
  };
}
