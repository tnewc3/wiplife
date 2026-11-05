import { useState } from 'react';
import { content } from '../../../content';
import { getHealthView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { EffectChip, FactChip } from '../../components/FactChip';
import { OptionCard } from '../../components/OptionPickerSheet';
import { ACTIVITY_TAB_LABELS, DOCTOR_BLOCK_LABELS, money } from '../../labels';

/** Activities → Doctor (A1, rebuilt in U3 as option cards): the visit with its price, and the way to therapy. */
export function DoctorPanel({ life }: { life: LifeState }) {
  const view = getHealthView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openHealth = useAppStore((s) => s.openHealth);
  const closeActivity = useAppStore((s) => s.closeActivity);
  const [confirming, setConfirming] = useState(false);
  const cost = view.doctor.visitCost + view.doctor.treatmentCost;
  return (
    <>
      {view.doctor.block && (
        <p className="px-1" data-testid="doctor-status">
          {DOCTOR_BLOCK_LABELS[view.doctor.block]}
        </p>
      )}
      <OptionCard
        name="See a doctor"
        chips={
          <>
            <EffectChip tone="good">+ Health</EffectChip>
            {view.familyPays && <FactChip>Your family takes you and pays the bill.</FactChip>}
          </>
        }
        price={view.familyPays ? 'Free' : money(view.doctor.visitCost)}
        reason={view.doctor.block ? 'Not now' : busy ? 'Not now' : undefined}
        testId="do-see-doctor"
        onClick={() => setConfirming(true)}
      />
      <OptionCard
        name={ACTIVITY_TAB_LABELS.therapy}
        chips={<EffectChip tone="good">− Stress</EffectChip>}
        testId="doctor-therapy"
        onClick={() => {
          closeActivity();
          openHealth();
        }}
      />
      <ConfirmSheet
        open={confirming}
        title="See a doctor"
        body={view.familyPays ? 'Your family will take you to the doctor.' : `This will cost up to ${money(cost)}. What your savings can’t cover becomes medical debt.`}
        confirmLabel="Go"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          closeActivity();
          void act('see_doctor');
        }}
      />
    </>
  );
}
