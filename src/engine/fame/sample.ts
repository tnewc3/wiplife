/**
 * The event sandbox's fame state (E6b): gives a previewed life the career,
 * rung, fame, agent, contract, release, ceremony, fans or stalker an event's
 * requirements ask for. Not used by the game itself.
 */
import type { Compare, Condition, ContentBundle, EventDef, FameCondition } from '../../content/schemas';
import type { FameProject, Id, LifeState } from '../types';
import { companiesFor, companyTierFor } from './ladder';
import { emptyFame, pathDef, rungDef } from './query';

function wanted(condition: Condition | undefined): FameCondition {
  const out: FameCondition = {};
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('fame' in c) Object.assign(out, c.fame);
  };
  walk(condition);
  return out;
}

function bound(c: Compare | undefined, up = true): number | undefined {
  if (!c) return undefined;
  if (c.eq !== undefined) return c.eq;
  if (up) return c.gte ?? (c.gt === undefined ? undefined : c.gt + 1);
  return c.lte ?? (c.lt === undefined ? undefined : c.lt - 1);
}

const FAME_WORDS = /\{(project|noun|review|fanLine|rungTitle|nextTitle|pathNoun|secondPath|company|agent|award|headline)\}/;

export function giveSampleFame(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  const want = wanted(def.requires);
  const roles = Object.entries(def.cast ?? {}).filter(([, spec]) => spec.fan !== undefined);
  const text = JSON.stringify(def);
  const uses = FAME_WORDS.test(text) || def.category.startsWith('fame') || roles.length > 0 || Object.keys(want).length > 0;
  if (!uses || want.active === false && want.retired !== true) return;
  const year = state.currentYear;
  const f = (state.fame = emptyFame());
  const pathId = want.path?.[0] ?? (def.category === 'fameentry' ? 'music' : 'music');
  const path = pathDef(content, pathId);
  if (!path) return;
  const rung = Math.min(path.rungs.length, Math.max(1, bound(want.rung) ?? bound(want.peak) ?? 1, bound(want.rung, false) ?? 1));
  const rungWanted = Math.max(1, bound(want.rung) ?? (want.top === true ? path.rungs.length : rung));
  const final = Math.min(path.rungs.length, rungWanted);
  f.active = true;
  f.main = pathId;
  const fameAt = bound(want.fame) ?? rungDef(path, final).fame + 2;
  f.paths[pathId] = {
    rung: final,
    peak: want.faded === true ? Math.min(path.rungs.length, final + 1) : Math.max(final, bound(want.peak) ?? final),
    fame: Math.min(99, fameAt),
    craft: 40,
    since: year - Math.max(1, bound(want.years) ?? 3),
    last: year - (bound(want.gap) ?? 0),
    recent: [Math.max(40, rungDef(path, final).quality)],
    breakYear: 0,
  };
  if (want.faded === true) f.fadedFrom = f.paths[pathId]!.peak;
  f.fans = bound(want.fans) ?? 500;
  f.image = bound(want.image) ?? bound(want.image, false) ?? 55;
  f.mood = bound(want.mood) ?? bound(want.mood, false) ?? 60;
  f.burnout = bound(want.burnout) ?? 20;
  f.commitment = want.commitment?.[0] ?? 'steady';
  if (state.character.age < content.balance.economy.independenceAge && f.commitment === 'all') f.commitment = 'steady';
  if (want.second === true) {
    const other = Object.keys(content.famePaths).sort().find((id) => id !== pathId);
    if (other) {
      f.second = other;
      f.paths[other] = { rung: 1, peak: 1, fame: 2, craft: 20, since: year - 1, last: year - 1, recent: [], breakYear: 0 };
    }
  }
  const tier = bound(want.agent);
  if (tier !== undefined && tier >= 1) {
    const agent = Object.values(content.fameAgents).find((a) => a.tier === tier);
    if (agent) f.agent = { agentId: agent.id, since: year - 1 };
  }
  if (want.contract === true) {
    const company = companiesFor(content, pathId, companyTierFor(path, final))[0];
    if (company) {
      const minor = state.character.age < content.balance.economy.independenceAge;
      f.contract = { company: company.id, path: pathId, since: year - 1, until: year + 1, advance: 5000, share: 0.25, terms: 'standard', exclusive: false, byParent: minor };
    }
  }
  if (want.plan === true) {
    const kind = path.kinds[0]!;
    f.plan = { path: pathId, kind: kind.id, style: 'commercial', risk: 'safe', tour: false, press: false };
  }
  if (want.released === true || want.last !== undefined || FAME_WORDS.test(text.replace(/\{(rungTitle|nextTitle|pathNoun|secondPath|company|agent|award|headline)\}/g, ''))) {
    const kind = path.kinds[0]!;
    const project: FameProject = {
      year,
      path: pathId,
      kind: kind.id,
      title: content.text.fame.titles[pathId]?.[0] ?? 'Untitled',
      style: 'commercial',
      risk: 'safe',
      tour: false,
      press: false,
      quality: 60,
      critics: 60,
      fans: 60,
      band: want.last?.[0] ?? 'hit',
      gain: 4,
      earned: 5000,
    };
    f.projects.push(project);
  }
  if (want.ceremony !== undefined || /\{award\}/.test(text)) {
    const award = Object.values(content.fameAwards).find((a) => a.path === pathId);
    if (award) f.ceremony = { year, awardId: award.id, project: content.text.fame.titles[pathId]?.[1] ?? 'Untitled', result: want.ceremony?.[0] ?? 'won' };
  }
  if (want.tabloid === true || /\{headline\}/.test(text)) f.headlines.push({ year, text: 'Star in the news', kind: 'scandal' });
  // The fan people the event casts.
  for (const [role, spec] of roles) {
    const id = cast[role];
    if (id === undefined) continue;
    const fanType = spec.fan === 'stalker' ? 'super' : spec.fan!;
    if (!f.people[fanType].includes(id)) f.people[fanType].push(id);
    state.people[id]!.tags.push(`fan:${spec.fan}`);
    if (spec.fan === 'stalker') {
      const stage = Array.isArray(want.stalker) ? want.stalker[0]! : 'watching';
      f.stalker = { id, since: year - 1, stage };
    }
  }
  if (want.stalker !== undefined && want.stalker !== false && f.stalker === null) {
    const id = f.people.super[0] ?? Object.keys(state.people).find((p) => p !== undefined);
    if (id !== undefined) {
      if (!f.people.super.includes(id)) f.people.super.push(id);
      f.stalker = { id, since: year - 1, stage: Array.isArray(want.stalker) ? want.stalker[0]! : 'watching' };
    }
  }
  if (want.retired === true) {
    f.active = false;
    f.retired = year - 2;
  }
}
