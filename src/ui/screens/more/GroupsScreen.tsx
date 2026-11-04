import { useState } from 'react';
import { content } from '../../../content';
import type { Commitment, GroupType } from '../../../content/schemas';
import { getBelongingView, type GroupView, type MembershipView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Card } from '../../components/Card';
import { CollapsibleGroup } from '../../components/CollapsibleGroup';
import { EmptyState } from '../../components/EmptyState';
import { FactChip } from '../../components/FactChip';
import { FeatureScreen } from '../../components/FeatureScreen';
import { FilterChips } from '../../components/FilterChips';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { JoinCard } from '../../components/JoinCard';
import { ListRow, RowList } from '../../components/ListRow';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
import { SectionLabel } from '../../components/SectionLabel';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { StatBar } from '../../components/StatBar';
import { GROUPS_FOCUS_TITLES, GROUPS_TAB_LABELS, GROUP_COMMITMENT_BLURBS, GROUP_COMMITMENT_LABELS, FAITH_STRENGTH_WORDS, GROUPS_TITLES, GROUP_TYPE_LABELS, hoursLine, GROUP_JOIN_BLOCK_LABELS, money, RISE_NEEDS_LABELS, roleLine, VALUE_LABELS } from '../../labels';

/** How many cards the Join tab shows before "Show N more". */
const LIMIT = 6;

/** The icon of a kind of group (a content icon). */
const GROUP_ICONS: Record<GroupType, string> = { club: 'trophy', service: 'red_heart', civic: 'house_with_garden', faith: 'place_of_worship' };

/** Joining (U3): an option picker. Casual or committed, each with its hours and cost as chips; what the group is like is its blurb. */
function JoinSheet({ group, open, onClose, busy, canAct, onJoin }: { group: GroupView | null; open: boolean; onClose: () => void; busy: boolean; canAct: boolean; onJoin: (level: Commitment) => void }) {
  if (!group) return null;
  const levels: Commitment[] = ['casual', 'committed'];
  return (
    <OptionPickerSheet
      open={open}
      title={group.name}
      icon={GROUP_ICONS[group.type]}
      line={`${group.kind}${group.religion ? ` · ${group.religion}${group.tradition ? `, ${group.tradition}` : ''}` : ''}`}
      footnote={`${group.blurb} ${group.traits.welcome} · ${group.traits.strict} · ${group.traits.intense}.`}
      onClose={onClose}
      testId="join-sheet"
    >
      {group.block !== null && (
        <p role="status" className="px-1 text-sm font-semibold">
          {GROUP_JOIN_BLOCK_LABELS[group.block]}
        </p>
      )}
      {levels.map((level) => (
        <OptionCard
          key={level}
          name={`Join · ${GROUP_COMMITMENT_LABELS[level]}`}
          chips={
            <>
              <FactChip>{hoursLine(group.hours[level])}</FactChip>
              <FactChip>{GROUP_COMMITMENT_BLURBS[level]}</FactChip>
            </>
          }
          price={group.cost[level] > 0 ? `${money(group.cost[level])} a year` : 'Free'}
          reason={busy || !canAct || group.block !== null || (level === 'committed' && !group.canCommit) ? 'Not now' : undefined}
          testId={`join-${level}`}
          onClick={() => onJoin(level)}
        />
      ))}
    </OptionPickerSheet>
  );
}

/** A group you belong to (U3): its own feature screen. A hero with your role, standing and what it costs; what comes next; the people you know there. Changing how committed you are and leaving are in the ⋯ menu. */
function GroupScreen({ m, canAct, busy, onBack, onCommit, onLeave, onPerson }: { m: MembershipView; canAct: boolean; busy: boolean; onBack: () => void; onCommit: (level: Commitment) => void; onLeave: () => void; onPerson: (id: string) => void }) {
  const other: Commitment = m.commitment === 'casual' ? 'committed' : 'casual';
  return (
    <FeatureScreen
      open
      title={m.group.name}
      onBack={onBack}
      testId={`membership-${m.group.id}`}
      info={<p>{m.group.blurb} {m.group.traits.welcome} · {m.group.traits.strict} · {m.group.traits.intense}. Members: {m.group.activities.join(', ')}. Roles: {m.group.ladder.join(' → ')}.</p>}
      actions={[
        { id: 'commit', label: `Change to ${GROUP_COMMITMENT_LABELS[other].toLowerCase()}`, disabled: busy || !canAct || (other === 'committed' && !m.canCommit), testId: `commit-${m.group.id}`, onSelect: () => onCommit(other) },
        { id: 'leave', label: 'Leave', danger: true, disabled: busy || !canAct, testId: `leave-${m.group.id}`, onSelect: onLeave },
      ]}
    >
      <HeroCard lead={<Icon id={GROUP_ICONS[m.group.type]} size={44} />} title={m.group.name} status={`${m.group.kind} · ${GROUP_COMMITMENT_LABELS[m.commitment]}`}>
        <StatCell label="Standing" value={`${Math.round(m.standing)}%`} bar={m.standing} />
        <StatCell label="A week" value={hoursLine(m.group.hours[m.commitment])} />
        {m.cost > 0 && <StatCell label="A year" value={money(m.cost)} />}
      </HeroCard>
      <p className="px-1" data-testid="membership-role">
        {roleLine(m.role, m.years)}
        {m.family ? ' · you go with your family' : ''}
      </p>
      {m.next && (
        <p className="px-1 text-sm text-muted">
          Next: {m.next.name}
          {m.next.needs ? ` (needs: ${RISE_NEEDS_LABELS[m.next.needs].toLowerCase()})` : ''}
        </p>
      )}
      {m.people.length > 0 && (
        <>
          <SectionLabel trailing={m.people.length}>People you know here</SectionLabel>
          <RowList label="People you know here">
            {m.people.map((p) => (
              <ListRow key={p.id} title={p.name} subtitle={`${p.age}`} ending="chevron" onClick={() => onPerson(p.id)} />
            ))}
          </RowList>
        </>
      )}
    </FeatureScreen>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('all');
  const [more, setMore] = useState(false);
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
  const filtered = available.filter((g) => kind === 'all' || g.kind === kind);
  const shownGroups = more ? filtered : filtered.slice(0, LIMIT);
  const kindChips = [{ id: 'all', label: 'All', testId: 'groups-kind-all' }, ...[...new Set(available.map((g) => g.kind))].map((k) => ({ id: k, label: k, testId: `groups-kind-${k}` }))];
  const opened = mine.find((m) => m.group.id === openId);
  return (
    <div className="flex flex-col gap-3" data-testid="groups-screen">
      {opened && (
        <GroupScreen m={opened} canAct={view.canAct} busy={busy} onBack={() => setOpenId(null)} onPerson={seePerson} onCommit={(level) => void act('set_group_commitment', { groupId: opened.group.id, level })} onLeave={() => setLeaving(opened)} />
      )}
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
          {mine.length === 0 && <EmptyState text={GROUPS_TITLES.none} action={faith ? GROUPS_TAB_LABELS.explore : GROUPS_TAB_LABELS.join} onAction={() => setSection('join')} />}
          <ul className="flex flex-col gap-2" aria-label={GROUPS_TAB_LABELS.yours}>
            {mine.map((m) => (
              <JoinCard key={m.group.id} icon={GROUP_ICONS[m.group.type]} name={m.group.name} kind={m.group.kind} role={roleLine(m.role, m.years)} chips={<><FactChip>{hoursLine(m.group.hours[m.commitment])}</FactChip>{m.cost > 0 && <FactChip>{money(m.cost)} a year</FactChip>}<FactChip>{GROUP_COMMITMENT_LABELS[m.commitment]}</FactChip></>} onOpen={() => setOpenId(m.group.id)} testId={`group-yours-${m.group.id}`} />
            ))}
          </ul>
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
        <section aria-label={`${GROUPS_TITLES.available}: ${view.city}`} data-testid={`groups-${type}`} className="flex flex-col gap-2">
          <SectionLabel>{`${GROUPS_TITLES.available}: ${view.city}`}</SectionLabel>
          {kindChips.length > 2 && <FilterChips label="Kind of group" value={kind} onChange={(k) => { setKind(k); setMore(false); }} chips={kindChips} />}
          {available.length === 0 ? (
            <EmptyState text={`Nothing of this kind to join in ${view.city}.`} />
          ) : (
            <ul className="flex flex-col gap-2" aria-label={GROUP_TYPE_LABELS[type]}>
              {shownGroups.map((g) => (
                <JoinCard
                  key={g.id}
                  icon={GROUP_ICONS[g.type]}
                  name={g.name}
                  kind={`${g.kind}${g.religion ? ` · ${g.religion}${g.tradition ? `, ${g.tradition}` : ''}` : ''}`}
                  chips={
                    <>
                      <FactChip>{hoursLine(g.hours.casual)}</FactChip>
                      <FactChip>{g.cost.casual > 0 ? `${money(g.cost.casual)} a year` : 'Free'}</FactChip>
                      {g.activities[0] && <FactChip>{g.activities[0]}</FactChip>}
                      {g.block !== null && <FactChip>{GROUP_JOIN_BLOCK_LABELS[g.block]}</FactChip>}
                    </>
                  }
                  join={() => setPicked(g)}
                  joinDisabled={g.block !== null}
                  testId={`group-${g.id}`}
                  joinTestId={`group-join-${g.id}`}
                />
              ))}
            </ul>
          )}
          {!more && filtered.length > LIMIT && (
            <button type="button" onClick={() => setMore(true)} data-testid="groups-show-more" className="wl-press min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold">
              Show {filtered.length - LIMIT} more
            </button>
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
