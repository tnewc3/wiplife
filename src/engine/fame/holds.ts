/**
 * The `fame` condition (E6b): your career, rung, fame, public image, fan
 * mood, commitment, agent, contract and what has happened this year. Every
 * field given must hold.
 */
import type { Compare, ContentBundle, FameCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { crossBlock, hasFaded } from './ladder';
import { allPaths, mainPath, pathDef, peakRung } from './query';
import { thisYearsProject } from './text';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

/** The tier of the agent you have (0 for none); without content, any agent counts as tier 1. */
function tierOf(state: LifeState, content?: ContentBundle): number {
  const a = state.fame.agent;
  if (!a) return 0;
  return content ? (content.fameAgents[a.agentId]?.tier ?? 1) : 1;
}

export function fameHolds(c: FameCondition, state: LifeState, content?: ContentBundle): boolean {
  const f = state.fame;
  const main = mainPath(state);
  const year = state.currentYear;
  if (c.active !== undefined && f.active !== c.active) return false;
  if (c.retired !== undefined && (!f.active && f.retired !== undefined) !== c.retired) return false;
  if (c.path !== undefined && (f.main === null || !c.path.includes(f.main))) return false;
  if (c.second !== undefined && (f.second !== null) !== c.second) return false;
  if (c.rung && !within(f.active ? (main?.rung ?? 0) : 0, c.rung)) return false;
  if (c.peak && !within(peakRung(state), c.peak)) return false;
  if (c.fame && !within(Math.floor(main?.fame ?? 0), c.fame)) return false;
  if (c.image && !within(f.image, c.image)) return false;
  if (c.mood && !within(f.mood, c.mood)) return false;
  if (c.fans && !within(f.fans, c.fans)) return false;
  if (c.commitment && !c.commitment.includes(f.commitment)) return false;
  if (c.burnout && !within(f.burnout, c.burnout)) return false;
  if (c.agent && !within(tierOf(state, content), c.agent)) return false;
  if (c.contract !== undefined && (f.contract !== null) !== c.contract) return false;
  const project = thisYearsProject(state);
  if (c.released !== undefined && (project !== undefined) !== c.released) return false;
  if (c.last && (project === undefined || !c.last.includes(project.band))) return false;
  if (c.faded !== undefined && hasFaded(state) !== c.faded) return false;
  if (c.gap && !within(main ? year - main.last : 0, c.gap)) return false;
  if (c.years && !within(main ? year - main.since : 0, c.years)) return false;
  if (c.stalker !== undefined) {
    const s = f.stalker;
    if (typeof c.stalker === 'boolean' ? (s !== null) !== c.stalker : s === null || !c.stalker.includes(s.stage)) return false;
  }
  if (c.ceremony && !(f.ceremony?.year === year && c.ceremony.includes(f.ceremony.result))) return false;
  if (c.tabloid !== undefined && f.headlines.some((h) => h.year === year) !== c.tabloid) return false;
  if (c.scandal !== undefined && f.headlines.some((h) => h.year === year && h.kind === 'scandal') !== c.scandal) return false;
  if (c.crossable !== undefined && (content !== undefined && allPaths(content).some((p) => crossBlock(state, p.id, content) === null)) !== c.crossable) return false;
  if (c.top !== undefined) {
    const def = content ? pathDef(content, f.main) : undefined;
    if ((def !== undefined && main !== undefined && main.rung >= def.rungs.length) !== c.top) return false;
  }
  if (c.plan !== undefined && (f.plan !== null) !== c.plan) return false;
  return true;
}
