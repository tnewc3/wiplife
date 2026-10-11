/**
 * Belonging actions (W2, More → Groups): join a group (as casual or committed),
 * leave it, and change how committed you are. Each takes effect at once,
 * between years; the checks live with the rules (../belonging), so an event's
 * choice and the screen agree. The common checks (between years, input
 * validation, the input log) live in ./index.ts.
 */
import { COMMITMENTS, type Commitment } from '../../content/schemas';
import { joinBlock, joinGroup, leaveBlock, leaveGroup, setCommitment } from '../belonging/groups';
import { membershipOf } from '../belonging/query';
import type { LifeActionParams, LifeActionRule } from './life';

export const BELONGING_ACTION_IDS = ['join_group', 'leave_group', 'set_group_commitment'] as const;
export type BelongingActionId = (typeof BELONGING_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const groupId = (params: unknown): string | undefined => {
  const v = field(params, 'groupId');
  return typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : undefined;
};
const level = (params: unknown): Commitment | undefined => {
  const v = field(params, 'level');
  return (COMMITMENTS as readonly unknown[]).includes(v) ? (v as Commitment) : undefined;
};

export const BELONGING_ACTIONS: Record<BelongingActionId, LifeActionRule> = {
  join_group: {
    parse: (params): LifeActionParams | null => {
      const id = groupId(params);
      const lv = level(params);
      return only(params, ['groupId', 'level']) && id !== undefined && lv !== undefined ? { groupId: id, level: lv } : null;
    },
    allowed: (state, p, content) => p.groupId !== undefined && p.level !== undefined && joinBlock(state, p.groupId, p.level, content) === null,
    apply: (state, p, content) => void joinGroup(state, p.groupId!, p.level!, content),
  },
  leave_group: {
    parse: (params): LifeActionParams | null => {
      const id = groupId(params);
      return only(params, ['groupId']) && id !== undefined ? { groupId: id } : null;
    },
    allowed: (state, p) => p.groupId !== undefined && leaveBlock(state, p.groupId) === null,
    apply: (state, p, content) => void leaveGroup(state, p.groupId!, 'left', content),
  },
  set_group_commitment: {
    parse: (params): LifeActionParams | null => {
      const id = groupId(params);
      const lv = level(params);
      return only(params, ['groupId', 'level']) && id !== undefined && lv !== undefined ? { groupId: id, level: lv } : null;
    },
    allowed: (state, p) => {
      const m = membershipOf(state, p.groupId);
      return m !== undefined && p.level !== undefined && m.commitment !== p.level && (p.level === 'casual' || state.character.age >= 16);
    },
    apply: (state, p) => void setCommitment(state, p.groupId!, p.level!),
  },
};
