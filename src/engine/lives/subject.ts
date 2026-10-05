/**
 * What the yearly step for people works with (E3): the shared context, one
 * person's working copy (changed freely and written back at the end), and the
 * two things a change can lead to: a line of news and a request.
 */
import type { ContentBundle, NewsKind, PeopleBalance, RequestTrigger } from '../../content/schemas';
import { chance, pick } from '../rng';
import { renderText, type TextRole } from '../text';
import type { FamilyWealth, Id, LifeState, LifeTier, Person, PersonLife, Relationship } from '../types';
import { jobTitle, relationWord, withArticle } from './model';

export interface PendingNews {
  personId: Id;
  kind: NewsKind;
  text: string;
  /** The request this change may lead to; if the request is queued, the event card tells the story and the line is left out. */
  trigger?: RequestTrigger;
  major: boolean;
  tier: LifeTier;
}

export interface Ask {
  id: Id;
  trigger: RequestTrigger;
}

export interface Ctx {
  /** The life being changed (an Immer draft inside beginYear). */
  state: LifeState;
  /** The life as the earlier steps left it (faster to read). */
  view: LifeState;
  content: ContentBundle;
  bal: PeopleBalance;
  year: number;
  news: PendingNews[];
  asks: Ask[];
  major: ReadonlySet<string>;
  /** First names in use, for naming new partners and children (built when first needed). */
  names: Set<string> | null;
  /** Requests can reach you (not while you're in prison, where only prison events happen). */
  open: boolean;
}

/** One person's year: a working copy of what can change, written back to the life at the end. */
export interface Subject {
  id: Id;
  person: Person;
  rel: Relationship;
  life: PersonLife;
  tier: LifeTier;
  age: number;
  occupation: string | undefined;
  wealth: FamilyWealth;
  cityId: Id;
  /** News lines this person has made this year. */
  said: number;
}

/** Their text role as they are now (the working copy), for news and for the values a line may use. */
export function roleOf(ctx: Ctx, s: Subject): TextRole {
  const title = s.occupation !== undefined ? jobTitle({ ...s.person, occupation: s.occupation }, s.life, ctx.content) : undefined;
  return {
    name: s.person.name,
    pronouns: s.person.identity.pronouns,
    relation: relationWord(s.person, s.rel, ctx.content),
    ...(s.life.partner ? { partner: s.life.partner.name.first } : s.life.ended ? { partner: s.life.ended.partner } : {}),
    city: ctx.content.cities[s.cityId]?.name ?? s.cityId,
    ...(title !== undefined ? { job: withArticle(title) } : {}),
  };
}

/**
 * One line of news about this person. Near and far people only make the news
 * with the major kinds; nobody makes more than the balance's `perPerson` lines
 * a year. `trigger` names the request this change may lead to.
 */
export function say(ctx: Ctx, s: Subject, kind: NewsKind, values: Record<string, string | number> = {}, trigger?: RequestTrigger): void {
  const major = ctx.major.has(kind);
  if (s.tier !== 'close' && !major) return;
  if (s.said >= ctx.bal.news.perPerson) return;
  s.said += 1;
  const template = pick(ctx.state.rng, ctx.content.text.news.lines[kind]);
  const text = renderText(template, { roles: { npc: roleOf(ctx, s) }, values });
  ctx.news.push({ personId: s.id, kind, text, major, tier: s.tier, ...(trigger ? { trigger } : {}) });
}

/** This change may lead to a request from this person (decided later, with the year's other requests). */
export function ask(ctx: Ctx, s: Subject, trigger: RequestTrigger): void {
  const config = ctx.bal.requests.triggers[trigger];
  if (!ctx.open || !config.tiers.includes(s.tier)) return;
  if (chance(ctx.state.rng, config.chance)) ctx.asks.push({ id: s.id, trigger });
}

/** First names already in use in the life (so new partners and children get fresh ones). */
export function usedNames(ctx: Ctx): Set<string> {
  if (!ctx.names) ctx.names = new Set([ctx.view.character.name.first, ...Object.values(ctx.view.people).map((p) => p.name.first)]);
  return ctx.names;
}
