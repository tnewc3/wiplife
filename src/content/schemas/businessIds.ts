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

/** B2: how heavily a line (or supply pool) is stocked against the forecast, how much you train, and the yearly economy. */
export const ORDER_LEVELS = ['lean', 'normal', 'heavy'] as const;
export const TRAINING_LEVELS = ['none', 'some', 'lots'] as const;
export const ECONOMY_PHASES = ['boom', 'steady', 'slowdown', 'recession'] as const;
export type OrderLevel = (typeof ORDER_LEVELS)[number];
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];
export type EconomyPhase = (typeof ECONOMY_PHASES)[number];

/** B2: how a kind's lines are chosen: a fixed menu with extras, a shop that picks, or services with extras. */
export const LINE_MODES = ['menu', 'choose', 'services'] as const;
export type LineMode = (typeof LINE_MODES)[number];

/** B2: what a product line is: goods sold off a shelf, or a service that draws on a supply pool. */
export const PRODUCT_TYPES = ['goods', 'service'] as const;

/** B2: how the stock of a line stands after a year (words in the report). */
export const STOCK_STATES = ['short', 'fine', 'surplus'] as const;
export type StockState = (typeof STOCK_STATES)[number];

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
  // B2: lines, suppliers, stock, crew and franchises.
  'price',
  'order',
  'supplier',
  'shortage',
  'buyAhead',
  'writeOff',
  'brand',
  'franchiseEnd',
  'transfer',
  'appoint',
] as const;
export type BusinessAction = (typeof BUSINESS_ACTIONS)[number];

/** What the business step can ask of you as an event (each is a follow-up from registries/business.yaml). */
export const BUSINESS_TRIGGERS = [
  'opening',
  'nearFailure',
  'failure',
  'investorLoss',
  'cofounder',
  'expansion',
  'manager',
  'license',
  // B2
  'supplierRise',
  'shortage',
  'deal',
  'stockout',
  'waste',
  'economy',
  'staffRequest',
  'franchise',
  'market',
  'places',
  'people',
] as const;
export type BusinessTrigger = (typeof BUSINESS_TRIGGERS)[number];

/** The kinds of people a business event can cast from the business itself. */
export const BUSINESS_PEOPLE = ['staff', 'manager', 'investor', 'cofounder', 'licensed', 'crew', 'franchisee', 'locationManager'] as const;
export type BusinessPeople = (typeof BUSINESS_PEOPLE)[number];

/** The pseudo-role a business event carries in its cast: the business it is about (never a person). */
export const BUSINESS_ROLE = '@business';
