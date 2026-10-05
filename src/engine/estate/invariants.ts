/**
 * Invariants for wills, estates, family lines and heirs (E2b): a will adds up
 * to 100 and names people and causes that exist; a settlement shares out
 * exactly what the estate held (nothing created or lost, no inherited debt);
 * trust only while the heir is under its release age; a minor heir always has
 * someone to live with (a guardian, or a foster carer); the family line's
 * reputation and deeds are in range.
 */
import { FAMILY_DEEDS, GUARDIAN_KINDS } from '../../content/schemas';
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

export function estateFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const money = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${label} must be a whole-dollar amount of at least 0 (got ${String(value)})`);
  };
  const independence = content.balance.economy.independenceAge;
  const age = state.character.age;

  // The will.
  const will = state.will;
  if (will) {
    const { maxShares } = content.balance.family.estate;
    if (will.shares.length < 1 || will.shares.length > maxShares) fail(`the will has ${will.shares.length} shares (1–${maxShares})`);
    if (age < content.balance.relationships.adultAge) fail('a will written by someone under the adult age');
    let total = 0;
    const seen = new Set<string>();
    for (const s of will.shares) {
      total += s.percent;
      if (!Number.isInteger(s.percent) || s.percent < 1 || s.percent > 100) fail(`a will share of ${String(s.percent)}%`);
      const key = `${s.kind}:${s.id}`;
      if (seen.has(key)) fail(`${key} appears twice in the will`);
      seen.add(key);
      if (s.kind === 'person' && !state.people[s.id]) fail(`the will names a missing person ${s.id}`);
      if (s.kind === 'cause' && !content.registries.estate.causes[s.id]) fail(`the will names an unknown cause "${s.id}"`);
    }
    if (total !== 100) fail(`the will's shares add up to ${total}, not 100`);
    if (will.year > state.currentYear || will.year < state.birthYear) fail('the will was written outside the life');
  }

  // The settlement.
  const e = state.estate;
  if (state.phase === 'dead' && !e) fail('a dead character has no estate settlement');
  if (e && state.phase !== 'dead') fail('an estate settlement before death');
  if (e) {
    for (const key of ['savings', 'homeValue', 'mortgage', 'costs', 'debtsPaid', 'tax', 'writtenOff', 'mortgagePaid', 'saleCosts', 'netEstate', 'unclaimed', 'possessionSales'] as const) money(`estate.${key}`, e[key]);
    let cash = 0;
    let equity = 0;
    let percent = 0;
    for (const l of e.lines) {
      money(`estate line ${l.id} cash`, l.cash);
      cash += l.cash;
      percent += l.percent;
      if (l.property) {
        if (e.home !== 'passes') fail('a home passes to someone, but the settlement says it did not');
        equity += l.property.value - l.property.mortgage;
        if (l.property.value < l.property.mortgage) fail('a home passes with more mortgage than it is worth (debt inherited beyond its value)');
      }
    }
    if (e.lines.length > 0 && percent !== 100) fail(`the estate's shares add up to ${percent}, not 100`);
    if (e.lines.filter((l) => l.property).length > (e.home === 'passes' ? 1 : 0)) fail('the home passes to more than one person, or when it should not');
    if (e.home === 'passes' && !e.lines.some((l) => l.property)) fail('the settlement says a home passes, but no one receives it');
    if (e.netEstate !== cash + equity + e.unclaimed) fail('estate.netEstate does not match the shares');
    // Nothing created or lost.
    const passesMortgage = e.home === 'passes' ? e.mortgage : 0;
    const left = e.savings + e.possessionSales + e.homeValue - passesMortgage;
    const used = e.costs + e.debtsPaid + e.tax + e.mortgagePaid + e.saleCosts + e.netEstate;
    if (left !== used) fail(`the estate held ${left} but ${used} was accounted for`);
    if (e.unclaimed > 0 && e.lines.length > 0) fail('cash is unclaimed although someone inherits');
    // E5: possessions pass in kind to a beneficiary who is a person, each once, and never with more loan than they are worth.
    const passed = new Set<string>();
    for (const t of e.possessions) {
      if (passed.has(t.possessionId)) fail(`possession ${t.possessionId} passes twice`);
      passed.add(t.possessionId);
      if (!e.lines.some((l) => l.kind === 'person' && l.id === t.toPersonId)) fail(`possession ${t.possessionId} passes to someone who is not a beneficiary`);
      if (t.item.id !== t.possessionId) fail(`possession ${t.possessionId} is recorded as ${t.item.id}`);
      if (t.item.kind !== 'pet' && t.loan > t.item.value) fail(`possession ${t.possessionId} passes with more owed (${t.loan}) than it is worth (${t.item.value})`);
      if (t.item.kind === 'pet' && t.loan !== 0) fail('a pet passes with a loan');
    }
  }

  // The family line.
  const l = state.lineage;
  if (l.lineId.trim() === '' || l.familyName.trim() === '') fail('the family line has no id or name');
  if (!Number.isInteger(l.reputation) || l.reputation < 0 || l.reputation > 100) fail(`family reputation ${l.reputation} is outside 0–100`);
  if (l.deeds.length > content.balance.family.heir.reputation.maxDeeds) fail('the family is known for too many deeds');
  for (const d of l.deeds) if (!(FAMILY_DEEDS as readonly string[]).includes(d)) fail(`unknown family deed "${d}"`);
  if (new Set(l.deeds).size !== l.deeds.length) fail('a family deed appears twice');
  if ((l.generation > 1) !== (l.parentLifeId !== undefined)) fail('lineage.generation and parentLifeId disagree');
  if (l.generation === 1 && l.lineId !== state.id) fail('the first life of a line has its own id as the line id');
  if (l.previously && (l.previously.parentName.trim() === '' || l.previously.lines.length === 0)) fail('an empty "Previously" card');

  // Trust.
  const t = state.finances.trust;
  if (t) {
    money('trust.balance', t.balance);
    if (!(t.balance > 0)) fail('an empty trust is still listed');
    if (age >= t.releaseAge) fail(`a trust held past its release age ${t.releaseAge}`);
    if (!Number.isInteger(t.releaseAge) || t.releaseAge < independence) fail('the trust release age is below the independence age');
  }

  // Who a minor heir lives with.
  const h = state.housing;
  if (h.guardianId !== undefined) {
    const guardian = state.people[h.guardianId];
    const rel = state.relationships[h.guardianId];
    if (h.kind !== 'with_parents') fail(`a guardian but the home is "${h.kind}"`);
    if (!guardian || !rel) fail('housing.guardianId is not someone in your life');
    else {
      if (!(GUARDIAN_KINDS as readonly string[]).includes(rel.kind)) fail(`a "${rel.kind}" is a guardian`);
      if (!guardian.alive && age < independence) fail('a minor lives with a guardian who has died');
      if ((guardian.tags.includes('foster')) !== (h.foster === true)) fail('foster care and the foster carer disagree');
    }
  }
  if (h.foster && h.guardianId === undefined) fail('foster care without a carer');
  if (h.foster && age >= independence) fail('still in foster care past the independence age');
  if ((state.flags.in_foster_care === true) !== (h.foster === true)) fail('the in_foster_care flag and the housing disagree');
  if (l.parentLifeId !== undefined && age < independence && h.kind === 'with_parents' && h.guardianId === undefined) fail('a minor heir has no one to live with');
  return failures;
}
