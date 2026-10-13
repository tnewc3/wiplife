import type { HousingState } from '../types';
import type { TRIP_BUDGETS, STAY_TYPES } from '../../content/schemas';
export type TripBudget = (typeof TRIP_BUDGETS)[number];
export type StayType = (typeof STAY_TYPES)[number];
/** Temporary permission only. W6 can extend this without a second residence model. */
export interface Residence {
  country: string;
  destinationId: string;
  type: StayType;
  startYear: number;
  endYear: number;
  homeCityId: string;
  homeHousing: HousingState;
  route: 'vacation' | 'semester' | 'year' | 'working_holiday' | 'transfer';
}
export interface TravelContext {
  kind: 'trip' | 'study' | 'work';
  destinationId: string;
  companions: string[];
  encounterId: string | null;
  romanceId: string | null;
}
export interface TravelState {
  residence: Residence | null;
  active: TravelContext | null;
  tripYear: number | null;
  totals: {
    trips: number; spent: number; encounters: number; romances: number;
    study: number; work: number; returns: number; immersion: number; distanceLost: number;
    happiness: number; stress: number;
    destinations: Record<string, number>;
  };
}
export const emptyTravel = (): TravelState => ({ residence: null, active: null, tripYear: null, totals: { trips: 0, spent: 0, encounters: 0, romances: 0, study: 0, work: 0, returns: 0, immersion: 0, distanceLost: 0, happiness: 0, stress: 0, destinations: {} } });
