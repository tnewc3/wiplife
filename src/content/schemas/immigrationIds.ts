/**
 * W6, emigration and citizenship: the fixed sets the condition language, the effects and the immigration content
 * share (kept apart from the schemas so the event schema and the immigration schema can both use them).
 */

/** The legal ways in. */
export const ROUTES = ['work_sponsor', 'study_work', 'family', 'investment'] as const;
export type RouteId = (typeof ROUTES)[number];

/** What an application is for: a way in, permanent residence, citizenship, or status for someone without papers. */
export const APPLICATION_KINDS = ['entry', 'permanent', 'naturalization', 'regularization'] as const;
export type ApplicationKind = (typeof APPLICATION_KINDS)[number];

/** Why someone without papers can ask for status. */
export const REGULARIZATION_BASES = ['marriage', 'long_residence', 'rule_change'] as const;
export type RegularizationBasis = (typeof REGULARIZATION_BASES)[number];

export const APPLICATION_STATUSES = ['pending', 'approved', 'denied'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** How much of a year's income goes home. */
export const REMIT_LEVELS = ['none', 'some', 'steady'] as const;
export type RemitLevel = (typeof REMIT_LEVELS)[number];

/** What a person in the permit system is: on a temporary permit, settled for good, without papers, or a citizen. */
export const STATUS_KINDS = ['temporary', 'permanent', 'undocumented', 'citizen'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

/** The `migration` effect's actions. */
export const MIGRATION_ACTIONS = ['remit', 'overstay', 'leave', 'ties', 'prepare', 'withheld', 'risk'] as const;
export type MigrationAction = (typeof MIGRATION_ACTIONS)[number];

/** The ways to enter a country. */
export const BIRTHRIGHTS = ['anyone', 'parent_status'] as const;
export type Birthright = (typeof BIRTHRIGHTS)[number];
