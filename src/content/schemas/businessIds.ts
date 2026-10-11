/**
 * W3, businesses: the fixed sets the condition language, the effects, the
 * actions and the business content share (kept apart from the schemas so the
 * event schema and the business schema can both use them).
 */

/** Style tiers, from a budget place to a premium one. */
export const BUSINESS_STYLES = ['budget', 'standard', 'premium'] as const;
export type BusinessStyle = (typeof BUSINESS_STYLES)[number];

/** Food and retail; services and trades. */
export const BUSINESS_KINDS = ['food', 'retail', 'service', 'trade'] as const;
export type BusinessKind = (typeof BUSINESS_KINDS)[number];

/** Where the money to start or buy comes from. */
export const BUSINESS_FUNDING = ['savings', 'loan', 'investors', 'cofounder'] as const;
export type BusinessFunding = (typeof BUSINESS_FUNDING)[number];

/** The yearly decisions, each a small set of levels (the numbers behind them are in balance/business.yaml). */
export const PRICE_LEVELS = ['low', 'fair', 'high'] as const;
export const MARKETING_LEVELS = ['none', 'light', 'heavy'] as const;
export const QUALITY_LEVELS = ['none', 'some', 'lots'] as const;
export const PAY_LEVELS = ['low', 'fair', 'high'] as const;
export const STAFFING_LEVELS = ['lean', 'normal', 'full'] as const;
export const OWNER_ROLES = ['self', 'manager'] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];
export type MarketingLevel = (typeof MARKETING_LEVELS)[number];
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
export type PayLevel = (typeof PAY_LEVELS)[number];
export type StaffingLevel = (typeof STAFFING_LEVELS)[number];
export type OwnerRole = (typeof OWNER_ROLES)[number];

/** The `business` effect's actions. */
export const BUSINESS_ACTIONS = [
  'pay',
  'receive',
  'quality',
  'reputation',
  'morale',
  'buzz',
  'rival',
  'staffQuit',
  'staffFire',
  'staffRaise',
  'staffMorale',
  'hire',
  'theft',
  'buyout',
  'expand',
  'sell',
  'close',
  'audit',
] as const;
export type BusinessAction = (typeof BUSINESS_ACTIONS)[number];

/** What the business step can ask of you as an event (each is a follow-up from registries/business.yaml). */
export const BUSINESS_TRIGGERS = ['opening', 'nearFailure', 'failure', 'investorLoss', 'cofounder', 'expansion', 'manager', 'license'] as const;
export type BusinessTrigger = (typeof BUSINESS_TRIGGERS)[number];

/** The kinds of people a business event can cast from the business itself. */
export const BUSINESS_PEOPLE = ['staff', 'manager', 'investor', 'cofounder', 'licensed'] as const;
export type BusinessPeople = (typeof BUSINESS_PEOPLE)[number];

/** The pseudo-role a business event carries in its cast: the business it is about (never a person). */
export const BUSINESS_ROLE = '@business';
