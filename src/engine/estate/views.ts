/**
 * What the UI needs about wills, estates and family lines (E2b), read
 * through selectors: the will's editor (everyone you could name, with their
 * share now), the Death screen (how the estate was settled and who can carry
 * on, with what each would inherit), the family line (name, generation and
 * reputation) and the "Previously" card.
 */
import type { ContentBundle } from '../../content/schemas';
import { homeSaleNet, heirCandidates } from './heir';
import { defaultShares } from './settle';
import { willCandidates } from './will';
import type { ArchivedLife, EstateLine, Id, LifeState, Possession, Previously, RelationshipKind, Settlement } from '../types';

export interface WillRowView {
  kind: 'person' | 'cause';
  id: Id;
  name: string;
  relation: EstateLine['relation'];
  /** Their share now (0: not in the will). */
  percent: number;
  /** A minor: their share would be held in trust until they are of age. */
  minor: boolean;
}

export interface WillView {
  /** You can write or change a will now (an adult, between years). */
  canWrite: boolean;
  hasWill: boolean;
  rows: WillRowView[];
  /** What happens without a will, as things stand now. */
  defaults: { name: string; relation: EstateLine['relation']; percent: number }[];
  maxShares: number;
}

/** More → Write a will: everyone (and every cause) you could name, with their share in the current will. */
export function getWillView(state: LifeState, content: ContentBundle): WillView {
  const percentOf = new Map((state.will?.shares ?? []).map((s) => [`${s.kind}:${s.id}`, s.percent]));
  const adult = content.balance.relationships.adultAge;
  return {
    canWrite: state.phase === 'yearStart' && state.character.age >= adult,
    hasWill: state.will !== null,
    rows: willCandidates(state, content).map((c) => ({
      kind: c.kind,
      id: c.id,
      name: c.name,
      relation: c.relation,
      percent: percentOf.get(`${c.kind}:${c.id}`) ?? 0,
      minor: c.kind === 'person' && state.currentYear - state.people[c.id]!.birthYear < adult,
    })),
    defaults: defaultShares(state, content).map((s) => ({ name: s.name, relation: s.relation, percent: s.percent })),
    maxShares: content.balance.family.estate.maxShares,
  };
}

/** You are old enough to write a will (the More tab offers it from then on). */
export function canPlanEstate(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.relationships.adultAge;
}

export interface EstateLineView {
  name: string;
  relation: EstateLine['relation'];
  percent: number;
  cash: number;
  /** The home that passes to them, and what is still owed on it. */
  home: { value: number; mortgage: number } | null;
}

export interface HeirOptionView {
  id: Id;
  name: string;
  age: number;
  minor: boolean;
  /** What they would inherit: cash (a grown heir's), held in trust (a minor's), and a home (a grown heir's). */
  cash: number;
  trust: number;
  home: { value: number; mortgage: number } | null;
  /** E5: what would come to them in kind: a pet, a car, a vacation home ("Biscuit the dog", "a sedan"). */
  possessions: string[];
}

/** E5: a pet, vehicle or vacation home that passed to someone. */
export interface PassedPossessionView {
  /** "Biscuit the dog", "a sedan", "a vacation home in Chicago". */
  what: string;
  /** Who it went to. */
  to: string;
  /** What was still owed on it, which went with it. */
  loan: number;
}

export interface DeathView {
  year: number;
  source: Settlement['source'];
  /** Money and debts, in the order they were settled. */
  costs: number;
  debtsPaid: number;
  tax: number;
  writtenOff: number;
  home: Settlement['home'];
  homeValue: number;
  mortgagePaid: number;
  saleCosts: number;
  netEstate: number;
  unclaimed: number;
  lines: EstateLineView[];
  heirs: HeirOptionView[];
  /** E5: pets, vehicles and vacation homes that passed on in kind, and the cash from those that were sold instead. */
  possessions: PassedPossessionView[];
  possessionSales: number;
}

/** A possession as a phrase. */
function possessionPhrase(p: Possession, content: ContentBundle): string {
  if (p.kind === 'pet') return `${p.name ?? 'A pet'} the ${content.pets[p.defId]?.name ?? 'pet'}`;
  if (p.kind === 'vehicle') return `a ${content.vehicles[p.defId]?.name ?? 'vehicle'}`;
  return `a vacation home in ${content.cities[p.home?.cityId ?? '']?.name ?? 'the city'}`;
}

/** The Death screen's estate and heir choice, for a life in the dead phase; null before death. */
export function getDeathView(state: LifeState, content: ContentBundle): DeathView | null {
  const e = state.estate;
  if (!e) return null;
  const independence = content.balance.economy.independenceAge;
  return {
    year: e.year,
    source: e.source,
    costs: e.costs,
    debtsPaid: e.debtsPaid,
    tax: e.tax,
    writtenOff: e.writtenOff,
    home: e.home,
    homeValue: e.homeValue,
    mortgagePaid: e.mortgagePaid,
    saleCosts: e.saleCosts,
    netEstate: e.netEstate,
    unclaimed: e.unclaimed,
    lines: e.lines.map((l) => ({ name: l.name, relation: l.relation, percent: l.percent, cash: l.cash, home: l.property ?? null })),
    heirs: heirCandidates(state).map((id): HeirOptionView => {
      const person = state.people[id]!;
      const age = state.currentYear - person.birthYear;
      const line = e.lines.find((l) => l.kind === 'person' && l.id === id);
      const minor = age < independence;
      const cash = line?.cash ?? 0;
      const property = line?.property ?? null;
      return {
        id,
        name: `${person.name.first} ${person.name.last}`,
        age,
        minor,
        cash: minor ? 0 : cash,
        trust: minor ? cash + (property ? homeSaleNet(property.value, property.mortgage, content) : 0) : 0,
        home: minor ? null : property,
        possessions: e.possessions.filter((t) => t.toPersonId === id).map((t) => possessionPhrase(t.item, content)),
      };
    }),
    possessions: e.possessions.map((t) => ({
      what: possessionPhrase(t.item, content),
      to: state.people[t.toPersonId] ? `${state.people[t.toPersonId]!.name.first} ${state.people[t.toPersonId]!.name.last}` : 'someone',
      loan: t.loan,
    })),
    possessionSales: e.possessionSales,
  };
}

export interface FamilyLineView {
  familyName: string;
  generation: number;
  /** 0–100; 50 is unremarkable. */
  reputation: number;
  /** What the family is known for, as phrases from text/heir.yaml. */
  deeds: string[];
}

/** The family line this life belongs to. */
export function getFamilyLineView(state: LifeState, content: ContentBundle): FamilyLineView {
  const l = state.lineage;
  return {
    familyName: l.familyName,
    generation: l.generation,
    reputation: l.reputation,
    deeds: l.deeds.map((d) => content.text.heir.deeds[d as keyof typeof content.text.heir.deeds] ?? d),
  };
}

/** The "Previously" card an heir sees until their first year begins; null otherwise. */
export function getPreviously(state: LifeState): Previously | null {
  return state.lineage.previously ?? null;
}

/** A relationship kind that can be a will's beneficiary, for labels. */
export type BeneficiaryRelation = RelationshipKind | 'cause';

export interface ArchiveFamilyLine {
  lineId: string;
  familyName: string;
  /** Oldest generation first. */
  lives: ArchivedLife[];
  /** Where the line's most recently archived life sat in the listing (the listing is most recent first). */
  order: number;
}

/**
 * Groups archived lives into family lines (E2b): lines in the listing's order
 * (the one with the most recently archived life first), each line's lives
 * oldest generation first, so a line reads as generations.
 */
export function groupArchiveByLine(lives: readonly ArchivedLife[]): ArchiveFamilyLine[] {
  const lines = new Map<string, ArchiveFamilyLine>();
  lives.forEach((life, index) => {
    const line = lines.get(life.lineId) ?? { lineId: life.lineId, familyName: life.familyName, lives: [], order: index };
    line.lives.push(life);
    lines.set(life.lineId, line);
  });
  return [...lines.values()]
    .map((line) => ({ ...line, lives: [...line.lives].sort((a, b) => a.generation - b.generation || a.birthYear - b.birthYear) }))
    .sort((a, b) => a.order - b.order);
}
