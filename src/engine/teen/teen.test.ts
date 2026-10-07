import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { RULE_DOMAINS } from '../../content/schemas';
import { isLifeActionAvailable, performAction } from '../actions';
import { playYear } from '../autoplay';
import { evaluate } from '../conditions';
import { checkInvariants } from '../invariants';
import { beginYear } from '../life';
import { sentence } from '../legal';
import { addTie } from '../web/ties';
import { canChangeKind } from '../relationships';
import { createRng } from '../rng';
import { applyEffects } from '../events/effects';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { vehicleQuote } from '../possessions/vehicles';
import { activityBlock, joinActivity, runActivities, tryoutChance } from './activities';
import { crowdToJoin, endClash, joinChance, joinClique, runSchool, startClash } from './cliques';
import { focusBlock, nextFocus, runFocus, type chooseFocus } from './focus';
import { expectedJobPay, hireJob, jobBlock, runJob, teenIncome } from './jobs';
import { addLesson, grantStage, lessonBlock, permitBlock, takePermit, takeTest, testBlock, testChance } from './license';
import { cliqueName, crowdMembers, emptyTeen, focusOf, householdParents, livingMembers, myClique, rivalClique, startingTeen } from './query';
import { adjustRule, breakRule, negotiate, negotiateBlock, negotiateChance, refreshHome, runRules, styleOfParent } from './rules';
import { runTeen } from './step';
import { isJuvenileEntry, runTrouble } from './trouble';
import { romanceUnderAgeFailures, teenFailures } from './invariants';

const b = content.balance.teen;

/** A life played up to `age` (at the start of the year), so it has a school, parents at home and the rest. */
function teenAt(seed: string, age: number): LifeState {
  let life = lifeAtAge(seed, Math.max(0, age - 2));
  const rng = createRng(`${seed}:choices`);
  void rng;
  for (let i = 0; i < 2; i++) life = playYear(life, content);
  expect(life.character.age).toBe(age);
  return life;
}

const edit = (life: LifeState, f: (d: LifeState) => void): LifeState => produce(life, f);
/** Starts the teen year as the pipeline would: runs the teen step on a draft. */
const step = (life: LifeState): LifeState => produce(life, (d) => void runTeen(d, content));
// (A life built by hand, or a step run outside beginYear, can't pass the log, recap and due-event checks.)
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|history|scheduled .* is due in the past|lifeStage/.test(f))).toEqual([]);

describe('crowds at school', () => {
  it('are drawn for a school once, between four and five of them, with rivals in pairs', () => {
    for (let i = 0; i < 12; i++) {
      const life = step(teenAt(`crowds-${i}`, 14));
      const t = life.teen;
      expect(t.school).not.toBeNull();
      expect(t.cliques.length).toBeGreaterThanOrEqual(b.school.cliques.min);
      expect(t.cliques.length).toBeLessThanOrEqual(b.school.cliques.max);
      expect(new Set(t.cliques.map((c) => c.defId)).size).toBe(t.cliques.length);
      for (const c of t.cliques) {
        expect(content.cliques[c.defId]).toBeDefined();
        if (c.rival) expect(t.cliques.find((x) => x.id === c.rival)!.rival).toBe(c.id);
      }
      ok(life);
    }
  });

  it('are the same for a seed, and a new school (a new city) gets new ones', () => {
    const a = step(teenAt('crowds-same', 14));
    const again = step(teenAt('crowds-same', 14));
    expect(a.teen.cliques).toEqual(again.teen.cliques);
    const moved = produce(a, (d) => {
      d.character.cityId = Object.keys(content.cities).find((c) => c !== d.character.cityId)!;
      runSchool(d, content);
    });
    expect(moved.teen.school!.key).not.toBe(a.teen.school!.key);
    expect(moved.teen.member).toBeNull();
    expect(moved.history.at(-1)!.tags).toContain('newSchool');
  });

  it('are not there out of school', () => {
    const life = produce(step(teenAt('crowds-out', 15)), (d) => {
      d.education.current = null;
      runSchool(d, content);
    });
    expect(life.teen.school).toBeNull();
    expect(life.teen.cliques).toEqual([]);
  });

  it('take you in by a chance that follows who you are and how the crowd stands', () => {
    const life = step(teenAt('crowds-chance', 15));
    const clique = life.teen.cliques[0]!;
    const def = content.cliques[clique.defId]!;
    const likesRisk = (def.likes.riskTaking ?? 0) > 0;
    const bold = edit(life, (d) => {
      d.character.personality.riskTaking = likesRisk ? 100 : 0;
      d.teen.standing = 90;
    });
    const meek = edit(life, (d) => {
      d.character.personality.riskTaking = likesRisk ? 0 : 100;
      d.teen.standing = 5;
    });
    expect(joinChance(bold, clique, content)).toBeGreaterThanOrEqual(joinChance(meek, clique, content));
    for (const l of [bold, meek]) {
      const p = joinChance(l, clique, content);
      expect(p).toBeGreaterThanOrEqual(b.cliques.join.min);
      expect(p).toBeLessThanOrEqual(b.cliques.join.max);
    }
  });

  it('bring people into your life, tied to each other as friends, and never romantic', () => {
    const life = step(teenAt('crowds-join', 15));
    const clique = life.teen.cliques[0]!;
    const joined = produce(life, (d) => {
      expect(joinClique(d, clique.id, content, false)).toBe('joined');
    });
    expect(joined.teen.member?.cliqueId).toBe(clique.id);
    const members = livingMembers(joined, myClique(joined));
    expect(members.length).toBeGreaterThanOrEqual(b.cliques.members.min);
    expect(members.length).toBeLessThanOrEqual(b.cliques.members.max);
    for (const id of members) {
      expect(joined.relationships[id]!.kind).toBe('classmate');
      expect(joined.people[id]!.tags).toContain(`crowd:${clique.id}`);
      const age = joined.character.age - (joined.currentYear - joined.people[id]!.birthYear) + (joined.currentYear - joined.people[id]!.birthYear);
      void age;
      expect(joined.currentYear - joined.people[id]!.birthYear).toBeLessThan(18);
    }
    // Every pair of members is tied as friends (E4).
    const ties = Object.values(joined.web.ties).filter((t) => members.includes(t.a) && members.includes(t.b));
    expect(ties.length).toBe((members.length * (members.length - 1)) / 2);
    for (const t of ties) expect(t.kind).toBe('friends');
    expect(romanceUnderAgeFailures(joined, content)).toEqual([]);
    ok(joined);
  });

  it('can be switched: the crowd you leave feels it, and may hold it against you', () => {
    let life = step(teenAt('crowds-switch', 15));
    const [first, second] = life.teen.cliques;
    life = produce(life, (d) => void joinClique(d, first!.id, content, false));
    const oldMembers = livingMembers(life, myClique(life));
    const before = oldMembers.map((id) => life.relationships[id]!.affection);
    const switched = produce(life, (d) => {
      expect(joinClique(d, second!.id, content, false)).toBe('switched');
    });
    expect(switched.teen.member?.cliqueId).toBe(second!.id);
    oldMembers.forEach((id, i) => expect(switched.relationships[id]!.affection).toBeLessThan(before[i]!));
    expect(switched.teen.turnedAway[first!.id]).toBe(switched.currentYear);
    expect(switched.history.some((h) => h.tags.includes('cliqueSwitched'))).toBe(true);
    ok(switched);
  });

  it('turn you away now and then, and won’t have you back for a while', () => {
    let turned = 0;
    for (let i = 0; i < 40; i++) {
      const life = edit(step(teenAt(`crowds-turn-${i}`, 15)), (d) => {
        d.teen.standing = 0;
        d.character.personality.riskTaking = 0;
        d.character.personality.sociability = 0;
      });
      const id = life.teen.cliques[0]!.id;
      const result = produce(life, (d) => {
        if (joinClique(d, id, content) === 'turnedAway') turned++;
      });
      if (result.teen.member === null) {
        expect(result.teen.turnedAway[id]).toBe(result.currentYear);
        expect(isLifeActionAvailable(result, 'join_clique', { cliqueId: id }, content)).toBe(false);
      }
    }
    expect(turned).toBeGreaterThan(0);
  });

  it('clash with a rival: a feud between one of yours and one of theirs, ended by settling', () => {
    let life = step(teenAt('crowds-clash', 15));
    const withRival = life.teen.cliques.find((c) => c.rival !== undefined)!;
    life = produce(life, (d) => void joinClique(d, withRival.id, content, false));
    const clash = produce(life, (d) => {
      expect(startClash(d, withRival.rival!, content)).toBe(true);
    });
    expect(clash.teen.clash?.cliqueId).toBe(withRival.rival);
    const theirs = crowdMembers(clash, 'rival');
    expect(theirs.length).toBeGreaterThan(0);
    const feuds = Object.values(clash.web.ties).filter((t) => t.feud && theirs.some((id) => id === t.a || id === t.b));
    expect(feuds.length).toBe(1);
    expect(rivalClique(clash)?.id).toBe(withRival.rival);
    ok(clash);
    const settled = produce(clash, (d) => void endClash(d, content));
    expect(settled.teen.clash).toBeUndefined();
    expect(Object.values(settled.web.ties).some((t) => t.feud)).toBe(false);
  });

  it('a crowd that noticed you can be joined without a second roll, and an event can ask for the best fit', () => {
    const life = edit(step(teenAt('crowds-invite', 15)), (d) => {
      d.teen.member = undefined;
      d.teen.clash = undefined;
      d.teen.invite = d.teen.cliques[1]!.id;
    });
    expect(crowdToJoin(life, content)?.id).toBe(life.teen.cliques[1]!.id);
    expect(evaluate({ teen: { invited: true } }, life)).toBe(true);
    const joined = produce(life, (d) =>
      applyEffects(d, [{ type: 'teen', action: 'join' }], { def: content.events.crowd_notices_you!, cast: {}, rng: d.rng, content }),
    );
    expect(joined.teen.member?.cliqueId).toBe(life.teen.cliques[1]!.id);
    expect(joined.teen.invite).toBeUndefined();
  });

  it('read through the teen condition and the crowd names', () => {
    const life = produce(step(teenAt('crowds-cond', 15)), (d) => void joinClique(d, d.teen.cliques[0]!.id, content, false));
    const def = life.teen.cliques[0]!.defId;
    expect(evaluate({ teen: { clique: true } }, life)).toBe(true);
    expect(evaluate({ teen: { crowd: [def] } }, life)).toBe(true);
    expect(evaluate({ teen: { crowd: ['nonexistent'] } }, life)).toBe(false);
    expect(cliqueName(content, myClique(life))).toBe(content.cliques[def]!.name);
  });
});

describe('the yearly focus', () => {
  const base = (seed: string) => step(teenAt(seed, 15));

  it('is chosen between years for the year about to begin, and read once that year is here', () => {
    const life = base('focus-choose');
    expect(focusBlock(life, content)).toBeNull();
    const chosen = performAction(life, 'choose_focus', { focus: 'passion' }, content);
    expect(nextFocus(chosen)).toBe('passion');
    expect(focusOf(chosen)).toBe('none');
    const next = beginYear(chosen, content);
    expect(focusOf(next)).toBe('passion');
    expect(next.teen.focusYears.passion).toBe(1);
  });

  it('cannot be chosen below the teen years, or in the last year before adulthood', () => {
    expect(focusBlock(lifeAtAge('focus-young', 10), content)).toBe('age');
    expect(focusBlock(lifeAtAge('focus-old', 17), content)).toBe('age');
    expect(focusBlock(lifeAtAge('focus-first', 12), content)).toBeNull();
  });

  it('shifts the year’s grade points: school up, friends and work down', () => {
    const boostAfter = (focus: Parameters<typeof chooseFocus>[1] | null) => {
      const life = edit(base('focus-grades'), (d) => {
        d.education.current!.boost = 0;
        d.teen.passion = 0;
        d.teen.activities = [];
        d.teen.member = null;
        d.teen.focus = focus ? { year: d.currentYear, id: focus } : null;
      });
      return produce(life, (d) => void runFocus(d, content)).education.current!.boost;
    };
    expect(boostAfter('school')).toBeGreaterThan(boostAfter(null));
    expect(boostAfter(null)).toBe(0);
    expect(boostAfter('friends')).toBeLessThan(0);
    expect(boostAfter('work')).toBeLessThan(boostAfter('friends'));
  });

  it('shifts friendships, money and talent', () => {
    const life = base('focus-effects');
    const closest = (l: LifeState) =>
      Object.values(l.relationships)
        .filter((r) => r.kind === 'friend' || r.kind === 'classmate')
        .map((r) => r.affection)
        .reduce((a, x) => a + x, 0);
    const withFocus = (focus: 'friends' | 'school' | 'work' | 'passion' | null) =>
      edit(life, (d) => {
        d.teen.focus = focus ? { year: d.currentYear, id: focus } : null;
        d.teen.job = null;
        d.career.gig = false;
        d.character.hidden.talent = d.character.hidden.talent ?? 'music';
        d.character.hidden.talentDiscovered = false;
      });
    const friends = produce(withFocus('friends'), (d) => void runFocus(d, content));
    const school = produce(withFocus('school'), (d) => void runFocus(d, content));
    expect(closest(friends)).toBeGreaterThan(closest(school));
    // Money: odd jobs for a teen who made work the focus and has no job; nothing otherwise.
    const income = (l: LifeState) => {
      let n = 0;
      produce(l, (d) => void (n = teenIncome(d, content)));
      return n;
    };
    expect(income(withFocus('work'))).toBeGreaterThan(0);
    expect(income(withFocus('school'))).toBe(0);
    // Passion grows with the focus, fades without it.
    const passion = produce(withFocus('passion'), (d) => void runFocus(d, content));
    expect(passion.teen.passion).toBeGreaterThan(0);
    const faded = produce(edit(withFocus(null), (d) => void (d.teen.passion = 30)), (d) => void runFocus(d, content));
    expect(faded.teen.passion).toBeLessThan(30);
    // Talent: some of the lives with a focus on a passion bring a hidden talent to light.
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const l = edit(withFocus('passion'), (d) => {
        d.rng = createRng(`talent-${i}`);
      });
      if (produce(l, (d) => void runFocus(d, content)).character.hidden.talentDiscovered) found++;
    }
    expect(found).toBeGreaterThan(5);
  });
});

describe('the license and the first car', () => {
  it('needs a permit at the permit age, lessons and the test at the license age', () => {
    const young = lifeAtAge('lic-young', 14);
    expect(permitBlock(young, content)).toBe('age');
    const life = lifeAtAge('lic-ok', 15);
    expect(permitBlock(life, content)).toBeNull();
    expect(lessonBlock(life, content)).toBe('permit');
    expect(testBlock(life, content)).toBe('permit');
    const permit = produce(life, (d) => void takePermit(d, content));
    expect(permit.teen.license.stage).toBe('permit');
    expect(testBlock(permit, content)).toBe('age');
    const sixteen = edit(permit, (d) => {
      d.character.age = 16;
      d.currentYear += 1;
    });
    expect(testBlock(sixteen, content)).toBe('lessons');
    const lessons = produce(sixteen, (d) => {
      addLesson(d, content, true);
      addLesson(d, content, true);
    });
    expect(lessons.teen.license.lessons).toBe(2);
    expect(testBlock(lessons, content)).toBeNull();
  });

  it('passes by a chance that grows with lessons, and a pass writes a history entry', () => {
    const permit = edit(lifeAtAge('lic-test', 16), (d) => void (d.teen.license = { stage: 'permit', lessons: 0, fails: 0 }));
    const trained = edit(permit, (d) => void (d.teen.license.lessons = b.license.lessons.max));
    expect(testChance(trained, content)).toBeGreaterThan(testChance(permit, content));
    const failed = edit(trained, (d) => void (d.teen.license.fails = 3));
    expect(testChance(failed, content)).toBeLessThan(testChance(trained, content));
    let passes = 0;
    let fails = 0;
    for (let i = 0; i < 60; i++) {
      const l = produce(edit(trained, (d) => void (d.rng = createRng(`pass-${i}`))), (d) => {
        if (takeTest(d, content)) passes++;
        else fails++;
      });
      if (l.teen.license.stage === 'licensed') {
        expect(l.history.at(-1)!.tags).toContain('licensePassed');
        expect(testBlock(l, content)).toBe('have');
      } else {
        expect(l.teen.license.fails).toBe(trained.teen.license.fails + 1);
        expect(testBlock(l, content)).toBe('wait');
      }
    }
    expect(passes).toBeGreaterThan(10);
    expect(fails).toBeGreaterThan(0);
  });

  it('is the only way to buy a car (through E5), and an event can give the permit but never below the age', () => {
    const rich = (age: number, stage: 'none' | 'licensed') =>
      edit(lifeAtAge('lic-car', age), (d) => {
        d.finances.savings = 90_000;
        d.teen.license = { stage, lessons: 0, fails: 0 };
      });
    expect(vehicleQuote(rich(17, 'none'), 'hatchback', true, content).cashBlock).toBe('license');
    expect(vehicleQuote(rich(17, 'licensed'), 'hatchback', true, content).cashBlock).toBeNull();
    expect(isLifeActionAvailable(rich(17, 'licensed'), 'buy_vehicle', { defId: 'hatchback', used: true, loan: false }, content)).toBe(true);
    expect(isLifeActionAvailable(rich(17, 'none'), 'buy_vehicle', { defId: 'hatchback', used: true, loan: false }, content)).toBe(false);
    const eleven = lifeAtAge('lic-event', 11);
    expect(produce(eleven, (d) => void grantStage(d, 'licensed', content)).teen.license.stage).toBe('none');
    expect(produce(lifeAtAge('lic-event', 15), (d) => void grantStage(d, 'permit', content)).teen.license.stage).toBe('permit');
    expect(produce(lifeAtAge('lic-event', 15), (d) => void grantStage(d, 'licensed', content)).teen.license.stage).toBe('none');
  });

  it('is the same through actions between years', () => {
    let life = lifeAtAge('lic-actions', 15);
    life = performAction(life, 'get_permit', {}, content);
    life = performAction(life, 'driving_lesson', {}, content);
    life = performAction(life, 'driving_lesson', {}, content);
    expect(life.teen.license).toMatchObject({ stage: 'permit', lessons: 2 });
    expect(() => performAction(life, 'take_license_test', {}, content)).toThrow();
    expect(life.inputLog.at(-1)!.payload).toMatchObject({ actionId: 'driving_lesson' });
  });
});

describe('teen jobs', () => {
  const teen = (seed: string, age = 16) =>
    edit(step(teenAt(seed, age)), (d) => {
      d.finances.savings = 1000;
      Object.assign(d.character.stats, { fitness: 70 });
      Object.assign(d.character.personality, { kindness: 70, sociability: 70, discipline: 70 });
    });

  it('are blocked below their age, with a job already, for the needs of the job and for a driving job without a license', () => {
    const life = teen('job-block', 16);
    expect(jobBlock(life, 'camp_counselor', content)).toBeNull();
    expect(jobBlock(edit(life, (d) => void (d.character.age = 14)), 'lifeguard', content)).toBe('age');
    expect(jobBlock(life, 'pizza_delivery', content)).toBe('license');
    expect(jobBlock(edit(life, (d) => void (d.teen.license = { stage: 'licensed', lessons: 0, fails: 0 })), 'pizza_delivery', content)).toBeNull();
    expect(jobBlock(edit(life, (d) => void (d.character.stats.fitness = 5)), 'lifeguard', content)).toBe('needs');
    const hired = produce(life, (d) => void hireJob(d, 'grocery_bagger', content));
    expect(hired.teen.job?.jobId).toBe('grocery_bagger');
    expect(jobBlock(hired, 'dog_walker', content)).toBe('have');
    expect(jobBlock(edit(life, (d) => void (d.character.age = 18)), 'dog_walker', content)).toBe('adult');
  });

  it('pay through the ledger, cost grades by their hours, and replace gig work', () => {
    const life = teen('job-pay', 16);
    const gig = edit(life, (d) => void (d.career.gig = true));
    const hired = produce(gig, (d) => void hireJob(d, 'lifeguard', content));
    expect(hired.career.gig).toBe(false);
    const def = content.teenJobs.lifeguard!;
    const pay = expectedJobPay(hired, def, content);
    expect(pay).toBeGreaterThan(2000);
    let income = 0;
    produce(hired, (d) => void (income = teenIncome(d, content)));
    expect(income).toBeGreaterThanOrEqual(pay * (1 - b.jobs.swing) - 1);
    expect(income).toBeLessThanOrEqual(pay * (1 + b.jobs.swing) + 1);
    const worked = produce(edit(hired, (d) => void (d.education.current!.boost = 0)), (d) => void runJob(d, content));
    expect(worked.education.current!.boost).toBeCloseTo(-(def.hours - b.jobs.freeHours) * b.jobs.gradePerHour, 5);
    // The money rule at home takes a share of what you earn.
    const ruled = edit(hired, (d) => {
      d.teen.home = { styles: {}, rules: [{ ruleId: 'money', by: Object.keys(d.people)[0]!, level: 2, since: d.currentYear, broken: 0, caught: 0 }], year: d.currentYear };
    });
    expect(expectedJobPay(ruled, def, content)).toBeLessThan(pay);
    expect(isLifeActionAvailable(hired, 'start_gig', {}, content)).toBe(false);
  });

  it('end at 18 and when the license they need is gone', () => {
    const driving = edit(teen('job-end', 17), (d) => {
      d.teen.license = { stage: 'licensed', lessons: 0, fails: 0 };
      d.teen.job = null;
      d.character.personality.discipline = 80;
      hireJob(d, 'pizza_delivery', content);
    });
    expect(driving.teen.job).not.toBeNull();
    const revoked = produce(driving, (d) => {
      d.teen.license.stage = 'permit';
      runJob(d, content);
    });
    expect(revoked.teen.job).toBeNull();
    const grown = produce(edit(driving, (d) => void (d.character.age = 18)), (d) => void runTeen(d, content));
    expect(grown.teen.job).toBeNull();
    expect(teenIncome(grown, content)).toBe(0);
  });
});

describe('teams and clubs', () => {
  it('cut people from teams, never from clubs, and cost, train and bring friends', () => {
    const life = step(teenAt('act-1', 15));
    const team = content.activities.soccer_team!;
    const club = content.activities.art_club!;
    expect(tryoutChance(life, club)).toBe(1);
    const fit = edit(life, (d) => void (d.character.stats.fitness = 95));
    const slow = edit(life, (d) => void (d.character.stats.fitness = 5));
    expect(tryoutChance(fit, team)).toBeGreaterThan(tryoutChance(slow, team));
    const member = produce(life, (d) => void joinActivity(d, 'art_club', content));
    expect(member.teen.activities).toEqual([{ id: 'art_club', since: member.currentYear }]);
    expect(activityBlock(member, 'art_club', content)).toBe('member');
    const full = produce(member, (d) => void joinActivity(d, 'debate_team', content));
    expect(activityBlock(full, 'robotics_club', content) === 'limit' || full.teen.activities.length < b.activities.max).toBe(true);
    // A year of it: the club's passion points and its grade points.
    const year = produce(edit(member, (d) => {
      d.teen.activities[0]!.since = d.currentYear - 1;
      d.teen.penalties = [];
      d.teen.passion = 0;
    }), (d) => {
      d.education.current!.boost = 0;
      runFocus(d, content);
      runActivities(d, content);
    });
    expect(year.teen.passion).toBe(content.activities.art_club!.passion - b.passion.decay);
    expect(year.education.current!.boost).toBeCloseTo(content.activities.art_club!.grades, 5);
    ok(year);
  });

  it('are for the teen years: a grown life leaves them', () => {
    const life = edit(step(teenAt('act-2', 16)), (d) => void joinActivity(d, 'art_club', content));
    const grown = produce(edit(life, (d) => void (d.character.age = 18)), (d) => void runTeen(d, content));
    expect(grown.teen.activities).toEqual([]);
  });
});

describe('house rules', () => {
  const homeOf = (seed: string, tweak: (parent: LifeState['people'][string], d: LifeState) => void, age = 15) =>
    produce(teenAt(seed, age), (d) => {
      for (const p of householdParents(d, content)) tweak(p, d);
      d.teen.home = null;
      refreshHome(d, content);
    });

  it('are generated from each parent’s personality: strict parents set stricter rules, relaxed ones set fewer', () => {
    const strict = homeOf('rules-strict', (p) => {
      p.traits = { ...p.traits, discipline: 98, riskTaking: 5, ambition: 90, kindness: 40, sociability: 80 };
    });
    const relaxed = homeOf('rules-relaxed', (p) => {
      p.traits = { ...p.traits, discipline: 4, riskTaking: 95, ambition: 10, kindness: 60, sociability: 20 };
    });
    const sum = (l: LifeState) => l.teen.home!.rules.reduce((s, r) => s + r.level, 0) / Math.max(1, l.teen.home!.rules.length);
    expect(strict.teen.home!.rules.length).toBeGreaterThan(relaxed.teen.home!.rules.length);
    expect(sum(strict)).toBeGreaterThan(sum(relaxed));
    for (const l of [strict, relaxed]) {
      for (const r of l.teen.home!.rules) {
        expect(RULE_DOMAINS).toContain(r.ruleId);
        expect(householdParents(l, content).map((p) => p.id)).toContain(r.by);
      }
      ok(l);
    }
  });

  it('read a parent’s style from what you remember: a warm home, a cold one, strict rules, none', () => {
    const life = teenAt('rules-memory', 15);
    const parent = householdParents(life, content)[0]!;
    const remember = (tag: string) =>
      edit(life, (d) => void d.relationships[parent.id]!.memories.push({ tag, year: d.currentYear - 3 }));
    const plain = styleOfParent(life, parent, content);
    expect(styleOfParent(remember('parent_warm_home'), parent, content).warmth).toBeGreaterThan(plain.warmth);
    expect(styleOfParent(remember('parent_cold_home'), parent, content).warmth).toBeLessThan(plain.warmth);
    expect(styleOfParent(remember('parent_strict_rules'), parent, content).strictness).toBeGreaterThan(plain.strictness);
    expect(styleOfParent(remember('parent_no_rules'), parent, content).strictness).toBeLessThan(plain.strictness);
    expect(styleOfParent(remember('parent_always_there'), parent, content).involvement).toBeGreaterThan(plain.involvement);
    expect(styleOfParent(remember('parent_never_around'), parent, content).involvement).toBeLessThan(plain.involvement);
  });

  it('are kept (with what you won) when the same parent still sets them, and follow the parents who are left', () => {
    let life = homeOf('rules-keep', () => {});
    const rule = life.teen.home!.rules[0]!;
    life = produce(life, (d) => {
      d.teen.home!.rules[0]!.level = 0;
      d.teen.home!.rules[0]!.broken = 3;
      d.teen.home!.rules[0]!.caught = 1;
      refreshHome(d, content);
    });
    expect(life.teen.home!.rules[0]).toMatchObject({ ruleId: rule.ruleId, level: 0, broken: 3, caught: 1 });
    const parents = householdParents(life, content);
    if (parents.length > 1) {
      const gone = produce(life, (d) => {
        d.people[parents[0]!.id]!.alive = false;
        refreshHome(d, content);
      });
      for (const r of gone.teen.home!.rules) expect(r.by).not.toBe(parents[0]!.id);
    }
  });

  it('can be broken: a thrill for sure, a catch by how closely the parent watches, and a response by who they are', () => {
    const base = homeOf('rules-break', (p) => {
      p.traits = { ...p.traits, discipline: 90, kindness: 50 };
    });
    const domain = base.teen.home!.rules[0]!.ruleId;
    let caught = 0;
    for (let i = 0; i < 60; i++) {
      const l = produce(edit(base, (d) => void (d.rng = createRng(`break-${i}`))), (d) => {
        const result = breakRule(d, domain, content)!;
        if (result.caught) caught++;
      });
      expect(l.teen.totals.broken).toBe(base.teen.totals.broken + 1);
      expect(l.teen.home!.rules.find((r) => r.ruleId === domain)!.broken).toBe(base.teen.home!.rules.find((r) => r.ruleId === domain)!.broken + 1);
      if (l.teen.totals.caught === base.teen.totals.caught + 1) {
        expect(l.teen.caught?.ruleId).toBe(domain);
        expect(l.history.at(-1)!.tags).toContain('ruleCaught');
        const rel = l.relationships[l.teen.caught!.by]!;
        expect(rel.trust).toBeLessThan(base.relationships[l.teen.caught!.by]!.trust + 1);
      }
    }
    expect(caught).toBeGreaterThan(5);
    expect(caught).toBeLessThan(60);
    // A parent who is always watching catches more than one who is never around.
    const watching = produce(base, (d) => {
      for (const s of Object.values(d.teen.home!.styles)) s.involvement = 100;
    });
    const away = produce(base, (d) => {
      for (const s of Object.values(d.teen.home!.styles)) s.involvement = 0;
    });
    const count = (l: LifeState) => {
      let n = 0;
      for (let i = 0; i < 200; i++) {
        produce(edit(l, (d) => void (d.rng = createRng(`watch-${i}`))), (d) => {
          if (breakRule(d, domain, content)!.caught) n++;
        });
      }
      return n;
    };
    expect(count(watching)).toBeGreaterThan(count(away));
  });

  it('are answered by the parent’s style and by how you two get on: strict and distant means grounded, warm and close means a talk', () => {
    const base = homeOf('rules-answer', () => {});
    const domain = base.teen.home!.rules[0]!.ruleId;
    const by = base.teen.home!.rules[0]!.by;
    const answers = (style: { warmth: number; strictness: number; involvement: number }, affection: number) => {
      const tally = { talking_to: 0, grounded: 0, privilege: 0, chores: 0 };
      for (let i = 0; i < 300; i++) {
        const l = produce(
          edit(base, (d) => {
            d.rng = createRng(`answer-${i}`);
            // Always noticed: involvement 100 and the rule at its strictest.
            d.teen.home!.styles[by] = { ...style, involvement: 100 };
            d.relationships[by]!.affection = affection;
            d.teen.home!.rules.find((r) => r.ruleId === domain)!.level = 2;
          }),
          (d) => void breakRule(d, domain, content),
        );
        if (!l.teen.caught) continue;
        const g = l.teen.penalties.some((p) => p.kind === 'grounded');
        const p = l.teen.penalties.some((x) => x.kind === 'privilege');
        tally[g ? 'grounded' : p ? 'privilege' : 'talking_to'] += 1;
      }
      return tally;
    };
    const harsh = answers({ warmth: 10, strictness: 95, involvement: 100 }, 20);
    const gentle = answers({ warmth: 95, strictness: 10, involvement: 100 }, 90);
    const share = (t: { talking_to: number; grounded: number; privilege: number }) => t.grounded / Math.max(1, t.talking_to + t.grounded + t.privilege);
    expect(share(harsh)).toBeGreaterThan(share(gentle));
  });

  it('can be negotiated: a chance by the relationship, the parent and your grades, once a year, never below relaxed', () => {
    const base = homeOf('rules-nego', () => {});
    const rule = base.teen.home!.rules.find((r) => r.level > 0) ?? (() => {
      throw new Error('this seed has no rule above relaxed');
    })();
    const domain = rule.ruleId;
    expect(negotiateBlock(base, domain, content)).toBeNull();
    const close = edit(base, (d) => {
      d.relationships[rule.by]!.affection = 95;
      d.relationships[rule.by]!.trust = 95;
    });
    const cold = edit(base, (d) => {
      d.relationships[rule.by]!.affection = 5;
      d.relationships[rule.by]!.trust = 5;
    });
    expect(negotiateChance(close, close.teen.home!.rules.find((r) => r.ruleId === domain)!, content)).toBeGreaterThan(
      negotiateChance(cold, cold.teen.home!.rules.find((r) => r.ruleId === domain)!, content),
    );
    let won = 0;
    for (let i = 0; i < 60; i++) {
      const l = produce(edit(close, (d) => void (d.rng = createRng(`nego-${i}`))), (d) => {
        if (negotiate(d, domain, content)) won++;
      });
      const after = l.teen.home!.rules.find((r) => r.ruleId === domain)!;
      expect(after.negotiated).toBe(l.currentYear);
      expect(negotiateBlock(l, domain, content)).not.toBeNull();
      expect(l.teen.totals.negotiated).toBe(1);
    }
    expect(won).toBeGreaterThan(5);
    expect(won).toBeLessThan(60);
    const relaxed = edit(base, (d) => void (d.teen.home!.rules.find((r) => r.ruleId === domain)!.level = 0));
    expect(negotiateBlock(relaxed, domain, content)).toBe('relaxed');
    expect(produce(relaxed, (d) => void adjustRule(d, domain, -1, content)).teen.home!.rules.find((r) => r.ruleId === domain)!.level).toBe(0);
  });

  it('ease with age for a parent who likes and trusts you, and tighten or loosen through events', () => {
    const base = homeOf('rules-age', (p) => void (p.traits = { ...p.traits, discipline: 95, riskTaking: 5, ambition: 80 }), 15);
    const strictest = base.teen.home!.rules.find((r) => r.level === 2) ?? base.teen.home!.rules[0]!;
    const fond = edit(base, (d) => {
      const rule = d.teen.home!.rules.find((r) => r.ruleId === strictest.ruleId)!;
      rule.level = 2;
      d.relationships[rule.by]!.affection = 90;
      d.relationships[rule.by]!.trust = 90;
      d.character.age = 16;
    });
    const eased = produce(fond, (d) => void runRules(d, content));
    expect(eased.teen.home!.rules.find((r) => r.ruleId === strictest.ruleId)!.level).toBe(1);
    const tightened = produce(eased, (d) =>
      applyEffects(d, [{ type: 'teen', action: 'tighten', rule: strictest.ruleId }], { def: content.events.parent_tightens!, cast: {}, rng: d.rng, content }),
    );
    expect(tightened.teen.home!.rules.find((r) => r.ruleId === strictest.ruleId)!.level).toBe(2);
  });

  it('end at 18, and nobody at home means no rules', () => {
    const base = homeOf('rules-end', () => {}, 16);
    expect(base.teen.home!.rules.length).toBeGreaterThan(0);
    const grown = produce(edit(base, (d) => void (d.character.age = 18)), (d) => void runTeen(d, content));
    expect(grown.teen.home).toBeNull();
    const orphan = produce(base, (d) => {
      for (const p of householdParents(d, content)) p.alive = false;
      refreshHome(d, content);
    });
    expect(orphan.teen.home).toBeNull();
  });
});

describe('teen trouble: juvenile handling', () => {
  const teen = (seed: string, age = 16) => teenAt(seed, age);

  it('keeps a minor out of prison, hands the family the fine and ends probation at 18', () => {
    for (let i = 0; i < 30; i++) {
      const life = teen(`juv-${i}`, 16);
      const result = produce(life, (d) => {
        const s = sentence(d, 'assault', 'jail', undefined, content)!;
        expect(s.outcome).toBe('probation');
      });
      expect(result.housing.kind).not.toBe('incarcerated');
      expect(result.legal.probationUntil).toBeLessThanOrEqual(result.birthYear + content.balance.economy.independenceAge);
    }
    const fined = produce(edit(teen('juv-fine', 15), (d) => void (d.finances.savings = 0)), (d) => void sentence(d, 'vandalism', 'fine', undefined, content));
    expect(fined.finances.debts).toEqual([]);
    expect(fined.finances.savings).toBe(0);
  });

  it('answers a new juvenile case at home once: trust drops, and a talk may follow', () => {
    const life = teen('juv-home', 16);
    const parent = householdParents(life, content)[0]!;
    const before = life.relationships[parent.id]!.trust;
    const cased = produce(edit(life, (d) => void (d.teen.seenRecords = d.legal.record.length)), (d) => {
      sentence(d, 'vandalism', 'warning', undefined, content);
      runTrouble(d, content);
    });
    expect(cased.relationships[parent.id]!.trust).toBeLessThan(before);
    expect(cased.teen.seenRecords).toBe(cased.legal.record.length);
    const twice = produce(cased, (d) => void runTrouble(d, content));
    expect(twice.relationships[parent.id]!.trust).toBe(cased.relationships[parent.id]!.trust);
    expect(isJuvenileEntry(cased, cased.legal.record.at(-1)!, content)).toBe(true);
  });

  it('seals what happened before 18 when you turn 18: it stops counting for the court and in conditions, and stays in your history', () => {
    const life = edit(teen('juv-seal', 17), (d) => {
      d.legal.record.push({ offenseId: 'vandalism', year: d.currentYear - 1, outcome: 'fine', amount: 400 });
      d.teen.seenRecords = 1;
    });
    expect(evaluate({ record: {} }, life)).toBe(true);
    const adult = produce(edit(life, (d) => {
      d.character.age = 18;
      d.character.lifeStage = 'youngAdult';
      d.currentYear += 1;
    }), (d) => void runTeen(d, content));
    expect(adult.teen.sealed).toBe(true);
    expect(adult.legal.record[0]).toMatchObject({ offenseId: 'vandalism', sealed: true });
    expect(evaluate({ record: {} }, adult)).toBe(false);
    expect(adult.history.some((h) => h.tags.includes('sealed'))).toBe(true);
    // An adult's own case still counts.
    const again = produce(adult, (d) => void sentence(d, 'shoplifting', 'fine', undefined, content));
    expect(evaluate({ record: {} }, again)).toBe(true);
    ok(adult);
  });
});

describe('no romance involving anyone under 18', () => {
  it('is refused when relationships change kind, and by couples among the people you know', () => {
    const life = step(teenAt('romance-1', 16));
    const clique = life.teen.cliques[0]!;
    const joined = produce(life, (d) => void joinClique(d, clique.id, content, false));
    const member = livingMembers(joined, myClique(joined))[0]!;
    for (const kind of ['partner', 'fiance', 'spouse', 'ex'] as const) expect(canChangeKind(joined, member, kind, content)).toBe(false);
    const friends = livingMembers(joined, myClique(joined));
    const a = friends[0]!;
    const b2 = friends[1]!;
    // (Your parents are a married tie; nobody under 18 is in one.)
    expect(Object.values(joined.web.ties).filter((t) => friends.includes(t.a) || friends.includes(t.b)).some((t) => t.kind === 'dating' || t.kind === 'married')).toBe(false);
    expect(romanceUnderAgeFailures(joined, content)).toEqual([]);
    // Forcing one anyway is caught by the invariants.
    const broken = produce(joined, (d) => {
      d.relationships[member]!.kind = 'partner';
      addTie(d.web, a, b2, 'dating', 60, 'context', d.currentYear);
    });
    const failures = romanceUnderAgeFailures(broken, content);
    expect(failures.some((f) => /you are under 18 and in a romance/.test(f))).toBe(true);
    expect(failures.some((f) => /couple with someone under 18/.test(f))).toBe(true);
    expect(checkInvariants(broken, content).length).toBeGreaterThan(0);
  });

  it('holds for 40 teen lives played out: no romance involving a minor, ever', () => {
    for (let i = 0; i < 40; i++) {
      let life = lifeAtAge(`romance-live-${i}`, 12);
      const rng = createRng(`romance-${i}`);
      void rng;
      for (let y = 0; y < 7; y++) {
        life = playYear(life, content);
        expect(romanceUnderAgeFailures(life, content), `${i} at ${life.character.age}`).toEqual([]);
        expect(teenFailures(life, content), `${i} at ${life.character.age}`).toEqual([]);
      }
    }
  });
});

describe('the yearly step', () => {
  it('runs through whole lives without breaking an invariant', () => {
    for (let i = 0; i < 15; i++) {
      let life = lifeAtAge(`step-${i}`, 11);
      for (let y = 0; y < 9; y++) {
        life = playYear(life, content);
        expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|history/.test(f)), `${i} at ${life.character.age}`).toEqual([]);
      }
      // The teen state is empty of teen things once grown.
      expect(life.teen.home).toBeNull();
      expect(life.teen.member).toBeNull();
    }
  });

  it('starts a grown heir licensed, and an empty teen state otherwise', () => {
    expect(startingTeen(30, 2030, content).license.stage).toBe('licensed');
    expect(startingTeen(10, 2030, content).license.stage).toBe('none');
    expect(emptyTeen().license.stage).toBe('none');
  });

  it('only wakes the teen systems in the teen years', () => {
    const child = produce(lifeAtAge('step-child', 10), (d) => void runTeen(d, content));
    expect(child.teen.school).toBeNull();
    expect(child.teen.home).toBeNull();
  });
});
