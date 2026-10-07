/**
 * The event sandbox (development only) gives its throwaway life what a teen
 * event asks for, so the event can be previewed and played: a school with its
 * crowds, your crowd (and a rival) with the people cast in it, an invitation, a
 * clash, rules at home, a catch, the license, a job, a team or club. Never
 * used by a real life.
 */
import type { Condition, ContentBundle, EventDef } from '../../content/schemas';
import { enrollForAge } from '../education';
import type { Id, LifeState } from '../types';
import { addTie } from '../web/ties';
import { joinClique, runSchool, startClash } from './cliques';
import { hireJob } from './jobs';
import { householdParents, myClique, rivalClique } from './query';
import { refreshHome } from './rules';

function mentions(condition: Condition | undefined, test: (teen: Extract<Condition, { teen: unknown }>['teen']) => boolean): boolean {
  if (!condition) return false;
  if ('all' in condition) return condition.all.some((c) => mentions(c, test));
  if ('any' in condition) return condition.any.some((c) => mentions(c, test));
  return 'teen' in condition && test(condition.teen);
}

export function giveSampleTeen(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): void {
  const age = state.character.age;
  if (age < content.balance.teen.ages.from || age >= content.balance.relationships.adultAge) return;
  const roles = Object.entries(def.cast ?? {}).filter(([, spec]) => spec.crowd !== undefined);
  const req = def.requires;
  const wantsAny = roles.length > 0 || mentions(req, () => true) || JSON.stringify(def).includes('{clique}') || JSON.stringify(def).includes('{school}');
  if (!wantsAny) return;
  if (!state.education.current) enrollForAge(state, content);
  runSchool(state, content);
  const t = state.teen;
  const wantsCrowd = roles.length > 0 || mentions(req, (c) => c.clique === true || c.crowd !== undefined || c.rival === true || c.clash === true);
  if (wantsCrowd && t.cliques.length > 0) {
    const preferred = t.cliques.find((c) => mentions(req, (x) => x.crowd?.includes(c.defId) === true)) ?? t.cliques.find((c) => c.rival !== undefined) ?? t.cliques[0]!;
    joinClique(state, preferred.id, content, false);
    const mine = myClique(state);
    // The people cast from your crowd, or its rival's, become its members.
    for (const [role, spec] of roles) {
      const id = cast[role];
      if (id === undefined) continue;
      const clique = spec.crowd === 'yours' ? mine : rivalClique(state, mine);
      if (clique && !clique.members.includes(id)) {
        clique.members.push(id);
        state.relationships[id]!.kind = 'classmate';
        state.people[id]!.tags.push(`crowd:${clique.id}`);
      }
    }
    if (mentions(req, (c) => c.clash === true) && mine?.rival) startClash(state, mine.rival, content);
    const others = roles.filter(([, s]) => s.crowd === 'yours').map(([r]) => cast[r]).filter((x): x is Id => x !== undefined);
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) addTie(state.web, others[i]!, others[j]!, 'friends', 60, 'context', state.currentYear);
  } else if (mentions(req, (c) => c.invited === true) && t.cliques.length > 0) {
    t.invite = t.cliques[0]!.id;
  }
  if (mentions(req, (c) => c.license !== undefined && c.license.includes('licensed'))) t.license = { stage: 'licensed', since: state.currentYear, lessons: 0, fails: 0 };
  if (mentions(req, (c) => c.license !== undefined && !c.license.includes('licensed') && c.license.includes('permit'))) t.license = { stage: 'permit', since: state.currentYear, lessons: 1, fails: 0 };
  if (mentions(req, (c) => c.job === true || Array.isArray(c.job))) {
    const job = Object.keys(content.teenJobs).sort().find((id) => !content.teenJobs[id]!.needsLicense);
    if (job) hireJob(state, job, content);
  }
  if (mentions(req, (c) => c.activity === true || Array.isArray(c.activity))) {
    const id = Object.keys(content.activities).sort()[0];
    if (id) t.activities.push({ id, since: state.currentYear });
  }
  if (mentions(req, (c) => c.passion !== undefined)) t.passion = 60;
  if (mentions(req, (c) => c.rules !== undefined || c.rule !== undefined || c.caught !== undefined || c.grounded !== undefined)) {
    if (householdParents(state, content).length === 0) state.housing.kind = 'with_parents';
    refreshHome(state, content);
    const rule = t.home?.rules[0];
    if (rule && mentions(req, (c) => c.caught !== undefined)) t.caught = { year: state.currentYear, ruleId: rule.ruleId, by: rule.by };
  }
}
