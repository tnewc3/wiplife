/**
 * Saved lives for the sports grind tests (Batch 5), built with the engine on the test content pack: a teenager with no career
 * who can try out for a school team, a player without a team who can train at a gym, a senior with scholarship offers, and a
 * college player the draft passed by who can go to a camp. Where a flow depends on the day's luck (a tryout), the life's
 * generator is moved until the choice the test makes lands the way the test needs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { finishAction, performAction } from '../../src/engine/actions';
import { enterPath } from '../../src/engine/fame/ladder';
import { createLife, resolveChoice } from '../../src/engine/life';
import { createRng } from '../../src/engine/rng';
import { bestPosition, sportPath } from '../../src/engine/sports/query';
import { teamOptions } from '../../src/engine/sports/tryout';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export type GrindKind = 'prospect' | 'teamless' | 'senior' | 'undrafted';

export interface GrindLife {
  seed: string;
  kind: GrindKind;
}

/** A person of this age with money, a strong body and a fitting talent, moved to the start of the year without living the years. */
function base(seed: string, age: number, content: ContentBundle): LifeState {
  const created = createLife({ mode: 'random', seed, birthYear: 1990, countryId: 'us' }, content);
  return produce(created, (d) => {
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
    d.finances.savings = 8_000;
    d.character.hidden.talent = 'athletics';
    d.character.stats.fitness = 88;
    d.character.personality.discipline = 78;
    if (age >= 18) d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 3 };
  });
}

function withSeason(d: LifeState, level: 'school' | 'college', rating: number, team: string): void {
  d.sports.seasons.push({
    year: d.currentYear - 1,
    sport: 'basketball',
    level,
    team,
    position: d.sports.position!,
    rating,
    played: 95,
    wins: 14,
    draws: 0,
    losses: 4,
    rank: 1,
    of: 10,
    result: 'out',
    stats: { points: 18, rebounds: 7 },
    salary: 0,
    allStar: false,
  });
  d.sports.totals.seasons = 3;
}

/** Tries a candidate out and says whether it did what the test wants. */
function search(make: (seed: string) => LifeState, works: (life: LifeState) => boolean, label: string): LifeState {
  for (let i = 0; i < 200; i++) {
    const candidate = make(`${label}:${i}`);
    if (works(candidate)) return candidate;
  }
  throw new Error(`no seed works for ${label}`);
}

/** The scrimmage with one approach, played to the end. */
function playTryout(life: LifeState, teamKey: string, approach: string, content: ContentBundle): LifeState {
  let next = performAction(life, 'try_out', { pathId: 'basketball', teamKey }, content);
  next = resolveChoice(next, next.pending[0]!.instanceId, approach, content);
  return finishAction(next);
}

export function grindLife(options: GrindLife): LifeState {
  const content = pack();
  const def = sportPath(content, 'basketball')!;
  switch (options.kind) {
    case 'prospect': {
      // A fifteen-year-old with no career who makes the varsity when they dive on everything.
      return search(
        (seed) => produce(base(seed, 15, content), (d) => void (d.rng = createRng(`${options.seed}:${seed}`))),
        (life) => playTryout(life, 'school:varsity', 'hustle', content).sports.tried.at(-1)?.made === true,
        options.seed,
      );
    }
    case 'teamless': {
      const life = produce(base(options.seed, 15, content), (d) => {
        enterPath(d as LifeState, 'basketball', 'school_tryout', content);
        d.sports.position = bestPosition(d as LifeState, def.sport).id;
        withSeason(d as LifeState, 'school', 62, 'Westfield Comets');
        d.sports.team = null;
        d.sports.teamless = true;
        d.teen.activities = [];
      });
      return life;
    }
    case 'senior': {
      return produce(base(options.seed, 17, content), (d) => {
        enterPath(d as LifeState, 'basketball', 'school_tryout', content);
        withSeason(d as LifeState, 'school', 80, d.sports.team?.name ?? 'Westfield Comets');
        d.fame.paths.basketball!.fame = 45;
        d.education.current = { program: 'high', year: 4, lengthYears: 4, gpa: 3.6, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 3 };
        d.sports.offers = [
          { year: d.currentYear, tier: 'state', share: 0.6 },
          { year: d.currentYear, tier: 'elite', share: 0.85 },
        ];
      });
    }
    case 'undrafted': {
      // A college player the draft passed by, who gets a deal from the easiest camp when they play it steady.
      const build = (seed: string) =>
        produce(base(seed, 22, content), (d) => {
          enterPath(d as LifeState, 'basketball', 'open_tryout', content);
          withSeason(d as LifeState, 'college', 61, d.sports.team?.name ?? 'State Falcons');
          d.sports.passed = d.currentYear - 1;
          d.fame.paths.basketball!.fame = 20;
          d.fame.paths.basketball!.skills = Object.fromEntries(def.skills!.map((s) => [s.id, 55]));
          d.rng = createRng(`${options.seed}:${seed}`);
        });
      return search(
        build,
        (life) => {
          const camp = teamOptions(life, def, content).filter((o) => o.level === 'pro').sort((a, b) => a.bar - b.bar)[0];
          return camp !== undefined && playTryout(life, camp.key, 'steady', content).sports.pro;
        },
        options.seed,
      );
    }
  }
}

/** The key of the pro camp that is easiest to make (the one the tests click). */
export function easiestCamp(life: LifeState): string {
  const content = pack();
  const def = sportPath(content, 'basketball')!;
  return teamOptions(life, def, content)
    .filter((o) => o.level === 'pro')
    .sort((a, b) => a.bar - b.bar)[0]!.key;
}
