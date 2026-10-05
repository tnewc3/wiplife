/**
 * People's yearly step (E3, year pipeline step 'lives'): every living person
 * in your life gets their own year. How much depends on their tier (close
 * people get everything; the rest only the major milestones): career and
 * money, love, moving, children, growing up and trouble, each by a summary
 * over the existing content. Notable changes become lines in the year's news
 * (a capped log), and a few can ask something of you as an event (requests,
 * counted in the pacing budget). Runs just before the pacing director, so a
 * request is picked up the same year.
 */
import { isDraft, original } from 'immer';
import type { ContentBundle, LifeDomain } from '../../content/schemas';
import { isChildKind, isPartnerKind } from '../relationships';
import type { Id, LifeState, Person, Relationship } from '../types';
import { careerStep } from './career';
import { childrenStep, growingStep, movingStep } from './family';
import { loveStep } from './love';
import { ageOfPerson, cloneLife, defaultLife, levelForWealth, tierFor } from './model';
import { queueRequests } from './requests';
import { ask, type Ctx, type Subject } from './subject';
import { careStep, troubleStep } from './trouble';
import { hasRomanticTie } from '../web/query';

const TIER_RANK = { close: 0, near: 1, far: 2 } as const;

/** Which parts of a life change for this person: the tier's domains, less what belongs to another system (your partner and your children are yours). */
function domainsFor(ctx: Ctx, s: Subject): Set<LifeDomain> {
  const d = new Set<LifeDomain>(ctx.bal.domains[s.tier]);
  const kind = s.rel.kind;
  if (isPartnerKind(kind)) for (const x of ['love', 'moving', 'children', 'growing'] as const) d.delete(x);
  if (kind === 'ex') {
    d.delete('love');
    d.delete('children');
  }
  if (kind === 'coworker' || kind === 'boss') d.delete('career');
  // E4: someone in a couple with another of the people you know has their love life already.
  if (hasRomanticTie(ctx.view.web, s.id)) d.delete('love');
  // The older generation's partners are each other (the web between people, E4, ties them): no new love lives or children for them here.
  if (kind === 'parent' || kind === 'stepparent' || kind === 'grandparent' || kind === 'relative') {
    d.delete('love');
    d.delete('children');
  }
  // Your children are the family step's: they only get a love life, children and trouble once grown.
  if (s.person.child || isChildKind(kind)) for (const x of ['career', 'moving', 'growing'] as const) d.delete(x);
  return d;
}

function subjectFor(ctx: Ctx, id: Id, person: Person, rel: Relationship): Subject {
  const life = cloneLife(person.life ?? defaultLife(ctx.view, person, rel, ctx.content));
  life.tier = tierFor(rel, ctx.content);
  // Other systems hand out jobs too (your grown children's, the people you meet): keep the level in step with the job.
  const track = person.occupation !== undefined ? ctx.content.jobs[person.occupation] : undefined;
  if (track && life.level < 1) {
    life.level = levelForWealth(track, person.wealthLevel, ctx.content);
    life.levelSince = ctx.year;
  } else if (!track && life.level !== 0) {
    life.level = 0;
  }
  return { id, person, rel, life, tier: life.tier, age: ageOfPerson(ctx.view, person), occupation: person.occupation, wealth: person.wealthLevel, cityId: person.cityId, said: 0 };
}

function stepPerson(ctx: Ctx, id: Id, person: Person, rel: Relationship): void {
  const s = subjectFor(ctx, id, person, rel);
  const d = domainsFor(ctx, s);
  if (d.has('growing')) growingStep(ctx, s);
  if (d.has('career')) careerStep(ctx, s);
  if (d.has('love')) loveStep(ctx, s);
  if (d.has('moving')) movingStep(ctx, s);
  if (d.has('children')) childrenStep(ctx, s);
  if (d.has('trouble')) {
    troubleStep(ctx, s);
    if (s.tier === 'close') careStep(ctx, s);
  }
  // Write back what changed (most years nothing does, and an untouched person costs nothing).
  const lifeChanged = person.life === undefined || JSON.stringify(person.life) !== JSON.stringify(s.life);
  if (!lifeChanged && s.occupation === person.occupation && s.wealth === person.wealthLevel && s.cityId === person.cityId) return;
  const target = ctx.state.people[id]!;
  if (lifeChanged) target.life = s.life;
  if (s.occupation !== person.occupation) {
    if (s.occupation === undefined) delete target.occupation;
    else target.occupation = s.occupation;
  }
  if (s.wealth !== person.wealthLevel) target.wealthLevel = s.wealth;
  if (s.cityId !== person.cityId) target.cityId = s.cityId;
}

/** Keeps the year's lines: each change once, the biggest first, up to the cap; older years beyond the balance's few are dropped. */
function finishNews(ctx: Ctx, carded: readonly { id: Id; trigger: string }[]): void {
  const told = new Set(carded.map((a) => `${a.id}:${a.trigger}`));
  const seen = new Set<string>();
  const lines = ctx.news
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => !(n.trigger !== undefined && told.has(`${n.personId}:${n.trigger}`)))
    .sort((a, b) => Number(b.n.major) - Number(a.n.major) || TIER_RANK[a.n.tier] - TIER_RANK[b.n.tier] || a.i - b.i)
    .filter(({ n }) => {
      const key = `${n.personId}:${n.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, ctx.bal.news.maxPerYear)
    .map(({ n }) => ({ personId: n.personId, kind: n.kind, text: n.text }));
  const news = ctx.state.news.filter((y) => y.year !== ctx.year);
  if (lines.length > 0) news.push({ year: ctx.year, lines });
  ctx.state.news = news.slice(-ctx.bal.news.keepYears);
}

/** Step 'lives': everyone you know has a year; the news and the requests follow from it. */
export function runLives(state: LifeState, content: ContentBundle): void {
  // Read through the life as the earlier steps left it (faster than the draft).
  const view = isDraft(state) ? (original(state) as LifeState) : state;
  const bal = content.balance.people;
  const year = state.currentYear;
  const ctx: Ctx = { state, view, content, bal, year, news: [], asks: [], major: new Set<string>(bal.news.major), names: null, open: view.housing.kind !== 'incarcerated' };
  for (const id of Object.keys(view.relationships).sort()) {
    const rel = view.relationships[id]!;
    const person = view.people[id];
    if (!person || rel.status === 'ended') continue;
    if (person.alive) {
      stepPerson(ctx, id, person, rel);
    } else if (person.deathYear === year && !person.child) {
      // A death this year (the NPC step): a funeral may ask something of you.
      const s = subjectFor(ctx, id, person, rel);
      state.people[id]!.life = s.life;
      ask(ctx, s, 'death');
    }
  }
  finishNews(ctx, queueRequests(ctx));
}
