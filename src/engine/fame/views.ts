/**
 * What the Fame screen shows (E6b): the ladder with your rung and the next
 * milestone, fame, public image and fan mood as bands, your commitment,
 * agent and contract, the project lined up and the creative choices open to
 * you, what you have released and how it was received, the awards shelf, the
 * people fame brought into your life, and the ways in. Read-only; the words
 * are in src/ui/labels.ts.
 */
import type { ContentBundle, FameBand } from '../../content/schemas';
import { isIncarcerated } from '../legal';
import { commitmentCeiling, commitmentFloor } from './effects';
import {
  agentBlock,
  contractBlock,
  crossBlock,
  enterBlock,
  openAgents,
  type AgentBlock,
  type CrossBlock,
  type EnterBlock,
} from './ladder';
import { allPaths, bandOf, fanAlive, isMinorStar, mainPath, moodBand, pathDef, rungDef, usualYear, withArticle, workedPaths } from './query';
import { planBlock, recentQuality } from './work';
import type { Id, LifeState } from '../types';

export interface FameRungView {
  title: string;
  reached: boolean;
  current: boolean;
}

export interface FamePathView {
  id: Id;
  name: string;
  noun: string;
  rung: number;
  rungTitle: string;
  peakTitle: string;
  ladder: FameRungView[];
  fame: number;
  fameBand: number;
  craft: number;
  faded: boolean;
  /** The next rung: what it is called, what it takes to get there in words (the milestone of the rung you stand on), and how near fame and the quality of your work are to it. */
  next: { title: string; milestone: string; fameNeeded: number; qualityNeeded: number; qualityNow: number } | null;
  kinds: { id: Id; label: string; noun: string; blurb: string; locked: boolean; minRung: number }[];
  tour: { label: string; allowed: boolean; minRung: number };
  press: { label: string; allowed: boolean; minRung: number };
  /** A typical year at this rung, in your city. */
  usualYear: number;
}

export interface FameProjectView {
  title: string;
  year: number;
  pathName: string;
  noun: string;
  style: 'commercial' | 'artistic';
  risk: 'safe' | 'bold';
  tour: boolean;
  press: boolean;
  quality: number;
  critics: number;
  fans: number;
  band: FameBand;
  gain: number;
  earned: number;
  assigned: boolean;
}

export interface FameEntryView {
  pathId: Id;
  name: string;
  blurb: string;
  routes: { id: Id; label: string; blurb: string; minAge: number; block: EnterBlock | null }[];
}

export interface FameView {
  /** Show the card: a career, a retired one, or an age at which one can begin. */
  show: boolean;
  active: boolean;
  retired: boolean;
  /** Between years, so choices can be made. */
  between: boolean;
  minor: boolean;
  years: number;
  paths: FamePathView[];
  image: number;
  imageBand: number;
  fans: number;
  mood: number;
  moodBand: 0 | 1 | 2;
  burnout: number;
  burnoutBand: number;
  commitment: 'back' | 'steady' | 'all';
  commitments: { id: 'back' | 'steady' | 'all'; allowed: boolean; block: 'contract' | 'young' | null }[];
  scene: 'low' | 'social' | 'entourage' | 'lavish';
  scenes: { id: 'low' | 'social' | 'entourage' | 'lavish'; cost: number; allowed: boolean }[];
  agent: { id: Id; name: string; blurb: string; cut: number; tier: number } | null;
  openAgents: { id: Id; name: string; blurb: string; cut: number; tier: number }[];
  agentBlocks: Record<Id, AgentBlock | null>;
  contract: { company: string; kind: string; until: number; share: number; advance: number; exclusive: boolean; byParent: boolean; terms: 'standard' | 'tough' | 'generous' } | null;
  contractBlock: ReturnType<typeof contractBlock>;
  plan: { pathId: Id; kindLabel: string; style: 'commercial' | 'artistic'; risk: 'safe' | 'bold'; tour: boolean; press: boolean } | null;
  projects: FameProjectView[];
  awards: { name: string; category: string; year: number; project: string; won: boolean }[];
  nominated: { name: string; category: string; project: string; due: number } | null;
  people: { super: string[]; hater: string[]; critic: string[] };
  stalker: { name: string; stage: 'watching' | 'reported' | 'ordered' | 'charged' } | null;
  headlines: { year: number; text: string }[];
  entry: FameEntryView[];
  cross: { pathId: Id; name: string; block: CrossBlock | null }[];
  /** Last year's pay through the ledger, the cuts taken and the scene. */
  income: { gross: number; agent: number; company: number; trust: number; scene: number } | null;
  totals: { projects: number; hits: number; breaks: number; wins: number; nominations: number };
  /** Reasons you can't line up a project now (null when you can). */
  projectBlock: string | null;
}

const name = (state: LifeState, id: Id): string => {
  const p = state.people[id];
  return p ? `${p.name.first} ${p.name.last}` : '';
};

export function pathView(state: LifeState, id: Id, content: ContentBundle): FamePathView | null {
  const def = pathDef(content, id);
  const p = state.fame.paths[id];
  if (!def || !p) return null;
  const nextRung = p.rung < def.rungs.length ? rungDef(def, p.rung + 1) : null;
  return {
    id,
    name: def.name,
    noun: def.noun,
    rung: p.rung,
    rungTitle: rungDef(def, p.rung).title,
    peakTitle: rungDef(def, p.peak).title,
    ladder: def.rungs.map((r, i) => ({ title: r.title, reached: i + 1 <= p.peak, current: i + 1 === p.rung })),
    fame: Math.round(p.fame),
    fameBand: bandOf(p.fame, [10, 30, 55, 80]),
    craft: Math.round(p.craft),
    faded: p.rung < p.peak,
    next: nextRung ? { title: nextRung.title, milestone: rungDef(def, p.rung).milestone, fameNeeded: nextRung.fame, qualityNeeded: nextRung.quality, qualityNow: Math.round(recentQuality(p)) } : null,
    kinds: def.kinds.map((k) => ({ id: k.id, label: k.label, noun: k.noun, blurb: k.blurb, locked: k.minRung > p.rung, minRung: k.minRung })),
    tour: { label: def.tour.label, allowed: p.rung >= def.tour.minRung, minRung: def.tour.minRung },
    press: { label: def.press.label, allowed: p.rung >= def.press.minRung, minRung: def.press.minRung },
    usualYear: usualYear(state, def, p.rung, content),
  };
}

export function getFameView(state: LifeState, content: ContentBundle): FameView {
  const f = state.fame;
  const age = state.character.age;
  const minAge = Math.min(...allPaths(content).map((d) => d.minAge));
  const between = state.phase === 'yearStart' && !isIncarcerated(state);
  const minor = isMinorStar(state, content);
  const main = mainPath(state);
  const agentDef = f.agent ? content.fameAgents[f.agent.agentId] : undefined;
  const ceiling = commitmentCeiling(state, content);
  const floor = commitmentFloor(state, content);
  const order = { back: 0, steady: 1, all: 2 } as const;
  // E6c: a sport has its own screen; this one is for arts and media.
  const sportMain = pathDef(content, f.main)?.sport !== undefined;
  const paths = workedPaths(state)
    .filter((id) => pathDef(content, id)?.sport === undefined)
    .map((id) => pathView(state, id, content))
    .filter((p): p is FamePathView => p !== null);
  const projectBlock = !f.active ? 'inactive' : isIncarcerated(state) ? 'prison' : null;
  const awardOf = (id: Id) => content.fameAwards[id];
  const contract = f.contract;
  const company = contract ? content.fameCompanies[contract.company] : undefined;
  return {
    show: sportMain ? paths.length > 0 : f.active || f.retired !== undefined || age >= minAge,
    active: f.active && paths.length > 0,
    retired: !f.active && f.retired !== undefined && !sportMain,
    between,
    minor,
    years: main ? state.currentYear - main.since : 0,
    paths,
    image: f.image,
    imageBand: bandOf(f.image, [20, 40, 60, 80]),
    fans: f.fans,
    mood: f.mood,
    moodBand: moodBand(f.mood),
    burnout: f.burnout,
    burnoutBand: bandOf(f.burnout, [30, 55, 75]),
    commitment: f.commitment,
    commitments: (['back', 'steady', 'all'] as const).map((id) => ({
      id,
      allowed: f.active && between && id !== f.commitment && order[id] <= order[ceiling] && order[id] >= order[floor],
      block: order[id] > order[ceiling] ? 'young' : order[id] < order[floor] ? 'contract' : null,
    })),
    scene: f.scene,
    scenes: (['low', 'social', 'entourage', 'lavish'] as const).map((id) => ({
      id,
      cost: content.balance.fame.scene.cost[id],
      allowed: f.active && between && !minor && id !== f.scene,
    })),
    agent: agentDef ? { id: agentDef.id, name: agentDef.name, blurb: agentDef.blurb, cut: agentDef.cut, tier: agentDef.tier } : null,
    openAgents: openAgents(state, content).map((a) => ({ id: a.id, name: a.name, blurb: a.blurb, cut: a.cut, tier: a.tier })),
    agentBlocks: Object.fromEntries(Object.keys(content.fameAgents).map((id) => [id, agentBlock(state, id, content)])),
    contract: contract && company ? { company: company.name, kind: company.kind, until: contract.until, share: contract.share, advance: contract.advance, exclusive: contract.exclusive, byParent: contract.byParent, terms: contract.terms } : null,
    contractBlock: contractBlock(state, content),
    plan: f.plan
      ? { pathId: f.plan.path, kindLabel: pathDef(content, f.plan.path)?.kinds.find((k) => k.id === f.plan!.kind)?.label ?? '', style: f.plan.style, risk: f.plan.risk, tour: f.plan.tour, press: f.plan.press }
      : null,
    projects: f.projects
      .filter((p) => pathDef(content, p.path)?.sport === undefined)
      .reverse()
      .slice(0, 6)
      .map((p) => ({
        title: p.title,
        year: p.year,
        pathName: pathDef(content, p.path)?.name ?? '',
        noun: pathDef(content, p.path)?.kinds.find((k) => k.id === p.kind)?.noun ?? 'work',
        style: p.style,
        risk: p.risk,
        tour: p.tour,
        press: p.press,
        quality: p.quality,
        critics: p.critics,
        fans: p.fans,
        band: p.band,
        gain: p.gain,
        earned: p.earned,
        assigned: p.assigned === true,
      })),
    awards: f.awards
      .filter((a) => content.famePaths[a.path]?.sport === undefined)
      .reverse()
      .map((a) => ({ name: awardOf(a.awardId)?.name ?? '', category: awardOf(a.awardId)?.category ?? '', year: a.year, project: a.project, won: a.won })),
    nominated: f.nominated && content.famePaths[content.fameAwards[f.nominated.awardId]?.path ?? '']?.sport === undefined ? { name: awardOf(f.nominated.awardId)?.name ?? '', category: awardOf(f.nominated.awardId)?.category ?? '', project: f.nominated.project, due: f.nominated.due } : null,
    people: {
      super: f.people.super.filter((id) => fanAlive(state, id)).map((id) => name(state, id)),
      hater: f.people.hater.filter((id) => fanAlive(state, id)).map((id) => name(state, id)),
      critic: f.people.critic.filter((id) => fanAlive(state, id)).map((id) => name(state, id)),
    },
    stalker: f.stalker && fanAlive(state, f.stalker.id) ? { name: name(state, f.stalker.id), stage: f.stalker.stage } : null,
    headlines: [...f.headlines].reverse().map((h) => ({ year: h.year, text: h.text })),
    entry: f.active
      ? []
      : allPaths(content).map((d) => ({
          pathId: d.id,
          name: d.name,
          blurb: d.blurb,
          routes: d.routes.map((r) => ({ id: r.id, label: r.label, blurb: r.blurb, minAge: Math.max(r.minAge, d.minAge), block: enterBlock(state, d.id, r.id, content) })),
        })),
    cross: f.active && f.second === null ? allPaths(content).filter((d) => d.id !== f.main).map((d) => ({ pathId: d.id, name: d.name, block: crossBlock(state, d.id, content) })) : [],
    income: f.income.year === state.currentYear || f.income.year === state.currentYear - 1 ? { gross: f.income.gross, agent: f.income.agent, company: f.income.company, trust: f.income.trust, scene: f.income.scene } : null,
    totals: { projects: f.totals.projects, hits: f.totals.hits, breaks: f.totals.breaks, wins: f.totals.wins, nominations: f.totals.nominations },
    projectBlock,
  };
}

/** Why a project with these choices can't be lined up now, or null. */
export function getProjectBlock(state: LifeState, params: { pathId: Id; kindId: Id; style: 'commercial' | 'artistic'; risk: 'safe' | 'bold'; tour: boolean; press: boolean }, content: ContentBundle): string | null {
  return planBlock(state, { path: params.pathId, kind: params.kindId, style: params.style, risk: params.risk, tour: params.tour, press: params.press }, content);
}

/** A rung's title with its article, for sentences in the UI. */
export function titleWithArticle(text: string): string {
  return withArticle(text);
}

/** How many fans, in words ("3,400", "1.2 million"). */
export function fanCount(n: number): string {
  if (n >= 1_000_000) return `${(Math.round(n / 100_000) / 10).toString()} million`;
  return n.toLocaleString('en-US');
}
