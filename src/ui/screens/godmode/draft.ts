/**
 * The god mode editor's draft (G1): the editor starts from what the target is now (an EditView) and sends the engine only
 * what differs, as an edit payload. Pure functions, no React.
 */
import { TRAIT_KEYS } from '../../../content/schemas';
import type { EditView } from '../../../engine/editView';
import type { EditPayload } from '../../../engine/godmode';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function cloneView(view: EditView): EditView {
  return JSON.parse(JSON.stringify(view)) as EditView;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The payload for the changes from `base` to `draft`, or null when nothing differs. */
export function toPayload(base: EditView, draft: EditView): EditPayload | null {
  const out: Mutable<EditPayload> = { target: base.self ? 'self' : { person: base.personId! } };
  let any = false;
  const set = <K extends keyof EditPayload>(key: K, value: EditPayload[K]) => {
    out[key] = value;
    any = true;
  };

  if (!same(base.name, draft.name)) set('name', { ...draft.name });

  const identity: NonNullable<EditPayload['identity']> = {};
  for (const key of ['genderCategory', 'genderIdentity', 'genderExpression', 'pronouns', 'attractedTo', 'canCarry'] as const) {
    if (!same(base.identity[key], draft.identity[key])) Object.assign(identity, { [key]: draft.identity[key] });
  }
  if (Object.keys(identity).length > 0) set('identity', identity);

  if (base.latent && draft.latent) {
    const latent: NonNullable<EditPayload['latent']> = {};
    if (!same(base.latent.attractedTo, draft.latent.attractedTo)) latent.attractedTo = draft.latent.attractedTo;
    if (!same(base.latent.gender, draft.latent.gender)) latent.gender = draft.latent.gender;
    if (!same(base.latent.expression, draft.latent.expression)) latent.expression = draft.latent.expression;
    if (!same(base.latent.faith, draft.latent.faith)) latent.faith = draft.latent.faith;
    const traits = Object.fromEntries(TRAIT_KEYS.filter((k) => base.latent!.personality[k] !== draft.latent!.personality[k]).map((k) => [k, draft.latent!.personality[k]]));
    if (Object.keys(traits).length > 0) latent.personality = traits;
    if (Object.keys(latent).length > 0) set('latent', latent);
  }

  if (base.looks !== draft.looks) set('looks', draft.looks);
  if (base.self && !same(base.appearance, draft.appearance)) set('appearance', { descriptors: [...draft.appearance] });

  const stats = Object.fromEntries((Object.keys(draft.stats) as (keyof EditView['stats'])[]).filter((k) => base.stats[k] !== draft.stats[k]).map((k) => [k, draft.stats[k]]));
  if (Object.keys(stats).length > 0) set('stats', stats);

  const personality = Object.fromEntries(TRAIT_KEYS.filter((k) => base.personality[k] !== draft.personality[k]).map((k) => [k, draft.personality[k]]));
  if (Object.keys(personality).length > 0) set('personality', personality);

  const values = Object.fromEntries((Object.keys(draft.values) as (keyof EditView['values'])[]).filter((k) => base.values[k] !== draft.values[k]).map((k) => [k, draft.values[k]]));
  if (Object.keys(values).length > 0) set('values', values);

  if (base.self && !same(base.conditions, draft.conditions)) {
    set('conditions', draft.conditions.map((c) => ({ conditionId: c.conditionId, severity: c.severity, treated: c.treated, ...(c.named || base.conditions.find((b) => b.conditionId === c.conditionId)?.named ? { named: c.named } : {}) })));
  }
  if (!base.self && !same(base.troubles, draft.troubles)) set('troubles', draft.troubles.map((t) => ({ ...t })));
  if (!base.self && !same(base.neuro, draft.neuro)) set('neuro', [...draft.neuro]);

  if (base.relationship && draft.relationship) {
    const rel: NonNullable<EditPayload['relationship']> = {};
    if (base.relationship.kind !== draft.relationship.kind) Object.assign(rel, { kind: draft.relationship.kind });
    if (base.relationship.affection !== draft.relationship.affection) rel.affection = draft.relationship.affection;
    if (base.relationship.trust !== draft.relationship.trust) rel.trust = draft.relationship.trust;
    if (base.relationship.status !== draft.relationship.status) rel.status = draft.relationship.status;
    if (Object.keys(rel).length > 0) set('relationship', rel);
  }

  if (!same(base.work, draft.work)) set('work', { jobId: draft.work.jobId, level: draft.work.level });
  if (base.wealth !== draft.wealth) set('wealth', draft.wealth);
  if (base.cityId !== draft.cityId) set('cityId', draft.cityId);
  if (!same(base.faith, draft.faith)) set('faith', { id: draft.faith.id, strength: draft.faith.id === null ? 0 : Math.max(1, draft.faith.strength) });
  if (!same(base.languages, draft.languages)) set('languages', draft.languages.map((l) => ({ ...l })));
  if (!same(base.citizenships, draft.citizenships)) set('citizenships', [...draft.citizenships]);

  if (base.money && draft.money) {
    const money: NonNullable<EditPayload['money']> = {};
    if (base.money.savings !== draft.money.savings) money.savings = draft.money.savings;
    if (!same(base.money.debts, draft.money.debts)) money.debts = draft.money.debts.map((d) => ({ ...(d.id !== '' ? { id: d.id } : {}), kind: d.kind, balance: d.balance }));
    if (Object.keys(money).length > 0) set('money', money);
  }

  if (!base.self && base.birthYear !== draft.birthYear) set('birthYear', draft.birthYear);

  return any ? out : null;
}

/** How many changes the draft holds (the number on the Save button): one per area changed. */
export function changeCount(payload: EditPayload | null): number {
  return payload === null ? 0 : Object.keys(payload).length - 1;
}

/** Whole dollars from what was typed ("12,500" -> 12500); NaN when it isn't a whole number. */
export function parseDollars(text: string): number {
  const cleaned = text.replace(/[,\s$]/g, '');
  return /^-?\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}
