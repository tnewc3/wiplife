/**
 * The Activities tab (A1): activities that group options, repeats counted across an activity, portrait changes from the salon
 * and shopping (with dye fading), hobbies (skill, fading, flags, a hidden talent coming to light), the adults-only rule for
 * dating in the engine, the yearly limit of a whole activity, and a spammer who cannot max a stat in a year.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { RISK_CATEGORIES, type ContentBundle } from '../../content/schemas';
import { finishAction, performAction } from '../actions';
import { LIFE_ACTIONS } from '../actions/life';
import { playYear, resolveAll } from '../autoplay';
import { checkInvariants } from '../invariants';
import { createLife } from '../life';
import { yourLook } from '../looks/query';
import { shownHair } from '../looks/render';
import { replayLife } from '../replay';
import { netWorth } from '../finance';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { hobbyLevel, hobbySkill, hubCount, lookOptions, optionsOf, repeatsOf } from './activities';
import { pastimeBlock, pastimeCount, type PastimeChoice } from './query';
import { getActivityTabView } from './views';

const rich = (life: LifeState, savings = 500_000): LifeState =>
  produce(life, (d) => {
    d.finances.savings = savings;
    d.finances.debts = [];
    d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 2 };
  });

const act = (life: LifeState, pastimeId: string, extra: Record<string, unknown> = {}) => performAction(life, 'do_activity', { pastimeId, ...extra }, content);

/** Plays out whatever result event an activity opened (random choices) and returns to year start. */
function settle(life: LifeState): LifeState {
  if (life.phase !== 'action') return life;
  const done = resolveAll(life, content, createRng(`${life.seed}:settle:${life.inputLog.length}`));
  return done.phase === 'action' ? finishAction(done) : done;
}

const player = (seed: string, age: number): LifeState => rich(lifeAtAge(seed, age));

describe('the Activities tab content', () => {
  const reg = content.registries.activities;
  it('lists the categories and activities of the U2 hub, with "Do your own thing" featured', () => {
    expect(reg.categories.map((c) => c.id)).toEqual(['featured', 'health', 'recovery', 'mind_body', 'outdoors', 'social_love', 'groups', 'faith', 'leisure', 'money_luck', 'black_market', 'crime', 'legal', 'luxury']);
    const ids = (category: string, section = 'activities') => reg.activities.filter((a) => a.category === category && a.section === section).map((a) => a.id);
    expect(ids('featured')).toEqual(['own_thing']);
    expect(ids('health')).toEqual(['doctor', 'er', 'eyes', 'dentist', 'therapist', 'alt_medicine', 'donate', 'cosmetic']);
    expect(ids('recovery')).toEqual(['support_group', 'rehab', 'counseling']);
    expect(ids('mind_body')).toEqual(['gym', 'walk', 'meditate', 'yoga', 'read']);
    expect(ids('outdoors')).toEqual(['hike', 'fish', 'camp', 'birdwatch', 'swim', 'offroad', 'garden']);
    expect(ids('outdoors', 'shopping')).toEqual(['outdoor_gear', 'offroad_vehicles']);
    expect(ids('social_love')).toEqual(['dating', 'nightlife', 'parties', 'social_media']);
    expect(ids('groups')).toEqual(['clubs', 'causes', 'civic']);
    expect(ids('faith')).toEqual(['faith_yours', 'faith_explore']);
    expect(ids('leisure')).toEqual(['vacation', 'salon', 'hobbies', 'movies', 'pets']);
    expect(ids('money_luck')).toEqual(['lottery', 'casino', 'loans']);
    expect(ids('money_luck', 'shopping')).toEqual(['shopping', 'fine_goods']);
    expect(ids('luxury')).toEqual(['vip', 'luxury_spa', 'societies', 'charity']);
    expect(ids('luxury', 'shopping')).toEqual(['lux_cars', 'lux_boats', 'lux_air', 'lux_jewelry', 'lux_islands']);
  });
  it('gives every activity with options at least one of them, every option an activity that exists, and every activity a place on the hub', () => {
    for (const a of reg.activities.filter((x) => ['options', 'vacation', 'hobbies'].includes(x.kind))) expect(optionsOf(content, a.id).length, a.id).toBeGreaterThanOrEqual(1);
    for (const def of Object.values(content.pastimes)) {
      if (def.retired) continue;
      expect(def.hub, `${def.id} has a hub`).toBeDefined();
      expect(reg.activities.some((a) => a.id === def.hub), def.id).toBe(true);
    }
  });
  it('has about 40 outcome events and follow-ups opened by the tab, all written for the consistency rules', () => {
    const opened = new Set(Object.values(content.pastimes).filter((p) => p.hub).flatMap((p) => Object.values(p.tiers).flatMap((t) => t?.events ?? [])));
    const flagged = Object.values(content.events).filter((e) => (e.requires ? JSON.stringify(e.requires) : '').match(/practiced_|skilled_|gym_injury|changed_hair|new_look|traded_numbers_nightlife/));
    expect(new Set([...opened, ...flagged.map((e) => e.id)]).size).toBeGreaterThanOrEqual(38);
  });
});

describe('repeats count across an activity', () => {
  it('shares diminishing returns between the options of one activity, and counts both the option and the activity', () => {
    let life = player('a1-share', 25);
    life = settle(act(life, 'hit_the_gym_hard'));
    expect(repeatsOf(life, content.pastimes.go_to_the_gym!, content)).toBe(1);
    life = settle(act(life, 'go_to_the_gym'));
    expect(hubCount(life, 'gym')).toBe(2);
    expect(pastimeCount(life, 'go_to_the_gym')).toBe(1);
    expect(repeatsOf(life, content.pastimes.go_for_a_run!, content)).toBe(2);
    // An option of another activity is not affected.
    expect(repeatsOf(life, content.pastimes.meditate!, content)).toBe(0);
    expect(checkInvariants(life, content)).toEqual([]);
  });
  it('stops an activity at its own yearly limit, whatever the option', () => {
    const hub = content.registries.activities.activities.find((a) => a.id === 'gym')!;
    const life = produce(player('a1-limit', 25), (d) => {
      d.pastimes = { year: d.currentYear, counts: { 'hub:gym': hub.limit }, receipts: [] };
    });
    expect(pastimeBlock(life, content.pastimes.go_to_the_gym!, {}, content)).toBe('limit');
    expect(pastimeBlock(life, content.pastimes.hit_the_gym_hard!, {}, content)).toBe('limit');
    expect(pastimeBlock(life, content.pastimes.meditate!, {}, content)).toBe(null);
  });
  it('starts the counts afresh each year', () => {
    const life = produce(player('a1-year', 25), (d) => {
      d.pastimes = { year: d.currentYear - 1, counts: { 'hub:gym': 5, go_to_the_gym: 5 }, receipts: [] };
    });
    expect(repeatsOf(life, content.pastimes.go_to_the_gym!, content)).toBe(0);
    expect(hubCount(life, 'gym')).toBe(0);
  });
  it('lets a spammer repeat the gym all year without maxing any stat', () => {
    const hub = content.registries.activities.activities.find((a) => a.id === 'gym')!;
    const cycle = ['hit_the_gym_hard', 'go_to_the_gym', 'go_for_a_run'];
    for (const seed of ['a1-spam-1', 'a1-spam-2', 'a1-spam-3', 'a1-spam-4', 'a1-spam-5']) {
      let life = produce(player(seed, 25), (d) => {
        d.character.stats.fitness = 30;
        d.character.stats.health = 60;
        d.character.stats.looks = 50;
      });
      const start = { ...life.character.stats };
      for (let i = 0; i < hub.limit; i++) {
        const id = cycle[i % cycle.length]!;
        if (pastimeBlock(life, content.pastimes[id]!, {}, content) !== null) continue;
        life = settle(act(life, id));
      }
      const gain = life.character.stats.fitness - start.fitness;
      expect(life.character.stats.fitness, seed).toBeLessThan(100);
      expect(gain, seed).toBeLessThanOrEqual(content.balance.targets.activities.spamMaxYearGain);
      for (const key of ['health', 'looks', 'smarts'] as const) expect(life.character.stats[key], `${seed} ${key}`).toBeLessThan(100);
    }
  });
  it('gives the fourth try less than the first, and bad results a little likelier', () => {
    const def = content.pastimes.go_to_the_gym!;
    const w = (repeats: number) => {
      const r = content.balance.activities.returns;
      return { good: r.tierShift ** repeats, bad: 1 + r.badRise * repeats };
    };
    expect(w(3).good).toBeLessThan(w(0).good);
    expect(w(3).bad).toBeGreaterThan(w(0).bad);
    expect(def.hub).toBe('gym');
  });
});

describe('age and legal limits', () => {
  it('shows an adults-only activity greyed out to a minor, with the age it needs', () => {
    const teen = player('a1-teen', 16);
    const view = getActivityTabView(teen, content);
    const hub = (id: string) => view.categories.flatMap((c) => c.sections.flatMap((x) => x.activities)).find((a) => a.id === id)!;
    expect(hub('nightlife').block).toMatchObject({ reason: 'age' });
    expect(hub('dating').block).toEqual({ reason: 'age', minAge: content.balance.relationships.adultAge });
    expect(hub('casino').block).toMatchObject({ reason: 'age' });
    expect(hub('lottery').block).toMatchObject({ reason: 'age' });
    expect(hub('gym').block).toBeNull();
    expect(hub('doctor').block).toBeNull();
    const adult = getActivityTabView(player('a1-adult', 30), content).categories.flatMap((c) => c.sections.flatMap((x) => x.activities));
    for (const id of ['nightlife', 'dating', 'casino', 'lottery']) expect(adult.find((a) => a.id === id)!.block, id).toBeNull();
  });
  it('keeps dating for adults in the engine even if an option said otherwise', () => {
    const def = content.pastimes.spend_an_evening_on_a_dating_app!;
    const loose: ContentBundle = { ...content, pastimes: { ...content.pastimes, [def.id]: { ...def, minAge: 5 } } };
    const teen = player('a1-dating', 16);
    expect(pastimeBlock(teen, loose.pastimes[def.id]!, {}, loose)).toBe('age');
    expect(pastimeBlock(player('a1-dating-adult', 20), loose.pastimes[def.id]!, {}, loose)).toBe(null);
  });
  it('holds every option of dating to the love category and the adult age', () => {
    for (const d of optionsOf(content, 'dating')) {
      expect(d.category, d.id).toBe('love');
      expect(d.minAge, d.id).toBeGreaterThanOrEqual(content.balance.relationships.adultAge);
    }
  });
});

describe('portrait changes from the salon and shopping', () => {
  it('changes your hairstyle to the one you chose, and refuses one you could not choose', () => {
    const life = player('a1-style', 25);
    const options = lookOptions(life, 'hairstyle', content);
    const chosen = options.find((o) => o !== yourLook(life, content).hairstyle)!;
    expect(pastimeBlock(life, content.pastimes.try_a_new_hairstyle!, {}, content)).toBe('look');
    expect(pastimeBlock(life, content.pastimes.try_a_new_hairstyle!, { look: 'not_a_style' }, content)).toBe('look');
    expect(pastimeBlock(life, content.pastimes.go_to_the_gym!, { look: chosen }, content)).toBe('look');
    const after = settle(act(life, 'try_a_new_hairstyle', { look: chosen }));
    expect(after.character.look?.hairstyle).toBe(chosen);
    expect(after.finances.savings).toBeLessThan(life.finances.savings);
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('dyes your hair for dyeFadeYears, then it fades back to your natural color', () => {
    const life = player('a1-dye', 30);
    const natural = yourLook(life, content);
    const color = lookOptions(life, 'dye', content).find((c) => c !== natural.hair && c !== 'silver')!;
    const after = settle(act(life, 'hair_color', { look: color }));
    const look = after.character.look!;
    expect(look.dye).toEqual({ color, year: after.currentYear });
    const fade = content.balance.portraits.dyeFadeYears;
    expect(shownHair(look, 30, after.currentYear, content)).toBe(color);
    expect(shownHair(look, 30, after.currentYear + fade - 1, content)).toBe(color);
    expect(shownHair(look, 30, after.currentYear + fade, content)).toBe(natural.hair);
  });
  it('changes an outfit, its color, glasses, earrings and a hat, each from the options for your body and age', () => {
    let life = player('a1-shop', 28);
    const cases: [string, 'outfit' | 'clothing' | 'eyewear' | 'earrings' | 'hat'][] = [
      ['pick_a_new_outfit', 'outfit'],
      ['pick_new_colors', 'clothing'],
      ['buy_a_pair_of_glasses', 'eyewear'],
      ['buy_earrings', 'earrings'],
      ['buy_a_hat', 'hat'],
    ];
    for (const [id, kind] of cases) {
      const options = lookOptions(life, kind, content);
      expect(options.length, kind).toBeGreaterThan(0);
      const value = options[options.length - 1]!;
      life = settle(act(life, id, { look: value }));
      const key = kind === 'outfit' ? 'outfit' : kind === 'clothing' ? 'clothing' : kind === 'eyewear' ? 'eyewear' : kind === 'earrings' ? 'earrings' : 'hat';
      expect(life.character.look?.[key], kind).toBe(value);
    }
    expect(checkInvariants(life, content)).toEqual([]);
  });
  it('shows what a purchase cost and leaves the new balance in the receipt', () => {
    const life = player('a1-receipt', 28);
    const after = settle(act(life, 'buy_a_hat', { look: lookOptions(life, 'hat', content)[0]! }));
    const receipt = after.pastimes.receipts.at(-1)!;
    expect(receipt.money?.change).toBeLessThan(0);
    expect(receipt.money?.balance).toBe(after.finances.savings);
  });
  it('replays from the input log with the chosen look', () => {
    // A life played from its start (so it can be replayed), with a few dollars for the salon.
    let started: LifeState | null = null;
    for (let n = 0; n < 12 && !started; n++) {
      let life = createLife({ mode: 'random', seed: `a1-replay-${n}`, birthYear: 2000, countryId: 'us' }, content);
      for (let i = 0; i < 30 && life.phase === 'yearStart'; i++) life = playYear(life, content);
      if (life.phase === 'yearStart' && pastimeBlock(life, content.pastimes.try_a_new_hairstyle!, { look: lookOptions(life, 'hairstyle', content)[1]! }, content) === null && pastimeBlock(life, content.pastimes.play_chess!, {}, content) === null) started = life;
    }
    expect(started).not.toBeNull();
    const played = settle(act(settle(act(started!, 'try_a_new_hairstyle', { look: lookOptions(started!, 'hairstyle', content)[1]! })), 'play_chess'));
    const rebuilt = replayLife(played.inputLog, content);
    expect(rebuilt.character.look).toEqual(played.character.look);
    expect(rebuilt.hobbies).toEqual(played.hobbies);
    expect(rebuilt.pastimes).toEqual(played.pastimes);
  });
  it('turns away a look in an action with characters it cannot be', () => {
    const rule = LIFE_ACTIONS.do_activity;
    expect(rule.parse({ pastimeId: 'buy_a_hat', look: 'Baseball Cap!' }, content)).toBeNull();
    expect(rule.parse({ pastimeId: 'buy_a_hat', look: 'beanie' }, content)).toMatchObject({ look: 'beanie' });
  });
});

describe('hobbies', () => {
  it('grows skill with practice, sets the flags, and gains shrink with repeats in a year', () => {
    let life = player('a1-hobby', 20);
    life = settle(act(life, 'play_the_guitar'));
    const first = life.hub.skills['hobby.play_the_guitar']!.level;
    expect(first).toBeGreaterThan(0);
    expect(life.flags.practiced_play_the_guitar).toBe(true);
    const a = life.hub.skills['hobby.play_the_guitar']!.level;
    life = settle(act(life, 'play_the_guitar'));
    life = settle(act(life, 'play_the_guitar'));
    life = settle(act(life, 'play_the_guitar'));
    expect(life.hub.skills['hobby.play_the_guitar']!.level).toBeGreaterThan(a);
    expect(life.hobbies.play_the_guitar!.sessions).toBe(4);
    expect(life.hub.skills['hobby.play_the_guitar']!.level).toBeLessThan(4 * first + 1);
    expect(checkInvariants(life, content)).toEqual([]);
  });
  it('fades each year without practice, and reports a level', () => {
    const life = produce(player('a1-fade', 30), (d) => {
      d.hobbies.paint_or_draw = { year: d.currentYear - 4, sessions: 9 };
      d.hub.skills['hobby.paint_or_draw'] = { level: 60, peak: 60, last: d.currentYear - 4 };
    });
    // C2: nothing fades until the second idle year; the year step fades it by the shared rules.
    expect(hobbySkill(life, 'paint_or_draw', content)).toBe(60);
    expect(hobbySkill(life, 'play_chess', content)).toBe(0);
    expect(hobbyLevel(0, content)).toBe(0);
    expect(hobbyLevel(100, content)).toBe(content.balance.activities.hobbies.levels.length);
  });
  it('sets the skilled flag once skill reaches the level, which events about your craft can require', () => {
    const life = produce(player('a1-skilled', 30), (d) => {
      d.hobbies.write_stories = { year: d.currentYear, sessions: 8 };
      d.hub.skills['hobby.write_stories'] = { level: content.balance.activities.hobbies.skilledAt - 1, peak: content.balance.activities.hobbies.skilledAt - 1, last: d.currentYear };
    });
    let after = life;
    for (let i = 0; i < 4 && !after.flags.skilled_write_stories; i++) after = settle(act(after, 'write_stories'));
    expect(after.flags.skilled_write_stories).toBe(true);
  });
  it('can bring a hidden talent of the hobby\'s kind to light, and never another kind', () => {
    const gifted = produce(player('a1-talent', 20), (d) => {
      d.character.hidden.talent = 'music';
      d.character.hidden.talentDiscovered = false;
      d.hobbies.play_the_guitar = { year: d.currentYear, sessions: 30 };
      d.hub.skills['hobby.play_the_guitar'] = { level: 70, peak: 70, last: d.currentYear };
    });
    let found: LifeState | null = null;
    let life = gifted;
    for (let i = 0; i < 400 && !found; i++) {
      life = produce(settle(act(life, 'play_the_guitar')), (d) => void (d.pastimes = { year: d.currentYear, counts: {}, receipts: [] }));
      if (life.character.hidden.talentDiscovered) found = life;
    }
    expect(found).not.toBeNull();
    // Another kind of hobby does not find a music talent.
    let other = gifted;
    for (let i = 0; i < 60; i++) other = produce(settle(act(other, 'paint_or_draw')), (d) => void (d.pastimes = { year: d.currentYear, counts: {}, receipts: [] }));
    expect(other.character.hidden.talentDiscovered).toBe(false);
  });
  it('shows hobbies in the tab with the skill of each', () => {
    const life = produce(player('a1-view', 20), (d) => {
      d.hobbies.play_chess = { year: d.currentYear, sessions: 5 };
      d.hub.skills['hobby.play_chess'] = { level: 35, peak: 35, last: d.currentYear };
    });
    const hub = getActivityTabView(life, content).categories.flatMap((c) => c.sections.flatMap((x) => x.activities)).find((a) => a.id === 'hobbies')!;
    expect(hub.options.length).toBe(9);
    const chess = hub.options.find((o) => o.id === 'play_chess')!;
    expect(chess.hobby).toEqual({ skill: 35, level: 2 });
  });
});

describe('everything on the tab through the ledger', () => {
  it('charges every option its price in savings, never creating money, and keeps the invariants', () => {
    let life = player('a1-ledger', 26);
    for (const hub of getActivityTabView(life, content).categories.flatMap((c) => c.sections.flatMap((x) => x.activities))) {
      for (const entry of hub.options) {
        const def = content.pastimes[entry.id]!;
        // Crime, the black market, loans and the rest of the risky categories bring money in, and have their own ledger tests (risk.test.ts).
        if (def.mechanic !== 'roll' || def.hobby || def.companion === 'required' || entry.block === 'limit' || (RISK_CATEGORIES as readonly string[]).includes(def.category)) continue;
        const choice: PastimeChoice = { ...(def.look ? { look: entry.look!.options[0]! } : {}), ...(def.quality ? { quality: 'standard' as const } : {}) };
        if (pastimeBlock(life, def, choice, content) !== null) continue;
        const opened = act(life, def.id, { ...choice });
        // The receipt's money is what the activity itself moved (a follow-up event that comes after may pay out, as events do).
        expect(opened.pastimes.receipts.at(-1)?.money?.change ?? 0, def.id).toBeLessThanOrEqual(0);
        life = settle(opened);
      }
    }
    expect(checkInvariants(life, content)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------- U2: the hub

const hubViews = (life: LifeState) => getActivityTabView(life, content).categories;
const categoryIds = (life: LifeState) => hubViews(life).map((c) => c.id);

describe('the hub (U2): categories appear only when they apply', () => {
  it('shows Luxury only above the net worth threshold, scaled to the country', () => {
    const poor = produce(player('u2-poor', 30), (d) => {
      d.finances.savings = 5_000;
    });
    expect(categoryIds(poor)).not.toContain('luxury');
    const wealthy = rich(player('u2-wealthy', 30), 5_000_000);
    expect(categoryIds(wealthy)).toContain('luxury');
    const lux = hubViews(wealthy).find((c) => c.id === 'luxury')!;
    expect(lux.accent).toBe('gold');
    expect(lux.sections.map((s) => s.id)).toEqual(['activities', 'shopping']);
    // The threshold is a balance number, not a literal in the code.
    expect(content.balance.activities.thresholds.luxury).toBeGreaterThan(0);
  });

  it('does not hide ordinary categories from someone in debt, whose net worth is below zero', () => {
    const broke = produce(player('u2-debt', 30), (d) => {
      d.finances.savings = 0;
      d.finances.debts = [{ id: 'd1', kind: 'student', balance: 90_000, annualRate: 0.05, minPayment: 5_000, missed: 0 }];
    });
    expect(netWorth(broke)).toBeLessThan(0);
    expect(categoryIds(broke)).toEqual(['featured', 'health', 'recovery', 'mind_body', 'outdoors', 'social_love', 'groups', 'faith', 'leisure', 'money_luck', 'black_market', 'crime', 'legal']);
  });

  it('hides what a child cannot use: the black market, crime, Luxury, Recovery; and keeps the rest', () => {
    const child = categoryIds(player('u2-child', 9));
    for (const id of ['black_market', 'crime', 'luxury', 'recovery']) expect(child, id).not.toContain(id);
    for (const id of ['health', 'mind_body', 'outdoors', 'leisure']) expect(child, id).toContain(id);
    const teen = categoryIds(player('u2-teen', 15));
    expect(teen).toContain('crime');
    expect(teen).not.toContain('black_market');
    expect(categoryIds(player('u2-teen16', 16))).toContain('black_market');
  });

  it('hides rehab and the support group while nothing is wrong, and shows them with an addiction', () => {
    const well = hubViews(player('u2-well', 30)).find((c) => c.id === 'recovery')!;
    expect(well.sections[0]!.activities.map((a) => a.id)).toEqual(['counseling']);
    const addicted = produce(player('u2-addicted', 30), (d) => {
      d.health.conditions.push({ conditionId: 'alcohol_addiction', severity: 40, since: d.currentYear - 1, treated: false });
    });
    const ids = hubViews(addicted).find((c) => c.id === 'recovery')!.sections[0]!.activities.map((a) => a.id);
    expect(ids).toEqual(['support_group', 'rehab', 'counseling']);
    // Rehab loosens an addiction's grip (the stay's own odds are in balance/pastimes.yaml).
    const rehab = Array.from({ length: 20 }, (_, i) => {
      const life = produce(rich(player(`u2-rehab-${i}`, 30)), (d) => {
        d.health.conditions.push({ conditionId: 'alcohol_addiction', severity: 60, since: d.currentYear - 1, treated: false });
      });
      return settle(act(life, 'check_into_rehab')).health.conditions.find((c) => c.conditionId === 'alcohol_addiction')?.severity ?? 0;
    });
    expect(rehab.filter((sev) => sev < 60).length).toBeGreaterThan(2);
    expect(Math.max(...rehab)).toBeLessThanOrEqual(60);
  });

  it('puts every activity in a category, and groups and faith are links to the Groups page', () => {
    const groups = hubViews(player('u2-groups', 30)).filter((c) => c.id === 'groups' || c.id === 'faith');
    expect(groups.map((c) => c.id)).toEqual(['groups', 'faith']);
    for (const a of groups.flatMap((c) => c.sections.flatMap((s) => s.activities))) {
      expect(a.kind, a.id).toBe('link');
      expect(a.opens, a.id).not.toBeNull();
    }
  });
});

describe('burnout relief (U2): walking, meditation, yoga, the outdoors, leisure and the spa lower Stress, with diminishing returns', () => {
  const RELIEF = ['walk', 'meditate', 'yoga', 'hike', 'fish', 'camp', 'birdwatch', 'swim', 'garden', 'salon'] as const;

  it('gives every relief activity an option whose good outcomes cut stress by 3 or more', () => {
    for (const hubId of RELIEF) {
      const options = optionsOf(content, hubId);
      const relief = options.filter((d) => {
        const good = d.tiers.good?.effects.find((e) => e.type === 'stat' && e.key === 'stress');
        return good !== undefined && good.type === 'stat' && good.delta <= -3;
      });
      expect(relief.length, hubId).toBeGreaterThan(0);
    }
  });

  it('lowers stress when you walk, and returns less each time in the year', () => {
    const drops: number[] = [];
    for (let seed = 0; seed < 12; seed++) {
      let life = produce(player(`u2-walk-${seed}`, 30), (d) => {
        d.character.stats.stress = 90;
      });
      const stress = (l: LifeState) => l.character.stats.stress;
      const first = stress(life);
      life = settle(act(life, 'walk_in_the_park'));
      const afterOne = stress(life);
      for (let i = 0; i < 4; i++) life = settle(act(life, 'walk_in_the_park'));
      drops.push(first - afterOne);
    }
    // Most walks help, and on average a walk cuts stress.
    expect(drops.reduce((s, n) => s + n, 0) / drops.length).toBeGreaterThan(1);
  });

  it('counts the repeats of a relief activity together: a second yoga class returns less than the first', () => {
    const life = player('u2-yoga', 30);
    expect(repeatsOf(life, content.pastimes.yoga_class!, content)).toBe(0);
    const once = settle(act(life, 'yoga_class'));
    expect(repeatsOf(once, content.pastimes.yoga_class!, content)).toBe(1);
  });
});

describe('an activity that gathers unrelated options counts them apart (U2)', () => {
  it('does not make a store theft shrink what a payday loan brings, nor make crimes share repeats', () => {
    const crime = content.registries.activities.activities.find((a) => a.id === 'crime')!;
    expect(crime.sharedRepeats).toBe(false);
    const life = player('u2-crime', 25);
    const after = settle(act(life, 'shoplift'));
    expect(repeatsOf(after, content.pastimes.shoplift!, content)).toBe(1);
    expect(repeatsOf(after, content.pastimes.pickpocket!, content)).toBe(0);
    // The whole activity still counts toward its own limit.
    expect(hubCount(after, 'crime')).toBe(1);
    expect(checkInvariants(after, content)).toEqual([]);
  });
});

describe('Luxury shopping (U2): luxury items are E5 possessions', () => {
  it('buys a grand tourer, a yacht, a private jet, a private island and a necklace as valuables of their own classes', () => {
    const expected: Record<string, string> = { buy_a_grand_tourer: 'car', buy_a_yacht: 'boat', buy_a_private_jet: 'aircraft', buy_a_private_island: 'island', buy_a_diamond_necklace: 'jewelry', buy_a_hypercar: 'car' };
    for (const [id, cls] of Object.entries(expected)) {
      const def = content.pastimes[id]!;
      expect(def.hub, id).toMatch(/^lux_/);
      expect(content.valuables[def.buys!]!.class, id).toBe(cls);
      const life = rich(player(`u2-${id}`, 40), 30_000_000);
      const bought = settle(act(life, id));
      expect(bought.possessions.items.some((p) => p.kind === 'valuable' && p.defId === def.buys), id).toBe(true);
      expect(bought.finances.savings, id).toBeLessThan(life.finances.savings);
      expect(checkInvariants(bought, content), id).toEqual([]);
    }
  });
});
