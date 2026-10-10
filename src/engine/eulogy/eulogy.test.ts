import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { archiveEntry } from '../archive';
import { createRng } from '../rng';
import { renderText, type TextRole } from '../text';
import { cloneJson, lifeAtAge, liveOut } from '../testFixtures';
import { createLife } from '../life';
import type { GenderCategory, KnowledgeItem, LifeState, Relationship, RelationshipKind } from '../types';
import { emptyWeb } from '../web/ties';
import { absenceCauses, expectedGuests, getAttendance } from './attendance';
import { buildEulogy } from './build';
import { chooseSpeaker, couldNotAttend, eligibleSpeakers } from './speaker';
import { writeFuneral } from './funeral';
import { eulogyPieces, reasonPieces } from './pieces';

interface Spec {
  id: string;
  kind: RelationshipKind;
  age?: number;
  category?: GenderCategory;
  affection?: number;
  trust?: number;
  status?: Relationship['status'];
  alive?: boolean;
  cityId?: string;
  memories?: string[];
  wasSpouse?: boolean;
  since?: number;
}

function addPerson(d: LifeState, spec: Spec, template: LifeState['people'][string]): void {
  const category = spec.category ?? 'woman';
  d.people[spec.id] = {
    ...cloneJson(template),
    id: spec.id,
    name: { first: `N${spec.id}`, last: 'Test' },
    birthYear: d.currentYear - (spec.age ?? 40),
    alive: spec.alive ?? true,
    identity: {
      genderIdentity: category,
      genderCategory: category,
      genderExpression: 'neutral',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true },
      attractedTo: ['man', 'woman', 'nonbinary'],
    },
    traits: {},
    cityId: spec.cityId ?? d.character.cityId,
    tags: [spec.kind],
    mood: 60,
    moodBase: 60,
    wealthLevel: 'middle',
  };
  const p = d.people[spec.id]!;
  delete p.child;
  delete p.priorChildren;
  delete p.life;
  delete p.occupation;
  delete p.deathYear;
  if (spec.alive === false) p.deathYear = d.currentYear;
  d.relationships[spec.id] = {
    personId: spec.id,
    kind: spec.kind,
    status: spec.status ?? 'active',
    affection: spec.affection ?? 70,
    trust: spec.trust ?? 70,
    memories: (spec.memories ?? []).map((tag) => ({ tag, year: d.currentYear - 3 })),
    since: spec.since ?? d.currentYear - 20,
    ...(spec.wasSpouse ? { wasSpouse: true } : {}),
  } as Relationship;
}

/** A life that has just ended, with only these people around and nothing in the web. */
function funeralOf(specs: Spec[], seed = 'eulogy-scene', edit: (d: LifeState) => void = () => {}): LifeState {
  return produce(lifeAtAge(seed, 70), (d) => {
    const template = cloneJson(Object.values(d.people)[0]!);
    for (const id of Object.keys(d.people)) {
      delete d.people[id];
      delete d.relationships[id];
    }
    for (const spec of specs) addPerson(d, spec, template);
    d.web = emptyWeb();
    d.phase = 'dead';
    d.death = { year: d.currentYear, age: d.character.age, causeId: Object.keys(content.causes).sort()[0]! };
    edit(d);
  });
}

/** The content with the eulogy balance changed. */
function withEulogy(patch: (b: ContentBundle['balance']['eulogy']) => ContentBundle['balance']['eulogy']): ContentBundle {
  return { ...content, balance: { ...content.balance, eulogy: patch(content.balance.eulogy) } };
}

const item = (over: Partial<KnowledgeItem> & Pick<KnowledgeItem, 'kind' | 'truth'>): KnowledgeItem => ({ id: 'k1', subject: 'you', year: 2090, holders: {}, ...over });

describe('speaker choice', () => {
  it('is the closest living person by affection and trust', () => {
    const dead = funeralOf([
      { id: 'a', kind: 'friend', affection: 70, trust: 60 },
      { id: 'b', kind: 'sibling', affection: 90, trust: 80 },
      { id: 'c', kind: 'child', age: 30, affection: 85, trust: 80 },
    ]);
    const speaker = chooseSpeaker(dead, content)!;
    expect(speaker.personId).toBe('b');
    expect(speaker.group).toBe('sibling');
    expect(speaker.combined).toBe(170);
    expect(eligibleSpeakers(dead, content).map((s) => s.personId)).toEqual(['b', 'c', 'a']);
  });

  it('never picks an estranged person, an ex, someone who has died or is too young, or someone who could not come', () => {
    const dead = funeralOf(
      [
        { id: 'estranged', kind: 'sibling', affection: 100, trust: 100, status: 'estranged' },
        { id: 'ex', kind: 'ex', affection: 100, trust: 100, wasSpouse: true },
        { id: 'gone', kind: 'spouse', affection: 100, trust: 100, alive: false },
        { id: 'young', kind: 'child', age: 8, affection: 100, trust: 100 },
        { id: 'jailed', kind: 'friend', affection: 99, trust: 99 },
        { id: 'faded', kind: 'friend', affection: 99, trust: 99, status: 'ended' },
        { id: 'ok', kind: 'friend', affection: 50, trust: 50 },
      ],
      'eulogy-eligible',
      (d) => {
        d.people.jailed!.life = { ...(Object.values(d.people).find((p) => p.life)?.life ?? ({} as never)), tier: 'close', troubles: [{ kind: 'crime', refId: 'x', since: d.currentYear - 1, severity: 0, treated: false, stage: 'jail', until: d.currentYear + 1 }], partner: null, children: [], recovered: [], gossip: 50, level: 0, levelSince: 0, background: 'middle' };
      },
    );
    expect(couldNotAttend(dead, 'jailed', content)).toBe('prison');
    expect(eligibleSpeakers(dead, content).map((s) => s.personId)).toEqual(['ok']);
  });

  it('breaks a tie for a spouse, then children, then everyone else', () => {
    const tie = { affection: 80, trust: 70 };
    const base: Spec[] = [
      { id: 'friend', kind: 'friend', ...tie },
      { id: 'kid', kind: 'child', age: 30, ...tie },
      { id: 'spouse', kind: 'spouse', ...tie },
    ];
    expect(eligibleSpeakers(funeralOf(base), content).map((s) => s.personId)).toEqual(['spouse', 'kid', 'friend']);
    expect(chooseSpeaker(funeralOf(base.slice(0, 2)), content)!.personId).toBe('kid');
    // Closeness beats the tie-break.
    const closer = funeralOf([{ id: 'friend', kind: 'friend', affection: 90, trust: 80 }, { id: 'spouse', kind: 'spouse', ...tie }]);
    expect(chooseSpeaker(closer, content)!.personId).toBe('friend');
  });

  it('is nobody when no one is close enough', () => {
    const min = content.balance.eulogy.speaker.minCombined;
    const dead = funeralOf([{ id: 'a', kind: 'friend', affection: Math.floor((min - 1) / 2), trust: Math.ceil((min - 1) / 2) }]);
    expect(chooseSpeaker(dead, content)).toBeNull();
    expect(writeFuneral(dead, content)!.eulogy).toBeNull();
    expect(writeFuneral(funeralOf([]), content)!.eulogy).toBeNull();
  });

  it('sets the tone from affection and trust', () => {
    const t = content.balance.eulogy.tone;
    const tone = (combined: number) => chooseSpeaker(funeralOf([{ id: 'a', kind: 'sibling', affection: combined / 2, trust: combined / 2 }]), withEulogy((b) => ({ ...b, speaker: { ...b.speaker, minCombined: 0 } })))!.tone;
    expect(tone(t.warm)).toBe('warm');
    expect(tone(t.cool)).toBe('measured');
    expect(tone(t.cool - 2)).toBe('cool');
  });
});

describe('the eulogy', () => {
  const eulogyOf = (dead: LifeState, bundle: ContentBundle = content) => buildEulogy(dead, bundle, chooseSpeaker(dead, bundle)!, createRng('t'));

  it('tells only memories the speaker holds', () => {
    const dead = funeralOf([
      { id: 'a', kind: 'friend', affection: 90, trust: 90, memories: ['made_peace'] },
      { id: 'b', kind: 'friend', affection: 40, trust: 40, memories: ['took_you_in', 'big_fight'] },
    ]);
    const e = eulogyOf(dead);
    expect(e.speakerName).toBe('Na Test');
    expect(e.pieces).toContain('memory.made_peace');
    expect(e.pieces.filter((p) => p.startsWith('memory.'))).toEqual(['memory.made_peace']);
    expect(e.paragraphs.join(' ')).toContain(content.text.eulogy.memories.made_peace!.line);
  });

  it('tells the stories the speaker believes, twisted or true, and nothing they have not heard', () => {
    const dead = funeralOf([{ id: 'a', kind: 'friend', affection: 90, trust: 90 }, { id: 'o', kind: 'friend', affection: 10, trust: 10 }], 'eulogy-beliefs', (d) => {
      d.web.items = [
        item({ id: 'k1', kind: 'jobLoss', truth: 'laid_off', holders: { a: { version: 'fired_stealing', since: 2090, from: 'o', reacted: true } } }),
        item({ id: 'k2', kind: 'arrest', truth: 'arrested', holders: { o: { version: 'arrested', since: 2090, from: 'saw', reacted: true } } }),
      ];
    });
    const e = eulogyOf(dead);
    expect(e.pieces).toContain('belief.twisted.fired_stealing');
    expect(e.pieces.some((p) => p.includes('arrest'))).toBe(false);
    expect(e.paragraphs.join(' ')).toContain('I heard that she was fired for stealing');
    // Believing the truth reads differently.
    const truthful = produce(dead, (d) => {
      d.web.items[0]!.holders.a!.version = 'laid_off';
    });
    expect(eulogyOf(truthful).pieces).toContain('belief.true.jobLoss');
  });

  it('can show what the speaker never knew, only for a secret they were not told', () => {
    const always = withEulogy((b) => ({ ...b, unknownChance: 1 }));
    const specs: Spec[] = [{ id: 'a', kind: 'friend', affection: 90, trust: 90 }];
    const secret = (holders: KnowledgeItem['holders']) => (d: LifeState) => {
      d.web.items = [item({ kind: 'addiction', truth: 'addiction', holders })];
    };
    expect(eulogyOf(funeralOf(specs, 's', secret({})), always).pieces).toContain('unknown.addiction');
    expect(eulogyOf(funeralOf(specs, 's', secret({ a: { version: 'addiction', since: 2090, from: 'saw', reacted: true } })), always).pieces.some((p) => p.startsWith('unknown.'))).toBe(false);
    // A story about something that is not a secret is not "never known".
    const news = (d: LifeState) => {
      d.web.items = [item({ kind: 'jobLoss', truth: 'fired' })];
    };
    expect(eulogyOf(funeralOf(specs, 's', news), always).pieces.some((p) => p.startsWith('unknown.'))).toBe(false);
  });

  it('mentions moments of your life the speaker would know, and keeps private ones from distant people', () => {
    const both = (d: LifeState) => {
      d.finances.bankruptcyYear = 2080;
    };
    const close = eulogyOf(funeralOf([{ id: 'a', kind: 'sibling', affection: 90, trust: 90 }], 's', both));
    expect(close.pieces).toContain('milestone.bankruptcy');
    const distant = eulogyOf(funeralOf([{ id: 'a', kind: 'friend', affection: 50, trust: 45 }], 's', both), withEulogy((b) => ({ ...b, speaker: { ...b.speaker, minCombined: 0 } })));
    expect(distant.pieces).not.toContain('milestone.bankruptcy');
  });

  it('sounds different for a spouse, a grown child and a distant friend, and by tone', () => {
    const open = (specs: Spec[]) => eulogyOf(funeralOf(specs)).paragraphs[0]!;
    const spouse = open([{ id: 'a', kind: 'spouse', affection: 95, trust: 95 }]);
    const child = open([{ id: 'a', kind: 'child', age: 40, affection: 60, trust: 50 }]);
    const friend = open([{ id: 'a', kind: 'friend', affection: 50, trust: 45 }]);
    expect(new Set([spouse, child, friend]).size).toBe(3);
    expect(spouse).toContain('wife');
    expect(child).toContain('daughter');
    expect(eulogyOf(funeralOf([{ id: 'a', kind: 'spouse', affection: 95, trust: 95 }])).tone).toBe('warm');
    expect(eulogyOf(funeralOf([{ id: 'a', kind: 'child', age: 40, affection: 60, trust: 50 }])).tone).toBe('cool');
  });

  it('is the same every time for the same life, and does not change the life', () => {
    const dead = funeralOf([{ id: 'a', kind: 'spouse', affection: 95, trust: 95, memories: ['married_you', 'made_peace', 'forgave_you'] }]);
    const before = JSON.stringify(dead);
    expect(writeFuneral(dead, content)).toEqual(writeFuneral(dead, content));
    expect(JSON.stringify(dead)).toBe(before);
  });

  it('uses the speaker and your pronouns, never a hardcoded one', () => {
    const dead = funeralOf([{ id: 'a', kind: 'spouse', affection: 95, trust: 95, memories: ['read_to_you', 'cared_for_you', 'stood_by_you'] }], 'eulogy-xe', (d) => {
      d.character.identity.pronouns = { subject: 'xe', object: 'xem', possessive: 'xyr', possessivePronoun: 'xyrs', reflexive: 'xemself', verbPlural: false };
    });
    const text = eulogyOf(dead).paragraphs.join(' ');
    expect(text).toMatch(/\bxe\b|\bXe\b|\bxem\b|\bxyr\b/);
    expect(text).not.toMatch(/\b(he|she|him|her|his|hers|they|them|their)\b/i);
  });
});

describe('who came', () => {
  const certain = withEulogy((b) => ({ ...b, attendance: { ...b.attendance, causes: { ...b.attendance.causes, estranged: 1, feud: 1, ex: 1, rumor: 1, distrust: 1, distant: 1, far: 1 } } }));

  it('lists people who chose to stay away with a reason that fits, and sets aside those who could not come', () => {
    const dead = funeralOf(
      [
        { id: 'speaker', kind: 'spouse', affection: 95, trust: 95 },
        { id: 'cut', kind: 'sibling', affection: 60, trust: 60, status: 'estranged', memories: ['you_cut_them_off'] },
        { id: 'ex', kind: 'ex', affection: 60, trust: 60, wasSpouse: true, memories: ['divorced'] },
        { id: 'dated', kind: 'ex', affection: 60, trust: 60 },
        { id: 'far', kind: 'friend', affection: 45, trust: 45, cityId: 'elsewhere' },
        { id: 'loyal', kind: 'child', age: 35, affection: 90, trust: 85 },
        { id: 'jailed', kind: 'friend', affection: 70, trust: 70 },
        { id: 'faded', kind: 'friend', affection: 10, trust: 10, status: 'ended' },
        { id: 'young', kind: 'child', age: 6, affection: 5, trust: 5 },
      ],
      'eulogy-attendance',
      (d) => {
        d.people.jailed!.life = { tier: 'close', troubles: [{ kind: 'crime', refId: 'x', since: d.currentYear - 1, severity: 0, treated: false, stage: 'jail', until: d.currentYear + 1 }], partner: null, children: [], recovered: [], gossip: 50, level: 0, levelSince: 0, background: 'middle' } as never;
      },
    );
    const f = writeFuneral(dead, certain)!;
    expect(f.eulogy!.speakerName).toBe('Nspeaker Test');
    const names = f.notAttending.map((g) => g.name);
    // A friend you were not close to is not expected, a faded friend and a young child never are, and an ex you never married is not.
    expect(names).toEqual(expect.arrayContaining(['Ncut Test', 'Nex Test']));
    expect(names).not.toContain('Nloyal Test');
    expect(names).not.toContain('Nfaded Test');
    expect(names).not.toContain('Nyoung Test');
    expect(names).not.toContain('Ndated Test');
    // A friend you were fairly close to who lived in another city is expected, and chose not to make the trip.
    expect(names).toContain('Nfar Test');
    expect(names).not.toContain('Njailed Test');
    expect(f.couldNotAttend.map((g) => [g.name, g.reason])).toEqual([['Njailed Test', content.text.eulogy.couldNot.prison[0]]]);
    // The reasons name what is true of them.
    const reasonOf = (name: string) => f.notAttending.find((g) => g.name === name)!.reason;
    expect(content.text.eulogy.absent.estranged.memory.you_cut_them_off).toBeDefined();
    expect(reasonOf('Ncut Test')).toMatch(/cut out of your life|estranged|speaking|restart|stayed that way/);
    expect(reasonOf('Nex Test')).toMatch(/ex|marriage/);
    expect(f.notAttending.find((g) => g.name === 'Ncut Test')!.relation).toBe('sister');
  });

  it('never lists someone who has no cause to stay away, and never lists a person twice', () => {
    for (let i = 0; i < 60; i++) {
      const dead = funeralOf([
        { id: 'speaker', kind: 'spouse', affection: 95, trust: 95 },
        { id: 'a', kind: 'sibling', affection: 85, trust: 85 },
        { id: 'b', kind: 'friend', affection: 85, trust: 85 },
        { id: 'c', kind: 'sibling', affection: 20, trust: 30 },
        { id: 'd', kind: 'child', age: 30, affection: 20, trust: 20, status: 'estranged' },
      ], `eulogy-causes-${i}`);
      const f = writeFuneral(dead, content)!;
      const listed = f.notAttending.map((g) => g.name);
      expect(new Set(listed).size).toBe(listed.length);
      for (const name of listed) {
        const id = name.replace(/^N|\sTest$/g, '');
        expect(absenceCauses(dead, id, 'speaker', content).length, name).toBeGreaterThan(0);
      }
      expect(listed).not.toContain('Na Test');
      expect(listed).not.toContain('Nb Test');
    }
  });

  it('lists a person who sided against, or a feud with the speaker, with a reason about the feud', () => {
    const dead = funeralOf(
      [
        { id: 'speaker', kind: 'spouse', affection: 95, trust: 95 },
        { id: 'sore', kind: 'friend', affection: 90, trust: 90 },
        { id: 'rival', kind: 'friend', affection: 90, trust: 90 },
      ],
      'eulogy-feud',
      (d) => {
        d.web.ties['rival|speaker'] = { a: 'rival', b: 'speaker', kind: 'friends', affection: 10, origin: 'context', since: 2000, feud: { since: 2085 } };
        d.web.ties['sore|speaker'] = { a: 'sore', b: 'speaker', kind: 'friends', affection: 10, origin: 'context', since: 2000, feud: { since: 2085, side: 'speaker' } };
      },
    );
    const attendance = getAttendance(dead, certain, 'speaker', createRng('feud'));
    const byName = Object.fromEntries(attendance.notAttending.map((g) => [g.name, g.reason]));
    expect(content.text.eulogy.absent.feud.speaker.some((t) => byName['Nrival Test'] === renderText(t, { roles: { self: { name: dead.character.name, pronouns: dead.character.identity.pronouns }, npc: { name: dead.people.rival!.name, pronouns: dead.people.rival!.identity.pronouns } }, values: { speaker: 'Nspeaker' } }))).toBe(true);
    expect(byName['Nsore Test']).toContain('the other side');
  });

  it('caps the list at the balance maximum and counts the rest', () => {
    const many: Spec[] = [{ id: 'speaker', kind: 'spouse', affection: 95, trust: 95 }];
    for (let i = 0; i < 12; i++) many.push({ id: `s${i}`, kind: 'sibling', affection: 50, trust: 50, status: 'estranged' });
    const f = writeFuneral(funeralOf(many), certain)!;
    expect(f.notAttending.length).toBe(content.balance.eulogy.attendance.maxListed);
    expect(f.moreNotAttending).toBe(12 - content.balance.eulogy.attendance.maxListed);
  });

  it('expects family, partners, married exes and close friends, and nobody who is dead or has faded', () => {
    const dead = funeralOf([
      { id: 'p', kind: 'parent', age: 90, affection: 5, trust: 5 },
      { id: 'dead', kind: 'sibling', alive: false },
      { id: 'f1', kind: 'friend', affection: 60, trust: 30 },
      { id: 'f2', kind: 'friend', affection: 30, trust: 30 },
      { id: 'w', kind: 'coworker', affection: 40, trust: 40 },
      { id: 'ex', kind: 'ex', wasSpouse: true },
    ]);
    expect(expectedGuests(dead, content)).toEqual(['ex', 'f1', 'p']);
  });
});

describe('every piece of text', () => {
  const sets = ['she_her', 'he_him', 'they_them', 'xe_xem'].map((id) => content.pronouns[id]!);

  it('has about 150 pieces', () => {
    const n = eulogyPieces(content).length + reasonPieces(content).length;
    expect(n).toBeGreaterThanOrEqual(110);
    expect(n).toBeLessThanOrEqual(170);
  });

  it('renders with four pronoun sets, with nothing left unfilled and no hardcoded pronoun', () => {
    const values = { known: '41 years', age: 80, year: 2096, since: 'three years ago', title: 'senior accountant', employer: 'Ledgerwise Partners', years: '40 years', partner: 'Sam', children: 'two children', n: 2, heard: 'that you were arrested', speaker: 'Sam' };
    for (const preset of sets) {
      const role = (first: string): TextRole => ({ name: { first, last: 'Ruiz' }, pronouns: preset, relation: 'sister', city: 'Chicago' });
      for (const piece of [...eulogyPieces(content), ...reasonPieces(content)]) {
        const text = renderText(piece.template, { roles: { self: role('Ana'), npc: role('Bo'), other: role('Cy') }, values });
        expect(text, piece.id).not.toMatch(/[{}]/);
        expect(text, piece.id).not.toMatch(/\s{2,}/);
        if (preset.id === 'they_them') expect(text, piece.id).not.toMatch(/\b[Tt]hey (is|was|has|does)\b/);
        if (preset.id === 'he_him') expect(text, piece.id).not.toMatch(/\b[Hh]e (are|were|have)\b/);
        if (preset.id === 'xe_xem') expect(text, piece.id).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
      }
    }
  });

  it('is not bound to one voice: pieces are first person for the speaker and never speak as the dead', () => {
    for (const piece of eulogyPieces(content)) expect(piece.template, piece.id).not.toMatch(/\bI died\b/);
  });
});

describe('funerals of lives that ended', () => {
  const lives = Array.from({ length: 24 }, (_, i) => liveOut(createLife({ mode: 'random', seed: `funeral-${i}`, birthYear: 2026 }, content)));

  it('has the closest eligible speaker, and a reason for everyone who stayed away', () => {
    let spoke = 0;
    for (const dead of lives) {
      const f = writeFuneral(dead, content)!;
      const best = eligibleSpeakers(dead, content)[0];
      if (!best) {
        expect(f.eulogy).toBeNull();
        continue;
      }
      spoke += 1;
      const person = dead.people[best.personId]!;
      expect(f.eulogy!.speakerName).toBe(`${person.name.first} ${person.name.last}`);
      expect(f.eulogy!.paragraphs.length).toBeGreaterThan(0);
      const rel = dead.relationships[best.personId]!;
      expect(rel.status).toBe('active');
      expect(person.alive).toBe(true);
      const expected = new Set(expectedGuests(dead, content).map((id) => `${dead.people[id]!.name.first} ${dead.people[id]!.name.last}`));
      for (const g of f.notAttending) {
        expect(expected.has(g.name), g.name).toBe(true);
        expect(g.reason.length).toBeGreaterThan(0);
        expect(g.reason).not.toMatch(/[{}]/);
      }
      expect(f.notAttending.length + f.moreNotAttending + f.couldNotAttend.length).toBeLessThanOrEqual(expected.size);
    }
    expect(spoke).toBeGreaterThan(0);
  });

  it('goes into the archive entry for a finished life and not for one set aside', () => {
    const dead = lives[0]!;
    expect(archiveEntry(dead, content).funeral).toEqual(writeFuneral(dead, content));
    expect(archiveEntry(dead, content).funeral).not.toBeNull();
    const living = createLife({ mode: 'random', seed: 'still-living', birthYear: 2026 }, content);
    expect(archiveEntry(living, content).funeral).toBeNull();
    expect(writeFuneral(living, content)).toBeNull();
  });
});
