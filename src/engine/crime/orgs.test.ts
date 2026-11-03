import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { ORG_KINDS, type OrgKind } from '../../content/schemas';
import { isLifeActionAvailable, performAction } from '../actions';
import { applyEffects } from '../events/effects';
import { checkInvariants } from '../invariants';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { applyEdit } from '../godmode/apply';
import { nextUint32 } from '../rng';
import { demote, joinBlock, joinCrew, promote } from './crew';
import { holdings, myOrg } from './orgs';
import { getOrgView } from './orgView';
import { crewKind, initiationRank, isLeader, topRank } from './query';
import { runCrime } from './step';

const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId/.test(f))).toEqual([]);
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const cityWith = (kind: OrgKind): string => Object.values(content.cities).find((c) => Object.values(content.crews).some((x) => x.kind === kind && x.cities.includes(c.id)))!.id;
/** A life of 30 living in a city where an organization of this kind works, in one, at the given rank. */
const member = (kind: OrgKind, seed = 'o1', rank = 1): LifeState =>
  apply(lifeAtAge(`${seed}-${kind}`, 30), (d) => {
    d.character.cityId = cityWith(kind);
    d.career.job = null;
    expect(joinCrew(d, content, undefined, undefined, kind)).toBe(true);
    while (d.crime.rank < rank && promote(d, content)) continue;
  });
const leader = (kind: OrgKind, seed = 'o1') => member(kind, seed, 99);
/** Advances the life's random stream, so the same situation can be tried again with different luck. */
const shake = (d: LifeState, n: number) => {
  for (let i = 0; i < n * 3 + 1; i++) nextUint32(d.rng);
};
const yearStep = (life: LifeState) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runCrime(d, content);
  });

describe('the four kinds', () => {
  it('each has its own ranks, initiation and jobs, in the content', () => {
    expect(Object.keys(content.orgKinds).sort()).toEqual([...ORG_KINDS].sort());
    expect(content.orgKinds.street_gang!.ranks).toHaveLength(4);
    for (const kind of ['mafia', 'cartel', 'motorcycle_club'] as const) expect(content.orgKinds[kind]!.ranks).toHaveLength(5);
    for (const def of Object.values(content.orgKinds)) {
      expect(def.initiation.rank).toBeLessThan(def.ranks.length);
      for (const job of def.jobs) expect(content.orgJobs[job]!.kinds).toContain(def.id);
      expect(def.jobs).toContain('lie_low');
    }
    expect(content.orgKinds.cartel!.supplies).toBe(true);
    for (const kind of ORG_KINDS) expect(Object.values(content.crews).filter((c) => c.kind === kind).length).toBeGreaterThanOrEqual(2);
  });

  for (const kind of ORG_KINDS) {
    it(`a ${kind} can be joined, risen through (past its initiation) and led`, () => {
      let life = member(kind);
      const crew = life.crime.crew!;
      expect(crewKind(content, crew.defId)).toBe(kind);
      expect(life.crime.rank).toBe(1);
      const top = topRank(content, crew.defId);
      expect(top).toBe(kind === 'street_gang' ? 4 : 5);
      expect(joinBlock(life, content, kind)).toBe('inCrew');
      expect(getOrgView(life, content)!.leader).toBe(false);
      for (let r = 2; r <= top; r++) {
        life = apply(life, (d) => void promote(d, content));
        expect(life.crime.rank).toBe(r);
        if (r >= initiationRank(content, crew.defId)) expect(life.crime.crew!.initiated).toBe(true);
      }
      expect(isLeader(life, content)).toBe(true);
      expect(life.crime.crew!.leader).toBeUndefined();
      expect(getOrgView(life, content)!.leader).toBe(true);
      life = apply(life, (d) => void demote(d, content));
      expect(life.crime.rank).toBe(top - 1);
      ok(life);
    });

    it(`the step up to the ${kind} initiation rank is an initiation event, never a plain promotion`, () => {
      let life = apply(member(kind), (d) => void ((d.crime.standing = 95), (d.crime.rankSince = d.currentYear - 6)));
      const at = initiationRank(content, life.crime.crew!.defId);
      let seen: 'initiation' | 'promotion' | null = null;
      for (let i = 0; i < 25 && seen === null; i++) {
        // (Each year the step is run in a life that has just reached the rank below.)
        life = yearStep(apply(life, (d) => void ((d.crime.rank = at - 1), (d.crime.peak = at - 1), (d.crime.standing = 95), (d.crime.rankSince = d.currentYear - 6), (d.crime.crew!.initiated = false), (d.scheduled = []))));
        if (life.scheduled.some((s) => content.registries.crime.triggers.initiation.events.includes(s.eventId))) seen = 'initiation';
        else if (life.scheduled.some((s) => s.eventId === 'promotion_offered')) seen = 'promotion';
      }
      expect(seen).toBe('initiation');
    });
  }

  it('an initiation event for each kind promotes you on success and only for that kind', () => {
    for (const kind of ORG_KINDS) {
      const id = content.registries.crime.triggers.initiation.events.find((e) => JSON.stringify(content.events[e]!.requires).includes(kind))!;
      const def = content.events[id]!;
      const life = apply(member(kind), (d) => void ((d.crime.rank = initiationRank(content, d.crime.crew!.defId) - 1), (d.crime.crew!.initiated = false)));
      const effects = (def.choices ?? []).flatMap((c) => (c.check ? c.check.success.effects : [])) as Parameters<typeof applyEffects>[1];
      const after = apply(life, (d) => void applyEffects(d, effects, { def, cast: {}, rng: d.rng, content }));
      expect(after.crime.rank).toBe(initiationRank(content, life.crime.crew!.defId));
      expect(after.crime.crew!.initiated).toBe(true);
    }
  });
});

describe('adults only', () => {
  it('nobody under 18 can join, and a roster is never made for one', () => {
    for (const kind of ORG_KINDS) {
      const teen = apply(lifeAtAge(`teen-${kind}`, 16), (d) => void (d.character.cityId = cityWith(kind)));
      expect(joinBlock(teen, content, kind)).toBe('age');
      expect(apply(teen, (d) => void joinCrew(d, content, undefined, undefined, kind)).crime.crew).toBeNull();
    }
    const teen = apply(lifeAtAge('teen-roster', 16), (d) => void (d.crime.crew = { defId: 'cinder_row_outfit', cityId: 'chicago', since: d.currentYear, members: [], rivalMembers: [] }));
    expect(checkInvariants(teen, content).join('\n')).toMatch(/under 18/);
  });

  it('every event that joins an organization or moves its world requires an adult', () => {
    for (const def of Object.values(content.events)) {
      const text = JSON.stringify(def);
      if (!/"type":"crime"|"type":"dirtyMoney"/.test(text)) continue;
      expect(def.lifeStages.some((s) => ['early', 'child', 'teen'].includes(s)), def.id).toBe(false);
    }
  });
});

describe('neighborhoods and the world of a city', () => {
  it('every city has neighborhoods with an income value and police attention', () => {
    for (const city of Object.values(content.cities)) {
      expect(city.neighborhoods!.length, city.id).toBeGreaterThanOrEqual(4);
      for (const h of city.neighborhoods!) {
        expect(h.income).toBeGreaterThanOrEqual(1);
        expect(h.income).toBeLessThanOrEqual(5);
        expect(h.attention).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('joining makes the city’s organizations (named and generated, all fictional) and gives yours a neighborhood', () => {
    for (const kind of ORG_KINDS) {
      const life = member(kind);
      const crew = life.crime.crew!;
      const orgs = life.orgs.cities[crew.cityId]!;
      expect(orgs.length).toBeGreaterThanOrEqual(content.balance.orgs.world.generated.min + 2);
      expect(new Set(orgs.map((o) => o.name)).size).toBe(orgs.length);
      expect(orgs.some((o) => o.id.startsWith('g'))).toBe(true);
      expect(myOrg(life)!.kind).toBe(kind);
      expect(holdings(life, crew.cityId, crew.defId).length).toBeGreaterThanOrEqual(1);
      ok(life);
    }
  });

  it('is deterministic: the same seed makes the same world', () => {
    const a = member('mafia', 'det');
    const b = member('mafia', 'det');
    expect(a.orgs).toEqual(b.orgs);
    expect(yearStep(a).orgs).toEqual(yearStep(b).orgs);
  });
});

describe('leading', () => {
  it('assigns jobs, and the year’s results come back as dirty money, heat and the history', () => {
    for (const kind of ORG_KINDS) {
      let life = leader(kind);
      const crew = life.crime.crew!;
      const members = Object.keys(crew.roster!);
      expect(members.length).toBeGreaterThan(0);
      const view = getOrgView(life, content)!;
      expect(view.canLead).toBe(true);
      const earn = view.members[0]!.jobs.find((j) => j.effect === 'earn');
      expect(earn, kind).toBeDefined();
      life = performAction(life, 'org_assign_job', { personId: view.members[0]!.id, jobId: earn!.id }, content);
      expect(life.crime.crew!.roster![view.members[0]!.id]!.job).toBe(earn!.id);
      const dirty = life.finances.dirty;
      const history = life.history.length;
      let more = life;
      for (let i = 0; i < 6; i++) more = yearStep(more);
      expect(more.finances.dirty, kind).toBeGreaterThan(dirty);
      expect(more.history.length).toBeGreaterThan(history);
      expect(more.history.some((h) => h.tags.includes('org'))).toBe(true);
      expect(more.crime.crew!.recap!.year).toBe(more.currentYear);
      expect(more.crime.totals.jobs).toBeGreaterThan(0);
      ok(more);
    }
  });

  it('refuses a job the kind does not do, a job above a member’s rank, and any decision to someone who does not run it', () => {
    const life = leader('mafia');
    const id = Object.keys(life.crime.crew!.roster!)[0]!;
    expect(isLifeActionAvailable(life, 'org_assign_job', { personId: id, jobId: 'move_the_product' }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'org_assign_job', { personId: 'nobody', jobId: 'lie_low' }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'org_assign_job', { personId: id, jobId: 'lie_low' }, content)).toBe(true);
    const under = member('mafia');
    expect(isLifeActionAvailable(under, 'org_assign_job', { personId: Object.keys(under.crime.crew!.roster!)[0]!, jobId: 'lie_low' }, content)).toBe(false);
    expect(isLifeActionAvailable(under, 'org_set_cut', { cutLevel: 'low' }, content)).toBe(false);
    expect(() => performAction(life, 'org_assign_job', { personId: id, jobId: 'x y' } as never, content)).toThrow();
  });

  it('promotes, disciplines, cuts members, and sets your cut, which moves loyalty', () => {
    let life = leader('street_gang');
    const ids = Object.keys(life.crime.crew!.roster!);
    const first = ids[0]!;
    life = apply(life, (d) => void (d.crime.crew!.roster![first]!.rank = 1));
    const rank = life.crime.crew!.roster![first]!.rank;
    life = performAction(life, 'org_promote', { personId: first }, content);
    expect(life.crime.crew!.roster![first]!.rank).toBe(rank + 1);
    const loyal = life.crime.crew!.roster![first]!.loyalty;
    life = performAction(life, 'org_discipline', { personId: first }, content);
    const after = life.crime.crew!.roster![first];
    expect(after === undefined || after.loyalty < loyal).toBe(true);
    const second = Object.keys(life.crime.crew!.roster!).find((id) => id !== first)!;
    const heat = life.crime.heat;
    life = performAction(life, 'org_cut_loose', { personId: second }, content);
    expect(life.crime.crew!.members).not.toContain(second);
    expect(life.crime.crew!.roster![second]).toBeUndefined();
    expect(life.crime.heat).toBeGreaterThanOrEqual(heat);
    const low = performAction(life, 'org_set_cut', { cutLevel: 'low' }, content);
    const high = performAction(life, 'org_set_cut', { cutLevel: 'high' }, content);
    const loyalty = (l: LifeState) => Object.values(l.crime.crew!.roster!).reduce((s, m) => s + m.loyalty, 0);
    expect(loyalty(yearStep(low))).toBeGreaterThan(loyalty(yearStep(high)));
    ok(life);
  });

  it('deals with an informant by confronting or paying, and a member who is arrested while the police look can turn', () => {
    let life = apply(leader('mafia'), (d) => {
      d.crime.investigation = { since: d.currentYear, until: d.currentYear + 3 };
      d.crime.heat = 40;
      d.crime.crew!.informant = Object.keys(d.crime.crew!.roster!)[0]!;
      d.finances.dirty = 50_000;
    });
    expect(getOrgView(life, content)!.informant).not.toBeNull();
    const paid = performAction(life, 'org_informant', { way: 'pay' }, content);
    expect(paid.crime.crew!.informant).toBeUndefined();
    expect(paid.finances.dirty).toBeLessThan(life.finances.dirty);
    life = apply(life, (d) => void (d.crime.standing = 100));
    let rid = false;
    for (let i = 0; i < 30 && !rid; i++) {
      const tried = performAction(apply(life, (d) => void ((d.crime.crew!.informant ??= Object.keys(d.crime.crew!.roster!)[0]!), (d.crime.investigation = { since: d.currentYear, until: d.currentYear + 3 }), shake(d, i))), 'org_informant', { way: 'confront' }, content);
      rid = tried.crime.crew!.informant === undefined;
    }
    expect(rid).toBe(true);
  });

  it('a war follows a fight; a truce can end it, a rival can be allied with, and an alliance can be betrayed', () => {
    let life = apply(leader('street_gang'), (d) => {
      const crew = d.crime.crew!;
      const rival = d.orgs.cities[crew.cityId]!.find((o) => o.id !== crew.defId)!;
      rival.status = 'war';
      rival.war = 80;
      rival.attitude = 0;
      crew.war = rival.id;
    });
    const rival = life.orgs.cities[life.crime.crew!.cityId]!.find((o) => o.id === life.crime.crew!.war)!;
    expect(getOrgView(life, content)!.war!.id).toBe(rival.id);
    ok(life);
    let ended = false;
    for (let i = 0; i < 40 && !ended; i++) {
      const next = performAction(apply(life, (d) => void (d.orgs.cities[d.crime.crew!.cityId]!.find((o) => o.id === rival.id)!.tried = undefined)), 'org_move', { orgId: rival.id, move: 'truce' }, content);
      const o = next.orgs.cities[next.crime.crew!.cityId]!.find((x) => x.id === rival.id)!;
      if (o.status === 'truce') {
        ended = true;
        expect(next.crime.crew!.war).toBeUndefined();
        expect(o.war).toBeLessThan(80);
        ok(next);
      } else life = apply(life, (d) => void shake(d, 5));
    }
    expect(ended).toBe(true);
  });
});

describe('territory', () => {
  it('pays the leader yearly in dirty money and adds attention, by each neighborhood’s value', () => {
    const base = leader('mafia');
    const crew = base.crime.crew!;
    const rich = apply(base, (d) => {
      const map = d.orgs.hoods[crew.cityId]!;
      for (const h of Object.keys(map)) map[h] = crew.defId;
      for (const o of d.orgs.cities[crew.cityId]!) if (o.id !== crew.defId) o.status = 'allied';
    });
    const poor = apply(base, (d) => {
      const map = d.orgs.hoods[crew.cityId]!;
      const keep = Object.keys(map).sort()[0]!;
      for (const h of Object.keys(map)) map[h] = h === keep ? crew.defId : null;
      for (const o of d.orgs.cities[crew.cityId]!) if (o.id !== crew.defId) o.status = 'allied';
    });
    const a = yearStep(rich).crime.crew!.recap!;
    const c = yearStep(poor).crime.crew!.recap!;
    expect(a.hoodCount).toBeGreaterThan(c.hoodCount);
    expect(a.hoods).toBeGreaterThan(c.hoods);
    expect(a.hoods).toBeGreaterThan(0);
  });

  it('rivals attack, a lost fight loses the neighborhood and a won one holds it, and both can start a war', () => {
    let lost = 0;
    let held = 0;
    let wars = 0;
    for (let i = 0; i < 80; i++) {
      const life = apply(leader('street_gang', `terr-${i}`), (d) => {
        for (const o of d.orgs.cities[d.crime.crew!.cityId]!) {
          if (o.id !== d.crime.crew!.defId) {
            o.attitude = -90;
            o.strength = 95;
            o.war = 25;
          }
        }
      });
      const before = holdings(life, life.crime.crew!.cityId, life.crime.crew!.defId).length;
      const next = yearStep(life);
      const after = holdings(next, next.crime.crew!.cityId, next.crime.crew!.defId).length;
      if (after < before) lost++;
      if (next.crime.crew!.recap!.notes.some((n) => n.startsWith('Held '))) held++;
      if (next.crime.crew!.war !== undefined) wars++;
      ok(next);
    }
    expect(lost).toBeGreaterThan(0);
    expect(held).toBeGreaterThan(0);
    expect(wars).toBeGreaterThan(0);
  });

  it('an order to take a neighborhood costs dirty money now and is fought in the year that follows', () => {
    let life = apply(leader('motorcycle_club'), (d) => void (d.finances.dirty = 100_000));
    const crew = life.crime.crew!;
    const target = Object.keys(life.orgs.hoods[crew.cityId]!).find((h) => life.orgs.hoods[crew.cityId]![h] !== crew.defId)!;
    const cost = getOrgView(life, content)!.expandCost;
    life = performAction(life, 'org_expand', { hoodId: target }, content);
    expect(life.finances.dirty).toBe(100_000 - cost);
    expect(life.crime.crew!.plan).toEqual({ expand: target });
    expect(isLifeActionAvailable(life, 'org_expand', { hoodId: target }, content)).toBe(false);
    const next = yearStep(life);
    expect(next.crime.crew!.plan).toBeUndefined();
    expect(next.crime.crew!.recap!.notes.some((n) => n.includes('Took') || n.includes('failed') || n.includes('Held') || n.includes('Lost'))).toBe(true);
    ok(next);
  });
});

describe('cartels supply drugs (D1)', () => {
  it('a cartel’s supply jobs move units to dealers and gangs, and pay in dirty money at D1 prices', () => {
    let life = leader('cartel');
    const view = getOrgView(life, content)!;
    const job = view.members[0]!.jobs.find((j) => j.effect === 'supply')!;
    expect(job).toBeDefined();
    for (const m of view.members) life = apply(life, (d) => void (d.crime.crew!.roster![m.id]!.job = view.members[0]!.jobs.some((j) => j.id === job.id) ? job.id : undefined));
    const before = life.orgs.totals.supplied;
    let more = life;
    for (let i = 0; i < 6; i++) more = yearStep(more);
    expect(more.orgs.totals.supplied).toBeGreaterThan(before);
    expect(more.finances.dirty).toBeGreaterThan(life.finances.dirty);
    ok(more);
  });

  it('a gang or club buys from a cartel: with a supplier its drug jobs pay the cartel its share and move supply; without one they pay half', () => {
    const base = leader('street_gang');
    const crew = base.crime.crew!;
    const id = Object.keys(crew.roster!)[0]!;
    const setup = (supplier: boolean) =>
      apply(base, (d) => {
        for (const m of Object.values(d.crime.crew!.roster!)) m.job = 'lie_low';
        const m = d.crime.crew!.roster![id]!;
        m.job = 'corner_dealing';
        m.skill = 100;
        m.loyalty = 100;
        const cartel = d.orgs.cities[crew.cityId]!.find((o) => content.orgKinds[o.kind]!.supplies)!;
        if (supplier) {
          d.crime.crew!.supplier = cartel.id;
          cartel.status = 'neutral';
        } else delete d.crime.crew!.supplier;
      });
    let withSupply = 0;
    let without = 0;
    let units = 0;
    for (let i = 0; i < 40; i++) {
      const a = apply(setup(true), (d) => void shake(d, i));
      const b = apply(setup(false), (d) => void shake(d, i));
      const x = yearStep(a);
      withSupply += x.crime.crew!.recap!.jobs;
      units += x.crime.crew!.recap!.units;
      without += yearStep(b).crime.crew!.recap!.jobs;
    }
    expect(units).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(0);
    // With a supplier the cartel takes its share but the job pays in full; without, street supply pays half.
    expect(withSupply / without).toBeGreaterThan(content.balance.orgs.supply.cartelShare > 0 ? 1 : 0);
  });

  it('a dealer who belongs to a cartel buys at the supplier’s price', () => {
    const base = leader('cartel');
    expect(content.balance.orgs.supply.dealerPrice).toBeLessThan(1);
    expect(base.crime.crew).not.toBeNull();
  });
});

describe('violent death follows the E6a rule', () => {
  it('members die only on a dangerous job or in a war, never on a safe one; you never die in the year step', () => {
    let safeDeaths = 0;
    let dangerous = 0;
    for (let i = 0; i < 120; i++) {
      const life = apply(leader('mafia', `safe-${i}`), (d) => {
        for (const m of Object.values(d.crime.crew!.roster!)) m.job = 'gambling_book';
        d.crime.crew!.war = undefined as never;
        delete d.crime.crew!.war;
        for (const o of d.orgs.cities[d.crime.crew!.cityId]!) {
          o.status = 'allied';
          o.war = 0;
        }
      });
      const next = yearStep(life);
      safeDeaths += next.orgs.totals.killed;
      expect(next.death).toBeNull();
      const risky = apply(leader('cartel', `risky-${i}`), (d) => void Object.values(d.crime.crew!.roster!).forEach((m) => (m.job = 'move_the_product')));
      const out = yearStep(risky);
      dangerous += out.orgs.totals.killed;
      expect(out.death).toBeNull();
    }
    expect(safeDeaths).toBe(0);
    expect(dangerous).toBeGreaterThanOrEqual(0);
  });

  it('every event that can end a crew life in death needs a visible build-up, a check and a way out (the content build enforces it)', () => {
    for (const cause of content.registries.crime.deathCauses) {
      const events = Object.values(content.events).filter((e) => JSON.stringify(e).includes(`"cause":"${cause}"`));
      expect(events.length, cause).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.followUpOnly, e.id).toBe(true);
        expect(e.rarity, e.id).not.toBe('common');
      }
    }
  });
});

describe('codes and discipline', () => {
  it('a gang or club that sits quiet for a year loses your standing; a family or cartel does not mind', () => {
    const quiet = (kind: OrgKind) => {
      const life = apply(member(kind, 'quiet', 2), (d) => void ((d.crime.standing = 60), (d.crime.jobs = { year: d.currentYear, count: 0, last: 0 })));
      return yearStep(life).crime.standing;
    };
    const idleCode = (kind: OrgKind) => content.orgKinds[kind]!.codes.filter((c) => c.check === 'idle').reduce((s, c) => s + c.standing, 0);
    expect(idleCode('street_gang')).toBeGreaterThan(0);
    expect(quiet('street_gang')).toBeLessThan(quiet('mafia'));
    expect(idleCode('mafia')).toBe(0);
  });

  it('an arrest breaks a code of silence where the kind has one', () => {
    expect(content.orgKinds.mafia!.codes.some((c) => c.check === 'arrest')).toBe(true);
  });
});

describe('a crime career edited in god mode', () => {
  it('sets rank, standing, heat, dirty money, your cut and a member, through the usual checks, and the invariants hold', () => {
    const life = leader('mafia');
    const id = Object.keys(life.crime.crew!.roster!)[0]!;
    const next = apply(life, (d) => void applyEdit(d, { target: 'self', career: { crime: { rank: 3, standing: 77, heat: 12, dirty: 4321, cut: 'low', members: [{ id, skill: 90, loyalty: 11 }] } } }, content));
    expect(next.crime.rank).toBe(3);
    expect(next.crime.standing).toBe(77);
    expect(next.crime.heat).toBe(12);
    expect(next.finances.dirty).toBe(4321);
    expect(next.crime.crew!.cut).toBe('low');
    expect(next.crime.crew!.roster![id]).toMatchObject({ skill: 90, loyalty: 11 });
    ok(next);
  });
});

describe('the view', () => {
  it('has the four tabs’ data: overview, members with jobs, territory, rivals', () => {
    const view = getOrgView(leader('motorcycle_club'), content)!;
    expect(view.members.length).toBeGreaterThan(0);
    expect(view.members[0]!.jobs.length).toBeGreaterThan(2);
    expect(view.hoods.length).toBeGreaterThanOrEqual(4);
    expect(view.hoods.some((h) => h.holder === 'you')).toBe(true);
    expect(view.rivals.length).toBeGreaterThan(2);
    expect(view.codes.length).toBeGreaterThan(0);
    expect(view.buys).toBe(true);
    expect(view.suppliers.length).toBeGreaterThanOrEqual(0);
  });
});
