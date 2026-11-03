/**
 * Organization actions (O1, Career tab → Organization): a leader's decisions between years. Each takes effect at once
 * (an attack on a neighborhood is ordered now and fought in the year that follows); the common checks (between years,
 * input validation, the input log) live in ./index.ts.
 */
import { assignBlock, assignJob, cutBlock, cutMember, dealWithInformant, disciplineBlock, disciplineMember, expandBlock, informantBlock, makeMove, moveBlock, planExpand, promoteBlock, promoteMember, setCut, setSupplier, supplierBlock, leadBlock, type InformantWay, type Move } from '../crime/decisions';
import type { CutLevel } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const ORG_ACTION_IDS = ['org_assign_job', 'org_promote', 'org_discipline', 'org_cut_loose', 'org_set_cut', 'org_informant', 'org_expand', 'org_set_supplier', 'org_move'] as const;
export type OrgActionId = (typeof ORG_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const idOf = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z0-9][a-z0-9_]{0,59}$/.test(v) ? v : undefined);
const CUTS: readonly CutLevel[] = ['low', 'fair', 'high'];

const member = (params: unknown): LifeActionParams | null => {
  const personId = idOf(field(params, 'personId'));
  return only(params, ['personId']) && personId !== undefined ? { personId } : null;
};

export const ORG_ACTIONS: Record<OrgActionId, LifeActionRule> = {
  org_assign_job: {
    parse: (params) => {
      const personId = idOf(field(params, 'personId'));
      const jobId = idOf(field(params, 'jobId'));
      return only(params, ['personId', 'jobId']) && personId !== undefined && jobId !== undefined ? { personId, jobId } : null;
    },
    allowed: (state, p, content) => assignBlock(state, content, p.personId!, p.jobId!) === null,
    apply: (state, p, content) => void assignJob(state, content, p.personId!, p.jobId!),
  },
  org_promote: {
    parse: member,
    allowed: (state, p, content) => promoteBlock(state, content, p.personId!) === null,
    apply: (state, p, content) => void promoteMember(state, content, p.personId!),
  },
  org_discipline: {
    parse: member,
    allowed: (state, p, content) => disciplineBlock(state, content, p.personId!) === null,
    apply: (state, p, content) => void disciplineMember(state, content, p.personId!),
  },
  org_cut_loose: {
    parse: member,
    allowed: (state, p, content) => cutBlock(state, content, p.personId!) === null,
    apply: (state, p, content) => void cutMember(state, content, p.personId!),
  },
  org_set_cut: {
    parse: (params) => {
      const cut = field(params, 'cutLevel');
      return only(params, ['cutLevel']) && (CUTS as readonly unknown[]).includes(cut) ? { cutLevel: cut as CutLevel } : null;
    },
    allowed: (state, _p, content) => leadBlock(state, content) === null,
    apply: (state, p, content) => void setCut(state, content, p.cutLevel!),
  },
  org_informant: {
    parse: (params) => {
      const way = field(params, 'way');
      return only(params, ['way']) && (way === 'confront' || way === 'pay') ? { way } : null;
    },
    allowed: (state, p, content) => informantBlock(state, content, p.way as InformantWay) === null,
    apply: (state, p, content) => void dealWithInformant(state, content, p.way as InformantWay),
  },
  org_expand: {
    parse: (params) => {
      const hoodId = idOf(field(params, 'hoodId'));
      return only(params, ['hoodId']) && hoodId !== undefined ? { hoodId } : null;
    },
    allowed: (state, p, content) => expandBlock(state, content, p.hoodId!) === null,
    apply: (state, p, content) => void planExpand(state, content, p.hoodId!),
  },
  org_set_supplier: {
    parse: (params) => {
      const orgId = field(params, 'orgId');
      if (!only(params, ['orgId'])) return null;
      if (orgId === null) return { orgId: null };
      const id = idOf(orgId);
      return id !== undefined ? { orgId: id } : null;
    },
    allowed: (state, p, content) => supplierBlock(state, content, p.orgId ?? null) === null,
    apply: (state, p, content) => void setSupplier(state, content, p.orgId ?? null),
  },
  org_move: {
    parse: (params) => {
      const orgId = idOf(field(params, 'orgId'));
      const move = field(params, 'move');
      return only(params, ['orgId', 'move']) && orgId !== undefined && (move === 'truce' || move === 'alliance') ? { orgId, move } : null;
    },
    allowed: (state, p, content) => moveBlock(state, content, p.orgId!, p.move as Move) === null,
    apply: (state, p, content) => void makeMove(state, content, p.orgId!, p.move as Move),
  },
};
