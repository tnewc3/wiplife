import { useState } from 'react';
import { content } from '../../../content';
import { GROUP_TYPES, type Commitment } from '../../../content/schemas';
import { getBelongingView, type GroupView, type MembershipView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { GROUP_COMMITMENT_BLURBS, GROUP_COMMITMENT_LABELS, FAITH_STRENGTH_WORDS, GROUPS_TITLES, GROUP_TYPE_LABELS, hoursLine, GROUP_JOIN_BLOCK_LABELS, money, RISE_NEEDS_LABELS, roleLine, VALUE_LABELS } from '../../labels';

/** What a group is like, from its own traits. */
function TraitLine({ group }: { group: GroupView }) {
  return (
    <p className="text-sm text-muted">
      {group.traits.welcome} · {group.traits.strict} · {group.traits.intense}
    </p>
  );
}

function JoinSheet({ group, open, onClose, busy, canAct, onJoin }: { group: GroupView | null; open: boolean; onClose: () => void; busy: boolean; canAct: boolean; onJoin: (level: Commitment) => void }) {
  if (!group) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;
  const levels: Commitment[] = ['casual', 'committed'];
  return (
    <Sheet open={open} title={group.name} onClose={onClose}>
      <div className="flex flex-col gap-3" data-testid="join-sheet">
        <p className="text-sm text-muted">
          {group.kind}
          {group.religion ? ` · ${group.religion}${group.tradition ? `, ${group.tradition}` : ''}` : ''}
        </p>
        <p>{group.blurb}</p>
        <TraitLine group={group} />
        <p className="text-sm">
          <span className="font-semibold">What members do: </span>
          {group.activities.join(', ')}.
        </p>
        <p className="text-sm">
          <span className="font-semibold">Roles: </span>
          {group.ladder.join(' → ')}
        </p>
        {group.block !== null && <p role="status" className="text-sm font-semibold">{GROUP_JOIN_BLOCK_LABELS[group.block]}</p>}
        <div className="flex flex-col gap-2">
          {levels.map((level) => {
            const blocked = group.block !== null || !canAct || (level === 'committed' && !group.canCommit);
            return (
              <Button key={level} variant={level === 'committed' ? 'primary' : 'secondary'} block disabled={busy || blocked} data-testid={`join-${level}`} onClick={() => onJoin(level)}>
                Join · {GROUP_COMMITMENT_LABELS[level]}
                <span className="block text-sm font-normal">
                  {GROUP_COMMITMENT_BLURBS[level]} · {hoursLine(group.hours[level])}
                  {group.cost[level] > 0 ? ` · about ${money(group.cost[level])} a year` : ''}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function MembershipCard({ m, canAct, busy, onCommit, onLeave, onPerson }: { m: MembershipView; canAct: boolean; busy: boolean; onCommit: (level: Commitment) => void; onLeave: () => void; onPerson: (id: string) => void }) {
  const other: Commitment = m.commitment === 'casual' ? 'committed' : 'casual';
  return (
    <Card data-testid={`membership-${m.group.id}`}>
      <h4 className="font-bold break-words [overflow-wrap:anywhere]">{m.group.name}</h4>
      <p className="text-sm text-muted">
        {m.group.kind} · {GROUP_COMMITMENT_LABELS[m.commitment]} · {hoursLine(m.group.hours[m.commitment])}
        {m.cost > 0 ? ` · ${money(m.cost)} a year` : ''}
      </p>
      <p className="mt-1" data-testid="membership-role">
        {roleLine(m.role, m.years)}
        {m.family ? ' · you go with your family' : ''}
      </p>
      <div className="my-2">
        <StatBar label="Standing" value={m.standing} />
      </div>
      {m.next && (
        <p className="text-sm text-muted">
          Next: {m.next.name}
          {m.next.needs ? ` (needs: ${RISE_NEEDS_LABELS[m.next.needs].toLowerCase()})` : ''}
        </p>
      )}
      {m.people.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">People you know here ({m.people.length})</summary>
          <ul className="flex flex-col">
            {m.people.map((p) => (
              <li key={p.id}>
                <button type="button" className="min-h-11 w-full text-left text-sm underline" onClick={() => onPerson(p.id)}>
                  {p.name}, {p.age}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <Button variant="secondary" block disabled={busy || !canAct || (other === 'committed' && !m.canCommit)} data-testid={`commit-${m.group.id}`} onClick={() => onCommit(other)}>
          Change to {GROUP_COMMITMENT_LABELS[other].toLowerCase()}
        </Button>
        <Button variant="ghost" block disabled={busy || !canAct} data-testid={`leave-${m.group.id}`} onClick={onLeave}>
          Leave
        </Button>
      </div>
    </Card>
  );
}

/**
 * More → Groups (W2): the clubs, congregations, causes and civic groups of your
 * city: the ones you belong to (your role, your standing, the people there) and
 * the ones you could join, your faith and what you value. Joining, leaving and
 * how committed you are take effect at once, between years.
 */
export function GroupsScreen({ life }: { life: LifeState }) {
  const view = getBelongingView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openPerson = useAppStore((s) => s.openPerson);
  const setTab = useAppStore((s) => s.setTab);
  const [picked, setPicked] = useState<GroupView | null>(null);
  const [leaving, setLeaving] = useState<MembershipView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const seePerson = (id: string) => {
    setTab('people');
    openPerson(id);
  };
  const join = (level: Commitment) => {
    if (!picked) return;
    const name = picked.name;
    setPicked(null);
    void act('join_group', { groupId: picked.id, level }).then(() => setMessage(`You joined ${name}.`));
  };
  return (
    <div className="flex flex-col gap-4" data-testid="groups-screen">
      <Card data-testid="groups-summary">
        <h3 className="text-lg font-bold">{GROUPS_TITLES.faith}</h3>
        <p data-testid="groups-your-faith">
          {view.faith.name}
          {view.faith.id !== null ? ` · ${FAITH_STRENGTH_WORDS[view.faith.word]}` : ''}
        </p>
        {view.faith.id !== null && <StatBar label="Belief" value={view.faith.strength} />}
        <h3 className="mt-3 text-lg font-bold">{GROUPS_TITLES.values}</h3>
        <div className="mt-1 grid grid-cols-1 gap-2" role="group" aria-label="Values">
          {view.values.map((v) => (
            <StatBar key={v.id} label={VALUE_LABELS[v.id]!.name} value={v.level} kind="plain" />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          {GROUPS_TITLES.week}: {view.hours} · {GROUPS_TITLES.cost.toLowerCase()}: {money(view.cost)}
        </p>
      </Card>
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      )}
      <section aria-labelledby="groups-yours" className="flex flex-col gap-3">
        <h3 id="groups-yours" className="text-lg font-bold">
          {GROUPS_TITLES.yours}
        </h3>
        {view.memberships.length === 0 && <p className="text-muted">{GROUPS_TITLES.none}</p>}
        {view.memberships.map((m) => (
          <MembershipCard
            key={m.group.id}
            m={m}
            canAct={view.canAct}
            busy={busy}
            onPerson={seePerson}
            onCommit={(level) => void act('set_group_commitment', { groupId: m.group.id, level })}
            onLeave={() => setLeaving(m)}
          />
        ))}
      </section>
      <section aria-labelledby="groups-available" className="flex flex-col gap-3">
        <h3 id="groups-available" className="text-lg font-bold">
          {GROUPS_TITLES.available}: {view.city}
        </h3>
        {GROUP_TYPES.map((type) =>
          view.available[type].length === 0 ? null : (
            <div key={type} data-testid={`groups-${type}`}>
              <h4 className="mb-1 font-semibold">{GROUP_TYPE_LABELS[type]}</h4>
              <ul className="flex flex-col gap-2">
                {view.available[type].map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full flex-col rounded-xl border border-border bg-surface px-3 py-2 text-left disabled:opacity-60"
                      data-testid={`group-${g.id}`}
                      onClick={() => setPicked(g)}
                    >
                      <span className="font-semibold break-words [overflow-wrap:anywhere]">{g.name}</span>
                      <span className="text-sm text-muted">
                        {g.kind}
                        {g.religion ? ` · ${g.religion}${g.tradition ? `, ${g.tradition}` : ''}` : ''}
                        {g.block !== null ? ` · ${GROUP_JOIN_BLOCK_LABELS[g.block]}` : ''}
                      </span>
                      <TraitLine group={g} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </section>
      {view.past.length > 0 && (
        <section aria-labelledby="groups-past">
          <h3 id="groups-past" className="mb-1 text-lg font-bold">
            {GROUPS_TITLES.past}
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {view.past.map((p, i) => (
              <li key={i} className="py-2 text-sm">
                {p.name} · {p.fromYear}–{p.toYear}
              </li>
            ))}
          </ul>
        </section>
      )}
      <JoinSheet group={picked} open={picked !== null} onClose={() => setPicked(null)} busy={busy} canAct={view.canAct} onJoin={join} />
      <ConfirmSheet
        open={leaving !== null}
        title={`Leave ${leaving?.group.name ?? ''}?`}
        body="You will lose your role and your standing there. The people you got to know stay in your life, and you can join again later."
        confirmLabel="Leave"
        busy={busy}
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          if (!leaving) return;
          const id = leaving.group.id;
          setLeaving(null);
          void act('leave_group', { groupId: id });
        }}
      />
    </div>
  );
}
