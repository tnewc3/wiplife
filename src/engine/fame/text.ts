/**
 * Values fame events and history lines can use in their text (E6b):
 * {project} and {noun} (this year's release and what kind of work it was),
 * {review} and {fanLine} (short quotes from critics and from fans),
 * {rungTitle} (what you are now, with its article) and {nextTitle} (the next
 * rung), {pathNoun}, {secondPath}, {company}, {agent}, {award} and {headline}.
 * The content build checks that an event using one requires what it names
 * (tools/content/fame.ts). Reads only: nothing here draws from the generator.
 */
import { FAME_TEXT_VALUES, type ContentBundle, type FameBand } from '../../content/schemas';
import { renderText } from '../text';
import type { FameProject, LifeState } from '../types';
import { kindDef, pathDef, rungDef, withArticle } from './query';

export { FAME_TEXT_VALUES };

/** The release of this year, if there was one. */
export function thisYearsProject(state: LifeState): FameProject | undefined {
  const p = state.fame.projects.at(-1);
  return p && p.year === state.currentYear ? p : undefined;
}

/** A quote for a band, picked by the work itself so it reads the same every time it is shown. */
function quote(project: FameProject, kind: 'critic' | 'fan', content: ContentBundle): string {
  const lines = content.text.fame[kind][project.band as FameBand];
  const i = (project.year + project.title.length + project.quality + (kind === 'fan' ? 1 : 0)) % lines.length;
  const noun = kindDef(pathDef(content, project.path)!, project.kind)?.noun ?? 'work';
  return renderText(lines[i]!, { values: { project: project.title, noun } });
}

export function fameTextValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const f = state.fame;
  const def = pathDef(content, f.main);
  const path = f.main === null ? undefined : f.paths[f.main];
  const project = thisYearsProject(state);
  const projectDef = project ? pathDef(content, project.path) : undefined;
  const second = pathDef(content, f.second);
  const rung = def && path ? rungDef(def, path.rung) : undefined;
  const next = def && path && path.rung < def.rungs.length ? rungDef(def, path.rung + 1) : undefined;
  const award = f.ceremony ? content.fameAwards[f.ceremony.awardId] : undefined;
  return {
    pathNoun: def?.noun ?? '',
    secondPath: second?.noun ?? '',
    rungTitle: rung ? withArticle(rung.title) : '',
    nextTitle: next?.title ?? '',
    project: project?.title ?? (f.ceremony?.year === state.currentYear ? f.ceremony.project : ''),
    noun: project && projectDef ? (kindDef(projectDef, project.kind)?.noun ?? 'work') : '',
    review: project ? quote(project, 'critic', content) : '',
    fanLine: project ? quote(project, 'fan', content) : '',
    company: f.contract ? (content.fameCompanies[f.contract.company]?.name ?? '') : '',
    agent: f.agent ? (content.fameAgents[f.agent.agentId]?.name ?? '') : '',
    award: award ? award.name : '',
    headline: f.headlines.find((h) => h.year === state.currentYear)?.text ?? '',
  };
}
