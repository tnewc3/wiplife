import { useState } from 'react';
import { content } from '../../../content';
import type { ActionId } from '../../../content/schemas';
import { getPersonDetail, getPortrait } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { BondBars } from '../../components/BondBars';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { InteractSheet } from '../../components/InteractSheet';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { CharacterPortrait } from '../../portraits/CharacterPortrait';
import { GOD_MODE_LABELS, ACTION_LABELS, actionConfirmation, CONNECTIONS_TITLE, connectionLine, CUSTODY_LABELS, HEARD_TITLE, heardLine, gradesPhrase, lifeRows, moodPhrase, ORIGIN_LABELS, parentingStyleLine, personLine, timelineAgeLabel, troubleLine } from '../../labels';

type PersonTab = 'overview' | 'interact' | 'history';

/**
 * One person's page (U2, in-screen tabs: Overview | Interact | History): who they are to you, how they feel about you (bars, no
 * numbers), your shared memories, and the actions you can take right now.
 * Actions that can't be undone ask first.
 */
export function PersonScreen({ life, personId }: { life: LifeState; personId: string }) {
  const busy = useAppStore((s) => s.aging);
  const takeAction = useAppStore((s) => s.takeAction);
  const openInteractions = useAppStore((s) => s.openInteractions);
  const godMode = useAppStore((s) => s.settings.godMode);
  const openEditor = useAppStore((s) => s.openEditor);
  const [confirming, setConfirming] = useState<ActionId | null>(null);
  const detail = getPersonDetail(life, personId, content);
  // Until you pick a tab, the page opens on Interact when there is something to do with this person, and on Overview when not.
  const [picked, setTab] = useState<PersonTab | null>(null);
  const tab: PersonTab = picked ?? (detail && (detail.canInteract || detail.actions.length > 0) ? 'interact' : 'overview');
  if (!detail) return null;
  const { row } = detail;
  const firstName = life.people[personId]!.name.first;
  const confirmation = confirming ? actionConfirmation(confirming, firstName) : null;

  const act = (id: ActionId, irreversible: boolean) => {
    if (irreversible) setConfirming(id);
    else void takeAction(id, personId);
  };

  const memories = (
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
  );

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex items-center gap-3">
          <CharacterPortrait portrait={getPortrait(life, personId, content)} size={64} label={`Portrait of ${row.fullName}`} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="text-xl leading-tight font-bold break-words [overflow-wrap:anywhere]" data-testid="person-name">
              {row.fullName}
            </h2>
            <p className="text-sm text-muted" data-testid="person-line">
              {personLine(row)} · {detail.pronounLabel}
            </p>
            {row.mood && (
              <p className="text-sm font-semibold" data-testid="person-mood">
                {firstName} is {moodPhrase(row.mood)}.
              </p>
            )}
          </div>
        </div>
        <div className="mt-3">
          <BondBars affection={row.affection} trust={row.trust} label={`How ${row.fullName} feels about you`} />
        </div>
      </Card>

      <SegmentedTabs
        label={`About ${firstName}`}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview', testId: 'person-tab-overview' },
          { id: 'interact', label: 'Interact', testId: 'person-tab-interact' },
          { id: 'history', label: 'History', testId: 'person-tab-history' },
        ]}
      />

      {tab === 'overview' && (
        <>
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
                  <div key={r.label} className="flex min-w-0 items-baseline justify-between gap-3 py-1.5" data-testid={`life-${r.label.toLowerCase()}`}>
                    <dt className="shrink-0 text-sm text-muted">{r.label}</dt>
                    <dd className="min-w-0 text-right break-words [overflow-wrap:anywhere]">{r.value}</dd>
                  </div>
                ))}
                <div className="flex min-w-0 flex-col py-1.5" data-testid="life-troubles">
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

          {detail.connections.length > 0 && (
            <Card role="region" aria-labelledby="connections-title" data-testid="connections">
              <h3 id="connections-title" className="text-lg font-bold">
                {CONNECTIONS_TITLE}
              </h3>
              <ul className="mt-2 flex flex-col divide-y divide-border" aria-label={CONNECTIONS_TITLE}>
                {detail.connections.map((c) => {
                  const line = connectionLine(c);
                  return (
                    <li key={c.personId} className="flex min-w-0 flex-col py-1.5" data-testid={`connection-${c.personId}`}>
                      <span className="break-words [overflow-wrap:anywhere]">{line.who}</span>
                      <span className="text-[13px] text-muted">{line.how}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {!detail.child && !(detail.life && row.alive) && detail.connections.length === 0 && <p className="px-1 text-sm text-muted">Nothing more to tell about {firstName} yet.</p>}
        </>
      )}

      {tab === 'interact' && (
        <>
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
          {godMode && life.phase !== 'dead' && (
            <div className="flex flex-col gap-1">
              <Button variant="secondary" block disabled={busy || life.phase !== 'yearStart'} data-testid="god-edit-person" onClick={() => openEditor(personId)}>
                {GOD_MODE_LABELS.editButton}
              </Button>
              {life.phase !== 'yearStart' && <p className="text-sm text-muted">{GOD_MODE_LABELS.editBlocked}</p>}
            </div>
          )}
          {!detail.canInteract && detail.actions.length === 0 && !godMode && <p className="px-1 text-sm text-muted">There is nothing to do with {firstName} right now.</p>}
        </>
      )}

      {tab === 'history' && (
        <>
          {memories}
          {detail.heard.length > 0 && (
            <Card role="region" aria-labelledby="heard-title" data-testid="heard">
              <h3 id="heard-title" className="text-lg font-bold">
                {HEARD_TITLE}
              </h3>
              <ul className="mt-2 flex flex-col divide-y divide-border" aria-label={HEARD_TITLE}>
                {detail.heard.map((h) => {
                  const line = heardLine(firstName, h);
                  return (
                    <li key={h.itemId} className="flex min-w-0 flex-col py-1.5" data-testid={`heard-${h.itemId}`}>
                      <span className="break-words [overflow-wrap:anywhere]">{line.text}</span>
                      <span className="text-[13px] text-muted">{line.note}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

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
