import { z } from 'zod';
import { TRIP_BUDGETS } from '../../content/schemas';
import { beginStay, canPlanTrip, planTrip, stayBlock } from '../travel/travel';
import type { LifeActionRule } from './life';
const tripInput = z.strictObject({ destinationId: z.string().min(1), budget: z.enum(TRIP_BUDGETS), companions: z.array(z.string().min(1)) });
const studyInput = z.strictObject({ destinationId: z.string().min(1), route: z.enum(['semester', 'year']) });
const workInput = z.strictObject({ destinationId: z.string().min(1), route: z.enum(['working_holiday', 'transfer']) });
export const TRAVEL_ACTION_IDS = ['plan_trip', 'study_abroad', 'work_abroad'] as const;
export const TRAVEL_ACTIONS: Record<(typeof TRAVEL_ACTION_IDS)[number], LifeActionRule> = {
  plan_trip: {
    parse: (params) => { const r = z.strictObject({ trip: tripInput }).safeParse(params); return r.success ? r.data : null; },
    allowed: (state, p, content) => !!p.trip && canPlanTrip(state, p.trip, content),
    apply: (state, p, content) => planTrip(state, p.trip!, content),
  },
  study_abroad: {
    parse: (params) => { const r = z.strictObject({ stay: studyInput }).safeParse(params); return r.success ? r.data : null; },
    allowed: (state, p, content) => !!p.stay && stayBlock(state, p.stay, content) === null,
    apply: (state, p, content) => beginStay(state, p.stay!, content),
  },
  work_abroad: {
    parse: (params) => { const r = z.strictObject({ stay: workInput }).safeParse(params); return r.success ? r.data : null; },
    allowed: (state, p, content) => !!p.stay && stayBlock(state, p.stay, content) === null,
    apply: (state, p, content) => beginStay(state, p.stay!, content),
  },
};
