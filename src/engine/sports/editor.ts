/**
 * What the Teams editor in Settings shows (Batch 6): every sport's teams as the player's setup leaves them, and the cities a team
 * can be moved to. Reads only; nothing here touches a life.
 */
import type { ContentBundle } from '../../content/schemas';
import { teamsWithSetup, type ProTeam } from './league';
import { nicknameOf } from './text';
import type { TeamSetup } from './setup';

export interface TeamEditorRow {
  id: string;
  name: string;
  nickname: string;
  /** The city of the game the team plays in (or, away from the modeled cities, the one you would live in). */
  cityId: string;
  cityName: string;
  /** Where the team really plays when that is not a city of the game. */
  place: string | null;
  /** The league (1 is the top league) for a sport with two. */
  division: 1 | 2 | null;
  renamed: boolean;
  moved: boolean;
  custom: boolean;
  strength: number | null;
}

export interface TeamEditorSport {
  id: string;
  name: string;
  /** Names of the leagues for a sport with two. */
  tiers: readonly string[] | null;
  teams: TeamEditorRow[];
}

export interface TeamEditorView {
  sports: TeamEditorSport[];
  cities: { id: string; name: string; country: string }[];
  strengths: { level: 1 | 2 | 3 | 4 | 5; label: string }[];
}

const LEVEL_LABELS = ['Weak', 'Below average', 'Average', 'Strong', 'Elite'] as const;

function row(t: ProTeam, setup: TeamSetup, content: ContentBundle): TeamEditorRow {
  const added = setup.added.find((a) => a.id === t.id);
  return {
    id: t.id,
    name: t.name,
    nickname: nicknameOf(t, content),
    cityId: t.city,
    cityName: content.cities[t.city]?.name ?? t.city,
    place: t.cityName ?? null,
    division: null,
    renamed: setup.renamed[t.id] !== undefined,
    moved: setup.moved[t.id] !== undefined,
    custom: t.custom === true,
    strength: added?.strength ?? null,
  };
}

export function getTeamEditorView(setup: TeamSetup, content: ContentBundle): TeamEditorView {
  const sports = Object.keys(content.famePaths)
    .sort()
    .map((id) => content.famePaths[id]!)
    .filter((d) => !d.retired && d.sport !== undefined)
    .map((d) => {
      const tiers = d.sport!.leagues.pro.tiers ?? null;
      return {
        id: d.id,
        name: d.name,
        tiers,
        teams: teamsWithSetup(setup, d.id, content)
          .map((t) => ({ ...row(t, setup, content), division: tiers === null ? null : t.tier }))
          .sort((a, b) => (a.division ?? 0) - (b.division ?? 0) || a.name.localeCompare(b.name)),
      };
    });
  const cities = Object.values(content.cities)
    .filter((c) => !c.retired)
    .map((c) => ({ id: c.id, name: c.name, country: content.countries[c.countryId]?.name ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { sports, cities, strengths: LEVEL_LABELS.map((label, i) => ({ level: (i + 1) as 1 | 2 | 3 | 4 | 5, label })) };
}
