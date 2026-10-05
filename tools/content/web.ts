/**
 * Content checks for the social web (E4): the balance agrees with itself;
 * every kind of knowledge has true versions and twists that exist and can
 * be reached, text that only uses what it is given and never hardcodes a
 * pronoun, and secrets that are never funny; every event a change in the web
 * (or something someone heard) can queue is a follow-up that casts the right
 * roles and requires the tie or the story it is about; and text that says
 * what someone heard only appears where the event requires that they have.
 */
import {
  KNOWLEDGE_KINDS,
  SECRET_KINDS,
  WEB_TRIGGERS,
  type CollectionKey,
  type ContentBundle,
  type Effect,
  type EventDef,
  type KnowledgeKindId,
} from '../../src/content/schemas';
import { rolesIn } from '../../src/engine/conditions';
import { checkTemplate } from '../../src/engine/text';
import { isPartnerKind } from '../../src/engine/relationships';
import type { ContentError } from './compile';

const BALANCE = 'balance/web.yaml';
const REGISTRY = 'registries/web.yaml';

function allOutcomes(def: EventDef) {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

/** The kinds whose versions may mention the other person in the story. */
const WITH_OTHER: readonly KnowledgeKindId[] = ['affair', 'breakup'];

export function checkWeb(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const bal = bundle.balance.web;
  const registry = bundle.registries.web;
  const { tags } = bundle.registries.memories;
  const { flags } = bundle.registries.flags;

  // Balance.
  if (bal.feud.start >= bal.feud.end) err(BALANCE, 'feud: a feud ends above where it starts (start must be below end)');
  if (bal.feud.endAffection < bal.feud.end) err(BALANCE, 'feud.endAffection is below end (a feud that ends would start again)');
  if (bal.feud.heal.min > bal.feud.heal.max) err(BALANCE, 'feud.heal: min is greater than max');
  if (bal.ties.status.strained >= bal.ties.status.close) err(BALANCE, 'ties.status: strained must be below close');
  if (bal.feud.start > bal.ties.status.strained) err(BALANCE, 'feud.start is above the strained band (a feud is worse than strained)');
  if (bal.ties.shock.fall.min > bal.ties.shock.fall.max || bal.ties.shock.rise.min > bal.ties.shock.rise.max) err(BALANCE, 'ties.shock: min is greater than max');
  if (bal.events.maxPerYear > bundle.balance.pacing.cap) err(BALANCE, `events.maxPerYear is above the pacing cap (${bundle.balance.pacing.cap})`);
  if (bal.knowledge.reaction.maxEvents > bundle.balance.pacing.cap) err(BALANCE, `knowledge.reaction.maxEvents is above the pacing cap (${bundle.balance.pacing.cap})`);
  if (bal.knowledge.expireYears.secret < bal.knowledge.expireYears.rumor) err(BALANCE, 'knowledge.expireYears: a secret lasts at least as long as a rumor');

  // The registry's events.
  const checkEvent = (label: string, id: string, roles: readonly string[], proof: RegExp, why: string) => {
    const def = bundle.events[id];
    if (!def) {
      if (!partialEvents) err(REGISTRY, `${label}: unknown event "${id}"`);
      return undefined;
    }
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    if (def.retired) e(`answers ${label}, but is retired`);
    if (!def.followUpOnly) e(`answers ${label}, so it must be followUpOnly`);
    const cast = Object.keys(def.cast ?? {}).sort();
    if (cast.join(',') !== [...roles].sort().join(',')) e(`answers ${label}, so its cast is exactly ${roles.join(' and ')} (not ${cast.join(', ') || 'nothing'})`);
    for (const role of roles) if (def.cast?.[role] && def.cast[role]!.support !== true) e(`"${role}" is a support role (the engine passes the person in)`);
    if (!proof.test(JSON.stringify(def.requires ?? null))) e(`must require ${why}`);
    return def;
  };
  for (const trigger of WEB_TRIGGERS) {
    for (const id of registry.triggers[trigger].events) {
      const story = trigger === 'betrayed' || trigger === 'public';
      checkEvent(`trigger ${trigger}`, id, story ? ['npc'] : ['a', 'b'], story ? /"heard"/ : /"tie"/, story ? 'something of "npc" they have heard (heard: ...)' : 'the tie between "a" and "b" (tie: ...)');
    }
  }

  // The kinds of knowledge.
  const infidelity = new Set([...bundle.registries.interactions.infidelity.flirt.events, ...bundle.registries.interactions.infidelity.intimate.events]);
  for (const kind of KNOWLEDGE_KINDS) {
    const def = registry.kinds[kind];
    const at = (message: string) => err(REGISTRY, `kinds.${kind}: ${message}`);
    if (def.secret !== SECRET_KINDS.includes(kind)) at(SECRET_KINDS.includes(kind) ? 'is a secret' : 'is not a secret');
    for (const t of def.truths) if (!def.versions[t]) at(`true version "${t}" is not among the versions`);
    const targeted = new Set<string>();
    for (const [vid, v] of Object.entries(def.versions)) {
      const vat = (message: string) => at(`versions.${vid}: ${message}`);
      const roles = WITH_OTHER.includes(kind) ? ['self', 'other'] : ['self'];
      for (const message of checkTemplate(v.heard, { roles })) vat(`heard: ${message}`);
      if (!/^that /.test(v.heard)) vat('heard follows "has heard", so it starts with "that"');
      if (v.heardAbout !== undefined) {
        for (const message of checkTemplate(v.heardAbout, { roles: ['about'] })) vat(`heardAbout: ${message}`);
        if (!/^that /.test(v.heardAbout)) vat('heardAbout follows "has heard", so it starts with "that"');
      } else if (!def.secret) vat('heardAbout is missing (news that is not a secret can be about someone else)');
      for (const text of [v.heard, v.heardAbout ?? '']) {
        if (/\b(he|she|him|her|his|hers)\b/i.test(text.replace(/\{[^}]*\}/g, ''))) vat(`hardcoded pronoun; use placeholders: "${text.slice(0, 50)}"`);
      }
      if (def.secret && v.light) vat('a secret is never played for laughs (light is for low-stakes rumors)');
      for (const tw of v.twists) {
        if (!def.versions[tw.to]) vat(`twists to "${tw.to}", which is not a version`);
        else if (tw.to === vid) vat('twists to itself');
        targeted.add(tw.to);
      }
      if (!def.truths.includes(vid) && v.twists.length === 0) vat('a twisted version needs a twist back (stories settle as well as spread)');
    }
    for (const vid of Object.keys(def.versions)) {
      if (!def.truths.includes(vid) && !targeted.has(vid)) at(`version "${vid}" can never be reached (nothing twists into it)`);
    }
    if (!Object.values(def.versions).some((v) => v.twists.length > 0)) at('needs at least one twisted version');
    const s = def.sources;
    if (kind === 'affair' && !s.memory) at('sources.memory is needed (the memory an unfaithful night leaves)');
    if (s.memory !== undefined && !tags[s.memory]) at(`sources.memory: "${s.memory}" is not in registries/memories.yaml`);
    if ((s.flags.length > 0 || Object.keys(s.unless).length > 0) && kind !== 'unknownCrime') at('sources.flags is for unknownCrime');
    if (kind === 'unknownCrime' && s.flags.length === 0) at('sources.flags is needed (what you did that nobody saw)');
    for (const f of [...s.flags, ...Object.keys(s.unless), ...Object.values(s.unless)]) if (!flags[f]) at(`sources: flag "${f}" is not in registries/flags.yaml`);
    // Its reactions.
    for (const id of def.reactions) {
      const ev = bundle.events[id];
      if (!ev) {
        if (!partialEvents) at(`reactions: unknown event "${id}"`);
        continue;
      }
      const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
      if (!ev.followUpOnly) e(`answers someone hearing about ${kind}, so it must be followUpOnly`);
      if (ev.retired) e(`answers ${kind}, but is retired`);
      if (infidelity.has(id)) continue;
      const cast = ev.cast ?? {};
      if (!cast.npc || cast.npc.support !== true) e('casts the person who heard as "npc" (a support role)');
      for (const [role, spec] of Object.entries(cast)) {
        if (role !== 'npc' && !(role === 'other' || (spec.kind !== undefined && isPartnerKind(spec.kind)))) e(`answers ${kind}, so its cast can only be npc (and other, or a partner)`);
      }
      const proof = JSON.stringify(ev.requires ?? null);
      if (!new RegExp(`"heard":\\{[^}]*"kinds":\\[[^\\]]*"${kind}"`).test(proof)) e(`must require that "npc" has heard about ${kind} (heard: { kinds: [${kind}] })`);
    }
  }

  // Events: {heard} only where someone has heard; tie and knowledge effects name roles in the cast.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const file = fileOf('events', id);
    const roles = Object.keys(def.cast ?? {});
    const texts: string[] = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label)];
    for (const o of allOutcomes(def)) {
      if (o.text) texts.push(o.text);
      for (const eff of o.effects as Effect[]) {
        if (eff.type === 'history') texts.push(eff.text);
        if (eff.type === 'tie') {
          for (const r of [eff.a, eff.b, ...(eff.with ? [eff.with] : [])]) if (!roles.includes(r)) err(file, `${id}: tie effect: role "${r}" is not in the cast`);
        }
        if (eff.type === 'introduce' && !roles.includes(eff.with)) err(file, `${id}: introduce effect: role "${eff.with}" is not in the cast`);
      }
    }
    if (texts.some((t) => /\{heard\}/.test(t))) {
      const proof = JSON.stringify(def.requires ?? null);
      if (!/"role":"(npc|person)"[^{}]*"heard":\{/.test(proof)) err(file, `${id}: {heard} needs requires: role npc with heard: { ... } (someone has to have heard it)`);
    }
    const used = rolesIn(def.requires);
    if (JSON.stringify(def.requires ?? null).includes('"tie"') && !(used.includes('a') && used.includes('b'))) err(file, `${id}: a tie condition names roles a and b`);
  }
  return errors;
}
