import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { performAction } from '../actions';
import { archiveEntry } from '../archive';
import { availableInteractions } from '../interactions/availability';
import { checkInvariants } from '../invariants';
import { endYear } from '../life';
import { defaultLife } from '../lives/model';
import { createRng } from '../rng';
import { renderText } from '../text';
import { cloneJson, lifeAtAge } from '../testFixtures';
import { pruneWeb } from '../web/ties';
import { askedSpeaker, chooseSpeaker, getAttendance, writeFuneral } from '../eulogy';
import { continueAsHeir } from '../estate/heir';
import { die, parentLife } from '../estate/fixtures';
import { funeralCost } from '../estate/settle';
import type { LifeState, Person, Relationship } from '../types';
import { amendsCandidates, runAmends } from './amends';
import { canChooseCare, careChance, careProviders, chooseCare, runCare } from './care';
import { canRaise, createGrandchild, raiseGrandchild, returnGrandchild, runGrandchildren } from './grandchildren';
import { emptyLater, grandchildren, laterHolds, raisedGrandchildren, willOutOfDate } from './query';
import { reviewOptions, writeReview } from './review';
import { canSetWishes, hospiceCost, parseWishes, setWishes, terminalDeathChance } from './terminal';

/** A person to copy (the engine fills in the rest of what a person has). */
const TEMPLATE: Person = Object.values(lifeAtAge('l1-template', 40).people)[0]!;

/** A person of a given kind added to a life. */
function addPerson(d: LifeState, id: string, kind: Relationship['kind'], opts: { age?: number; affection?: number; trust?: number; status?: Relationship['status']; memories?: string[]; cityId?: string; first?: string } = {}): void {
  const template = cloneJson(TEMPLATE);
  const person: Person = {
    ...template,
    id,
    name: { first: opts.first ?? `P${id}`, last: 'Test' },
    birthYear: d.currentYear - (opts.age ?? 40),
    alive: true,
    tags: [],
    cityId: opts.cityId ?? d.character.cityId,
    identity: { ...cloneJson(d.character.identity), genderCategory: 'woman', genderIdentity: 'woman', attractedTo: ['man', 'woman', 'nonbinary'], pronouns: { subject: 'she', object: 'her', possessive: 'her', possessivePronoun: 'hers', reflexive: 'herself', verbPlural: false } },
    traits: { kindness: 60, discipline: 50, sociability: 50, confidence: 50, ambition: 50, riskTaking: 50 },
    mood: 60,
    moodBase: 60,
    wealthLevel: 'middle',
  };
  delete person.child;
  delete person.priorChildren;
  delete person.deathYear;
  delete person.occupation;
  delete person.life;
  if (kind === 'child' || kind === 'stepchild') {
    person.child = { origin: 'birth', custody: 'you', custodyDecided: true, health: 70, happiness: 60, fitness: 50, stress: 30, geneticRisk: 30, talent: null, gpa: 0, latent: {}, movedOutYear: d.currentYear - 15 };
  }
  d.people[id] = person;
  d.relationships[id] = { personId: id, kind, status: opts.status ?? 'active', affection: opts.affection ?? 70, trust: opts.trust ?? 70, memories: (opts.memories ?? []).map((tag) => ({ tag, year: d.currentYear - 3 })), since: d.currentYear - 20 };
}

/** A grandparent: age 66, a grown child with a baby in the child's summary, nobody else. */
function grandparent(seed = 'l1-grand'): LifeState {
  return produce(lifeAtAge(seed, 66), (d) => {
    for (const id of Object.keys(d.people)) {
      delete d.people[id];
      delete d.relationships[id];
    }
    addPerson(d, 'kid', 'child', { age: 36, first: 'Dana' });
    d.relationships.kid!.parenting = { warmth: 60, strictness: 50, involvement: 50 };
    d.people.kid!.life = { ...defaultLife(d, d.people.kid!, d.relationships.kid, content), children: [{ first: 'Maya', birthYear: d.currentYear }] };
    d.finances.savings = 200_000;
    pruneWeb(d);
  });
}

describe('grandchildren', () => {
  it('become people on your list when your child has a baby, tied to the child, living where the child does', () => {
    const life = produce(grandparent(), (d) => runGrandchildren(d, content));
    const kids = grandchildren(life);
    expect(kids).toHaveLength(1);
    const kid = kids[0]!;
    expect(kid.name.first).toBe('Maya');
    expect(kid.name.last).toBe('Test');
    expect(kid.grandchild.parentId).toBe('kid');
    expect(life.relationships[kid.id]!.kind).toBe('grandchild');
    expect(life.relationships[kid.id]!.status).toBe('active');
    expect(kid.cityId).toBe(life.people.kid!.cityId);
    expect(life.people.kid!.life!.children[0]!.id).toBe(kid.id);
    expect(life.history.some((h) => h.tags.includes('grandchild'))).toBe(true);
    // (The first grandchild's event waits for the pacing step to pick it up.)
    expect(life.scheduled.map((s) => s.eventId)).toEqual(['first_grandchild']);
    expect(checkInvariants({ ...life, scheduled: [] }, content)).toEqual([]);
  });

  it('are made once, however many years pass', () => {
    const once = produce(grandparent(), (d) => runGrandchildren(d, content));
    const twice = produce(once, (d) => runGrandchildren(d, content));
    expect(Object.values(twice.people).filter((p) => p.grandchild)).toHaveLength(1);
  });

  it('follow their parent to a new city until they are grown', () => {
    const born = produce(grandparent(), (d) => runGrandchildren(d, content));
    const other = Object.keys(content.cities).find((c) => c !== born.character.cityId)!;
    const moved = produce(born, (d) => {
      d.people.kid!.cityId = other;
      runGrandchildren(d, content);
    });
    expect(grandchildren(moved)[0]!.cityId).toBe(other);
  });

  it('get the grandparent interactions of the E1 menu, and the everyday ones', () => {
    const life = produce(grandparent(), (d) => runGrandchildren(d, content));
    const kid = grandchildren(life)[0]!;
    const young = produce(life, (d) => {
      d.people[kid.id]!.birthYear = d.currentYear - 6;
    });
    const ids = availableInteractions(young, kid.id, content).map((i) => i.id);
    for (const id of ['babysit', 'spoil_them', 'teach_them', 'chat', 'hug', 'spend_time', 'give_gift']) expect(ids).toContain(id);
    // A baby cannot be taught; an adult grandchild is not looked after.
    const baby = availableInteractions(life, kid.id, content).map((i) => i.id);
    expect(baby).not.toContain('teach_them');
    expect(baby).toContain('babysit');
    const adult = produce(life, (d) => {
      d.people[kid.id]!.birthYear = d.currentYear - 25;
    });
    expect(availableInteractions(adult, kid.id, content).map((i) => i.id)).not.toContain('babysit');
    // Playing favorites needs a second grandchild.
    expect(ids).not.toContain('make_favorite');
    // The parenting group is for children: none for a grandchild.
    expect(availableInteractions(young, kid.id, content).some((i) => i.group === 'parenting')).toBe(false);
  });

  it('are never a support person for a crisis, and are family', () => {
    const life = produce(grandparent(), (d) => runGrandchildren(d, content));
    expect(content.text.relations.grandchild.woman).toBe('granddaughter');
    const rel = life.relationships[grandchildren(life)[0]!.id]!;
    expect(rel.kind).toBe('grandchild');
  });

  it('last year\'s babysitting warms the parent; spoiling someone\'s child costs some trust', () => {
    const base = produce(grandparent(), (d) => runGrandchildren(d, content));
    const kid = grandchildren(base)[0]!;
    const before = base.relationships.kid!;
    const played = produce(base, (d) => {
      d.currentYear += 1;
      d.relationships[kid.id]!.interactions = { year: d.currentYear - 1, counts: { babysit: 1, spoil_them: 1 }, gained: { affection: 0, trust: 0 }, annoyed: false };
      runGrandchildren(d, content);
    });
    const after = played.relationships.kid!;
    const help = content.balance.later.grandchildren.help;
    expect(after.affection).toBe(before.affection + help.babysitParentAffection);
    expect(after.trust).toBe(before.trust + help.babysitParentTrust + help.spoilParentTrust);
  });

  it('playing favorites costs the other grandchildren, and the story comes out', () => {
    const base = produce(grandparent(), (d) => {
      d.people.kid!.life!.children.push({ first: 'Noor', birthYear: d.currentYear - 2 });
      runGrandchildren(d, content);
    });
    const [a, b] = grandchildren(base);
    const favored = produce(base, (d) => {
      d.relationships[a!.id]!.memories.push({ tag: 'your_favorite', year: d.currentYear });
      runGrandchildren(d, content);
    });
    expect(favored.relationships[b!.id]!.affection).toBeLessThan(base.relationships[b!.id]!.affection);
    expect(favored.relationships[a!.id]!.affection).toBe(base.relationships[a!.id]!.affection);
    expect(favored.scheduled.some((s) => s.eventId === 'grandchild_favorite_noticed' && s.cast.kid === b!.id)).toBe(true);
  });
});

describe('raising a grandchild (guardianship)', () => {
  const born = () => produce(grandparent('l1-raise'), (d) => runGrandchildren(d, content));

  it('makes the grandchild your child, with the usual parenting and costs, and offers the event when their parent cannot', () => {
    const life = born();
    const kid = grandchildren(life)[0]!;
    const troubled = produce(life, (d) => {
      d.scheduled = [];
      d.people.kid!.life!.troubles.push({ kind: 'addiction', refId: 'alcohol_addiction', since: d.currentYear - 1, severity: 60, treated: false });
      d.people[kid.id]!.birthYear = d.currentYear - 6;
      runGrandchildren(d, content);
    });
    expect(troubled.scheduled.some((s) => s.eventId === 'raise_parent_cannot' && s.cast.kid === kid.id && s.cast.parent === 'kid')).toBe(true);

    expect(canRaise(troubled, kid.id, content)).toBe(true);
    const raised = produce(troubled, (d) => raiseGrandchild(d, kid.id, createRng('raise'), content));
    const person = raised.people[kid.id]!;
    expect(raised.relationships[kid.id]!.kind).toBe('child');
    expect(person.child?.origin).toBe('grandchild');
    expect(person.child?.custody).toBe('you');
    expect(person.grandchild?.parentId).toBe('kid');
    expect(person.cityId).toBe(raised.character.cityId);
    expect(raisedGrandchildren(raised).map((p) => p.id)).toEqual([kid.id]);
    expect(grandchildren(raised)).toHaveLength(0);
    expect(laterHolds({ raising: true }, raised)).toBe(true);
    // E2a's parenting interactions now apply.
    expect(availableInteractions(raised, kid.id, content).some((i) => i.group === 'parenting')).toBe(true);
    expect(checkInvariants({ ...raised, scheduled: [] }, content)).toEqual([]);
  });

  it('cannot take in a grown grandchild, and gives one back to their parent', () => {
    const life = born();
    const kid = grandchildren(life)[0]!;
    const grown = produce(life, (d) => {
      d.people[kid.id]!.birthYear = d.currentYear - 30;
    });
    expect(canRaise(grown, kid.id, content)).toBe(false);
    const raised = produce(life, (d) => raiseGrandchild(d, kid.id, createRng('r'), content));
    const back = produce(raised, (d) => returnGrandchild(d, kid.id, content));
    expect(back.relationships[kid.id]!.kind).toBe('grandchild');
    expect(back.people[kid.id]!.child).toBeUndefined();
    expect(back.relationships[kid.id]!.parenting).toBeUndefined();
    expect(checkInvariants({ ...back, scheduled: [] }, content)).toEqual([]);
  });

  it('is a path to heir play: the grandchild can carry on, knowing you as a grandparent and their parent as a parent', () => {
    const raised = produce(born(), (d) => {
      const id = grandchildren(d)[0]!.id;
      raiseGrandchild(d, id, createRng('r'), content);
    });
    const dead = die(raised);
    const id = raisedGrandchildren(raised)[0]!.id;
    const heir = continueAsHeir(dead, id, content);
    const kinds = Object.values(heir.relationships).map((r) => r.kind);
    expect(kinds).toContain('grandparent');
    expect(kinds).toContain('parent');
    const parentRel = Object.values(heir.relationships).find((r) => r.kind === 'parent')!;
    expect(heir.people[parentRel.personId]!.name.first).toBe('Dana');
    expect(checkInvariants(heir, content)).toEqual([]);
  });
});

describe('care near the end', () => {
  const old = (seed = 'l1-care') =>
    produce(lifeAtAge(seed, 84), (d) => {
      for (const id of Object.keys(d.people)) {
        delete d.people[id];
        delete d.relationships[id];
      }
      d.character.stats.health = 35;
      d.finances.savings = 300_000;
      d.housing = { kind: 'owned', cityId: d.character.cityId, annualCost: 0, homeValue: 400_000, since: d.currentYear - 30 };
      pruneWeb(d);
    });

  it('is rolled only from the care age, and more likely with age and poor health', () => {
    const young = lifeAtAge('l1-care-young', 60);
    expect(careChance(young, content)).toBe(0);
    const a = produce(old(), (d) => {
      d.character.age = 75;
    });
    const b = produce(old(), (d) => {
      d.character.age = 90;
    });
    expect(careChance(a, content)).toBeGreaterThan(0);
    expect(careChance(b, content)).toBeGreaterThan(careChance(a, content));
    const healthy = produce(old(), (d) => {
      d.character.stats.health = 90;
    });
    expect(careChance(healthy, content)).toBeLessThan(careChance(old(), content));
    // A life already in care is not asked again.
    expect(careChance(produce(old(), (d) => void (d.later.care = { since: d.currentYear, option: null, declined: [] })), content)).toBe(0);
  });

  it('is offered to relatives in order of the ties: a spouse first, then the child who feels closest; the estranged only if they still care', () => {
    const life = produce(old(), (d) => {
      addPerson(d, 'sp', 'spouse', { age: 82, affection: 60, trust: 60 });
      addPerson(d, 'k1', 'child', { age: 55, affection: 90, trust: 90 });
      addPerson(d, 'k2', 'child', { age: 50, affection: 70, trust: 70 });
      addPerson(d, 'k3', 'child', { age: 48, affection: 40, trust: 40, status: 'estranged' });
      addPerson(d, 'k4', 'child', { age: 45, affection: 5, trust: 5, status: 'estranged' });
      addPerson(d, 'f1', 'friend', { age: 80, affection: 90, trust: 90 });
      d.later.care = { since: d.currentYear, option: null, declined: [] };
    });
    const providers = careProviders(life, content);
    expect(providers.map((p) => p.id)).toEqual(['sp', 'k1', 'k2', 'k3']);
    expect(providers.find((p) => p.id === 'k3')!.returning).toBe(true);
    // The friend is never asked, and the estranged child who feels nothing is not either.
    expect(providers.some((p) => p.id === 'f1' || p.id === 'k4')).toBe(false);
  });

  it('family care brings the relative close and ends an estrangement; paid care is charged by the ledger; assisted living is housing', () => {
    const life = produce(old(), (d) => {
      addPerson(d, 'k3', 'child', { age: 48, affection: 50, trust: 50, status: 'estranged', cityId: Object.keys(content.cities).find((c) => c !== d.character.cityId)! });
      d.later.care = { since: d.currentYear, option: null, declined: [] };
      pruneWeb(d);
    });
    const family = produce(life, (d) => chooseCare(d, 'family', 'k3', content));
    expect(family.later.care!.option).toBe('family');
    expect(family.later.care!.providerId).toBe('k3');
    expect(family.people.k3!.cityId).toBe(family.character.cityId);
    expect(family.relationships.k3!.status).toBe('active');
    expect(family.relationships.k3!.memories.some((m) => m.tag === 'looks_after_you')).toBe(true);

    expect(canChooseCare(life, 'family', 'nobody', content)).toBe(false);
    const paid = produce(life, (d) => chooseCare(d, 'paid', undefined, content));
    expect(paid.later.care!.option).toBe('paid');
    const cost = content.balance.later.care.cost.paid * (content.cities[paid.character.cityId]?.costOfLiving ?? 1);
    const ledgered = produce(paid, (d) => {
      d.finances.savings = 300_000;
    });
    expect(Math.round(cost)).toBeGreaterThan(0);
    expect(ledgered.later.care!.option).toBe('paid');

    const assisted = produce(life, (d) => chooseCare(d, 'assisted', undefined, content));
    expect(assisted.later.care!.option).toBe('assisted');
    expect(assisted.housing.kind).toBe('renting');
    expect(assisted.housing.assisted).toBeDefined();
    expect(assisted.housing.homeValue).toBeUndefined();
    expect(assisted.finances.savings).toBeGreaterThan(life.finances.savings);
    expect(assisted.housing.annualCost).toBeGreaterThan(0);
    expect(checkInvariants(assisted, content)).toEqual([]);
    // Moving out of assisted living ends that care.
    const out = produce(assisted, (d) => {
      d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      runCare(d, content);
    });
    expect(out.later.care!.option).toBeNull();
  });

  it('is settled by the family or paid care when you leave it, and a provider who gives out reopens it', () => {
    const waiting = produce(old(), (d) => {
      addPerson(d, 'k1', 'child', { age: 55, affection: 90, trust: 90 });
      d.later.care = { since: d.currentYear - content.balance.later.care.defaultAfterYears, option: null, declined: [] };
    });
    const settled = produce(waiting, (d) => runCare(d, content));
    expect(settled.later.care!.option).toBe('family');
    expect(settled.later.care!.providerId).toBe('k1');
    const lonely = produce(waiting, (d) => {
      delete d.people.k1;
      delete d.relationships.k1;
      runCare(d, content);
    });
    expect(lonely.later.care!.option).toBe('paid');
    const gone = produce(settled, (d) => {
      d.people.k1!.alive = false;
      d.people.k1!.deathYear = d.currentYear;
      runCare(d, content);
    });
    expect(gone.later.care!.option).toBeNull();
    expect(gone.later.care!.declined).toContain('k1');
  });
});

describe('a death you see coming', () => {
  const dying = () =>
    produce(parentLife({ seed: 'l1-terminal', age: 80, kids: [50, 46], spouse: true, savings: 90_000 }), (d) => {
      d.later.terminal = { since: d.currentYear, causeId: 'cancer', conditionId: 'cancer', hospice: null, service: null, letters: [], visitors: [], visits: [] };
    });

  it('carries a death chance that rises with each year since the warning', () => {
    const t = dying();
    const chances = [0, 1, 2, 3, 6].map((years) => terminalDeathChance(produce(t, (d) => void (d.currentYear += years)), content));
    expect(chances[0]!).toBeLessThan(chances[1]!);
    expect(chances[1]!).toBeLessThan(chances[2]!);
    expect(chances[2]!).toBeLessThan(chances[3]!);
    expect(chances[4]).toBe(chances[3]);
    expect(terminalDeathChance(lifeAtAge('l1-none', 80), content)).toBe(0);
  });

  it('validates final wishes against the people who exist and the limits', () => {
    const t = dying();
    const ids = Object.keys(t.relationships).filter((id) => t.relationships[id]!.kind === 'child');
    expect(canSetWishes(t)).toBe(true);
    expect(canSetWishes(lifeAtAge('l1-none', 80))).toBe(false);
    expect(parseWishes({ hospice: 'hospice', service: 'simple', speakerId: ids[0], letters: [ids[1]], visitors: ids }, t, content)).not.toBeNull();
    expect(parseWishes({ hospice: 'nowhere' }, t, content)).toBeNull();
    expect(parseWishes({ service: 'grand' }, t, content)).toBeNull();
    expect(parseWishes({ visitors: ['stranger'] }, t, content)).toBeNull();
    expect(parseWishes({ visitors: [ids[0], ids[0]] }, t, content)).toBeNull();
    expect(parseWishes({ speakerId: 'stranger' }, t, content)).toBeNull();
    const many = Object.keys(t.relationships).slice(0, content.balance.later.terminal.maxVisitors + 1);
    if (many.length > content.balance.later.terminal.maxVisitors) expect(parseWishes({ visitors: many }, t, content)).toBeNull();
    // Through the action, too.
    expect(() => performAction(lifeAtAge('l1-none', 80), 'set_final_wishes', { wishes: {} }, content)).toThrow();
    const done = performAction(t, 'set_final_wishes', { wishes: { hospice: 'home', service: 'celebration', speakerId: ids[0], letters: [ids[1]], visitors: ids } }, content);
    expect(done.later.terminal!.hospice).toBe('home');
    expect(done.later.terminal!.wishesYear).toBe(done.currentYear);
    expect(done.later.terminal!.visits.map((v) => v.id).sort()).toEqual([...ids].sort());
    expect(hospiceCost(done, content)).toBeGreaterThan(0);
  });

  it('sends a letter that warms its reader, and the people you ask either come or do not', () => {
    const t = dying();
    const ids = Object.keys(t.relationships).filter((id) => t.relationships[id]!.kind === 'child');
    const before = t.relationships[ids[1]!]!.affection;
    const done = produce(t, (d) => {
      setWishes(d, { hospice: 'hospice', service: null, speakerId: null, letters: [ids[1]!], visitors: ids }, createRng('wishes'), content);
    });
    expect(done.relationships[ids[1]!]!.affection).toBe(Math.min(100, before + content.balance.later.terminal.letter.affection));
    expect(done.relationships[ids[1]!]!.memories.some((m) => m.tag === 'got_your_letter')).toBe(true);
    for (const v of done.later.terminal!.visits) {
      const tags = done.relationships[v.id]!.memories.map((m) => m.tag);
      expect(tags.includes('at_your_bedside')).toBe(v.came);
      expect(tags.includes('stayed_away_at_the_end')).toBe(!v.came);
    }
    expect(checkInvariants(done, content)).toEqual([]);
  });

  it('shapes the funeral: the speaker you asked, who was at the bedside, who did not come, and the cost of the service', () => {
    const t = dying();
    const ids = Object.keys(t.relationships).filter((id) => t.relationships[id]!.kind === 'child');
    const far = produce(t, (d) => {
      // The child you ask to speak feels less than the other; and the one you invited does not come.
      d.relationships[ids[0]!]!.affection = 40;
      d.relationships[ids[0]!]!.trust = 55;
      d.relationships[ids[1]!]!.affection = 90;
      d.relationships[ids[1]!]!.trust = 90;
      d.later.terminal!.speakerId = ids[0]!;
      d.later.terminal!.service = 'simple';
      d.later.terminal!.hospice = 'hospice';
      d.later.terminal!.letters = [];
      d.later.terminal!.visitors = ids;
      d.later.terminal!.visits = [
        { id: ids[0]!, came: true },
        { id: ids[1]!, came: false },
      ];
      d.later.terminal!.wishesYear = d.currentYear;
    });
    const dead = die(far);
    // Without the wish, the closest would speak.
    const without = produce(dead, (d) => {
      d.later.terminal!.speakerId = undefined as never;
      delete d.later.terminal!.speakerId;
    });
    expect(chooseSpeaker(without, content)!.personId).not.toBe(ids[0]);
    expect(askedSpeaker(dead, content)!.personId).toBe(ids[0]);
    const funeral = writeFuneral(dead, content)!;
    expect(funeral.eulogy!.speakerName).toBe(`${dead.people[ids[0]!]!.name.first} ${dead.people[ids[0]!]!.name.last}`);
    expect(funeral.lastDays).toBeDefined();
    expect(funeral.lastDays!.foreseen).toBe(true);
    expect(funeral.lastDays!.hospice).toBe('hospice');
    expect(funeral.lastDays!.service).toBe('simple');
    expect(funeral.lastDays!.bedside.map((g) => g.name)).toEqual([`${dead.people[ids[0]!]!.name.first} ${dead.people[ids[0]!]!.name.last}`]);
    // The one who was asked and did not come is listed as staying away (and their reason says so).
    const missing = `${dead.people[ids[1]!]!.name.first} ${dead.people[ids[1]!]!.name.last}`;
    const away = getAttendance(dead, content, ids[0], createRng('att')).notAttending.find((g) => g.name === missing);
    expect(away).toBeDefined();
    expect(away!.reason.length).toBeGreaterThan(10);
    // A simple service costs less than the usual one.
    const plain = produce(dead, (d) => {
      d.later.terminal!.service = 'traditional';
    });
    expect(funeralCost(dead, content)).toBeLessThan(funeralCost(plain, content));
    expect(dead.estate!.costs).toBeGreaterThan(0);
  });

  it('the foreseen death is put down to the cause behind it', () => {
    const t = produce(dying(), (d) => {
      d.phase = 'yearEnd';
      d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
      d.currentYear += 20;
      d.character.age += 20;
    });
    const heavy: ContentBundle = { ...content, balance: { ...content.balance, mortality: { ...content.balance.mortality, background: 0, ageCurve: { ...content.balance.mortality.ageCurve, base: 0 } }, later: { ...content.balance.later, terminal: { ...content.balance.later.terminal, deathChance: [1, 1] } } } };
    const done = endYear(produce(t, (d) => void (d.later.terminal!.since = d.currentYear)), heavy);
    expect(done.phase).toBe('dead');
    expect(done.death!.causeId).toBe('cancer');
  });

  it('is a will prompt: a will that leaves out a grandchild or names the dead is out of date', () => {
    const t = dying();
    expect(willOutOfDate(t)).toBe(true);
    const kids = Object.keys(t.relationships).filter((id) => ['child', 'spouse'].includes(t.relationships[id]!.kind));
    const share = Math.floor(100 / kids.length);
    const written = produce(t, (d) => {
      d.will = { shares: kids.map((id, i) => ({ kind: 'person' as const, id, percent: i === 0 ? 100 - share * (kids.length - 1) : share })) };
    });
    expect(willOutOfDate(written)).toBe(false);
    const gone = produce(written, (d) => {
      d.people[kids[1]!]!.alive = false;
    });
    expect(willOutOfDate(gone)).toBe(true);
    expect(laterHolds({ willOutOfDate: true }, gone)).toBe(true);
    expect(laterHolds({ terminal: true, hospice: ['none'] }, written)).toBe(true);
  });
});

describe('amends', () => {
  const quiet = () =>
    produce(lifeAtAge('l1-amends', 62), (d) => {
      for (const id of Object.keys(d.people)) {
        delete d.people[id];
        delete d.relationships[id];
      }
    });

  it('come from nothing in a life with nothing unresolved', () => {
    const life = produce(quiet(), (d) => {
      addPerson(d, 'f', 'friend', { age: 60, affection: 80, trust: 80 });
      addPerson(d, 'k', 'child', { age: 35, affection: 80, trust: 80 });
    });
    expect(amendsCandidates(life, content)).toEqual([]);
    const after = produce(life, (d) => runAmends(d, content));
    expect(after.scheduled).toEqual([]);
  });

  it('come from a tie that is estranged, cold, or marked by a memory you regret, and from a goal you gave up', () => {
    const life = produce(quiet(), (d) => {
      addPerson(d, 'sib', 'sibling', { age: 60, affection: 40, trust: 40, status: 'estranged' });
      addPerson(d, 'cold', 'parent', { age: 88, affection: 20, trust: 50 });
      addPerson(d, 'cheated', 'ex', { age: 58, affection: 40, trust: 20, memories: ['cheated_on_them'] });
      addPerson(d, 'pal', 'friend', { age: 60, affection: 10, trust: 20 });
      addPerson(d, 'fine', 'friend', { age: 60, affection: 80, trust: 80 });
      d.education.left = { program: 'college', year: 1, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 30, leftYear: d.currentYear - 30, tier: 'state', majorId: Object.keys(content.majors)[0]! };
    });
    const found = amendsCandidates(life, content).map((c) => `${c.source}:${c.personId ?? ''}`);
    expect(found).toContain('estranged_family:sib');
    expect(found).toContain('cold_family:cold');
    expect(found).toContain('broken_trust:cheated');
    expect(found).toContain('old_friend:pal');
    expect(found).toContain('unfinished_degree:');
    expect(found.some((x) => x.endsWith(':fine'))).toBe(false);
  });

  it('are offered at most once in the gap, never twice for the same source and person within the cooldown, and a few in a life', () => {
    const life = produce(quiet(), (d) => {
      addPerson(d, 'sib', 'sibling', { age: 60, affection: 40, trust: 40, status: 'estranged' });
      addPerson(d, 'sib2', 'sibling', { age: 58, affection: 40, trust: 40, status: 'estranged' });
    });
    const eager: ContentBundle = { ...content, balance: { ...content.balance, later: { ...content.balance.later, amends: { ...content.balance.later.amends, yearlyChance: 1 } } } };
    const first = produce(life, (d) => runAmends(d, eager));
    expect(first.scheduled.filter((s) => s.eventId === 'amends_estranged_family')).toHaveLength(1);
    // The very next year: inside the gap, nothing.
    const next = produce(first, (d) => {
      d.currentYear += 1;
      d.scheduled = [];
      runAmends(d, eager);
    });
    expect(next.scheduled).toEqual([]);
    // After the gap, the other sibling; not the same person again until the cooldown has passed.
    const later = produce(first, (d) => {
      d.currentYear += eager.balance.later.amends.gapYears;
      d.scheduled = [];
      runAmends(d, eager);
    });
    const firstPerson = first.scheduled[0]!.cast.npc;
    expect(later.scheduled).toHaveLength(1);
    expect(later.scheduled[0]!.cast.npc).not.toBe(firstPerson);
    // A life offered the most it can be gets no more.
    const spent = produce(first, (d) => {
      d.currentYear += 20;
      d.scheduled = [];
      for (let i = 0; i < eager.balance.later.amends.maxPerLife; i++) d.later.offered[`amends:x${i}:`] = d.currentYear - 15;
      runAmends(d, eager);
    });
    expect(spent.scheduled).toEqual([]);
  });
});

describe('the life review', () => {
  it('has nothing for a life with nothing in it', () => {
    const dead = produce(lifeAtAge('l1-review-empty', 30), (d) => {
      for (const id of Object.keys(d.people)) {
        delete d.people[id];
        delete d.relationships[id];
      }
      d.character.hidden.talent = null;
      d.phase = 'dead';
      d.death = { year: d.currentYear, age: d.character.age, causeId: Object.keys(content.causes)[0]! };
    });
    const review = writeReview(dead, content)!;
    expect(review.regrets).toEqual([]);
    expect(review.proud).toEqual([]);
    expect(writeReview(lifeAtAge('l1-alive', 70), content)).toBeNull();
  });

  it('tells only what the life proves, about the people it names', () => {
    const dead = produce(lifeAtAge('l1-review', 80), (d) => {
      for (const id of Object.keys(d.people)) {
        delete d.people[id];
        delete d.relationships[id];
      }
      addPerson(d, 'sib', 'sibling', { age: 78, affection: 30, trust: 30, status: 'estranged', first: 'Rosa' });
      addPerson(d, 'friend', 'friend', { age: 79, affection: 95, trust: 90, first: 'Ines' });
      addPerson(d, 'kid', 'child', { age: 50, affection: 90, trust: 85, first: 'Teo', memories: ['amends_made'] });
      d.flags.wrote_memoir = true;
      d.character.hidden.talent = null;
      d.phase = 'dead';
      d.death = { year: d.currentYear, age: d.character.age, causeId: Object.keys(content.causes)[0]! };
    });
    const regretIds = reviewOptions(dead, content.text.review.regrets, content).map((o) => o.template.id);
    const proudIds = reviewOptions(dead, content.text.review.proud, content).map((o) => o.template.id);
    expect(regretIds).toContain('never_made_peace');
    expect(regretIds).not.toContain('unfaithful');
    expect(proudIds).toEqual(expect.arrayContaining(['friend_for_life', 'close_to_the_end_child', 'made_amends', 'memoir']));
    expect(proudIds).not.toContain('raised_grandchild');
    const review = writeReview(dead, content)!;
    expect(review.regrets.map((l) => l.id)).toEqual(['never_made_peace']);
    expect(review.regrets[0]!.text).toContain('Rosa');
    expect(review.proud.length).toBe(content.balance.later.review.maxProud);
    for (const line of review.proud) expect(proudIds).toContain(line.id);
    // The same life always has the same review, and it goes into the archive.
    expect(writeReview(dead, content)).toEqual(review);
    const entry = archiveEntry(dead, content);
    expect(entry.review).toEqual(review);
  });

  it('is built for any pronouns: every template renders with four pronoun sets', () => {
    const sets = [
      { subject: 'she', object: 'her', possessive: 'her', possessivePronoun: 'hers', reflexive: 'herself', verbPlural: false },
      { subject: 'he', object: 'him', possessive: 'his', possessivePronoun: 'his', reflexive: 'himself', verbPlural: false },
      { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true },
      { subject: 'xe', object: 'xem', possessive: 'xyr', possessivePronoun: 'xyrs', reflexive: 'xemself', verbPlural: false },
    ];
    for (const t of [...content.text.review.regrets, ...content.text.review.proud]) {
      for (const p of sets) {
        const text = renderText(t.text, { roles: { self: { name: { first: 'Sam', last: 'Lee' }, pronouns: p }, npc: { name: { first: 'Ana', last: 'Ruiz' }, pronouns: p, relation: 'friend' } }, values: { age: 80 } });
        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toMatch(/[{}]/);
      }
    }
    for (const list of [content.text.later.lastDays.hospice.hospice, content.text.later.lastDays.speaker.spoke, content.text.later.lastDays.declinedReason, content.text.later.eulogy.letter]) {
      for (const template of list) {
        for (const p of sets) {
          const text = renderText(template, { roles: { self: { name: { first: 'Sam', last: 'Lee' }, pronouns: p }, npc: { name: { first: 'Ana', last: 'Ruiz' }, pronouns: p, relation: 'friend' } }, values: { years: 'two years', names: 'Ana', cost: '$100', known: '5 years' } });
          expect(text).not.toMatch(/[{}]/);
        }
      }
    }
  });
});

describe('create a grandchild directly', () => {
  it('draws the same person from the same generator, and gives them a plausible family bond', () => {
    const base = grandparent('l1-direct');
    const a = produce(base, (d) => void createGrandchild(d, createRng('x'), 'kid', { first: 'Maya', birthYear: d.currentYear - 1 }, content));
    const b = produce(base, (d) => void createGrandchild(d, createRng('x'), 'kid', { first: 'Maya', birthYear: d.currentYear - 1 }, content));
    expect(a.people).toEqual(b.people);
    const kid = grandchildren(a)[0]!;
    expect(a.relationships[kid.id]!.affection).toBeGreaterThan(20);
    expect(emptyLater().care).toBeNull();
  });
});
