/**
 * Fame actions (E6b, the Fame screen): start a career, cross over into a
 * second path, line up a project with its creative choices (kind of work,
 * commercial or artistic, safe or bold, a press run; Batch 4: its genre, the
 * title you type and track titles), set your commitment and your scene, take
 * on or drop an agent, break a contract, retire and come back.
 *
 * Batch 4 adds the grind and bands: play a show, book (or cancel) a tour,
 * practise a skill, take up an instrument, set your main genre; form a band,
 * join one that asked you, leave it or go solo, and, as its leader, rename
 * it, throw a member out or recruit one. Each takes effect at once, between
 * years (the project and a tour go out as the year begins); the common checks
 * (between years, input validation, the input log) live in ./index.ts.
 */
import { FAME_COMMITMENTS, FAME_RISKS, FAME_SCENES, FAME_STYLES, type FameCommitment, type FameRisk, type FameScene, type FameStyle } from '../../content/schemas';
import { commitmentCeiling, commitmentFloor } from '../fame/effects';
import { agentBlock, comeback, crossBlock, crossOver, dropAgent, endContract, enterBlock, enterPath, retire, signAgent } from '../fame/ladder';
import { planBlock } from '../fame/work';
import { formBand, formBlock, joinBand, joinBlock, kickBlock, kickMember, leaveBand, recruitBlock, recruitMember, renameBand, renameBlock } from '../fame/band';
import { bookTour, cancelTour, instrumentBlock, playShow, practiceBlock, practise, setInstrument, showBlock, tourBlock } from '../fame/grind';
import { queueFameEvent } from '../fame/step';
import { genreBlock, parseTitle, parseTracks, setMainGenre, TRACKS_MAX } from '../fame/sound';
import type { FamePlan } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const FAME_ACTION_IDS = [
  'enter_fame',
  'cross_over',
  'plan_project',
  'cancel_project',
  'set_commitment',
  'set_scene',
  'hire_agent',
  'drop_agent',
  'break_contract',
  'retire_fame',
  'return_fame',
  // Batch 4: the grind and bands.
  'play_show',
  'book_tour',
  'cancel_tour',
  'practice',
  'set_instrument',
  'set_genre',
  'form_band',
  'join_band',
  'leave_band',
  'rename_band',
  'kick_member',
  'recruit_member',
] as const;
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

/** The plan the parameters describe (checked by planBlock). */
const planOf = (p: LifeActionParams): FamePlan => ({
  path: p.pathId!,
  kind: p.kindId!,
  style: p.style!,
  risk: p.risk!,
  press: p.press === true,
  ...(p.genreId !== undefined ? { genre: p.genreId } : {}),
  ...(p.title !== undefined ? { title: p.title } : {}),
  ...(p.tracks !== undefined ? { tracks: p.tracks } : {}),
});

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
      const press = field(params, 'press');
      if (!only(params, ['pathId', 'kindId', 'style', 'risk', 'press', 'genreId', 'title', 'tracks'])) return null;
      if (pathId === undefined || kindId === undefined || style === undefined || risk === undefined || typeof press !== 'boolean') return null;
      // Batch 4: the genre, a typed title (tidied: the log keeps the tidy form) and track titles, all optional.
      const genreId = field(params, 'genreId') === undefined ? undefined : id(params, 'genreId');
      const title = field(params, 'title') === undefined ? undefined : parseTitle(field(params, 'title'));
      const tracks = field(params, 'tracks') === undefined ? undefined : parseTracks(field(params, 'tracks'), TRACKS_MAX);
      if ((field(params, 'genreId') !== undefined && genreId === undefined) || title === null || tracks === null) return null;
      return { pathId, kindId, style, risk, press, ...(genreId !== undefined ? { genreId } : {}), ...(title !== undefined ? { title } : {}), ...(tracks !== undefined ? { tracks } : {}) };
    },
    allowed: (state, p, content) => p.pathId !== undefined && p.kindId !== undefined && p.style !== undefined && p.risk !== undefined && planBlock(state, planOf(p), content) === null,
    apply: (state, p) => {
      state.fame.plan = planOf(p);
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
  // Batch 4: the grind.
  play_show: {
    parse: none,
    allowed: (state, _p, content) => showBlock(state, content) === null,
    apply: (state, _p, content) => void playShow(state, content, state.rng),
  },
  book_tour: {
    parse: (params) => {
      const pathId = id(params, 'pathId');
      return only(params, ['pathId']) && pathId !== undefined ? { pathId } : null;
    },
    allowed: (state, p, content) => p.pathId !== undefined && tourBlock(state, p.pathId, content) === null,
    apply: (state, p, content) => void bookTour(state, p.pathId!, content),
  },
  cancel_tour: {
    parse: none,
    allowed: (state) => state.fame.active && state.fame.grind.year === state.currentYear && state.fame.grind.tour !== null,
    apply: (state) => void cancelTour(state),
  },
  practice: {
    parse: (params) => {
      const pathId = id(params, 'pathId');
      const skillId = id(params, 'skillId');
      return only(params, ['pathId', 'skillId']) && pathId !== undefined && skillId !== undefined ? { pathId, skillId } : null;
    },
    allowed: (state, p, content) => p.pathId !== undefined && p.skillId !== undefined && practiceBlock(state, p.pathId, p.skillId, content) === null,
    apply: (state, p, content) => void practise(state, p.pathId!, p.skillId!, content),
  },
  set_instrument: {
    parse: (params) => {
      const instrumentId = id(params, 'instrumentId');
      return only(params, ['instrumentId']) && instrumentId !== undefined ? { instrumentId } : null;
    },
    allowed: (state, p, content) => p.instrumentId !== undefined && instrumentBlock(state, p.instrumentId, content) === null,
    apply: (state, p, content) => setInstrument(state, p.instrumentId!, content),
  },
  set_genre: {
    parse: (params) => {
      const pathId = id(params, 'pathId');
      const genreId = id(params, 'genreId');
      return only(params, ['pathId', 'genreId']) && pathId !== undefined && genreId !== undefined ? { pathId, genreId } : null;
    },
    allowed: (state, p, content) => p.pathId !== undefined && p.genreId !== undefined && genreBlock(state, p.pathId, p.genreId, content) === null,
    apply: (state, p, content) => {
      // A change of sound (not the first choice) is news to your fans: an event as the coming year begins.
      if (setMainGenre(state, p.pathId!, p.genreId!, content)) queueFameEvent(state, 'genreSwitch', content, {}, state.currentYear + 1);
    },
  },
  form_band: {
    parse: (params) => {
      const name = parseTitle(field(params, 'bandName'));
      const part = field(params, 'part') === undefined ? undefined : id(params, 'part');
      if (!only(params, ['bandName', 'part']) || name === null || (field(params, 'part') !== undefined && part === undefined)) return null;
      return { bandName: name, ...(part !== undefined ? { part } : {}) };
    },
    allowed: (state, p, content) => p.bandName !== undefined && formBlock(state, content) === null,
    apply: (state, p, content) => {
      if (formBand(state, p.bandName!, p.part, content, state.rng)) queueFameEvent(state, 'bandFormed', content, {}, state.currentYear + 1);
    },
  },
  join_band: {
    parse: (params) => {
      const offer = field(params, 'offer');
      return only(params, ['offer']) && typeof offer === 'number' && Number.isInteger(offer) && offer >= 0 && offer < 3 ? { offer } : null;
    },
    allowed: (state, p, content) => p.offer !== undefined && joinBlock(state, p.offer, content) === null,
    apply: (state, p, content) => void joinBand(state, p.offer!, content, state.rng),
  },
  leave_band: {
    parse: (params) => {
      const solo = field(params, 'solo');
      return only(params, ['solo']) && typeof solo === 'boolean' ? { solo } : null;
    },
    allowed: (state) => state.fame.active && state.fame.band !== null && state.housing.kind !== 'incarcerated',
    apply: (state, p, content) => void leaveBand(state, p.solo === true, content),
  },
  rename_band: {
    parse: (params) => {
      const name = parseTitle(field(params, 'bandName'));
      return only(params, ['bandName']) && name !== null ? { bandName: name } : null;
    },
    allowed: (state, p) => p.bandName !== undefined && renameBlock(state, p.bandName) === null,
    apply: (state, p, content) => void renameBand(state, p.bandName!, content),
  },
  kick_member: {
    parse: (params) => {
      const personId = id(params, 'personId');
      return only(params, ['personId']) && personId !== undefined ? { personId } : null;
    },
    allowed: (state, p) => p.personId !== undefined && kickBlock(state, p.personId) === null,
    apply: (state, p, content) => void kickMember(state, p.personId!, content),
  },
  recruit_member: {
    parse: (params) => {
      const part = id(params, 'part');
      return only(params, ['part']) && part !== undefined ? { part } : null;
    },
    allowed: (state, p, content) => p.part !== undefined && recruitBlock(state, p.part, content) === null,
    apply: (state, p, content) => void recruitMember(state, p.part!, content, state.rng),
  },
};

export type { LifeActionParams };
