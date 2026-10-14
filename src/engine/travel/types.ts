import type { HousingState } from '../types';
import type { TRIP_BUDGETS, STAY_TYPES, STAY_ROUTES } from '../../content/schemas';
export type TripBudget = (typeof TRIP_BUDGETS)[number];
export type StayType = (typeof STAY_TYPES)[number];
export type StayRoute = (typeof STAY_ROUTES)[number];
/**
 * Your standing in a country that is not yours. W5 kept temporary stays that end with a return (`homeHousing` is the
 * home you come back to). W6 extends the same record for people who moved for good (`settled`): the permit can be a
 * work or study permit with an end year, permanent residence (no end) or no permission at all (`undocumented`). For a
 * settled record `homeCityId` is the city you left, kept for visits and for going back.
 */
export interface Residence {
  country: string;
  destinationId: string;
  type: StayType;
  startYear: number;
  /** A permit's last year; for permanent residence and for living without papers it is the start year and means nothing. */
  endYear: number;
  homeCityId: string;
  /** W5 temporary stays only. */
  homeHousing?: HousingState;
  route: StayRoute;
  /** W6: you moved for good. */
  settled?: true;
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
