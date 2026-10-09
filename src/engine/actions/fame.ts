/**
 * Fame actions (E6b, the Fame screen): start a career, cross over into a
 * second path, line up a project with its creative choices (kind of work,
 * commercial or artistic, safe or bold, and whether to tour or do press),
 * set your commitment and your scene, take on or drop an agent, break a
 * contract, retire and come back. Each takes effect at once, between years
 * (the project comes out as the year begins); the common checks (between
 * years, input validation, the input log) live in ./index.ts.
 */
import { FAME_COMMITMENTS, FAME_RISKS, FAME_SCENES, FAME_STYLES, type FameCommitment, type FameRisk, type FameScene, type FameStyle } from '../../content/schemas';
import { commitmentCeiling, commitmentFloor } from '../fame/effects';
import { agentBlock, comeback, crossBlock, crossOver, dropAgent, endContract, enterBlock, enterPath, retire, signAgent } from '../fame/ladder';
import { planBlock } from '../fame/work';
import type { LifeActionParams, LifeActionRule } from './life';

export const FAME_ACTION_IDS = ['enter_fame', 'cross_over', 'plan_project', 'cancel_project', 'set_commitment', 'set_scene', 'hire_agent', 'drop_agent', 'break_contract', 'retire_fame', 'return_fame'] as const;
export type FameActionId = (typeof FAME_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const id = (params: unknown, key: string): string | undefined => {
  const v = field(params, key);
  return typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined;
};
const oneOf = <T extends string>(params: unknown, key: string, values: readonly T[]): T | undefined => {
  const v = field(params, key);
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : undefined;
};
const none = (params: unknown) => (only(params, []) ? {} : null);
const ORDER = { back: 0, steady: 1, all: 2 } as const;

export const FAME_ACTIONS: Record<FameActionId, LifeActionRule> = {
  enter_fame: {
    parse: (params) => {
      const pathId = id(params, 'pathId');
      const routeId = id(params, 'routeId');
      return only(params, ['pathId', 'routeId']) && pathId !== undefined && routeId !== undefined ? { pathId, routeId } : null;
    },
    allowed: (state, p, content) => p.pathId !== undefined && enterBlock(state, p.pathId, p.routeId, content) === null,
    apply: (state, p, content) => void enterPath(state, p.pathId!, p.routeId, content),
  },
  cross_over: {
    parse: (params) => {
      const pathId = id(params, 'pathId');
      return only(params, ['pathId']) && pathId !== undefined ? { pathId } : null;
    },
    allowed: (state, p, content) => p.pathId !== undefined && crossBlock(state, p.pathId, content) === null,
    apply: (state, p, content) => void crossOver(state, p.pathId!, content),
  },
  plan_project: {
    parse: (params) => {
      const pathId = id(params, 'pathId');
      const kindId = id(params, 'kindId');
      const style = oneOf<FameStyle>(params, 'style', FAME_STYLES);
      const risk = oneOf<FameRisk>(params, 'risk', FAME_RISKS);
      const tour = field(params, 'tour');
      const press = field(params, 'press');
      if (!only(params, ['pathId', 'kindId', 'style', 'risk', 'tour', 'press'])) return null;
      if (pathId === undefined || kindId === undefined || style === undefined || risk === undefined || typeof tour !== 'boolean' || typeof press !== 'boolean') return null;
      return { pathId, kindId, style, risk, tour, press };
    },
    allowed: (state, p, content) =>
      p.pathId !== undefined && p.kindId !== undefined && p.style !== undefined && p.risk !== undefined && planBlock(state, { path: p.pathId, kind: p.kindId, style: p.style, risk: p.risk, tour: p.tour === true, press: p.press === true }, content) === null,
    apply: (state, p) => {
      state.fame.plan = { path: p.pathId!, kind: p.kindId!, style: p.style!, risk: p.risk!, tour: p.tour === true, press: p.press === true };
    },
  },
  cancel_project: {
    parse: none,
    allowed: (state) => state.fame.plan !== null,
    apply: (state) => {
      state.fame.plan = null;
    },
  },
  set_commitment: {
    parse: (params) => {
      const commitment = oneOf<FameCommitment>(params, 'commitment', FAME_COMMITMENTS);
      return only(params, ['commitment']) && commitment !== undefined ? { commitment } : null;
    },
    allowed: (state, p, content) =>
      state.fame.active && p.commitment !== undefined && p.commitment !== state.fame.commitment && ORDER[p.commitment] <= ORDER[commitmentCeiling(state, content)] && ORDER[p.commitment] >= ORDER[commitmentFloor(state, content)],
    apply: (state, p) => {
      state.fame.commitment = p.commitment!;
    },
  },
  set_scene: {
    parse: (params) => {
      const scene = oneOf<FameScene>(params, 'scene', FAME_SCENES);
      return only(params, ['scene']) && scene !== undefined ? { scene } : null;
    },
    allowed: (state, p) => state.fame.active && p.scene !== undefined && p.scene !== state.fame.scene,
    apply: (state, p) => {
      state.fame.scene = p.scene!;
    },
  },
  hire_agent: {
    parse: (params) => {
      const agentId = id(params, 'agentId');
      return only(params, ['agentId']) && agentId !== undefined ? { agentId } : null;
    },
    allowed: (state, p, content) => p.agentId !== undefined && agentBlock(state, p.agentId, content) === null,
    apply: (state, p, content) => void signAgent(state, p.agentId!, content),
  },
  drop_agent: {
    parse: none,
    allowed: (state) => state.fame.active && state.fame.agent !== null,
    apply: (state, _p, content) => dropAgent(state, content),
  },
  break_contract: {
    parse: none,
    allowed: (state) => state.fame.active && state.fame.contract !== null,
    apply: (state, _p, content) => endContract(state, 'broken', content),
  },
  retire_fame: {
    parse: none,
    allowed: (state, _p, content) => state.fame.active && content.famePaths[state.fame.main ?? '']?.sport === undefined,
    apply: (state, _p, content) => void retire(state, content),
  },
  return_fame: {
    parse: none,
    allowed: (state, _p, content) => !state.fame.active && state.fame.retired !== undefined && state.housing.kind !== 'incarcerated' && content.famePaths[state.fame.main ?? '']?.sport === undefined,
    apply: (state, _p, content) => void comeback(state, content),
  },
};

export type { LifeActionParams };
