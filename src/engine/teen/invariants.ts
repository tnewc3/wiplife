/**
 * Invariants for the teen years (T1): the state is well formed (crowds, the
 * license, a teen job, teams and clubs, house rules), nothing runs outside the
 * ages it is for, and above all nothing romantic involves anyone under 18:
 * not a relationship, not a couple among the people you know, not anyone in
 * a crowd. The rule is enforced when things are made (relationships.ts,
 * web/ties.ts) and checked here whatever made them.
 */
import type { ContentBundle } from '../../content/schemas';
import { ageOf, isRomanticKind } from '../relationships';
import type { LifeState } from '../types';

/** Failures of the rule that no romance involves anyone under the adult age. Also counted by the simulation. */
export function romanceUnderAgeFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const { adultAge } = content.balance.relationships;
  for (const [id, rel] of Object.entries(state.relationships)) {
    const person = state.people[id];
    if (!person || !isRomanticKind(rel.kind)) continue;
    if (state.character.age < adultAge && rel.kind !== 'ex') failures.push(`relationship ${id} (${rel.kind}): you are under ${adultAge} and in a romance`);
    if (ageOf(state, person) < adultAge && rel.kind !== 'ex') failures.push(`relationship ${id} (${rel.kind}): they are under ${adultAge}`);
  }
  for (const [key, tie] of Object.entries(state.web.ties)) {
    if (tie.kind !== 'dating' && tie.kind !== 'married') continue;
    for (const pid of [tie.a, tie.b]) {
      const p = state.people[pid];
      if (p && ageOf(state, p) < adultAge) failures.push(`tie ${key}: a couple with someone under ${adultAge}`);
    }
  }
  for (const clique of state.teen.cliques) {
    for (const mid of clique.members) {
      const rel = state.relationships[mid];
      if (rel && isRomanticKind(rel.kind)) failures.push(`crowd ${clique.id}: member ${mid} is a ${rel.kind}`);
    }
  }
  for (const [id, person] of Object.entries(state.people)) {
    if (person.life?.partner && ageOf(state, person) < adultAge) failures.push(`person ${id} is under ${adultAge} and has a partner`);
  }
  return failures;
}

export function teenFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const t = state.teen;
  const b = content.balance.teen;
  const age = state.character.age;
  const { adultAge } = content.balance.relationships;
  const score = (label: string, value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > 100) fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
  };

  failures.push(...romanceUnderAgeFailures(state, content));

  score('teen.standing', t.standing);
  score('teen.passion', t.passion);
  // Crowds: only at a school, in the teen years.
  if (t.school === null && (t.cliques.length > 0 || t.member !== null)) fail('crowds without a school');
  if (age >= adultAge && (t.school !== null || t.member !== null || t.job !== null || t.activities.length > 0 || t.home !== null)) fail('teen systems running for an adult');
  const ids = new Set<string>();
  for (const c of t.cliques) {
    if (ids.has(c.id)) fail(`crowd ${c.id} appears twice`);
    ids.add(c.id);
    if (!content.cliques[c.defId]) fail(`crowd ${c.id} is an unknown kind "${c.defId}"`);
    score(`crowd ${c.id}.standing`, c.standing);
  }
  for (const c of t.cliques) {
    if (c.rival !== undefined) {
      const other = t.cliques.find((x) => x.id === c.rival);
      if (!other || other.rival !== c.id || c.rival === c.id) fail(`crowd ${c.id} has a rival that doesn't have it back`);
    }
  }
  if (t.member) {
    if (!ids.has(t.member.cliqueId)) fail('you belong to a crowd that does not exist');
    score('teen.member.rank', t.member.rank);
  }
  if (t.invite !== undefined && (!ids.has(t.invite) || t.invite === t.member?.cliqueId)) fail('an invitation from a crowd that does not exist (or from your own)');
  if (t.clash !== undefined) {
    if (!ids.has(t.clash.cliqueId)) fail('a clash with a crowd that does not exist');
    if (t.clash.until < t.clash.since) fail('a clash that ends before it begins');
  }
  // The license.
  const lic = t.license;
  if (lic.stage === 'permit' && age < b.license.permitAge) fail(`a learner's permit under ${b.license.permitAge}`);
  if (lic.stage === 'licensed' && age < b.license.licenseAge) fail(`a license under ${b.license.licenseAge}`);
  if (lic.lessons > b.license.lessons.max) fail('more driving lessons than the limit');
  // A teen job and teams and clubs.
  if (t.job) {
    const def = content.teenJobs[t.job.jobId];
    if (!def) fail(`a teen job in an unknown track "${t.job.jobId}"`);
    else {
      if (age < def.minAge) fail('a teen job below its minimum age');
      if (def.needsLicense && lic.stage !== 'licensed') fail('a teen job that needs a license, without one');
    }
    if (state.career.gig) fail('gig work alongside a teen job');
    if (state.career.job) fail('a teen job alongside a career job');
  }
  if (t.activities.length > b.activities.max) fail('more teams and clubs than the limit');
  const seen = new Set<string>();
  for (const a of t.activities) {
    if (seen.has(a.id)) fail(`${a.id} appears twice`);
    seen.add(a.id);
    if (!content.activities[a.id]) fail(`an unknown team or club "${a.id}"`);
  }
  // House rules.
  if (t.home) {
    const domains = new Set<string>();
    for (const r of t.home.rules) {
      if (domains.has(r.ruleId)) fail(`two house rules for ${r.ruleId}`);
      domains.add(r.ruleId);
      if (!content.houseRules[r.ruleId]) fail(`an unknown house rule "${r.ruleId}"`);
      if (r.caught > r.broken) fail(`rule ${r.ruleId}: caught more often than broken`);
      if (!state.people[r.by]) fail(`rule ${r.ruleId} was set by someone who is not on your list`);
    }
  }
  if (t.totals.caught > t.totals.broken || t.totals.won > t.totals.negotiated) fail('teen totals do not add up');
  if (t.seenRecords > state.legal.record.length) fail('teen.seenRecords is past the end of the record');
  return failures;
}
