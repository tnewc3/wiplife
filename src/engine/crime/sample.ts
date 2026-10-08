/**
 * The event sandbox's crime state (E6a): gives a previewed life the crew,
 * rank, standing, heat, investigation, informant and dirty money an event's
 * requirements ask for, and puts the people cast from the crew in it. Not
 * used by the game itself.
 */
import type { Compare, Condition, ContentBundle, CrimeCondition, EventDef } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { joinCrew, leaveCrew, shapePerson } from './crew';
import { openInvestigation } from './money';
import { crewDef } from './query';

/** The crime conditions an event cannot do without (those under `all`, not `any` or `not`), merged. */
function wanted(condition: Condition | undefined): CrimeCondition {
  const out: CrimeCondition = {};
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('crime' in c) Object.assign(out, c.crime);
  };
  walk(condition);
  return out;
}

/** The lowest value a comparison allows (or the highest, with `up` false), if it gives one. */
function bound(c: Compare | undefined, up = true): number | undefined {
  if (!c) return undefined;
  if (c.eq !== undefined) return c.eq;
  if (up) return c.gte ?? (c.gt === undefined ? undefined : c.gt + 1);
  return c.lte ?? (c.lt === undefined ? undefined : c.lt - 1);
}

/** The dirty money an event's requirements ask for (the least that satisfies `finances: { dirty: ... }`), if they do. */
function dirtyWanted(condition: Condition | undefined): number | undefined {
  let out: number | undefined;
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('finances' in c && c.finances.dirty) out = Math.max(out ?? 0, bound(c.finances.dirty) ?? 0);
  };
  walk(condition);
  return out;
}

export function giveSampleCrime(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  const adult = state.character.age >= content.balance.relationships.adultAge;
  const roles = Object.entries(def.cast ?? {}).filter(([, spec]) => spec.crew !== undefined);
  const want = wanted(def.requires);
  const text = JSON.stringify(def);
  const names = text.includes('{crew}') || text.includes('{rank}') || text.includes('{rivalCrew}');
  if (!adult || (roles.length === 0 && Object.keys(want).length === 0 && !names)) return;
  const needsCrew = roles.length > 0 || want.member === true || want.former === true || want.rank !== undefined || want.standing !== undefined || want.leader === true || want.informant === true || want.rival === true || names;
  if (!needsCrew && want.heat === undefined && want.investigated === undefined) return;
  const k = state.crime;
  if (needsCrew && want.member !== false) {
    state.career.job = null;
    joinCrew(state, content);
    const crew = k.crew;
    if (crew) {
      const def2 = crewDef(content, crew.defId);
      const rank = Math.min(content.balance.crime.ranks.length, Math.max(bound(want.rank) ?? 1, want.leader ? content.balance.crime.ranks.length : 1));
      while (k.rank < rank) {
        k.rank += 1;
        k.peak = Math.max(k.peak, k.rank);
      }
      k.standing = bound(want.standing) ?? bound(want.standing, false) ?? k.standing;
      // The people cast from the crew are in it.
      for (const [role, spec] of roles) {
        const id = cast[role];
        if (id === undefined || !def2) continue;
        if (spec.crew === 'rival') {
          if (!crew.rivalMembers.includes(id)) crew.rivalMembers.push(id);
          shapePerson(state.people[id]!, def2, 'crew:rival');
        } else {
          if (!crew.members.includes(id)) crew.members.push(id);
          shapePerson(state.people[id]!, def2, `crew:${def2.id}`);
          state.relationships[id]!.kind = 'friend';
          if (spec.crew === 'boss' && k.rank < content.balance.crime.ranks.length) crew.leader = id;
          if (spec.crew === 'informant') crew.informant = id;
        }
      }
      if (k.rank >= content.balance.crime.ranks.length) delete crew.leader;
      if (want.informant === true && crew.informant === undefined && crew.members[0] !== undefined) crew.informant = crew.members[0];
      if (crew.informant !== undefined) openInvestigation(state, content);
      if (want.rival === true || want.rivalry !== undefined) k.rivalry = bound(want.rivalry) ?? k.rivalry;
      if (want.jobs !== undefined) k.jobs = { year: state.currentYear, count: bound(want.jobs) ?? 1, last: 0 };
      if (want.former === true) {
        leaveCrew(state, 'left', content);
        k.past[k.past.length - 1]!.toYear = state.currentYear - Math.max(1, bound(want.years) ?? 2);
        k.past[k.past.length - 1]!.fromYear = Math.min(k.past[k.past.length - 1]!.fromYear, k.past[k.past.length - 1]!.toYear);
        if (roles.length > 0) for (const [role, spec] of roles) if (spec.crew !== 'rival' && cast[role] !== undefined) state.relationships[cast[role]!]!.kind = 'friend';
      }
    }
  }
  const dirty = dirtyWanted(def.requires);
  if (dirty !== undefined) state.finances.dirty = Math.max(state.finances.dirty, dirty);
  if (want.heat !== undefined) k.heat = bound(want.heat) ?? bound(want.heat, false) ?? k.heat;
  if (want.investigated === true) openInvestigation(state, content);
}
