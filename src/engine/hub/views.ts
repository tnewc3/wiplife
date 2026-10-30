/**
 * What the Career tab, the Schedule, the Sports tabs and the band screen read (C2): plain data for the UI. The words are the UI's
 * (src/ui/labels.ts) except the names of things in the game, which come from content and from your life.
 */
import type { ContentBundle } from '../../content/schemas';
import { levelTitle } from '../career';
import { bandStrength, currentPool, rehearsalBudget, rehearsalsThisYear, rehearseBlock, type RehearseBlock } from './band';
import { enhancerBlock, type EnhancerBlock } from './enhancers';
import { activeRoles, commitOf, loadNow, performancePenalty, proContract } from './load';
import { pathSkillKey, markOf, memberKey, skillFloor, idleYears } from './skills';
import { liveMembers, partsOf } from '../fame/band';
import { pathDef } from '../fame/query';
import { prospectRating } from '../sports/rating';
import { mySport } from '../sports/query';
import type { CommitLevel, Id, LifeState, RoleId } from '../types';
import { schoolLineOf } from './schoolLine';

export type RoleOpens = 'school' | 'job' | 'gig' | 'sports' | 'fame' | 'band' | 'business' | 'crime' | 'social';

export interface RoleRowView {
  id: RoleId;
  icon: string;
  title: string;
  subtitle: string;
  /** The one key bar (null when the role has none). `label` is a key into the UI's bar words. */
  bar: { key: 'greatness' | 'buzz' | 'grades' | 'performance' | 'rank' | 'fame'; value: number } | null;
  commit: CommitLevel;
  share: number;
  opens: RoleOpens;
}

export interface SkillRowView {
  key: string;
  label: string;
  kind: 'hobby' | 'sport' | 'music' | 'art' | 'band';
  level: number;
  peak: number;
  floor: number;
  /** Years since it was used. */
  idle: number;
  fading: boolean;
}

export interface HubView {
  between: boolean;
  roles: RoleRowView[];
  load: { total: number; comfortable: number; over: number; shares: { id: RoleId; points: number; commit: CommitLevel }[] };
  /** 0 light, 1 steady, 2 heavy, 3 more than you can carry. */
  loadBand: 0 | 1 | 2 | 3;
  burnout: number;
  penalty: number;
  gave: { year: number; what: 'grades' | 'job' | 'bench' | 'band' } | null;
  skills: SkillRowView[];
  /** Special careers you could look at, and whether each is open. */
  special: { id: 'sports' | 'music' | 'acting' | 'social' | 'writing' | 'business' | 'crime'; icon: string; open: boolean; minAge: number }[];
}

function band(value: number, cuts: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  return value < cuts[0] ? 0 : value < cuts[1] ? 1 : value < cuts[2] ? 2 : 3;
}

/** Rows for every skill you have, strongest first. */
export function skillRows(state: LifeState, content: ContentBundle): SkillRowView[] {
  const out: SkillRowView[] = [];
  const fadeYears = content.balance.skills.fade.idleYears;
  const push = (row: Omit<SkillRowView, 'floor' | 'fading'> & { last: number }) => {
    const idle = Math.max(0, state.currentYear - row.last);
    out.push({ key: row.key, label: row.label, kind: row.kind, level: row.level, peak: row.peak, floor: skillFloor(row.peak, content), idle, fading: idle >= fadeYears });
  };
  for (const [key, rec] of Object.entries(state.hub.skills)) {
    if (key.startsWith('hobby.')) push({ key, label: content.pastimes[key.slice(6)]?.label ?? key, kind: 'hobby', level: rec.level, peak: rec.peak, last: rec.last, idle: 0 });
    else if (key.startsWith('sport.')) {
      const [, sport, skill] = key.split('.');
      const def = pathDef(content, sport);
      push({ key, label: `${def?.skills?.find((s) => s.id === skill)?.label ?? skill} (${def?.noun ?? sport})`, kind: 'sport', level: rec.level, peak: rec.peak, last: rec.last, idle: 0 });
    }
  }
  for (const [pathId, path] of Object.entries(state.fame.paths)) {
    const def = pathDef(content, pathId);
    for (const [skillId, level] of Object.entries(path.skills ?? {})) {
      const mark = markOf(state, pathSkillKey(pathId, skillId), level);
      const label = def?.skills?.find((s) => s.id === skillId)?.label ?? skillId;
      push({ key: pathSkillKey(pathId, skillId), label, kind: def?.sport ? 'sport' : def?.bands ? 'music' : 'art', level, peak: Math.max(mark.peak, level), last: mark.last, idle: 0 });
    }
  }
  return out.sort((a, b) => b.level - a.level || (a.key < b.key ? -1 : 1));
}

/** The title and subtitle of a sports role. */
function sportsRow(state: LifeState, content: ContentBundle): { title: string; subtitle: string; greatness: number } {
  const def = mySport(state, content)!;
  const s = state.sports;
  const position = def.sport.positions.find((p) => p.id === s.position)?.label ?? def.name;
  const latest = s.seasons[s.seasons.length - 1];
  const greatness = latest && latest.sport === def.id ? latest.rating : Math.round(prospectRating(state, def, content));
  const team = s.team?.name ?? s.club?.name ?? '';
  return { title: `${position} · ${def.name}`, subtitle: team, greatness };
}

export function getHubView(state: LifeState, content: ContentBundle): HubView {
  const load = loadNow(state, content);
  const ids = activeRoles(state, content);
  const roles: RoleRowView[] = [];
  for (const id of ids) {
    const row = (r: Omit<RoleRowView, 'id' | 'commit' | 'share' | 'opens'>): void => {
      roles.push({ id, commit: commitOf(state, id), share: load.shares[id] ?? 0, opens: id, ...r });
    };
    if (id === 'school') {
      const e = state.education.current!;
      const line = schoolLineOf(state, content);
      row({ icon: 'graduation_cap', title: line.schoolName, subtitle: line.label, bar: { key: 'grades', value: Math.round((Math.min(4, Math.max(0, e.gpa)) / 4) * 100) } });
    } else if (id === 'job') {
      const job = state.career.job!;
      const def = content.jobs[job.jobId];
      row({ icon: 'briefcase', title: levelTitle(def, job.level) || (def?.name ?? ''), subtitle: job.employer, bar: { key: 'performance', value: job.performance } });
    } else if (id === 'gig') {
      row({ icon: 'money_bag', title: 'gig', subtitle: '', bar: null });
    } else if (id === 'sports') {
      const r = sportsRow(state, content);
      row({ icon: state.sports.sport === 'basketball' ? 'basketball' : 'trophy', title: r.title, subtitle: r.subtitle, bar: { key: 'greatness', value: r.greatness } });
    } else if (id === 'fame') {
      const f = state.fame;
      const pathId = [f.main, f.second].find((p) => p !== null && f.paths[p] !== undefined && pathDef(content, p)?.sport === undefined && p !== 'social') ?? null;
      const def = pathDef(content, pathId);
      const path = pathId === null ? undefined : f.paths[pathId];
      const rung = def && path ? def.rungs[Math.min(def.rungs.length, path.rung) - 1]?.title ?? '' : '';
      row({ icon: pathId === 'acting' ? 'clapper_board' : pathId === 'music' ? 'musical_note' : 'memo', title: def?.name ?? '', subtitle: rung, bar: { key: 'fame', value: Math.round(path?.fame ?? 0) } });
    } else if (id === 'band') {
      const b = state.fame.band!;
      const fame = state.fame.paths[b.path]?.fame ?? 0;
      row({ icon: 'guitar', title: b.name, subtitle: '', bar: { key: 'buzz', value: Math.round(fame) } });
    } else if (id === 'business') {
      row({ icon: 'office_building', title: state.business.items[0]?.name ?? '', subtitle: '', bar: null });
    } else if (id === 'crime') {
      const c = state.crime;
      row({ icon: 'sunglasses', title: content.crews[c.crew!.defId]?.name ?? '', subtitle: '', bar: { key: 'rank', value: Math.round((c.rank / 5) * 100) } });
    } else {
      row({ icon: 'mobile_phone', title: pathDef(content, 'social')?.name ?? '', subtitle: '', bar: { key: 'fame', value: Math.round(state.fame.paths.social?.fame ?? 0) } });
    }
  }
  const specialOpen = (id: string): boolean => {
    const def = pathDef(content, id);
    return def !== undefined && state.character.age >= def.minAge;
  };
  return {
    between: state.phase === 'yearStart' && state.housing.kind !== 'incarcerated',
    roles,
    load: {
      total: Math.round(load.total),
      comfortable: load.comfortable,
      over: Math.round(load.over),
      shares: ids.map((id) => ({ id, points: Math.round(load.shares[id] ?? 0), commit: commitOf(state, id) })),
    },
    loadBand: band(load.total / load.comfortable, [0.55, 0.9, 1.0]),
    burnout: state.hub.burnout,
    penalty: performancePenalty(state, content),
    gave: state.hub.gave,
    skills: skillRows(state, content),
    special: [
      { id: 'sports', icon: 'trophy', open: specialOpen('basketball'), minAge: pathDef(content, 'basketball')?.minAge ?? 8 },
      { id: 'music', icon: 'musical_note', open: specialOpen('music'), minAge: pathDef(content, 'music')?.minAge ?? 8 },
      { id: 'acting', icon: 'clapper_board', open: specialOpen('acting'), minAge: pathDef(content, 'acting')?.minAge ?? 8 },
      { id: 'social', icon: 'mobile_phone', open: specialOpen('social'), minAge: pathDef(content, 'social')?.minAge ?? 8 },
      { id: 'writing', icon: 'memo', open: specialOpen('arts'), minAge: pathDef(content, 'arts')?.minAge ?? 8 },
      { id: 'business', icon: 'office_building', open: state.character.age >= content.balance.business.limits.minAge, minAge: content.balance.business.limits.minAge },
      { id: 'crime', icon: 'sunglasses', open: state.character.age >= 18, minAge: 18 },
    ],
  };
}

// ── The band screen ────────────────────────────────────────────────────────

export interface BandHubView {
  has: boolean;
  between: boolean;
  strength: number;
  strengthBand: 0 | 1 | 2 | 3;
  buzz: number;
  chemistry: number;
  rehearsals: { done: number; budget: number; block: RehearseBlock | null };
  commit: CommitLevel;
  members: { id: Id; name: string; part: string; partId: Id; skill: number; peak: number; affection: number; age: number; temper: 'steady' | 'fiery' | 'flaky' | null; improving: boolean }[];
  pool: { part: string; partId: Id; candidates: { index: number; skill: number; age: number; temper: 'steady' | 'fiery' | 'flaky' }[] } | null;
  /** The best player who could turn up at your fame now (a ceiling for the pool), and the mean. */
  poolCeiling: number;
}

export function getBandHubView(state: LifeState, content: ContentBundle): BandHubView {
  const band = state.fame.band;
  const def = band ? pathDef(content, band.path) : undefined;
  const partLabel = (id: Id): string => partsOf(def).find((p) => p.id === id)?.label ?? id;
  const members = band ? liveMembers(state) : [];
  const pool = currentPool(state);
  const strength = bandStrength(state, content);
  return {
    has: band !== null,
    between: state.phase === 'yearStart' && state.housing.kind !== 'incarcerated',
    strength,
    strengthBand: band_(strength),
    buzz: band ? Math.round(state.fame.paths[band.path]?.fame ?? 0) : 0,
    chemistry: band?.chemistry ?? 0,
    rehearsals: { done: rehearsalsThisYear(state), budget: rehearsalBudget(state, content), block: state.phase === 'yearStart' ? rehearseBlock(state, content) : 'inactive' },
    commit: commitOf(state, 'band'),
    members: members.map((m) => {
      const p = state.people[m.id]!;
      const mark = state.hub.marks[memberKey(m.id)];
      return { id: m.id, name: `${p.name.first} ${p.name.last}`, part: partLabel(m.part), partId: m.part, skill: Math.round(m.skill), peak: Math.round(Math.max(m.skill, mark?.peak ?? 0)), affection: state.relationships[m.id]?.affection ?? 0, age: state.currentYear - p.birthYear, temper: m.temper ?? null, improving: idleYears(state, mark ?? { peak: m.skill, last: state.currentYear }) === 0 };
    }),
    pool: pool ? { part: partLabel(pool.part), partId: pool.part, candidates: pool.candidates.map((c, index) => ({ index, skill: c.skill, age: c.age, temper: c.temper })) } : null,
    poolCeiling: 0,
  };
}

function band_(value: number): 0 | 1 | 2 | 3 {
  return value < 30 ? 0 : value < 50 ? 1 : value < 72 ? 2 : 3;
}

export type { EnhancerBlock };
export interface EnhancerView {
  on: boolean;
  years: number;
  tests: number;
  positives: number;
  startBlock: EnhancerBlock | null;
  stopBlock: EnhancerBlock | null;
  pro: boolean;
}

export function getEnhancerView(state: LifeState, content: ContentBundle): EnhancerView {
  const e = state.hub.enhancers;
  return { on: e.on, years: e.years, tests: e.tests, positives: e.positives, startBlock: enhancerBlock(state, true, content), stopBlock: enhancerBlock(state, false, content), pro: proContract(state) };
}
