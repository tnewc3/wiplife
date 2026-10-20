/**
 * Values fame events and history lines can use in their text (E6b):
 * {project} and {noun} (this year's release and what kind of work it was),
 * {review} and {fanLine} (short quotes from critics and from fans),
 * {rungTitle} (what you are now, with its article) and {nextTitle} (the next
 * rung), {pathNoun}, {secondPath}, {company}, {agent}, {award} and {headline};
 * Batch 4: {bandName} (your band, or the one you were last in), {genre} (your
 * main genre), {releaseGenre} (this year's release's), {venue} (the last show
 * you played going into this year), {tourNoun} (the tour you went on as this
 * year began) and {offerName} (the newest band that asked you in).
 * The content build checks that an event using one requires what it names
 * (tools/content/fame.ts). Reads only: nothing here draws from the generator.
 */
import { FAME_TEXT_VALUES, type ContentBundle, type FameBand } from '../../content/schemas';
import { renderText } from '../text';
import type { FameProject, LifeState } from '../types';
import { tourNoun } from './grind';
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

function genreNoun(id: string | undefined, content: ContentBundle): string {
  return id === undefined ? '' : (content.fameGenres[id]?.noun ?? '');
}

/** The last show you played going into this year, as it reads in a sentence ("an open mic"). */
function venueNoun(state: LifeState, content: ContentBundle): string {
  const show = state.fame.played.year === state.currentYear ? state.fame.played.lastShow : undefined;
  if (!show) return '';
  for (const def of Object.values(content.famePaths)) {
    const v = def.shows?.venues.find((x) => x.id === show.venue);
    if (v) return v.noun;
  }
  return '';
}

/** The tour you went on as this year began ("a regional tour"). */
function tourText(state: LifeState, content: ContentBundle): string {
  const played = state.fame.played;
  const def = pathDef(content, state.fame.main);
  return played.year === state.currentYear && played.tour !== null && def ? tourNoun(def, played.tour, content) : '';
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
    bandName: f.band?.name ?? f.pastBands.at(-1)?.name ?? '',
    genre: genreNoun(path?.genre, content),
    releaseGenre: genreNoun(project?.genre, content),
    venue: venueNoun(state, content),
    tourNoun: tourText(state, content),
    offerName: f.offers.at(-1)?.name ?? '',
  };
}
