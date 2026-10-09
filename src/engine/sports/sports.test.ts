import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { evaluate } from '../conditions';
import { applyEffects } from '../events/effects';
import { enterBlock, enterPath } from '../fame/ladder';
import { rungDef } from '../fame/query';
import { runFame } from '../fame/step';
import { checkInvariants } from '../invariants';
import { resolveChoice } from '../life';
import { createRng } from '../rng';
import { getSportsView } from '../selectors';
import { yearIncome } from '../systems/career';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { declineDraft, draftSlot, extend, moveToTeam, releasePlayer, salaryFor, signDraftDeal, tradePlayer } from './contract';
import { agePain, injuryRisk, missedShare, rollInjury } from './injury';
import { applySeries, nextSeries, settleRun } from './playoffs';
import { bestPosition, fitFor, inSports, levelNow, levelOfRung, ordinal, sportPath } from './query';
import { retireSports, routeBlock, takeRoute } from './retire';
import { playSeason, ratingFor } from './season';
import { sportsHolds } from './holds';
import { amateurTeam, collegeTier, draftingTeam, proTeamsIn } from './team';

const b = content.balance.sports;
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|scheduled/.test(f))).toEqual([]);
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const player = (seed = 'sp', age = 15, id = 'basketball', route = 'school_tryout', talent: string | null = null, over: (d: LifeState) => void = () => {}) =>
  apply(lifeAtAge(seed, age), (d) => {
    d.character.hidden.talent = talent;
    enterPath(d, id, route, content);
    over(d);
  });
const yearStep = (life: LifeState) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runFame(d, content);
  });
const many = <T,>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));
const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;

/** A pro on a team with a deal: drafted straight from college at 21. */
const pro = (seed = 'pro', id = 'basketball', over: (d: LifeState) => void = () => {}) =>
  apply(player(seed, 21, id, 'open_tryout', 'athletics'), (d) => {
    const def = sportPath(content, id)!;
    d.sports.draft = { year: d.currentYear, pick: 5, round: 1, teamId: draftingTeam(def.sport, 5, content).id };
    signDraftDeal(d, content, createRng(`${seed}:sign`));
    over(d);
  });

describe('starting a sport', () => {
  it('starts at the rung of the route, with a position that fits, a team in your city and the usual focus', () => {
    const life = player('start', 15);
    expect(life.fame).toMatchObject({ active: true, main: 'basketball' });
    expect(life.fame.paths.basketball!.rung).toBe(2);
    expect(life.sports.sport).toBe('basketball');
    expect(life.sports.position).toBe(bestPosition(life, sportPath(content, 'basketball')!.sport).id);
    expect(life.sports.team).toMatchObject({ level: 'school', city: life.character.cityId });
    expect(life.sports.focus).toBe('skills');
    expect(levelNow(life, content)).toBe('school');
    ok(life);
  });

  it('respects each route’s youngest and oldest age, and a sport is not an arts career', () => {
    expect(enterBlock(lifeAtAge('e', 9), 'soccer', 'youth_league', content)).toBeNull();
    expect(enterBlock(lifeAtAge('e', 15), 'soccer', 'youth_league', content)).toBe('age');
    expect(enterBlock(lifeAtAge('e', 12), 'soccer', 'school_tryout', content)).toBe('age');
    expect(enterBlock(lifeAtAge('e', 17), 'football', 'open_tryout', content)).toBe('age');
    expect(enterBlock(lifeAtAge('e', 18), 'football', 'open_tryout', content)).toBeNull();
    expect(enterBlock(lifeAtAge('e', 40), 'hockey', 'open_tryout', content)).toBe('age');
  });

  it('is started and changed only through checked actions', () => {
    const life = lifeAtAge('act', 16);
    expect(isLifeActionAvailable(life, 'enter_fame', { pathId: 'hockey', routeId: 'school_tryout' }, content)).toBe(true);
    const next = performAction(life, 'enter_fame', { pathId: 'hockey', routeId: 'school_tryout' }, content);
    expect(next.sports.sport).toBe('hockey');
    const other = sportPath(content, 'hockey')!.sport.positions.find((p) => p.id !== next.sports.position)!;
    expect(performAction(next, 'set_position', { positionId: other.id }, content).sports.position).toBe(other.id);
    expect(performAction(next, 'set_focus', { sportFocus: 'film' }, content).sports.focus).toBe('film');
    expect(() => performAction(next, 'set_position', { positionId: 'nope' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(next, 'set_focus', { sportFocus: 'skills' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(next, 'set_focus', { sportFocus: 'film', extra: 1 }, content)).toThrow(InvalidInputError);
    expect(() => performAction(next, 'ask_trade', {}, content)).toThrow(InvalidInputError);
    expect(() => performAction(next, 'retire_sports', { routeKey: 'astronaut' }, content)).toThrow(InvalidInputError);
  });

  it('is not an arts career: the Fame screen leaves it to the Sports screen', () => {
    const life = player('view');
    expect(getSportsView(life, content).active).toBe(true);
    expect(getSportsView(life, content).sport?.id).toBe('basketball');
  });
});

describe('a season’s rating', () => {
  const rating = (life: LifeState, seed: string) => {
    const path = sportPath(content, life.sports.sport)!;
    return ratingFor(life, path, life.sports.team!, 0, content, createRng(seed));
  };
  const avg = (make: (i: number) => LifeState) => mean(many(40, (i) => rating(make(i), `r${i}`)));

  it('is higher with a fitting talent, which counts most', () => {
    const talent = avg((i) => player(`t${i}`, 24, 'basketball', 'open_tryout', 'athletics'));
    const none = avg((i) => player(`t${i}`, 24, 'basketball', 'open_tryout', null));
    expect(talent - none).toBeGreaterThan(15);
  });

  it('rises with Fitness and with how well you fit your position', () => {
    const fit = (value: number) => avg((i) => apply(player(`f${i}`, 24, 'basketball', 'open_tryout'), (d) => void (d.character.stats.fitness = value)));
    expect(fit(90) - fit(20)).toBeGreaterThan(5);
    const lifeX = player('pos', 24, 'basketball', 'open_tryout');
    const def = sportPath(content, 'basketball')!.sport;
    const ranked = [...def.positions].sort((x, y) => fitFor(lifeX, y) - fitFor(lifeX, x));
    const at = (position: string) => mean(many(60, (i) => rating(apply(player(`p${i}`, 24, 'basketball', 'open_tryout'), (d) => void (d.sports.position = position)), `p${i}`)));
    const bestAverage = mean(many(60, (i) => fitFor(player(`p${i}`, 24), ranked[0]!)));
    expect(bestAverage).toBeGreaterThan(0);
    expect(at(ranked[0]!.id)).toBeGreaterThanOrEqual(at(ranked.at(-1)!.id) - 2);
  });

  it('rises with team quality, falls with an injury and follows form', () => {
    const team = (q: number) => avg((i) => apply(player(`q${i}`, 24, 'basketball', 'open_tryout'), (d) => void (d.sports.team = { id: null, name: 'A', city: d.character.cityId, level: 'college', quality: q })));
    expect(team(80) - team(30)).toBeGreaterThan(2);
    const life = player('inj', 24, 'basketball', 'open_tryout');
    const path = sportPath(content, 'basketball')!;
    const healthy = mean(many(40, (i) => ratingFor(life, path, life.sports.team!, 0, content, createRng(`i${i}`))));
    const hurt = mean(many(40, (i) => ratingFor(life, path, life.sports.team!, 60, content, createRng(`i${i}`))));
    expect(healthy - hurt).toBeGreaterThan(10);
    const formed = mean(many(40, (i) => ratingFor(apply(life, (d) => void (d.sports.form = 5)), path, life.sports.team!, 0, content, createRng(`i${i}`))));
    expect(formed - healthy).toBeGreaterThan(3);
  });

  it('peaks in the late twenties and declines after thirty, by sport', () => {
    const at = (age: number) => mean(many(40, (i) => rating(apply(player(`a${i}`, 24, 'basketball', 'open_tryout'), (d) => void (d.character.age = age)), `a${i}`)));
    expect(at(27)).toBeGreaterThan(at(14));
    expect(at(27)).toBeGreaterThan(at(37) + 8);
    expect(at(27)).toBeGreaterThan(at(33));
  });
});

describe('the year', () => {
  it('plays a season: a record, a standing, key numbers for the position, and the season lands as work', () => {
    const next = yearStep(player('season', 15));
    const s = next.sports.seasons.at(-1)!;
    expect(s).toMatchObject({ year: next.currentYear, sport: 'basketball', level: 'school' });
    expect(s.wins + s.draws + s.losses).toBe(b.league.games.school);
    expect(s.rank).toBeGreaterThanOrEqual(1);
    expect(s.rank).toBeLessThanOrEqual(s.of);
    expect(Object.keys(s.stats).length).toBeGreaterThanOrEqual(2);
    expect(next.fame.projects.at(-1)).toMatchObject({ year: next.currentYear, path: 'basketball', quality: s.rating });
    expect(next.sports.totals.seasons).toBe(1);
    ok(next);
  });

  it('keeps soccer’s draws and the other sports’ none', () => {
    const soccer = yearStep(player('draws', 15, 'soccer'));
    expect(soccer.sports.seasons.at(-1)!.wins + soccer.sports.seasons.at(-1)!.draws + soccer.sports.seasons.at(-1)!.losses).toBe(b.league.games.school);
    const hoops = many(20, (i) => yearStep(player(`nd${i}`, 15)).sports.seasons.at(-1)!.draws);
    expect(hoops.every((n) => n === 0)).toBe(true);
    expect(many(30, (i) => yearStep(player(`dr${i}`, 15, 'soccer')).sports.seasons.at(-1)!.draws).some((n) => n > 0)).toBe(true);
  });

  it('puts a good team in the playoffs more often than a bad one', () => {
    const run = (q: number) => many(60, (i) => yearStep(apply(player(`po${i}`, 16, 'hockey', 'school_tryout', 'athletics'), (d) => void (d.sports.team = { id: null, name: 'X', city: d.character.cityId, level: 'school', quality: q }))).sports.seasons.at(-1)?.result).filter((r) => r !== undefined && r !== 'missed').length;
    expect(run(80)).toBeGreaterThan(run(25));
  });

  it('pays a pro’s salary as fame income through the ledger, with the agent’s cut', () => {
    let life = pro('pay');
    life = apply(life, (d) => {
      d.fame.agent = { agentId: 'dunmore_talent', since: d.currentYear };
    });
    const next = yearStep(life);
    const salary = life.sports.contract!.salary;
    expect(next.fame.income.gross).toBeGreaterThanOrEqual(salary);
    expect(next.fame.income.agent).toBeGreaterThan(0);
    expect(yearIncome(next, content)).toBeGreaterThanOrEqual(salary - next.fame.income.agent - next.fame.income.company - next.fame.income.trust);
    expect(next.sports.totals.earned).toBeGreaterThanOrEqual(salary);
  });
});

describe('the ladder', () => {
  it('moves up with fame and good seasons but stops at the pros: that takes a draft or a signing', () => {
    let life = player('ladder', 19, 'basketball', 'open_tryout', 'athletics');
    for (let i = 0; i < 6 && life.fame.paths.basketball!.rung < 4; i++) {
      life = yearStep(life);
      life = apply(life, (d) => void (d.sports.draft = null));
    }
    expect(life.fame.paths.basketball!.rung).toBeLessThanOrEqual(3);
    expect(life.sports.pro).toBe(false);
  });

  it('asks for an age at some rungs', () => {
    const rung2 = rungDef(sportPath(content, 'basketball')!, 2);
    expect(rung2.minAge).toBe(13);
    const young = player('young', 9, 'basketball', 'youth_league', 'athletics');
    let next = young;
    for (let i = 0; i < 3; i++) next = yearStep(next);
    expect(next.fame.paths.basketball!.rung).toBe(1);
  });

  it('ends a youth career when the next level has no place for you', () => {
    let life = player('ageout', 13, 'basketball', 'youth_league');
    life = apply(life, (d) => void (d.fame.paths.basketball!.fame = 0));
    life = yearStep(life);
    life = yearStep(life);
    expect(life.sports.retired).toBeDefined();
    expect(life.sports.agedOut).toBe(life.currentYear);
    expect(life.fame.active).toBe(false);
    expect(life.history.some((h) => h.tags.includes('sports'))).toBe(true);
    ok(life);
  });
});

describe('the draft and the first deal', () => {
  it('lets a prospect old enough declare, with a pick that follows the score', () => {
    const def = sportPath(content, 'basketball')!.sport;
    expect(draftSlot(100, def, content).pick).toBe(1);
    expect(draftSlot(b.draft.top, def, content).pick).toBe(1);
    const low = draftSlot(40, def, content);
    expect(low.pick === 0 || low.pick > def.leagues.pro.teams.length).toBe(true);
    const early = yearStep(player('d-young', 17, 'basketball', 'open_tryout', 'athletics'));
    expect(early.sports.draft).toBeNull();
    const declared = many(8, (i) => yearStep(player(`d${i}`, 21, 'basketball', 'open_tryout', 'athletics')).sports.draft);
    expect(declared.some((d) => d !== null && d.pick > 0)).toBe(true);
  });

  it('signs a rookie deal: the pro rung, the team’s city, a signing bonus in savings and a deal in the pay', () => {
    const base = player('sign', 21, 'basketball', 'open_tryout', 'athletics');
    const def = sportPath(content, 'basketball')!;
    const team = draftingTeam(def.sport, 3, content);
    const drafted = apply(base, (d) => void (d.sports.draft = { year: d.currentYear, pick: 3, round: 1, teamId: team.id }));
    const signed = apply(drafted, (d) => void signDraftDeal(d, content, createRng('x')));
    expect(signed.sports.pro).toBe(true);
    expect(signed.sports.draft).toBeNull();
    expect(signed.sports.team).toMatchObject({ id: team.id, level: 'pro' });
    expect(signed.sports.contract).toMatchObject({ teamId: team.id, kind: 'rookie' });
    expect(signed.character.cityId).toBe(team.city);
    expect(signed.fame.paths.basketball!.rung).toBe(def.sport.proRung);
    expect(signed.finances.savings).toBeGreaterThan(drafted.finances.savings);
    expect(levelOfRung(def.sport, signed.fame.paths.basketball!.rung)).toBe('pro');
    ok(signed);
  });

  it('pays a first-round pick more than a later one, and a minimum deal less than either', () => {
    const def = sportPath(content, 'basketball')!;
    const rookie = (round: number) => salaryFor(def, 'rookie', def.sport.proRung, 60, content, round);
    expect(rookie(1)).toBeGreaterThan(rookie(2));
    expect(salaryFor(def, 'minimum', def.sport.proRung, 60, content)).toBeLessThan(rookie(2));
  });

  it('can be turned down, and the prospect stays an amateur', () => {
    const base = apply(player('decline', 21, 'basketball', 'open_tryout'), (d) => void (d.sports.draft = { year: d.currentYear, pick: 4, round: 1, teamId: 'chicago_foundrymen' }));
    const next = apply(base, (d) => declineDraft(d));
    expect(next.sports.draft).toBeNull();
    expect(next.sports.pro).toBe(false);
  });

  it('puts an owned home on the market when a team in another city takes you', () => {
    const def = sportPath(content, 'basketball')!;
    const other = proTeamsIn(def.sport, content).find((t) => t.city !== 'chicago')!;
    const life = apply(player('home', 21, 'basketball', 'open_tryout', 'athletics', (d) => void (d.character.cityId = 'chicago')), (d) => {
      d.housing = { ...d.housing, kind: 'owned', homeValue: 200000, annualCost: 12000, cityId: 'chicago' };
      d.sports.draft = { year: d.currentYear, pick: 2, round: 1, teamId: other.id };
      signDraftDeal(d, content, createRng('h'));
    });
    expect(life.character.cityId).toBe(other.city);
    expect(life.housing.kind).toBe('renting');
    ok(life);
  });
});

describe('contracts, trades and releases', () => {
  it('extends a deal on the market, richer when the push works, cheaper out of loyalty', () => {
    const life = pro('extend');
    const fair = apply(life, (d) => void extend(d, 'fair', content, createRng('e1')));
    const cheap = apply(life, (d) => void extend(d, 'cheap', content, createRng('e1')));
    expect(fair.sports.contract!.until).toBeGreaterThan(life.sports.contract!.until);
    expect(cheap.sports.contract!.salary).toBeLessThan(fair.sports.contract!.salary);
    const tries = many(30, (i) => apply(life, (d) => void extend(d, 'rich', content, createRng(`rich${i}`))).sports.contract!.salary);
    expect(Math.max(...tries)).toBeGreaterThan(fair.sports.contract!.salary);
    expect(Math.min(...tries)).toBeLessThan(Math.max(...tries));
  });

  it('trades you to another team, with the deal, and moves you to its city', () => {
    const life = pro('trade');
    const next = apply(life, (d) => void tradePlayer(d, content, createRng('t')));
    expect(next.sports.team!.id).not.toBe(life.sports.team!.id);
    expect(next.sports.contract!.salary).toBe(life.sports.contract!.salary);
    expect(next.sports.contract!.teamId).toBe(next.sports.team!.id);
    expect(next.sports.totals.trades).toBe(1);
    expect(next.character.cityId).toBe(next.sports.team!.city);
    ok(next);
  });

  it('lets you go and pays part of what is left on the deal', () => {
    const life = pro('release');
    let buyout = 0;
    const next = apply(life, (d) => void (buyout = releasePlayer(d, content)));
    expect(buyout).toBeGreaterThan(0);
    expect(buyout).toBe(Math.round(life.sports.contract!.salary * (life.sports.contract!.until - life.currentYear + 1) * b.contract.buyout));
    expect(next.sports.contract).toBeNull();
    expect(next.sports.team).toBeNull();
    expect(next.sports.totals.releases).toBe(1);
  });

  it('ends a free agent’s career after too many years without a team', () => {
    let life = pro('shut', 'basketball', (d) => {
      releasePlayer(d, content);
      d.sports.seasons = [];
    });
    life = apply(life, (d) => {
      d.character.stats.fitness = 5;
      d.fame.paths.basketball!.recent = [10];
      d.sports.unsigned = b.contract.unsigned;
    });
    const next = yearStep(life);
    expect(next.sports.retired).toBeDefined();
    expect(next.fame.active).toBe(false);
  });

  it('takes a team in another city for a trade without breaking the life', () => {
    const life = pro('moveto');
    const def = sportPath(content, 'basketball')!;
    const other = proTeamsIn(def.sport, content).find((t) => t.city !== life.character.cityId)!;
    const next = apply(life, (d) => void moveToTeam(d, other.id, true, content, createRng('m')));
    expect(next.character.cityId).toBe(other.city);
    ok(next);
  });
});

describe('injuries', () => {
  it('give you a condition through the health system, and more risk to the unfit, the old and the all-in', () => {
    const life = player('risk', 25, 'football', 'open_tryout');
    const p = (over: (d: LifeState) => void) => injuryRisk(apply(life, over), sportPath(content, 'football')!.sport, 'pro', content);
    expect(p((d) => void (d.character.stats.fitness = 20))).toBeGreaterThan(p((d) => void (d.character.stats.fitness = 90)));
    expect(p((d) => void (d.character.age = 38))).toBeGreaterThan(p((d) => void (d.character.age = 25)));
    expect(p((d) => void (d.fame.commitment = 'all'))).toBeGreaterThan(p((d) => void (d.fame.commitment = 'back')));
    expect(p((d) => void (d.sports.pain = true))).toBeGreaterThan(p((d) => void (d.sports.pain = false)));
    expect(injuryRisk(life, sportPath(content, 'football')!.sport, 'pro', content)).toBeGreaterThan(injuryRisk(life, sportPath(content, 'baseball')!.sport, 'pro', content) * 0.5);
    const hurt = many(80, (i) => apply(life, (d) => void rollInjury(d, sportPath(content, 'football')!, 'pro', content, createRng(`inj${i}`)))).find((l) => l.sports.totals.injuries > 0)!;
    expect(hurt.health.conditions.some((c) => sportPath(content, 'football')!.sport.injuries.some((x) => x.id === c.conditionId))).toBe(true);
    expect(hurt.health.conditions.every((c) => content.conditions[c.conditionId]!.kind === 'injury')).toBe(true);
  });

  it('keep you from playing part of the season, and from your best', () => {
    const def = sportPath(content, 'hockey')!;
    const hurt = apply(player('missed', 24, 'hockey', 'open_tryout'), (d) => void (d.health.conditions = [{ conditionId: 'torn_ligament', since: d.currentYear, severity: 60, treated: false }]));
    expect(missedShare(hurt, def.sport, content)).toBeCloseTo(60 * b.injury.missed, 3);
    expect(missedShare(apply(hurt, (d) => void (d.sports.pain = true)), def.sport, content)).toBeLessThan(missedShare(hurt, def.sport, content));
    expect(sportsHolds({ injured: true }, hurt, content)).toBe(true);
  });

  it('heal faster treated: resting treats the injury, the team pays for a pro and you pay as an amateur', () => {
    const base = (life: LifeState) =>
      apply(life, (d) => {
        d.health.conditions = [{ conditionId: 'muscle_tear', since: d.currentYear, severity: 40, treated: false }];
      });
    const amateur = base(player('rest-a', 16, 'hockey', 'school_tryout'));
    const rested = apply(amateur, (d) => void applyEffects(d, [{ type: 'sports', action: 'injury', what: 'rest' }], { def: content.events['injury_play_through_pain']!, cast: {}, rng: createRng('r'), content }));
    expect(rested.health.conditions[0]!.treated).toBe(true);
    expect(rested.finances.savings).toBeLessThanOrEqual(amateur.finances.savings);
    const proRested = apply(base(pro('rest-p', 'hockey')), (d) => void applyEffects(d, [{ type: 'sports', action: 'injury', what: 'rest' }], { def: content.events['injury_play_through_pain']!, cast: {}, rng: createRng('r'), content }));
    expect(proRested.health.conditions[0]!.treated).toBe(true);
    expect(proRested.finances.savings).toBe(base(pro('rest-p', 'hockey')).finances.savings);
  });

  it('playing through pain can make it worse the year after, and a bad enough one ends a career', () => {
    const def = sportPath(content, 'football')!;
    const hurt = apply(player('pain', 26, 'football', 'open_tryout'), (d) => {
      d.sports.pain = true;
      d.health.conditions = [{ conditionId: 'torn_ligament', since: d.currentYear, severity: 80, treated: false }];
    });
    const results = many(60, (i) => {
      let result: ReturnType<typeof agePain> = null;
      apply(hurt, (d) => void (result = agePain(d, def.sport, content, createRng(`ap${i}`))));
      return result;
    });
    expect(results.some((r) => r === 'worse' || r === 'ended')).toBe(true);
    expect(results.some((r) => r === 'ended')).toBe(true);
    expect(results.some((r) => r === null)).toBe(true);
  });

  it('can end a career outright, and the Hall of Fame and worn joints come later', () => {
    const ended = many(60, (i) =>
      apply(
        player(`end${i}`, 25, 'football', 'open_tryout', 'athletics', (d) => {
          d.sports.pain = true;
          d.health.conditions = [{ conditionId: 'torn_ligament', since: d.currentYear, severity: 95, treated: false }];
        }),
        (d) => void playSeason(d, content, createRng(`ended${i}`)),
      ),
    );
    expect(ended.some((l) => l.sports.retired !== undefined && l.flags.sports_career_ended_by_injury === true)).toBe(true);
  });
});

describe('the playoffs', () => {
  const withRun = (life: LifeState) => apply(life, (d) => void (d.sports.run = { year: d.currentYear, won: 0, alive: true, strength: 60, rival: 55 }));

  it('moves a run on with a win, ends it with a loss and gives the title for three wins', () => {
    const base = withRun(apply(pro('series'), (d) => void d.sports.seasons.push({ year: d.currentYear, sport: 'basketball', level: 'pro', team: 'T', position: d.sports.position!, rating: 60, played: 100, wins: 40, draws: 0, losses: 42, rank: 5, of: 12, result: 'out', stats: {}, salary: 1, allStar: false })));
    expect(nextSeries(base)).toBe(1);
    const won1 = apply(base, (d) => void applySeries(d, 'win', content, createRng('p'), null));
    expect(nextSeries(won1)).toBe(2);
    const champion = apply(base, (d) => {
      applySeries(d, 'win', content, createRng('p'), null);
      applySeries(d, 'win', content, createRng('p'), null);
      applySeries(d, 'win', content, createRng('p'), null);
    });
    expect(champion.sports.run).toBeNull();
    expect(champion.sports.totals.titles).toBe(1);
    expect(champion.sports.seasons.at(-1)!.result).toBe('champion');
    expect(champion.fame.paths.basketball!.fame).toBeGreaterThan(base.fame.paths.basketball!.fame);
    const lost = apply(won1, (d) => void applySeries(d, 'lose', content, createRng('p'), null));
    expect(lost.sports.run).toBeNull();
    expect(lost.sports.seasons.at(-1)!.result).toBe('out');
    const lostFinal = apply(base, (d) => {
      applySeries(d, 'win', content, createRng('p'), null);
      applySeries(d, 'win', content, createRng('p'), null);
      applySeries(d, 'lose', content, createRng('p'), null);
    });
    expect(lostFinal.sports.seasons.at(-1)!.result).toBe('final');
    expect(lostFinal.sports.totals.finals).toBe(1);
  });

  it('settles a run nobody played out from the strength of the sides', () => {
    const strong = many(40, (i) => apply(withRun(pro(`set${i}`)), (d) => void ((d.sports.run!.strength = 90), (d.sports.run!.rival = 40), settleRun(d, content, createRng(`s${i}`)))));
    const weak = many(40, (i) => apply(withRun(pro(`set${i}`)), (d) => void ((d.sports.run!.strength = 40), (d.sports.run!.rival = 90), settleRun(d, content, createRng(`s${i}`)))));
    expect(strong.every((l) => l.sports.run === null)).toBe(true);
    expect(strong.filter((l) => l.sports.totals.titles > 0).length).toBeGreaterThan(weak.filter((l) => l.sports.totals.titles > 0).length);
  });

  it('puts the next series’ event into the year right after the one you just played', () => {
    const life = apply(withRun(pro('chain')), (d) => {
      d.sports.seasons.push({ year: d.currentYear, sport: 'basketball', level: 'pro', team: 'T', position: d.sports.position!, rating: 60, played: 100, wins: 40, draws: 0, losses: 42, rank: 5, of: 12, result: 'out', stats: {}, salary: 1, allStar: false });
      d.phase = 'events';
      d.pending = [{ instanceId: 'e1-1', eventId: 'playoffs_opening_series', cast: {} }];
    });
    expect(evaluate(content.events['playoffs_opening_series']!.requires, life, { content, roles: 'strict' })).toBe(true);
    // The series choice rolls a check; try seeds until a win, then see the chain move on.
    const outcomes = many(30, (i) => resolveChoice(apply(life, (d) => void (d.rng = createRng(`chain${i}`))), 'e1-1', 'trust', content));
    const won = outcomes.find((l) => l.sports.run?.won === 1);
    const lost = outcomes.find((l) => l.sports.run === null);
    expect(won).toBeDefined();
    expect(lost).toBeDefined();
    expect(won!.pending.length).toBe(2);
    expect(won!.pending[1]!.resolvedChoiceId).toBeUndefined();
    expect(content.events[won!.pending[1]!.eventId]!.category).toBe('sportsplayoffs');
    expect(won!.phase).toBe('events');
    expect(lost!.pending.length).toBe(1);
    expect(lost!.pending[0]!.outcomeText).toBeDefined();
  });

  it('keeps the words of a series’ card as they were shown after the run moves on', () => {
    const life = apply(withRun(pro('pin')), (d) => {
      d.sports.seasons.push({ year: d.currentYear, sport: 'basketball', level: 'pro', team: 'T', position: d.sports.position!, rating: 60, played: 100, wins: 40, draws: 0, losses: 42, rank: 5, of: 12, result: 'out', stats: {}, salary: 1, allStar: false });
      d.phase = 'events';
      d.pending = [{ instanceId: 'e1-1', eventId: 'playoffs_opening_series', cast: {} }];
    });
    const done = resolveChoice(life, 'e1-1', 'trust', content);
    const card = done.pending[0]!.card!;
    expect(card.text).toContain(content.famePaths.basketball!.sport!.stages[0]!);
  });
});

describe('leaving the game', () => {
  const retiring = (route: 'coaching' | 'broadcast' | 'normal', over: (d: LifeState) => void = () => {}) =>
    apply(pro('retire'), (d) => {
      d.character.age = 36;
      d.currentYear = d.birthYear + 36;
      over(d);
      retireSports(d, route, 'retired', content, createRng('rt'));
    });

  it('retires into a normal life: fame stays as royalties and endorsements, the sport is behind you', () => {
    const life = retiring('normal');
    expect(life.sports.retired).toMatchObject({ route: 'normal' });
    expect(life.fame.active).toBe(false);
    expect(life.fame.retired).toBe(life.currentYear);
    expect(life.sports.team).toBeNull();
    expect(life.sports.contract).toBeNull();
    expect(inSports(life, content)).toBe(false);
    ok(life);
  });

  it('retires into coaching: a job in the coaching track', () => {
    expect(routeBlock(pro('coach'), 'coaching', content)).toBeNull();
    const life = retiring('coaching');
    expect(life.career.job?.jobId).toBe('coach');
    expect(life.sports.retired?.route).toBe('coaching');
  });

  it('retires into broadcasting if famous enough: a crossover into a media path', () => {
    const famous = retiring('broadcast', (d) => {
      d.fame.paths.basketball!.fame = 70;
      d.fame.paths.basketball!.rung = 6;
      d.fame.paths.basketball!.peak = 6;
    });
    expect(famous.fame.active).toBe(true);
    expect(famous.fame.main).toBe(b.retire.broadcastPath);
    expect(famous.fame.paths[b.retire.broadcastPath]!.rung).toBeGreaterThan(1);
    expect(famous.sports.retired?.route).toBe('broadcast');
    const obscure = retiring('broadcast');
    expect(obscure.fame.main).toBe('basketball');
    expect(obscure.fame.active).toBe(false);
    expect(routeBlock(pro('obscure'), 'broadcast', content)).toBe('fame');
    ok(famous);
  });

  it('can leave the road open after an injury ends a career, and take it the same year', () => {
    const ended = apply(pro('ended'), (d) => void retireSports(d, null, 'injury', content, createRng('x')));
    expect(ended.sports.retired).toEqual({ year: ended.currentYear, route: null });
    const coach = apply(ended, (d) => void takeRoute(d, 'coaching', content));
    expect(coach.career.job?.jobId).toBe('coach');
    expect(coach.sports.retired?.route).toBe('coaching');
    const nobody = yearStep(ended);
    expect(takeRoute(nobody, 'coaching', content)).toBe(false);
  });

  it('can leave worn joints after a long pro career', () => {
    const lives = many(80, (i) =>
      apply(pro(`worn${i}`), (d) => {
        d.sports.totals.proSeasons = 14;
        retireSports(d, 'normal', 'retired', content, createRng(`w${i}`));
      }),
    );
    expect(lives.some((l) => l.health.conditions.some((c) => c.conditionId === 'worn_joints'))).toBe(true);
    expect(lives.some((l) => !l.health.conditions.some((c) => c.conditionId === 'worn_joints'))).toBe(true);
  });
});

describe('minors and the pros', () => {
  it('keeps anyone under 18 out of the pros, and out of the draft', () => {
    const def = sportPath(content, 'soccer')!;
    expect(def.sport.draft.age).toBeGreaterThanOrEqual(18);
    expect(rungDef(def, def.sport.proRung).minAge).toBeGreaterThanOrEqual(18);
    let life = player('minor', 12, 'soccer', 'youth_league', 'athletics');
    for (let i = 0; i < 5; i++) life = yearStep(life);
    expect(life.sports.pro).toBe(false);
    expect(life.sports.contract).toBeNull();
    ok(life);
  });

  it('is reported as a failure if a life ever puts someone under 18 in a pro deal', () => {
    const bad = apply(player('bad', 16), (d) => {
      d.sports.pro = true;
      d.sports.contract = { teamId: 'chicago_foundrymen', since: d.currentYear, until: d.currentYear + 2, salary: 100, kind: 'rookie', option: 'none' };
      d.sports.team = { id: 'chicago_foundrymen', name: 'x', city: 'chicago', level: 'pro', quality: 50 };
    });
    expect(checkInvariants(bad, content).some((f) => /under 18 is in the pros/.test(f))).toBe(true);
  });
});

describe('the conditions, text values and helpers', () => {
  it('reads the sports condition', () => {
    const life = player('cond', 15);
    expect(sportsHolds({ active: true, sport: ['basketball'], level: ['school'] }, life, content)).toBe(true);
    expect(sportsHolds({ sport: ['hockey'] }, life, content)).toBe(false);
    expect(sportsHolds({ amateur: true }, life, content)).toBe(true);
    expect(sportsHolds({ contract: true }, life, content)).toBe(false);
    expect(sportsHolds({ retired: true }, life, content)).toBe(false);
    const proLife = pro('cond-pro');
    expect(sportsHolds({ contract: true, level: ['pro'], amateur: false }, proLife, content)).toBe(true);
  });

  it('names picks and teams in words', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(23)).toBe('23rd');
    expect(collegeTier(70)).toBe('elite');
    expect(collegeTier(10)).toBe('community');
    const life = player('team', 20, 'football', 'open_tryout');
    const team = amateurTeam(life, sportPath(content, 'football')!.sport, 'college', 70, content, createRng('t'));
    expect(team.name.length).toBeGreaterThan(5);
    expect(team.city).toBe(life.character.cityId);
  });

  it('has a level of play at every rung of every sport', () => {
    for (const id of ['basketball', 'football', 'soccer', 'baseball', 'hockey']) {
      const def = sportPath(content, id)!;
      expect(def.rungs.length).toBe(8);
      expect(levelOfRung(def.sport, 1)).toBe('youth');
      expect(levelOfRung(def.sport, 3)).toBe('college');
      expect(levelOfRung(def.sport, def.sport.proRung)).toBe('pro');
      expect(proTeamsIn(def.sport, content).length).toBe(12);
    }
  });
});
