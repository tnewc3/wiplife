import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { createPerson } from '../events/casting';
import { enterPath } from '../fame/ladder';
import { runFame } from '../fame/step';
import { checkInvariants } from '../invariants';
import { createLife } from '../life';
import { replayLife } from '../replay';
import { createRng } from '../rng';
import { getSportsView } from '../selectors';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { playSeason } from './season';
import { extend, signDraftDeal, moveToTeam } from './contract';
import { anotherTeam } from './team';
import { sportsHolds } from './holds';
import { divisionOf, hasDivisions, homeLeagueTeams, marketTeams, playingCountry, rivalOf, sameLeague, teamById, teamsOf } from './league';
import { allSports, sportPath, sportWords } from './query';
import { emptySetup, parseTeamSetup, setupIssues, SetupError, teamRenames, usableSetup, withTeamNames, type TeamSetup } from './setup';
import { abroadAcademyClubs, academyIntake, bestOffer, homeAcademyClub, loanHosts, offerLoan, openWindow, settleLeagues, takeLoan, takeTransfer, endLoan, transferBlock, transferValue } from './soccer';
import { startTryout, teamOptions } from './tryout';
import { applySportsEffect } from './effects';
import { nationalStep, tournamentYear } from './world';
import { proTeam } from './team';
import { addedTeamSchema } from './setup';

const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|scheduled/.test(f))).toEqual([]);
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));

/** A life in a UK city (the country's pool of names, citizenship and housing follow). */
const ukLife = (seed: string, age: number): LifeState =>
  apply(lifeAtAge(seed, age), (d) => {
    d.character.cityId = 'london';
    d.character.birthCityId = 'london';
    d.character.citizenships = ['uk'];
    d.housing.cityId = 'london';
    for (const p of Object.values(d.people)) {
      p.cityId = 'london';
      p.citizenships = ['uk'];
    }
  });

/** A pro on a team with a deal: put there directly (an adult, the pro rung, a season behind them). */
const pro = (life: LifeState, sportId: string, teamId: string, over: (d: LifeState) => void = () => {}): LifeState =>
  apply(life, (d) => {
    d.character.hidden.talent = 'athletics';
    enterPath(d, sportId, 'open_tryout', content);
    const def = sportPath(content, sportId)!;
    d.sports.draft = { year: d.currentYear, pick: 5, round: 1, teamId };
    signDraftDeal(d, content, createRng(`${d.seed}:b6`));
    d.sports.seasons = [{ year: d.currentYear - 1, sport: sportId, level: 'pro', team: d.sports.team?.name ?? '', position: d.sports.position!, rating: 78, played: 100, wins: 20, draws: 6, losses: 12, rank: 3, of: 12, result: 'out', stats: {}, salary: 0, allStar: false }];
    d.fame.paths[sportId]!.rung = def.sport.proRung;
    over(d);
  });

describe('teams in cities the game does not have yet', () => {
  const future = allSports(content).flatMap((d) => d.sport.leagues.pro.teams.filter((t) => t.futureCity === true).map((t) => ({ sport: d.id, team: t })));

  it('has teams in at least 10 US cities the game does not model, each with a nearest modeled city of the same country', () => {
    const cities = new Set<string>();
    for (const { team } of future) {
      expect(team.cityName).toBeTruthy();
      const near = content.cities[team.nearestCityId!]!;
      expect(near).toBeDefined();
      expect(team.city).toBe(team.nearestCityId);
      if (near.countryId === 'us') cities.add(team.cityName!);
    }
    expect(cities.size).toBeGreaterThanOrEqual(10);
    // The game's own cities are never "future" ones.
    for (const { team } of future) expect(Object.values(content.cities).some((c) => c.name === team.cityName)).toBe(false);
  });

  it('has Canadian teams too, where they fit', () => {
    expect(future.some(({ team }) => content.cities[team.nearestCityId!]!.countryId === 'ca')).toBe(true);
  });

  it('keeps you living in the nearest modeled city when you sign, and says where the team plays', () => {
    const { sport, team } = future.find((f) => f.team.cityName === 'Boston' && f.sport === 'basketball')!;
    const life = pro(lifeAtAge('boston', 21), sport, team.id);
    expect(life.character.cityId).toBe('nyc');
    expect(life.sports.team).toMatchObject({ id: team.id, city: 'nyc', place: 'Boston', away: 'city' });
    expect(sportsHolds({ away: ['city'] }, life, content)).toBe(true);
    expect(sportsHolds({ away: ['country'] }, life, content)).toBe(false);
    const view = getSportsView(life, content);
    expect(view.team).toMatchObject({ place: 'Boston', away: 'city', city: 'New York' });
    ok(life);
  });

  it('draws teams from them: they are at home for a player in their nearest city', () => {
    const life = lifeAtAge('home', 21);
    const home = homeLeagueTeams(life, 'basketball', 'chicago', content);
    expect(home.some((t) => t.futureCity === true)).toBe(true);
    expect(home.every((t) => content.cities[t.city]!.countryId === 'us')).toBe(true);
  });
});

describe('leagues in Spain, Italy, Germany and France', () => {
  it('has fictional clubs in real cities with two leagues each, flagged futureCountry, and a UK city to live in', () => {
    const soccer = sportPath(content, 'soccer')!;
    for (const country of ['es', 'it', 'de', 'fr'] as const) {
      const clubs = soccer.sport.leagues.pro.teams.filter((t) => t.country === country);
      expect(clubs.filter((t) => t.tier === 1).length).toBeGreaterThanOrEqual(6);
      expect(clubs.filter((t) => t.tier === 2).length).toBeGreaterThanOrEqual(4);
      for (const c of clubs) {
        expect(c.futureCountry).toBe(true);
        expect(content.cities[c.nearestCityId!]!.countryId).toBe('uk');
      }
    }
  });

  it('lets a player in the UK sign in Spain and commute, living in a UK city', () => {
    const madrid = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.country === 'es' && t.tier === 1)!;
    const home = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.city === 'london' && t.tier === 1)!;
    const life = pro(ukLife('spain', 24), 'soccer', home.id);
    expect(marketTeams(life, 'soccer', 'london', content).some((t) => t.id === madrid.id)).toBe(true);
    const next = apply(life, (d) => void moveToTeam(d, madrid.id, true, content, createRng('x')));
    expect(next.sports.team).toMatchObject({ id: madrid.id, country: 'es', away: 'country', place: madrid.cityName });
    expect(next.character.cityId).toBe(madrid.nearestCityId);
    expect(next.travel.residence).toBeNull();
    expect(sportsHolds({ away: ['country'] }, next, content)).toBe(true);
    ok(next);
  });

  it('pays through the ledger in the base unit: a contract is a whole number of base dollars', () => {
    const madrid = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.country === 'es' && t.tier === 1)!;
    const life = pro(ukLife('pay', 24), 'soccer', madrid.id);
    expect(Number.isSafeInteger(life.sports.contract!.salary)).toBe(true);
    expect(life.sports.contract!.salary).toBeGreaterThan(0);
  });

  it('gives teammates the names of the club’s country', () => {
    const madrid = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.country === 'es' && t.tier === 1)!;
    const life = pro(ukLife('mates', 25), 'soccer', madrid.id);
    const pool = content.names['es']!.heritages['spanish']!;
    const made = apply(life, (d) => {
      for (let i = 0; i < 6; i++) {
        const id = createPerson(d, { kind: 'acquaintance', presence: 'city', createIfMissing: true, heritage: 'team' }, createRng(`m${i}`), content);
        expect(id).not.toBeNull();
        const p = d.people[id!]!;
        expect(p.heritage).toBe('spanish');
        expect([...pool.first.man, ...pool.first.woman, ...pool.first.nonbinary]).toContain(p.name.first);
        expect(pool.last).toContain(p.name.last);
        // They live in the city you live in (the commute is yours).
        expect(p.cityId).toBe('london');
      }
    });
    expect(made).toBeDefined();
    // Without a team abroad, the heritage of your own country's names is used.
    const home = apply(lifeAtAge('plain', 25), (d) => {
      const id = createPerson(d, { kind: 'acquaintance', presence: 'city', createIfMissing: true, heritage: 'team' }, createRng('p'), content);
      expect(content.names['us']!.heritages[d.people[id!]!.heritage!]).toBeDefined();
    });
    expect(home).toBeDefined();
  });

  it('has name pools with enough names, and the heritages know their languages', () => {
    for (const c of ['es', 'it', 'de', 'fr']) {
      const pool = content.names[c]!;
      for (const h of Object.values(pool.heritages)) {
        expect(new Set(h.first.man).size).toBeGreaterThanOrEqual(50);
        expect(new Set(h.first.woman).size).toBeGreaterThanOrEqual(50);
        expect(new Set(h.first.nonbinary).size).toBeGreaterThanOrEqual(50);
        expect(new Set(h.last).size).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

describe('clubs outside your country', () => {
  it('lets a player sign with a club in another country of the sport’s market, on a permit that runs past the deal', () => {
    const toronto = sportPath(content, 'basketball')!.sport.leagues.pro.teams.find((t) => t.city === 'toronto')!;
    const chicago = sportPath(content, 'basketball')!.sport.leagues.pro.teams.find((t) => t.city === 'chicago')!;
    const life = pro(lifeAtAge('abroad', 22), 'basketball', chicago.id);
    expect(marketTeams(life, 'basketball', 'chicago', content).some((t) => t.id === toronto.id)).toBe(true);
    const next = apply(life, (d) => void moveToTeam(d, toronto.id, true, content, createRng('t')));
    expect(next.character.cityId).toBe('toronto');
    expect(next.travel.residence).toMatchObject({ settled: true, type: 'temporary_worker', route: 'work_sponsor', country: 'Canada' });
    expect(next.travel.residence!.endYear).toBeGreaterThanOrEqual(next.sports.contract!.until);
    expect(next.sports.abroadYear).toBe(next.currentYear);
    expect(next.sports.totals.abroad).toBe(1);
    expect(sportsHolds({ abroad: true }, next, content)).toBe(true);
    expect(next.history.some((h) => h.text.includes('Canada'))).toBe(true);
    ok(next);
  });

  it('keeps the permit running past every new deal at a club abroad: a string of extensions is never left without papers', () => {
    const toronto = sportPath(content, 'basketball')!.sport.leagues.pro.teams.find((t) => t.city === 'toronto')!;
    const chicago = sportPath(content, 'basketball')!.sport.leagues.pro.teams.find((t) => t.city === 'chicago')!;
    const abroad = apply(pro(lifeAtAge('permit', 22), 'basketball', chicago.id), (d) => void moveToTeam(d, toronto.id, true, content, createRng('t')));
    const until = abroad.sports.contract!.until;
    expect(abroad.travel.residence!.endYear).toBe(until + content.balance.sports.world.abroad.permitYears);
    const later = apply(abroad, (d) => {
      d.currentYear = until + 1;
      d.character.age += until + 1 - abroad.currentYear;
      extend(d, 'fair', content, createRng('e'));
    });
    expect(later.sports.contract!.until).toBeGreaterThan(until);
    expect(later.travel.residence!.endYear).toBe(later.sports.contract!.until + content.balance.sports.world.abroad.permitYears);
  });

  it('picks a club abroad now and then, not as often as one at home', () => {
    const life = lifeAtAge('share', 26);
    const rng = createRng('share');
    let abroad = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const t = anotherTeam(life, 'soccer', null, 'chicago', content, rng, 55);
      if (playingCountry(t, content) !== 'us') abroad++;
    }
    const share = abroad / n;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.3);
    // A sport with no market beyond the continent does not look further.
    const uk = ukLife('share-uk', 26);
    for (let i = 0; i < 100; i++) expect(playingCountry(anotherTeam(uk, 'basketball', null, 'london', content, rng), content)).toBe('uk');
  });

  it('keeps a sport out of countries its market does not include', () => {
    const london = sportPath(content, 'basketball')!.sport.leagues.pro.teams.find((t) => t.city === 'london')!;
    const life = lifeAtAge('market', 22);
    expect(marketTeams(life, 'basketball', 'chicago', content).some((t) => t.id === london.id)).toBe(false);
    const soccer = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.city === 'london')!;
    expect(marketTeams(life, 'soccer', 'chicago', content).some((t) => t.id === soccer.id)).toBe(true);
  });

  it('never moves a minor to another country: only adults see clubs abroad', () => {
    const life = lifeAtAge('minor', 16);
    expect(marketTeams(life, 'soccer', 'chicago', content).length).toBeGreaterThan(0);
    const next = apply(life, (d) => {
      d.character.hidden.talent = 'athletics';
      enterPath(d, 'soccer', 'school_tryout', content);
    });
    expect(next.sports.pro).toBe(false);
  });
});

describe('soccer academies', () => {
  const academyKid = (seed: string, age: number, life: LifeState = lifeAtAge(seed, age)) => life;

  it('offers an academy trial to a child of any country (a club of their own country), named for the club', () => {
    const life = academyKid('kid', 12);
    const options = teamOptions(life, sportPath(content, 'soccer')!, content);
    const academy = options.find((o) => o.key === 'youth:academy');
    expect(academy).toBeDefined();
    const club = homeAcademyClub(life, 'soccer', content)!;
    expect(academy!.name).toBe(`${club.name} Academy`);
    expect(academy!.abroad).toBeFalsy();
  });

  it('offers a trial abroad only to a UK child, at an academy in a country the game does not model', () => {
    const uk = ukLife('trial', 13);
    const options = teamOptions(uk, sportPath(content, 'soccer')!, content).filter((o) => o.abroad === true);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(new Set(options.map((o) => o.key.split(':')[1]))).toEqual(new Set(abroadAcademyClubs(uk, 'soccer', content).map((c) => c.country)));
    // Not before the age an academy abroad takes, and not for a child of another country.
    expect(teamOptions(ukLife('young', 10), sportPath(content, 'soccer')!, content).some((o) => o.abroad === true)).toBe(false);
    expect(teamOptions(lifeAtAge('us13', 13), sportPath(content, 'soccer')!, content).some((o) => o.abroad === true)).toBe(false);
  });

  it('puts a child in the academy that takes them, and remembers the club', () => {
    let joined = 0;
    for (let i = 0; i < 12; i++) {
      const life = academyKid(`join${i}`, 12, apply(lifeAtAge(`join${i}`, 12), (d) => void (d.character.hidden.talent = 'athletics')));
      const tried = apply(life, (d) => {
        expect(startTryout(d, 'soccer', 'youth:academy', content)).toBe(true);
      });
      const done = apply(tried, (d) => {
        const rng = createRng(`r${i}`);
        // The scrimmage's choice: hustle.
        applySportsEffect(d, { type: 'sports', action: 'tryout', approach: 'hustle' }, {}, content, rng);
      });
      if (done.sports.academy) {
        joined++;
        expect(done.sports.academy.abroad).toBe(false);
        expect(done.sports.team).toMatchObject({ tier: 'academy', level: 'youth' });
        expect(done.sports.team!.name.endsWith('Academy')).toBe(true);
        ok(done);
      }
    }
    expect(joined).toBeGreaterThan(0);
  });

  it('puts a UK child in an academy abroad and keeps them at home (they commute)', () => {
    let joined = false;
    for (let i = 0; i < 30 && !joined; i++) {
      const life = apply(ukLife(`ab${i}`, 13), (d) => {
        d.character.hidden.talent = 'athletics';
        d.character.stats.fitness = 100;
        d.character.stats.smarts = 100;
      });
      const key = teamOptions(life, sportPath(content, 'soccer')!, content).find((o) => o.abroad === true)!.key;
      const done = apply(life, (d) => {
        startTryout(d, 'soccer', key, content);
        applySportsEffect(d, { type: 'sports', action: 'tryout', approach: 'hustle' }, {}, content, createRng(`q${i}`));
      });
      if (done.sports.academy?.abroad) {
        joined = true;
        expect(done.character.cityId).toBe('london');
        expect(done.sports.team ?? done.sports.club).toMatchObject({ tier: 'academy', away: 'country' });
        expect(sportsHolds({ academy: true, academyAbroad: true }, done, content)).toBe(true);
        ok(done);
      }
    }
    expect(joined).toBe(true);
  });

  it('promotes a graduate to the first team at the draft age (a rookie deal from the club), or lets the player go', () => {
    const path = sportPath(content, 'soccer')!;
    const club = homeAcademyClub(lifeAtAge('grad', 18), 'soccer', content)!;
    const base = apply(lifeAtAge('grad', 18), (d) => {
      d.character.hidden.talent = 'athletics';
      enterPath(d, 'soccer', 'open_tryout', content);
      d.sports.academy = { clubId: club.id, since: d.currentYear - 3, abroad: false };
    });
    const kept = apply(base, (d) => {
      expect(academyIntake(d, path, 70, content, { pick: 6, round: 1 })).toBe('academy');
      expect(d.sports.draft).toMatchObject({ teamId: club.id, academy: true });
      // A graduate's offer is not a draft night.
      expect(sportsHolds({ graduated: true }, d, content)).toBe(true);
      expect(sportsHolds({ drafted: true }, d, content)).toBe(false);
      signDraftDeal(d, content, createRng('s'));
    });
    expect(kept.sports).toMatchObject({ pro: true, academy: null });
    expect(kept.sports.contract).toMatchObject({ teamId: club.id, kind: 'rookie' });
    expect(kept.sports.totals.graduates).toBe(1);
    expect(kept.history.some((h) => h.text.includes('academy'))).toBe(true);
    ok(kept);
    const let_go = apply(base, (d) => {
      expect(academyIntake(d, path, 10, content, { pick: 0, round: 0 })).toBe('academyReleased');
    });
    expect(let_go.sports.academy).toBeNull();
    expect(let_go.sports.academyOut).toBe(let_go.currentYear);
    expect(sportsHolds({ academyOut: true }, let_go, content)).toBe(true);
    ok(let_go);
  });
});

describe('loans', () => {
  const soccerPro = (seed: string, over: (d: LifeState) => void = () => {}) => {
    const club = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.city === 'chicago' && t.quality >= 55)!;
    return pro(lifeAtAge(seed, 22), 'soccer', club.id, over);
  };

  it('sends a player to a weaker club for a season while the parent club holds the contract and the pay', () => {
    const life = soccerPro('loan', (d) => void (d.sports.role = 'reserve'));
    const path = sportPath(content, 'soccer')!;
    const parent = teamById(life, 'soccer', life.sports.contract!.teamId, content)!;
    const hosts = loanHosts(life, path, parent, content);
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.every((h) => h.quality < parent.quality)).toBe(true);
    const offered = apply(life, (d) => void expect(offerLoan(d, path, content, createRng('o'))).toBe(true));
    expect(offered.sports.loanOffer).not.toBeNull();
    expect(sportsHolds({ loanOffered: true }, offered, content)).toBe(true);
    const salary = offered.sports.contract!.salary;
    const away = apply(offered, (d) => void takeLoan(d, path, content));
    expect(away.sports.loan).toMatchObject({ parentId: parent.id, hostId: offered.sports.loanOffer!.hostId });
    expect(away.sports.team!.id).toBe(offered.sports.loanOffer!.hostId);
    expect(away.sports.contract!.teamId).toBe(parent.id);
    expect(away.sports.contract!.salary).toBe(salary);
    expect(away.sports.totals.loans).toBe(1);
    expect(away.sports.loanOffer).toBeNull();
    ok(away);
    const back = apply(away, (d) => void endLoan(d, path, content));
    expect(back.sports.loan).toBeNull();
    expect(back.sports.team!.id).toBe(parent.id);
    ok(back);
  });

  it('brings a loaned player back before the parent deal is judged, so a deal that runs out mid-loan never strands the loan', () => {
    const life = soccerPro('loan-expiry', (d) => void (d.sports.role = 'reserve'));
    const path = sportPath(content, 'soccer')!;
    const away = apply(life, (d) => {
      offerLoan(d, path, content, createRng('o'));
      takeLoan(d, path, content);
    });
    expect(away.sports.loan).not.toBeNull();
    for (let i = 0; i < 6; i++) {
      const next = apply(away, (d) => {
        d.currentYear = away.sports.contract!.until + 1;
        d.character.age += d.currentYear - away.currentYear;
        d.sports.loan!.until = d.currentYear;
        playSeason(d, content, createRng(`x${i}`));
      });
      if (next.sports.loan) expect(next.sports.contract).not.toBeNull();
      ok(next);
    }
  });

  it('is the club’s decision: a refusal may be overruled, a request may be granted', () => {
    const life = soccerPro('decide', (d) => void (d.sports.role = 'reserve'));
    const overruled = new Set<boolean>();
    for (let i = 0; i < 24; i++) {
      const offered = apply(life, (d) => void offerLoan(d, sportPath(content, 'soccer')!, content, createRng(`d${i}`)));
      const refused = apply(offered, (d) => {
        d.rng = createRng(`ref${i}`);
        applySportsEffect(d, { type: 'sports', action: 'loan', on: false }, {}, content, d.rng);
      });
      overruled.add(refused.sports.loan !== null);
    }
    expect(overruled).toEqual(new Set([true, false]));
    expect(isLifeActionAvailable(apply(life, (d) => void (d.sports.loanOffer = null)), 'ask_loan', {}, content)).toBe(true);
  });
});

describe('transfers', () => {
  const path = sportPath(content, 'soccer')!;
  const star = (seed: string, over: (d: LifeState) => void = () => {}) => {
    const club = path.sport.leagues.pro.teams.find((t) => t.city === 'chicago' && t.tier === 1 && t.quality >= 55 && t.futureCity !== true)!;
    return pro(lifeAtAge(seed, 25), 'soccer', club.id, (d) => {
      d.fame.agent = { agentId: 'quill_and_marlow', since: d.currentYear - 1 };
      over(d);
    });
  };

  it('brings offers by rating each window, with a fee, a wage, a length and sometimes a release clause', () => {
    let offers = 0;
    for (let i = 0; i < 10; i++) {
      const life = star(`w${i}`);
      const win = apply(life, (d) => void openWindow(d, path, content, createRng(`w${i}`)));
      for (const o of win.sports.transfer!.offers) {
        offers++;
        expect(o.fee).toBeGreaterThan(0);
        expect(o.wage).toBeGreaterThan(0);
        expect(o.years).toBeGreaterThanOrEqual(content.balance.sports.soccer.transfer.years.min);
        expect(teamById(win, 'soccer', o.clubId, content)).toBeDefined();
        expect(o.clubId).not.toBe(life.sports.contract!.teamId);
      }
      ok(win);
    }
    expect(offers).toBeGreaterThan(5);
    // A poor season brings fewer.
    const weak = star('weak', (d) => void (d.sports.seasons[0]!.rating = 25));
    const strong = star('weak', (d) => void (d.sports.seasons[0]!.rating = 95));
    const count = (life: LifeState) => [...Array(30)].reduce((n: number, _, i) => n + apply(life, (d) => void openWindow(d, path, content, createRng(`c${i}`))).sports.transfer!.offers.length, 0);
    expect(count(strong)).toBeGreaterThan(count(weak));
  });

  it('moves the player on a signing: a new deal at the offered wage, the fee between the clubs, a share to the player through the ledger', () => {
    const base = star('sign');
    const win = apply(base, (d) => {
      d.sports.seasons[0]!.rating = 90;
      d.sports.contract!.release = undefined as never;
      delete d.sports.contract!.release;
      openWindow(d, path, content, createRng('sign'));
    });
    const offer = bestOffer(win, content)!;
    expect(offer).toBeDefined();
    let moved: LifeState | null = null;
    for (let i = 0; i < 20 && !moved; i++) {
      const attempt = apply(win, (d) => void takeTransfer(d, path, offer.id, false, content, createRng(`t${i}`)));
      if (attempt.sports.contract!.teamId === offer.clubId) moved = attempt;
    }
    expect(moved).not.toBeNull();
    const m = moved!;
    expect(m.sports.contract).toMatchObject({ teamId: offer.clubId, salary: offer.wage });
    expect(m.sports.team!.id).toBe(offer.clubId);
    expect(m.sports.transfer).toBeNull();
    expect(m.sports.totals).toMatchObject({ transfers: 1, fees: offer.fee });
    const share = Math.round(offer.fee * content.balance.sports.soccer.transfer.signing);
    expect(m.finances.savings - win.finances.savings).toBeGreaterThanOrEqual(share - 1);
    expect(m.sports.traded).toBe(m.currentYear);
    expect(m.history.some((h) => h.text.includes(teamById(m, 'soccer', offer.clubId, content)!.name))).toBe(true);
    ok(m);
  });

  it('lets the club refuse unless the fee meets your release clause, and lets an agent push (and sometimes lose the offer)', () => {
    const win = apply(star('clause'), (d) => {
      d.sports.seasons[0]!.rating = 90;
      openWindow(d, path, content, createRng('clause'));
      // A fee a little over what the player is worth: the club listens.
      d.sports.transfer!.offers = d.sports.transfer!.offers.map((o) => ({ ...o, fee: Math.round(transferValue(d, path, content) * 1.3) }));
    });
    const offer = bestOffer(win, content)!;
    expect(transferBlock(win, offer.id, content)).toBeNull();
    expect(transferBlock(win, 'missing', content)).toBe('gone');
    // A met release clause leaves the club no say: always moves.
    for (let i = 0; i < 8; i++) {
      const forced = apply(win, (d) => {
        d.sports.contract!.release = 1;
        expect(takeTransfer(d, path, offer.id, false, content, createRng(`f${i}`))).toBe('moved');
      });
      expect(forced.sports.contract!.teamId).toBe(offer.clubId);
    }
    // Without one the club sometimes says no.
    const results = new Set<string>();
    for (let i = 0; i < 40; i++) apply(win, (d) => void results.add(takeTransfer(d, path, offer.id, i % 2 === 0, content, createRng(`p${i}`))));
    expect(results.has('moved')).toBe(true);
    expect(results.has('refused') || results.has('walked')).toBe(true);
    // A pushed deal pays more than the offer.
    const pushed = [...Array(40)].map((_, i) => apply(win, (d) => void takeTransfer(d, path, offer.id, true, content, createRng(`g${i}`)))).filter((l) => l.sports.contract!.teamId === offer.clubId);
    expect(pushed.some((l) => l.sports.contract!.salary > offer.wage)).toBe(true);
    expect(pushed.every((l) => l.sports.contract!.salary >= offer.wage)).toBe(true);
  });

  it('plays a second-league club’s pay at its share of the league’s', () => {
    const second = path.sport.leagues.pro.teams.find((t) => t.city === 'chicago' && t.tier === 1)!;
    const lowTier = path.sport.leagues.pro.teams.find((t) => t.tier === 2 && t.city === 'nyc' && t.futureCity === true)!;
    const top = pro(lifeAtAge('paytop', 22), 'soccer', second.id).sports.contract!.salary;
    const low = pro(lifeAtAge('paylow', 22), 'soccer', lowTier.id).sports.contract!.salary;
    expect(low).toBeLessThan(top);
  });
});

describe('promotion and relegation between two leagues', () => {
  it('moves the bottom clubs of the top league down and the top clubs of the second up in every country, each year', () => {
    const life = lifeAtAge('league', 25);
    const before = Object.fromEntries(teamsOf(life, 'soccer', content).map((t) => [t.id, divisionOf(life, t)]));
    const next = apply(life, (d) => {
      d.currentYear += 1;
      expect(settleLeagues(d, 'soccer', content, null)).toBeNull();
      // The same year does not move them twice.
      const snapshot = JSON.stringify(d.league.tiers);
      settleLeagues(d, 'soccer', content, null);
      expect(JSON.stringify(d.league.tiers)).toBe(snapshot);
    });
    const after = Object.fromEntries(teamsOf(next, 'soccer', content).map((t) => [t.id, divisionOf(next, t)]));
    const moves = content.balance.sports.soccer.tiers.moves;
    for (const country of ['us', 'ca', 'uk', 'mx', 'es', 'it', 'de', 'fr']) {
      const here = teamsOf(next, 'soccer', content).filter((t) => (t.country ?? content.cities[t.city]!.countryId) === country);
      const down = here.filter((t) => before[t.id] === 1 && after[t.id] === 2);
      const up = here.filter((t) => before[t.id] === 2 && after[t.id] === 1);
      expect(down.length).toBe(moves);
      expect(up.length).toBe(moves);
      expect(here.filter((t) => after[t.id] === 1).length).toBe(here.filter((t) => before[t.id] === 1).length);
    }
    // Same seed, same year: the same clubs.
    const again = apply(life, (d) => {
      d.currentYear += 1;
      settleLeagues(d, 'soccer', content, null);
    });
    expect(again.league.tiers).toEqual(next.league.tiers);
  });

  it('reports how your own club did: a weak side goes down, a strong second-league side comes up', () => {
    const path = sportPath(content, 'soccer')!;
    const weakTop = path.sport.leagues.pro.teams.filter((t) => t.tier === 1 && t.city === 'chicago').sort((a, b) => a.quality - b.quality)[0]!;
    const life = pro(lifeAtAge('own', 24), 'soccer', weakTop.id);
    const down = apply(life, (d) => {
      d.currentYear += 1;
      expect(settleLeagues(d, 'soccer', content, { teamId: weakTop.id, strength: -50 })).toBe('down');
    });
    expect(divisionOf(down, teamById(down, 'soccer', weakTop.id, content)!)).toBe(2);
    const strongSecond = path.sport.leagues.pro.teams.filter((t) => t.tier === 2 && t.city === 'nyc').sort((a, b) => b.quality - a.quality)[0]!;
    const lifeB = pro(lifeAtAge('own2', 24), 'soccer', strongSecond.id);
    const up = apply(lifeB, (d) => {
      d.currentYear += 1;
      expect(settleLeagues(d, 'soccer', content, { teamId: strongSecond.id, strength: 200 })).toBe('up');
    });
    expect(divisionOf(up, teamById(up, 'soccer', strongSecond.id, content)!)).toBe(1);
  });

  it('plays a club against its own league: the same country and division', () => {
    const life = lifeAtAge('mates', 24);
    const team = teamsOf(life, 'soccer', content).find((t) => t.id === 'chicago_lakefront_fc')!;
    const league = sameLeague(life, 'soccer', team, content);
    expect(league.every((t) => divisionOf(life, t) === divisionOf(life, team))).toBe(true);
    expect(league.every((t) => content.cities[t.city]!.countryId === 'us')).toBe(true);
    expect(league.length).toBeGreaterThan(6);
    expect(hasDivisions(path().sport)).toBe(true);
  });

  const path = () => sportPath(content, 'soccer')!;
});

describe('derbies and the national side', () => {
  it('finds a rival in the same city, else in the region', () => {
    const life = lifeAtAge('derby', 25);
    const team = teamsOf(life, 'soccer', content).find((t) => t.id === 'chicago_lakefront_fc')!;
    expect(rivalOf(life, 'soccer', team, content)?.city).toBe('chicago');
    const regional = teamsOf(life, 'basketball', content).find((t) => t.futureCity === true && t.cityName === 'Boston')!;
    const rival = rivalOf(life, 'basketball', regional, content);
    expect(rival === undefined || rival.city === regional.city).toBe(true);
  });

  it('calls up a good player, and a tournament comes round for the called-up', () => {
    const path = sportPath(content, 'soccer')!;
    const club = path.sport.leagues.pro.teams.find((t) => t.city === 'chicago' && t.tier === 1)!;
    const life = pro(lifeAtAge('nat', 26), 'soccer', club.id, (d) => {
      d.fame.paths.soccer!.fame = 60;
      d.sports.seasons[0]!.rating = 92;
    });
    let called = 0;
    for (let i = 0; i < 40; i++) {
      const triggers: string[] = [];
      const next = apply(life, (d) => void nationalStep(d, path, 92, content, createRng(`n${i}`), triggers as never));
      if (triggers.includes('callUp')) {
        called++;
        expect(next.sports.calledUp).toBe(next.currentYear);
      }
    }
    expect(called).toBeGreaterThan(5);
    // A player who is not good enough is not called up.
    const none = [...Array(40)].filter((_, i) => {
      const triggers: string[] = [];
      apply(life, (d) => void nationalStep(d, path, 30, content, createRng(`z${i}`), triggers as never));
      return triggers.includes('callUp');
    });
    expect(none.length).toBe(0);
    // Caps and tournaments are recorded.
    const capped = apply(life, (d) => {
      d.sports.calledUp = d.currentYear;
      applySportsEffect(d, { type: 'sports', action: 'cap' }, {}, content, d.rng);
      applySportsEffect(d, { type: 'sports', action: 'tournament', result: 'win' }, {}, content, d.rng);
    });
    expect(capped.sports.totals).toMatchObject({ caps: 1, tournaments: 1, tournamentTitles: 1 });
    const cycle = path.sport.international.cycle;
    const yr = apply(capped, (d) => {
      d.currentYear = Math.ceil(d.currentYear / cycle) * cycle;
      d.sports.calledUp = d.currentYear;
    });
    expect(tournamentYear(yr, path)).toBe(true);
    expect(tournamentYear(apply(yr, (d) => void (d.currentYear += 1)), path)).toBe(false);
    ok(capped);
  });
});

describe('"football" for soccer where the country says so', () => {
  it('uses the country’s words for both footballs', () => {
    const soccer = sportPath(content, 'soccer')!;
    const american = sportPath(content, 'football')!;
    const us = lifeAtAge('us', 20);
    const uk = ukLife('uk', 20);
    expect(sportWords(us, soccer, content)).toEqual({ name: 'Soccer', noun: 'soccer' });
    expect(sportWords(us, american, content)).toEqual({ name: 'Football', noun: 'football' });
    expect(sportWords(uk, soccer, content)).toEqual({ name: 'Football', noun: 'football' });
    expect(sportWords(uk, american, content)).toEqual({ name: 'American football', noun: 'american football' });
    const mx = apply(lifeAtAge('mx', 20), (d) => void (d.character.cityId = 'mexico_city'));
    expect(sportWords(mx, soccer, content).noun).toBe('football');
    // The Sports screen names it so.
    const view = getSportsView(apply(uk, (d) => void (d.sports.sport = null)), content);
    expect(view.entry.find((e) => e.pathId === 'soccer')!.name).toBe('Football');
  });
});

describe('your own teams: renamed, moved and added', () => {
  const setup = (over: Partial<TeamSetup> = {}): TeamSetup => ({
    renamed: { chicago_lakefront_fc: { name: 'Chicago Lakeshore Rovers', nickname: 'Rovers' } },
    moved: { houston_gulf_city_fc: 'nyc' },
    added: [{ id: 'custom_1', sport: 'soccer', name: 'Garden City Albion', nickname: 'Albion', city: 'chicago', strength: 5, tier: 1 }],
    ...over,
  });

  it('validates input: shape, content, names and limits', () => {
    expect(() => parseTeamSetup(setup(), content)).not.toThrow();
    const bad = (s: unknown, message: RegExp | typeof SetupError) => expect(() => parseTeamSetup(s, content)).toThrow(message);
    bad({ renamed: {}, moved: {}, added: [], extra: 1 }, SetupError);
    bad(setup({ renamed: { chicago_lakefront_fc: { name: 'x' } } }), /at least 2/);
    bad(setup({ renamed: { chicago_lakefront_fc: { name: '<b>Bold</b>' } } }), /letters/);
    bad(setup({ renamed: { chicago_lakefront_fc: { name: 'A'.repeat(41) } } }), /40/);
    bad(setup({ renamed: { nobody: { name: 'Nobody FC' } } }), /does not exist/);
    bad(setup({ moved: { chicago_lakefront_fc: 'atlantis' } }), /cities/);
    bad(setup({ renamed: { chicago_union_yard_sc: { name: 'Chicago Lakefront FC' } } }), /already called/);
    bad(setup({ renamed: { chicago_union_yard_sc: { name: 'Chicago Lakeshore Rovers' }, chicago_ashgrove_united: { name: 'chicago lakeshore rovers' } } }), /already called/);
    bad(setup({ added: [{ id: 'custom_1', sport: 'curling', name: 'Rink Rats', city: 'chicago', strength: 3 }] }), /sport/);
    bad(setup({ added: [{ id: 'bad id', sport: 'soccer', name: 'Rink Rats', city: 'chicago', strength: 3 }] }), SetupError);
    bad(setup({ added: [{ id: 'custom_1', sport: 'soccer', name: 'Rink Rats', city: 'chicago', strength: 9 as never }] }), SetupError);
    bad(setup({ added: [{ id: 'custom_1', sport: 'hockey', name: 'Rink Rats', city: 'chicago', strength: 3, tier: 2 }] }), /one league/);
    const many = Array.from({ length: content.balance.sports.world.added.max + 1 }, (_, i) => ({ id: `custom_${i + 1}`, sport: 'soccer', name: `Team Number ${i + 1}`, city: 'chicago', strength: 3 as const }));
    bad(setup({ added: many }), /Add up to/);
    expect(addedTeamSchema.safeParse({ id: 'custom_1', sport: 'soccer', name: '  Extra   Spaces  ', city: 'chicago', strength: 2 }).data?.name).toBe('Extra Spaces');
  });

  it('stale settings never stop a life: parts that no longer fit are dropped', () => {
    const stale = setup({ renamed: { gone_team: { name: 'Gone FC' }, chicago_lakefront_fc: { name: 'Chicago Lakeshore Rovers' } } });
    const usable = usableSetup(stale, content);
    expect(usable.renamed['gone_team']).toBeUndefined();
    expect(usable.renamed['chicago_lakefront_fc']).toBeDefined();
    expect(usableSetup('nonsense', content)).toEqual(emptySetup());
  });

  it('applies to a new life as a snapshot: renamed, moved and added teams are the life’s teams', () => {
    const life = createLife({ mode: 'random', seed: 'teams', birthYear: 2000, teamSetup: setup() }, content);
    expect(life.league.setup).toEqual(setup());
    const teams = teamsOf(life, 'soccer', content);
    expect(teams.find((t) => t.id === 'chicago_lakefront_fc')).toMatchObject({ name: 'Chicago Lakeshore Rovers', nickname: 'Rovers' });
    expect(teams.find((t) => t.id === 'houston_gulf_city_fc')!.city).toBe('nyc');
    expect(teams.find((t) => t.id === 'custom_1')).toMatchObject({ name: 'Garden City Albion', city: 'chicago', quality: content.balance.sports.world.strength[4], custom: true });
    // The log carries the snapshot, so the life replays exactly.
    expect(life.inputLog[0]!.payload).toMatchObject({ teamSetup: setup() });
    expect(replayLife(life.inputLog, content)).toEqual(life);
    // A life without settings has the game's own teams.
    const plain = createLife({ mode: 'random', seed: 'teams', birthYear: 2000 }, content);
    expect(plain.league.setup).toEqual(emptySetup());
    expect(teamsOf(plain, 'soccer', content).find((t) => t.id === 'chicago_lakefront_fc')!.name).toBe('Chicago Lakefront FC');
  });

  it('does not change a life that began earlier when the settings change afterwards: its replay is exact', () => {
    const life = apply(createLife({ mode: 'random', seed: 'later', birthYear: 2000 }, content), (d) => {
      d.inputLog.push({ year: d.currentYear, kind: 'ageUp', payload: {} });
    });
    const replayBefore = replayLife(life.inputLog.slice(0, 1), content);
    // "The settings changed": a later life would take the new setup, this one is a snapshot.
    const other = createLife({ mode: 'random', seed: 'later', birthYear: 2000, teamSetup: setup() }, content);
    expect(other.league.setup).not.toEqual(replayBefore.league.setup);
    expect(replayLife(life.inputLog.slice(0, 1), content)).toEqual(replayBefore);
    expect(replayBefore.league.setup).toEqual(emptySetup());
  });

  it('shows a rename mid-life without touching the life: display only, keyed by team id', () => {
    const life = createLife({ mode: 'random', seed: 'names', birthYear: 2000 }, content);
    const current = setup({ moved: {}, added: [] });
    const renames = teamRenames(life.league.setup, current, content);
    expect(renames).toContainEqual({ from: 'Chicago Lakefront FC', to: 'Chicago Lakeshore Rovers' });
    expect(withTeamNames('You signed for Chicago Lakefront FC.', renames)).toBe('You signed for Chicago Lakeshore Rovers.');
    expect(withTeamNames('Nothing about teams.', renames)).toBe('Nothing about teams.');
    // The life itself is untouched.
    expect(life.league.setup).toEqual(emptySetup());
    // Renaming a team back to the game's own name needs no replacement.
    expect(teamRenames(life.league.setup, emptySetup(), content)).toEqual([]);
  });

  it('takes a moved or added team (or one removed) from next season through a recorded input', () => {
    const club = sportPath(content, 'soccer')!.sport.leagues.pro.teams.find((t) => t.id === 'chicago_lakefront_fc')!;
    const life = pro(lifeAtAge('sync', 24), 'soccer', club.id);
    const change = { moved: { chicago_lakefront_fc: 'nyc' }, added: [{ id: 'custom_1', sport: 'soccer', name: 'Garden City Albion', city: 'chicago', strength: 4 as const }] };
    expect(isLifeActionAvailable(life, 'sync_teams', { teamChange: change }, content)).toBe(true);
    // Nonsense is refused.
    expect(isLifeActionAvailable(life, 'sync_teams', { teamChange: { moved: { chicago_lakefront_fc: 'atlantis' }, added: [] } }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'sync_teams', { teamChange: { moved: {}, added: [] } }, content)).toBe(false);
    const asked = performAction(life, 'sync_teams', { teamChange: change }, content);
    expect(asked.league.pending).toMatchObject({ applyYear: life.currentYear + 1 });
    // Nothing changes before the season: the life's own teams are the same.
    expect(teamsOf(asked, 'soccer', content).some((t) => t.id === 'custom_1')).toBe(false);
    expect(asked.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'sync_teams' } });
    // The next season takes it up: your team moves city (and so do you), the added team exists.
    const next = apply(asked, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runFame(d, content);
    });
    expect(next.league.pending).toBeNull();
    expect(teamsOf(next, 'soccer', content).find((t) => t.id === 'custom_1')?.name).toBe('Garden City Albion');
    expect(teamById(next, 'soccer', club.id, content)!.city).toBe('nyc');
    expect(next.character.cityId).toBe('nyc');
    ok(next);
    // Removing a team you play for ends the deal with it.
    const added = apply(life, (d) => {
      d.league.setup.added = [{ id: 'custom_1', sport: 'soccer', name: 'Garden City Albion', city: 'chicago', strength: 4 }];
      d.sports.contract!.teamId = 'custom_1';
      d.sports.team = proTeam(d, teamById(d, 'soccer', 'custom_1', content)!, 'soccer', content);
    });
    const removed = apply(performAction(added, 'sync_teams', { teamChange: { moved: {}, added: [] } }, content), (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runFame(d, content);
    });
    expect(removed.league.setup.added).toEqual([]);
    expect(removed.sports.contract?.teamId).not.toBe('custom_1');
    expect(removed.sports.team?.id).not.toBe('custom_1');
    ok(removed);
  });

  it('puts a team you added in the draw like any other', () => {
    const life = createLife({ mode: 'random', seed: 'mine', birthYear: 2000, teamSetup: setup() }, content);
    const home = homeLeagueTeams(life, 'soccer', 'chicago', content);
    expect(home.some((t) => t.id === 'custom_1')).toBe(true);
    expect(marketTeams(life, 'soccer', 'chicago', content).some((t) => t.id === 'custom_1')).toBe(true);
    expect(setupIssues(setup(), content)).toEqual([]);
  });
});
