import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { evaluate } from '../conditions';
import { applyEffects } from '../events/effects';
import { castEvent, uncast } from '../events/casting';
import { eventWeight } from '../events/selection';
import { netWorth } from '../finance';
import { playYear } from '../autoplay';
import { checkInvariants } from '../invariants';
import { arrestChance, investigationChance } from '../legal';
import { resolveChoice } from '../life';
import { createRng } from '../rng';
import { getCrimeView, getDirtyView } from '../selectors';
import { lifeAtAge } from '../testFixtures';
import { pruneWeb } from '../web/ties';
import type { LifeState } from '../types';
import { demote, joinBlock, joinCrew, leaveCrew, promote } from './crew';
import { addHeat, frontsFor, jobPayout, launder, launderRisk, spendDirty, spendHeat } from './money';
import { crewPeople, emptyCrime, inCrew, isFormer } from './query';
import { queueCrimeEvent, runCrime } from './step';

const b = content.balance.crime;
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId/.test(f))).toEqual([]);
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const adult = (seed = 'crime', age = 28) => lifeAtAge(seed, age);
const inCrewLife = (seed = 'crime', age = 28) => apply(adult(seed, age), (d) => void joinCrew(d, content));
const yearStep = (life: LifeState) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runCrime(d, content);
  });

describe('joining a crew', () => {
  it('is for adults only: nothing under 18 can join, whatever asks', () => {
    const teen = lifeAtAge('crime-teen', 16);
    expect(joinBlock(teen, content)).toBe('age');
    const after = apply(teen, (d) => void joinCrew(d, content));
    expect(after.crime.crew).toBeNull();
    const viaEffect = apply(teen, (d) => void applyEffects(d, [{ type: 'crime', action: 'join' }], { def: content.events.offer_through_a_friend!, cast: {}, rng: d.rng, content }));
    expect(viaEffect.crime.crew).toBeNull();
    expect(checkInvariants({ ...teen, crime: { ...emptyCrime(), crew: { defId: 'cinder_row_outfit', cityId: 'chicago', since: teen.currentYear, members: [], rivalMembers: [] }, rank: 1, peak: 1 } }, content).join('\n')).toMatch(/under 18/);
  });

  it('puts you in a crew that works in your city, with people you know tied to one another and a rival there', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const life = inCrewLife(`crew-${seed}`);
      const crew = life.crime.crew!;
      expect(content.crews[crew.defId]!.cities).toContain(life.character.cityId);
      expect(life.crime).toMatchObject({ rank: 1, peak: 1, standing: b.entry.standing });
      expect(crew.members.length).toBeGreaterThanOrEqual(b.entry.members.min);
      expect(crew.leader).toBeDefined();
      expect(crew.rival).toBeDefined();
      expect(content.crews[crew.rival!]!.cities).toContain(life.character.cityId);
      for (const id of crew.members) {
        const age = life.currentYear - life.people[id]!.birthYear;
        expect(age).toBeGreaterThanOrEqual(b.entry.memberAge.min);
        expect(life.relationships[id]!.kind).toBe('friend');
        expect(life.people[id]!.tags).toContain(`crew:${crew.defId}`);
      }
      const ties = crew.members.flatMap((x, i) => crew.members.slice(i + 1).map((y) => life.web.ties[[x, y].sort().join('|')])).filter(Boolean);
      expect(ties.length).toBeGreaterThan(0);
      ok(life);
    }
  });

  it('brings along the person who brought you in, and cannot be done twice', () => {
    const base = adult('brought');
    const friend = Object.keys(base.relationships).find((id) => base.relationships[id]!.kind === 'friend') ?? Object.keys(base.relationships)[0]!;
    const life = apply(base, (d) => void joinCrew(d, content, friend));
    expect(life.crime.crew!.members).toContain(friend);
    expect(joinBlock(life, content)).toBe('inCrew');
    expect(apply(life, (d) => void joinCrew(d, content)).crime.crew!.since).toBe(life.crime.crew!.since);
  });

  it('is not possible in prison', () => {
    const jailed = apply(adult('jail'), (d) => void (d.housing.kind = 'incarcerated'));
    expect(joinBlock(jailed, content)).toBe('away');
  });
});

describe('heat', () => {
  it('rises with jobs, falls each year, and falls faster after a quiet year and once you are out', () => {
    let life = inCrewLife('heat');
    const job = (size: keyof typeof b.jobs.sizes) => (l: LifeState) => apply(l, (d) => void applyEffects(d, [{ type: 'crime', action: 'job', size }], { def: content.events.job_parcel_run!, cast: {}, rng: d.rng, content }));
    life = job('solid')(life);
    expect(life.crime.heat).toBe(b.jobs.sizes.solid.heat);
    expect(life.crime.jobs.count).toBe(1);
    const busy = yearStep(apply(life, (d) => void (d.crime.heat = 60)));
    const quiet = yearStep(apply(life, (d) => void ((d.crime.heat = 60), (d.crime.jobs = { year: d.currentYear, count: 0, last: 0 }))));
    expect(busy.crime.heat).toBeLessThan(60);
    expect(quiet.crime.heat).toBeLessThan(busy.crime.heat);
    const former = apply(apply(life, (d) => void (d.crime.heat = 60)), (d) => void leaveCrew(d, 'left', content));
    expect(isFormer(former)).toBe(true);
    expect(yearStep(former).crime.heat).toBeLessThan(busy.crime.heat + 1);
    ok(busy);
  });

  it('is clamped to 0–100 and never carried past the limit by someone who is out', () => {
    const life = apply(inCrewLife('clamp'), (d) => void addHeat(d, 500));
    expect(life.crime.heat).toBe(100);
    expect(apply(life, (d) => void addHeat(d, -500)).crime.heat).toBe(0);
    const out = apply(life, (d) => void leaveCrew(d, 'left', content));
    expect(yearStep(out).crime.heat).toBeLessThanOrEqual(b.past.heatLimit);
  });

  it('feeds the legal system: more heat means better odds of an investigation and an arrest, and an open investigation, an informant, a record and probation add to the arrest odds', () => {
    const life = inCrewLife('odds');
    const at = (heat: number) => apply(life, (d) => void (d.crime.heat = heat));
    let lastI = -1;
    let lastA = -1;
    for (const heat of [0, 20, 40, 60, 80, 100]) {
      const l = at(heat);
      expect(investigationChance(l, content)).toBeGreaterThanOrEqual(lastI);
      expect(arrestChance(l, content)).toBeGreaterThanOrEqual(lastA);
      lastI = investigationChance(l, content);
      lastA = arrestChance(l, content);
    }
    expect(investigationChance(at(0), content)).toBe(0);
    expect(arrestChance(at(0), content)).toBe(0);
    const base = arrestChance(at(50), content);
    expect(arrestChance(apply(at(50), (d) => void (d.crime.investigation = { since: d.currentYear, until: d.currentYear + 2 })), content)).toBeGreaterThan(base);
    expect(investigationChance(apply(at(50), (d) => void (d.crime.investigation = { since: d.currentYear, until: d.currentYear + 2 })), content)).toBe(0);
    expect(arrestChance(apply(at(50), (d) => void (d.crime.crew!.informant = d.crime.crew!.members[0]!)), content)).toBeGreaterThan(base);
    expect(arrestChance(apply(at(50), (d) => void d.legal.record.push({ offenseId: 'theft', year: d.currentYear - 3, outcome: 'fine', amount: 100 })), content)).toBeGreaterThan(base);
    expect(arrestChance(apply(at(50), (d) => void (d.legal.probationUntil = d.currentYear + 1)), content)).toBeGreaterThan(base);
    expect(arrestChance(apply(at(100), (d) => void (d.housing.kind = 'incarcerated')), content)).toBe(0);
  });

  it('brings investigations and arrests over many years at high heat, and almost none at low heat', () => {
    const count = (heat: number) => {
      let arrests = 0;
      let opened = 0;
      for (let i = 0; i < 300; i++) {
        let life = inCrewLife(`years-${heat}-${i}`);
        for (let y = 0; y < 3; y++) {
          life = apply(life, (d) => {
            d.crime.heat = heat;
            d.crime.jobs = { year: d.currentYear, count: 1, last: 1 };
          });
          const next = yearStep(life);
          arrests += next.crime.totals.arrests - life.crime.totals.arrests;
          if (next.crime.investigation && !life.crime.investigation) opened++;
          life = next;
        }
      }
      return { arrests, opened };
    };
    const hot = count(80);
    const cold = count(5);
    expect(hot.arrests).toBeGreaterThan(cold.arrests * 5);
    expect(hot.opened).toBeGreaterThan(cold.opened);
    expect(cold.arrests).toBeLessThan(15);
  });
});

describe('the crew year', () => {
  it('queues the year’s jobs from the registry, each one a job event the rank allows', () => {
    const life = yearStep(inCrewLife('jobs'));
    const queued = life.scheduled.filter((s) => content.registries.crime.jobs.includes(s.eventId));
    expect(queued.length).toBeGreaterThanOrEqual(b.jobs.perYear[0]!.min);
    expect(queued.length).toBeLessThanOrEqual(b.jobs.maxQueued);
    for (const s of queued) {
      expect(s.dueYear).toBe(life.currentYear);
      expect(eventWeight(life, content.events[s.eventId]!, content)).toBeGreaterThan(0);
    }
    expect(life.crime.totals.years).toBe(1);
  });

  it('costs standing in a year with no job and a little in every year', () => {
    const life = apply(inCrewLife('standing'), (d) => void (d.crime.standing = 50));
    const idle = yearStep(life);
    expect(idle.crime.standing).toBe(50 - b.standing.slide - b.standing.idleLoss);
    const worked = yearStep(apply(life, (d) => void (d.crime.jobs = { year: d.currentYear, count: 2, last: 0 })));
    expect(worked.crime.standing).toBe(50 - b.standing.slide);
  });

  it('pushes you out when standing stays at the low line, and forgets you when you live far away', () => {
    let life = apply(inCrewLife('low'), (d) => void (d.crime.standing = 0));
    for (let i = 0; i < b.standing.lowYears; i++) life = yearStep(life);
    expect(life.scheduled.some((s) => content.registries.crime.triggers.pushedOut.events.includes(s.eventId))).toBe(true);
    let away = apply(inCrewLife('away'), (d) => void (d.character.cityId = Object.keys(content.cities).find((c) => c !== d.crime.crew!.cityId)!));
    for (let i = 0; i < b.standing.awayYears; i++) away = yearStep(away);
    expect(away.crime.crew).toBeNull();
    expect(away.crime.past.at(-1)!.how).toBe('drifted');
    ok(away);
  });

  it('lets an informant stop informing when the investigation ends, however it ends', () => {
    const informing = apply(inCrewLife('informant'), (d) => void ((d.crime.investigation = { since: d.currentYear, until: d.currentYear + 3 }), (d.crime.crew!.informant = d.crime.crew!.members[0]!)));
    ok(informing);
    const closed = apply(informing, (d) => void applyEffects(d, [{ type: 'crime', action: 'close' }], { def: content.events.informant_rumor!, cast: {}, rng: d.rng, content }));
    expect(closed.crime.investigation).toBeUndefined();
    expect(closed.crime.crew!.informant).toBeUndefined();
    ok(closed);
    const lapsed = yearStep(apply(informing, (d) => void ((d.crime.investigation = { since: d.currentYear - 3, until: d.currentYear }), (d.crime.heat = 0))));
    expect(lapsed.crime.investigation).toBeUndefined();
    expect(lapsed.crime.crew!.informant).toBeUndefined();
  });

  it('refills a crew whose people are gone, and names someone to run it while you do not', () => {
    const life = apply(inCrewLife('staff'), (d) => {
      for (const id of d.crime.crew!.members) {
        d.people[id]!.alive = false;
        d.people[id]!.deathYear = d.currentYear;
      }
      pruneWeb(d);
    });
    const next = yearStep(life);
    expect(next.crime.crew!.members.length).toBeGreaterThanOrEqual(b.entry.members.min);
    expect(next.crime.crew!.leader).toBeDefined();
    ok(next);
  });

  it('does very little in prison: heat falls, standing slips, and no jobs or events are queued', () => {
    const jailed = apply(apply(inCrewLife('prison'), (d) => void ((d.crime.heat = 50), (d.crime.standing = 60))), (d) => void (d.housing.kind = 'incarcerated'));
    const next = yearStep(jailed);
    expect(next.crime.heat).toBeLessThan(50);
    expect(next.crime.standing).toBe(60 - b.standing.idleLoss);
    expect(next.scheduled).toEqual(jailed.scheduled);
  });

  it('offers a promotion when standing and time at the rank reach it, and a rank is only ever 1 to 5', () => {
    let life = apply(inCrewLife('promote'), (d) => {
      d.crime.standing = 90;
      d.crime.rankSince = d.currentYear - 5;
    });
    let offered = false;
    for (let i = 0; i < 12 && !offered; i++) {
      life = apply(life, (d) => void ((d.crime.standing = 95), (d.crime.rankSince = d.currentYear - 5)));
      life = yearStep(life);
      offered = life.scheduled.some((s) => s.eventId === 'promotion_offered');
    }
    expect(offered).toBe(true);
    let l = inCrewLife('ranks');
    for (let i = 0; i < 8; i++) l = apply(l, (d) => void promote(d, content));
    expect(l.crime.rank).toBe(b.ranks.length);
    expect(l.crime.crew!.leader).toBeUndefined();
    expect(getCrimeView(l, content).nextTitle).toBeNull();
    for (let i = 0; i < 8; i++) l = apply(l, (d) => void demote(d, content));
    expect(l.crime.rank).toBe(1);
    expect(l.crime.peak).toBe(b.ranks.length);
    expect(l.crime.crew!.leader).toBeDefined();
    ok(l);
  });
});

describe('getting out', () => {
  it('keeps the people, the heat and a record of the crew, and lets the past find you', () => {
    const life = apply(inCrewLife('out'), (d) => void ((d.crime.heat = 40), promote(d, content)));
    const member = life.crime.crew!.members[0]!;
    const out = apply(life, (d) => void leaveCrew(d, 'left', content));
    expect(out.crime).toMatchObject({ crew: null, rank: 0, standing: 0, heat: 40 });
    expect(out.crime.past).toHaveLength(1);
    expect(out.crime.past[0]).toMatchObject({ topRank: 2, how: 'left' });
    expect(out.relationships[member]!.status).not.toBe('ended');
    expect(inCrew(out)).toBe(false);
    expect(evaluate({ crime: { former: true } }, out)).toBe(true);
    expect(evaluate({ crime: { member: false } }, out)).toBe(true);
    ok(out);
    let calls = 0;
    for (let i = 0; i < 200; i++) calls += yearStep(apply(out, (d) => void (d.rng = createRng(`past-${i}`)))).scheduled.filter((s) => content.registries.crime.triggers.past.events.includes(s.eventId)).length;
    expect(calls).toBeGreaterThan(0);
  });

  it('can be rejoined later, keeping the history', () => {
    const out = apply(inCrewLife('again'), (d) => void leaveCrew(d, 'pushed', content));
    const back = apply(out, (d) => void joinCrew(d, content));
    expect(back.crime.past).toHaveLength(1);
    expect(back.crime.crew).not.toBeNull();
  });
});

describe('dirty money', () => {
  it('is paid by jobs, scaled by rank and your city, and kept apart from savings and net worth', () => {
    const rank = (n: number) => apply(inCrewLife('pay'), (d) => void ((d.crime.rank = n), (d.crime.peak = n)));
    const rng = createRng('payout');
    const p1 = jobPayout(rank(1), 'solid', content, createRng('p'));
    const p5 = jobPayout(rank(5), 'solid', content, createRng('p'));
    expect(p5).toBeGreaterThan(p1 * 3);
    const rich = apply(rank(1), (d) => void (d.character.cityId = 'nyc'));
    const poor = apply(rank(1), (d) => void (d.character.cityId = 'small_town'));
    expect(jobPayout(rich, 'big', content, createRng('p'))).toBeGreaterThan(jobPayout(poor, 'big', content, createRng('p')));
    expect(rng).toBeDefined();
    const life = inCrewLife('apart');
    const before = netWorth(life);
    const paid = apply(life, (d) => void applyEffects(d, [{ type: 'dirtyMoney', gain: 'big' }], { def: content.events.job_parcel_run!, cast: {}, rng: d.rng, content }));
    expect(paid.finances.dirty).toBeGreaterThan(10_000);
    expect(paid.finances.savings).toBe(life.finances.savings);
    expect(netWorth(paid)).toBe(before);
    expect(paid.crime.totals.earned).toBe(paid.finances.dirty);
    ok(paid);
  });

  it('is paid out of, lost in shares, and never goes below zero', () => {
    const life = apply(inCrewLife('lose'), (d) => void (d.finances.dirty = 20_000));
    const run = (effect: Parameters<typeof applyEffects>[1]) => apply(life, (d) => void applyEffects(d, effect, { def: content.events.job_parcel_run!, cast: {}, rng: d.rng, content }));
    expect(run([{ type: 'dirtyMoney', lose: 0.25 }]).finances.dirty).toBe(15_000);
    expect(run([{ type: 'dirtyMoney', lose: 1 }]).finances.dirty).toBe(0);
    expect(run([{ type: 'dirtyMoney', pay: 'major' }]).finances.dirty).toBeGreaterThanOrEqual(0);
    expect(run([{ type: 'dirtyMoney', pay: 'petty' }]).finances.dirty).toBeLessThan(20_000);
    expect(run([{ type: 'dirtyMoney', lose: 0.5 }]).crime.totals.lost).toBe(10_000);
  });

  it('cannot be spent freely: spending adds heat by the amount, makes you happier, and cannot exceed what you hold', () => {
    const life = apply(inCrewLife('spend'), (d) => void ((d.finances.dirty = 30_000), (d.character.stats.happiness = 40)));
    expect(spendHeat(life, 1000, content)).toBeGreaterThan(0);
    expect(spendHeat(life, 20_000, content)).toBeGreaterThan(spendHeat(life, 2_000, content));
    expect(spendHeat(life, 3_000_000, content)).toBeLessThanOrEqual(b.dirty.spend.max);
    const spent = apply(life, (d) => void spendDirty(d, 10_000, content));
    expect(spent.finances.dirty).toBe(20_000);
    expect(spent.crime.heat).toBeGreaterThan(life.crime.heat);
    expect(spent.character.stats.happiness).toBeGreaterThan(40);
    expect(spent.finances.savings).toBe(life.finances.savings);
    expect(isLifeActionAvailable(life, 'spend_dirty', { amount: 30_001 }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'spend_dirty', { amount: 10 }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'spend_dirty', { amount: 10_000 }, content)).toBe(true);
    expect(isLifeActionAvailable(apply(life, (d) => void (d.housing.kind = 'incarcerated')), 'spend_dirty', { amount: 10_000 }, content)).toBe(false);
  });

  it('is laundered into savings for a fee: tiers open with rank, and a deposit can be flagged', () => {
    const base = apply(inCrewLife('launder'), (d) => void ((d.finances.dirty = 40_000), (d.finances.savings = 1_000)));
    expect(frontsFor(base, content).every((f) => f.tier === 1)).toBe(true);
    const boss = apply(base, (d) => void ((d.crime.rank = 3), (d.crime.peak = 3)));
    expect(frontsFor(boss, content).some((f) => f.tier === 3)).toBe(true);
    const front = frontsFor(base, content)[0]!;
    let cleaned = 0;
    let flagged = 0;
    for (let i = 0; i < 400; i++) {
      const l = apply(base, (d) => void (d.rng = createRng(`l${i}`)));
      const next = apply(l, (d) => void launder(d, front.id, 4_000, content));
      if (next.finances.savings > l.finances.savings) {
        cleaned++;
        expect(next.finances.savings - l.finances.savings).toBe(4_000 - Math.round(4_000 * b.dirty.laundering.tiers[0]!.fee));
        expect(next.finances.dirty).toBe(36_000);
      } else {
        flagged++;
        expect(next.finances.dirty).toBeGreaterThan(36_000 - 1);
        expect(next.crime.heat).toBeGreaterThanOrEqual(b.dirty.laundering.flaggedHeat);
      }
    }
    expect(flagged).toBeGreaterThan(0);
    expect(cleaned).toBeGreaterThan(flagged);
    const risk = (heat: number, amount: number) => launderRisk(apply(base, (d) => void (d.crime.heat = heat)), front.id, amount, content);
    expect(risk(80, 4_000)).toBeGreaterThan(risk(0, 4_000));
    expect(risk(0, front.capacity * 2)).toBeGreaterThan(risk(0, 1_000));
  });

  it('goes through the actions: validated, written to the input log, available only between years, and replayed exactly', () => {
    const base = apply(adult('act'), (d) => void ((d.finances.dirty = 9_000), (d.finances.savings = 500), (d.crime.totals.earned = 9_000)));
    const front = frontsFor(base, content)[0]!;
    const bad = [{}, { frontId: front.id }, { amount: 1000 }, { frontId: front.id, amount: -5 }, { frontId: front.id, amount: 1.5 }, { frontId: front.id, amount: '1000' }, { frontId: front.id, amount: 1000, extra: 1 }, { frontId: 'nope', amount: 1000 }, { frontId: front.id, amount: 99_999 }];
    for (const params of bad) expect(() => performAction(base, 'launder_money', params, content), JSON.stringify(params)).toThrow(InvalidInputError);
    const next = performAction(base, 'launder_money', { frontId: front.id, amount: 3_000 }, content);
    expect(next.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'launder_money', params: { frontId: front.id, amount: 3_000 } } });
    expect(next.finances.dirty + next.crime.totals.lost).toBeLessThan(9_001);
    const spent = performAction(next, 'spend_dirty', { amount: 1_000 }, content);
    expect(spent.finances.dirty).toBe(next.finances.dirty - 1_000);
    expect(() => performAction(apply(base, (d) => void (d.phase = 'events')), 'launder_money', { frontId: front.id, amount: 3_000 }, content)).toThrow();
    ok(spent);
  });
});

describe('events', () => {
  const withEvent = (life: LifeState, eventId: string, seed = 'cast'): LifeState =>
    apply(life, (d) => {
      const result = castEvent(d, content.events[eventId]!, createRng(seed), content);
      if (!result) throw new Error(`could not cast ${eventId}`);
      d.rng = createRng(`${seed}:play`);
      d.phase = 'events';
      d.pending = [{ instanceId: 'e1', eventId, cast: result.cast }];
    });

  it('show dirty money on the outcome card with the new balance, and only for the crime events that pay it', () => {
    const life = apply(inCrewLife('card'), (d) => void ((d.crime.rank = 2), (d.crime.peak = 2)));
    const pending = withEvent(life, 'job_parcel_run');
    const done = resolveChoice(pending, 'e1', 'deliver', content);
    const card = done.pending[0]!;
    if (done.finances.dirty > 0) expect(card.money?.dirty).toEqual({ change: done.finances.dirty, balance: done.finances.dirty });
    else expect(card.money?.dirty).toBeUndefined();
    const refused = resolveChoice(withEvent(life, 'job_parcel_run'), 'e1', 'refuse', content);
    expect(refused.pending[0]!.money?.dirty).toBeUndefined();
    expect(refused.crime.standing).toBeLessThan(life.crime.standing);
  });

  it('cast people from the crew, its boss and its informant, and meet the rival crew on the spot', () => {
    const life = apply(inCrewLife('cast'), (d) => void ((d.crime.rank = 2), (d.crime.peak = 2)));
    expect(crewPeople(life, 'yours').length).toBeGreaterThan(0);
    const r = castEvent(life, content.events.job_parcel_run!, createRng('x'), content)!;
    expect(crewPeople(life, 'yours')).toContain(r.cast.member);
    const informed = apply(life, (d) => void ((d.crime.crew!.informant = d.crime.crew!.members[0]!), (d.crime.investigation = { since: d.currentYear, until: d.currentYear + 2 })));
    const c = castEvent(informed, content.events.informant_rumor!, createRng('x'), content)!;
    expect(c.cast.suspect).toBe(informed.crime.crew!.informant);
    const rivalLife = apply(life, (d) => void (d.crime.rivalry = 60));
    const withRival = apply(rivalLife, (d) => {
      const cast = castEvent(d, content.events.rival_threat!, createRng('rv'), content);
      expect(cast).not.toBeNull();
      expect(d.crime.crew!.rivalMembers).toContain(cast!.cast.opponent);
      expect(d.people[cast!.cast.opponent!]!.tags).toContain(`crew:${d.crime.crew!.rival}`);
      uncast(d, cast!.created);
      expect(d.crime.crew!.rivalMembers).toEqual([]);
    });
    ok(withRival);
  });

  it('are only offered to an adult who is not in a crew, and in-crew events only to a member', () => {
    const outside = adult('offer');
    expect(eventWeight(outside, content.events.offer_through_a_friend!, content)).toBeGreaterThan(0);
    expect(eventWeight(inCrewLife('offer'), content.events.offer_through_a_friend!, content)).toBe(0);
    expect(eventWeight(lifeAtAge('offer-teen', 16), content.events.offer_through_a_friend!, content)).toBe(0);
    expect(eventWeight(outside, content.events.close_call_traffic_stop!, content)).toBe(0);
  });

  it('can be queued by the step for each trigger and are always followUpOnly', () => {
    const life = apply(inCrewLife('queue'), (d) => void ((d.crime.heat = 70), (d.crime.investigation = { since: d.currentYear, until: d.currentYear + 2 }), (d.crime.rivalry = 60)));
    const queued = apply(life, (d) => void ((d.scheduled = []), queueCrimeEvent(d, 'investigation', content), queueCrimeEvent(d, 'arrest', content), queueCrimeEvent(d, 'rival', content)));
    expect(queued.scheduled.map((s) => s.eventId).length).toBe(3);
    for (const id of [...content.registries.crime.jobs, ...Object.values(content.registries.crime.triggers).flatMap((t) => t.events)]) expect(content.events[id]!.followUpOnly, id).toBe(true);
  });
});

describe('a life in a crew', () => {
  it('lives out the years with every invariant holding, whatever the choices, and meets the crew’s events', () => {
    const met = new Set<string>();
    for (const seed of ['y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8', 'y9', 'y10', 'y11', 'y12']) {
      let life = inCrewLife(`years-${seed}`, 24);
      for (let year = 0; year < 30 && life.phase !== 'dead'; year++) {
        life = playYear(life, content);
        expect(checkInvariants(life, content), `${seed} age ${life.character.age}`).toEqual([]);
        for (const id of Object.keys(life.eventLog)) if (content.events[id]!.category.startsWith('crime')) met.add(id);
      }
    }
    expect(met.size).toBeGreaterThan(8);
  });
});

describe('what the screens see', () => {
  it('shows heat, standing and rank to the screens as bands, not numbers, and dirty money apart', () => {
    const life = apply(inCrewLife('view'), (d) => void ((d.crime.heat = 85), (d.finances.dirty = 12_000)));
    const view = getCrimeView(life, content);
    expect(view).toMatchObject({ member: true, heatBand: 4, rank: 1 });
    expect(view.rankTitle).toBe(content.crews[life.crime.crew!.defId]!.ranks[0]);
    expect(view.members.length).toBeGreaterThan(0);
    const dirty = getDirtyView(life, content);
    expect(dirty).toMatchObject({ balance: 12_000, show: true, canAct: true });
    expect(dirty.fronts.length).toBeGreaterThan(0);
    expect(getDirtyView(adult('nothing'), content).show).toBe(false);
    expect(getCrimeView(adult('nothing'), content).show).toBe(false);
  });
});
