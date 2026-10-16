/**
 * Sanity checks on belonging (W2): your faith and values are in range and
 * name real things, every group you belong to is real, in your city, open to
 * your age and has a role on its ladder, a child is never committed past
 * what a child can be, and the people a group brought are real.
 */
import { VALUE_IDS, type ContentBundle } from '../../content/schemas';
import { foundHealthy, healthyIn, markHealthy } from '../healthy';
import type { LifeState } from '../types';

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

export function belongingFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const b = state.belonging;
  const faiths = content.registries.belonging.faiths;
  const adultAge = content.balance.relationships.adultAge;
  const age = state.character.age;

  for (const key of VALUE_IDS) {
    for (const [label, level] of [['value', b.values[key]], ['temperament', b.temperament[key]]] as const) {
      if (!whole(level) || level < 0 || level > 100) fail(`belonging.${label}.${key} ${String(level)} is not a whole number from 0 to 100`);
    }
  }
  if (!whole(b.community) || b.community < 0 || b.community > 100) fail(`belonging.community ${b.community} is outside 0–100`);
  const f = b.faith;
  if (f.id !== null && !faiths[f.id]) fail(`faith "${f.id}" is not a known faith`);
  if (f.raised !== null && !faiths[f.raised]) fail(`faith.raised "${f.raised}" is not a known faith`);
  if (b.household.faith !== null && !faiths[b.household.faith]) fail(`household faith "${b.household.faith}" is not a known faith`);
  if (!whole(f.strength) || f.strength < 0 || f.strength > 100) fail(`faith.strength ${f.strength} is outside 0–100`);
  if (f.id === null && f.strength !== 0) fail('no faith but a strength of belief');
  if (f.id !== null && f.strength < 1) fail('a faith with no belief at all (it should have ended)');
  if (f.since !== null && (f.since < state.birthYear || f.since > state.currentYear)) fail('faith.since is outside the life');
  if (state.character.latent.faith && state.character.latent.faith.id !== null && !faiths[state.character.latent.faith.id]) fail('latent faith names an unknown faith');
  if (!b.upgrade && state.character.latent.faith && state.character.latent.faith.id === f.id) fail('latent faith is the faith you already have');

  if (b.memberships.length > content.balance.belonging.groups.max) fail(`${b.memberships.length} groups, more than ${content.balance.belonging.groups.max}`);
  const seen = new Set<string>();
  for (const m of b.memberships) {
    const label = `membership ${m.groupId}`;
    if (seen.has(m.groupId)) fail(`${label} appears twice`);
    seen.add(m.groupId);
    const g = b.groups[m.groupId];
    const def = g && content.groups[g.defId];
    if (!g || !def) {
      fail(`${label} is not a known group`);
      continue;
    }
    if (g.cityId !== state.character.cityId) fail(`${label} is in ${g.cityId}, not your city`);
    if (age < def.minAge || (def.maxAge !== undefined && age > def.maxAge)) fail(`${label} is not open to someone aged ${age}`);
    if (m.rung < 0 || m.rung >= def.ladder.length) fail(`${label} has rung ${m.rung}, outside its ladder`);
    if (!whole(m.standing) || m.standing < 0 || m.standing > 100) fail(`${label} standing ${m.standing} is outside 0–100`);
    if (m.commitment === 'committed' && age < 16) fail(`${label}: a child is committed`);
    if (m.since > state.currentYear || m.rungSince < m.since || m.rungSince > state.currentYear) fail(`${label} has years outside the life`);
    if (m.rung >= 2 && age < adultAge) fail(`${label}: a role above helper held by a minor`);
    if (g.welcome < 0 || g.welcome > 100 || g.strict < 0 || g.strict > 100 || g.intense < 0 || g.intense > 100) fail(`${label}'s traits are outside 0–100`);
  }
  for (const [id, g] of Object.entries(b.groups)) {
    if (!content.groups[g.defId]) fail(`group ${id} is a kind (${g.defId}) that does not exist`);
    for (const pid of g.people) if (!state.people[pid]) fail(`group ${id} lists ${pid}, who is not a person in the life`);
  }
  for (const [city, ids] of Object.entries(b.cities)) {
    if (!content.cities[city]) fail(`groups for unknown city "${city}"`);
    for (const id of ids) if (!b.groups[id]) fail(`city ${city} lists group ${id}, which is missing`);
  }
  const healthy = healthyIn(content, 'belonging');
  const peopleBefore = failures.length;
  const unchanged = foundHealthy(content, 'belonging', state.people, [], state.currentYear);
  for (const id in state.people) {
    if (unchanged) break;
    const p = state.people[id]!;
    if (!p.faith || healthy.get(p.faith) === state.currentYear) continue;
    const before = failures.length;
    if (p.faith.id !== null && !faiths[p.faith.id]) fail(`person ${id} has an unknown faith "${p.faith.id}"`);
    if ((p.faith.id === null) !== (p.faith.strength === 0)) fail(`person ${id}: faith and strength disagree`);
    if (failures.length === before) healthy.set(p.faith, state.currentYear);
  }
  if (failures.length === peopleBefore) markHealthy(content, 'belonging', state.people, [], state.currentYear);
  for (const past of b.past) if (past.toYear < past.fromYear) fail(`past membership ${past.groupId} ended before it began`);
  return failures;
}
