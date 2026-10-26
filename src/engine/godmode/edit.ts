/**
 * God mode (G1, docs/expansion.md): one validated engine action that edits you or a person. `checkEdit` changes nothing
 * and answers whether the edit would pass the gate, the payload schema and the content rules (what the editor uses for live
 * hints). `performEdit` runs every check, applies the patch to a copy with its knock-ons, runs the full invariants, appends
 * the `edit` input record and returns the new life; on any refusal it throws EditRefusedError and the life is untouched.
 * An edit draws nothing from the life's generator, reads no clock and writes no history line, flag, memory or event.
 */
import { produce } from 'immer';
import type { ContentBundle } from '../../content/schemas';
import { checkInvariants } from '../invariants';
import type { LifeState } from '../types';
import { applyEdit } from './apply';
import { editPayloadSchema, type EditPayload } from './payload';
import { EditRefusedError, refusal, type EditRefusal, type EditResult } from './refusal';
import { editRefusals } from './rules';

interface Evaluation {
  refusals: EditRefusal[];
  payload?: EditPayload;
  /** The life with the edit applied (no input record yet); the very same object when the edit changes nothing. */
  next?: LifeState;
}

/** The gate: only between years, with no outcome card open, for a living character. */
function gate(state: LifeState): EditRefusal[] {
  if (state.phase === 'dead' || state.death !== null) return [refusal('life_over', 'target')];
  if (state.phase !== 'yearStart') return [refusal('not_between_years', 'target')];
  if (state.pendingInteraction !== null) return [refusal('card_open', 'target')];
  return [];
}

function evaluate(state: LifeState, raw: unknown, content: ContentBundle): Evaluation {
  const gated = gate(state);
  if (gated.length > 0) return { refusals: gated };
  if (JSON.stringify(raw)?.length > content.balance.godmode.edit.maxPayloadBytes) return { refusals: [refusal('too_large', 'target', { facts: { max: content.balance.godmode.edit.maxPayloadBytes } })] };
  const parsed = editPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      refusals: parsed.error.issues.map((issue) =>
        refusal('invalid_value', String(issue.path[0] ?? 'target'), { field: issue.path.slice(1).join('.'), facts: { message: issue.message } }),
      ),
    };
  }
  const payload = parsed.data;
  const next = produce(state, (draft) => applyEdit(draft, payload, content));
  const refusals = editRefusals(state, next, payload, content);
  if (refusals.length === 0 && next === state) refusals.push(refusal('nothing_changed', 'target'));
  return { refusals, payload, next };
}

/** Whether an edit would pass the gate, the payload schema and the content rules. Changes nothing. */
export function checkEdit(state: LifeState, raw: unknown, content: ContentBundle): EditResult {
  const { refusals } = evaluate(state, raw, content);
  return refusals.length === 0 ? { ok: true } : { ok: false, refusals };
}

/** The failures `after` has that `before` did not (a failure the life already had is not blamed on the edit). */
function addedFailures(before: LifeState, after: LifeState, content: ContentBundle): string[] {
  const had = new Map<string, number>();
  for (const f of checkInvariants(before, content)) had.set(f, (had.get(f) ?? 0) + 1);
  return checkInvariants(after, content).filter((f) => {
    const n = had.get(f) ?? 0;
    if (n > 0) had.set(f, n - 1);
    return n === 0;
  });
}

/**
 * Edits the life. Throws EditRefusedError, with every reason found, when the edit breaks a rule, the payload schema or an
 * invariant; the life is then untouched. The input record holds the normalized payload, so a replay never re-derives anything.
 */
export function performEdit(state: LifeState, raw: unknown, content: ContentBundle): LifeState {
  const { refusals, payload, next } = evaluate(state, raw, content);
  if (refusals.length > 0 || !payload || !next) throw new EditRefusedError(refusals);
  const edited = produce(next, (draft) => {
    draft.inputLog.push({ year: draft.currentYear, kind: 'edit', payload: payload as unknown as Record<string, unknown> });
  });
  const broken = addedFailures(state, edited, content);
  if (broken.length > 0) throw new EditRefusedError(broken.map((message) => refusal('invariant', 'target', { facts: { message } })));
  return edited;
}
