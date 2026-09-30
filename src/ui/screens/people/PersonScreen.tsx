import { useState } from 'react';
import { content } from '../../../content';
import type { ActionId } from '../../../content/schemas';
import { getPersonDetail } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { BondBars } from '../../components/BondBars';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ACTION_LABELS, actionConfirmation, personLine, timelineAgeLabel } from '../../labels';

/**
 * One person's page: who they are to you, how they feel about you (bars, no
 * numbers), your shared memories, and the actions you can take right now.
 * Actions that can't be undone ask first.
 */
export function PersonScreen({ life, personId }: { life: LifeState; personId: string }) {
  const busy = useAppStore((s) => s.aging);
  const takeAction = useAppStore((s) => s.takeAction);
  const [confirming, setConfirming] = useState<ActionId | null>(null);
  const detail = getPersonDetail(life, personId, content);
  if (!detail) return null;
  const { row } = detail;
  const firstName = life.people[personId]!.name.first;
  const confirmation = confirming ? actionConfirmation(confirming, firstName) : null;

  const act = (id: ActionId, irreversible: boolean) => {
    if (irreversible) setConfirming(id);
    else void takeAction(id, personId);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]" data-testid="person-name">
          {row.fullName}
        </h2>
        <p className="mt-1 text-muted" data-testid="person-line">
          {personLine(row)} · {detail.pronounLabel}
        </p>
      </Card>

      <Card>
        <BondBars affection={row.affection} trust={row.trust} label={`How ${row.fullName} feels about you`} />
      </Card>

      {detail.actions.length > 0 && (
        <div className="flex flex-col gap-2" role="group" aria-label="Actions">
          {detail.actions.map((a) => (
            <Button key={a.id} variant="secondary" block disabled={busy} onClick={() => act(a.id, a.irreversible)}>
              {ACTION_LABELS[a.id]}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <h3 className="mb-2 text-lg font-bold">Memories</h3>
        {detail.memories.length === 0 ? (
          <p className="text-muted">No memories together yet.</p>
        ) : (
          <ol aria-label="Memories" className="flex flex-col divide-y divide-border">
            {detail.memories.map((m, i) => (
              <li key={i} className="flex min-w-0 flex-col py-2">
                <span className="text-sm text-muted">
                  {timelineAgeLabel(m.age)} · {m.year}
                </span>
                <span className="break-words [overflow-wrap:anywhere]">{m.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <ConfirmSheet
        open={confirmation !== null}
        title={confirmation?.title ?? ''}
        body={confirmation?.body ?? ''}
        confirmLabel={confirmation?.confirm ?? ''}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const id = confirming;
          setConfirming(null);
          if (id) void takeAction(id, personId);
        }}
      />
    </div>
  );
}
