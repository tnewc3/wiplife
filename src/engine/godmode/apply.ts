/**
 * Applies an edit to a life (G1, docs/expansion.md). It runs on a draft, writes only what the payload names and what the
 * closed list of knock-ons needs for the invariants to hold, and writes no history line, flag, memory or event. It draws
 * nothing from the life's generator. It assumes `precheck` has passed; where a payload is wrong it skips the part, so the
 * rules can report every reason together.
 */
import type { ContentBundle } from '../../content/schemas';
import { endJob, levelPay, performanceAim, rollOpenings } from '../career';
import { addDebt, setMinPayment } from '../finance';
import { moveTo, settleHousehold } from '../housing';
import { defaultLife } from '../lives/model';
import { attachedDebtIds } from '../possessions/query';
import { pruneWeb } from '../web/ties';
import { reconcileStanding } from '../migration/standing';
import { setPersonFaith } from '../belonging/faith';
import { clampInt } from '../random';
import { isCurrentPartner } from '../relationships';
import { createRng } from '../rng';
import type { LifeState, Person, Personality } from '../types';
import { TRAIT_KEYS } from '../../content/schemas';
import { targetPersonId, type EditPayload } from './payload';

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Sets a field only when the value differs, so an edit that changes nothing leaves the life as the very same object. */
function put<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): void {
  if (!same(obj[key], value)) obj[key] = value;
}

export function applyEdit(draft: LifeState, payload: EditPayload, content: ContentBundle): void {
  const personId = targetPersonId(payload);
  if (personId === null) applySelf(draft, payload, content);
  else {
    const person = draft.people[personId];
    if (person) applyPerson(draft, person, payload, content);
  }
}

// ----- Shared pieces -----

function applyName(target: { name: { first: string; last: string } }, payload: EditPayload): void {
  if (!payload.name) return;
  put(target.name, 'first', payload.name.first);
  put(target.name, 'last', payload.name.last);
}

function applyIdentity(target: { identity: LifeState['character']['identity']; canCarry: boolean }, payload: EditPayload): void {
  const edit = payload.identity;
  if (!edit) return;
  const id = target.identity;
  if (edit.genderCategory !== undefined) put(id, 'genderCategory', edit.genderCategory);
  if (edit.genderIdentity !== undefined) put(id, 'genderIdentity', edit.genderIdentity);
  if (edit.genderExpression !== undefined) put(id, 'genderExpression', edit.genderExpression);
  if (edit.pronouns !== undefined) put(id, 'pronouns', edit.pronouns);
  if (edit.attractedTo !== undefined) put(id, 'attractedTo', [...edit.attractedTo]);
  if (edit.canCarry !== undefined) put(target, 'canCarry', edit.canCarry);
}

/** A hidden identity or personality: each part is set, or cleared when the payload says null. */
function applyLatent(latent: LifeState['character']['latent'], payload: EditPayload): void {
  const edit = payload.latent;
  if (!edit) return;
  const identity = latent.identity ?? {};
  let identityChanged = false;
  const touch = () => {
    identityChanged = true;
  };
  if (edit.attractedTo !== undefined) {
    if (edit.attractedTo === null) {
      if (identity.attractedTo !== undefined) {
        delete identity.attractedTo;
        touch();
      }
    } else if (!same(identity.attractedTo, edit.attractedTo)) {
      identity.attractedTo = [...edit.attractedTo];
      touch();
    }
  }
  if (edit.gender !== undefined) {
    if (edit.gender === null) {
      if (identity.genderCategory !== undefined || identity.genderIdentity !== undefined || identity.pronouns !== undefined) {
        delete identity.genderCategory;
        delete identity.genderIdentity;
        delete identity.pronouns;
        touch();
      }
    } else if (identity.genderCategory !== edit.gender.genderCategory || identity.genderIdentity !== edit.gender.genderIdentity || !same(identity.pronouns, edit.gender.pronouns)) {
      identity.genderCategory = edit.gender.genderCategory;
      identity.genderIdentity = edit.gender.genderIdentity;
      identity.pronouns = { ...edit.gender.pronouns };
      touch();
    }
  }
  if (edit.expression !== undefined) {
    if (edit.expression === null) {
      if (identity.genderExpression !== undefined) {
        delete identity.genderExpression;
        touch();
      }
    } else if (identity.genderExpression !== edit.expression) {
      identity.genderExpression = edit.expression;
      touch();
    }
  }
  if (identityChanged) {
    if (Object.keys(identity).length === 0) delete latent.identity;
    else latent.identity = identity;
  }
  if (edit.personality) {
    const current: Partial<Personality> = { ...(latent.personality ?? {}) };
    for (const key of TRAIT_KEYS) {
      const value = edit.personality[key];
      if (value === undefined) continue;
      if (value === null) delete current[key];
      else current[key] = value;
    }
    if (Object.keys(current).length === 0) {
      if (latent.personality !== undefined) delete latent.personality;
    } else if (!same(latent.personality, current)) latent.personality = current;
  }
  if (edit.faith !== undefined) {
    if (edit.faith === null) {
      if (latent.faith !== undefined) delete latent.faith;
    } else if (!same(latent.faith, edit.faith)) latent.faith = { id: edit.faith.id };
  }
}

function applyLanguages(target: { languages: Person['languages'] }, payload: EditPayload, year: number): void {
  const wanted = payload.languages;
  if (!wanted) return;
  const kept = target.languages.filter((l) => wanted.some((w) => w.id === l.id));
  const next = kept.map((l) => {
    const w = wanted.find((x) => x.id === l.id)!;
    return l.skill === w.skill && l.native === w.native ? l : { ...l, skill: w.skill, native: w.native, lastUsed: year };
  });
  for (const w of wanted) if (!next.some((l) => l.id === w.id)) next.push({ id: w.id, skill: w.skill, native: w.native, lastUsed: year });
  if (next.length !== target.languages.length || next.some((l, i) => l !== target.languages[i])) target.languages = next;
}

function applyCitizenships(target: { citizenships: Person['citizenships'] }, payload: EditPayload): void {
  const wanted = payload.citizenships;
  if (!wanted) return;
  const kept = target.citizenships.filter((c) => wanted.includes(c));
  const next = [...kept, ...wanted.filter((c) => !kept.includes(c))];
  if (!same(next, target.citizenships)) target.citizenships = next;
}

// ----- You -----

function applySelf(draft: LifeState, payload: EditPayload, content: ContentBundle): void {
  const c = draft.character;
  applyName(c, payload);
  applyIdentity(c, payload);
  applyLatent(c.latent, payload);
  if (payload.looks !== undefined) put(c.stats, 'looks', payload.looks);
  if (payload.appearance) put(c.appearance, 'descriptors', [...payload.appearance.descriptors]);
  if (payload.stats) {
    for (const key of ['health', 'happiness', 'smarts', 'fitness', 'stress'] as const) {
      const value = payload.stats[key];
      if (value !== undefined) put(c.stats, key, value);
    }
  }
  if (payload.personality) {
    for (const key of TRAIT_KEYS) {
      const value = payload.personality[key];
      if (typeof value === 'number') put(c.personality, key, value);
    }
  }
  applyValues(draft, payload);
  applyConditions(draft, payload, content);
  if (payload.wealth !== undefined) put(c, 'familyWealth', payload.wealth);
  if (payload.faith) {
    const { id } = payload.faith;
    put(draft.belonging.faith, 'id', id);
    put(draft.belonging.faith, 'strength', id === null ? 0 : Math.max(1, payload.faith.strength));
  }
  applyLanguages(c, payload, draft.currentYear);
  if (payload.citizenships) {
    applyCitizenships(c, payload);
    reconcileStanding(draft, content);
  }
  if (payload.money) applyMoney(draft, payload, content);
  // Moving first: a move ends a job, and a job named in the same edit is the one in the new city.
  if (payload.cityId !== undefined) applyCity(draft, payload.cityId, content);
  if (payload.work) applyJob(draft, payload.work, content);
}

function applyValues(draft: LifeState, payload: EditPayload): void {
  const v = payload.values;
  if (!v) return;
  const h = draft.character.hidden;
  for (const key of ['luck', 'reputation', 'geneticRisk', 'vice', 'innerConflict', 'happinessBaseline'] as const) {
    if (v[key] !== undefined) put(h, key, v[key]!);
  }
  if (v.talent !== undefined && h.talent !== v.talent) {
    h.talent = v.talent;
    // A talent that is gone, or a different one, has nothing pending to surface.
    delete draft.discovery.surfaced.talent;
    if (v.talent === null) h.talentDiscovered = false;
  }
  if (v.talentDiscovered !== undefined && h.talent !== null) {
    put(h, 'talentDiscovered', v.talentDiscovered);
    if (v.talentDiscovered) delete draft.discovery.surfaced.talent;
  }
}

function applyConditions(draft: LifeState, payload: EditPayload, content: ContentBundle): void {
  const wanted = payload.conditions;
  if (!wanted) return;
  const have = draft.health.conditions;
  const next: typeof have = [];
  for (const w of wanted) {
    const existing = have.find((c) => c.conditionId === w.conditionId);
    // A born-with condition began in the year you were born.
    const since = content.conditions[w.conditionId]?.kind === 'neuro' ? draft.birthYear : draft.currentYear;
    const entry = existing ? { ...existing } : { conditionId: w.conditionId, since, severity: w.severity, treated: w.treated };
    entry.severity = w.severity;
    entry.treated = w.treated;
    if (w.named === true && entry.diagnosed === undefined) entry.diagnosed = draft.currentYear;
    if (w.named === false) {
      delete entry.diagnosed;
      delete entry.diagnosedBy;
    }
    next.push(existing && same(existing, entry) ? existing : entry);
  }
  if (next.length !== have.length || next.some((c, i) => c !== have[i])) draft.health.conditions = next;
}

function applyMoney(draft: LifeState, payload: EditPayload, content: ContentBundle): void {
  const money = payload.money!;
  const f = draft.finances;
  if (money.savings !== undefined) put(f, 'savings', money.savings);
  if (!money.debts) return;
  const kinds = new Set<string>(content.balance.godmode.money.debtKinds);
  const attached = attachedDebtIds(draft);
  const editable = (d: (typeof f.debts)[number]) => kinds.has(d.kind) && !attached.has(d.id);
  const wantedIds = new Set(money.debts.flatMap((w) => (w.id === undefined ? [] : [w.id])));
  // A debt left off the list is forgiven.
  const remaining = f.debts.filter((d) => !editable(d) || wantedIds.has(d.id));
  if (remaining.length !== f.debts.length) f.debts = remaining;
  for (const wanted of money.debts) {
    const existing = wanted.id === undefined ? undefined : f.debts.find((d) => d.id === wanted.id);
    if (existing) {
      if (editable(existing) && existing.kind === wanted.kind && existing.balance !== wanted.balance) {
        existing.balance = wanted.balance;
        setMinPayment(existing, content);
      }
    } else if (wanted.id === undefined) addDebt(draft, wanted.kind, wanted.balance, content);
  }
}

/** Your job: a track and a level, or none. A job you had goes into your career history as one you quit. */
function applyJob(draft: LifeState, work: NonNullable<EditPayload['work']>, content: ContentBundle): void {
  const job = draft.career.job;
  if (work.jobId === null) {
    if (job) endJob(draft, 'quit', content, undefined, true);
    return;
  }
  const def = content.jobs[work.jobId];
  if (!def) return;
  const level = Math.min(def.levels.length, work.level);
  if (job && job.jobId === work.jobId) {
    if (job.level !== level) {
      job.level = level;
      job.yearsAtLevel = 0;
      job.salary = levelPay(draft, def, level, content);
    }
    return;
  }
  if (job) endJob(draft, 'quit', content, undefined, true);
  const next = {
    jobId: work.jobId,
    level,
    yearsAtLevel: 0,
    performance: 0,
    salary: levelPay(draft, def, level, content),
    since: draft.currentYear,
    employer: def.employers[0]!,
  };
  next.performance = clampInt(performanceAim(draft, def, content) + content.balance.careers.performance.start, 0, 100);
  draft.career.job = next;
  draft.career.gig = false;
  draft.career.retired = false;
}

/**
 * You move to another city as `relocate` does it, without the fee or the history line: a partner and children who live
 * with you come along, a group in the city you left lapses, your job ends as one you left by moving, and the new city's
 * openings are rolled (from a generator seeded by the life and the edit, so the life's own generator is untouched).
 */
function applyCity(draft: LifeState, cityId: string, content: ContentBundle): void {
  if (draft.character.cityId === cityId || !content.cities[cityId] || content.cities[cityId].retired) return;
  const from = draft.character.cityId;
  moveTo(draft, 'renting', cityId, content, true);
  if (draft.career.job) endJob(draft, 'moved', content, undefined, true);
  const own = draft.rng;
  draft.rng = createRng(`${draft.seed}:edit:${draft.inputLog.length}:${from}`);
  rollOpenings(draft, content);
  draft.rng = own;
}

// ----- A person -----

function applyPerson(draft: LifeState, person: Person, payload: EditPayload, content: ContentBundle): void {
  applyName(person, payload);
  applyIdentity(person, payload);
  if (payload.latent && person.child) applyLatent(person.child.latent, payload);
  if (payload.looks !== undefined) put(person, 'looks', payload.looks);
  if (payload.stats) {
    const s = payload.stats;
    if (s.smarts !== undefined) put(person, 'smarts', s.smarts);
    if (s.mood !== undefined) put(person, 'mood', s.mood);
    if (s.moodBase !== undefined) put(person, 'moodBase', s.moodBase);
    if (person.child) {
      for (const key of ['health', 'happiness', 'fitness', 'stress'] as const) {
        if (s[key] !== undefined) put(person.child, key, s[key]!);
      }
    }
  }
  if (payload.personality) {
    const traits: Partial<Personality> = { ...person.traits };
    for (const key of TRAIT_KEYS) {
      const value = payload.personality[key];
      if (value === undefined) continue;
      if (value === null) delete traits[key];
      else traits[key] = value;
    }
    if (!same(person.traits, traits)) person.traits = traits;
  }
  if (payload.values && person.child) {
    if (payload.values.geneticRisk !== undefined) put(person.child, 'geneticRisk', payload.values.geneticRisk);
    if (payload.values.talent !== undefined) put(person.child, 'talent', payload.values.talent);
  }
  if (payload.troubles || payload.neuro) applyTroubles(draft, person, payload, content);
  if (payload.faith) setFaith(person, payload.faith);
  applyLanguages(person, payload, draft.currentYear);
  applyCitizenships(person, payload);
  if (payload.relationship) applyPersonRelationship(draft, person, payload, content);
  if (payload.work || payload.wealth !== undefined) applyPersonWork(draft, person, payload, content);
  if (payload.cityId !== undefined && content.cities[payload.cityId] && !content.cities[payload.cityId]!.retired) put(person, 'cityId', payload.cityId);
  if (payload.birthYear !== undefined) put(person, 'birthYear', payload.birthYear);
}

function setFaith(person: Person, faith: NonNullable<EditPayload['faith']>): void {
  const strength = faith.id === null ? 0 : Math.max(1, faith.strength);
  if (person.faith?.id === faith.id && person.faith.strength === strength) return;
  setPersonFaith(person, faith.id, strength);
}

function applyTroubles(draft: LifeState, person: Person, payload: EditPayload, content: ContentBundle): void {
  if (payload.neuro && !same(person.neuro ?? [], payload.neuro)) {
    if (payload.neuro.length === 0) delete person.neuro;
    else person.neuro = [...payload.neuro];
  }
  if (!payload.troubles) return;
  const life = person.life ?? defaultLife(draft, person, draft.relationships[person.id], content);
  const crimes = life.troubles.filter((t) => t.kind === 'crime');
  const next = [...crimes];
  for (const w of payload.troubles) {
    const had = life.troubles.find((t) => t.kind === w.kind && t.refId === w.refId);
    next.push(had && had.severity === w.severity && had.treated === w.treated ? had : { kind: w.kind, refId: w.refId, since: had?.since ?? draft.currentYear, severity: w.severity, treated: w.treated });
  }
  if (!same(life.troubles, next)) {
    if (!person.life) person.life = life;
    person.life.troubles = next;
  }
}

function applyPersonRelationship(draft: LifeState, person: Person, payload: EditPayload, content: ContentBundle): void {
  const edit = payload.relationship!;
  const rel = draft.relationships[person.id];
  if (!rel) return;
  if (edit.affection !== undefined) put(rel, 'affection', edit.affection);
  if (edit.trust !== undefined) put(rel, 'trust', edit.trust);
  if (edit.status !== undefined) {
    put(rel, 'status', edit.status);
    // Someone who has faded out of your life takes their ties and the stories they held with them, as when you leave a group.
    if (edit.status === 'ended') pruneWeb(draft);
  }
  if (edit.kind !== undefined && edit.kind !== rel.kind) {
    rel.kind = edit.kind;
    rel.kindSince = draft.currentYear;
    if (edit.kind === 'spouse') rel.wasSpouse = true;
  }
  if (edit.wasSpouse !== undefined && edit.wasSpouse && rel.wasSpouse !== true) rel.wasSpouse = true;
  // A live-in partner who is no longer a current partner has moved out, without the history line.
  const id = draft.housing.partnerId;
  if (id !== undefined) {
    const partnerRel = draft.relationships[id];
    if (!partnerRel || !isCurrentPartner(draft, partnerRel)) settleHousehold(draft, content, true);
  }
}

/** Their job and level (or none) and their wealth level. */
function applyPersonWork(draft: LifeState, person: Person, payload: EditPayload, content: ContentBundle): void {
  const rel = draft.relationships[person.id];
  const base = defaultLife(draft, person, rel, content);
  const life = person.life ?? { ...base };
  const before = { occupation: person.occupation, wealth: person.wealthLevel };
  if (payload.work) {
    const { jobId, level } = payload.work;
    if (jobId === null) {
      if (person.occupation !== undefined) delete person.occupation;
      life.level = 0;
    } else {
      const def = content.jobs[jobId];
      if (def) {
        const l = Math.min(def.levels.length, level);
        const changed = person.occupation !== jobId || life.level !== l;
        person.occupation = jobId;
        life.level = l;
        if (changed) life.levelSince = draft.currentYear;
        delete life.jobLost;
        delete life.retired;
      }
    }
  }
  if (payload.wealth !== undefined) {
    put(person, 'wealthLevel', payload.wealth);
    life.background = payload.wealth;
  }
  // A person who had no summary of their life yet gets one only when the edit changed something.
  if (person.life === undefined && (before.occupation !== person.occupation || before.wealth !== person.wealthLevel || !same(life, base))) person.life = life;
}
