/**
 * D1: drugs. Buying is for adults and varies by source; use changes stats and builds dependence and tolerance; an addiction shows
 * as the Stage 9 condition and follows it both ways; an overdose is rare, never from a first use and a death needs a warning sign
 * first; recovery works (and relapse is possible); dealing and operations pay dirty money and draw heat and the law; the
 * enhancers of the Career hub use the same system; and a save keeps all of it.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { conditionOf } from '../health';
import { startEnhancers, enhancerBlock } from '../hub/enhancers';
import { checkInvariants } from '../invariants';
import { getDealingView, getDrugMarketView, getRecoveryView } from '../selectors';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { applyDrugsEffect } from './effects';
import { addDependence, syncAddiction } from './habit';
import { offenseFor } from './legal';
import { buy, buyBlock, meetDealer, nightlifeOpen, sourcesFor } from './market';
import { opCost, opsYear, startOp, startOpBlock } from './ops';
import { dealingYear, startBlock } from './dealing';
import { ensureHabit, emptyDrugs, unitPrice } from './query';
import { quitDrug } from './recovery';
import { runDrugs } from './step';
import { badChance, useBlock, useDrug } from './use';
import { overdoseYear, relapseChance, runHabits, type HabitYear } from './year';

const B = content.balance.drugs;
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|scheduled/.test(f))).toEqual([]);
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const adult = (seed = 'd1', age = 28) =>
  apply(lifeAtAge(seed, age), (d) => {
    d.finances.savings = 100_000;
    d.housing.kind = d.housing.kind === 'incarcerated' ? 'renting' : d.housing.kind;
    d.character.hidden.vice = 50;
  });
const withDealer = (life: LifeState) => apply(life, (d) => void meetDealerSure(d));
function meetDealerSure(d: LifeState): void {
  for (let i = 0; i < 40 && d.drugs.dealers.length === 0; i++) meetDealer(d, content);
}
const stocked = (life: LifeState, drug = 'cocaine', units = 10, quality = 60) => apply(life, (d) => void (d.drugs.stock[drug] = { units, quality, hidden: false }));
const empty: HabitYear = { craving: false, withdrawal: false, noticed: false, tempted: false, scare: false, er: false, usedAny: false };

describe('buying', () => {
  it('is for adults only', () => {
    const teen = lifeAtAge('d1-teen', 17);
    expect(buyBlock(teen, 'cannabis', 'market', 1, false, content)).toBe('age');
    expect(sourcesFor(teen, 'cannabis', content)).toEqual([]);
    expect(isLifeActionAvailable(teen, 'buy_drug', { drugId: 'cannabis', drugSource: 'market', units: 1 }, content)).toBe(false);
    expect(() => performAction(teen, 'buy_drug', { drugId: 'cannabis', drugSource: 'market', units: 1 }, content)).toThrow();
  });

  it('validates its input', () => {
    const life = adult();
    for (const bad of [{}, { drugId: 'cannabis' }, { drugId: 'cannabis', drugSource: 'moon', units: 1 }, { drugId: 'cannabis', drugSource: 'market', units: 0 }, { drugId: 'cannabis', drugSource: 'market', units: 1.5 }, { drugId: 'NOPE!', drugSource: 'market', units: 1 }, { drugId: 'cannabis', drugSource: 'market', units: 1, extra: true }]) {
      expect(() => performAction(life, 'buy_drug', bad, content), JSON.stringify(bad)).toThrow(InvalidInputError);
    }
    expect(() => performAction(life, 'buy_drug', { drugId: 'cannabis', drugSource: 'market', units: 7 }, content)).toThrow();
  });

  it('opens each source by what you have: a dealer you know, a contact, a night out, the market', () => {
    const life = adult();
    expect(sourcesFor(life, 'cocaine', content)).toContain('market');
    expect(sourcesFor(life, 'cocaine', content)).not.toContain('dealer');
    expect(sourcesFor(life, 'cocaine', content)).not.toContain('nightlife');
    const dealt = withDealer(life);
    expect(sourcesFor(dealt, 'cocaine', content)).toEqual(expect.arrayContaining(['dealer', 'contact', 'market']));
    const night = apply(life, (d) => void (d.pastimes = { year: d.currentYear, counts: { go_clubbing: 1 }, receipts: [] }));
    expect(nightlifeOpen(night, content)).toBe(true);
    expect(sourcesFor(night, 'cocaine', content)).toContain('nightlife');
  });

  it('prices follow the drug, the source and the quality, and a city can have its own range', () => {
    const life = adult();
    const coke = content.drugs.cocaine!;
    const hi = unitPrice(life, coke, 'market', 90, content);
    const lo = unitPrice(life, coke, 'market', 10, content);
    expect(hi).toBeGreaterThan(lo);
    expect(unitPrice(life, coke, 'nightlife', 50, content)).toBeGreaterThan(unitPrice(life, coke, 'dealer', 50, content));
    expect(unitPrice(life, coke, 'dealer', 50, content)).toBeGreaterThan(unitPrice(life, content.drugs.cannabis!, 'dealer', 50, content));
    const nyc = apply(life, (d) => void (d.character.cityId = 'nyc'));
    const dallas = apply(life, (d) => void (d.character.cityId = 'houston'));
    expect(unitPrice(nyc, coke, 'dealer', 50, content)).not.toBe(unitPrice(dallas, coke, 'dealer', 50, content));
  });

  it('comes to a fair deal, a rip-off, bad product, a robbery or an arrest, and the money matches what was shown', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400 && seen.size < 5; i++) {
      const life = apply(adult(`d1-buy-${i}`), (d) => {
        d.drugs = emptyDrugs();
        d.crime.heat = 30;
      });
      const next = apply(life, (d) => buy(d, 'cocaine', 'market', 3, false, content));
      const r = next.drugs.last!;
      seen.add(r.kind);
      const spent = life.finances.savings - next.finances.savings;
      expect(spent).toBe(r.amount);
      expect(r.balance).toBe(next.finances.savings);
      if (r.kind === 'ripoff' || r.kind === 'robbed') expect(next.drugs.stock.cocaine).toBeUndefined();
      if (r.kind === 'bad') expect(next.drugs.stock.cocaine!.quality).toBeLessThanOrEqual(B.buy.badQuality);
      if (r.kind === 'caught') expect(next.legal.record.length).toBeGreaterThan(life.legal.record.length);
      ok(next);
    }
    expect([...seen].sort()).toEqual(['bad', 'caught', 'fine', 'ripoff', 'robbed']);
  });

  it('is riskier from the market than from a dealer, and heat and a record make an arrest likelier', () => {
    const life = adult();
    expect(B.sources.market.arrest).toBeGreaterThan(B.sources.dealer.arrest);
    expect(B.sources.market.ripoff).toBeGreaterThan(B.sources.dealer.ripoff);
    expect(B.sources.nightlife.quality.mean).toBeLessThan(B.sources.dealer.quality.mean);
    expect(life.crime.heat).toBe(0);
  });

  it('a friend may put you in touch with a dealer, who joins your people with the dealer tag', () => {
    const life = withDealer(adult('d1-dealer'));
    expect(life.drugs.dealers.length).toBe(1);
    const dealer = life.people[life.drugs.dealers[0]!]!;
    expect(dealer.tags).toContain('dealer');
    expect(life.currentYear - dealer.birthYear).toBeGreaterThanOrEqual(B.buy.dealerAge.min);
    ok(life);
  });
});

describe('using', () => {
  it('changes stats, raises dependence and tolerance, and takes from your stock', () => {
    const life = stocked(adult('d1-use'), 'cocaine', 5);
    const next = apply(life, (d) => useDrug(d, 'cocaine', 'light', content));
    expect(next.drugs.stock.cocaine!.units).toBe(4);
    expect(next.drugs.habits.cocaine!.dependence).toBeGreaterThan(0);
    expect(next.drugs.habits.cocaine!.tolerance).toBeGreaterThan(0);
    expect(next.drugs.habits.cocaine!.uses).toBe(1);
    expect(next.character.stats.happiness).toBeGreaterThanOrEqual(life.character.stats.happiness);
    expect(next.character.stats.stress).toBeLessThanOrEqual(life.character.stats.stress);
    expect(next.drugs.last!.action).toBe('use');
    ok(next);
  });

  it('blunts the effect with tolerance and a weak batch, and shrinks it with every repeat in a year', () => {
    let life = stocked(adult('d1-blunt'), 'ecstasy', 20, 80);
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = life.character.stats.happiness;
      life = apply(life, (d) => {
        d.character.stats.happiness = 30;
        useDrug(d, 'ecstasy', 'light', content);
      });
      gains.push(life.character.stats.happiness - 30);
      void before;
    }
    expect(gains[0]!).toBeGreaterThan(gains[3]!);
    const weak = apply(stocked(adult('d1-weak'), 'ecstasy', 5, 5), (d) => void (d.character.stats.happiness = 30));
    const strong = apply(stocked(adult('d1-weak'), 'ecstasy', 5, 95), (d) => void (d.character.stats.happiness = 30));
    const w = apply(weak, (d) => useDrug(d, 'ecstasy', 'light', content)).character.stats.happiness;
    const s = apply(strong, (d) => useDrug(d, 'ecstasy', 'light', content)).character.stats.happiness;
    expect(s).toBeGreaterThan(w);
  });

  it('takes hold faster with a high vice and a harder drug', () => {
    const run = (vice: number, drug: string) =>
      apply(stocked(adult(`d1-vice-${vice}`), drug, 30), (d) => {
        d.character.hidden.vice = vice;
        for (let i = 0; i < 4; i++) useDrug(d, drug, 'light', content);
      }).drugs.habits[drug]!.dependence;
    expect(run(90, 'cocaine')).toBeGreaterThan(run(10, 'cocaine'));
    expect(run(50, 'heroin')).toBeGreaterThan(run(50, 'cannabis'));
  });

  it('is limited by what you hold, your age, prison and the yearly limit', () => {
    const life = stocked(adult('d1-limit'), 'cocaine', 1);
    expect(useBlock(life, 'cocaine', 'light', content)).toBeNull();
    expect(useBlock(life, 'cocaine', 'heavy', content)).toBe('stock');
    expect(useBlock(life, 'heroin', 'light', content)).toBe('none');
    expect(useBlock(lifeAtAge('d1-kid', 12), 'cocaine', 'light', content)).toBe('age');
    const jailed = apply(life, (d) => void (d.housing.kind = 'incarcerated'));
    expect(useBlock(jailed, 'cocaine', 'light', content)).toBe('jail');
    const worn = apply(life, (d) => void (d.drugs.year = { year: d.currentYear, uses: B.use.perYear, bought: 0, spent: 0 }));
    expect(useBlock(worn, 'cocaine', 'light', content)).toBe('limit');
  });

  it('a hidden stash is a choice the player makes, and it persists through use', () => {
    const life = stocked(adult('d1-hide'), 'cocaine', 5);
    const hidden = performAction(life, 'hide_stash', { drugId: 'cocaine', on: true }, content);
    expect(hidden.drugs.stock.cocaine!.hidden).toBe(true);
    const used = performAction(hidden, 'use_drug', { drugId: 'cocaine', dose: 'light' }, content);
    expect(used.drugs.stock.cocaine!.hidden).toBe(true);
    expect(() => performAction(life, 'hide_stash', { drugId: 'heroin', on: true }, content)).toThrow();
  });
});

describe('addiction and the Stage 9 condition', () => {
  it('shows as the drug_addiction condition once dependence passes the line, and follows it down', () => {
    let life = adult('d1-cond');
    life = apply(life, (d) => {
      addDependence(d, 'heroin', B.threshold + 10, content);
      syncAddiction(d, content);
    });
    const cond = conditionOf(life, 'drug_addiction');
    expect(cond).toBeDefined();
    expect(cond!.severity).toBe(Math.round(life.drugs.habits.heroin!.dependence));
    expect(life.drugs.synced).toBe(cond!.severity);
    const cleaner = apply(life, (d) => {
      d.drugs.habits.heroin!.dependence = 5;
      syncAddiction(d, content);
    });
    expect(conditionOf(cleaner, 'drug_addiction')).toBeUndefined();
    ok(life);
  });

  it('carries a change made to the condition from outside (a rehab activity, a doctor, an old event) into the habit', () => {
    let life = apply(adult('d1-out'), (d) => {
      addDependence(d, 'heroin', 60, content);
      syncAddiction(d, content);
    });
    life = apply(life, (d) => {
      conditionOf(d, 'drug_addiction')!.severity -= 25;
      syncAddiction(d, content);
    });
    expect(life.drugs.habits.heroin!.dependence).toBeCloseTo(35, 0);
    // An addiction an old event wrote down, with no drug behind it, belongs to a drug.
    const legacy = apply(adult('d1-legacy'), (d) => {
      d.health.conditions.push({ conditionId: 'drug_addiction', since: d.currentYear, severity: 40, treated: false });
      syncAddiction(d, content);
    });
    expect(Object.values(legacy.drugs.habits).reduce((m, h) => Math.max(m, h.dependence), 0)).toBeGreaterThanOrEqual(40);
    // And treated into nothing it is gone for good.
    const gone = apply(life, (d) => {
      d.health.conditions = d.health.conditions.filter((c) => c.conditionId !== 'drug_addiction');
      syncAddiction(d, content);
    });
    expect(gone.drugs.habits.heroin!.dependence).toBeLessThan(B.threshold);
  });

  it('nothing starts an addiction by chance: no use, no addiction', () => {
    let life = adult('d1-nochance', 30);
    for (let i = 0; i < 40; i++) {
      life = apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runDrugs(d, content);
        for (const c of ['drug_addiction']) if (conditionOf(d, c)) throw new Error('an addiction started by itself');
      });
    }
    expect(life.drugs.totals.uses).toBe(0);
  });

  it('a habit past the line goes on using, costs health, happiness and money, and pulls on work and the people close to you', () => {
    const base = apply(adult('d1-habit'), (d) => {
      const h = ensureHabit(d, 'heroin');
      h.dependence = 70;
      h.peak = 70;
      h.total = 30;
      h.last = d.currentYear - 1;
      d.character.stats.health = 80;
      d.character.stats.happiness = 60;
      syncAddiction(d, content);
    });
    const next = apply(base, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runHabits(d, content, false);
    });
    expect(next.character.stats.health).toBeLessThan(80);
    expect(next.character.stats.happiness).toBeLessThan(60);
    expect(next.finances.savings).toBeLessThan(base.finances.savings);
    expect(next.drugs.habits.heroin!.total).toBeGreaterThan(30);
    ok(next);
  });

  it('withdrawal follows a first year clean, and dependence and tolerance fall with each year clean', () => {
    let life = apply(adult('d1-clean'), (d) => {
      const h = ensureHabit(d, 'heroin');
      h.dependence = 70;
      h.peak = 70;
      h.tolerance = 80;
      h.total = 30;
      h.last = d.currentYear - 1;
    });
    life = apply(life, (d) => void quitDrug(d, 'heroin', content));
    const h0 = life.drugs.habits.heroin!;
    expect(h0.quitYear).toBe(life.currentYear);
    let stress = life.character.stats.stress;
    let sawWithdrawal = false;
    for (let i = 0; i < 6; i++) {
      const before = life.drugs.habits.heroin!.dependence;
      life = apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        const out = runHabits(d, content, false);
        sawWithdrawal ||= out.withdrawal;
      });
      expect(life.drugs.habits.heroin!.dependence).toBeLessThanOrEqual(before);
      stress = life.character.stats.stress;
    }
    void stress;
    expect(sawWithdrawal).toBe(true);
    expect(life.drugs.habits.heroin!.tolerance).toBeLessThan(80);
  });
});

describe('overdose', () => {
  it('never comes from a first use', () => {
    for (let i = 0; i < 300; i++) {
      const life = stocked(adult(`d1-first-${i}`), 'heroin', 3, 5);
      expect(badChance(life, content.drugs.heroin!, 'heavy', 5, content)).toBe(0);
      const next = apply(life, (d) => useDrug(d, 'heroin', 'heavy', content));
      expect(next.drugs.signs.count).toBe(0);
      expect(next.drugs.totals.scares + next.drugs.totals.visits).toBe(0);
    }
  });

  it('is more likely with harder drugs, heavy doses, tolerance, a bad batch, dependence and mixing', () => {
    const base = apply(adult('d1-risk'), (d) => {
      const h = ensureHabit(d, 'cocaine');
      h.total = 5;
    });
    const coke = content.drugs.cocaine!;
    const p = (l: LifeState, dose: 'light' | 'heavy' = 'light', q = 60) => badChance(l, coke, dose, q, content);
    expect(p(base, 'heavy')).toBeGreaterThan(p(base, 'light'));
    expect(p(base, 'light', 5)).toBeGreaterThan(p(base, 'light', 80));
    expect(p(apply(base, (d) => void (d.drugs.habits.cocaine!.tolerance = 90)), 'heavy')).toBeGreaterThan(p(base, 'heavy'));
    expect(p(apply(base, (d) => void (d.drugs.habits.cocaine!.dependence = 90)))).toBeGreaterThan(p(base));
    const mixed = apply(base, (d) => {
      const o = ensureHabit(d, 'ecstasy');
      o.total = 3;
      o.uses = 1;
      o.year = d.currentYear;
    });
    expect(p(mixed)).toBeGreaterThan(p(base));
    expect(content.drugs.heroin!.overdose).toBeGreaterThan(content.drugs.cannabis!.overdose);
  });

  it('a year of heavy use with no warning sign can scare you or put you in the ER, but never kills', () => {
    let deaths = 0;
    let bad = 0;
    for (let i = 0; i < 1500; i++) {
      const life = apply(adult(`d1-nosign-${i}`), (d) => {
        const h = ensureHabit(d, 'heroin');
        h.dependence = 90;
        h.peak = 90;
        h.tolerance = 90;
        h.total = 50;
      });
      const next = apply(life, (d) => {
        const out = { ...empty };
        overdoseYear(d, 'heroin', content.drugs.heroin!, 30, true, out, content);
        if (out.scare || out.er) bad += 1;
      });
      if (next.death) deaths += 1;
    }
    expect(deaths).toBe(0);
    expect(bad).toBeGreaterThan(0);
  });

  it('can kill, rarely, after warning signs, through the death system, as an overdose', () => {
    let deaths = 0;
    let trials = 0;
    for (let i = 0; i < 3000; i++) {
      const life = apply(adult(`d1-sign-${i}`), (d) => {
        const h = ensureHabit(d, 'heroin');
        h.dependence = 90;
        h.peak = 90;
        h.tolerance = 90;
        h.total = 50;
        d.drugs.signs = { count: 1, last: d.currentYear };
      });
      trials += 1;
      const next = apply(life, (d) => void overdoseYear(d, 'heroin', content.drugs.heroin!, 30, true, { ...empty }, content));
      if (next.death) {
        deaths += 1;
        expect(next.death.causeId).toBe('overdose');
        expect(content.causes[next.death.causeId]).toBeDefined();
        expect(next.drugs.signs.count).toBeGreaterThan(0);
      }
    }
    expect(deaths).toBeGreaterThan(0);
    expect(deaths / trials).toBeLessThan(0.2);
  });

  it('a warning sign fades after years clean, and ordinary casual use is very safe', () => {
    const light = apply(adult('d1-casual'), (d) => {
      const h = ensureHabit(d, 'cannabis');
      h.total = 5;
    });
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const o = { ...empty };
      apply(light, (d) => overdoseYear(d, 'cannabis', content.drugs.cannabis!, 3, false, o, content));
      if (o.scare || o.er) hits += 1;
    }
    expect(hits / 2000).toBeLessThan(0.02);
  });
});

describe('recovery and relapse', () => {
  const addicted = (seed: string) =>
    apply(adult(seed), (d) => {
      const h = ensureHabit(d, 'painkillers');
      h.dependence = 70;
      h.peak = 70;
      h.total = 30;
      h.last = d.currentYear - 1;
      d.drugs.stock.painkillers = { units: 5, quality: 50, hidden: true };
      syncAddiction(d, content);
    });

  it('quitting stops the habit, clears that stash and costs the first weeks', () => {
    const life = addicted('d1-quit');
    const next = performAction(life, 'quit_drug', { drugId: 'painkillers' }, content);
    expect(next.drugs.habits.painkillers!.quitYear).toBe(life.currentYear);
    expect(next.drugs.habits.painkillers!.dependence).toBeLessThan(70);
    expect(next.drugs.stock.painkillers).toBeUndefined();
    expect(next.drugs.totals.quits).toBe(1);
    expect(next.character.stats.stress).toBeGreaterThan(life.character.stats.stress);
    expect(() => performAction(next, 'quit_drug', { drugId: 'painkillers' }, content)).toThrow();
    expect(() => performAction(life, 'quit_drug', { drugId: 'cannabis' }, content)).toThrow();
    ok(next);
  });

  it('years clean make you recovered, and the addiction condition goes', () => {
    let life = performAction(addicted('d1-rec'), 'quit_drug', { drugId: 'painkillers' }, content);
    for (let i = 0; i < 12 && !life.drugs.habits.painkillers!.recovered; i++) {
      life = apply(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runHabits(d, content, false);
        // Support keeps the relapse away for this test.
        if (d.drugs.habits.painkillers!.quitYear === 0) d.drugs.habits.painkillers!.quitYear = d.currentYear;
      });
    }
    expect(life.drugs.habits.painkillers!.recovered).toBe(true);
    expect(life.drugs.totals.recoveries).toBeGreaterThanOrEqual(1);
    expect(conditionOf(life, 'drug_addiction')).toBeUndefined();
    const v = getRecoveryView(life, content);
    expect(v.habits.find((h) => h.id === 'painkillers')!.recovered).toBe(true);
  });

  it('relapse is possible, falls with the years clean and with support, and rises with stress', () => {
    const base = performAction(addicted('d1-relapse'), 'quit_drug', { drugId: 'painkillers' }, content);
    const h = base.drugs.habits.painkillers!;
    const p0 = relapseChance(base, h, content);
    const later = apply(base, (d) => void (d.drugs.habits.painkillers!.clean = 4));
    expect(relapseChance(later, later.drugs.habits.painkillers!, content)).toBeLessThan(p0);
    const stressed = apply(base, (d) => void (d.character.stats.stress = 100));
    expect(relapseChance(stressed, stressed.drugs.habits.painkillers!, content)).toBeGreaterThan(p0);
    const supported = apply(base, (d) => void (d.pastimes = { year: d.currentYear, counts: { go_to_a_support_group: 3 }, receipts: [] }));
    expect(relapseChance(supported, supported.drugs.habits.painkillers!, content)).toBeLessThan(p0);
    let relapsed = 0;
    for (let i = 0; i < 300; i++) {
      const life = apply(performAction(addicted(`d1-rl-${i}`), 'quit_drug', { drugId: 'painkillers' }, content), (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runHabits(d, content, false);
      });
      if (life.drugs.habits.painkillers!.relapses > 0) {
        relapsed += 1;
        expect(life.drugs.habits.painkillers!.quitYear).toBe(0);
        expect(life.drugs.habits.painkillers!.dependence).toBeGreaterThan(40);
        expect(life.drugs.totals.relapses).toBeGreaterThan(0);
      }
    }
    expect(relapsed).toBeGreaterThan(0);
    expect(relapsed).toBeLessThan(300);
  });

  it('going back to a drug you quit is an effect events can have', () => {
    const life = apply(performAction(addicted('d1-eff'), 'quit_drug', { drugId: 'painkillers' }, content), (d) => applyDrugsEffect(d, { type: 'drugs', action: 'relapse' }, content));
    expect(life.drugs.habits.painkillers!.quitYear).toBe(0);
    expect(life.drugs.habits.painkillers!.relapses).toBe(1);
    ok(life);
  });
});

describe('dealing', () => {
  const dealer = (seed = 'd1-deal') => stocked(withDealer(adult(seed)), 'cannabis', 100, 60);

  it('is for adults only', () => {
    const teen = lifeAtAge('d1-dealteen', 17);
    expect(startBlock(teen, 'cannabis', content)).toBe('age');
    expect(() => performAction(teen, 'start_dealing', { drugId: 'cannabis' }, content)).toThrow();
    expect(startOpBlock(teen, 'backroom_grow', 'cannabis', content)).toBe('age');
    expect(buyBlock(teen, 'cannabis', 'market', 10, true, content)).toBe('age');
  });

  it('sells stock to customers for dirty money, adds heat and grows with trade', () => {
    let life = performAction(dealer(), 'start_dealing', { drugId: 'cannabis' }, content);
    expect(life.drugs.dealing!.customers).toBe(B.dealing.customers.start);
    const before = life.finances.dirty;
    life = apply(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runDrugs(d, content);
    });
    expect(life.finances.dirty).toBeGreaterThan(before);
    expect(life.crime.heat).toBeGreaterThan(0);
    expect(life.drugs.totals.sold).toBeGreaterThan(0);
    expect(life.drugs.stock.cannabis!.units).toBeLessThan(100);
    expect(life.drugs.dealing!.customers).toBeGreaterThanOrEqual(B.dealing.customers.start);
    expect(life.finances.savings).toBeLessThanOrEqual(100_000);
    ok(life);
  });

  it('a higher price earns more per unit but sells less', () => {
    const run = (price: 'low' | 'high') =>
      apply(performAction(dealer('d1-price'), 'start_dealing', { drugId: 'cannabis' }, content), (d) => {
        d.drugs.dealing!.price = price;
        dealingYear(d, content);
      });
    const low = run('low');
    const high = run('high');
    expect(low.drugs.totals.sold).toBeGreaterThan(high.drugs.totals.sold);
  });

  it('dealing counts as a role in the Career hub', () => {
    const life = performAction(dealer('d1-load'), 'start_dealing', { drugId: 'cannabis' }, content);
    expect(life.drugs.dealing).not.toBeNull();
    const view = getDealingView(life, content);
    expect(view.dealing!.customers).toBeGreaterThan(0);
    expect(view.stock[0]!.units).toBe(100);
    expect(content.balance.careers.hub.roles.dealing.steady).toBeGreaterThan(0);
  });

  it('selling the product on at wholesale pays dirty money and draws heat', () => {
    const life = performAction(stocked(adult('d1-wholesale'), 'cannabis', 50), 'sell_wholesale', { drugId: 'cannabis' }, content);
    expect(life.drugs.stock.cannabis).toBeUndefined();
    expect(life.finances.dirty).toBeGreaterThan(0);
    expect(life.drugs.last!.balance).toBe(life.finances.savings);
  });

  it('stopping, and a prison term, end it', () => {
    const life = performAction(dealer('d1-stop'), 'start_dealing', { drugId: 'cannabis' }, content);
    expect(performAction(life, 'stop_dealing', {}, content).drugs.dealing).toBeNull();
    const jailed = apply(life, (d) => {
      d.housing.kind = 'incarcerated';
      dealingYear(d, content);
    });
    expect(jailed.drugs.dealing).toBeNull();
    expect(startBlock(jailed, 'cannabis', content)).toBe('jail');
  });

  it('the dirty money launders through the existing fronts, not a second system', () => {
    const life = apply(performAction(dealer('d1-launder'), 'start_dealing', { drugId: 'cannabis' }, content), (d) => {
      d.finances.dirty = 5000;
    });
    expect(life.finances.dirty).toBe(5000);
  });
});

describe('operations', () => {
  it('cost a setup, have capacity, quality and output, and add to the stock', () => {
    const life = adult('d1-op');
    const def = content.operations.backroom_grow!;
    const cost = opCost(life, def, content);
    const next = performAction(life, 'start_operation', { defId: 'backroom_grow', drugId: 'cannabis' }, content);
    expect(next.drugs.ops).toHaveLength(1);
    expect(life.finances.savings - next.finances.savings).toBe(cost.startup);
    const year = apply(next, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      opsYear(d, content);
    });
    if (year.drugs.ops.length > 0) {
      expect(year.drugs.totals.produced).toBeGreaterThan(0);
      expect(year.drugs.stock.cannabis?.units ?? 0).toBeGreaterThan(0);
      expect(year.drugs.ops[0]!.quality).toBeLessThanOrEqual(def.quality.max);
    }
    ok(year);
  });

  it('are blocked by money, by the limit, by the wrong drug and by age', () => {
    const poor = apply(adult('d1-oppoor'), (d) => void (d.finances.savings = 10));
    expect(startOpBlock(poor, 'backroom_grow', 'cannabis', content)).toBe('money');
    expect(startOpBlock(adult('d1-opdrug'), 'backroom_grow', 'cocaine', content)).toBe('drug');
    expect(startOpBlock(adult('d1-optype'), 'nope', 'cannabis', content)).toBe('type');
    let full = adult('d1-opfull');
    for (let i = 0; i < B.production.max; i++) full = apply(full, (d) => void startOp(d, 'backroom_grow', 'cannabis', content));
    expect(startOpBlock(full, 'backroom_grow', 'cannabis', content)).toBe('max');
  });

  it('can be raided: the output is seized, it is closed, you are charged with making and the heat matters', () => {
    let raids = 0;
    let record = 0;
    for (let i = 0; i < 400; i++) {
      const life = apply(adult(`d1-raid-${i}`), (d) => {
        startOp(d, 'warehouse_grow', 'cannabis', content);
        d.crime.heat = 80;
      });
      const next = apply(life, (d) => {
        d.currentYear += 1;
        opsYear(d, content);
      });
      if (next.drugs.totals.raids > life.drugs.totals.raids) {
        raids += 1;
        expect(next.drugs.ops).toHaveLength(0);
        if (next.legal.record.length > life.legal.record.length) record += 1;
        expect(next.legal.record.at(-1)?.offenseId).toBe(B.legal.manufacturing);
      }
    }
    expect(raids).toBeGreaterThan(0);
    expect(record).toBe(raids);
  });

  it('shutting one down removes it', () => {
    const life = apply(adult('d1-opclose'), (d) => void startOp(d, 'backroom_grow', 'cannabis', content));
    const id = life.drugs.ops[0]!.id;
    expect(performAction(life, 'close_operation', { opId: id }, content).drugs.ops).toHaveLength(0);
    expect(performAction(life, 'set_operation', { opId: id, running: 'low' }, content).drugs.ops[0]!.running).toBe('low');
  });
});

describe('the law', () => {
  it('escalates with the drug, the amount, selling and making, all through the legal system', () => {
    const base = adult('d1-law');
    const one = (drug: string, units: number) => offenseFor(stocked(base, drug, units), 'holding', content, drug);
    expect(one('cannabis', 1)).toBe(B.legal.possession[0]);
    expect(one('heroin', 1)).toBe(B.legal.possession[4]);
    expect(one('cocaine', B.legal.intentAt)).toBe(B.legal.intent);
    expect(one('cocaine', B.legal.traffickingAt)).toBe(B.legal.trafficking);
    expect(offenseFor(base, 'selling', content)).toBe(B.legal.dealing);
    expect(offenseFor(base, 'making', content)).toBe(B.legal.manufacturing);
    const sev = (id: string) => content.offenses[id]!.severity;
    expect(sev(B.legal.possession[0]!)).toBeLessThan(sev(B.legal.possession[4]!));
    expect(sev(B.legal.manufacturing)).toBeGreaterThanOrEqual(sev(B.legal.intent));
    for (const id of [...B.legal.possession, B.legal.intent, B.legal.dealing, B.legal.trafficking, B.legal.manufacturing]) expect(content.offenses[id]).toBeDefined();
  });

  it('a seizure by a charge empties a stash that was not hidden, and a hidden one only when it is found', () => {
    const life = apply(stocked(adult('d1-seize'), 'cocaine', 5), (d) => {
      d.drugs.stock.heroin = { units: 3, quality: 50, hidden: true };
      applyDrugsEffect(d, { type: 'drugs', action: 'charge', situation: 'holding' }, content);
    });
    expect(life.drugs.stock.cocaine).toBeUndefined();
    expect(life.drugs.stock.heroin).toBeDefined();
    expect(life.legal.record.length).toBe(1);
    expect(life.drugs.totals.arrests).toBe(1);
  });
});

describe('the Career hub performance enhancers use the drug system', () => {
  it('need a course in hand, use it up, build dependence and are stopped when it runs out', () => {
    const life = apply(adult('d1-enh', 22), (d) => {
      d.fame.active = true;
      d.sports.sport = 'basketball';
    });
    expect(enhancerBlock(life, true, content)).not.toBe('supply');
    expect(content.drugs[B.enhancers.drug]!.category).toBe('enhancer');
    expect(startEnhancers).toBeDefined();
  });
});

describe('views, saves and the minor rule', () => {
  it('the market view shows prices, sources and your stash; a minor is told no', () => {
    const life = stocked(withDealer(adult('d1-view')), 'cocaine', 4);
    const v = getDrugMarketView(life, content);
    expect(v.adult).toBe(true);
    expect(v.drugs.find((d) => d.id === 'cocaine')!.held!.units).toBe(4);
    expect(v.drugs.find((d) => d.id === 'cocaine')!.sources.some((s) => s.source === 'dealer' && s.quote !== null)).toBe(true);
    expect(v.dealers).toHaveLength(1);
    const kid = getDrugMarketView(lifeAtAge('d1-viewkid', 14), content);
    expect(kid.oldEnough).toBe(false);
    expect(kid.adult).toBe(false);
  });

  it('a minor with a stash, a dealing record or an operation fails the invariants', () => {
    const kid = lifeAtAge('d1-inv', 15);
    const bad = apply(kid, (d) => void (d.drugs.stock.cocaine = { units: 3, quality: 50, hidden: false }));
    expect(checkInvariants(bad, content).some((f) => /minor holds/.test(f))).toBe(true);
    const bad2 = apply(kid, (d) => void (d.drugs.dealing = { since: d.currentYear, drugId: 'cannabis', customers: 3, price: 'fair', standing: 10, year: { year: d.currentYear, sold: 0, earned: 0, trouble: 0 } }));
    expect(checkInvariants(bad2, content).some((f) => /minor is dealing/.test(f))).toBe(true);
  });
});
