/**
 * What god mode (G1, docs/expansion.md) lets the editor show and change for you or one person, read into one flat model:
 * the editor starts its draft from this and sends back only what differs. A selector: it reads the life and changes nothing.
 */
import { TRAIT_KEYS, type ContentBundle, type CountryId, type DebtKind } from '../content/schemas';
import { faithOf } from './belonging/faith';
import { attachedDebtIds } from './possessions/query';
import { ageOf } from './relationships';
import type { FamilyWealth, GenderCategory, Id, LifeState, Person, Personality, Pronouns, RelationshipKind, RelationshipStatus } from './types';

export type TraitScores = Record<keyof Personality, number | null>;

export interface EditView {
  /** The target is you. */
  self: boolean;
  personId: string | null;
  alive: boolean;
  /** A child of yours, a stepchild or a grandchild (they have a child's stats). */
  child: boolean;
  age: number;
  name: { first: string; last: string };
  identity: { genderCategory: GenderCategory; genderIdentity: string; genderExpression: string; pronouns: Pronouns; attractedTo: GenderCategory[]; canCarry: boolean };
  /** The hidden identity (yours, or a child's); null when the target has none to edit. */
  latent: {
    attractedTo: GenderCategory[] | null;
    gender: { genderCategory: GenderCategory; genderIdentity: string; pronouns: Pronouns } | null;
    expression: string | null;
    personality: TraitScores;
    faith: { id: Id | null } | null;
  } | null;
  looks: number;
  /** Yours only. */
  appearance: string[];
  stats: Partial<Record<'health' | 'happiness' | 'smarts' | 'fitness' | 'stress' | 'mood' | 'moodBase', number>>;
  personality: TraitScores;
  /** Yours, or a child's gene risk and talent. */
  values: Partial<Record<'luck' | 'reputation' | 'geneticRisk' | 'vice' | 'innerConflict' | 'happinessBaseline', number>> & { talent: Id | null; talentDiscovered: boolean };
  /** Yours: the conditions you have. */
  conditions: { conditionId: Id; severity: number; treated: boolean; named: boolean }[];
  /** A person's illnesses and addictions, and their born-with conditions. */
  troubles: { kind: 'illness' | 'addiction'; refId: Id; severity: number; treated: boolean }[];
  neuro: Id[];
  /** A person's relationship to you. */
  relationship: { kind: RelationshipKind; affection: number; trust: number; status: RelationshipStatus; wasSpouse: boolean } | null;
  work: { jobId: Id | null; level: number };
  wealth: FamilyWealth;
  cityId: Id;
  faith: { id: Id | null; strength: number };
  languages: { id: string; skill: number; native: boolean }[];
  citizenships: CountryId[];
  /** Yours only: savings, the debts an edit can change, and how many belong to a home, vehicle or business. */
  money: { savings: number; debts: { id: Id; kind: DebtKind; balance: number }[]; locked: number } | null;
  birthYear: number;
  /** C2, yours only: your sports, music and fame careers, as the numbers an edit can change (null for each you do not have). */
  career: {
    sports: { sport: string; position: Id; positions: { id: Id; label: string }[]; greatness: number; skills: { id: Id; label: string; level: number }[]; salary: number | null; seasons: number; clearHistory: boolean } | null;
    music: { band: string; buzz: number; chemistry: number; members: { id: Id; name: string; part: string; skill: number }[]; releases: number; clearReleases: boolean } | null;
    fame: { path: string; fame: number; image: number; fans: number; mood: number; agent: Id | null; hasContract: boolean; endContract: boolean } | null;
  } | null;
}

const traits = (source: Partial<Personality> | undefined, all: boolean): TraitScores =>
  Object.fromEntries(TRAIT_KEYS.map((k) => [k, source?.[k] ?? (all ? 50 : null)])) as TraitScores;

function latentOf(latent: LifeState['character']['latent']): NonNullable<EditView['latent']> {
  const id = latent.identity;
  return {
    attractedTo: id?.attractedTo ? [...id.attractedTo] : null,
    gender: id?.genderCategory && id.genderIdentity && id.pronouns ? { genderCategory: id.genderCategory, genderIdentity: id.genderIdentity, pronouns: { ...id.pronouns } } : null,
    expression: id?.genderExpression ?? null,
    personality: traits(latent.personality, false),
    faith: latent.faith ? { id: latent.faith.id } : null,
  };
}

export function getEditView(state: LifeState, target: 'self' | Id, content: ContentBundle): EditView | null {
  if (target === 'self') {
    const c = state.character;
    const kinds = new Set<string>(content.balance.godmode.money.debtKinds);
    const attached = attachedDebtIds(state);
    const editable = state.finances.debts.filter((d) => kinds.has(d.kind) && !attached.has(d.id));
    const job = state.career.job;
    return {
      self: true,
      personId: null,
      alive: true,
      child: false,
      age: c.age,
      name: { ...c.name },
      identity: { genderCategory: c.identity.genderCategory, genderIdentity: c.identity.genderIdentity, genderExpression: c.identity.genderExpression, pronouns: { ...c.identity.pronouns }, attractedTo: [...c.identity.attractedTo], canCarry: c.canCarry },
      latent: latentOf(c.latent),
      looks: c.stats.looks,
      appearance: [...c.appearance.descriptors],
      stats: { health: c.stats.health, happiness: c.stats.happiness, smarts: c.stats.smarts, fitness: c.stats.fitness, stress: c.stats.stress },
      personality: traits(c.personality, true),
      values: { luck: c.hidden.luck, reputation: c.hidden.reputation, geneticRisk: c.hidden.geneticRisk, vice: c.hidden.vice, innerConflict: c.hidden.innerConflict, happinessBaseline: c.hidden.happinessBaseline, talent: c.hidden.talent, talentDiscovered: c.hidden.talentDiscovered },
      conditions: state.health.conditions.map((h) => ({ conditionId: h.conditionId, severity: h.severity, treated: h.treated, named: h.diagnosed !== undefined })),
      troubles: [],
      neuro: [],
      relationship: null,
      work: { jobId: job?.jobId ?? null, level: job?.level ?? 1 },
      wealth: c.familyWealth,
      cityId: c.cityId,
      faith: { id: state.belonging.faith.id, strength: state.belonging.faith.strength },
      languages: c.languages.map((l) => ({ id: l.id, skill: l.skill, native: l.native })),
      citizenships: [...c.citizenships],
      money: { savings: state.finances.savings, debts: editable.map((d) => ({ id: d.id, kind: d.kind, balance: d.balance })), locked: state.finances.debts.length - editable.length },
      birthYear: state.birthYear,
      career: careerOf(state, content),
    };
  }
  const person: Person | undefined = state.people[target];
  const rel = state.relationships[target];
  if (!person || !rel) return null;
  const kid = person.child;
  const faith = faithOf(state, person, content);
  return {
    self: false,
    personId: person.id,
    alive: person.alive,
    child: kid !== undefined,
    age: ageOf(state, person),
    name: { ...person.name },
    identity: { genderCategory: person.identity.genderCategory, genderIdentity: person.identity.genderIdentity, genderExpression: person.identity.genderExpression, pronouns: { ...person.identity.pronouns }, attractedTo: [...person.identity.attractedTo], canCarry: person.canCarry },
    latent: kid ? latentOf(kid.latent) : null,
    looks: person.looks,
    appearance: [],
    stats: { smarts: person.smarts, mood: person.mood, moodBase: person.moodBase, ...(kid ? { health: kid.health, happiness: kid.happiness, fitness: kid.fitness, stress: kid.stress } : {}) },
    personality: traits(person.traits, false),
    values: { talent: kid?.talent ?? null, talentDiscovered: false, ...(kid ? { geneticRisk: kid.geneticRisk } : {}) },
    conditions: [],
    troubles: (person.life?.troubles ?? []).flatMap((t) => (t.kind === 'crime' ? [] : [{ kind: t.kind, refId: t.refId, severity: t.severity, treated: t.treated }])),
    neuro: [...(person.neuro ?? [])],
    relationship: { kind: rel.kind, affection: rel.affection, trust: rel.trust, status: rel.status, wasSpouse: rel.wasSpouse === true },
    work: { jobId: person.occupation ?? null, level: Math.max(1, person.life?.level ?? 1) },
    wealth: person.wealthLevel,
    cityId: person.cityId,
    faith: { id: faith.id, strength: faith.strength },
    languages: person.languages.map((l) => ({ id: l.id, skill: l.skill, native: l.native })),
    citizenships: [...person.citizenships],
    money: null,
    birthYear: person.birthYear,
    career: null,
  };
}

/** C2: the careers an edit can change. */
function careerOf(state: LifeState, content: ContentBundle): NonNullable<EditView['career']> | null {
  const f = state.fame;
  if (!f.active || f.main === null) return null;
  const main = content.famePaths[f.main];
  const mainPath = f.paths[f.main];
  const sport = state.sports.sport !== null && f.main === state.sports.sport ? main?.sport : undefined;
  const band = f.band;
  return {
    sports:
      main && mainPath && sport
        ? {
            sport: main.name,
            position: state.sports.position ?? sport.positions[0]!.id,
            positions: sport.positions.map((p) => ({ id: p.id, label: p.label })),
            greatness: Math.round(mainPath.craft),
            skills: (main.skills ?? []).map((k) => ({ id: k.id, label: k.label, level: Math.round(mainPath.skills?.[k.id] ?? content.balance.fame.practice.start) })),
            salary: state.sports.contract?.salary ?? null,
            seasons: state.sports.seasons.length,
            clearHistory: false,
          }
        : null,
    music: band
      ? {
          band: band.name,
          buzz: Math.round(f.paths[band.path]?.fame ?? 0),
          chemistry: band.chemistry,
          members: band.members.map((m) => ({ id: m.id, name: `${state.people[m.id]?.name.first ?? ''} ${state.people[m.id]?.name.last ?? ''}`.trim(), part: content.famePaths[band.path]?.instruments?.find((i) => i.id === m.part)?.label ?? m.part, skill: Math.round(m.skill) })),
          releases: f.projects.length,
          clearReleases: false,
        }
      : null,
    fame: mainPath && main ? { path: main.name, fame: Math.round(mainPath.fame), image: f.image, fans: f.fans, mood: f.mood, agent: f.agent?.agentId ?? null, hasContract: f.contract !== null, endContract: false } : null,
  };
}
