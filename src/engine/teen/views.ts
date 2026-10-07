/**
 * What the UI needs about the teen years (T1), read through selectors: the
 * Teen years screen (More): this year's focus, the crowds at your school, the
 * license, a teen job, teams and clubs, and the rules at home. Everything
 * money-related is a quote (what it costs now); every chance is a number from
 * 0 to 1 the UI turns into words; and anything you can't do says why.
 */
import type { ContentBundle, RuleDomainId, TeenFocusId } from '../../content/schemas';
import { FOCUS_IDS } from '../../content/schemas';
import { activityBlock, activityCost, tryoutChance, type ActivityBlock } from './activities';
import { joinBlock, joinChance, leaveBlock, schoolNameOf, type JoinBlock } from './cliques';
import { nextFocus, focusBlock, type FocusBlock } from './focus';
import { expectedJobPay, jobBlock, type JobBlock } from './jobs';
import { lessonBlock, licenseFee, permitBlock, testBlock, testChance, type LicenseBlock } from './license';
import { cliqueDef, inTeenYears, livingMembers, myClique, rivalClique } from './query';
import { negotiateBlock, negotiateChance, ruleApplies, type NegotiateBlock } from './rules';
import type { Id, LifeState, LicenseStage } from '../types';

export interface CrowdView {
  id: Id;
  name: string;
  blurb: string;
  /** How much the crowd counts at school, 0–100. */
  standing: number;
  member: boolean;
  /** It is the crowd your crowd is at odds with (or the one you are in a clash with). */
  rival: boolean;
  invited: boolean;
  /** Their chance of taking you in, 0–1. */
  chance: number;
  block: JoinBlock | null;
  /** Its people you know, by first name. */
  people: string[];
}

export interface JobOptionView {
  id: Id;
  name: string;
  blurb: string;
  hours: number;
  wage: number;
  /** A typical year's pay in your city, with the focus and crowd you have now. */
  pay: number;
  block: JobBlock | null;
}

export interface ActivityOptionView {
  id: Id;
  name: string;
  kind: 'team' | 'club';
  blurb: string;
  /** What a year of it costs you. */
  cost: number;
  /** The chance of making it (1 for a club). */
  chance: number;
  block: ActivityBlock | null;
}

export interface RuleView {
  id: RuleDomainId;
  name: string;
  /** The rule as it reads at its level. */
  text: string;
  level: 0 | 1 | 2;
  /** The first name of the parent who set it. */
  by: string;
  /** It binds you now (some bind only with a license or a job). */
  applies: boolean;
  /** Times you have been caught breaking it. */
  caught: number;
  negotiate: { block: NegotiateBlock | null; chance: number };
  /** You can break it between years (it applies and it isn't relaxed away: any rule can be broken). */
  canBreak: boolean;
}

export interface TeenView {
  /** In the teen years now (13–17): the whole screen. Otherwise only the license, for an adult without one. */
  teen: boolean;
  /** Between years, and not in prison. */
  canAct: boolean;
  age: number;
  school: string | null;
  standing: number;
  passion: number;
  /** The focus chosen for the coming year, and the one that counted this year. */
  focus: { next: TeenFocusId | null; thisYear: TeenFocusId | null; options: TeenFocusId[]; block: FocusBlock | null };
  crowds: CrowdView[];
  mine: { name: string; since: number; rank: number; rival: string | null; clash: string | null; canLeave: boolean } | null;
  license: {
    stage: LicenseStage;
    lessons: number;
    maxLessons: number;
    minToTest: number;
    fails: number;
    permit: { block: LicenseBlock | null; fee: number };
    lesson: { block: LicenseBlock | null; fee: number };
    test: { block: LicenseBlock | null; fee: number; chance: number };
  };
  job: { current: { id: Id; name: string; employer: string; hours: number; pay: number } | null; options: JobOptionView[] };
  activities: { current: { id: Id; name: string; kind: 'team' | 'club'; cost: number }[]; options: ActivityOptionView[]; max: number };
  rules: RuleView[];
  /** Punishments in force, in order: 'grounded' or a lost privilege (the rule's name). */
  penalties: { kind: 'grounded' | 'privilege'; until: number; rule?: string }[];
  /** You were caught recently (the event may still be waiting). */
  caught: boolean;
}

/** The Teen years screen. */
export function getTeenView(state: LifeState, content: ContentBundle): TeenView {
  const t = state.teen;
  const teen = inTeenYears(state, content);
  const canAct = state.phase === 'yearStart' && state.housing.kind !== 'incarcerated';
  const mine = myClique(state);
  const mineDef = mine && cliqueDef(content, mine.defId);
  const clashId = t.clash?.cliqueId;
  const rival = rivalClique(state, mine);
  const focusNext = nextFocus(state) ?? null;
  const thisYear = t.focus !== null && t.focus.year === state.currentYear ? t.focus.id : null;
  const l = content.balance.teen.license;

  const crowds: CrowdView[] = teen
    ? t.cliques.flatMap((c) => {
        const def = cliqueDef(content, c.defId);
        if (!def) return [];
        return [
          {
            id: c.id,
            name: def.name,
            blurb: def.blurb,
            standing: c.standing,
            member: mine?.id === c.id,
            rival: rival?.id === c.id || clashId === c.id,
            invited: t.invite === c.id,
            chance: joinChance(state, c, content),
            block: joinBlock(state, c.id, content),
            people: livingMembers(state, c).map((id) => state.people[id]!.name.first),
          },
        ];
      })
    : [];

  const jobs = Object.keys(content.teenJobs)
    .sort()
    .map((id) => content.teenJobs[id]!)
    .filter((d) => !d.retired);
  const jobDef = t.job && content.teenJobs[t.job.jobId];
  const acts = Object.keys(content.activities)
    .sort()
    .map((id) => content.activities[id]!)
    .filter((d) => !d.retired);

  return {
    teen,
    canAct,
    age: state.character.age,
    school: t.school ? schoolNameOf(state, content) : null,
    standing: t.standing,
    passion: t.passion,
    focus: { next: focusNext, thisYear, options: [...FOCUS_IDS], block: focusBlock(state, content) },
    crowds,
    mine: mine && mineDef && t.member ? { name: mineDef.name, since: t.member.since, rank: t.member.rank, rival: rival ? (cliqueDef(content, rival.defId)?.name ?? null) : null, clash: t.clash ? (cliqueDef(content, state.teen.cliques.find((c) => c.id === t.clash!.cliqueId)?.defId ?? '')?.name ?? null) : null, canLeave: leaveBlock(state) === null } : null,
    license: {
      stage: t.license.stage,
      lessons: t.license.lessons,
      maxLessons: l.lessons.max,
      minToTest: l.lessons.minToTest,
      fails: t.license.fails,
      permit: { block: permitBlock(state, content), fee: licenseFee(state, l.permitFee, content) },
      lesson: { block: lessonBlock(state, content), fee: licenseFee(state, l.lessonFee, content) },
      test: { block: testBlock(state, content), fee: licenseFee(state, l.testFee, content), chance: testChance(state, content) },
    },
    job: {
      current: t.job && jobDef ? { id: t.job.jobId, name: jobDef.name, employer: t.job.employer, hours: jobDef.hours, pay: expectedJobPay(state, jobDef, content) } : null,
      options: teen ? jobs.map((d) => ({ id: d.id, name: d.name, blurb: d.blurb, hours: d.hours, wage: d.wage, pay: expectedJobPay(state, d, content), block: jobBlock(state, d.id, content) })) : [],
    },
    activities: {
      current: t.activities.flatMap((a) => {
        const d = content.activities[a.id];
        return d ? [{ id: a.id, name: d.name, kind: d.kind, cost: activityCost(state, d, content) }] : [];
      }),
      options: teen ? acts.map((d) => ({ id: d.id, name: d.name, kind: d.kind, blurb: d.blurb, cost: activityCost(state, d, content), chance: tryoutChance(state, d), block: activityBlock(state, d.id, content) })) : [],
      max: content.balance.teen.activities.max,
    },
    rules: teen
      ? (t.home?.rules ?? []).flatMap((r) => {
          const def = content.houseRules[r.ruleId];
          if (!def) return [];
          return [
            {
              id: r.ruleId,
              name: def.name,
              text: def.levels[r.level] ?? def.levels[1] ?? '',
              level: r.level,
              by: state.people[r.by]?.name.first ?? 'A parent',
              applies: ruleApplies(state, def),
              caught: r.caught,
              negotiate: { block: negotiateBlock(state, r.ruleId, content), chance: negotiateChance(state, r, content) },
              canBreak: ruleApplies(state, def),
            },
          ];
        })
      : [],
    penalties: t.penalties
      .filter((p) => p.until >= state.currentYear)
      .map((p) => ({ kind: p.kind, until: p.until, ...(p.domain ? { rule: content.houseRules[p.domain]?.name ?? p.domain } : {}) })),
    caught: t.caught !== undefined && t.caught.year >= state.currentYear - 1,
  };
}
