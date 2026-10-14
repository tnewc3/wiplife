import type { Tier } from '../../content/schemas';
import type { ApplicationKind, ApplicationStatus, RegularizationBasis, RemitLevel, RouteId } from '../../content/schemas/immigrationIds';
import type { CountryId } from '../../content/schemas';

/** One application at a time: for a way in, permanent residence, citizenship or status for someone without papers. */
export interface Application {
  kind: ApplicationKind;
  /** Entry only. */
  route?: RouteId;
  /** Regularization only. */
  basis?: RegularizationBasis;
  /** The country it is for. */
  countryId: CountryId;
  /** Entry only: the city you will arrive in. */
  cityId?: string;
  sinceYear: number;
  decisionYear: number;
  status: ApplicationStatus;
  /** The year the decision came. */
  decidedYear?: number;
  /** An approval to move: the last year you can use it. */
  expiresYear?: number;
  /** What was paid, and the odds when it was made. */
  fee: number;
  odds: number;
  /** Work route: the job that sponsors you. Study route: where you will study. */
  jobId?: string;
  majorId?: string;
  tier?: Tier;
  /** Family route: the person who sponsors you. */
  sponsorId?: string;
  /** Investment route: the sum put in. */
  invested?: number;
  /** Naturalization: you prepared for the test. */
  prepared?: boolean;
}

/** Living without papers: how it began and how it has gone. */
export interface Undocumented {
  sinceYear: number;
  origin: 'overstay' | 'irregular';
  closeCalls: number;
}

export interface MigrationState {
  application: Application | null;
  /** The year of the last denial of each kind of application ("kind:route:country"), so the same one is not made again at once. */
  denied: Record<string, number>;
  /** The year you arrived in the country you live in as someone who moved there; null for a life lived where it began. */
  arrivedYear: number | null;
  undocumented: Undocumented | null;
  /** The year each country removed you; it will not take an application for banYears. */
  removed: Record<string, number>;
  /** An open window to ask for status after a change in the rules: last year of it. */
  ruleChangeUntil: number | null;
  remit: { level: RemitLevel; sent: number };
  /** Citizenship tests failed, for the current application. */
  testFails: number;
  /** Attention you drew this year (a complaint, a stop): added to next year's risk of removal, then cleared (0–1). */
  exposure: number;
  /** This year, for the step and the events. */
  year: { year: number; risk: number; closeCall: boolean; policeContact: boolean; stolen: number };
  /** Counters for the simulation and the record (keys such as "applied:work_sponsor:ca"). */
  counts: Record<string, number>;
}

export const emptyMigration = (): MigrationState => ({
  application: null, denied: {}, arrivedYear: null, undocumented: null, removed: {}, ruleChangeUntil: null,
  remit: { level: 'none', sent: 0 }, testFails: 0, exposure: 0, year: { year: -1, risk: 0, closeCall: false, policeContact: false, stolen: 0 }, counts: {},
});

export type { ApplicationKind, ApplicationStatus, RegularizationBasis, RemitLevel, RouteId };
