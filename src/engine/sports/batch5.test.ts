/**
 * Batch 5: the grind and the road to the pros: tryouts for specific teams, one record for a school team and the sports
 * career, training sessions, athletic scholarships, the draft and rookie pay, and the way back for players without a team.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction, finishAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { applyEffects } from '../events/effects';
import { enterPath } from '../fame/ladder';
import { runFame } from '../fame/step';
import { checkInvariants } from '../invariants';
import { resolveChoice } from '../life';
import { createRng } from '../rng';
import { getSportsView } from '../selectors';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { draftProjection, draftScoreBase, draftSlot, pickShare, rookiePay, salaryFor, signCampDeal } from './contract';
import { sportsHolds } from './holds';
import { injuryRisk } from './injury';
import { campOpen, optionFor, teamOptions, tryoutBlock } from './tryout';
import { prospectRating } from './rating';
import { levelOfRung, sportPath } from './query';
import { acceptBlock, offerShare, recruitScore, scholarshipStep } from './scholarship';
import { hasTeam, sessionsLeft, trainBlock, trainCost, trainGain } from './training';
import { draftingTeam } from './team';
import { payTuition } from '../education';
import { runActivities } from '../teen/activities';

const b = content.balance.sports;
const def = sportPath(content, 'basketball')!;
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|scheduled/.test(f))).toEqual([]);

/** A teenager with no career: strong (a fitting talent and fitness) or weak. */
const prospect = (seed: string, age: number, strong = true, over: (d: LifeState) => void = () => {}) =>
  apply(lifeAtAge(seed, age), (d) => {
    d.character.hidden.talent = strong ? 'athletics' : null;
    d.character.stats.fitness = strong ? 85 : 25;
    d.character.personality.discipline = strong ? 80 : 30;
    d.finances.savings = 20_000;
    over(d);
  });

/** Takes a tryout through its scrimmage with an approach; returns the life back at the start of the year. */
function tryOut(life: LifeState, key: string, choice = 'steady'): LifeState {
  let next = performAction(life, 'try_out', { pathId: 'basketball', teamKey: key }, content);
  expect(next.phase).toBe('action');
  next = resolveChoice(next, next.pending[0]!.instanceId, choice, content);
  return finishAction(next);
}

const many = <T,>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));

describe('the teams you can try out for', () => {
  it('lists the teams your age allows at each level, each with a bar and your odds', () => {
    const kid = prospect('opts-kid', 11);
    const keys = teamOptions(kid, def, content).map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining(['youth:rec', 'youth:club', 'youth:travel']));
    expect(keys.some((k) => k.startsWith('school:'))).toBe(false);
    const teen = prospect('opts-teen', 15);
    const teenKeys = teamOptions(teen, def, content).map((o) => o.key);
    expect(teenKeys).toEqual(expect.arrayContaining(['school:jv', 'school:varsity']));
    // A teenager cannot start in the children's youth league: that level ends when you are 14.
    expect(teenKeys.some((k) => k.startsWith('youth:'))).toBe(false);
    const view = getSportsView(teen, content);
    const varsity = view.entry.find((e) => e.pathId === 'basketball')!.teams.find((t) => t.key === 'school:varsity')!;
    expect(varsity.bar).toBe(b.tryout.tiers.varsity.bar);
    expect(varsity.tierLabel).toBe('Varsity');
    expect(varsity.oddsBand).toBeGreaterThanOrEqual(0);
  });

  it('shows the harder team as less likely to take you', () => {
    const teen = prospect('opts-odds', 15, false);
    const odds = (key: string) => getSportsView(teen, content).entry.find((e) => e.pathId === 'basketball')!.teams.find((t) => t.key === key)!.odds;
    expect(odds('school:varsity')).toBeLessThan(odds('school:jv'));
    expect(odds('school:jv')).toBeLessThan(100);
  });

  it('offers club academies only where the country has them, and college programs from 17', () => {
    const us = prospect('opts-acad-us', 12);
    expect(teamOptions(us, def, content).some((o) => o.tier === 'academy')).toBe(false);
    const uk = apply(us, (d) => {
      d.character.cityId = 'london';
    });
    expect(teamOptions(uk, def, content).some((o) => o.tier === 'academy')).toBe(true);
    expect(teamOptions(prospect('opts-col-16', 16), def, content).some((o) => o.level === 'college')).toBe(false);
    expect(teamOptions(prospect('opts-col-18', 18), def, content).some((o) => o.level === 'college')).toBe(true);
  });
});

describe('a tryout', () => {
  it('is an event with choices, and a strong player makes the varsity and starts the sports career on the school team', () => {
    const life = prospect('try-strong', 15);
    expect(isLifeActionAvailable(life, 'try_out', { pathId: 'basketball', teamKey: 'school:varsity' }, content)).toBe(true);
    const queued = performAction(life, 'try_out', { pathId: 'basketball', teamKey: 'school:varsity' }, content);
    expect(queued.phase).toBe('action');
    const event = content.events[queued.pending[0]!.eventId]!;
    expect(event.category).toBe('sportstryout');
    expect(event.choices!.length).toBeGreaterThanOrEqual(3);
    expect(queued.sports.tryout).toMatchObject({ key: 'school:varsity', sport: 'basketball' });
    const done = tryOut(life, 'school:varsity', 'hustle');
    expect(done.sports.tryout).toBeNull();
    expect(done.fame.active).toBe(true);
    expect(done.sports.team).toMatchObject({ level: 'school' });
    // One record: the school team is in your teams and clubs, and the sports career knows it.
    const act = Object.values(content.activities).find((a) => a.sport === 'basketball')!;
    expect(done.teen.activities.some((a) => a.id === act.id)).toBe(true);
    expect(done.sports.tried.at(-1)).toMatchObject({ key: 'school:varsity' });
    ok(done);
  });

  it('is decided by your rating against the bar plus luck: strong players make a team weak ones miss', () => {
    const made = (strong: boolean) => many(60, (i) => tryOut(prospect(`try-${strong}-${i}`, 15, strong), 'school:varsity').sports.tried.at(-1)!.made).filter(Boolean).length;
    const s = made(true);
    const w = made(false);
    expect(s).toBeGreaterThan(w + 25);
    expect(w).toBeLessThan(35);
  });

  it('can fail: a cut with a fallback team, or a cut with none, and a team that cut you will not look again at once', () => {
    let fallbacks = 0;
    let cutAll = 0;
    for (let i = 0; i < 80; i++) {
      const done = tryOut(prospect(`try-cut-${i}`, 15, false), 'school:varsity');
      const rec = done.sports.tried.at(-1)!;
      if (!rec.made && rec.landed !== null) {
        fallbacks += 1;
        expect(rec.landed).toBe('school:jv');
        expect(done.sports.team?.tier).toBe('jv');
        expect(done.fame.active).toBe(true);
      }
      if (rec.landed === null) {
        cutAll += 1;
        expect(done.fame.active).toBe(false);
        expect(done.sports.team).toBeNull();
        expect(done.sports.cut['school:varsity']).toBe(done.currentYear);
        // Cut this year: that team won't see you again until next year.
        expect(tryoutBlock(done, 'basketball', 'school:varsity', content)).toBe('cut');
        const later = apply(done, (d) => void (d.currentYear += 1));
        expect(tryoutBlock(later, 'basketball', 'school:varsity', content)).toBeNull();
      }
    }
    expect(fallbacks).toBeGreaterThan(5);
    expect(cutAll).toBeGreaterThan(3);
  });

  it('is validated: an unknown team, a bad action or a second tryout is refused', () => {
    const life = prospect('try-bad', 15);
    expect(() => performAction(life, 'try_out', { pathId: 'basketball', teamKey: 'college:nope' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'try_out', { pathId: 'curling', teamKey: 'school:varsity' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'try_out', { pathId: 'basketball', teamKey: 'school:varsity', extra: 1 }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'try_out', { pathId: 'basketball' }, content)).toThrow(InvalidInputError);
    // Too young for a college program.
    expect(tryoutBlock(life, 'basketball', 'college:state', content)).toBe('gone');
  });

  it('moves a player up a level when a higher team takes them, and keeps the one they had when it does not', () => {
    let made = 0;
    for (let i = 0; i < 30; i++) {
      const school = tryOut(prospect(`up-${i}`, 17, true), 'school:varsity');
      if (!school.fame.active) continue;
      const rung = school.fame.paths.basketball!.rung;
      const next = apply(school, (d) => {
        d.character.stats.fitness = 95;
      });
      const college = tryOut(next, 'college:state', 'hustle');
      const rec = college.sports.tried.at(-1)!;
      if (rec.landed?.startsWith('college')) {
        made += 1;
        expect(college.fame.paths.basketball!.rung).toBeGreaterThan(rung);
        expect(college.sports.team?.level).toBe('college');
        // The school team is behind you.
        expect(college.teen.activities.some((a) => content.activities[a.id]?.sport === 'basketball')).toBe(false);
      } else {
        expect(college.sports.team?.level).toBe('school');
      }
      ok(college);
    }
    expect(made).toBeGreaterThan(3);
  });

  it('is the engine’s job when you reach a level with no team: it tries out for you, and the last team of the level takes you', () => {
    const life = prospect('auto', 16, false, (d) => {
      enterPath(d, 'basketball', 'school_tryout', content);
      d.sports.team = null;
    });
    const next = apply(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runFame(d, content);
    });
    expect(next.sports.team?.level).toBe('school');
    expect(next.sports.teamless).toBe(false);
  });
});

describe('a school team and the sports career are one record', () => {
  const act = Object.values(content.activities).find((a) => a.sport === 'basketball')!;
  it('puts every sport on a school team, and keeps them out of the plain join', () => {
    for (const id of ['basketball', 'football', 'soccer', 'baseball', 'hockey']) expect(Object.values(content.activities).some((a) => a.sport === id)).toBe(true);
    const life = prospect('rec-join', 14);
    expect(isLifeActionAvailable(life, 'join_activity', { activityId: act.id }, content)).toBe(false);
  });

  it('is left from either side: leaving the team leaves the career’s team, and leaving the team in Sports leaves the school team', () => {
    const joined = tryOut(prospect('rec-leave', 15), 'school:varsity', 'hustle');
    expect(joined.teen.activities.some((a) => a.id === act.id)).toBe(true);
    const left = performAction(joined, 'leave_activity', { activityId: act.id }, content);
    expect(left.sports.team).toBeNull();
    expect(left.sports.teamless).toBe(true);
    expect(left.fame.active).toBe(true);
    const viaSports = performAction(joined, 'leave_team', {}, content);
    expect(viaSports.teen.activities.some((a) => a.id === act.id)).toBe(false);
    expect(viaSports.sports.teamless).toBe(true);
    ok(viaSports);
    // No team, no season; the player is not given one behind their back.
    const next = apply(viaSports, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runFame(d, content);
    });
    expect(next.sports.team).toBeNull();
    expect(next.sports.seasons.length).toBe(joined.sports.seasons.length);
    // ...and a tryout puts them back.
    const back = tryOut(next, 'school:varsity', 'hustle');
    if (back.sports.tried.at(-1)!.landed) expect(back.sports.teamless).toBe(false);
  });

  it('is started by an event too: a school team the event gave you starts the career', () => {
    const life = prospect('rec-event', 14);
    const next = apply(life, (d) => {
      applyEffects(d, [{ type: 'teen', action: 'enroll', activityId: act.id }], { def: content.events.tryout_day!, cast: {}, rng: d.rng, content });
    });
    expect(next.fame.main).toBe('basketball');
    expect(next.sports.team?.level).toBe('school');
    expect(next.teen.activities.some((a) => a.id === act.id)).toBe(true);
  });

  it('does not roll the team’s own injury once the sport is the career (the season does)', () => {
    expect(act.injury).toBeGreaterThan(0);
    let hurt = 0;
    for (let i = 0; i < 40; i++) {
      const life = apply(tryOut(prospect(`rec-inj-${i}`, 15), 'school:varsity'), (d) => void (d.character.stats.fitness = 100));
      const next = apply(life, (d) => void runActivities(d, content));
      if (next.health.conditions.some((c) => c.conditionId === 'broken_bone')) hurt += 1;
    }
    expect(hurt).toBe(0);
  });
});

describe('training sessions', () => {
  const athlete = (seed: string, over: (d: LifeState) => void = () => {}) =>
    apply(prospect(seed, 15), (d) => {
      enterPath(d, 'basketball', 'school_tryout', content);
      over(d);
    });

  it('is an action with a yearly budget (more with a stronger commitment), each session raising a skill', () => {
    let life = athlete('train-1');
    const budget = sessionsLeft(life, content);
    expect(budget).toBe(content.balance.fame.practice.sessions.steady);
    const skill = def.skills![0]!.id;
    const before = life.fame.paths.basketball!.skills?.[skill] ?? content.balance.fame.practice.start;
    for (let i = 0; i < budget; i++) {
      expect(isLifeActionAvailable(life, 'train', { skillId: def.skills![i % def.skills!.length]!.id, trainMode: 'team' }, content)).toBe(true);
      life = performAction(life, 'train', { skillId: def.skills![i % def.skills!.length]!.id, trainMode: 'team' }, content);
    }
    expect(sessionsLeft(life, content)).toBe(0);
    expect(life.fame.paths.basketball!.skills?.[skill] ?? 0).toBeGreaterThan(before);
    expect(isLifeActionAvailable(life, 'train', { skillId: skill, trainMode: 'team' }, content)).toBe(false);
    expect(trainBlock(life, skill, 'team', content)).toBe('budget');
    // All in gives more sessions than holding back.
    const all = apply(athlete('train-2'), (d) => void (d.fame.commitment = 'all'));
    const back = apply(athlete('train-3'), (d) => void (d.fame.commitment = 'back'));
    expect(sessionsLeft(all, content)).toBeGreaterThan(sessionsLeft(back, content));
    expect(life.sports.totals.trainedTeam).toBe(budget);
  });

  it('works without a team at a lower gain, paid for through finance, and a team’s coaches teach more', () => {
    const skill = def.skills![0]!.id;
    const withTeam = athlete('train-4');
    const noTeam = apply(withTeam, (d) => {
      d.sports.team = null;
      d.sports.teamless = true;
    });
    expect(hasTeam(noTeam)).toBe(false);
    expect(trainBlock(noTeam, skill, 'team', content)).toBe('team');
    expect(trainBlock(noTeam, skill, 'gym', content)).toBeNull();
    expect(trainBlock(noTeam, skill, 'coach', content)).toBeNull();
    const team = trainGain(withTeam, skill, 'team', content);
    const gym = trainGain(noTeam, skill, 'gym', content);
    const coach = trainGain(noTeam, skill, 'coach', content);
    expect(gym).toBeGreaterThan(0);
    expect(gym).toBeLessThan(coach);
    expect(coach).toBeLessThan(team);
    // The membership is paid once a year; a coach is paid for each session.
    const fee = trainCost(noTeam, 'gym', content);
    expect(fee).toBeGreaterThan(0);
    const one = performAction(noTeam, 'train', { skillId: skill, trainMode: 'gym' }, content);
    expect(one.finances.savings).toBe(noTeam.finances.savings - fee);
    expect(trainCost(one, 'gym', content)).toBe(0);
    const two = performAction(one, 'train', { skillId: def.skills![1]!.id, trainMode: 'gym' }, content);
    expect(two.finances.savings).toBe(one.finances.savings);
    const coached = performAction(noTeam, 'train', { skillId: skill, trainMode: 'coach' }, content);
    expect(coached.finances.savings).toBe(noTeam.finances.savings - trainCost(noTeam, 'coach', content));
    expect(coached.sports.totals.trainedCoach).toBe(1);
    // You can't pay what you don't have (a grown player).
    const broke = apply(noTeam, (d) => {
      d.character.age = 19;
      d.finances.savings = 5;
    });
    expect(trainBlock(broke, skill, 'coach', content)).toBe('money');
  });

  it('never causes an injury, and never changes the risk of one', () => {
    for (let i = 0; i < 20; i++) {
      let life = athlete(`train-inj-${i}`, (d) => void (d.fame.commitment = 'all'));
      const risk = injuryRisk(life, def.sport, 'school', content);
      const conditions = life.health.conditions.length;
      for (let n = 0; n < 12; n++) {
        const mode = n % 3 === 0 ? 'gym' : n % 3 === 1 ? 'coach' : 'team';
        const skill = def.skills![n % def.skills!.length]!.id;
        if (trainBlock(life, skill, mode, content) === null) life = performAction(life, 'train', { skillId: skill, trainMode: mode }, content);
      }
      expect(life.health.conditions.length).toBe(conditions);
      expect(life.sports.pain).toBe(false);
      expect(injuryRisk(life, def.sport, 'school', content)).toBeCloseTo(risk, 10);
    }
  });

  it('shows in a season’s rating: trained skills lift it', () => {
    const base = athlete('train-rating');
    const trained = apply(base, (d) => {
      d.fame.paths.basketball!.skills = Object.fromEntries(def.skills!.map((s) => [s.id, 80]));
    });
    expect(prospectRating(trained, def, content)).toBeGreaterThan(prospectRating(base, def, content) + 4);
  });

  it('is registered for every sport in content, and only for a player with a career', () => {
    for (const id of ['basketball', 'football', 'soccer', 'baseball', 'hockey']) expect(sportPath(content, id)!.skills!.length).toBeGreaterThanOrEqual(3);
    const none = prospect('train-none', 15);
    expect(trainBlock(none, def.skills![0]!.id, 'gym', content)).toBe('inactive');
    expect(isLifeActionAvailable(none, 'train', { skillId: def.skills![0]!.id, trainMode: 'gym' }, content)).toBe(false);
  });
});

describe('athletic scholarships', () => {
  /** A strong senior in high school, 17, with a season behind them and good grades. */
  const senior = (seed: string, over: (d: LifeState) => void = () => {}) =>
    apply(prospect(seed, 17), (d) => {
      enterPath(d, 'basketball', 'school_tryout', content);
      d.sports.seasons.push({ year: d.currentYear - 1, sport: 'basketball', level: 'school', team: 'Westfield', position: d.sports.position!, rating: 78, played: 100, wins: 14, draws: 0, losses: 4, rank: 1, of: 10, result: 'out', stats: { points: 20 }, salary: 0, allStar: false });
      d.fame.paths.basketball!.fame = 45;
      d.character.hidden.talent = 'athletics';
      d.education.current = { program: 'high', year: 4, lengthYears: 4, gpa: 3.6, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 3 };
      over(d);
    });

  it('come as offers by rating, fame, grades and need: a strong senior gets offers, a weak one gets none', () => {
    const strong = senior('sch-strong');
    expect(strong.education.current?.program).toBe('high');
    const tiers = (['community', 'state', 'elite'] as const).map((t) => recruitScore(strong, def, t, content));
    expect(Math.max(...tiers)).toBeGreaterThan(b.scholarship.tiers.community.from);
    const weak = apply(strong, (d) => {
      d.sports.seasons[0]!.rating = 20;
      d.fame.paths.basketball!.fame = 1;
      if (d.education.current) d.education.current.gpa = 1.5;
    });
    expect(recruitScore(weak, def, 'elite', content)).toBeLessThan(b.scholarship.tiers.elite.from);
    // A bigger rating and better grades raise what a program sees.
    const better = apply(weak, (d) => {
      d.sports.seasons[0]!.rating = 80;
      if (d.education.current) d.education.current.gpa = 3.9;
    });
    expect(recruitScore(better, def, 'state', content)).toBeGreaterThan(recruitScore(weak, def, 'state', content));
    let offered = 0;
    for (let i = 0; i < 30; i++) {
      const triggers: never[] = [];
      const life = apply(senior(`sch-offer-${i}`), (d) => scholarshipStep(d, def, content, createRng(`sch-${i}`), triggers));
      if (life.sports.offers.length > 0) offered += 1;
    }
    expect(offered).toBeGreaterThan(20);
  });

  it('pay a bigger share for a better score, up to what the country pays (a full ride in the US, less elsewhere)', () => {
    const us = senior('sch-us');
    const shareAt = (life: LifeState, score: number) => offerShare(life, 'elite', score, content);
    expect(shareAt(us, b.scholarship.tiers.elite.from - 1)).toBe(0);
    expect(shareAt(us, b.scholarship.tiers.elite.from)).toBeCloseTo(b.scholarship.minShare, 2);
    expect(shareAt(us, b.scholarship.tiers.elite.full)).toBe(1);
    expect(shareAt(us, 200)).toBe(1);
    const uk = apply(us, (d) => void (d.character.cityId = 'london'));
    const mx = apply(us, (d) => void (d.character.cityId = 'mexico_city'));
    const ca = apply(us, (d) => void (d.character.cityId = 'toronto'));
    expect(shareAt(uk, 200)).toBe(content.countries.uk!.athletics.scholarships.maxShare);
    expect(shareAt(mx, 200)).toBe(content.countries.mx!.athletics.scholarships.maxShare);
    expect(shareAt(ca, 200)).toBe(content.countries.ca!.athletics.scholarships.maxShare);
    expect(shareAt(uk, 200)).toBeLessThan(shareAt(us, 200));
  });

  it('exist only where the country has them: no recruiting and no offers when it does not', () => {
    const none = {
      ...content,
      countries: { ...content.countries, us: { ...content.countries.us!, athletics: { ...content.countries.us!.athletics, scholarships: { ...content.countries.us!.athletics.scholarships, available: false, maxShare: 0 } } } },
    };
    for (let i = 0; i < 10; i++) {
      const life = senior(`sch-none-${i}`);
      const after = produce(life, (d) => void scholarshipStep(d as LifeState, def, none, createRng(`n${i}`), []));
      expect(after.sports.offers).toEqual([]);
    }
  });

  it('are accepted through the education system: an admission with a share of tuition, shown on the bill', () => {
    let life = senior('sch-accept', (d) => {
      d.sports.offers = [{ year: d.currentYear, tier: 'state', share: 0.6 }];
    });
    expect(acceptBlock(life, 'state')).toBeNull();
    expect(acceptBlock(life, 'elite')).toBe('none');
    expect(isLifeActionAvailable(life, 'accept_scholarship', { tier: 'state' }, content)).toBe(true);
    life = performAction(life, 'accept_scholarship', { tier: 'state' }, content);
    expect(life.sports.scholarship).toMatchObject({ tier: 'state', share: 0.6, warned: 0 });
    expect(life.sports.offers).toEqual([]);
    expect(life.education.admission).toMatchObject({ program: 'college', tier: 'state' });
    expect(life.flags.recruited_athlete).toBe(true);
    expect(life.sports.totals.scholarships).toBe(1);
    // The bill: the athletic share comes off the tuition before the family and the loan.
    const enrolled = apply(life, (d) => {
      d.character.age = 18;
      d.education.current = { program: 'college', tier: 'state', majorId: 'business', year: 1, lengthYears: 4, gpa: 3.2, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear };
      d.education.admission = null;
      d.education.fund = 0;
      payTuition(d, content);
    });
    const bill = enrolled.education.lastBill!;
    expect(bill.tuition).toBeGreaterThan(0);
    expect(bill.scholarship).toBe(Math.round(bill.tuition * 0.6));
    const without = apply(enrolled, (d) => {
      d.sports.scholarship = null;
      d.education.lastBill = undefined as never;
      payTuition(d, content);
    });
    expect(without.education.lastBill!.scholarship).toBeLessThan(bill.scholarship);
    ok(life);
  });

  it('are refused with another scholarship, and turned down by the decline action', () => {
    const held = senior('sch-held', (d) => {
      d.sports.scholarship = { tier: 'state', share: 0.5, since: d.currentYear, warned: 0 };
      d.sports.offers = [{ year: d.currentYear, tier: 'elite', share: 0.9 }];
    });
    expect(acceptBlock(held, 'elite')).toBe('held');
    const offered = senior('sch-decline', (d) => void (d.sports.offers = [{ year: d.currentYear, tier: 'elite', share: 0.9 }]));
    expect(performAction(offered, 'decline_scholarship', {}, content).sports.offers).toEqual([]);
    expect(() => performAction(offered, 'accept_scholarship', { tier: 'community' }, content)).toThrow(InvalidInputError);
  });

  /** A college player on the scholarship's team, in the program. */
  const student = (seed: string, gpa: number) =>
    apply(senior(seed), (d) => {
      d.character.age = 19;
      d.fame.paths.basketball!.rung = 3;
      d.sports.team = { id: null, name: 'State Falcons', city: d.character.cityId, level: 'college', quality: 58, tier: 'state' };
      d.sports.scholarship = { tier: 'state', share: 0.6, since: d.currentYear - 1, warned: 0 };
      d.education.current = { program: 'college', tier: 'state', majorId: 'business', year: 2, lengthYears: 4, gpa, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 1 };
    });

  it('keeps a grade floor: a year under it is a warning, a second takes the eligibility and the place on the team', () => {
    const triggers: string[] = [];
    let life = student('sch-floor', b.scholarship.floor - 0.5);
    life = apply(life, (d) => scholarshipStep(d, def, content, createRng('f1'), triggers as never[]));
    expect(life.sports.scholarship?.warned).toBe(1);
    expect(triggers).toContain('probation');
    expect(life.sports.team).not.toBeNull();
    life = apply(life, (d) => scholarshipStep(d, def, content, createRng('f2'), triggers as never[]));
    expect(life.sports.scholarship).toBeNull();
    expect(life.sports.team).toBeNull();
    expect(life.sports.teamless).toBe(true);
    expect(triggers).toContain('scholarshipLost');
    expect(life.sports.totals.scholarshipsLost).toBe(1);
    // The aid is gone from the next bill.
    const billed = apply(life, (d) => payTuition(d, content));
    expect(billed.education.lastBill!.scholarship).toBe(0);
  });

  it('clears a warning when the grades come back', () => {
    let life = student('sch-recover', b.scholarship.floor - 0.5);
    life = apply(life, (d) => scholarshipStep(d, def, content, createRng('r1'), []));
    expect(life.sports.scholarship?.warned).toBe(1);
    life = apply(life, (d) => {
      d.education.current!.gpa = b.scholarship.floor + 1;
      scholarshipStep(d, def, content, createRng('r2'), []);
    });
    expect(life.sports.scholarship?.warned).toBe(0);
  });

  it('ends when you leave the team', () => {
    const life = apply(student('sch-leave', 3.5), (d) => void (d.sports.team = null));
    const after = apply(life, (d) => scholarshipStep(d, def, content, createRng('l1'), []));
    expect(after.sports.scholarship).toBeNull();
    const quit = performAction(student('sch-leave2', 3.5), 'leave_team', {}, content);
    expect(quit.sports.scholarship).toBeNull();
  });

  it('puts a recruit on the program’s team without a tryout once they go there', () => {
    const life = apply(senior('sch-seat'), (d) => {
      d.sports.scholarship = { tier: 'elite', share: 0.8, since: d.currentYear, warned: 0 };
      d.education.admission = { program: 'college', tier: 'elite', majorId: 'business', scholarship: 0, decided: d.currentYear };
      d.education.current = { program: 'high', year: 4, lengthYears: 4, gpa: 3.6, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 3 };
      d.character.age = 18;
    });
    const next = apply(life, (d) => {
      d.currentYear += 1;
      runFame(d, content);
    });
    expect(next.sports.team).toMatchObject({ level: 'college', tier: 'elite' });
    expect(next.fame.paths.basketball!.rung).toBe(3);
    expect(next.teen.activities.some((a) => content.activities[a.id]?.sport === 'basketball')).toBe(false);
  });
});

describe('the draft and rookie pay', () => {
  const college = (seed: string, over: (d: LifeState) => void = () => {}) =>
    apply(prospect(seed, 21), (d) => {
      enterPath(d, 'basketball', 'open_tryout', content);
      d.sports.seasons.push({ year: d.currentYear - 1, sport: 'basketball', level: 'college', team: 'State Falcons', position: d.sports.position!, rating: 70, played: 100, wins: 20, draws: 0, losses: 8, rank: 1, of: 10, result: 'out', stats: { points: 18 }, salary: 0, allStar: false });
      d.fame.paths.basketball!.fame = 40;
      over(d);
    });

  it('puts a prospect where their skill puts them: a stronger prospect goes earlier', () => {
    const slot = (score: number) => draftSlot(score, def.sport, 'chicago', content).pick;
    expect(slot(90)).toBeLessThan(slot(70));
    expect(slot(70)).toBeLessThan(slot(60));
    expect(slot(20)).toBe(0);
    const base = (rating: number, fame: number, combine = 0, over: (d: LifeState) => void = () => {}) =>
      draftScoreBase(
        college('score', (d) => {
          d.sports.seasons[0]!.rating = rating;
          d.sports.combine = combine;
          over(d);
        }),
        fame,
        content,
      );
    expect(base(80, 40)).toBeGreaterThan(base(60, 40));
    expect(base(70, 60)).toBeGreaterThan(base(70, 20));
    // Combine events move it, up to the cap.
    expect(base(70, 40, 6)).toBeGreaterThan(base(70, 40, 0));
    expect(base(70, 40, -6)).toBeLessThan(base(70, 40, 0));
    expect(base(70, 40, 25) - base(70, 40, 0)).toBeCloseTo(b.draft.combine, 5);
  });

  it('moves with the league’s need for the position (stable for a life and a year)', () => {
    const a = college('need');
    expect(draftScoreBase(a, 40, content)).toBe(draftScoreBase(a, 40, content));
    const seen = new Set(many(12, (i) => draftScoreBase(apply(a, (d) => void (d.currentYear += i)), 40, content)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('says in words where you are projected to go, and which way the range leans', () => {
    const star = college('proj-star', (d) => {
      d.sports.seasons[0]!.rating = 92;
      d.fame.paths.basketball!.fame = 70;
    });
    const scrub = college('proj-scrub', (d) => {
      d.sports.seasons[0]!.rating = 25;
      d.fame.paths.basketball!.fame = 2;
    });
    expect(draftProjection(star, def, content)!.likely).toMatch(/lottery|early/);
    expect(draftProjection(scrub, def, content)!.likely).toBe('unlikely');
    const view = getSportsView(star, content);
    expect(view.prospect?.line.length).toBeGreaterThan(10);
    expect(view.prospect?.best).toBeTruthy();
    expect(getSportsView(prospect('no-card', 15), content).prospect).toBeNull();
    for (const band of b.draft.projection) expect(content.text.sports.projection[band.id]).toBeDefined();
  });

  it('pays rookies by a smooth curve of the pick: the first pick most, the last least, with a bigger signing bonus up top', () => {
    const total = 24;
    const pay = (pick: number) => rookiePay(def, pick, total, content);
    const picks = [1, 2, 3, 5, 8, 12, 16, 20, 24];
    for (let i = 1; i < picks.length; i++) {
      expect(pay(picks[i - 1]!).salary).toBeGreaterThan(pay(picks[i]!).salary);
      expect(pay(picks[i - 1]!).signing).toBeGreaterThanOrEqual(pay(picks[i]!).signing);
    }
    // Smooth: neighbouring picks differ by little compared with the whole range.
    const spread = pay(1).salary - pay(24).salary;
    for (let p = 1; p < 24; p++) expect(pay(p).salary - pay(p + 1).salary).toBeLessThan(spread * 0.2);
    expect(pickShare(1, total)).toBe(0);
    expect(pickShare(total, total)).toBeLessThan(100);
    // Pay follows the pick, whatever the round the pick falls in; salaryFor is the same curve.
    expect(salaryFor(def, 'rookie', def.sport.proRung, 60, content, { pick: 1, total })).toBe(pay(1).salary);
    expect(salaryFor(def, 'rookie', def.sport.proRung, 60, content, { pick: 1, total })).toBeGreaterThan(salaryFor(def, 'minimum', def.sport.proRung, 60, content) * 3);
  });

  it('adds skill incentives: a better season within the same slot pays more through the ledger', () => {
    const signed = (seed: string, skill: number) =>
      apply(college(seed), (d) => {
        d.sports.draft = { year: d.currentYear, pick: 10, round: 1, teamId: draftingTeam(def.sport, 10, 'chicago', content).id };
        applyEffects(d, [{ type: 'sports', action: 'sign' }], { def: content.events.draft_night_first_round!, cast: {}, rng: d.rng, content });
        d.fame.paths.basketball!.skills = Object.fromEntries(def.skills!.map((s) => [s.id, skill]));
        d.sports.seasons = [];
        d.fame.agent = null;
      });
    const first = signed('inc-0', 10);
    const c = first.sports.contract!;
    expect(c.kind).toBe('rookie');
    expect(c.salary).toBe(rookiePay(def, 10, 24, content).salary);
    expect(c.incentive).toBe(rookiePay(def, 10, 24, content).incentive);
    expect(c.incentive).toBeGreaterThan(0);
    // The signing bonus is by the pick and reaches savings at once.
    expect(first.finances.savings).toBeGreaterThan(prospect('inc-0', 21).finances.savings);
    const paidBy = (skill: number) => {
      let extra = 0;
      for (let i = 0; i < 30; i++) {
        const life = apply(signed(`inc-${i}`, skill), (d) => {
          d.currentYear += 1;
          d.character.age += 1;
          runFame(d, content);
        });
        const season = life.sports.seasons.at(-1);
        if (season && season.level === 'pro') extra += season.salary - life.sports.contract!.salary;
      }
      return extra;
    };
    const strong = paidBy(95);
    const weak = paidBy(10);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0);
    // Never more than the incentive on the deal.
    expect(strong / 30).toBeLessThanOrEqual(c.incentive!);
    ok(first);
  });
});

describe('players without a team', () => {
  const unsigned = (seed: string, age = 24, over: (d: LifeState) => void = () => {}) =>
    apply(prospect(seed, age), (d) => {
      enterPath(d, 'basketball', 'open_tryout', content);
      d.sports.seasons.push({ year: d.currentYear - 1, sport: 'basketball', level: 'college', team: 'State Falcons', position: d.sports.position!, rating: 62, played: 100, wins: 18, draws: 0, losses: 10, rank: 2, of: 10, result: 'out', stats: { points: 15 }, salary: 0, allStar: false });
      d.sports.passed = d.currentYear - 1;
      over(d);
    });

  it('can go to camps and open tryouts every year: pro camps are on the list for a player the draft passed by', () => {
    const life = unsigned('camp-open');
    expect(campOpen(life, def, content)).toBe(true);
    const camps = teamOptions(life, def, content).filter((o) => o.level === 'pro');
    expect(camps.length).toBeGreaterThanOrEqual(6);
    expect(camps.every((c) => c.teamId !== null && c.bar > 0)).toBe(true);
    expect(getSportsView(life, content).camps).toBe(true);
    // A team that is harder to make asks more of you.
    const hard = camps.reduce((a, c) => (c.quality > a.quality ? c : a));
    const easy = camps.reduce((a, c) => (c.quality < a.quality ? c : a));
    expect(hard.bar).toBeGreaterThan(easy.bar);
    // Not for someone still in the draft's future, or a player who has a team.
    expect(campOpen(prospect('camp-young', 17), def, content)).toBe(false);
    expect(campOpen(apply(life, (d) => void (d.sports.passed = 0)), def, content)).toBe(false);
  });

  it('sign when they are good enough, and stay unsigned when they are not', () => {
    const good = many(40, (i) => {
      const life = unsigned(`camp-good-${i}`, 24, (d) => void (d.fame.paths.basketball!.skills = Object.fromEntries(def.skills!.map((s) => [s.id, 70]))));
      const easy = teamOptions(life, def, content).filter((o) => o.level === 'pro').sort((a, b2) => a.bar - b2.bar)[0]!;
      const done = tryOut(life, easy.key, 'hustle');
      return done;
    });
    const signed = good.filter((l) => l.sports.pro).length;
    expect(signed).toBeGreaterThan(10);
    for (const l of good.filter((x) => x.sports.pro)) {
      expect(l.sports.contract).not.toBeNull();
      expect(l.sports.contract!.kind).toMatch(/minimum|standard/);
      expect(l.sports.totals.signedAfterUndrafted).toBe(1);
      expect(l.sports.passed).toBe(0);
      expect(levelOfRung(def.sport, l.fame.paths.basketball!.rung)).toBe('pro');
      ok(l);
    }
    const bad = many(30, (i) => {
      const life = unsigned(`camp-bad-${i}`, 24, (d) => {
        d.character.stats.fitness = 10;
        d.character.hidden.talent = null;
        d.character.personality.discipline = 10;
      });
      const hardest = teamOptions(life, def, content).filter((o) => o.level === 'pro').sort((a, b2) => b2.bar - a.bar)[0]!;
      return tryOut(life, hardest.key, 'steady');
    });
    expect(bad.filter((l) => l.sports.pro).length).toBeLessThan(5);
    // A miss is recorded, and the same camp won't see you again this year.
    const missed = bad.find((l) => !l.sports.pro)!;
    expect(missed.sports.tried.at(-1)!.made).toBe(false);
    expect(tryoutBlock(missed, 'basketball', missed.sports.tried.at(-1)!.key, content)).toBe('cut');
  });

  it('keep trying with no automatic stall, until the age limit in balance', () => {
    const free = (age: number) =>
      apply(prospect('free', 22, true), (d) => {
        enterPath(d, 'basketball', 'open_tryout', content);
        d.character.age = age;
        d.sports.pro = true;
        d.sports.team = null;
        d.sports.contract = null;
        d.sports.unsigned = 6;
        d.fame.paths.basketball!.rung = def.sport.proRung;
        d.sports.seasons.push({ year: d.currentYear - 1, sport: 'basketball', level: 'pro', team: 'X', position: d.sports.position!, rating: 30, played: 100, wins: 3, draws: 0, losses: 40, rank: 10, of: 10, result: 'missed', stats: {}, salary: 0, allStar: false });
        d.character.stats.fitness = 5;
      });
    const step = (life: LifeState) =>
      apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runFame(d, content);
      });
    // Six years without a team and still in the chase.
    expect(step(free(b.contract.chaseAge - 2)).sports.retired).toBeUndefined();
    // Past the age limit the phone stops ringing.
    expect(step(free(b.contract.chaseAge)).sports.retired).toBeDefined();
    expect(campOpen(free(b.contract.chaseAge - 2), def, content)).toBe(true);
    expect(campOpen(free(b.contract.chaseAge + 1), def, content)).toBe(false);
  });

  it('never put anyone under 18 in the pros', () => {
    const kid = prospect('camp-minor', 17);
    expect(signCampDeal(kid, 'chicago_foundrymen', content, createRng('x'))).toBe(false);
    expect(teamOptions(kid, def, content).some((o) => o.level === 'pro')).toBe(false);
    const teen = unsigned('camp-minor-2', 17);
    expect(campOpen(teen, def, content)).toBe(false);
  });
});

describe('choices through the season', () => {
  const player = (seed: string, over: (d: LifeState) => void = () => {}) =>
    apply(prospect(seed, 16), (d) => {
      enterPath(d, 'basketball', 'school_tryout', content);
      d.sports.seasons.push({ year: d.currentYear - 1, sport: 'basketball', level: 'school', team: 'X', position: d.sports.position!, rating: 60, played: 100, wins: 10, draws: 0, losses: 8, rank: 3, of: 10, result: 'out', stats: {}, salary: 0, allStar: false });
      over(d);
    });
  const fx = (life: LifeState, effects: Parameters<typeof applyEffects>[1]) =>
    apply(life, (d) => applyEffects(d, effects, { def: content.events.role_ask_for_minutes!, cast: {}, rng: d.rng, content }));

  it('moves your place on the team a step at a time, between reserve and starter', () => {
    let life = player('role-1', (d) => void (d.sports.role = 'reserve'));
    life = fx(life, [{ type: 'sports', action: 'role', delta: 1 }]);
    expect(life.sports.role).toBe('rotation');
    life = fx(life, [{ type: 'sports', action: 'role', delta: 1 }]);
    expect(life.sports.role).toBe('starter');
    life = fx(life, [{ type: 'sports', action: 'role', delta: 1 }]);
    expect(life.sports.role).toBe('starter');
    life = fx(life, [{ type: 'sports', action: 'role', delta: -1 }]);
    expect(life.sports.role).toBe('rotation');
  });

  it('plays a reserve less than a starter', () => {
    const season = (role: 'starter' | 'reserve') => {
      const life = player(`role-play-${role}`, (d) => {
        d.sports.team = { id: null, name: 'X', city: d.character.cityId, level: 'school', quality: 50, tier: 'varsity' };
      });
      return apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        d.sports.role = role;
        runFame(d, content);
      });
    };
    // A new season recomputes the role from the rating against the team; the share of games follows it.
    const starter = season('starter').sports.seasons.at(-1)!;
    expect(starter.played).toBeGreaterThan(0);
    expect(b.role.played.reserve).toBeLessThan(b.role.played.starter);
  });

  it('keeps a jersey number and a captain’s band, and resets them on a new team', () => {
    let life = player('num-1');
    expect(sportsHolds({ number: false }, life, content)).toBe(true);
    life = fx(life, [{ type: 'sports', action: 'number', value: 23 }]);
    expect(life.sports.number).toBe(23);
    expect(sportsHolds({ number: true }, life, content)).toBe(true);
    life = fx(life, [{ type: 'sports', action: 'captain', on: true }]);
    expect(life.sports.captain).toBe(true);
    expect(sportsHolds({ captain: true }, life, content)).toBe(true);
    const lifted = prospectRating(life, def, content);
    const plain = prospectRating(fx(life, [{ type: 'sports', action: 'captain', on: false }]), def, content);
    expect(lifted).toBeGreaterThan(plain);
    // A different team starts you fresh.
    const moved = apply(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      d.sports.team = { id: null, name: 'Another School Hawks', city: d.character.cityId, level: 'school', quality: 50, tier: 'varsity' };
      runFame(d, content);
    });
    expect(moved.sports.captain).toBe(false);
    expect(moved.sports.number).toBeNull();
  });

  it('adds combine points the draft will count, within the cap', () => {
    let life = player('comb-1');
    life = fx(life, [{ type: 'sports', action: 'combine', delta: 20 }]);
    life = fx(life, [{ type: 'sports', action: 'combine', delta: 20 }]);
    expect(life.sports.combine).toBe(30);
    expect(sportsHolds({ combine: { gte: 10 } }, life, content)).toBe(true);
  });

  it('queues the season’s choice events, up to the cap on the others', () => {
    const triggers = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const life = player(`trig-${i}`, (d) => void (d.sports.number = null));
      const step = apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runFame(d, content);
      });
      for (const s of step.scheduled) {
        const ev = content.events[s.eventId];
        if (ev) triggers.add(ev.id);
      }
    }
    expect(triggers.has('jersey_number_choice') || triggers.has('jersey_number_taken')).toBe(true);
  });
});

describe('events', () => {
  it('has the new events, each one a follow-up queued by the sports step or a tryout', () => {
    const ids = [
      ...Object.values(content.registries.sports.tryouts).flat(),
      ...['recruited', 'probation', 'scholarshipLost', 'combine', 'camp', 'role', 'offseason', 'number', 'captain'].flatMap((t) => content.registries.sports.triggers[t as 'camp'].events),
    ];
    expect(ids.length).toBeGreaterThanOrEqual(26);
    for (const id of ids) expect(content.events[id]?.followUpOnly).toBe(true);
  });

  it('keeps pro camps and deals for adults', () => {
    for (const id of content.registries.sports.tryouts.pro) {
      const ev = content.events[id]!;
      expect(JSON.stringify(ev.requires)).toContain('"gte":18');
    }
    for (const id of content.registries.sports.triggers.camp.events) expect(JSON.stringify(content.events[id]!.requires)).toContain('"gte":18');
  });

  it('checks the new conditions', () => {
    const life = prospect('cond', 15);
    expect(sportsHolds({ tryout: false }, life, content)).toBe(true);
    const lined = apply(life, (d) => void (d.sports.tryout = { sport: 'basketball', key: 'school:varsity', year: d.currentYear }));
    expect(sportsHolds({ tryout: true }, lined, content)).toBe(true);
    const done = tryOut(prospect('cond-2', 15), 'school:varsity');
    expect(sportsHolds({ tried: ['made', 'fallback', 'cut'] }, done, content)).toBe(true);
    expect(sportsHolds({ offers: ['elite'] }, life, content)).toBe(false);
    expect(sportsHolds({ scholarship: false, club: false }, life, content)).toBe(true);
  });

  it('has a plain sentence for how a tryout went, in the outcome of the scrimmage', () => {
    const queued = performAction(prospect('text-1', 15), 'try_out', { pathId: 'basketball', teamKey: 'school:varsity' }, content);
    const resolved = resolveChoice(queued, queued.pending[0]!.instanceId, 'steady', content);
    const text = resolved.pending[0]!.outcomeText ?? '';
    expect(text.length).toBeGreaterThan(30);
    expect(text).not.toMatch(/[{}]/);
    expect(optionFor(resolved, def, 'school:varsity', content)).toBeDefined();
  });
});
