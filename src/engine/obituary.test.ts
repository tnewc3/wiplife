import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { archiveEntry, netWorth, selectHighlights } from './archive';
import { createLife } from './life';
import { lifeTone, OBITUARY_SECTIONS, writeObituary, type ObituarySection } from './obituary';
import { getFamily } from './selectors';
import { renderText, type TextRole } from './text';
import { customInput, liveOut } from './testFixtures';
import type { LifeState, Pronouns } from './types';

const custom = (seed: string, pronouns?: Pronouns) => {
  const input = customInput();
  if (pronouns) input.identity.pronouns = pronouns;
  return createLife({ mode: 'custom', seed, birthYear: 2026, custom: input }, content);
};

describe('obituary', () => {
  it('tells how the character died, using their pronouns', () => {
    const dead = liveOut(custom('obit-xe'));
    const text = writeObituary(dead, content);
    const cause = content.causes[dead.death!.causeId]!.text;
    expect(text).toContain('Robin Okafor');
    expect(text).toContain(cause);
    expect(text).toContain(String(dead.character.age));
    expect(text).toMatch(/\bXe\b|\bxe\b|\bxem\b|\bxyr\b/);
    // (Templates may use "them" for things, as in "met most of them head-on".)
    expect(text).not.toMatch(/\b(he|she|him|her|his|hers|they)\b/i);
  });

  it('names parents and sorts relatives into survivors and predeceased', () => {
    const dead = liveOut(custom('obit-family'));
    const text = writeObituary(dead, content);
    for (const m of getFamily(dead)) expect(text).toContain(m.person.name.first);
    const alive = getFamily(dead).filter((m) => m.person.alive);
    const gone = getFamily(dead).filter((m) => !m.person.alive);
    if (alive.length > 0) expect(text).toMatch(/survived by|leaves? behind/);
    if (gone.length > 0) expect(text).toMatch(/predeceased by|preceded in death by/);
  });

  it('is the same every time for the same life', () => {
    const dead = liveOut(custom('obit-same'));
    expect(writeObituary(dead, content)).toBe(writeObituary(dead, content));
  });

  it('describes an unfinished life without a cause of death or survivors', () => {
    const life = custom('obit-unfinished');
    const text = writeObituary(life, content);
    expect(text).toMatch(/unfinished/);
    expect(text).not.toMatch(/died of|survived by/);
  });

  it('lets later stages add sections without changing existing ones', () => {
    const dead = liveOut(custom('obit-extend'));
    const extra: ObituarySection = { id: 'career', write: () => 'Xe was a fine carpenter.' };
    const base = writeObituary(dead, content);
    const extended = writeObituary(dead, content, [...OBITUARY_SECTIONS, extra]);
    expect(extended).toBe(`${base} Xe was a fine carpenter.`);
  });

  it('renders every template with several pronoun sets', () => {
    const sets = ['she_her', 'he_him', 'they_them', 'xe_xem'].map((id) => content.pronouns[id]!);
    const o = content.text.obituary;
    const h = content.text.history;
    const values = {
      age: 70,
      year: 2096,
      city: 'Chicago',
      cause: 'a stroke',
      birthYear: 2026,
      birthCity: 'Chicago',
      parents: 'A and B',
      survivors: 'C',
      predeceased: 'D',
      relation: 'sister',
      first: 'A',
      second: 'B',
      items: 'A, B',
      last: 'C',
      subject: 'biology',
      license: 'welding certification',
      degree: 'a law degree',
      title: 'senior accountant',
      employer: 'Ledgerwise Partners',
      years: 40,
      exes: 'Sam Lee',
    };
    const toned = (g: Record<'bright' | 'mixed' | 'heavy', string[]>) => [...g.bright, ...g.mixed, ...g.heavy];
    const templates = [
      ...toned(o.opening.finished),
      ...o.opening.unfinished,
      ...o.origins,
      ...Object.values(o.education).flat(),
      ...toned(o.career.peak),
      ...o.career.worked,
      ...o.career.retired,
      ...o.career.never,
      ...toned(o.love.married),
      ...o.love.widowed,
      ...o.love.divorced,
      ...o.love.single,
      ...Object.values(o.moments),
      ...Object.values(o.deeds),
      ...o.hardship.prison,
      ...o.hardship.bankrupt,
      ...o.survivedBy,
      ...o.predeceasedBy,
      ...o.mood.flatMap((b) => b.variants),
      ...toned(o.closing.finished),
      ...o.closing.unfinished,
      o.relative,
      o.list.pair,
      o.list.serial,
      ...Object.values(h.lifeStage).flatMap((g) => g.variants),
      ...h.familyDeath.variants,
      ...h.death.variants,
    ];
    for (const preset of sets) {
      const role: TextRole = { name: { first: 'Ana', last: 'Ruiz' }, pronouns: preset };
      for (const t of templates) {
        const text = renderText(t, { roles: { self: role, npc: role }, values });
        expect(text, t).not.toMatch(/[{}]/);
        if (preset.id === 'they_them') expect(text, t).not.toMatch(/\b[Tt]hey (is|was|has|does)\b/);
        if (preset.id === 'he_him') expect(text, t).not.toMatch(/\b[Hh]e (are|were|have|leave)\b/);
      }
    }
  });
});

describe('obituary version 2', () => {
  const dead = (seed: string, edit: (d: LifeState) => void) => produce(liveOut(custom(seed)) as LifeState, edit);

  it('matches its phrasing to how the life went', () => {
    const t = content.balance.aging.obituary;
    const base = liveOut(custom('obit-tone'));
    const withHappiness = (h: number, age = 80) =>
      produce(base as LifeState, (d) => {
        d.lifetime = { happinessTotal: h * age, years: age };
        d.character.age = age;
      });
    expect(lifeTone(withHappiness(t.brightHappiness), content)).toBe('bright');
    expect(lifeTone(withHappiness(t.heavyHappiness), content)).toBe('mixed');
    expect(lifeTone(withHappiness(t.heavyHappiness - 1), content)).toBe('heavy');
    expect(lifeTone(withHappiness(100, t.youngAge - 1), content)).toBe('heavy');
    // The closing line comes from the tone's own variants.
    for (const [h, tone] of [[99, 'bright'], [10, 'heavy']] as const) {
      const life = withHappiness(h);
      const self = { name: life.character.name, pronouns: life.character.identity.pronouns };
      const closings = content.text.obituary.closing.finished[tone].map((v) => renderText(v, { roles: { self } }));
      const text = writeObituary(life, content);
      expect(closings.some((c) => text.endsWith(c)), text).toBe(true);
    }
  });

  it('tells of the highest degree, the best job, marriages and hard chapters', () => {
    const life = dead('obit-v2', (d) => {
      d.education.credentials.push({ type: 'hs_diploma', year: 2044 }, { type: 'bachelor', refId: 'biology', year: 2048 });
      d.career.history.push(
        { jobId: 'accountant', employer: 'Ledgerwise Partners', fromYear: 2050, toYear: 2060, level: 2, salary: 70000, endedBy: 'quit' },
        { jobId: 'bank_teller', employer: 'First Harbor', fromYear: 2049, toYear: 2050, level: 1, salary: 30000, endedBy: 'quit' },
      );
      d.legal.record.push({ offenseId: 'theft', year: 2047, outcome: 'jail', years: 2 });
      d.finances.bankruptcyYear = 2070;
    });
    const text = writeObituary(life, content);
    expect(text).toContain('biology');
    expect(text).toContain('senior accountant');
    expect(text).toContain('Ledgerwise Partners');
    expect(text).toContain('2 years');
    expect(text).toContain('2070');
  });

  it('mentions legendary moments first, and deeds from flags', () => {
    const life = dead('obit-moments', (d) => {
      d.flags.ran_marathon = true;
      d.eventLog.lightning = { count: 1, lastYear: 2070 };
    });
    const text = writeObituary(life, content);
    expect(text).toContain('struck by lightning');
    expect(text).toContain('marathon');
    expect(text.indexOf('lightning')).toBeLessThan(text.indexOf('marathon'));
  });

  it('names the spouse, and an ex-spouse as a divorce', () => {
    const base = liveOut(custom('obit-love'));
    const [a, b] = getFamily(base).map((m) => m.person.id);
    const life = produce(base as LifeState, (d) => {
      d.relationships[a!]!.kind = 'spouse';
      d.relationships[a!]!.kindSince = 2055;
      d.relationships[b!]!.kind = 'ex';
      d.relationships[b!]!.wasSpouse = true;
    });
    const text = writeObituary(life, content);
    const spouse = life.people[a!]!;
    const ex = life.people[b!]!;
    expect(text).toContain(`${spouse.name.first} ${spouse.name.last}`);
    expect(text).toContain('2055');
    expect(text).toContain(`${ex.name.first} ${ex.name.last}`);
    expect(text).toMatch(/divorce/);
  });
});

describe('archive entry', () => {
  it('captures a finished life', () => {
    const dead = liveOut(custom('archive-done'));
    const entry = archiveEntry(dead, content);
    expect(entry).toMatchObject({
      id: dead.id,
      name: 'Robin Okafor',
      birthYear: 2026,
      deathYear: dead.currentYear,
      ageAtDeath: dead.character.age,
      causeOfDeath: content.causes[dead.death!.causeId]!.text,
      unfinished: false,
      cityId: 'chicago',
      finalNetWorth: netWorth(dead),
      finalStats: dead.character.stats,
      seed: 'archive-done',
      generation: 1,
    });
    expect(entry.obituary).toBe(writeObituary(dead, content));
    expect(entry.highlights).toEqual(dead.history);
  });

  it('marks a life that is still going as unfinished', () => {
    const life = custom('archive-unfinished');
    const entry = archiveEntry(life, content);
    expect(entry).toMatchObject({ unfinished: true, causeOfDeath: null, ageAtDeath: 0, deathYear: 2026 });
  });

  it('keeps the most important highlights within the limit', () => {
    const history = Array.from({ length: 200 }, (_, i) => ({
      year: 2026 + i,
      age: i,
      text: `entry ${i}`,
      tags: [],
      importance: (i % 10 === 0 ? 3 : 1) as 1 | 3,
    }));
    const kept = selectHighlights(history, content);
    expect(kept).toHaveLength(content.balance.aging.archive.maxHighlights);
    expect(kept.filter((e) => e.importance === 3)).toHaveLength(20);
    expect(kept.map((e) => e.year)).toEqual([...kept.map((e) => e.year)].sort((a, b) => a - b));
  });

  it('counts savings and home value against debts', () => {
    const life = produce(custom('worth') as LifeState, (d) => {
      d.finances.savings = 5000;
      d.housing.homeValue = 100000;
      d.finances.debts.push({ id: 'd1', kind: 'mortgage', balance: 80000, annualRate: 0.05, minPayment: 500, missed: 0 });
    });
    expect(netWorth(life)).toBe(25000);
  });
});
