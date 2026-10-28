import { useState } from 'react';
import { content } from '../../../content';
import { getHealthView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ACTIVITY_TAB_LABELS, DOCTOR_BLOCK_LABELS, money } from '../../labels';

/** Activities → Doctor (A1; it was "See a doctor" on the Health screen): the visit, what it costs, and the way to therapy. */
export function DoctorPanel({ life }: { life: LifeState }) {
  const view = getHealthView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openHealth = useAppStore((s) => s.openHealth);
  const closeActivity = useAppStore((s) => s.closeActivity);
  const [confirming, setConfirming] = useState(false);
  const cost = view.doctor.visitCost + view.doctor.treatmentCost;

  return (
    <div className="flex flex-col gap-3">
      <Card role="region" aria-labelledby="doctor-title">
        <h3 id="doctor-title" className="text-lg font-bold">
          See a doctor
        </h3>
        <p className="mt-1 text-muted">
          {view.familyPays
            ? 'Your family takes you and pays the bill.'
            : `A visit costs about ${money(view.doctor.visitCost)}${view.doctor.treatmentCost > 0 ? `, and treatment up to ${money(view.doctor.treatmentCost)} more` : ''}. What your savings can’t cover becomes medical debt. ${view.careBlurb}`}
        </p>
        {view.doctor.block ? (
          <p className="mt-2" data-testid="doctor-status">
            {DOCTOR_BLOCK_LABELS[view.doctor.block]}
          </p>
        ) : (
          <Button block className="mt-3" disabled={busy} data-testid="do-see-doctor" onClick={() => setConfirming(true)}>
            See a doctor
          </Button>
        )}
      </Card>
      <button
        type="button"
        data-testid="doctor-therapy"
        onClick={() => {
          closeActivity();
          openHealth();
        }}
        className="flex min-h-14 w-full flex-col rounded-2xl border border-border bg-surface-2 px-4 py-2 text-left active:bg-surface"
      >
        <span className="font-display text-base font-semibold">{ACTIVITY_TAB_LABELS.therapy}</span>
        <span className="text-sm text-muted">{ACTIVITY_TAB_LABELS.therapyBody}</span>
      </button>

      <ConfirmSheet
        open={confirming}
        title="See a doctor"
        body={
          view.familyPays
            ? 'Your family will take you to the doctor.'
            : `This will cost up to ${money(cost)}. A doctor may be able to treat what ails you, or at least ease it.`
        }
        confirmLabel="Go"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          closeActivity();
          void act('see_doctor');
        }}
      />
    </div>
  );
}
