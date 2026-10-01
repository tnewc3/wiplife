import { getLegalStatus } from '../../engine/selectors';
import type { LifeState } from '../../engine/types';
import { legalBanner } from '../labels';

/** A status banner while you're in prison or on probation (Stage 9). */
export function LegalBanner({ life }: { life: LifeState }) {
  const status = getLegalStatus(life);
  if (!status) return null;
  const { title, body } = legalBanner(status);
  return (
    <div
      role="status"
      data-testid={status.kind === 'prison' ? 'prison-banner' : 'probation-banner'}
      className={`mb-4 rounded-card border p-3 ${status.kind === 'prison' ? 'border-danger bg-surface-2' : 'border-border bg-surface-2'}`}
    >
      <p className="font-bold">{title}</p>
      <p className="text-sm break-words text-muted">{body}</p>
    </div>
  );
}
