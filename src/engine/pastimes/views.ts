/**
 * What the Activities screen needs (Batch 2a), read through selectors: the
 * activities on offer to you now, grouped by category, with the price on each
 * (who can come along and what the price tiers cost), why one can't be done
 * right now, and the receipts of this year's activities. Availability is the
 * engine's (./query.ts); the screen only draws it.
 */
import { PASTIME_CATEGORIES, PASTIME_QUALITIES, type ContentBundle, type OutcomeTier, type PastimeCategory, type PastimeCompanionKind, type PastimeQuality } from '../../content/schemas';
import type { MoneyChange, LifeState, PastimeReceipt } from '../types';
import { allPastimes, companionOptions, HIDING_BLOCKS, pastimeBlock, pastimeCount, pastimePrice, type CompanionOption, type PastimeBlock } from './query';

export interface ActivityEntryView {
  id: string;
  label: string;
  blurb: string;
  category: PastimeCategory;
  /** The price now for you alone (0 for a free activity); for a quality activity, the standard tier's. */
  price: number;
  /** What it costs with a companion, when one can come along. */
  priceTogether: number | null;
  companion: 'none' | 'optional' | 'required';
  companionKinds: PastimeCompanionKind[];
  companions: CompanionOption[];
  /** The price tiers, when it has them: their prices and whether each can be afforded. */
  qualities: { quality: PastimeQuality; price: number; block: PastimeBlock | null }[] | null;
  /** Times done this year, and the most. */
  count: number;
  limit: number;
  /** Why it can't be done right now (it is on offer to you, but not now), or null. */
  block: PastimeBlock | null;
  /** The valuable it buys, as it reads in a sentence. */
  buys: string | null;
}

export interface ActivityGroupView {
  category: PastimeCategory;
  entries: ActivityEntryView[];
}

export interface ReceiptView {
  key: string;
  pastimeId: string;
  label: string;
  category: PastimeCategory;
  tier: OutcomeTier;
  text: string;
  notes: string[];
  money: MoneyChange | null;
  companion: PastimeReceipt['companion'] | null;
  changes: PastimeReceipt['changes'];
}

export interface ActivitiesView {
  /** Between years and not in prison: activities can be done now. */
  canAct: boolean;
  savings: number;
  groups: ActivityGroupView[];
  /** This year's receipts, newest first. */
  receipts: ReceiptView[];
}

function entryView(state: LifeState, defId: string, content: ContentBundle): ActivityEntryView | null {
  const def = content.pastimes[defId]!;
  const companions = companionOptions(state, def, content);
  const sampleQuality: PastimeQuality | undefined = def.quality ? 'standard' : undefined;
  const base = pastimeBlock(state, def, { quality: sampleQuality }, content);
  // Not on offer to you at all: left out of the screen.
  if (base !== null && HIDING_BLOCKS.includes(base)) return null;
  // A companion-only activity with nobody to come is not on offer either (a date night without a partner).
  if (def.companion === 'required' && companions.length === 0) return null;
  const solo = def.companion !== 'required';
  const price = pastimePrice(state, def, { quality: sampleQuality }, content);
  const first = companions[0];
  return {
    id: def.id,
    label: def.label,
    blurb: def.blurb,
    category: def.category,
    price: solo ? price : pastimePrice(state, def, { companionId: first?.id }, content),
    priceTogether: def.companion !== 'none' && first ? pastimePrice(state, def, { companionId: first.id, quality: sampleQuality }, content) : null,
    companion: def.companion,
    companionKinds: def.companionKinds ?? [],
    companions,
    qualities: def.quality ? PASTIME_QUALITIES.map((quality) => ({ quality, price: pastimePrice(state, def, { quality }, content), block: pastimeBlock(state, def, { quality }, content) })) : null,
    count: pastimeCount(state, def.id),
    limit: def.yearlyLimit,
    block: def.quality ? pastimeBlock(state, def, { quality: 'budget' }, content) : def.companion === 'required' ? pastimeBlock(state, def, { companionId: first?.id }, content) : base,
    buys: def.buys !== undefined ? (content.valuables[def.buys]?.name ?? null) : null,
  };
}

/** The Activities screen (More → Activities): only what is on offer to you now, grouped by category. */
export function getActivitiesView(state: LifeState, content: ContentBundle): ActivitiesView {
  const ids = allPastimes(content).map((d) => d.id);
  const entries = ids.flatMap((id) => {
    const view = entryView(state, id, content);
    return view ? [view] : [];
  });
  const groups = PASTIME_CATEGORIES.map((category) => ({ category, entries: entries.filter((e) => e.category === category) })).filter((g) => g.entries.length > 0);
  const year = state.currentYear;
  const receipts = (state.pastimes.year === year ? state.pastimes.receipts : [])
    .map((r, i): ReceiptView => ({
      key: `${r.year}-${i}`,
      pastimeId: r.pastimeId,
      label: content.pastimes[r.pastimeId]?.label ?? r.pastimeId,
      category: content.pastimes[r.pastimeId]?.category ?? 'mind_body',
      tier: r.tier,
      text: r.text,
      notes: r.notes,
      money: r.money ?? null,
      companion: r.companion ?? null,
      changes: r.changes,
    }))
    .reverse();
  return { canAct: state.phase === 'yearStart' && state.housing.kind !== 'incarcerated', savings: state.finances.savings, groups, receipts };
}
