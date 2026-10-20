/**
 * Batch 4: bands, your sound and titles, shows, tours and practice: the rules
 * hold in the engine (limits, validation, who may do what), the effects land
 * (fame, fans, money through the ledger, strain, chemistry), every way in can
 * lead to a band, and practice never touches health.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { isLifeActionAvailable, performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { checkInvariants } from '../invariants';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { applyBandEffect, bandQuality, bandYear, formBand, leaveBand, liveMembers, memberAgeRange } from './band';
import { grindView, playShow, practiceBudget, practiceGain, practise, runTour, showBlock, skillLevel, tourBlock, tourQuote, tourSizeFor } from './grind';
import { enterPath, retire } from './ladder';
import { fameIncome, runFame, tourCost } from './step';
import { affinity, genreDistance, offGenreFanScore, parseTitle, parseTracks, setMainGenre, titleSuggestion } from './sound';
import { rollWork } from './work';

const b = content.balance.fame;
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age/.test(f))).toEqual([]);
const musician = (seed = 'b4', age = 24, route = 'open_mic', talent: string | null = null) =>
  apply(lifeAtAge(seed, age), (d) => {
    d.character.hidden.talent = talent;
    enterPath(d, 'music', route, content);
  });
const yearStep = (life: LifeState) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runFame(d, content);
  });

describe('the entry route', () => {
  it('is kept, and the band way in starts you in a band you lead', () => {
    const open = musician('route-open', 20, 'open_mic');
    expect(open.fame.paths.music!.route).toBe('open_mic');
    expect(open.fame.band).toBeNull();
    const band = musician('route-band', 20, 'band');
    expect(band.fame.paths.music!.route).toBe('band');
    expect(band.fame.band?.leader).toBe('you');
    expect(band.fame.band?.how).toBe('route');
    expect(band.fame.band!.members.length).toBeGreaterThanOrEqual(b.band.size.min);
    ok(band);
  });

  it('every way in can lead to a band: forming one works from each route and any rung', () => {
    for (const route of content.famePaths.music!.routes) {
      const age = Math.max(route.minAge, 15);
      let life = musician(`every-${route.id}`, age, route.id);
      if (life.fame.band) life = apply(life, (d) => void leaveBand(d, false, content));
      life = apply(life, (d) => void (d.fame.paths.music!.rung = 1 + (route.minAge % 4)));
      expect(isLifeActionAvailable(life, 'form_band', { bandName: 'The Test Pattern' }, content), route.id).toBe(true);
      const next = performAction(life, 'form_band', { bandName: '  The   Test Pattern ' }, content);
      expect(next.fame.band?.name).toBe('The Test Pattern');
    }
  });
});

describe('bands', () => {
  it('auditions bring people in your city, of your age group, as friends tagged band, with ties between them', () => {
    const life = apply(musician('form', 26), (d) => void formBand(d, 'Static Bloom', 'guitar', content, d.rng));
    const band = life.fame.band!;
    expect(band.part).toBe('guitar');
    expect(band.members.some((m) => m.part === 'vocals')).toBe(true);
    for (const m of band.members) {
      const p = life.people[m.id]!;
      expect(life.relationships[m.id]!.kind).toBe('friend');
      expect(p.tags).toContain('band');
      expect(p.cityId).toBe(life.character.cityId);
      expect(life.currentYear - p.birthYear).toBeGreaterThanOrEqual(b.band.adultMin);
      expect(life.relationships[m.id]!.memories.some((x) => x.tag === 'band_founded_with_you')).toBe(true);
    }
    expect(Object.keys(life.web.ties).length).toBeGreaterThan(0);
    expect(life.fame.totals.bandsFormed).toBe(1);
    ok(life);
  });

  it('a young star’s bandmates are young too, and a minor needs a parent to form one', () => {
    const teen = musician('teen-band', 15);
    const range = memberAgeRange(teen, content);
    expect(range.max).toBeLessThan(content.balance.relationships.adultAge);
    const life = apply(teen, (d) => void formBand(d, 'Garage Kings', undefined, content, d.rng));
    for (const m of life.fame.band!.members) expect(life.currentYear - life.people[m.id]!.birthYear).toBeLessThan(18);
    const orphan = apply(teen, (d) => {
      for (const rel of Object.values(d.relationships)) if (rel.kind === 'parent') d.people[rel.personId]!.alive = false;
      delete d.housing.guardianId;
    });
    expect(isLifeActionAvailable(orphan, 'form_band', { bandName: 'Nope' }, content)).toBe(false);
  });

  it('the leader renames, throws out and recruits; a member who is not the leader cannot', () => {
    let life = apply(musician('lead', 27), (d) => void formBand(d, 'First Name', undefined, content, d.rng));
    life = performAction(life, 'rename_band', { bandName: 'Second Name' }, content);
    expect(life.fame.band!.name).toBe('Second Name');
    expect(() => performAction(life, 'rename_band', { bandName: '<script>' }, content)).toThrow(InvalidInputError);
    const out = life.fame.band!.members[0]!;
    life = performAction(life, 'kick_member', { personId: out.id }, content);
    expect(life.fame.band!.members.some((m) => m.id === out.id)).toBe(false);
    expect(life.relationships[out.id]!.memories.some((m) => m.tag === 'band_kicked_out')).toBe(true);
    life = performAction(life, 'recruit_member', { part: out.part }, content);
    expect(life.fame.band!.members.some((m) => m.part === out.part && m.id !== out.id)).toBe(true);
    expect(life.fame.totals.memberChanges).toBe(2);
    // Someone else's band: you can't run it.
    const member = apply(life, (d) => void (d.fame.band!.leader = d.fame.band!.members[0]!.id));
    expect(isLifeActionAvailable(member, 'rename_band', { bandName: 'Mine Now' }, content)).toBe(false);
    expect(isLifeActionAvailable(member, 'kick_member', { personId: member.fame.band!.members[1]!.id }, content)).toBe(false);
    ok(life);
  });

  it('offers come from bands in your city; joining takes their sound and their founder leads', () => {
    let life = apply(musician('offer', 25), (d) => {
      d.fame.paths.music!.genre = 'rock';
      d.fame.offers.push({ name: 'Velvet Static', genre: 'metal', size: 3, skill: 50, part: 'vocals', year: d.currentYear });
    });
    life = performAction(life, 'join_band', { offer: 0 }, content);
    expect(life.fame.band?.name).toBe('Velvet Static');
    expect(life.fame.band?.leader).toBe(life.fame.band!.members[0]!.id);
    expect(life.fame.paths.music!.genre).toBe('metal');
    expect(life.fame.totals.genreSwitches).toBe(1);
    expect(life.fame.offers).toEqual([]);
    // Offers expire when the next year begins.
    const stale = apply(musician('stale', 25), (d) => void d.fame.offers.push({ name: 'Old News', genre: 'rock', size: 2, skill: 40, part: 'drums', year: d.currentYear - 1 }));
    expect(isLifeActionAvailable(stale, 'join_band', { offer: 0 }, content)).toBe(false);
  });

  it('a musician with no band is sometimes asked to join one', () => {
    let offers = 0;
    for (let i = 0; i < 40; i++) {
      const life = apply(musician(`ask-${i}`, 22), (d) => void bandYear(d, content, d.rng));
      offers += life.fame.offers.length;
    }
    expect(offers).toBeGreaterThan(0);
  });

  it('leaving and going solo: members feel it, fans split, and the band you lead ends', () => {
    const base = apply(musician('leave', 28), (d) => {
      formBand(d, 'The Exit', undefined, content, d.rng);
      d.fame.fans = 1000;
    });
    const affection = (l: LifeState, id: string) => l.relationships[id]!.affection;
    const id = base.fame.band!.members[0]!.id;
    const left = performAction(base, 'leave_band', { solo: false }, content);
    const solo = performAction(base, 'leave_band', { solo: true }, content);
    expect(left.fame.band).toBeNull();
    expect(left.fame.pastBands.at(-1)?.how).toBe('left');
    expect(solo.fame.pastBands.at(-1)?.how).toBe('solo');
    expect(affection(base, id) - affection(solo, id)).toBeGreaterThan(affection(base, id) - affection(left, id));
    expect(solo.fame.fans).toBeGreaterThan(left.fame.fans);
    expect(left.fame.totals.bandSplits).toBe(1);
    ok(left);
  });

  it('events decide drama: a member quits, the band splits, you take the lead, chemistry moves', () => {
    let life = apply(musician('drama', 30), (d) => void formBand(d, 'Drama Club', undefined, content, d.rng));
    const id = life.fame.band!.members[0]!.id;
    life = apply(life, (d) => applyBandEffect(d, { type: 'band', action: 'quit', role: 'bandmate' }, { bandmate: id }, content, d.rng));
    expect(life.fame.band!.members.some((m) => m.id === id)).toBe(false);
    life = apply(life, (d) => applyBandEffect(d, { type: 'band', action: 'chemistry', delta: -20 }, {}, content, d.rng));
    expect(life.fame.band!.chemistry).toBe(b.band.chemistry - 20);
    life = apply(life, (d) => applyBandEffect(d, { type: 'band', action: 'split' }, {}, content, d.rng));
    expect(life.fame.band).toBeNull();
    expect(life.fame.pastBands.at(-1)?.how).toBe('split');
  });

  it('low chemistry brings more drama than high', () => {
    const count = (chemistry: number) => {
      let n = 0;
      for (let i = 0; i < 60; i++) {
        apply(musician(`chem-${chemistry}-${i}`, 30), (d) => {
          formBand(d, 'Chem', undefined, content, d.rng);
          d.fame.band!.chemistry = chemistry;
          for (const m of d.fame.band!.members) d.relationships[m.id]!.affection = chemistry;
          n += bandYear(d, content, d.rng).length;
        });
      }
      return n;
    };
    expect(count(15)).toBeGreaterThan(count(85));
  });

  it('a band adds to the quality of the work by its skill and its chemistry', () => {
    const life = apply(musician('quality', 30), (d) => void formBand(d, 'Q', undefined, content, d.rng));
    const good = apply(life, (d) => {
      d.fame.band!.chemistry = 90;
      for (const m of d.fame.band!.members) m.skill = 90;
    });
    const bad = apply(life, (d) => {
      d.fame.band!.chemistry = 10;
      for (const m of d.fame.band!.members) m.skill = 10;
    });
    expect(bandQuality(good, content)).toBeGreaterThan(bandQuality(bad, content) + 5);
    expect(bandQuality(musician('solo', 30), content)).toBe(0);
  });

  it('retiring walks you out of your band', () => {
    const life = apply(musician('retire-band', 60), (d) => {
      formBand(d, 'Old Hands', undefined, content, d.rng);
      retire(d, content);
    });
    expect(life.fame.band).toBeNull();
    ok(life);
  });

  it('joining an offer is a choice an event can make for you', () => {
    const life = apply(musician('join-event', 26), (d) => {
      d.fame.offers.push({ name: 'The Callers', genre: 'pop', size: 2, skill: 45, part: 'guitar', year: d.currentYear });
      applyBandEffect(d, { type: 'band', action: 'join' }, {}, content, d.rng);
    });
    expect(life.fame.band?.name).toBe('The Callers');
    expect(liveMembers(life)).toHaveLength(2);
  });
});

describe('your sound', () => {
  it('genres come from content, with affinities from balance', () => {
    expect(Object.values(content.fameGenres).filter((g) => g.path === 'music').length).toBeGreaterThanOrEqual(14);
    expect(affinity('rock', 'alt_rock', content)).toBeGreaterThan(affinity('rock', 'edm', content));
    expect(affinity('metal', 'alt_rock', content)).toBe(affinity('alt_rock', 'metal', content));
    expect(genreDistance('alt_rock', 'alt_rock', content)).toBe(0);
    expect(genreDistance(undefined, 'metal', content)).toBe(0);
  });

  it('the first genre is free; a switch costs fans and mood by distance, and is counted', () => {
    const life = apply(musician('switch', 26), (d) => {
      d.fame.fans = 10_000;
      d.fame.mood = 60;
    });
    const first = apply(life, (d) => void setMainGenre(d, 'music', 'rock', content));
    expect(first.fame.fans).toBe(10_000);
    const near = apply(first, (d) => void setMainGenre(d, 'music', 'alt_rock', content));
    const far = apply(first, (d) => void setMainGenre(d, 'music', 'regional_mexican', content));
    expect(far.fame.fans).toBeLessThan(near.fame.fans);
    expect(far.fame.mood).toBeLessThan(near.fame.mood);
    expect(far.fame.totals.genreSwitches).toBe(1);
    // As an action, a switch queues a story for the coming year.
    const acted = performAction(first, 'set_genre', { pathId: 'music', genreId: 'edm' }, content);
    expect(acted.scheduled.some((s) => content.registries.fame.triggers.genreSwitch.events.includes(s.eventId))).toBe(true);
  });

  it('off-genre work: critics judge it on its own, fans take it by distance', () => {
    const life = apply(musician('off', 28), (d) => void (d.fame.paths.music!.genre = 'alt_rock'));
    const def = content.famePaths.music!;
    const kind = def.kinds[0]!;
    // The same draws for both, so only the genre differs.
    const roll = (genre: string) => rollWork(life, { path: 'music', kind: kind.id, style: 'commercial', risk: 'safe', press: false, genre }, life.fame.paths.music!, def, kind, content, structuredClone(life.rng));
    const on = roll('alt_rock');
    const off = roll('regional_mexican');
    expect(off.critics).toBe(on.critics);
    expect(on.fans - off.fans).toBe(offGenreFanScore(genreDistance('alt_rock', 'regional_mexican', content), content));
    // Released: it is marked off-genre, some fans leave, and it is counted.
    const released = yearStep(apply(life, (d) => {
      d.fame.fans = 5_000;
      d.fame.plan = { path: 'music', kind: kind.id, style: 'commercial', risk: 'safe', press: false, genre: 'metal', title: 'Heavy Weather' };
    }));
    const project = released.fame.projects.at(-1)!;
    expect(project.title).toBe('Heavy Weather');
    expect(project.genre).toBe('metal');
    expect(project.offGenre).toBeGreaterThan(0);
    expect(released.fame.totals.offGenre).toBe(1);
    expect(released.history.some((h) => h.text.includes('Heavy Weather'))).toBe(true);
    expect(released.fame.best?.title).toBe('Heavy Weather');
  });
});

describe('titles', () => {
  it('are trimmed, kept to a length and to the characters a title can have', () => {
    expect(parseTitle('  Glass   Weather ')).toBe('Glass Weather');
    expect(parseTitle('Qué Pasó? (Live)')).toBe('Qué Pasó? (Live)');
    expect(parseTitle('')).toBeNull();
    expect(parseTitle('   ')).toBeNull();
    expect(parseTitle('x'.repeat(61))).toBeNull();
    expect(parseTitle('<b>bold</b>')).toBeNull();
    expect(parseTitle('!!!')).toBeNull();
    expect(parseTitle(42)).toBeNull();
    expect(parseTracks(['One', '', 'Two'], 6)).toEqual(['One', 'Two']);
    expect(parseTracks(['One', 'Two', 'Three'], 2)).toBeNull();
    expect(parseTracks(['ok', '{bad}'], 6)).toBeNull();
  });

  it('a typed title is validated by the action; tracks only for a kind with tracks; suggestions come from a long list', () => {
    const life = apply(musician('titles', 26), (d) => {
      d.fame.paths.music!.rung = 3;
    });
    const plan = { pathId: 'music', kindId: 'album', style: 'artistic', risk: 'safe', press: false } as const;
    const next = performAction(life, 'plan_project', { ...plan, title: '  Rooms I Left ', tracks: ['Intro', 'Rooms I Left'] }, content);
    expect(next.fame.plan?.title).toBe('Rooms I Left');
    expect(next.fame.plan?.tracks).toEqual(['Intro', 'Rooms I Left']);
    expect(next.inputLog.at(-1)?.payload).toMatchObject({ params: { title: 'Rooms I Left' } });
    expect(() => performAction(life, 'plan_project', { ...plan, title: '<script>' }, content)).toThrow(InvalidInputError);
    expect(isLifeActionAvailable(life, 'plan_project', { ...plan, kindId: 'single', tracks: ['A'] }, content)).toBe(false);
    expect(content.text.fame.titles.music!.length).toBeGreaterThanOrEqual(100);
    expect(titleSuggestion(life, 'music', 0, content)).toBe(titleSuggestion(life, 'music', 0, content));
    expect(titleSuggestion(life, 'music', 0, content)).not.toBe(titleSuggestion(life, 'music', 1, content));
  });
});

describe('shows', () => {
  it('at most the yearly number, enforced in the engine; each adds fans, fame, craft and stress and pays through the ledger', () => {
    let life = musician('shows', 24);
    const before = life;
    for (let i = 0; i < b.shows.perYear; i++) life = performAction(life, 'play_show', {}, content);
    expect(grindView(life).shows).toBe(b.shows.perYear);
    expect(showBlock(life, content)).toBe('limit');
    expect(() => performAction(life, 'play_show', {}, content)).toThrow(InvalidInputError);
    expect(life.fame.fans).toBeGreaterThan(before.fame.fans);
    expect(life.fame.paths.music!.craft).toBeGreaterThan(before.fame.paths.music!.craft);
    expect(life.character.stats.stress).toBeGreaterThanOrEqual(before.character.stats.stress);
    expect(life.finances.savings).toBe(before.finances.savings);
    const owed = grindView(life).showPay;
    expect(owed).toBeGreaterThan(0);
    // The ledger pays it as the next year begins.
    const next = yearStep(life);
    expect(next.fame.income.gross).toBeGreaterThanOrEqual(owed);
    expect(fameIncome(next)).toBeGreaterThan(0);
    expect(next.fame.played.shows).toBe(b.shows.perYear);
    expect(grindView(next).shows).toBe(0);
    ok(next);
  });

  it('the venue goes by rung, and a band moves with how a show goes', () => {
    const low = musician('venue-low', 24);
    const high = apply(low, (d) => void (d.fame.paths.music!.rung = 6));
    expect(isLifeActionAvailable(low, 'play_show', {}, content)).toBe(true);
    const a = apply(low, (d) => void playShow(d, content, d.rng));
    const c = apply(high, (d) => void playShow(d, content, d.rng));
    expect(a.fame.grind.lastShow?.venue).toBe('open_mic');
    expect(c.fame.grind.lastShow?.venue).toBe('festival');
    const band = apply(low, (d) => void formBand(d, 'Show Band', undefined, content, d.rng));
    const after = apply(band, (d) => void playShow(d, content, d.rng));
    const outcome = after.fame.grind.lastShow!.outcome;
    expect(after.fame.band!.chemistry).toBe(band.fame.band!.chemistry + b.shows.chemistry[outcome]);
    // In a band, your share of the pay is the band's cut.
    expect(after.fame.grind.lastShow!.pay).toBeLessThanOrEqual(apply(low, (d) => void playShow(d, content, structuredClone(band.rng))).fame.grind.lastShow!.pay * 2);
  });
});

describe('tours', () => {
  it('one a year, sized by rung, booked between years and on the road as the year begins', () => {
    const def = content.famePaths.music!;
    expect(tourSizeFor(def, 2, content)).toBe('local');
    expect(tourSizeFor(def, 7, content)).toBe('world');
    const low = musician('tour-low', 25);
    expect(tourBlock(low, 'music', content)).toBe('rung');
    const life = apply(low, (d) => {
      d.fame.paths.music!.rung = 4;
      d.fame.paths.music!.fame = 45;
      d.fame.fans = 10_000;
    });
    const booked = performAction(life, 'book_tour', { pathId: 'music' }, content);
    expect(booked.fame.grind.tour?.size).toBe(tourQuote(life, 'music', content)!.size);
    expect(() => performAction(booked, 'book_tour', { pathId: 'music' }, content)).toThrow(InvalidInputError);
    expect(performAction(booked, 'cancel_tour', {}, content).fame.grind.tour).toBeNull();
    const next = yearStep(booked);
    expect(next.fame.played.tour).not.toBeNull();
    expect(next.fame.totals.tours).toBe(1);
    expect(tourCost(next)).toBe(booked.fame.grind.tour!.cost);
    expect(next.fame.income.gross).toBeGreaterThan(0);
    expect(next.fame.fans).toBeGreaterThan(0);
    expect(next.history.some((h) => /tour/.test(h.text))).toBe(true);
  });

  it('strains the people close to you and adds burnout', () => {
    const life = apply(musician('tour-strain', 30), (d) => {
      d.fame.paths.music!.rung = 5;
      d.fame.burnout = 0;
    });
    const out = apply(life, (d) => void runTour(d, { path: 'music', size: 'world', cost: 0 }, content, d.rng));
    expect(out.fame.burnout).toBe(b.tours.sizes.world.burnout);
    const total = (l: LifeState) => Object.values(l.relationships).reduce((s, r) => s + r.affection, 0);
    expect(total(out)).toBeLessThanOrEqual(total(life));
  });

  it('a project plan has no tour box any more', () => {
    const life = musician('no-box', 25);
    expect(() => performAction(life, 'plan_project', { pathId: 'music', kindId: 'single', style: 'commercial', risk: 'safe', press: false, tour: true }, content)).toThrow(InvalidInputError);
  });
});

describe('practice', () => {
  it('a yearly budget by commitment, diminishing returns, and it never touches health', () => {
    let life = apply(musician('practice', 22), (d) => void (d.fame.instrument = 'guitar'));
    expect(practiceBudget(life, content)).toBe(b.practice.sessions.steady);
    const gains: number[] = [];
    const health = life.character.stats.health;
    for (let i = 0; i < 4; i++) {
      gains.push(practiceGain(life, 'music', 'vocals', content));
      life = performAction(life, 'practice', { pathId: 'music', skillId: 'vocals' }, content);
    }
    for (let i = 1; i < gains.length; i++) expect(gains[i]!).toBeLessThan(gains[i - 1]!);
    expect(skillLevel(life.fame.paths.music, 'vocals', content)).toBeGreaterThan(b.practice.start);
    expect(life.character.stats.health).toBe(health);
    while (grindView(life).practice < practiceBudget(life, content)) life = performAction(life, 'practice', { pathId: 'music', skillId: 'songwriting' }, content);
    expect(isLifeActionAvailable(life, 'practice', { pathId: 'music', skillId: 'stage' }, content)).toBe(false);
    ok(life);
  });

  it('the instrument skill needs an instrument; a skill without a fitting talent stops at its cap', () => {
    const life = musician('practice-inst', 22);
    expect(isLifeActionAvailable(life, 'practice', { pathId: 'music', skillId: 'instrument' }, content)).toBe(false);
    const withIt = performAction(life, 'set_instrument', { instrumentId: 'drums' }, content);
    expect(isLifeActionAvailable(withIt, 'practice', { pathId: 'music', skillId: 'instrument' }, content)).toBe(true);
    expect(isLifeActionAvailable(life, 'set_instrument', { instrumentId: 'vocals' }, content)).toBe(false);
    const capped = apply(life, (d) => void (d.fame.paths.music!.skills = { vocals: b.practice.cap.none }));
    expect(isLifeActionAvailable(capped, 'practice', { pathId: 'music', skillId: 'vocals' }, content)).toBe(false);
    const gifted = apply(capped, (d) => void (d.character.hidden.talent = 'music'));
    expect(isLifeActionAvailable(gifted, 'practice', { pathId: 'music', skillId: 'vocals' }, content)).toBe(true);
  });

  it('practised skills raise the quality of the work that draws on them', () => {
    const life = musician('practice-q', 28, 'open_mic', 'music');
    const skilled = apply(life, (d) => void (d.fame.paths.music!.skills = { vocals: 100, songwriting: 100 }));
    const def = content.famePaths.music!;
    const kind = def.kinds.find((k) => k.id === 'single')!;
    const q = (l: LifeState) => rollWork(l, { path: 'music', kind: 'single', style: 'commercial', risk: 'safe', press: false }, l.fame.paths.music!, def, kind, content, structuredClone(l.rng)).quality;
    expect(q(skilled)).toBeGreaterThan(q(life));
    // Practise is generic: a path registers skills in content; one without them has nothing to practise.
    const actor = apply(lifeAtAge('actor', 25), (d) => void enterPath(d, 'acting', content.famePaths.acting!.routes[0]!.id, content));
    expect(isLifeActionAvailable(actor, 'practice', { pathId: 'acting', skillId: 'vocals' }, content)).toBe(false);
    expect(apply(actor, (d) => void practise(d, 'acting', 'vocals', content)).fame).toEqual(actor.fame);
  });
});
