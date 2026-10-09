/**
 * L1, later life: the fixed sets the condition language, the effects and the
 * later-life content share (kept apart from the schemas so the event schema
 * and the later-life schema can both use them).
 */
import { TRAIT_KEYS } from './common';

/** How late-life care is provided: by family, paid for, or assisted living (housing). */
export const CARE_OPTIONS = ['family', 'paid', 'assisted'] as const;
export type CareOptionId = (typeof CARE_OPTIONS)[number];

/** Where you spend your last months. */
export const HOSPICE_CHOICES = ['hospice', 'home', 'hospital'] as const;
export type HospiceChoiceId = (typeof HOSPICE_CHOICES)[number];

/** The kind of service you ask for. */
export const SERVICE_STYLES = ['traditional', 'simple', 'celebration', 'private'] as const;
export type ServiceStyleId = (typeof SERVICE_STYLES)[number];

/** What came of an amends chance. */
export const AMENDS_RESULTS = ['made', 'declined', 'refused'] as const;
export type AmendsResult = (typeof AMENDS_RESULTS)[number];

/** What mentoring a grandchild can nudge. */
export const TEACH_KEYS = [...TRAIT_KEYS, 'smarts'] as const;
export type TeachKey = (typeof TEACH_KEYS)[number];

/** The `later` effect's actions. */
export const LATER_ACTIONS = ['care', 'hospice', 'amends', 'raise', 'return', 'teach'] as const;
export type LaterAction = (typeof LATER_ACTIONS)[number];
