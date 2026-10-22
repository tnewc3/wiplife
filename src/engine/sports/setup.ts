/**
 * Your teams (Batch 6): the changes a player makes to the world of teams in Settings, and the checks every one passes.
 *
 * - `renamed`: a team's name and nickname, keyed by team id;
 * - `moved`: a team's city, among the game's cities, keyed by team id;
 * - `added`: teams the player makes (a name, a nickname, a city, a strength level from 1 to 5, and for soccer the league).
 *
 * The same shape is stored in the settings database, copied into every new life when it begins (the life's snapshot, so that the
 * life replays exactly whatever the settings say later) and carried by the recorded input that changes a life in progress. This file
 * is pure: no storage, no browser. Numbers: balance/sports.yaml world.
 */
import { z } from 'zod';
import { idSchema, type ContentBundle } from '../../content/schemas';

export const TEAM_NAME_MAX = 40;
export const TEAM_NICKNAME_MAX = 30;
export const TEAM_NAME_MIN = 2;

const codePoints = (s: string): number => [...s].length;
const normalized = (s: string): string => s.normalize('NFC').trim().replace(/\s+/g, ' ');

/** Letters from any script, digits, spaces and a few marks inside a name: no control characters, no markup. */
const TEAM_TEXT = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’.&\- ]*$/u;

const teamText = (what: string, max: number) =>
  z
    .string()
    .transform(normalized)
    .refine((s) => s.length > 0, `Enter ${what}`)
    .refine((s) => codePoints(s) >= TEAM_NAME_MIN, `${what} needs at least ${TEAM_NAME_MIN} characters`)
    .refine((s) => codePoints(s) <= max, `Use ${max} characters or fewer`)
    .refine((s) => s.length === 0 || TEAM_TEXT.test(s), 'Use letters, numbers, spaces, hyphens, periods, ampersands or apostrophes');

export const teamNameSchema = teamText('a team name', TEAM_NAME_MAX);
export const teamNicknameSchema = teamText('a nickname', TEAM_NICKNAME_MAX);

/** The id of a team a player adds: `custom_` and then letters and digits. */
export const CUSTOM_ID = /^custom_[a-z0-9]{1,16}(_[a-z0-9]{1,16})?$/;
export const customTeamIdSchema = z.string().regex(CUSTOM_ID, 'A made-up team has an id like custom_1');

export const STRENGTH_LEVELS = [1, 2, 3, 4, 5] as const;
export const strengthSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const renameSchema = z.strictObject({ name: teamNameSchema.optional(), nickname: teamNicknameSchema.optional() }).refine((r) => r.name !== undefined || r.nickname !== undefined, 'A rename changes a name or a nickname');

export const addedTeamSchema = z.strictObject({
  id: customTeamIdSchema,
  /** The sport (a fame path) the team plays. */
  sport: idSchema,
  name: teamNameSchema,
  nickname: teamNicknameSchema.optional(),
  /** One of the game's cities. */
  city: idSchema,
  strength: strengthSchema,
  /** Soccer only: the league the team starts in (1 is the top league). */
  tier: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type AddedTeam = z.infer<typeof addedTeamSchema>;

export const teamSetupSchema = z.strictObject({
  renamed: z.record(idSchema, renameSchema),
  moved: z.record(idSchema, idSchema),
  added: z.array(addedTeamSchema).max(40),
});
export type TeamSetup = z.infer<typeof teamSetupSchema>;

export const emptySetup = (): TeamSetup => ({ renamed: {}, moved: {}, added: [] });

export const isEmptySetup = (s: TeamSetup): boolean => Object.keys(s.renamed).length === 0 && Object.keys(s.moved).length === 0 && s.added.length === 0;

/** The part of a setup that changes the simulation (a rename is display-only, so it is not part of what a life in progress can take up). */
export interface SetupChange {
  moved: Record<string, string>;
  added: AddedTeam[];
}
export const setupChangeSchema = z.strictObject({ moved: z.record(idSchema, idSchema), added: z.array(addedTeamSchema).max(40) });

export interface SetupIssue {
  path: string;
  message: string;
}

/** The id of a sport's team in content (the list a setup can rename or move), with its name, nickname and city. */
export interface KnownTeam {
  id: string;
  sport: string;
  name: string;
  nickname: string | undefined;
  city: string;
}

/** Every pro team in content, in sport and id order. */
export function knownTeams(content: ContentBundle): KnownTeam[] {
  const out: KnownTeam[] = [];
  for (const id of Object.keys(content.famePaths).sort()) {
    const def = content.famePaths[id]!;
    if (def.retired || !def.sport) continue;
    for (const t of def.sport.leagues.pro.teams) out.push({ id: t.id, sport: id, name: t.name, nickname: t.nickname, city: t.city });
  }
  return out;
}

const lower = (s: string): string => s.toLocaleLowerCase('en-US');

/**
 * Checks a setup against the content: teams that exist, cities that exist, a sport that exists, names nobody else in the sport
 * has, and no more added teams than the balance allows. Returns the problems found (empty: the setup is good).
 */
export function setupIssues(setup: TeamSetup, content: ContentBundle): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const known = new Map(knownTeams(content).map((t) => [t.id, t]));
  const activeCity = (id: string): boolean => content.cities[id] !== undefined && content.cities[id]!.retired !== true;
  const names = new Map<string, Map<string, string>>();
  const claim = (sport: string, name: string, owner: string, path: string): void => {
    const bySport = names.get(sport) ?? new Map<string, string>();
    names.set(sport, bySport);
    const key = lower(name);
    const other = bySport.get(key);
    if (other !== undefined && other !== owner) issues.push({ path, message: `Another ${sport} team is already called ${name}` });
    else bySport.set(key, owner);
  };
  // Names go in sport by sport: the built-in names first (a renamed team gives its old name up), then the new ones.
  for (const t of known.values()) if (setup.renamed[t.id]?.name === undefined) claim(t.sport, t.name, t.id, `renamed.${t.id}`);
  for (const [id, r] of Object.entries(setup.renamed)) {
    const t = known.get(id);
    if (!t) issues.push({ path: `renamed.${id}`, message: 'That team does not exist' });
    else if (r.name !== undefined) claim(t.sport, r.name, id, `renamed.${id}.name`);
  }
  for (const [id, city] of Object.entries(setup.moved)) {
    if (!known.has(id) && !setup.added.some((a) => a.id === id)) issues.push({ path: `moved.${id}`, message: 'That team does not exist' });
    if (!activeCity(city)) issues.push({ path: `moved.${id}`, message: 'Choose one of the game’s cities' });
  }
  if (setup.added.length > content.balance.sports.world.added.max) issues.push({ path: 'added', message: `Add up to ${content.balance.sports.world.added.max} teams` });
  const seen = new Set<string>();
  setup.added.forEach((a, i) => {
    const path = `added.${i}`;
    if (seen.has(a.id)) issues.push({ path, message: 'Two made-up teams share an id' });
    seen.add(a.id);
    const def = content.famePaths[a.sport];
    if (!def || def.retired || !def.sport) issues.push({ path: `${path}.sport`, message: 'Choose a sport' });
    else {
      claim(a.sport, a.name, a.id, `${path}.name`);
      if (a.tier === 2 && def.sport.leagues.pro.tiers === undefined) issues.push({ path: `${path}.tier`, message: `${def.name} has one league` });
    }
    if (!activeCity(a.city)) issues.push({ path: `${path}.city`, message: 'Choose one of the game’s cities' });
  });
  return issues;
}

/** The first thing wrong with a setup, in words: its shape, then the content (null when it is fine). For forms. */
export function firstSetupProblem(input: unknown, content: ContentBundle): string | null {
  const shape = teamSetupSchema.safeParse(input);
  if (!shape.success) return shape.error.issues[0]?.message ?? 'Check the team details.';
  return setupIssues(shape.data, content)[0]?.message ?? null;
}

/** Validates unknown input into a setup: the shape first, then the content. Throws SetupError listing every problem. */
export class SetupError extends Error {
  override name = 'SetupError';
  constructor(readonly issues: SetupIssue[]) {
    super(`Invalid team setup: ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')}`);
  }
}

export function parseTeamSetup(input: unknown, content: ContentBundle): TeamSetup {
  const result = teamSetupSchema.safeParse(input);
  if (!result.success) throw new SetupError(result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const issues = setupIssues(result.data, content);
  if (issues.length > 0) throw new SetupError(issues);
  return result.data;
}

/**
 * A setup for new lives from whatever settings hold now: parts that no longer fit the content (a team that was removed from the
 * game, a city that was retired) are dropped, so a stale setting never stops a life from beginning.
 */
export function usableSetup(input: unknown, content: ContentBundle): TeamSetup {
  const parsed = teamSetupSchema.safeParse(input);
  if (!parsed.success) return emptySetup();
  let setup = parsed.data;
  const known = new Set(knownTeams(content).map((t) => t.id));
  const activeCity = (id: string): boolean => content.cities[id] !== undefined && content.cities[id]!.retired !== true;
  const added = setup.added.filter((a) => content.famePaths[a.sport]?.sport !== undefined && activeCity(a.city));
  const addedIds = new Set(added.map((a) => a.id));
  setup = {
    renamed: Object.fromEntries(Object.entries(setup.renamed).filter(([id]) => known.has(id))),
    moved: Object.fromEntries(Object.entries(setup.moved).filter(([id, city]) => (known.has(id) || addedIds.has(id)) && activeCity(city))),
    added,
  };
  // Names that clash after the filtering go back to the game's own.
  for (let attempts = 0; attempts < 4; attempts++) {
    const issues = setupIssues(setup, content);
    if (issues.length === 0) return setup;
    const bad = new Set(issues.map((i) => i.path));
    setup = {
      renamed: Object.fromEntries(Object.entries(setup.renamed).filter(([id]) => !bad.has(`renamed.${id}`) && !bad.has(`renamed.${id}.name`))),
      moved: Object.fromEntries(Object.entries(setup.moved).filter(([id]) => !bad.has(`moved.${id}`))),
      added: setup.added.filter((_, i) => !issues.some((x) => x.path === `added.${i}` || x.path.startsWith(`added.${i}.`))),
    };
  }
  return emptySetup();
}

/** A name the life holds for a team and the name the player has given it since (Batch 6: a rename during a life is display-only). */
export interface TeamRename {
  from: string;
  to: string;
}

/**
 * The names to show instead of the names a life was written with: for every team (and every team the player added) whose name or
 * nickname in the player's settings now differs from the one in the life's snapshot, keyed by team id. Reads only; the life never
 * changes. Longest first, so a name that contains another is replaced whole.
 */
export function teamRenames(lifeSetup: TeamSetup, current: TeamSetup, content: ContentBundle): TeamRename[] {
  const out: TeamRename[] = [];
  const add = (from: string | undefined, to: string | undefined): void => {
    if (from !== undefined && to !== undefined && from !== to && from.length > 0 && !out.some((r) => r.from === from)) out.push({ from, to });
  };
  for (const t of knownTeams(content)) {
    add(lifeSetup.renamed[t.id]?.name ?? t.name, current.renamed[t.id]?.name ?? t.name);
    const lifeNick = lifeSetup.renamed[t.id]?.nickname ?? t.nickname;
    const nowNick = current.renamed[t.id]?.nickname ?? t.nickname;
    add(lifeNick, nowNick);
  }
  for (const a of lifeSetup.added) {
    const now = current.added.find((x) => x.id === a.id);
    if (now) {
      add(a.name, now.name);
      add(a.nickname, now.nickname);
    }
  }
  return out.sort((a, b) => b.from.length - a.from.length);
}

/** Text with the player's current names for teams in place of the names the life was written with. */
export function withTeamNames(text: string, renames: readonly TeamRename[]): string {
  let out = text;
  for (const r of renames) if (out.includes(r.from)) out = out.split(r.from).join(r.to);
  return out;
}
