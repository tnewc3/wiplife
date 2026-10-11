/**
 * W2, belonging: the fixed sets the condition language, the effects and the
 * belonging content share (kept apart from the schemas so the event schema
 * and the belonging schema can both use them).
 */

/** The four kinds of group: clubs and hobbies, faith communities, volunteering and causes, neighborhood and civic groups. */
export const GROUP_TYPES = ['club', 'faith', 'service', 'civic'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/** The small set of values a character holds (0–100), drifting with membership and choices. */
export const VALUE_IDS = ['community', 'compassion', 'tradition', 'independence', 'civic'] as const;
export type ValueId = (typeof VALUE_IDS)[number];

/** How much of yourself you give a group. */
export const COMMITMENTS = ['casual', 'committed'] as const;
export type Commitment = (typeof COMMITMENTS)[number];

/** The `group` effect's actions. */
export const GROUP_ACTIONS = ['join', 'leave', 'commit', 'promote', 'demote', 'standing', 'community', 'news'] as const;
export type GroupAction = (typeof GROUP_ACTIONS)[number];

/** The `faith` effect's actions. */
export const FAITH_ACTIONS = ['strengthen', 'weaken', 'lose', 'convert', 'return', 'fromLatent'] as const;
export type FaithAction = (typeof FAITH_ACTIONS)[number];

/** The kinds of group news that travel by gossip. */
export const GROUP_NEWS_KINDS = ['groupScandal', 'groupHonor'] as const;
export type GroupNewsKind = (typeof GROUP_NEWS_KINDS)[number];

/** What a group's step can ask of you as an event. */
export const BELONGING_TRIGGERS = ['invite', 'rise', 'drifting'] as const;
export type BelongingTrigger = (typeof BELONGING_TRIGGERS)[number];

/** The pseudo-role a group event carries in its cast: the group instance it is about (never a person). */
export const GROUP_ROLE = '@group';
