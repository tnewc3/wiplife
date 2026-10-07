import { useState } from 'react';
import { content } from '../../../content';
import { getPetDetail } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
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
      <Card>
        <h2 className="text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]" data-testid="pet-name">
          {pet.name}
        </h2>
        <p className="mt-1 text-muted" data-testid="pet-line">
          {pet.species} · {PET_PERSONALITY_LABELS[pet.personality]} · {yearsOld(pet.age)}
        </p>
        <p className="mt-1 font-semibold" data-testid="pet-state">
          {petHealthWords(pet.health, pet.ill)} · {bondWords(pet.bond)}
        </p>
        {pet.ill && <p className="mt-1 text-sm">{pet.name} isn’t well, and needs to see a vet.</p>}
      </Card>

      <Button size="lg" block disabled={busy || interactions.length === 0} data-testid="interact-button" onClick={() => openMenu(petId)}>
        Interact
      </Button>
      <Button variant="secondary" block disabled={busy || !pet.canVet} data-testid="pet-vet" onClick={() => setVet(true)}>
        {pet.vetDone ? 'Seen by the vet this year' : `Take to the vet · ${money(pet.vetCost)}`}
      </Button>

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
