/**
 * The event sandbox (development only) gives its throwaway life what a
 * belonging event asks for, so the event can be previewed and played: a faith
 * of the strength it needs, the group it is about (a club, a congregation, a
 * cause) with your place in it, the people cast from it, a value at the level
 * it asks. Never used by a real life.
 */
import { GROUP_ROLE, type Condition, type ContentBundle, type EventDef, type GroupCondition } from '../../content/schemas';
import type { GroupInstance, Id, LifeState } from '../types';
import { cityGroups, activeGroupDefs } from './cities';
import { setPersonFaith } from './faith';
import { instanceOf, membershipOf } from './query';

function required(c: Condition | undefined): Condition[] {
  if (!c) return [];
  if ('all' in c) return c.all.flatMap(required);
  return [c];
}

const lowest = (c: { gt?: number | undefined; gte?: number | undefined; eq?: number | undefined } | undefined, fallback: number) => (c === undefined ? fallback : (c.eq ?? c.gte ?? (c.gt !== undefined ? c.gt + 1 : fallback)));

export function giveSampleBelonging(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  const parts = required(def.requires);
  const b = state.belonging;
  // Faith.
  for (const c of parts) {
    if ('faith' in c && !('role' in c)) {
      const q = c.faith;
      const wanted = q.id?.find((x) => x !== 'none') ?? (q.id?.includes('none') ? 'none' : undefined);
      if (wanted === 'none') b.faith = { ...b.faith, id: null, strength: 0 };
      else if (wanted !== undefined || q.strength !== undefined || q.devout || q.wavering || q.congregation !== undefined) {
        const id = wanted ?? (b.faith.id ?? Object.keys(content.registries.belonging.faiths).sort()[0]!);
        const f = content.balance.belonging.faith;
        const strength = q.devout ? f.devout + 5 : q.wavering ? f.wavering - 5 : Math.max(lowest(q.strength, 55), 1);
        b.faith = { ...b.faith, id, strength: Math.min(100, strength) };
      }
      if (q.raised) b.faith.raised = q.raised[0] === 'none' ? null : (q.raised[0] ?? null);
      if (q.changed) b.faith.since = state.currentYear - Math.max(0, q.changed.lte ?? q.changed.gte ?? 1);
      if (q.leaning || q.pull) {
        const pull = q.pull?.[0] ?? 'convert';
        const other = Object.keys(content.registries.belonging.faiths).sort().find((x) => x !== b.faith.id)!;
        if (pull === 'lose') {
          if (b.faith.id === null) b.faith = { ...b.faith, id: Object.keys(content.registries.belonging.faiths).sort()[0]!, strength: 50 };
          state.character.latent.faith = { id: null };
        } else {
          if (pull === 'find') b.faith = { ...b.faith, id: null, strength: 0 };
          else if (b.faith.id === null) b.faith = { ...b.faith, id: Object.keys(content.registries.belonging.faiths).sort()[0]!, strength: 50 };
          state.character.latent.faith = { id: other === b.faith.id ? null : other };
        }
      }
    }
    if ('value' in c) {
      const key = c.value;
      b.values[key] = Math.min(100, Math.max(0, c.gte ?? (c.gt !== undefined ? c.gt + 1 : c.lte !== undefined ? c.lte - 1 : c.lt !== undefined ? c.lt - 1 : c.eq ?? 60)));
    }
    if ('group' in c && c.group.community) b.community = Math.min(100, lowest(c.group.community, 60));
  }
  // The people cast from a group of yours, or with a faith of their own.
  for (const [role, spec] of Object.entries(def.cast ?? {})) {
    const id = cast[role];
    if (id === undefined) continue;
    for (const c of parts) {
      if ('role' in c && c.role === role && c.faith) {
        const q = c.faith;
        const own = b.faith.id;
        const id2 = q.id?.find((x) => x !== 'none') ?? (q.same === true ? own : q.none ? null : Object.keys(content.registries.belonging.faiths).sort().find((x) => x !== own) ?? null);
        setPersonFaith(state.people[id]!, id2 ?? null, id2 === null ? 0 : lowest(q.strength, 60));
      }
    }
    void spec;
  }
  if (!def.bindGroup) return;
  // The group the event is about.
  const g: GroupCondition = Object.assign({}, ...parts.flatMap((c) => ('group' in c ? [c.group] : [])));
  const member = parts.some((c) => 'group' in c && c.group.member === true);
  const types = parts.flatMap((c) => ('group' in c && c.group.type ? [c.group.type] : []));
  const defs = parts.flatMap((c) => ('group' in c && c.group.def ? [c.group.def] : []));
  const religions = parts.flatMap((c) => ('group' in c && c.group.religion ? [c.group.religion] : []));
  const fits = (defId: string) => {
    const d = content.groups[defId];
    return !!d && !d.retired && types.every((t) => t.includes(d.type)) && defs.every((x) => x.includes(d.id)) && religions.every((r) => d.religion !== undefined && r.includes(d.religion));
  };
  const strictMin = lowest(g.strict, 0);
  const welcomeMin = lowest(g.welcome, 0);
  let found: GroupInstance | undefined = cityGroups(state, state.character.cityId, content).find((x) => fits(x.defId) && (!g.strict || x.strict >= strictMin) && (!g.welcome || x.welcome >= welcomeMin));
  if (!found) {
    const d = activeGroupDefs(content).find((x) => fits(x.id));
    if (!d) return;
    found = {
      id: `g_${state.character.cityId}_${d.id}_sample`,
      defId: d.id,
      cityId: state.character.cityId,
      name: d.names[0]!,
      welcome: Math.max(welcomeMin, 60),
      strict: g.strict?.lt !== undefined ? Math.min(30, g.strict.lt - 1) : Math.max(strictMin, 60),
      intense: 50,
      people: [],
    };
  }
  if (g.strict?.lt !== undefined && found.strict >= g.strict.lt) found = { ...found, strict: Math.max(0, g.strict.lt - 5) };
  b.groups[found.id] = found;
  b.cities[state.character.cityId] = [...new Set([...(b.cities[state.character.cityId] ?? []), found.id])];
  cast[GROUP_ROLE] = found.id;
  const yourPeople = Object.entries(def.cast ?? {}).filter(([, s]) => s.group === 'yours').map(([r]) => cast[r]).filter((x): x is Id => x !== undefined);
  for (const pid of yourPeople) {
    if (!found.people.includes(pid)) found.people.push(pid);
    state.people[pid]!.tags.push(`group:${found.id}`);
  }
  if (member && !membershipOf(state, found.id)) {
    const dd = content.groups[found.defId]!;
    const rungWanted = Math.min(dd.ladder.length - 1, Math.max(g.leader === true ? dd.ladder.length - 1 : 0, lowest(g.rung, 0)));
    b.memberships.push({
      groupId: found.id,
      since: state.currentYear - Math.max(lowest(g.years, 0), 0),
      commitment: g.commitment?.[0] ?? 'casual',
      rung: g.leader === false ? Math.min(rungWanted, dd.ladder.length - 2) : rungWanted,
      rungSince: state.currentYear - Math.max(lowest(g.years, 0), 0),
      standing: Math.min(100, lowest(g.standing, 55)),
    });
  }
  void instanceOf;
}
