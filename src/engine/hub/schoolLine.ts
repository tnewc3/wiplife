import type { ContentBundle } from '../../content/schemas';
import { getCharacterSummary } from '../selectors';
import type { LifeState } from '../types';

/** The school you are in, as a name and a line ("Junior · Westbrook High"). */
export function schoolLineOf(state: LifeState, content: ContentBundle): { schoolName: string; label: string } {
  const s = getCharacterSummary(state, content).school;
  const e = state.education.current;
  return { schoolName: s?.schoolName ?? '', label: s?.gradeLabel ?? (e ? `Year ${e.year}${s?.studying ? ` · ${s.studying}` : ''}` : '') };
}
