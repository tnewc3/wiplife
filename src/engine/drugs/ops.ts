/**
 * Grow operations and labs (D1, W3): a business you run for the product. A business abstraction: setup cost, capacity,
 * quality, yearly output and risk (a raid, a fire, a theft), never a process. Adults only. The output joins your stock, and
 * it has to be sold: through dealing, or on at wholesale. Numbers: balance/drugs.yaml (production); the types:
 * src/content/operations.
 */
import type { ContentBundle, OperationDef } from '../../content/schemas';
import { addHeat } from '../crime/money';
import { spend } from '../finance';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import { chance, pick } from '../rng';
import type { DrugOp, Id, LifeState } from '../types';
import { charge, seizeStock } from './legal';
import { addStock } from './market';
import { drugDef, tradeBlock, type TradeBlock } from './query';
import { say } from './text';

export function opDef(content: ContentBundle, id: Id | undefined): OperationDef | undefined {
  const d = id === undefined ? undefined : content.operations[id];
  return d && !d.retired ? d : undefined;
}

export function opTypes(content: ContentBundle): OperationDef[] {
  return Object.values(content.operations)
    .filter((o) => !o.retired)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** What fitting out a type costs where you live (the city's cost of living). */
export function opCost(state: LifeState, def: OperationDef, content: ContentBundle): { startup: number; upkeep: number } {
  const k = content.cities[state.character.cityId]?.costOfLiving ?? 1;
  return { startup: Math.round(def.startup * k), upkeep: Math.round(def.upkeep * k) };
}

export type OpBlock = TradeBlock | 'type' | 'drug' | 'max' | 'money';

export function startOpBlock(state: LifeState, defId: Id, drugId: Id, content: ContentBundle): OpBlock | null {
  const t = tradeBlock(state, content);
  if (t) return t;
  const def = opDef(content, defId);
  if (!def) return 'type';
  const drug = drugDef(content, drugId);
  if (!drug || !def.drugs.includes(drugId) || !drug.produce?.includes(def.kind)) return 'drug';
  if (state.drugs.ops.length >= content.balance.drugs.production.max) return 'max';
  if (opCost(state, def, content).startup > state.finances.savings) return 'money';
  return null;
}

export function startOp(state: LifeState, defId: Id, drugId: Id, content: ContentBundle): Id | null {
  if (startOpBlock(state, defId, drugId, content) !== null) return null;
  const def = opDef(content, defId)!;
  const cost = opCost(state, def, content);
  spend(state, cost.startup, content);
  const used = new Set(state.drugs.ops.map((o) => o.name));
  const name = pick(state.rng, def.names.filter((n) => !used.has(n)).length > 0 ? def.names.filter((n) => !used.has(n)) : def.names);
  const id = `op${state.drugs.nextOp}`;
  state.drugs.nextOp += 1;
  const op: DrugOp = { id, defId, name, cityId: state.character.cityId, drugId, founded: state.currentYear, quality: def.quality.start, running: 'full', assets: cost.startup, last: { year: 0, units: 0 } };
  state.drugs.ops.push(op);
  addHeat(state, 6);
  say(state, 'opened', { name: op.name, drug: drugDef(content, drugId)!.noun }, content);
  state.drugs.last = { action: 'operation', kind: 'opened', drugId, amount: cost.startup, balance: state.finances.savings, note: `${op.name} is set up.` };
  return id;
}

export function setRunning(state: LifeState, id: Id, running: DrugOp['running']): boolean {
  const op = state.drugs.ops.find((o) => o.id === id);
  if (!op) return false;
  op.running = running;
  return true;
}

export function closeOp(state: LifeState, id: Id, content: ContentBundle): boolean {
  const i = state.drugs.ops.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const [op] = state.drugs.ops.splice(i, 1);
  say(state, 'closed', { name: op!.name }, content);
  return true;
}

/** Expected output of an operation for a year at its running level. Reads only. */
export function plannedOutput(op: DrugOp, content: ContentBundle): number {
  const def = opDef(content, op.defId);
  if (!def) return 0;
  const p = content.balance.drugs.production;
  return Math.round(def.capacity * (op.running === 'full' ? p.runs.full : p.runs.low));
}

/** The chance of a raid this year. Reads only. */
export function raidChance(state: LifeState, op: DrugOp, content: ContentBundle): number {
  const def = opDef(content, op.defId);
  if (!def) return 0;
  const p = content.balance.drugs.production;
  const running = op.running === 'full' ? 1 : 0.5;
  return Math.min(0.6, def.raid * (1 + (state.crime.heat * p.heat) / 100) * running);
}

export interface OpsYear {
  raided: DrugOp | null;
  fire: DrugOp | null;
  stolen: DrugOp | null;
  produced: number;
}

/** The year of every operation. Draws from the life's generator. */
export function opsYear(state: LifeState, content: ContentBundle): OpsYear {
  const out: OpsYear = { raided: null, fire: null, stolen: null, produced: 0 };
  const p = content.balance.drugs.production;
  if (state.drugs.ops.length === 0) return out;
  if (isIncarcerated(state)) return out;
  for (const op of [...state.drugs.ops]) {
    const def = opDef(content, op.defId);
    const drug = drugDef(content, op.drugId);
    if (!def || !drug) {
      state.drugs.ops = state.drugs.ops.filter((o) => o !== op);
      continue;
    }
    const cost = opCost(state, def, content);
    const k = op.running === 'full' ? 1 : 0.5;
    spend(state, Math.round(cost.upkeep * k), content);
    // Quality moves with how it is run.
    op.quality = clampInt(op.quality + (op.running === 'full' ? p.quality.up : -p.quality.down), 0, def.quality.max);
    // Raid: the police take the output on hand and close it, and you are charged for making it.
    if (chance(state.rng, raidChance(state, op, content))) {
      out.raided = op;
      state.drugs.totals.raids += 1;
      state.drugs.ops = state.drugs.ops.filter((o) => o !== op);
      say(state, 'raided', { name: op.name }, content);
      seizeStock(state, false);
      charge(state, 'making', content, { drugId: op.drugId, findHidden: false });
      continue;
    }
    // Output.
    const units = Math.round(def.capacity * (op.running === 'full' ? p.runs.full : p.runs.low));
    const held = state.drugs.stock[op.drugId]?.units ?? 0;
    const room = Math.max(0, content.balance.drugs.buy.cap - held);
    const made = Math.min(units, room);
    // Theft: some of the output goes.
    if (chance(state.rng, def.theft)) {
      out.stolen = op;
      say(state, 'stolen', { name: op.name }, content);
    } else if (made > 0) {
      addStock(state, op.drugId, made, op.quality);
      out.produced += made;
      state.drugs.totals.produced += made;
      op.last = { year: state.currentYear, units: made };
    }
    // Fire: a share of the fit-out goes, and the quality with it.
    if (chance(state.rng, def.fire)) {
      out.fire = op;
      op.assets = Math.round(op.assets * (1 - p.fireLoss));
      op.quality = clampInt(op.quality - 20, 0, 100);
      say(state, 'fire', { name: op.name }, content);
      state.character.stats.stress = clampInt(state.character.stats.stress + 6, 0, 100);
    }
    addHeat(state, Math.round(p.runHeat * k));
    state.character.stats.stress = clampInt(Math.round(state.character.stats.stress + p.stress * k), 0, 100);
  }
  return out;
}
