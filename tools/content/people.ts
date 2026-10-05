/**
 * Content checks for the lives of the people you know (E3): the balance
 * agrees with itself, every news line only uses what it is given and never
 * hardcodes a pronoun, every event a request can queue is a follow-up that
 * casts the person whose life changed as `npc` (and only roles the engine or
 * the cast can fill), and text about someone's partner, job or past partner
 * only appears where their situation is required.
 */
import {
  NEWS_VALUES,
  REQUEST_TRIGGERS,
  type CollectionKey,
  type ContentBundle,
  type Effect,
  type EventDef,
  type NewsKind,
} from '../../src/content/schemas';
import { rolesIn } from '../../src/engine/conditions';
import { LIFE_FIELDS, checkTemplate } from '../../src/engine/text';
import type { ContentError } from './compile';

const BALANCE = 'balance/people.yaml';
const REGISTRY = 'registries/people.yaml';
const NEWS = 'text/news.yaml';

/** The roles a request event may cast besides `npc`. */
const EXTRA_ROLES = ['partner', 'sibling'] as const;

function allOutcomes(def: EventDef) {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

/** Every template in an event, with where it is. */
function templatesOf(def: EventDef): { where: string; text: string; choice?: string }[] {
  const found: { where: string; text: string; choice?: string }[] = [
    { where: 'title', text: def.title },
    { where: 'text', text: def.text },
  ];
  if (def.autoOutcome?.text) found.push({ where: 'autoOutcome', text: def.autoOutcome.text });
  for (const choice of def.choices ?? []) {
    found.push({ where: `choices.${choice.id}.label`, text: choice.label, choice: choice.id });
    const outcomes = choice.outcome ? [choice.outcome] : choice.check ? [choice.check.success, choice.check.failure] : [];
    for (const o of outcomes) {
      if (o.text) found.push({ where: `choices.${choice.id}`, text: o.text, choice: choice.id });
      for (const e of o.effects as Effect[]) if (e.type === 'history') found.push({ where: `choices.${choice.id} history`, text: e.text, choice: choice.id });
    }
  }
  if (def.autoOutcome) for (const e of def.autoOutcome.effects as Effect[]) if (e.type === 'history') found.push({ where: 'autoOutcome history', text: e.text });
  return found;
}

export function checkPeople(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const bal = bundle.balance.people;
  const economy = bundle.balance.economy;

  // Balance.
  if (bal.love.partnerAgeOffset.min > bal.love.partnerAgeOffset.max) err(BALANCE, 'love.partnerAgeOffset: min is greater than max');
  for (const tier of ['close', 'near', 'far'] as const) {
    for (const kind of tier === 'close' ? bal.tiers.closeKinds : tier === 'near' ? bal.tiers.nearKinds : []) {
      if (tier === 'near' && bal.tiers.closeKinds.includes(kind)) err(BALANCE, `tiers: "${kind}" is both close and near`);
    }
  }
  if (bal.domains.far.some((d) => !bal.domains.near.includes(d)) || bal.domains.near.some((d) => !bal.domains.close.includes(d))) {
    err(BALANCE, 'domains: each tier follows a subset of the tier above it (close ⊇ near ⊇ far)');
  }
  if (bal.trouble.intervention < bal.trouble.serious) err(BALANCE, 'trouble: intervention starts below serious');
  if (bal.career.unemployedWealth === undefined) err(BALANCE, 'career.unemployedWealth is missing');
  if (bal.requests.maxPerYear > bundle.balance.pacing.cap) err(BALANCE, `requests.maxPerYear is above the pacing cap (${bundle.balance.pacing.cap})`);
  if (bal.news.perPerson > bal.news.maxPerYear) err(BALANCE, 'news: perPerson is above maxPerYear');

  // News text.
  for (const kind of Object.keys(NEWS_VALUES) as NewsKind[]) {
    (bundle.text.news.lines[kind] ?? []).forEach((template, i) => {
      for (const message of checkTemplate(template, { roles: ['npc'], values: [...NEWS_VALUES[kind]] })) err(NEWS, `lines.${kind}[${i}]: ${message}`);
      if (/\b(he|she|him|her|his|hers)\b/i.test(template.replace(/\{[^}]*\}/g, ''))) err(NEWS, `lines.${kind}[${i}]: hardcoded pronoun; use placeholders`);
      if (template.length > 140) err(NEWS, `lines.${kind}[${i}]: news lines are short (at most 140 characters)`);
    });
  }

  // Registry events.
  const cost = (item: string) => economy.costs[item] !== undefined;
  for (const trigger of REQUEST_TRIGGERS) {
    for (const id of bundle.registries.people.requests[trigger].events) {
      const def = bundle.events[id];
      if (!def) {
        if (!partialEvents) err(REGISTRY, `${trigger}: unknown event "${id}"`);
        continue;
      }
      const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
      if (def.retired) e(`answers ${trigger}, but is retired`);
      if (!def.followUpOnly) e(`answers ${trigger}, so it must be followUpOnly`);
      const cast = def.cast ?? {};
      const npc = cast.npc;
      if (!npc) e(`answers ${trigger}, so it casts the person whose life changed as "npc"`);
      else if ((trigger === 'death') !== (npc.deceased === true)) e(trigger === 'death' ? 'a death casts "npc" as a deceased role' : 'only a death casts "npc" as deceased');
      else if (trigger !== 'death' && npc.support !== true) e('"npc" is a support role (the engine passes the person in)');
      for (const role of Object.keys(cast)) {
        if (role !== 'npc' && !(EXTRA_ROLES as readonly string[]).includes(role)) e(`answers ${trigger}, so its cast can only be npc, ${EXTRA_ROLES.join(' or ')} (not "${role}")`);
      }
      if (!rolesIn(def.requires).includes('npc')) e('must require something of "npc" (who they are to you, and their situation)');
      if (cast.partner && !cast.partner.optional) e('"partner" (a partner who lives with you) must be optional');
    }
  }

  // Every event: text about a partner or a job only where it is required; items exist.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const file = fileOf('events', id);
    const required = JSON.stringify(def.requires ?? null);
    for (const t of templatesOf(def)) {
      for (const m of t.text.matchAll(/\{(\w+)\.(partner|job|city|relation)\}/g)) {
        const [, role, field] = m;
        if (role === 'self') {
          err(file, `${id}: ${t.where}: {self.${field}} isn't available (only people you know have a ${field})`);
          continue;
        }
        const choice = t.choice ? def.choices?.find((c) => c.id === t.choice) : undefined;
        const proof = `${required}${JSON.stringify(choice?.visibleIf ?? null)}`;
        const about = new RegExp(`"role":"${role}"`);
        if (field === 'partner' && !(about.test(proof) && /"(partner":\["(dating|engaged|married)|ended":\[)/.test(proof))) {
          err(file, `${id}: ${t.where}: {${role}.partner} needs requires: role ${role} with life: { partner: [dating, engaged, married] } or life: { ended: [...] }`);
        }
        if (field === 'job' && !(about.test(proof) && /"employed":true/.test(proof))) {
          err(file, `${id}: ${t.where}: {${role}.job} needs requires: role ${role} with life: { employed: true }`);
        }
      }
      for (const m of t.text.matchAll(/\{(\w+)\.(\w+)\}/g)) {
        if ((LIFE_FIELDS as readonly string[]).includes(m[2]!) || m[1] !== 'partner' || !def.cast?.partner) continue;
      }
    }
    for (const o of allOutcomes(def)) {
      for (const eff of o.effects as Effect[]) {
        if ((eff.type === 'repay' || (eff.type === 'debt' && eff.item !== undefined)) && !cost(eff.type === 'repay' ? eff.item : eff.item!)) {
          err(file, `${id}: ${eff.type} names the cost item "${eff.type === 'repay' ? eff.item : eff.item}", which is not in balance/economy.yaml costs`);
        }
      }
    }
  }
  return errors;
}
