/**
 * Adoption, IVF and surrogacy (E2a): the ways to have a child that take time
 * and money. Each has eligibility (age, record, money, housing), a wait, and
 * odds (IVF and surrogacy can fail; an adoption placement can fall through).
 * Fees go through the finance module as cost effects in the events that
 * start each process and answer it. The numbers are in
 * balance/family.yaml; the fees are the family items in
 * balance/economy.yaml costs.
 */
import type { ContentBundle, FamilyProcessKind } from '../../content/schemas';
import { curveAt } from '../curve';
import { costToYou } from '../costs';
import { isIndependent } from '../finance';
import { countedRecord } from '../record';
import { currentPartner } from '../relationships';
import { nextInt } from '../rng';
import type { RngState } from '../rng';
import { carrierAge, familyBusy, type Carrier } from './carrying';
import type { FamilyProcess, Id, LifeState } from '../types';

/** The fees of each process, in cost items (the first is paid when you start). */
export const PROCESS_FEES: Record<FamilyProcessKind, readonly string[]> = {
  adoption: ['adoption_fee', 'adoption_placement'],
  ivf: ['ivf_cycle'],
  surrogacy: ['surrogacy_agency', 'surrogacy_balance'],
};

export type ProcessBlock = 'busy' | 'prison' | 'age' | 'record' | 'money' | 'housing' | 'carrier';

/** The total fees of the process in your city, after any help from your family (whole dollars). */
export function processCost(state: LifeState, kind: FamilyProcessKind, content: ContentBundle): number {
  return PROCESS_FEES[kind].reduce((sum, item) => sum + costToYou(state, item, content), 0);
}

/** Who would carry an IVF pregnancy: you if you can, otherwise your partner if they can; null when neither can. */
export function ivfCarrier(state: LifeState): Carrier | null {
  if (state.character.canCarry) return 'you';
  const partner = currentPartner(state);
  if (partner && state.people[partner.personId]?.canCarry) return partner.personId;
  return null;
}

/** The chance (0–1) an IVF cycle works for this carrier now. */
export function ivfSuccessChance(state: LifeState, carrier: Carrier, content: ContentBundle): number {
  return curveAt(content.balance.family.ivf.success, carrierAge(state, carrier, content));
}

export interface ProcessView {
  kind: FamilyProcessKind;
  /** Reasons you can't start it now; empty when you can. */
  blocks: ProcessBlock[];
  /** The fees in total, in your city, after family help. */
  cost: number;
  /** The first payment, due at the start. */
  upFront: number;
  /** IVF and surrogacy: the chance it works (0–1). */
  odds?: number;
  /** Years it takes (a range, for adoption). */
  waitYears: { min: number; max: number };
}

/** What starting this process would take, and what blocks you now. */
export function processView(state: LifeState, kind: FamilyProcessKind, content: ContentBundle): ProcessView {
  const f = content.balance.family;
  const blocks: ProcessBlock[] = [];
  const age = state.character.age;
  if (familyBusy(state)) blocks.push('busy');
  if (state.housing.kind === 'incarcerated') blocks.push('prison');
  if (!isIndependent(state, content)) blocks.push('age');
  const cost = processCost(state, kind, content);
  const upFront = costToYou(state, PROCESS_FEES[kind][0]!, content);
  const reserve = Math.round(f.adoption.reserve * (content.cities[state.character.cityId]?.costOfLiving ?? 1));
  let odds: number | undefined;
  let waitYears: { min: number; max: number };

  if (kind === 'adoption') {
    if (age < f.adoption.minAge || age > f.adoption.maxAge) blocks.push('age');
    const recent = countedRecord(state, content).some((r) => (r.outcome === 'probation' || r.outcome === 'jail') && state.currentYear - r.year <= f.adoption.recordYears);
    if (recent) blocks.push('record');
    if (state.housing.kind === 'homeless') blocks.push('housing');
    if (state.finances.savings < cost + reserve) blocks.push('money');
    waitYears = f.adoption.waitYears;
  } else if (kind === 'ivf') {
    const carrier = ivfCarrier(state);
    if (carrier === null) blocks.push('carrier');
    else {
      const carrierYears = carrierAge(state, carrier, content);
      if (carrierYears < f.ivf.minAge || carrierYears > f.ivf.maxAge) blocks.push('age');
      odds = ivfSuccessChance(state, carrier, content);
    }
    if (state.housing.kind === 'homeless') blocks.push('housing');
    if (state.finances.savings < cost) blocks.push('money');
    waitYears = { min: f.ivf.waitYears, max: f.ivf.waitYears };
  } else {
    if (age < f.surrogacy.minAge || age > f.surrogacy.maxAge) blocks.push('age');
    if (state.housing.kind === 'homeless') blocks.push('housing');
    if (state.finances.savings < cost) blocks.push('money');
    odds = f.surrogacy.success;
    waitYears = { min: f.surrogacy.waitYears, max: f.surrogacy.waitYears };
  }
  return { kind, blocks: [...new Set(blocks)], cost, upFront, ...(odds !== undefined ? { odds } : {}), waitYears };
}

/** Whether you can start this process now. */
export function canStartProcess(state: LifeState, kind: FamilyProcessKind, content: ContentBundle): boolean {
  return processView(state, kind, content).blocks.length === 0;
}

/**
 * Starts the process (the fees are charged by the cost effects beside it):
 * the year it will come to an answer is set from its wait. Ignored when you
 * can't start it. `rng` draws the wait for an adoption.
 */
export function startProcess(state: LifeState, rng: RngState, kind: FamilyProcessKind, content: ContentBundle): void {
  if (!canStartProcess(state, kind, content)) return;
  const f = content.balance.family;
  const wait = kind === 'adoption' ? nextInt(rng, f.adoption.waitYears.min, f.adoption.waitYears.max) : kind === 'ivf' ? f.ivf.waitYears : f.surrogacy.waitYears;
  const partner = currentPartner(state);
  const process: FamilyProcess = { kind, startYear: state.currentYear, dueYear: state.currentYear + wait };
  if (kind === 'ivf') {
    const carrier = ivfCarrier(state);
    if (carrier !== null) process.carrier = carrier;
  }
  if (partner) process.otherParentId = partner.personId;
  state.family.process = process;
}

/** The partner (other parent) of a process, if still alive. */
export function processOther(state: LifeState, process: FamilyProcess): Id | undefined {
  return process.otherParentId !== undefined && state.people[process.otherParentId]?.alive ? process.otherParentId : undefined;
}
