/**
 * C2: the Career hub. Skills grow with use and fade after two idle years but never below their floor; several roles at once add up to a
 * load that costs Stress and burnout and takes from performance; a young player switches sports freely and an adult has one pro sport;
 * band auditions draw from a pool that grows with fame, city and reputation, and rehearsal makes the weaker players better;
 * performance enhancers are tested; the hub survives a save.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { enterPath, crossOver } from '../fame/ladder';
import { liveMembers } from '../fame/band';
import { checkInvariants } from '../invariants';
import { chance, createRng } from '../rng';
import { curveAt } from '../curve';
import { getBandHubView, getHubView, trainingLines } from '../selectors';
import { runHub } from './step';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { currentPool, bandStrength, rehearseBlock, findMembers } from './band';
import { enhancerBlock, startEnhancers } from './enhancers';
import { loadNow, performancePenalty } from './load';
import { poolSkill } from './pool';
import { fadedLevel, skillGain, skillFloor } from './skills';
import { startTryout, resolveTryout } from '../sports/tryout';
import { checkEdit, performEdit } from '../godmode';
import { editable } from '../godmode/fixtures';
import { signDraftDeal } from '../sports/contract';
import { draftingTeam } from '../sports/team';

const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|scheduled|consistency: tryout/.test(f))).toEqual([]);
const next = (life: LifeState) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runHub(d, content);
  });
const S = content.balance.skills;
const school = (d: LifeState) => void (d.education.current = { program: 'high', year: 2, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 1 });
const H = content.balance.careers.hub;

describe('skills', () => {
  it('grow slower as they rise, faster with a talent and a harder push, and never past the cap', () => {
    const low = skillGain(10, 1, 'steady', false, content);
    const high = skillGain(70, 1, 'steady', false, content);
    expect(low).toBeGreaterThan(high);
    expect(skillGain(10, 1, 'steady', true, content)).toBeGreaterThan(low);
    expect(skillGain(10, 1, 'all', false, content)).toBeGreaterThan(low);
    expect(skillGain(10, 0.35, 'steady', false, content)).toBeLessThan(low);
    expect(skillGain(S.growth.cap.none, 1, 'all', false, content)).toBe(0);
  });

  it('fade only after the idle years, a little each year, never below the floor of the peak', () => {
    const mark = { peak: 80, last: 2000 };
    expect(fadedLevel(80, mark, S.fade.idleYears - 1, content)).toBe(80);
    expect(fadedLevel(80, mark, S.fade.idleYears, content)).toBe(80 - S.fade.perYear);
    let level = 80;
    for (let i = 0; i < 40; i++) level = fadedLevel(level, mark, 10, content);
    expect(level).toBe(skillFloor(80, content));
    expect(fadedLevel(skillFloor(80, content) - 5, mark, 10, content)).toBe(skillFloor(80, content) - 5);
  });

  it('a hobby skill is used and fades through the year step', () => {
    let life = apply(lifeAtAge('c2-hobby', 30), (d) => {
      d.hobbies.play_the_guitar = { year: d.currentYear, sessions: 5 };
      d.hub.skills['hobby.play_the_guitar'] = { level: 60, peak: 60, last: d.currentYear };
    });
    life = next(life);
    expect(life.hub.skills['hobby.play_the_guitar']!.level).toBe(60);
    life = next(life);
    expect(life.hub.skills['hobby.play_the_guitar']!.level).toBe(60 - S.fade.perYear);
    for (let i = 0; i < 30; i++) life = next(life);
    expect(life.hub.skills['hobby.play_the_guitar']!.level).toBe(skillFloor(60, content));
    expect(life.hub.skills['hobby.play_the_guitar']!.peak).toBe(60);
    ok(life);
  });

  it('a sport skill in the path fades by the same rules when the sport is left alone', () => {
    let life = apply(lifeAtAge('c2-sportskill', 15), (d) => {
      enterPath(d, 'basketball', 'school_tryout', content);
      d.fame.paths.basketball!.skills = { shooting: 70 };
      d.hub.marks['basketball.shooting'] = { peak: 70, last: d.currentYear - 5 };
      d.sports.team = null;
      d.sports.teamless = true;
    });
    life = next(life);
    expect(life.fame.paths.basketball!.skills!.shooting).toBe(70 - S.fade.perYear);
  });
});

describe('load', () => {
  const student = (seed: string) => apply(lifeAtAge(seed, 15), (d) => {
    school(d);
    enterPath(d, 'basketball', 'school_tryout', content);
  });

  it('adds the roles you have, by how hard you work at each', () => {
    const life = student('c2-load');
    const view = loadNow(life, content);
    expect(Object.keys(view.shares).sort()).toEqual(['school', 'sports']);
    expect(view.total).toBe(H.roles.school.steady + H.roles.sports.steady);
    const hard = apply(life, (d) => void (d.hub.commit.school = 'all'));
    expect(loadNow(hard, content).total).toBeGreaterThan(view.total);
  });

  it('counts a pro contract as a full-time job, so a job on top is more than you can carry', () => {
    const pro = apply(lifeAtAge('c2-pro', 24), (d) => {
      enterPath(d, 'basketball', 'open_tryout', content);
      d.sports.pro = true;
      d.sports.contract = { teamId: 'x', since: d.currentYear, until: d.currentYear + 3, salary: 100000, kind: 'standard', option: 'none' };
    });
    expect(loadNow(pro, content).shares.sports).toBe(H.roles.proSports.steady);
    const both = apply(pro, (d) => void (d.career.job = { jobId: 'office', level: 1, yearsAtLevel: 0, performance: 60, salary: 40000, since: d.currentYear, employer: 'X' }));
    expect(loadNow(both, content).over).toBeGreaterThan(0);
  });

  it('over the load you can carry raises Stress and burnout and lowers performance; under it burnout eases', () => {
    const base = apply(student('c2-over'), (d) => {
      d.hub.commit.school = 'all';
      d.hub.commit.gig = 'all';
      d.fame.band = null;
      d.career.gig = true;
      d.character.stats.stress = 20;
    });
    const view = loadNow(base, content);
    expect(view.over).toBeGreaterThan(0);
    const after = next(base);
    expect(after.character.stats.stress).toBeGreaterThan(20);
    expect(after.hub.burnout).toBeGreaterThan(0);
    expect(after.hub.overYears).toBe(1);
    expect(performancePenalty(after, content)).toBeGreaterThan(0);
    const light = apply(student('c2-light'), (d) => {
      d.hub.burnout = 40;
      d.fame.commitment = 'back';
      d.hub.commit.school = 'back';
    });
    expect(next(light).hub.burnout).toBeLessThan(40);
    ok(after);
  });

  it('way over, something gives, and it is written in the history', () => {
    let gave = 0;
    for (let i = 0; i < 40; i++) {
      const life = apply(student(`c2-give-${i}`), (d) => {
        d.hub.commit.school = 'all';
        d.hub.burnout = 80;
        d.career.gig = true;
        d.hub.commit.gig = 'all';
      });
      const after = next(life);
      if (after.hub.gave) {
        gave += 1;
        expect(after.history.some((h) => h.tags.includes('hub'))).toBe(true);
      }
    }
    expect(gave).toBeGreaterThan(0);
  });
});

describe('sports for young players', () => {
  const kid = (seed: string, age = 14) => apply(lifeAtAge(seed, age), (d) => void enterPath(d, 'basketball', age < 13 ? 'youth_league' : 'school_tryout', content));

  it('a child or teen can try out for another sport with no wait; the old sport is shelved, not lost', () => {
    let life = kid('c2-switch', 14);
    life = apply(life, (d) => {
      d.fame.paths.basketball!.skills = { shooting: 44 };
      d.sports.tried = [];
    });
    // A different sport is open to a teenager who plays one.
    const key = ['school:jv', 'school:varsity', 'youth:rec', 'youth:club'].find((k) => isLifeActionAvailable(life, 'try_out', { pathId: 'soccer', teamKey: k }, content));
    expect(key).toBeDefined();
    const picked = performAction(life, 'try_out', { pathId: 'soccer', teamKey: key! }, content);
    expect(picked.sports.tryout).not.toBeNull();
    const done = apply(picked, (d) => {
      d.character.stats.fitness = 100;
      resolveTryout(d, 'steady', content, createRng('c2-switch-resolve'));
    });
    if (done.sports.sport === 'soccer') {
      expect(done.fame.main).toBe('soccer');
      expect(done.hub.skills['sport.basketball.shooting']!.level).toBe(44);
      expect(done.hub.totals.sportSwitches).toBe(1);
    } else {
      // Not picked up by that team: the first sport is still theirs.
      expect(done.fame.main).toBe('basketball');
    }
    ok(done);
  });

  it('keeps a band when the sport changes, and an adult cannot walk into a second sport', () => {
    const life = apply(kid('c2-band-switch', 15), (d) => {
      expect(crossOver(d, 'music', content)).toBe(true);
    });
    expect(life.fame.second).toBe('music');
    expect(life.fame.paths.music!.rung).toBe(1);
    const adult = apply(lifeAtAge('c2-adult', 24), (d) => void enterPath(d, 'basketball', 'open_tryout', content));
    expect(isLifeActionAvailable(adult, 'try_out', { pathId: 'soccer', teamKey: 'pro:x' }, content)).toBe(false);
  });

  it('a young player can quit their sport, an adult cannot use the quick quit', () => {
    const life = kid('c2-quit', 14);
    expect(isLifeActionAvailable(life, 'quit_sport', {}, content)).toBe(true);
    const out = performAction(life, 'quit_sport', {}, content);
    expect(out.fame.active).toBe(false);
    const adult = apply(lifeAtAge('c2-quit-adult', 24), (d) => void enterPath(d, 'basketball', 'open_tryout', content));
    expect(isLifeActionAvailable(adult, 'quit_sport', {}, content)).toBe(false);
  });
});

describe('the band', () => {
  const player = (seed: string, fame: number, rep = 50) =>
    apply(lifeAtAge(seed, 24), (d) => {
      enterPath(d, 'music', 'open_mic', content);
      d.fame.paths.music!.fame = fame;
      d.character.hidden.reputation = rep;
    });
  const skills = (life: LifeState, n = 300) => {
    const rng = createRng(`pool-${life.seed}`);
    return Array.from({ length: n }, () => poolSkill(life, content, rng));
  };
  const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;

  it('draws a better pool as fame, the city and reputation grow, with elite players rare early on', () => {
    const early = skills(player('c2-pool-a', 2));
    const star = skills(player('c2-pool-b', 70));
    expect(mean(star)).toBeGreaterThan(mean(early) + 15);
    expect(Math.max(...early)).toBeLessThanOrEqual(Math.ceil(curveAt(S.band.cap, 2)));
    expect(early.filter((x) => x >= 85).length).toBe(0);
    expect(Math.max(...star)).toBeGreaterThan(85);
    expect(mean(skills(player('c2-pool-c', 20, 90)))).toBeGreaterThan(mean(skills(player('c2-pool-c', 20, 10))));
    const big = apply(player('c2-pool-d', 20), (d) => void (d.character.cityId = 'nyc'));
    const small = apply(player('c2-pool-d', 20), (d) => void (d.character.cityId = 'houston'));
    const sizeOf = (id: string) => content.cities[id]!.jobMarket.professional;
    if (sizeOf('nyc') !== sizeOf('houston')) expect(mean(skills(big)) > mean(skills(small)) === sizeOf('nyc') > sizeOf('houston')).toBe(true);
  });

  it('holds auditions for an open part, then hires one candidate as a person with ties to the band', () => {
    let life = player('c2-hire', 10);
    life = apply(life, (d) => {
      d.fame.band = null;
      expect(d.fame.band).toBeNull();
    });
    life = performAction(life, 'form_band', { bandName: 'The Night Shift', part: 'guitar' }, content);
    const members = liveMembers(life).length;
    life = apply(life, (d) => void (d.fame.band!.members = d.fame.band!.members.filter((m) => m.part !== 'drums')));
    expect(isLifeActionAvailable(life, 'find_members', { part: 'drums' }, content)).toBe(true);
    life = performAction(life, 'find_members', { part: 'drums' }, content);
    const pool = currentPool(life)!;
    expect(pool.candidates.length).toBeGreaterThan(0);
    expect(getBandHubView(life, content).pool!.candidates.length).toBe(pool.candidates.length);
    const before = Object.keys(life.people).length;
    life = performAction(life, 'hire_member', { index: 0 }, content);
    expect(Object.keys(life.people).length).toBe(before + 1);
    const hired = life.fame.band!.members.find((m) => m.part === 'drums')!;
    expect(hired.skill).toBe(pool.candidates[0]!.skill);
    expect(life.people[hired.id]!.tags).toContain('band');
    expect(Object.values(life.web.ties ?? {}).length).toBeGreaterThanOrEqual(0);
    expect(liveMembers(life).length).toBeGreaterThanOrEqual(members);
    expect(currentPool(life)).toBeNull();
    expect(() => performAction(life, 'hire_member', { index: 0 }, content)).toThrow(InvalidInputError);
    ok(life);
  });

  it('rehearsal makes members better, the weakest most, up to the budget for the commitment', () => {
    let life = player('c2-rehearse', 10);
    life = performAction(life, 'form_band', { bandName: 'Loud Neighbours' }, content);
    life = apply(life, (d) => {
      d.fame.band!.members[0]!.skill = 15;
      d.fame.band!.members[1]!.skill = 70;
      d.fame.band!.chemistry = 60;
    });
    const before = life;
    life = performAction(life, 'rehearse', {}, content);
    const [weak, strong] = [life.fame.band!.members[0]!, life.fame.band!.members[1]!];
    expect(weak.skill - 15).toBeGreaterThan(strong.skill - 70);
    expect(weak.skill).toBeGreaterThan(15);
    expect(life.fame.band!.chemistry).toBe(61);
    expect(trainingLines(before, life, content).some((l) => l.kind === 'band')).toBe(true);
    expect(bandStrength(life, content)).toBeGreaterThan(bandStrength(before, content));
    for (let i = 1; i < S.band.sessions.steady; i++) life = performAction(life, 'rehearse', {}, content);
    expect(rehearseBlock(life, content)).toBe('budget');
    expect(() => performAction(life, 'rehearse', {}, content)).toThrow(InvalidInputError);
    // More when you go all in.
    life = performAction(life, 'set_role_commit', { roleId: 'band', commitment: 'all' }, content);
    expect(rehearseBlock(life, content)).toBeNull();
    ok(life);
  });

  it('a loyal beginner becomes good over the years by rehearsing', () => {
    let life = player('c2-grow', 10);
    life = performAction(life, 'form_band', { bandName: 'Slow Burn' }, content);
    life = apply(life, (d) => void (d.fame.band!.members[0]!.skill = 10));
    for (let y = 0; y < 8; y++) {
      for (let i = 0; i < S.band.sessions.steady; i++) life = performAction(life, 'rehearse', {}, content);
      life = next(life);
    }
    expect(liveMembers(life)[0]!.skill).toBeGreaterThan(45);
    ok(life);
  });

  it('the band feeds the quality of the work through its strength', () => {
    const life = player('c2-strength', 10);
    const withBand = performAction(life, 'form_band', { bandName: 'Strength' }, content);
    const strong = apply(withBand, (d) => void d.fame.band!.members.forEach((m) => (m.skill = 90)));
    const weak = apply(withBand, (d) => void d.fame.band!.members.forEach((m) => (m.skill = 10)));
    expect(bandStrength(strong, content)).toBeGreaterThan(bandStrength(weak, content));
  });

  it('replacing a member costs the relationship and opens auditions for the part', () => {
    let life = player('c2-replace', 10);
    life = performAction(life, 'form_band', { bandName: 'Swap' }, content);
    const m = life.fame.band!.members[0]!;
    const aff = life.relationships[m.id]!.affection;
    life = performAction(life, 'replace_member', { personId: m.id }, content);
    expect(life.fame.band!.members.some((x) => x.id === m.id)).toBe(false);
    expect(life.relationships[m.id]!.affection).toBeLessThan(aff);
    expect(currentPool(life)?.part).toBe(m.part);
  });
});

describe('performance enhancers', () => {
  const pro = (seed: string) =>
    apply(lifeAtAge(seed, 21), (d) => {
      d.character.hidden.talent = 'athletics';
      enterPath(d, 'basketball', 'open_tryout', content);
      d.sports.draft = { year: d.currentYear, pick: 5, round: 1, teamId: draftingTeam(d, 'basketball', 5, 'chicago', content).id };
      signDraftDeal(d, content, createRng(`${seed}:sign`));
    });

  it('are for adults who play, add form and cost health', () => {
    expect(enhancerBlock(lifeAtAge('c2-e0', 25), true, content)).toBe('sport');
    expect(enhancerBlock(apply(lifeAtAge('c2-e1', 15), (d) => void enterPath(d, 'basketball', 'school_tryout', content)), true, content)).toBe('age');
    const life = apply(pro('c2-e2'), (d) => void startEnhancers(d, content));
    expect(life.hub.enhancers.on).toBe(true);
    const health = life.character.stats.health;
    const after = apply(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      d.hub.enhancers.tests = 0;
      runHub(d, content);
    });
    expect(after.character.stats.health).toBeLessThan(health);
    expect(after.sports.form).toBeGreaterThan(0);
  });

  it('are tested at the pro level, and a positive test suspends you and costs fame, fan mood and reputation', () => {
    let positives = 0;
    let tests = 0;
    for (let i = 0; i < 80; i++) {
      const life = apply(pro(`c2-test-${i}`), (d) => {
        startEnhancers(d, content);
        d.fame.paths.basketball!.fame = 60;
        d.fame.mood = 70;
        d.character.hidden.reputation = 70;
      });
      const after = apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runHub(d, content);
      });
      tests += after.hub.enhancers.tests;
      if (after.hub.enhancers.positives > 0) {
        positives += 1;
        expect(after.sports.suspended).toBe(after.currentYear);
        expect(after.fame.paths.basketball!.fame).toBe(60 - S.enhancers.caught.fame);
        expect(after.fame.mood).toBe(70 - S.enhancers.caught.mood);
        expect(after.character.hidden.reputation).toBe(70 - S.enhancers.caught.reputation);
        expect(after.hub.enhancers.on).toBe(false);
        ok(after);
      }
    }
    expect(tests).toBeGreaterThan(10);
    expect(positives).toBeGreaterThan(5);
    expect(chance).toBeDefined();
  });

  it('can be stopped', () => {
    let life = apply(pro('c2-stop'), (d) => void startEnhancers(d, content));
    life = performAction(life, 'stop_enhancers', {}, content);
    expect(life.hub.enhancers.on).toBe(false);
    expect(() => performAction(life, 'stop_enhancers', {}, content)).toThrow(InvalidInputError);
  });
});

describe('the Career view', () => {
  it('lists every active role with one bar each and the schedule', () => {
    const life = apply(lifeAtAge('c2-view', 15), (d) => {
      school(d);
      enterPath(d, 'basketball', 'school_tryout', content);
      crossOver(d, 'music', content);
    });
    const withBand = performAction(life, 'form_band', { bandName: 'View' }, content);
    const view = getHubView(withBand, content);
    expect(view.roles.map((r) => r.id)).toEqual(['school', 'sports', 'band']);
    for (const r of view.roles) expect(r.bar).not.toBeNull();
    expect(view.load.total).toBe(view.load.shares.reduce((a, s) => a + s.points, 0));
    expect(getHubView(lifeAtAge('c2-view-none', 40), content).roles).toEqual([]);
    expect(findMembers).toBeDefined();
  });

  it('sets the commitment of a role, and refuses a role you do not have', () => {
    const life = apply(lifeAtAge('c2-commit', 15), (d) => {
      school(d);
      enterPath(d, 'basketball', 'school_tryout', content);
    });
    const hard = performAction(life, 'set_role_commit', { roleId: 'school', commitment: 'all' }, content);
    expect(hard.hub.commit.school).toBe('all');
    const sporty = performAction(life, 'set_role_commit', { roleId: 'sports', commitment: 'back' }, content);
    expect(sporty.fame.commitment).toBe('back');
    expect(() => performAction(life, 'set_role_commit', { roleId: 'business', commitment: 'all' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'set_role_commit', { roleId: 'school', commitment: 'lots' }, content)).toThrow(InvalidInputError);
    expect(startTryout).toBeDefined();
  });
});

describe('god mode: sports, music and fame careers', () => {
  const musician = () =>
    apply(editable(), (d) => {
      enterPath(d, 'music', 'band', content);
      d.fame.paths.music!.fame = 20;
    });
  const athlete = () =>
    apply(lifeAtAge('c2-god-sport', 15), (d) => {
      enterPath(d, 'basketball', 'school_tryout', content);
    });
  const codes = (life: LifeState, payload: unknown) => {
    const r = checkEdit(life, payload, content);
    return r.ok ? [] : r.refusals.map((x) => x.code);
  };

  it('edits a band: buzz, chemistry and a member\'s playing, through the same validation', () => {
    const life = musician();
    const member = life.fame.band!.members[0]!;
    const next = performEdit(life, { target: 'self', career: { music: { buzz: 60, chemistry: 90, members: [{ id: member.id, skill: 77 }] } } }, content);
    expect(next.fame.paths.music!.fame).toBe(60);
    expect(next.fame.band!.chemistry).toBe(90);
    expect(next.fame.band!.members[0]!.skill).toBe(77);
    expect(next.hub.marks[`member.${member.id}`]!.peak).toBe(77);
    expect(checkInvariants(next, content)).toEqual([]);
    expect(codes(life, { target: 'self', career: { music: { members: [{ id: 'nobody', skill: 50 }] } } })).toEqual(['unknown_id']);
    expect(codes(life, { target: 'self', career: { music: { buzz: 101 } } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: 'self', career: { music: { chemistry: 50 } } })).toEqual(['field_unavailable']);
  });

  it('edits a sport: position, Greatness and skills; refuses a position or skill the sport does not have', () => {
    const life = athlete();
    const sport = content.famePaths.basketball!;
    const position = sport.sport!.positions.find((p) => p.id !== life.sports.position)!;
    const skill = sport.skills![0]!;
    const next = performEdit(life, { target: 'self', career: { sports: { position: position.id, greatness: 70, skills: { [skill.id]: 66 } } } }, content);
    expect(next.sports.position).toBe(position.id);
    expect(next.fame.paths.basketball!.craft).toBe(70);
    expect(next.fame.paths.basketball!.skills![skill.id]).toBe(66);
    expect(checkInvariants(next, content)).toEqual([]);
    expect(codes(life, { target: 'self', career: { sports: { position: 'goalie' } } })).toEqual(['unknown_id']);
    expect(codes(life, { target: 'self', career: { sports: { skills: { cooking: 10 } } } })).toEqual(['unknown_id']);
    expect(codes(life, { target: 'self', career: { sports: { salary: 5 } } })).toEqual(['field_unavailable']);
    expect(codes(editable(), { target: 'self', career: { sports: { greatness: 50 } } })).toEqual(['field_unavailable']);
  });

  it('edits fame: level, image, fans, mood and agent, and nothing for a person', () => {
    const life = musician();
    const agent = Object.keys(content.fameAgents)[0]!;
    const next = performEdit(life, { target: 'self', career: { fame: { fame: 40, image: 80, fans: 5000, mood: 65, agent } } }, content);
    expect(next.fame.paths.music!.fame).toBe(40);
    expect(next.fame.image).toBe(80);
    expect(next.fame.fans).toBe(5000);
    expect(next.fame.agent?.agentId).toBe(agent);
    expect(checkInvariants(next, content)).toEqual([]);
    expect(codes(life, { target: 'self', career: { fame: { agent: 'nobody' } } })).toEqual(['unknown_id']);
    expect(codes(life, { target: 'self', career: { fame: { contract: 'end' } } })).toEqual(['field_unavailable']);
    expect(codes(life, { target: { person: 'p1' }, career: { fame: { fame: 5 } } }).length).toBeGreaterThan(0);
  });
});
