/**
 * Invariants for the social web (E4): ties only between two different living
 * people in your circle, one record for each pair (the same from both sides),
 * a kind and affection that make sense, no romance unless both are unrelated
 * adults, feuds that fit their affection and sides taken from among the two;
 * knowledge items of known kinds and versions, holders who are in your
 * circle and believe a version that exists, and the caps on items.
 */
import type { ContentBundle } from '../../content/schemas';
import { ageOf } from '../relationships';
import type { LifeState } from '../types';
import { kindDef } from './knowledge';
import { tieKey } from './query';
import { areRelated, inCircle } from './ties';

export function webFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const web = state.web;
  const { adultAge } = content.balance.relationships;
  const bal = content.balance.web;

  for (const [key, t] of Object.entries(web.ties)) {
    const label = `tie ${key}`;
    if (t.a === t.b) fail(`${label}: a person tied to themselves`);
    if (key !== tieKey(t.a, t.b) || t.a > t.b) fail(`${label}: not kept under its pair key (a tie is the same from both sides)`);
    for (const id of [t.a, t.b]) {
      const p = state.people[id];
      if (!p) fail(`${label}: ${id} is not in the life`);
      else if (!inCircle(state, id)) fail(`${label}: ${id} is not alive and in your circle`);
    }
    if (!Number.isInteger(t.affection) || t.affection < 0 || t.affection > 100) fail(`${label}: affection ${t.affection} is out of range`);
    if (t.since > state.currentYear) fail(`${label}: began in the future`);
    if (t.kind === 'dating' || t.kind === 'married') {
      const pa = state.people[t.a];
      const pb = state.people[t.b];
      if (pa && ageOf(state, pa) < adultAge) fail(`${label}: a couple tie with someone under ${adultAge}`);
      if (pb && ageOf(state, pb) < adultAge) fail(`${label}: a couple tie with someone under ${adultAge}`);
      if (t.origin !== 'family' && areRelated(state, t.a, t.b)) fail(`${label}: a couple tie between people who are related`);
      if (pa?.life?.partner || pb?.life?.partner) fail(`${label}: a couple tie with someone who has a partner of their own`);
    }
    if (t.feud) {
      if (t.feud.since > state.currentYear) fail(`${label}: a feud that began in the future`);
      if (t.feud.side !== undefined && t.feud.side !== t.a && t.feud.side !== t.b) fail(`${label}: a side taken that is neither of them`);
      if (t.feud.side !== undefined && t.feud.neutral) fail(`${label}: a feud you took a side in and also stayed out of`);
    }
  }
  // A person is in at most one couple tie (except the pair of parents, which is one tie anyway).
  const couples = new Map<string, number>();
  for (const t of Object.values(web.ties)) {
    if (t.kind !== 'dating' && t.kind !== 'married') continue;
    for (const id of [t.a, t.b]) couples.set(id, (couples.get(id) ?? 0) + 1);
  }
  for (const [id, n] of couples) if (n > 1) fail(`person ${id} is in ${n} couple ties`);

  const seen = new Set<string>();
  for (const item of web.items) {
    const label = `item ${item.id}`;
    if (seen.has(item.id)) fail(`${label}: duplicate id`);
    seen.add(item.id);
    const def = kindDef(content, item.kind);
    if (!def) {
      fail(`${label}: unknown kind "${item.kind}"`);
      continue;
    }
    if (!def.versions[item.truth]) fail(`${label}: true version "${item.truth}" does not exist`);
    if (item.subject !== 'you' && !state.people[item.subject]) fail(`${label}: about ${item.subject}, who is not in the life`);
    if (item.year > state.currentYear) fail(`${label}: from the future`);
    for (const [id, h] of Object.entries(item.holders)) {
      if (!inCircle(state, id)) fail(`${label}: held by ${id}, who is not alive and in your circle`);
      if (!def.versions[h.version]) fail(`${label}: ${id} believes "${h.version}", which does not exist`);
      if (h.since > state.currentYear) fail(`${label}: ${id} heard it in the future`);
      if (h.from !== 'you' && h.from !== 'saw' && !state.people[h.from]) fail(`${label}: ${id} heard it from ${h.from}, who is not in the life`);
      if (id === item.subject) fail(`${label}: ${id} holds a story about themselves`);
    }
  }
  if (web.items.length > bal.knowledge.maxItems) fail(`the web keeps ${web.items.length} items (at most ${bal.knowledge.maxItems})`);
  const numbers = web.items.map((i) => Number(i.id.slice(1)));
  if (numbers.some((n) => !Number.isInteger(n) || n >= web.nextItem)) fail('an item number is not below the next item number');
  if (web.seen.length > bal.knowledge.remember) fail('the record of noticed facts is too long');
  return failures;
}
