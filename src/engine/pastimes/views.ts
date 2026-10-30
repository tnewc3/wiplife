/**
 * What the Activities screen needs (Batch 2a), read through selectors: the
 * activities on offer to you now, grouped by category, with the price on each
 * (who can come along and what the price tiers cost), why one can't be done
 * right now, and the receipts of this year's activities. Availability is the
 * engine's (./query.ts); the screen only draws it.
 */
import {
  ACTIVITY_SECTIONS,
  PASTIME_CATEGORIES,
  PASTIME_QUALITIES,
  PASTIME_ROUTES,
  PASTIME_STAKES,
  type ContentBundle,
  type NameChange,
  type OutcomeTier,
  type PastimeCategory,
  type PastimeCompanionKind,
  type PastimeLook,
  type ActivityKind,
  type ActivityLink,
  type ActivitySection,
  type PastimeMechanic,
  type PastimeDef,
  type PastimeQuality,
  type PastimeRoute,
  type PastimeStake,
} from '../../content/schemas';
import { scaledAmount } from '../country';
import { netWorth } from '../finance';
import type { MoneyChange, LifeState, PastimeReceipt } from '../types';
import { allPastimes, companionOptions, HIDING_BLOCKS, pastimeBlock, pastimeCount, pastimeMinAge, pastimePrice, type CompanionOption, type PastimeBlock, type PastimeChoice } from './query';
import { hobbyLevel, hobbySkill, hubCount, lookOptions, optionsOf } from './activities';
import { consentOptions, evidenceCount, lastGamblingLoss, loanOffer, nameAfter, type LoanBlock } from './risk';

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
  /** A1: the activity of the Activities tab it is an option of. */
  hub: string | null;
  /** A1: what you can choose to change in your portrait (the salon and shopping), and for a hobby your skill and its level. */
  look: { kind: PastimeLook; options: string[] } | null;
  hobby: { skill: number; level: number } | null;
  /** Batch 2b: how it is worked out, and what the screen needs for it. */
  mechanic: PastimeMechanic;
  /** Gambling: the stakes with their prices; and chasing a loss (the loss, and what betting it back costs). */
  stakes: { stake: PastimeStake; price: number; block: PastimeBlock | null; chasePrice: number; chaseBlock: PastimeBlock | null }[] | null;
  chase: { available: boolean; loss: number } | null;
  /** A lawsuit: settle or go to trial, and how many pieces of evidence you hold. */
  routes: { route: PastimeRoute; block: PastimeBlock | null }[] | null;
  evidence: number | null;
  /** A loan: what the lender offers and, if they say no, why. */
  loan: { amount: number; fee: number; rate: number; termYears: number; block: LoanBlock | null; lender: string } | null;
  /** A name change: which part, your name now, who could agree for a minor, and (when it is fixed) the name you would take. */
  name: { part: NameChange; fields: ('first' | 'last')[]; current: { first: string; last: string }; adult: boolean; consent: CompanionOption[]; takes: { first: string; last: string } | null } | null;
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

/** The choices used to ask whether an activity is on offer at all: a middling stake, a trial, the standard tier. */
function sampleOf(state: LifeState, def: PastimeDef, content: ContentBundle): PastimeChoice {
  return { ...(def.look !== undefined ? { look: lookOptions(state, def.look, content)[0] } : {}), ...(def.quality ? { quality: 'standard' as const } : {}), ...(def.mechanic === 'gamble' ? { stake: 'medium' as const } : {}), ...(def.mechanic === 'lawsuit' ? { route: 'trial' as const } : {}) };
}

function entryView(state: LifeState, defId: string, content: ContentBundle): ActivityEntryView | null {
  const def = content.pastimes[defId]!;
  const companions = companionOptions(state, def, content);
  const sampleQuality: PastimeQuality | undefined = def.quality ? 'standard' : undefined;
  const sample = sampleOf(state, def, content);
  const sampled = def.companion === 'required' ? { ...sample, companionId: companions[0]?.id } : sample;
  const base = pastimeBlock(state, def, sampled, content);
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
    qualities: def.quality ? PASTIME_QUALITIES.map((quality) => ({ quality, price: pastimePrice(state, def, { quality }, content), block: pastimeBlock(state, def, { ...sampled, quality }, content) })) : null,
    count: pastimeCount(state, def.id),
    limit: def.yearlyLimit,
    block: def.quality ? pastimeBlock(state, def, { ...sample, quality: 'budget', companionId: def.companion === 'required' ? first?.id : undefined }, content) : base,
    hub: def.hub ?? null,
    look: def.look !== undefined ? { kind: def.look, options: lookOptions(state, def.look, content) } : null,
    hobby: def.hobby ? { skill: hobbySkill(state, def.id, content), level: hobbyLevel(hobbySkill(state, def.id, content), content) } : null,
    buys: def.buys !== undefined ? (content.valuables[def.buys]?.name ?? null) : null,
    mechanic: def.mechanic,
    stakes: def.mechanic === 'gamble' ? PASTIME_STAKES.map((stake) => ({ stake, price: pastimePrice(state, def, { stake }, content), block: pastimeBlock(state, def, { stake }, content), chasePrice: pastimePrice(state, def, { stake, chase: true }, content), chaseBlock: pastimeBlock(state, def, { stake, chase: true }, content) })) : null,
    chase: def.mechanic === 'gamble' ? chaseView(state, content) : null,
    routes: def.mechanic === 'lawsuit' ? PASTIME_ROUTES.map((route) => ({ route, block: pastimeBlock(state, def, { ...sampled, route }, content) })) : null,
    evidence: def.evidence ? evidenceCount(state, def, first?.id, content) : null,
    loan: def.mechanic === 'loan' ? loanView(state, def, content) : null,
    name: def.mechanic === 'name' ? nameView(state, def, content) : null,
  };
}

function chaseView(state: LifeState, content: ContentBundle): ActivityEntryView['chase'] {
  const loss = lastGamblingLoss(state, content);
  return { available: loss > 0, loss };
}

function loanView(state: LifeState, def: ReturnType<typeof allPastimes>[number], content: ContentBundle): ActivityEntryView['loan'] {
  const o = loanOffer(state, def, content);
  return { amount: o.amount, fee: o.fee, rate: o.rate, termYears: o.termYears, block: o.block, lender: def.lender ?? '' };
}

function nameView(state: LifeState, def: ReturnType<typeof allPastimes>[number], content: ContentBundle): ActivityEntryView['name'] {
  const part = def.nameChange!;
  const fields: ('first' | 'last')[] = part === 'first' ? ['first'] : part === 'last' ? ['last'] : part === 'both' ? ['first', 'last'] : [];
  const fixed = nameAfter(state, def, {});
  return {
    part,
    fields,
    current: { ...state.character.name },
    adult: state.character.age >= content.balance.relationships.adultAge,
    consent: consentOptions(state, content).map((c) => ({ id: c.id, name: c.name, kind: 'parent' })),
    takes: typeof fixed === 'string' ? null : fixed,
  };
}

/** Why a typed name change can't go ahead yet (for the screen's live check), or null. */
export function nameIssue(state: LifeState, pastimeId: string, choice: PastimeChoice, content: ContentBundle): PastimeBlock | null {
  const def = content.pastimes[pastimeId];
  return def && def.mechanic === 'name' ? pastimeBlock(state, def, choice, content) : 'name';
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


/** Why an activity of the tab can't be opened at all right now (greyed out; tapping it says why). */
export type HubBlock = { reason: 'age'; minAge: number } | { reason: 'prison' } | { reason: 'nothing' };

export interface ActivityHubView {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  kind: ActivityKind;
  /** Which part of its category's submenu it is in. */
  section: ActivitySection;
  /** `link` activities: the page they open. */
  opens: ActivityLink | null;
  /** Times done this year (across its options), and the most. */
  count: number;
  limit: number;
  block: HubBlock | null;
  /** The options on offer to you now (an options, vacation or hobbies activity). */
  options: ActivityEntryView[];
}

export interface ActivitySectionView {
  id: ActivitySection;
  activities: ActivityHubView[];
}

export interface ActivityCategoryView {
  id: string;
  label: string;
  icon: string;
  subtitle: string;
  accent: 'gold' | null;
  sections: ActivitySectionView[];
  /** How many activities it has for you, and how many of them are open to you now. */
  total: number;
  open: number;
}

/** The net worth a category needs to appear (its `needs` threshold, at the prices of the country you live in), or 0. */
export function categoryNetWorthNeed(state: LifeState, needs: string | undefined, content: ContentBundle): number {
  if (needs === undefined) return 0;
  return scaledAmount(state, content.balance.activities.thresholds[needs] ?? 0, content);
}

/**
 * The Activities tab (U2): the categories that apply to you, each with its Activities and Shopping sections. An activity is
 * greyed out with the reason (age, prison, nothing on offer), or hidden when it asks to be (rehab while nothing is wrong); a
 * category shows once it has something for you, is old enough and, for Luxury, rich enough. Availability is the engine's.
 */
export function getActivityTabView(state: LifeState, content: ContentBundle): { categories: ActivityCategoryView[]; canAct: boolean; savings: number } {
  const reg = content.registries.activities;
  const age = state.character.age;
  const adult = content.balance.relationships.adultAge;
  const prison = state.housing.kind === 'incarcerated';
  const worth = netWorth(state);
  const categories: ActivityCategoryView[] = [];
  for (const c of reg.categories) {
    // Only a category that asks for a net worth (Luxury) looks at it: someone in debt still sees everything else.
    if (age < c.minAge || (c.needs !== undefined && worth < categoryNetWorthNeed(state, c.needs, content))) continue;
    const activities = reg.activities
      .filter((a) => a.category === c.id)
      .map((a): ActivityHubView => {
        const hasOptions = a.kind === 'options' || a.kind === 'vacation' || a.kind === 'hobbies';
        const options = hasOptions ? optionsOf(content, a.id).flatMap((d) => {
          const v = entryView(state, d.id, content);
          return v ? [v] : [];
        }) : [];
        // The youngest age any option allows where you live: it is what the greyed-out row says.
        const defs = optionsOf(content, a.id);
        const optionMin = defs.length > 0 ? Math.min(...defs.map((d) => Math.max(d.minAge, d.legalAge ? legalMin(state, d, content) : 0))) : 0;
        const minAge = Math.max(a.adultsOnly ? adult : 0, hasOptions ? optionMin : a.minAge);
        let block: HubBlock | null = null;
        if (prison && a.kind !== 'doctor' && a.kind !== 'link') block = { reason: 'prison' };
        else if (age < minAge) block = { reason: 'age', minAge };
        else if ((a.kind === 'options' || a.kind === 'hobbies') && options.length === 0) block = { reason: 'nothing' };
        return { id: a.id, label: a.label, subtitle: a.subtitle, icon: a.icon, kind: a.kind, section: a.section, opens: a.opens ?? null, count: hubCount(state, a.id), limit: a.limit, block, options };
      })
      // Hidden, not greyed out: rehab while nothing is wrong, a trip for a toddler.
      .filter((a) => !(reg.activities.find((x) => x.id === a.id)!.hideWhenNothing && a.block?.reason === 'nothing'));
    if (activities.length === 0) continue;
    categories.push({
      id: c.id,
      label: c.label,
      icon: c.icon,
      subtitle: c.subtitle,
      accent: c.accent ?? null,
      sections: ACTIVITY_SECTIONS.map((id) => ({ id, activities: activities.filter((a) => a.section === id) })).filter((sec) => sec.activities.length > 0),
      total: activities.length,
      open: activities.filter((a) => a.block === null).length,
    });
  }
  return { categories, canAct: state.phase === 'yearStart' && !prison, savings: state.finances.savings };
}

function legalMin(state: LifeState, def: PastimeDef, content: ContentBundle): number {
  return pastimeMinAge(state, def, content);
}
