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
import { InteractSheet } from '../../components/InteractSheet';
import { ACTION_LABELS, actionConfirmation, CUSTODY_LABELS, gradesPhrase, lifeRows, moodPhrase, ORIGIN_LABELS, parentingStyleLine, personLine, timelineAgeLabel, troubleLine } from '../../labels';

/**
 * One person's page: who they are to you, how they feel about you (bars, no
 * numbers), your shared memories, and the actions you can take right now.
 * Actions that can't be undone ask first.
 */
export function PersonScreen({ life, personId }: { life: LifeState; personId: string }) {
  const busy = useAppStore((s) => s.aging);
  const takeAction = useAppStore((s) => s.takeAction);
  const openInteractions = useAppStore((s) => s.openInteractions);
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
        {row.mood && (
          <p className="mt-1 font-semibold" data-testid="person-mood">
            {firstName} is {moodPhrase(row.mood)}.
          </p>
        )}
      </Card>

      {detail.child && (
        <Card role="region" aria-labelledby="child-title">
          <h3 id="child-title" className="text-lg font-bold">
            {detail.child.stepchild ? 'Your stepchild' : 'Your child'}
          </h3>
          <p className="mt-1 text-sm text-muted" data-testid="child-origin">
            {ORIGIN_LABELS[detail.child.origin]}
            {detail.child.stepchild ? '' : ` · ${detail.child.movedOut ? 'Lives on their own' : CUSTODY_LABELS[detail.child.custody]}`}
          </p>
          {row.alive && !detail.child.movedOut && (
            <p className="mt-2" data-testid="parenting-style">
              {parentingStyleLine(detail.child.style)}
            </p>
          )}
          {row.alive && detail.child.gpa !== null && (
            <p className="mt-1" data-testid="child-school">
              {gradesPhrase(detail.child.gpa)}.
            </p>
          )}
        </Card>
      )}

      {detail.life && row.alive && (
        <Card role="region" aria-labelledby="their-life-title" data-testid="their-life">
          <h3 id="their-life-title" className="text-lg font-bold">
            {firstName}'s life
          </h3>
          <dl className="mt-2 flex flex-col divide-y divide-border">
            {lifeRows(detail.life).map((r) => (
              <div key={r.label} className="flex min-w-0 flex-col py-2" data-testid={`life-${r.label.toLowerCase()}`}>
                <dt className="text-sm text-muted">{r.label}</dt>
                <dd className="break-words [overflow-wrap:anywhere]">{r.value}</dd>
              </div>
            ))}
            <div className="flex min-w-0 flex-col py-2" data-testid="life-troubles">
              <dt className="text-sm text-muted">Troubles</dt>
              <dd>
                {detail.life.troubles.length === 0 ? (
                  'None right now'
                ) : (
                  <ul className="flex flex-col gap-1">
                    {detail.life.troubles.map((t, i) => (
                      <li key={i} className="break-words [overflow-wrap:anywhere]">
                        {troubleLine(t)}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <Card>
        <BondBars affection={row.affection} trust={row.trust} label={`How ${row.fullName} feels about you`} />
      </Card>

      {detail.canInteract && (
        <Button size="lg" block disabled={busy} data-testid="interact-button" onClick={() => openInteractions(personId)}>
          Interact
        </Button>
      )}

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

      <InteractSheet life={life} />

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
