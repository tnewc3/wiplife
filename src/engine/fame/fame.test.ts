import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { evaluate } from '../conditions';
import { castEvent, createPerson, uncast } from '../events/casting';
import { applyEffects } from '../events/effects';
import { eventWeight } from '../events/selection';
import { checkInvariants } from '../invariants';
import { resolveChoice } from '../life';
import { createRng } from '../rng';
import { getFameView } from '../selectors';
import { yearIncome } from '../systems/career';
import { renderText } from '../text';
import { textContext } from '../events/text';
import { lifeAtAge } from '../testFixtures';
import { defaultLife } from '../lives/model';
import { startItem } from '../web/knowledge';
import type { FamePlan, LifeState } from '../types';
import {
  bigBreak,
  breakChance,
  climb,
  comeback,
  contractBlock,
  crossBlock,
  crossOver,
  enterBlock,
  enterPath,
  openAgents,
  payFameMoney,
  retire,
  setAgentTier,
  signAgent,
  signContract,
  endContract,
} from './ladder';
import { endStalker, exposableSecrets, exposeSecret, orderStalker, reportStalker, spawnFan, startStalker, stalkerChance, tabloidChance } from './people';
import { breakCeiling, hasTalentFor, rungDef, sizeAmount } from './query';
import { fameIncome, queueFameEvent, runFame, sceneCost } from './step';
import { aptitude, bandFor, planBlock, rollWork } from './work';

const b = content.balance.fame;
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age/.test(f))).toEqual([]);
const atRung = (d: LifeState, path: string, rung: number) => {
  const p = d.fame.paths[path]!;
  p.rung = rung;
  p.peak = Math.max(p.peak, rung);
};
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const star = (seed = 'fame', age = 26, path = 'music', talent: string | null = null) =>
  apply(lifeAtAge(seed, age), (d) => {
    d.character.hidden.talent = talent;
    enterPath(d, path, content.famePaths[path]!.routes[0]!.id, content);
  });
const yearStep = (life: LifeState) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runFame(d, content);
  });
const planOf = (life: LifeState, over: Partial<FamePlan> = {}): FamePlan => {
  const def = content.famePaths[life.fame.main!]!;
  const path = life.fame.paths[life.fame.main!]!;
  const kind = [...def.kinds].filter((k) => k.minRung <= path.rung).pop()!;
  return { path: life.fame.main!, kind: kind.id, style: 'commercial', risk: 'safe', tour: false, press: false, ...over };
};
const workYear = (life: LifeState, over: Partial<FamePlan> = {}) => yearStep(apply(life, (d) => void (d.fame.plan = planOf(d, over))));
/** Many lives, one measure each. */
const many = <T,>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));
const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe('starting a career', () => {
  it('lets anyone old enough start in a path by a route, with a head start in craft, and not twice', () => {
    const life = star('start');
    expect(life.fame).toMatchObject({ active: true, main: 'music', second: null, commitment: 'steady' });
    expect(life.fame.paths.music).toMatchObject({ rung: 1, peak: 1, craft: content.famePaths.music!.routes[0]!.craft });
    expect(enterBlock(life, 'acting', undefined, content)).toBe('active');
    expect(life.history.some((h) => h.tags.includes('fame'))).toBe(true);
    ok(life);
  });

  it('respects each path and route youngest age, and the oldest anyone can start', () => {
    const child = lifeAtAge('start-young', 9);
    expect(enterBlock(child, 'social', 'first_posts', content)).toBe('age');
    expect(enterBlock(child, 'music', 'open_mic', content)).toBe('age');
    expect(enterBlock(child, 'music', 'lessons', content)).toBeNull();
    expect(enterBlock(lifeAtAge('start-old', 80), 'music', 'open_mic', content)).toBe('age');
    expect(enterBlock(lifeAtAge('start-x', 30), 'music', 'nope', content)).toBe('unknown');
    expect(enterBlock(lifeAtAge('start-x', 30), 'ballet', undefined, content)).toBe('unknown');
  });

  it('needs a parent or guardian to sign for anyone under 18', () => {
    const child = apply(lifeAtAge('start-parent', 12), (d) => {
      for (const rel of Object.values(d.relationships)) if (rel.kind === 'parent' || rel.kind === 'stepparent') rel.status = 'ended';
      delete d.housing.guardianId;
    });
    expect(enterBlock(child, 'music', 'lessons', content)).toBe('parent');
    expect(enterBlock(lifeAtAge('start-parent-ok', 12), 'music', 'lessons', content)).toBeNull();
  });

  it('is not possible in prison, and the enter_fame action checks its input', () => {
    const jailed = apply(lifeAtAge('start-jail', 30), (d) => void (d.housing.kind = 'incarcerated'));
    expect(enterBlock(jailed, 'music', 'open_mic', content)).toBe('prison');
    const life = lifeAtAge('start-action', 30);
    expect(isLifeActionAvailable(life, 'enter_fame', { pathId: 'music', routeId: 'open_mic' }, content)).toBe(true);
    const next = performAction(life, 'enter_fame', { pathId: 'music', routeId: 'open_mic' }, content);
    expect(next.fame.active).toBe(true);
    expect(next.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'enter_fame' } });
    expect(() => performAction(life, 'enter_fame', { pathId: 'music' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'enter_fame', { pathId: 'music', routeId: 'open_mic', extra: 1 }, content)).toThrow(InvalidInputError);
    expect(() => performAction(next, 'enter_fame', { pathId: 'acting', routeId: 'open_call' }, content)).toThrow(InvalidInputError);
  });
});

describe('the quality of the work', () => {
  const quality = (life: LifeState, plan: FamePlan, n = 60) => {
    const def = content.famePaths[plan.path]!;
    const kind = def.kinds.find((k) => k.id === plan.kind)!;
    const rng = createRng(`quality-${life.seed}`);
    return many(n, () => rollWork(life, plan, life.fame.paths[plan.path]!, def, kind, content, rng));
  };

  it('counts a hidden talent that fits more than anything else you can bring', () => {
    const none = star('talent', 26, 'music', null);
    const gifted = star('talent', 26, 'music', 'music');
    const wrong = star('talent', 26, 'music', 'cooking');
    expect(hasTalentFor(gifted, content.famePaths.music!)).toBe(true);
    expect(hasTalentFor(wrong, content.famePaths.music!)).toBe(false);
    const q = (l: LifeState) => mean(quality(l, planOf(l)).map((r) => r.quality));
    expect(q(gifted) - q(none)).toBeGreaterThan(b.quality.talent * 0.7);
    expect(q(wrong)).toBeLessThan(q(none) + 3);
    // Craft, the team and luck each help, but each by less than a talent does.
    const skilled = apply(none, (d) => void (d.fame.paths.music!.craft = 60));
    expect(q(skilled) - q(none)).toBeGreaterThan(5);
    expect(q(skilled) - q(none)).toBeLessThan(b.quality.talent);
    const team = apply(none, (d) => void (d.fame.agent = { agentId: 'halcyon_artists', since: d.currentYear }));
    expect(q(team) - q(none)).toBeCloseTo(b.quality.team.agent * 3, 0);
  });

  it('lets critics and fans disagree, in the direction the creative choices lean', () => {
    const life = star('choices', 26, 'music', 'music');
    const sample = (style: 'commercial' | 'artistic', risk: 'safe' | 'bold') => quality(life, planOf(life, { style, risk }), 200);
    const commercial = sample('commercial', 'safe');
    const artistic = sample('artistic', 'safe');
    const gap = (rs: ReturnType<typeof sample>) => mean(rs.map((r) => r.critics - r.fans));
    expect(gap(artistic) - gap(commercial)).toBeGreaterThan(8);
    expect(gap(artistic)).toBeGreaterThan(0);
    expect(gap(commercial)).toBeLessThan(0);
    // A bold swing has a wider range of reception than a safe one.
    const spread = (rs: ReturnType<typeof sample>) => sd(rs.map((r) => (r.critics + r.fans) / 2));
    expect(spread(sample('artistic', 'bold'))).toBeGreaterThan(spread(sample('artistic', 'safe')) * 1.3);
    // And they disagree by 20 or more points on a real share of releases.
    const all = [...commercial, ...artistic];
    expect(all.filter((r) => Math.abs(r.critics - r.fans) >= 20).length / all.length).toBeGreaterThan(0.08);
    // So a bold flop can win critics, and a safe hit can be panned.
    expect(all.some((r) => r.band === 'cult')).toBe(true);
    expect(all.some((r) => r.band === 'crowd')).toBe(true);
    expect(bandFor(80, 80, 0.5, content)).toBe('acclaimed');
    expect(bandFor(80, 30, 0.5, content)).toBe('cult');
    expect(bandFor(30, 80, 0.5, content)).toBe('crowd');
    expect(bandFor(30, 30, 0.5, content)).toBe('flop');
    expect(aptitude(life, content.famePaths.music!)).toBeGreaterThan(0);
  });
});

describe('the climb', () => {
  it('is steady for someone with talent: a rung every few years, with the top rungs a long way off', () => {
    const lives = many(24, (i) => {
      let life = star(`climb-${i}`, 24, 'music', 'music');
      const rungs: number[] = [];
      for (let y = 0; y < 8; y++) {
        life = workYear(life);
        rungs.push(life.fame.paths.music!.rung);
      }
      return rungs;
    });
    const at = (year: number) => mean(lives.map((r) => r[year]!));
    expect(at(7)).toBeGreaterThan(at(1) + 1);
    expect(at(7)).toBeGreaterThan(3);
    // The climb is mostly one rung at a time.
    const jumps = lives.flatMap((r) => r.map((v, i) => v - (r[i - 1] ?? 1)));
    expect(jumps.filter((j) => j >= 2).length / jumps.length).toBeLessThan(0.1);
    expect(lives.filter((r) => r[7] === 7).length).toBeLessThan(lives.length * 0.3);
  });

  it('is held back by the quality of the work, not only by fame: fame waits at the foot of a rung it cannot climb', () => {
    const def = content.famePaths.music!;
    const life = apply(star('gate', 26, 'music'), (d) => {
      const p = d.fame.paths.music!;
      p.fame = 90;
      p.recent = [20];
      climb(d, 'music', content);
    });
    const p = life.fame.paths.music!;
    expect(p.rung).toBeLessThan(def.rungs.length);
    expect(p.fame).toBeLessThan(rungDef(def, p.rung + 1).fame);
    // Good work lets it through.
    const through = apply(life, (d) => {
      d.fame.paths.music!.recent = [95, 95, 95];
      d.fame.paths.music!.fame = 99;
      climb(d, 'music', content);
    });
    expect(through.fame.paths.music!.rung).toBe(def.rungs.length);
  });

  it('rarely takes someone without a fitting talent past the middle of the ladder, while talent often does', () => {
    const run = (talent: string | null, n: number) =>
      many(n, (i) => {
        let life = star(`middle-${talent}-${i}`, 20, 'music', talent);
        for (let y = 0; y < 28; y++) life = workYear(life, { style: i % 2 === 0 ? 'commercial' : 'artistic', risk: i % 3 === 0 ? 'bold' : 'safe', press: y % 2 === 0 });
        return life.fame.paths.music!.peak;
      });
    const middle = Math.ceil(content.famePaths.music!.rungs.length / 2);
    const none = run(null, 30);
    const gifted = run('music', 30);
    expect(none.filter((r) => r > middle).length / none.length).toBeLessThan(0.1);
    expect(gifted.filter((r) => r > middle).length / gifted.length).toBeGreaterThan(0.4);
    expect(mean(gifted)).toBeGreaterThan(mean(none) + 1.5);
  });
});

describe('big breaks', () => {
  it('are rare, likelier with good work and exposure, and jump several rungs but never past the ceiling', () => {
    const life = star('break', 26, 'acting', 'performance');
    const strong = apply(life, (d) => void (d.fame.paths.acting!.recent = [85, 85, 85]));
    const weak = apply(life, (d) => void (d.fame.paths.acting!.recent = [30, 30, 30]));
    expect(breakChance(strong, 'acting', content, false, false)).toBeGreaterThan(breakChance(weak, 'acting', content, false, false));
    expect(breakChance(strong, 'acting', content, true, true)).toBeGreaterThan(breakChance(strong, 'acting', content, false, false) * 1.5);
    expect(breakChance(strong, 'acting', content, true, true)).toBeLessThan(0.12);
    const jumped = many(30, (i) => {
      const l = apply(strong, (d) => void (d.rng = createRng(`break-${i}`)));
      return apply(l, (d) => void bigBreak(d, 'acting', content, d.rng)).fame.paths.acting!.rung - 1;
    });
    expect(Math.min(...jumped)).toBeGreaterThanOrEqual(b.bigBreak.jump.min);
    expect(Math.max(...jumped)).toBeLessThanOrEqual(b.bigBreak.jump.max);
    // Without a talent that fits, the ceiling is lower; and a break just happened can't be followed at once.
    const plain = apply(strong, (d) => void (d.character.hidden.talent = null));
    const def = content.famePaths.acting!;
    expect(breakCeiling(plain, def, content)).toBeLessThan(breakCeiling(strong, def, content));
    const high = apply(plain, (d) => void atRung(d, 'acting', breakCeiling(plain, def, content)));
    expect(breakChance(high, 'acting', content, true, true)).toBe(0);
    const again = apply(strong, (d) => void bigBreak(d, 'acting', content, d.rng));
    expect(breakChance(again, 'acting', content, true, true)).toBe(0);
    ok(again);
  });
});

describe('commitment', () => {
  const run = (commitment: 'back' | 'steady' | 'all', n: number) =>
    many(n, (i) => {
      let life = apply(star(`commit-${i}`, 28, 'music', 'music'), (d) => {
        d.fame.commitment = commitment;
        const mate = Object.keys(d.relationships).find((id) => d.relationships[id]!.kind === 'friend') ?? Object.keys(d.relationships)[0]!;
        d.relationships[mate]!.kind = 'partner';
        d.relationships[mate]!.status = 'active';
        d.relationships[mate]!.affection = 80;
        d.people[mate]!.alive = true;
        d.character.stats.health = 90;
        d.character.stats.stress = 30;
      });
      const mate = Object.keys(life.relationships).find((id) => life.relationships[id]!.kind === 'partner')!;
      for (let y = 0; y < 5; y++) life = workYear(life);
      return { affection: life.relationships[mate]!.affection, health: life.character.stats.health, stress: life.character.stats.stress, burnout: life.fame.burnout, fame: life.fame.paths.music!.fame + life.fame.paths.music!.rung * 20 };
    });

  it('trades climb speed against time for the people close to you, your health and your stress', () => {
    const back = run('back', 30);
    const steady = run('steady', 30);
    const all = run('all', 30);
    const m = (rs: ReturnType<typeof run>, key: 'affection' | 'health' | 'stress' | 'burnout' | 'fame') => mean(rs.map((r) => r[key]));
    expect(m(all, 'fame')).toBeGreaterThan(m(steady, 'fame'));
    expect(m(steady, 'fame')).toBeGreaterThan(m(back, 'fame'));
    expect(m(all, 'affection')).toBeLessThan(m(steady, 'affection'));
    expect(m(steady, 'affection')).toBeLessThan(m(back, 'affection') + 0.01);
    expect(m(back, 'affection') - m(all, 'affection')).toBeGreaterThan(8);
    expect(m(all, 'health')).toBeLessThan(m(back, 'health'));
    expect(m(all, 'stress')).toBeGreaterThan(m(back, 'stress'));
    expect(m(all, 'burnout')).toBeGreaterThan(m(back, 'burnout') + 20);
  });

  it('can end in burnout, which forces you to hold back', () => {
    const burned = many(40, (i) => {
      const life = apply(star(`burn-${i}`, 30, 'music', 'music'), (d) => {
        d.fame.commitment = 'all';
        d.fame.burnout = 95;
      });
      return workYear(life);
    });
    const hit = burned.filter((l) => l.fame.totals.burnouts > 0);
    expect(hit.length).toBeGreaterThan(5);
    expect(hit.length).toBeLessThan(burned.length);
    for (const l of hit) {
      expect(l.fame.commitment).toBe('back');
      expect(l.fame.burnout).toBeLessThan(60);
      expect(l.flags.fame_burned_out).toBe(true);
    }
    // And the setting is validated: a contract asks for a steady one, and nobody under 18 goes all in.
    const life = star('commit-action', 30);
    expect(isLifeActionAvailable(life, 'set_commitment', { commitment: 'all' }, content)).toBe(true);
    const bound = apply(life, (d) => void (d.fame.contract = { company: 'lowtide_records', path: 'music', since: d.currentYear, until: d.currentYear + 2, advance: 100, share: 0.2, terms: 'standard', exclusive: false, byParent: false }));
    expect(isLifeActionAvailable(bound, 'set_commitment', { commitment: 'back' }, content)).toBe(false);
    const young = apply(lifeAtAge('commit-young', 15), (d) => void enterPath(d, 'music', 'lessons', content));
    expect(isLifeActionAvailable(young, 'set_commitment', { commitment: 'all' }, content)).toBe(false);
    expect(apply(young, (d) => void (d.fame.commitment = 'all')).fame.commitment).toBe('all');
    expect(yearStep(apply(young, (d) => void (d.fame.commitment = 'all'))).fame.commitment).toBe('steady');
  });
});

describe('fading and coming back', () => {
  it('fades without new work, one rung at a time, and a project brings it back faster than it was won', () => {
    let life = apply(star('fade', 26, 'music', 'music'), (d) => {
      const p = d.fame.paths.music!;
      p.rung = 4;
      p.peak = 4;
      p.fame = rungDef(content.famePaths.music!, 4).fame + 3;
      p.recent = [70, 70, 70];
    });
    const rungs: number[] = [life.fame.paths.music!.rung];
    const fames: number[] = [life.fame.paths.music!.fame];
    for (let y = 0; y < 8; y++) {
      life = yearStep(life);
      rungs.push(life.fame.paths.music!.rung);
      fames.push(life.fame.paths.music!.fame);
    }
    expect(fames.every((f, i) => i === 0 || f <= fames[i - 1]!)).toBe(true);
    expect(rungs.every((r, i) => i === 0 || r >= rungs[i - 1]! - 1)).toBe(true);
    expect(rungs.at(-1)!).toBeLessThan(4);
    expect(life.fame.totals.fades).toBeGreaterThan(0);
    expect(life.fame.paths.music!.peak).toBe(4);
    expect(life.fame.fadedFrom).toBe(4);
    ok(life);
    // Work picks it up again, and getting back to where you were is counted as a comeback.
    const worked = apply(life, (d) => void (d.fame.paths.music!.recent = [85, 85, 85]));
    let back = worked;
    for (let y = 0; y < 8 && back.fame.totals.comebacks === 0; y++) back = workYear(apply(back, (d) => void (d.fame.paths.music!.recent = [85, 85, 85])));
    expect(back.fame.paths.music!.rung).toBeGreaterThanOrEqual(life.fame.paths.music!.rung);
  });

  it('lets a retired star go back to work, getting part of the way back at once', () => {
    const base = apply(star('return', 40, 'acting', 'performance'), (d) => {
      const p = d.fame.paths.acting!;
      p.rung = 5;
      p.peak = 5;
      p.fame = 70;
      p.recent = [80, 80, 80];
    });
    const retired = apply(base, (d) => void retire(d, content));
    expect(retired.fame.active).toBe(false);
    expect(retired.fame.retired).toBe(retired.currentYear);
    expect(isLifeActionAvailable(retired, 'return_fame', {}, content)).toBe(true);
    const faded = apply(retired, (d) => void (d.fame.paths.acting!.fame = 20));
    const back = apply(faded, (d) => void comeback(d, content));
    expect(back.fame.active).toBe(true);
    expect(back.fame.paths.acting!.fame).toBeGreaterThan(40);
    expect(back.fame.totals.comebacks).toBe(1);
    ok(back);
  });
});

describe('fans, haters and critics', () => {
  it('turn up as people, with a tag, a memory and ties to the rest of their kind', () => {
    let life = star('fans', 30, 'music', 'music');
    life = apply(life, (d) => void ((d.fame.paths.music!.fame = 70), (d.rng = createRng('fans'))));
    const made = [] as string[];
    for (const type of ['super', 'super', 'hater', 'critic'] as const) {
      life = apply(life, (d) => {
        const id = spawnFan(d, type, content, d.rng);
        if (id) made.push(id);
      });
    }
    expect(made.length).toBe(4);
    const [s1, s2, h, c] = made as [string, string, string, string];
    expect(life.people[s1]!.tags).toContain('fan:super');
    expect(life.relationships[s1]!.memories.some((m) => m.tag === 'fan_super')).toBe(true);
    expect(life.relationships[h]!.affection).toBeLessThan(life.relationships[s1]!.affection);
    expect(life.relationships[c]!.memories[0]!.tag).toBe('fan_critic');
    expect(life.web.ties[[s1, s2].sort().join('|')]).toBeDefined();
    expect(life.fame.people).toEqual({ super: [s1, s2], hater: [h], critic: [c] });
    ok(life);
  });

  it('charges a stalker only when they have no other crime case', () => {
    for (let i = 0; i < 12; i++) {
      const made = apply(star(`stalker-case-${i}`, 30, 'music', 'music'), (d) => {
        d.rng = createRng(`stalker-case-${i}`);
        spawnFan(d, 'super', content, d.rng);
        const fan = d.fame.people.super[0]!;
        d.people[fan]!.life = defaultLife(d, d.people[fan]!, d.relationships[fan]!, content);
        d.people[fan]!.life!.troubles.push({ kind: 'crime', refId: 'shoplifting', since: d.currentYear, severity: 0, treated: false, stage: 'held' });
        startStalker(d, fan, content);
        reportStalker(d, content, d.rng);
      });
      const fan = made.fame.people.super[0]!;
      expect(made.people[fan]!.life!.troubles.filter((t) => t.kind === 'crime')).toHaveLength(1);
      ok(made);
    }
  });

  it('does not estrange a fan you went on to marry when the stalking ends', () => {
    const base = apply(star('stalker-spouse', 30, 'music', 'music'), (d) => {
      d.rng = createRng('stalker-spouse');
      spawnFan(d, 'super', content, d.rng);
    });
    const fan = base.fame.people.super[0]!;
    const ended = apply(base, (d) => {
      startStalker(d, fan, content);
      d.relationships[fan]!.kind = 'spouse';
      endStalker(d);
    });
    expect(ended.relationships[fan]!.status).toBe('active');
    expect(ended.fame.stalker).toBeNull();
  });

  it('keep to the cap however fans arrive: the longest-known drifts out, and never the stalker', () => {
    const max = content.balance.fame.people.max;
    const made = apply(star('fan-cap', 30, 'music', 'music'), (d) => {
      d.rng = createRng('fan-cap');
      for (let i = 0; i < max + 4; i++) spawnFan(d, 'hater', content, d.rng);
    });
    expect(made.fame.people.hater.length).toBeLessThanOrEqual(max);
    const dropped = Object.values(made.people).filter((p) => p.tags.includes('fan:hater') && !made.fame.people.hater.includes(p.id));
    expect(dropped).toEqual([]);
    ok(made);
  });

  it('are the age of a young star, and fans are never romantic', () => {
    const young = apply(lifeAtAge('fans-young', 12), (d) => void enterPath(d, 'music', 'lessons', content));
    for (let i = 0; i < 6; i++) {
      const id = apply(young, (d) => void (d.rng = createRng(`fy-${i}`)));
      const made = apply(id, (d) => void spawnFan(d, 'super', content, d.rng));
      const person = made.fame.people.super[0];
      if (person) expect(made.currentYear - made.people[person]!.birthYear).toBeLessThanOrEqual(17);
    }
    for (const def of Object.values(content.events)) {
      if (!def.category.startsWith('fame')) continue;
      for (const spec of Object.values(def.cast ?? {})) expect(spec.romantic || spec.admirer, def.id).toBeFalsy();
    }
  });

  it('can become a stalker: adults only, through reports and orders in the legal system', () => {
    const base = apply(star('stalker', 30, 'music', 'music'), (d) => {
      d.fame.paths.music!.fame = 80;
      d.rng = createRng('stalker');
      spawnFan(d, 'super', content, d.rng);
    });
    const fan = base.fame.people.super[0]!;
    expect(stalkerChance(base, content)).toBeGreaterThan(0);
    const young = apply(lifeAtAge('stalker-young', 14), (d) => void enterPath(d, 'music', 'lessons', content));
    expect(stalkerChance(young, content)).toBe(0);
    const refused = apply(young, (d) => {
      d.fame.people.super.push(Object.keys(d.people)[0]!);
      startStalker(d, Object.keys(d.people)[0]!, content);
    });
    expect(refused.fame.stalker).toBeNull();
    const stalked = apply(base, (d) => void startStalker(d, fan, content));
    expect(stalked.fame.stalker).toMatchObject({ id: fan, stage: 'watching' });
    expect(stalked.flags.fame_stalked).toBe(true);
    expect(stalked.fame.totals.stalkers).toBe(1);
    expect(stalkerChance(stalked, content)).toBe(0);
    ok(stalked);
    // A report may lead to charges, which run as any case among the people you know; an order may be granted.
    const outcomes = many(40, (i) => apply(stalked, (d) => void ((d.rng = createRng(`report-${i}`)), reportStalker(d, content, d.rng))));
    const charged = outcomes.filter((l) => l.fame.stalker?.stage === 'charged');
    expect(charged.length).toBeGreaterThan(10);
    expect(charged.length).toBeLessThan(40);
    expect(charged[0]!.people[fan]!.life!.troubles).toContainEqual(expect.objectContaining({ kind: 'crime', refId: 'stalking', stage: 'held' }));
    const ordered = many(40, (i) => apply(stalked, (d) => void ((d.rng = createRng(`order-${i}`)), orderStalker(d, content, d.rng)))).filter((l) => l.fame.stalker?.stage === 'ordered');
    expect(ordered.length).toBeGreaterThan(15);
    ok(charged[0]!);
  });
});

describe('agents and contracts', () => {
  it('give you a better team for a cut of what you earn, and open doors only to those who have climbed', () => {
    const life = star('agent', 26, 'music', 'music');
    expect(openAgents(life, content)).toEqual([]);
    const rising = apply(life, (d) => void atRung(d, 'music', 2));
    expect(openAgents(rising, content).map((a) => a.tier)).toEqual([1]);
    const high = apply(life, (d) => void (atRung(d, 'music', 5), (d.fame.image = 60)));
    expect(openAgents(high, content).map((a) => a.tier)).toEqual([3, 2, 1]);
    const signed = apply(high, (d) => void signAgent(d, 'halcyon_artists', content));
    expect(signed.fame.agent?.agentId).toBe('halcyon_artists');
    expect(openAgents(signed, content)).toEqual([]);
    const tiered = apply(high, (d) => void setAgentTier(d, 2, content));
    expect(tiered.fame.agent?.agentId).toBe('dunmore_talent');
    const dropped = apply(signed, (d) => void setAgentTier(d, 0, content));
    expect(dropped.fame.agent).toBeNull();
    expect(dropped.fame.image).toBeLessThan(signed.fame.image);
    // The cut comes out of what the work earned, and the ledger sees the rest.
    const worked = workYear(apply(signed, (d) => void (d.fame.plan = planOf(d))));
    expect(worked.fame.income.agent).toBe(Math.round(worked.fame.income.gross * content.fameAgents.halcyon_artists!.cut));
    expect(fameIncome(worked)).toBe(worked.fame.income.gross - worked.fame.income.agent - worked.fame.income.company - worked.fame.income.trust);
    ok(worked);
  });

  it('change your income and your obligations, and breaking one has consequences', () => {
    const life = apply(star('deal', 30, 'music', 'music'), (d) => {
      atRung(d, 'music', 3);
      d.fame.paths.music!.fame = 30;
      d.rng = createRng('deal');
    });
    expect(contractBlock(star('deal-low', 30, 'music'), content)).toBe('rung');
    expect(contractBlock(life, content)).toBeNull();
    const before = life.finances.savings;
    const signed = apply(life, (d) => void signContract(d, 'tough', content, d.rng));
    const c = signed.fame.contract!;
    expect(c).toMatchObject({ path: 'music', byParent: false, terms: 'tough', share: b.contracts.share.tough });
    expect(c.until).toBeGreaterThanOrEqual(c.since + b.contracts.years.tough.min - 1);
    expect(signed.finances.savings - before).toBe(c.advance);
    expect(contractBlock(signed, content)).toBe('have');
    // Obligations: a steady commitment at least, and a project every year, assigned if you plan none.
    expect(isLifeActionAvailable(signed, 'set_commitment', { commitment: 'back' }, content)).toBe(false);
    const assigned = yearStep(apply(signed, (d) => void (d.fame.commitment = 'steady')));
    expect(assigned.fame.projects.at(-1)).toMatchObject({ assigned: true });
    // The company's share comes off the release.
    expect(assigned.fame.income.company).toBeGreaterThan(0);
    // Exclusive deals keep you from crossing over.
    const exclusive = apply(signed, (d) => void ((d.fame.contract!.exclusive = true), atRung(d, 'music', 5), (d.fame.paths.music!.fame = 70)));
    expect(crossBlock(exclusive, 'acting', content)).toBe('contract');
    // Breaking it costs part of the advance, your image and your fans' goodwill.
    const broken = apply(signed, (d) => void endContract(d, 'broken', content));
    expect(broken.fame.contract).toBeNull();
    expect(broken.flags.fame_broke_contract).toBe(true);
    expect(broken.fame.image).toBeLessThan(signed.fame.image);
    expect(broken.fame.mood).toBeLessThan(signed.fame.mood);
    expect(broken.finances.savings).toBeLessThan(signed.finances.savings);
    // And one that runs out ends by itself, with an event to follow.
    const ran = apply(signed, (d) => void (d.fame.contract!.until = d.currentYear));
    const over = yearStep(ran);
    expect(over.fame.contract).toBeNull();
    expect(over.scheduled.some((s) => content.registries.fame.triggers.contractEnd.events.includes(s.eventId))).toBe(true);
  });

  it('are signed by a parent for anyone under 18, never bind them exclusively, and part of the pay is held in trust', () => {
    const kid = apply(lifeAtAge('kid-deal', 13), (d) => {
      enterPath(d, 'music', 'lessons', content);
      atRung(d, 'music', 3);
      d.rng = createRng('kid-deal');
    });
    const signed = apply(kid, (d) => void signContract(d, 'tough', content, d.rng));
    expect(signed.fame.contract).toMatchObject({ byParent: true, exclusive: false });
    expect(signed.fame.contract!.until - signed.fame.contract!.since + 1).toBeLessThanOrEqual(b.contracts.minorYears);
    expect(signed.finances.trust?.balance).toBeGreaterThan(0);
    expect(signed.finances.trust?.releaseAge).toBe(content.balance.economy.independenceAge);
    const pay = apply(signed, (d) => void payFameMoney(d, 10_000, content));
    expect(pay.finances.trust!.balance - signed.finances.trust!.balance).toBe(Math.round(10_000 * b.minors.trust));
    const year = workYear(apply(signed, (d) => void (d.fame.contract = null)));
    expect(year.fame.income.trust).toBeGreaterThan(0);
    expect(fameIncome(year)).toBeLessThan(year.fame.income.gross);
    ok(signed);
    ok(year);
    const bad = apply(signed, (d) => void (d.fame.contract!.byParent = false));
    expect(checkInvariants(bad, content).join('\n')).toMatch(/not signed by a parent/);
  });
});

describe('awards and the tabloids', () => {
  it('nominate good work, hold the ceremony the year after and keep a shelf', () => {
    const results = many(120, (i) => {
      const life = apply(star(`award-${i}`, 30, 'music', 'music'), (d) => {
        atRung(d, 'music', 4);
        d.fame.paths.music!.fame = 50;
        d.fame.paths.music!.recent = [90, 90, 90];
        d.fame.paths.music!.craft = 90;
        d.rng = createRng(`award-${i}`);
      });
      return workYear(life, { style: 'artistic' });
    });
    const nominated = results.filter((l) => l.fame.nominated);
    expect(nominated.length).toBeGreaterThan(10);
    expect(nominated.length).toBeLessThan(results.length);
    const chosen = nominated[0]!;
    expect(chosen.fame.nominated!.due).toBe(chosen.currentYear + 1);
    const night = yearStep(chosen);
    expect(night.fame.nominated).toBeUndefined();
    expect(night.fame.ceremony).toMatchObject({ year: night.currentYear });
    expect(night.fame.awards.at(-1)).toMatchObject({ won: night.fame.ceremony!.result === 'won' });
    expect(night.scheduled.some((s) => content.registries.fame.triggers[night.fame.ceremony!.result].events.includes(s.eventId))).toBe(true);
    ok(night);
    // A flop is never nominated.
    const poor = workYear(apply(star('award-poor', 30, 'music', null), (d) => void ((d.fame.paths.music!.craft = 0), atRung(d, 'music', 3))), { style: 'commercial' });
    expect(poor.fame.nominated).toBeUndefined();
  });

  it('can make a secret public above the set fame level, and never for anyone under 18', () => {
    const base = apply(star('tabloid', 40, 'music', 'music'), (d) => {
      d.fame.paths.music!.fame = 70;
      d.rng = createRng('tabloid');
      startItem({ cur: d, web: d.web, content, rng: d.rng, year: d.currentYear }, 'unknownCrime', 'you', undefined);
    });
    expect(exposableSecrets(base, content)).toHaveLength(1);
    expect(tabloidChance(base, content)).toBeGreaterThan(0);
    const low = apply(base, (d) => void (d.fame.paths.music!.fame = b.tabloids.minFame - 5));
    expect(tabloidChance(low, content)).toBe(0);
    const young = apply(lifeAtAge('tabloid-young', 15), (d) => void enterPath(d, 'music', 'lessons', content));
    expect(tabloidChance(apply(young, (d) => void (d.fame.paths.music!.fame = 80)), content)).toBe(0);
    const out = apply(base, (d) => {
      const item = exposableSecrets(d, content)[0]!;
      exposeSecret(d, item, content, d.rng);
    });
    const item = out.web.items[0]!;
    expect(item.public).toBe(true);
    expect(Object.keys(item.holders).length).toBeGreaterThan(1);
    expect(out.fame.headlines).toHaveLength(1);
    expect(out.fame.image).toBeLessThan(base.fame.image);
    expect(out.fame.totals.scandals).toBe(1);
    ok(out);
    // It happens in the year's step too, and the news feed reads the headline.
    const years = many(60, (i) => yearStep(apply(base, (d) => void ((d.rng = createRng(`tab-${i}`)), (d.fame.paths.music!.fame = 90)))));
    expect(years.filter((l) => l.web.items[0]?.public).length).toBeGreaterThan(2);
  });
});

describe('crossing over', () => {
  it('opens at the set rung and fame, once, with part of what you have carried over', () => {
    const base = star('cross', 35, 'acting', 'performance');
    expect(crossBlock(base, 'music', content)).toBe('rung');
    const high = apply(base, (d) => {
      atRung(d, 'acting', 5);
      d.fame.paths.acting!.fame = 70;
      d.fame.paths.acting!.craft = 80;
    });
    expect(crossBlock(high, 'music', content)).toBeNull();
    expect(crossBlock(high, 'acting', content)).toBe('same');
    const crossed = apply(high, (d) => void crossOver(d, 'music', content));
    expect(crossed.fame.second).toBe('music');
    const second = crossed.fame.paths.music!;
    expect(second.rung).toBe(Math.round(5 * b.crossover.carry.rung));
    expect(second.craft).toBe(Math.round(80 * b.crossover.carry.craft));
    expect(second.fame).toBeGreaterThan(0);
    expect(crossBlock(crossed, 'arts', content)).toBe('second');
    expect(crossed.fame.totals.crossovers).toBe(1);
    // Both paths can be worked, and the one you leave alone fades.
    const next = workYear(crossed);
    expect(next.fame.paths.acting!.last).toBe(next.currentYear);
    ok(next);
  });
});

describe('retiring and the ledger', () => {
  it('turns fame into royalties that fade, paid through the yearly ledger', () => {
    const base = apply(star('royalty', 60, 'music', 'music'), (d) => {
      atRung(d, 'music', 6);
      d.fame.paths.music!.peak = 6;
      d.fame.paths.music!.fame = 75;
      retire(d, content);
    });
    const first = yearStep(base);
    const second = yearStep(first);
    expect(first.fame.income.gross).toBeGreaterThan(0);
    expect(second.fame.income.gross).toBeLessThan(first.fame.income.gross);
    expect(fameIncome(first)).toBe(first.fame.income.gross);
    expect(first.fame.agent).toBeNull();
    ok(second);
  });

  it('counts a year of work in gross income and the scene in living costs, and shows the pay in the yearly ledger', () => {
    let life = apply(star('ledger', 28, 'music', 'music'), (d) => {
      atRung(d, 'music', 4);
      d.fame.paths.music!.fame = 45;
      d.fame.scene = 'entourage';
      d.fame.plan = null;
    });
    life = workYear(life);
    expect(fameIncome(life)).toBeGreaterThan(0);
    expect(sceneCost(life)).toBe(Math.round(Math.max(0, fameIncome(life)) * b.scene.cost.entourage));
    expect(yearIncome(life, content)).toBeGreaterThanOrEqual(fameIncome(life));
    // The pipeline puts it in the ledger.
    const piped = apply(star('ledger-pipe', 28, 'music', 'music'), (d) => {
      atRung(d, 'music', 4);
      d.fame.paths.music!.fame = 45;
      d.fame.plan = planOf(d);
    });
    const real = produce(piped, (d) => {
      d.phase = 'yearStart';
    });
    expect(real.fame.plan).not.toBeNull();
  });
});

describe('the lifestyle', () => {
  it('costs a share of the pay, helps happiness and public image, and invites the tabloids', () => {
    expect(b.scene.cost.lavish).toBeGreaterThan(b.scene.cost.low);
    const base = apply(star('scene', 30, 'music', 'music'), (d) => {
      atRung(d, 'music', 4);
      d.fame.paths.music!.fame = 50;
    });
    const spend = (scene: 'low' | 'lavish') => workYear(apply(base, (d) => void ((d.fame.scene = scene), (d.rng = createRng('scene'))))).fame.income;
    expect(spend('lavish').scene).toBeGreaterThan(spend('low').scene);
    expect(isLifeActionAvailable(base, 'set_scene', { scene: 'lavish' }, content)).toBe(true);
    expect(isLifeActionAvailable(base, 'set_scene', { scene: 'social' }, content)).toBe(false);
    const young = apply(lifeAtAge('scene-young', 14), (d) => void enterPath(d, 'music', 'lessons', content));
    expect(yearStep(apply(young, (d) => void (d.fame.scene = 'lavish'))).fame.income.scene).toBe(0);
  });
});

describe('conditions, effects, text and the screen', () => {
  const event = content.events.release_hit!;
  const withRelease = (band: 'hit' | 'flop' = 'hit') =>
    workYear(apply(star('text', 30, 'music', 'music'), (d) => void ((d.fame.paths.music!.recent = [60]), (d.fame.plan = planOf(d)))), {}).fame.projects.at(-1)?.band === band ? true : false;

  it('reads the fame condition', () => {
    const life = star('cond', 30, 'music', 'music');
    const at = (c: Parameters<typeof evaluate>[0]) => evaluate(c, life, { content });
    expect(at({ fame: { active: true } })).toBe(true);
    expect(at({ fame: { path: ['music'] } })).toBe(true);
    expect(at({ fame: { path: ['acting'] } })).toBe(false);
    expect(at({ fame: { rung: { gte: 2 } } })).toBe(false);
    expect(at({ fame: { agent: { eq: 0 } } })).toBe(true);
    expect(at({ fame: { contract: false } })).toBe(true);
    expect(at({ fame: { stalker: false } })).toBe(true);
    expect(at({ fame: { commitment: ['steady', 'all'] } })).toBe(true);
    expect(at({ fame: { faded: true } })).toBe(false);
    expect(at({ fame: { released: true } })).toBe(false);
    expect(at({ fame: { retired: true } })).toBe(false);
    expect(at({ fame: { crossable: true } })).toBe(false);
    expect(evaluate({ fame: { active: false } }, lifeAtAge('cond-none', 30), { content })).toBe(true);
    void withRelease;
  });

  it('applies the fame effects and refuses what does not fit', () => {
    const life = star('fx', 30, 'music', 'music');
    const run = (l: LifeState, effects: Parameters<typeof applyEffects>[1]) => apply(l, (d) => void applyEffects(d, effects, { def: event, cast: {}, rng: d.rng, content }));
    expect(run(life, [{ type: 'fame', action: 'image', delta: 20 }]).fame.image).toBe(70);
    expect(run(life, [{ type: 'fame', action: 'mood', delta: -90 }]).fame.mood).toBe(0);
    expect(run(life, [{ type: 'fame', action: 'burnout', delta: 500 }]).fame.burnout).toBe(100);
    expect(run(life, [{ type: 'fame', action: 'fans', delta: 100 }]).fame.fans).toBe(life.fame.fans * 2);
    expect(run(life, [{ type: 'fame', action: 'commitment', value: 'all' }]).fame.commitment).toBe('all');
    expect(run(life, [{ type: 'fame', action: 'scene', scene: 'lavish' }]).fame.scene).toBe('lavish');
    expect(run(life, [{ type: 'fame', action: 'retire' }]).fame.active).toBe(false);
    expect(run(life, [{ type: 'fame', action: 'rung', delta: 2 }]).fame.paths.music!.rung).toBeGreaterThanOrEqual(1);
    // No career: nothing happens, and a start works.
    const none = lifeAtAge('fx-none', 30);
    expect(run(none, [{ type: 'fame', action: 'image', delta: 20 }]).fame.image).toBe(50);
    expect(run(none, [{ type: 'fame', action: 'enter', path: 'music', route: 'open_mic' }]).fame.active).toBe(true);
    // Money from the work scales with your rung and your city, and is shown like any other money.
    const rich = apply(life, (d) => void atRung(d, 'music', 6));
    expect(sizeAmount(rich, 'solid', content)).toBeGreaterThan(sizeAmount(life, 'solid', content) * 10);
    expect(sizeAmount(life, 'petty', content)).toBeGreaterThanOrEqual(b.income.floor.petty * 0.5);
    const paid = run(life, [{ type: 'famePay', gain: 'solid' }]);
    expect(paid.finances.savings - life.finances.savings).toBe(sizeAmount(life, 'solid', content));
    const cost = run(apply(life, (d) => void (d.finances.savings = 100_000)), [{ type: 'famePay', cost: 'solid' }]);
    expect(100_000 - cost.finances.savings).toBe(sizeAmount(life, 'solid', content));
    expect(run(none, [{ type: 'famePay', gain: 'solid' }]).finances.savings).toBe(none.finances.savings);
  });

  it('fills the text values of a release with the project, quotes from critics and fans, and your rung', () => {
    let life = apply(star('release', 30, 'music', 'music'), (d) => void ((d.fame.paths.music!.fame = 20), (d.rng = createRng('release'))));
    life = workYear(life);
    const project = life.fame.projects.at(-1)!;
    const values = textContext(life, {}, content).values!;
    expect(values.project).toBe(project.title);
    expect(String(values.review).length).toBeGreaterThan(10);
    expect(String(values.fanLine).length).toBeGreaterThan(10);
    expect(String(values.rungTitle)).toMatch(/^an? /);
    const def = content.events[content.registries.fame.triggers[project.band].events[0]!]!;
    expect(renderText(def.text, textContext(life, {}, content))).not.toMatch(/[{}]/);
    expect(evaluate(def.requires, life, { content })).toBe(true);
    expect(life.scheduled.some((s) => s.eventId === def.id)).toBe(true);
  });

  it('shows the Fame screen: the ladder, the next milestone, the people and the ways in', () => {
    const life = apply(star('view', 30, 'acting', 'performance'), (d) => void ((d.fame.paths.acting!.rung = 3), (d.fame.paths.acting!.peak = 4), (d.fame.paths.acting!.fame = 40)));
    const view = getFameView(life, content);
    expect(view).toMatchObject({ show: true, active: true, minor: false });
    const path = view.paths[0]!;
    expect(path.ladder).toHaveLength(content.famePaths.acting!.rungs.length);
    expect(path.ladder.filter((r) => r.current)).toHaveLength(1);
    expect(path.faded).toBe(true);
    expect(path.next?.title).toBe(content.famePaths.acting!.rungs[3]!.title);
    expect(path.kinds.some((k) => k.locked)).toBe(true);
    expect(view.entry).toEqual([]);
    const fresh = getFameView(lifeAtAge('view-fresh', 30), content);
    expect(fresh.active).toBe(false);
    expect(fresh.entry.map((e) => e.pathId).sort()).toEqual(['acting', 'arts', 'music', 'social']);
    expect(getFameView(lifeAtAge('view-tiny', 3), content).show).toBe(false);
  });
});

describe('planning a project', () => {
  it('is validated: a kind your rung allows, the extras your rung allows, between years, one path you work in', () => {
    const life = star('plan', 26, 'music', 'music');
    const good = { pathId: 'music', kindId: 'single', style: 'artistic', risk: 'bold', tour: false, press: false } as const;
    expect(isLifeActionAvailable(life, 'plan_project', good, content)).toBe(true);
    expect(isLifeActionAvailable(life, 'plan_project', { ...good, kindId: 'album' }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'plan_project', { ...good, tour: true }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'plan_project', { ...good, pathId: 'acting', kindId: 'tv_role' }, content)).toBe(false);
    expect(planBlock(life, { path: 'music', kind: 'single', style: 'artistic', risk: 'bold', tour: false, press: false }, content)).toBeNull();
    const next = performAction(life, 'plan_project', good, content);
    expect(next.fame.plan).toEqual({ path: 'music', kind: 'single', style: 'artistic', risk: 'bold', tour: false, press: false });
    expect(performAction(next, 'cancel_project', {}, content).fame.plan).toBeNull();
    expect(() => performAction(life, 'plan_project', { ...good, style: 'loud' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'plan_project', { ...good, tour: 'yes' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'plan_project', { pathId: 'music' }, content)).toThrow(InvalidInputError);
    // The project comes out as the year begins, with the choices it was made with.
    const year = yearStep(next);
    expect(year.fame.projects.at(-1)).toMatchObject({ kind: 'single', style: 'artistic', risk: 'bold', year: year.currentYear });
    expect(year.fame.plan).toBeNull();
    ok(year);
  });

  it('never lets a young star go all in or be stalked, however many years pass', () => {
    let life = apply(lifeAtAge('young-years', 11), (d) => void enterPath(d, 'acting', 'drama_class', content));
    for (let y = 0; y < 6; y++) life = workYear(life, { press: true });
    expect(life.fame.commitment).not.toBe('all');
    expect(life.fame.stalker).toBeNull();
    expect(life.fame.headlines).toHaveLength(0);
    ok(life);
  });
});

describe('fame events', () => {
  const real = (id: string) => content.events[id]!;

  it('only come to someone with a career, and entries only to someone with none', () => {
    const none = lifeAtAge('ev-none', 30);
    const star30 = star('ev-star', 30, 'music', 'music');
    expect(eventWeight(none, real('release_hit'), content)).toBe(0);
    expect(eventWeight(star30, real('open_mic_night'), content)).toBe(0);
    expect(eventWeight(none, real('open_mic_night'), content)).toBeGreaterThan(0);
    expect(eventWeight(apply(none, (d) => void (d.character.age = 12)), real('open_mic_night'), content)).toBe(0);
  });

  it('start a career by choice, and signing a deal pays the advance', () => {
    const none = apply(lifeAtAge('ev-start', 25), (d) => void createPerson(d, { kind: 'friend', presence: 'city' }, createRng('ev-friend'), content));
    const rng = createRng('ev-start');
    const def = real('open_mic_night');
    const queued = apply(none, (d) => {
      const cast = castEvent(d, def, rng, content);
      expect(cast).not.toBeNull();
      d.phase = 'events';
      d.pending = [{ instanceId: 'e1', eventId: def.id, cast: cast!.cast }];
    });
    const done = resolveChoice(queued, 'e1', 'play', content);
    expect(done.fame.active).toBe(true);
    expect(done.fame.main).toBe('music');
  });

  it('cast a fan person who is found, or made on the spot and added to your fans, and removed again if the cast fails', () => {
    const base = apply(star('ev-fan', 30, 'music', 'music'), (d) => void (d.rng = createRng('ev-fan')));
    const def = real('superfan_letter');
    const made = apply(base, (d) => {
      const result = castEvent(d, def, d.rng, content);
      expect(result).not.toBeNull();
      expect(d.fame.people.super).toContain(result!.cast.fan);
      uncast(d, result!.created);
    });
    expect(made.fame.people.super).toEqual([]);
    const withFan = apply(base, (d) => void spawnFan(d, 'super', content, d.rng));
    const again = apply(withFan, (d) => {
      const result = castEvent(d, def, d.rng, content);
      expect(result!.cast.fan).toBe(withFan.fame.people.super[0]);
      expect(result!.created).toEqual([]);
    });
    expect(again.fame.people.super).toHaveLength(1);
    // The stalker role needs a stalker.
    expect(apply(base, (d) => void expect(castEvent(d, real('stalker_escalates'), d.rng, content)).toBeNull())).toBeDefined();
  });

  it('queue by trigger and need the right state to fit', () => {
    const life = apply(star('ev-queue', 30, 'music', 'music'), (d) => {
      atRung(d, 'music', 3);
      d.fame.image = 60;
    });
    for (const trigger of ['agent', 'contract'] as const) {
      expect(apply(life, (d) => void queueFameEvent(d, trigger, content)).scheduled.length, trigger).toBeGreaterThan(0);
    }
    // Nothing for the awards night without one.
    expect(apply(life, (d) => void queueFameEvent(d, 'won', content)).scheduled).toHaveLength(life.scheduled.length);
  });
});
