/**
 * A saved life for the sports tests (E6c): an athlete in one of the five
 * sports, at the level asked for, with a team, a position, a deal and a season
 * behind them (or a playoff series waiting in the event sheet), built with the
 * engine on the test content pack and written into the app's database before
 * it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { resolveChoice, createLife } from '../../src/engine/life';
import { enterPath } from '../../src/engine/fame/ladder';
import { retireSports } from '../../src/engine/sports/retire';
import { signDraftDeal } from '../../src/engine/sports/contract';
import { draftingTeam } from '../../src/engine/sports/team';
import { createRng } from '../../src/engine/rng';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface SportsLife {
  seed: string;
  /** No career at all (the ways in show). */
  none?: boolean;
  /** Left the game. */
  retired?: boolean;
  /** In the pros, under a deal (the default is a school team). */
  pro?: boolean;
  age?: number;
  sport?: string;
  /** A playoff series waiting in the event sheet (the first series). */
  series?: boolean;
}

export function sportsLife(options: SportsLife): LifeState {
  const content = pack();
  const age = options.age ?? (options.pro ? 25 : 15);
  const sport = options.sport ?? 'basketball';
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 1990 }, content);
  const life = produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    d.teen = startingTeen(age, d.currentYear, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    for (const person of Object.values(d.people)) {
      if (d.currentYear - person.birthYear >= content.balance.mortality.maxAge) {
        person.alive = false;
        person.deathYear = d.currentYear;
      }
    }
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
    d.finances.savings = 5_000;
    if (age >= 18) d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 3 };
    if (options.none) return;
    const def = content.famePaths[sport]!;
    const route = options.pro ? 'open_tryout' : age < 13 ? 'youth_league' : 'school_tryout';
    d.character.hidden.talent = options.pro ? 'athletics' : d.character.hidden.talent;
    enterPath(d as LifeState, sport, route, content);
    const rng = createRng(`${options.seed}:sports`);
    if (options.pro) {
      d.sports.draft = { year: d.currentYear, pick: 4, round: 1, teamId: draftingTeam(def.sport!, 4, content).id };
      signDraftDeal(d as LifeState, content, rng);
      d.fame.agent = { agentId: 'quill_and_marlow', since: d.currentYear - 1 };
      d.fame.paths[sport]!.rung = 5;
      d.fame.paths[sport]!.peak = 5;
      d.fame.paths[sport]!.fame = 46;
    }
    const position = d.sports.position!;
    const keyStats = (def.sport!.positions.find((p) => p.id === position) ?? def.sport!.positions[0]!).stats;
    d.sports.seasons.push({
      year: d.currentYear - 1,
      sport,
      level: options.pro ? 'pro' : 'school',
      team: d.sports.team?.name ?? 'The team',
      position,
      rating: 66,
      played: 92,
      wins: options.pro ? 51 : 12,
      draws: 0,
      losses: options.pro ? 31 : 6,
      rank: 3,
      of: options.pro ? 12 : 10,
      result: 'out',
      stats: Object.fromEntries(keyStats.map((s) => [s.id, Math.round(((s.low + s.high) / 2) * 10) / 10])),
      salary: d.sports.contract?.salary ?? 0,
      allStar: false,
    });
    d.fame.projects.push({ year: d.currentYear - 1, path: sport, kind: def.kinds[0]!.id, title: 'The season', style: 'commercial', risk: 'safe', tour: false, press: false, quality: 66, critics: 62, fans: 70, band: 'hit', gain: 4, earned: d.sports.contract?.salary ?? 0 });
    d.sports.totals.seasons = 3;
    d.sports.totals.proSeasons = options.pro ? 2 : 0;
    if (options.retired) retireSports(d as LifeState, 'normal', 'retired', content, rng);
  });
  if (!options.series) return life;
  // A playoff series waiting in the event sheet; pick a seed where the first choice wins, so the run can be followed to the next series.
  for (let i = 0; i < 80; i++) {
    const candidate = produce(life, (d) => {
      d.phase = 'events';
      d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
      d.lifetime = { happinessTotal: d.character.stats.happiness * (d.character.age - 1), years: d.character.age - 1 };
      d.sports.run = { year: d.currentYear, won: 0, alive: true, strength: 64, rival: 56 };
      d.sports.seasons.push({ ...d.sports.seasons.at(-1)!, year: d.currentYear, result: 'out' });
      d.pending = [{ instanceId: `e${d.currentYear}-1`, eventId: 'playoffs_opening_series', cast: {} }];
      d.rng = createRng(`${options.seed}:series:${i}`);
    });
    if (resolveChoice(candidate, `e${candidate.currentYear}-1`, 'trust', content).sports.run?.won === 1) return candidate;
  }
  throw new Error('no seed wins the series');
}
