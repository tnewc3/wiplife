/**
 * A saved life for the fame tests (E6b): a grown-up (or a young star) with a
 * career in one of the paths, an agent, a release behind them and a headline
 * in the papers, built with the engine on the test content pack and written
 * into the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { enterPath, retire } from '../../src/engine/fame/ladder';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface FameLife {
  seed: string;
  /** No career at all (the ways in show). */
  none?: boolean;
  retired?: boolean;
  /** Under 18, with a parent who signs. */
  age?: number;
  /** A tabloid headline from this year. */
  headline?: boolean;
  pathId?: string;
}

export function fameLife(options: FameLife): LifeState {
  const content = pack();
  const age = options.age ?? 29;
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 1990 }, content);
  return produce(base, (d) => {
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
    const pathId = options.pathId ?? 'music';
    const route = age < 14 ? 'lessons' : 'open_mic';
    enterPath(d as LifeState, pathId, route, content);
    const p = d.fame.paths[pathId]!;
    p.rung = 3;
    p.peak = 3;
    p.fame = 30;
    p.craft = 45;
    p.recent = [50, 52];
    d.fame.fans = 1_200;
    if (age >= 18) d.fame.agent = { agentId: 'quill_and_marlow', since: d.currentYear - 1 };
    d.fame.projects.push({
      year: d.currentYear - 1,
      path: pathId,
      kind: content.famePaths[pathId]!.kinds[0]!.id,
      title: content.text.fame.titles[pathId]![0]!,
      style: 'artistic',
      risk: 'bold',
      tour: false,
      press: true,
      quality: 62,
      critics: 74,
      fans: 51,
      band: 'cult',
      gain: 5,
      earned: 4_200,
    });
    if (options.headline) d.fame.headlines.push({ year: d.currentYear, text: 'Rising Star Caught Out Until Dawn', kind: 'scandal' });
    if (options.retired) retire(d as LifeState, content);
  });
}
