/** Empty school and work records for a new life, an heir and a save upgraded from before Batch 3. */
import type { SchoolLife, WorkYearActions } from '../types';

export const emptySchoolYear = (year = 0): SchoolLife['year'] => ({ year, effort: null, tutor: 0, cheated: 0, skipped: 0, caught: false });

export const emptySchoolLife = (): SchoolLife => ({ key: null, classmates: [], staff: {}, spread: {}, year: emptySchoolYear(), exams: [], choice: null, shift: 0, chosen: false });

export const emptyWorkYear = (year = 0): WorkYearActions => ({ year, effort: null, socialized: 0, party: false, reported: 0 });
