import { useState } from 'react';
import { content } from '../../../content';
import type { Commitment, GroupType } from '../../../content/schemas';
import { getBelongingView, type GroupView, type MembershipView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CollapsibleGroup } from '../../components/CollapsibleGroup';
import { ListRow, RowList } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { GROUPS_FOCUS_TITLES, GROUPS_TAB_LABELS, GROUP_COMMITMENT_BLURBS, GROUP_COMMITMENT_LABELS, FAITH_STRENGTH_WORDS, GROUPS_TITLES, GROUP_TYPE_LABELS, hoursLine, GROUP_JOIN_BLOCK_LABELS, money, RISE_NEEDS_LABELS, roleLine, VALUE_LABELS } from '../../labels';

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
 * Activities → Groups and Activities → Faith (W2, moved here from People by U2). One page, opened on the part you chose: clubs
 * and hobby groups, volunteering and causes, neighborhood and civic groups, your faith community, or other faiths to explore.
 * Tabs: Yours (the groups of that kind you belong to: your role, your standing, the people there) and Join (the ones of your
 * city you could join). Joining, leaving and how committed you are take effect at once, between years.
 */
export function GroupsScreen({ life }: { life: LifeState }) {
  const view = getBelongingView(life, content);
  const focus = useAppStore((s) => s.groupsFocus);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const openPerson = useAppStore((s) => s.openPerson);
  const setTab = useAppStore((s) => s.setTab);
  const type: GroupType = focus === 'faith' || focus === 'faith_explore' ? 'faith' : focus;
  const faith = type === 'faith';
  const mine = view.memberships.filter((m) => m.group.type === type);
  const available = view.available[type];
  const [section, setSection] = useState<'yours' | 'join'>(focus === 'faith_explore' ? 'join' : focus === 'faith' || mine.length > 0 ? 'yours' : 'join');
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
    void act('join_group', { groupId: picked.id, level }).then(() => {
      setMessage(`You joined ${name}.`);
      setSection('yours');
    });
  };
  return (
    <div className="flex flex-col gap-3" data-testid="groups-screen">
      <SegmentedTabs
        label={GROUPS_FOCUS_TITLES[focus]}
        value={section}
        onChange={setSection}
        tabs={[
          { id: 'yours', label: `${GROUPS_TAB_LABELS.yours} (${mine.length})`, testId: 'groups-tab-yours' },
          { id: 'join', label: faith ? GROUPS_TAB_LABELS.explore : GROUPS_TAB_LABELS.join, testId: 'groups-tab-join' },
        ]}
      />
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      )}

      {section === 'yours' && (
        <>
          {faith && (
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
          )}
          {mine.length === 0 && <p className="px-1 text-muted">{GROUPS_TITLES.none}</p>}
          {mine.map((m) => (
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
          {view.past.length > 0 && !faith && (
            <CollapsibleGroup id="groups.past" title={GROUPS_TITLES.past} count={view.past.length} defaultOpen={false}>
              <ul className="flex flex-col divide-y divide-border">
                {view.past.map((p, i) => (
                  <li key={i} className="py-2 text-sm">
                    {p.name} · {p.fromYear}–{p.toYear}
                  </li>
                ))}
              </ul>
            </CollapsibleGroup>
          )}
        </>
      )}

      {section === 'join' && (
        <section aria-label={`${GROUPS_TITLES.available}: ${view.city}`} data-testid={`groups-${type}`}>
          <SectionHeader>{`${GROUPS_TITLES.available}: ${view.city}`}</SectionHeader>
          {available.length === 0 ? (
            <p className="px-1 text-muted">Nothing of this kind to join in {view.city}.</p>
          ) : (
            <RowList label={GROUP_TYPE_LABELS[type]}>
              {available.map((g) => (
                <ListRow
                  key={g.id}
                  title={g.name}
                  subtitle={`${g.kind}${g.religion ? ` · ${g.religion}${g.tradition ? `, ${g.tradition}` : ''}` : ''}${g.block !== null ? ` · ${GROUP_JOIN_BLOCK_LABELS[g.block]}` : ''}`}
                  ending="dots"
                  moreLabel={`About ${g.name}`}
                  muted={g.block !== null}
                  onClick={() => setPicked(g)}
                  onMore={() => setPicked(g)}
                  testId={`group-${g.id}`}
                />
              ))}
            </RowList>
          )}
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
