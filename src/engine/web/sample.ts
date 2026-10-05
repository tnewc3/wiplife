/**
 * Stand-in ties and stories for the people cast in an event (the event
 * sandbox, development only, and tests): a tie of the kind and standing the
 * event requires between two cast roles, and something a cast person has
 * heard, so an event can be previewed without playing up to it.
 */
import type { Condition, ContentBundle, EventDef, HeardCondition, TieCondition } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { kindDef } from './knowledge';
import { addTie, inCircle } from './ties';

/** The tie conditions an event's requirements hold, and the heard conditions with the role they are about (top-level `all` only). */
function collect(requires: Condition | undefined): { ties: TieCondition[]; heard: { role: string; q: HeardCondition }[] } {
  const out = { ties: [] as TieCondition[], heard: [] as { role: string; q: HeardCondition }[] };
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('tie' in c) out.ties.push(c.tie);
    else if ('role' in c && c.heard) out.heard.push({ role: c.role, q: c.heard });
  };
  walk(requires);
  return out;
}

/** Gives the cast the tie and the stories the event's requirements ask for. */
export function giveSampleWeb(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  const year = state.currentYear;
  const wanted = collect(def.requires);
  for (const q of wanted.ties) {
    const a = cast[q.a];
    const b = cast[q.b];
    if (a === undefined || b === undefined || !inCircle(state, a) || !inCircle(state, b) || a === b) continue;
    const status = q.status?.[0] ?? 'normal';
    const affection = status === 'close' ? 85 : status === 'strained' ? 30 : status === 'feuding' ? 8 : 55;
    const tie = addTie(state.web, a, b, q.kind?.[0] ?? 'friends', affection, 'context', year - 5);
    if (status === 'feuding') {
      tie.feud = { since: year - Math.max(1, q.feudYears?.gte ?? (q.feudYears?.gt !== undefined ? q.feudYears.gt + 1 : 1)) };
      if (q.sided) tie.feud.side = a;
      if (q.neutral) tie.feud.neutral = true;
    }
  }
  for (const { role, q } of wanted.heard) {
    const holder = cast[role];
    if (holder === undefined || !inCircle(state, holder)) continue;
    const kind = q.kinds?.[0] ?? 'jobLoss';
    const kd = kindDef(content, kind);
    if (!kd) continue;
    const truth = kd.truths[0]!;
    const version =
      q.versions?.[0] ??
      Object.keys(kd.versions).find((v) => (q.distorted === true ? v !== truth : v === truth) && (q.light === true ? kd.versions[v]!.light === true : q.light === false ? kd.versions[v]!.light !== true : true)) ??
      truth;
    const teller = Object.keys(state.people).find((id) => id !== holder && inCircle(state, id));
    state.web.items.push({
      id: `k${state.web.nextItem}`,
      kind,
      subject: 'you',
      year: year - 1,
      truth,
      // An affair or a breakup is about someone else too.
      ...(teller !== undefined ? { other: teller } : {}),
      holders: { [holder]: { version, since: year, from: q.learned?.includes('gossip') && teller !== undefined ? teller : q.learned?.includes('you') ? 'you' : 'saw', reacted: q.fresh !== true } },
    });
    state.web.nextItem += 1;
  }
}
