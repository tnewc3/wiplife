import { useState } from 'react';
import { content } from '../../../content';
import { getPetDetail } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { bondWords, money, PET_PERSONALITY_LABELS, petHealthWords, yearsOld } from '../../labels';

/** A pet's page (E5): who it is, how it is, spending time with it (the E1 menu) and a vet visit. */
export function PetScreen({ life, petId }: { life: LifeState; petId: string }) {
  const detail = getPetDetail(life, petId, content);
  const busy = useAppStore((s) => s.aging);
  const sheet = useAppStore((s) => s.interactSheet);
  const openMenu = useAppStore((s) => s.openPetInteractions);
  const close = useAppStore((s) => s.closeInteractions);
  const interact = useAppStore((s) => s.interactPet);
  const act = useAppStore((s) => s.takeLifeAction);
  const [vet, setVet] = useState(false);
  if (!detail) return null;
  const { pet, interactions } = detail;

  return (
    <div className="flex flex-col gap-4">
      <HeroCard lead={<Icon id="paw_prints" size={44} />} title={pet.name} status={`${pet.species} · ${PET_PERSONALITY_LABELS[pet.personality]} · ${yearsOld(pet.age)}`} testId="pet-name">
        <StatCell label="Health" value={petHealthWords(pet.health, pet.ill)} testId="pet-state" />
        <StatCell label="Bond" value={bondWords(pet.bond)} />
      </HeroCard>
      <span className="sr-only" data-testid="pet-line">
        {pet.species} · {PET_PERSONALITY_LABELS[pet.personality]} · {yearsOld(pet.age)}
      </span>
      <ActionTileRow>
        <ActionTile label="Interact" icon="red_heart" tone="family" status={interactions.length === 0 ? 'Nothing now' : 'Spend time'} disabled={busy || interactions.length === 0} onClick={() => openMenu(petId)} testId="interact-button" />
        <ActionTile label="Vet" icon="stethoscope" tone="health" status={pet.vetDone ? 'Seen' : pet.ill ? `Needs one · ${money(pet.vetCost)}` : money(pet.vetCost)} disabled={busy || !pet.canVet} onClick={() => setVet(true)} testId="pet-vet" />
      </ActionTileRow>

      <Sheet open={sheet?.personId === petId} title={`Spend time with ${pet.name}`} onClose={close}>
        <ul className="flex flex-col gap-1" aria-label="Things to do" data-testid="interact-sheet">
          {interactions.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                data-testid={`interaction-${i.id}`}
                disabled={busy}
                onClick={() => void interact(i.id, petId)}
                className="flex min-h-11 w-full flex-col rounded-xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 disabled:opacity-50"
              >
                <span className="font-semibold">{i.name}</span>
                <span className="text-sm text-muted">{i.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <ConfirmSheet
        open={vet}
        title={`Take ${pet.name} to the vet?`}
        body={`The visit costs ${money(pet.vetCost)}. You have ${money(life.finances.savings)} saved.`}
        confirmLabel="Go to the vet"
        busy={busy}
        onCancel={() => setVet(false)}
        onConfirm={() => {
          setVet(false);
          void act('vet_visit', { possessionId: petId });
        }}
      />
    </div>
  );
}
