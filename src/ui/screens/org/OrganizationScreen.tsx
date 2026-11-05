import { useState } from 'react';
import { content } from '../../../content';
import { getCrimeView, getOrgView, type OrgHoodView, type OrgMemberView, type OrgRivalView, type OrgView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet, type SheetAction } from '../../components/ActionSheet';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { FeatureScreen } from '../../components/FeatureScreen';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { CompactList, CompactRow, SectionLabel } from '../../components/SectionLabel';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { CrimeCard } from '../work/CrimeCard';
import { HEAT_WORDS, money, ORG_LABELS, STANDING_WORDS } from '../../labels';

type OrgTab = 'members' | 'territory' | 'rivals';
const TABS = (['members', 'territory', 'rivals'] as OrgTab[]).map((id) => ({ id, label: ORG_LABELS.tabs[id], testId: `org-tab-${id}` }));

const cap = (text: string) => (text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1));

/** Which sheet is open over the screen: a member's actions or job choice, a hood, a rival, the cut, the informant. */
type Panel = { kind: 'pickMember' } | { kind: 'member'; id: string } | { kind: 'jobs'; id: string } | { kind: 'hood'; id: string } | { kind: 'rival'; id: string } | { kind: 'cut' } | { kind: 'informant' } | { kind: 'cutLoose'; id: string } | null;

/**
 * O1: the Organization screen (Career → Crime): Overview, Members, Territory and Rivals. Anyone in an organization can
 * see it; the leader's decisions (jobs, promotions, discipline, cuts, your cut, informants, a supplier, an attack on a
 * neighborhood, a truce or an alliance) are enabled for the one who runs it, between years.
 */
export function OrganizationScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getOrgView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<OrgTab>('members');
  const [panel, setPanel] = useState<Panel>(null);
  const crimeForHero = getCrimeView(life, content);
  if (!view) return null;
  const standing = { standing: STANDING_WORDS[crimeForHero.standingBand]!, heat: HEAT_WORDS[crimeForHero.heatBand]! };
  const between = life.phase === 'yearStart';
  const can = view.canLead && between && !busy;
  const close = () => setPanel(null);
  const member = (id: string): OrgMemberView | undefined => view.members.find((m) => m.id === id);
  const hood = (id: string): OrgHoodView | undefined => view.hoods.find((h) => h.id === id);
  const rival = (id: string): OrgRivalView | undefined => view.rivals.find((r) => r.id === id);

  const memberActions = (m: OrgMemberView): SheetAction[] => [
    { id: 'job', label: ORG_LABELS.actions.job, detail: m.jobName || ORG_LABELS.jobNone, disabled: !can || !m.canAssign, testId: 'org-act-job', onSelect: () => setPanel({ kind: 'jobs', id: m.id }) },
    { id: 'promote', label: ORG_LABELS.actions.promote, disabled: !can || !m.canPromote, testId: 'org-act-promote', onSelect: () => void act('org_promote', { personId: m.id }) },
    { id: 'discipline', label: ORG_LABELS.actions.discipline, disabled: !can || !m.canDiscipline, testId: 'org-act-discipline', onSelect: () => void act('org_discipline', { personId: m.id }) },
    { id: 'cut', label: ORG_LABELS.actions.cut, detail: ORG_LABELS.actions.cutDetail, danger: true, disabled: !can || !m.canCut, testId: 'org-act-cut', onSelect: () => setPanel({ kind: 'cutLoose', id: m.id }) },
  ];
  const rivalActions = (r: OrgRivalView): SheetAction[] => [
    ...(r.status === 'war' ? [{ id: 'truce', label: ORG_LABELS.moves.truce, detail: ORG_LABELS.odds[r.odds], disabled: !can || !r.canTruce, testId: 'org-act-truce', onSelect: () => void act('org_move', { orgId: r.id, move: 'truce' as const }) }] : [{ id: 'alliance', label: ORG_LABELS.moves.alliance, detail: ORG_LABELS.odds[r.odds], disabled: !can || !r.canAlly, testId: 'org-act-alliance', onSelect: () => void act('org_move', { orgId: r.id, move: 'alliance' as const }) }]),
    ...(r.supplies && view.buys ? [{ id: 'supplier', label: r.isSupplier ? ORG_LABELS.moves.noSupplier : ORG_LABELS.moves.supplier, disabled: !can || (!r.isSupplier && !r.canSupply), testId: 'org-act-supplier', onSelect: () => void act('org_set_supplier', { orgId: r.isSupplier ? null : r.id }) }] : []),
  ];
  const hoodActions = (h: OrgHoodView): SheetAction[] => [{ id: 'take', label: ORG_LABELS.hoodActions.take, detail: ORG_LABELS.hoodActions.takeDetail(money(view.expandCost)), disabled: !can || !h.canExpand, testId: 'org-act-take', onSelect: () => void act('org_expand', { hoodId: h.id }) }];
  const cutActions: SheetAction[] = (['low', 'fair', 'high'] as const).map((level) => ({ id: level, label: ORG_LABELS.cut[level], detail: ORG_LABELS.cutDetail[level], disabled: !can, testId: `org-cut-${level}`, onSelect: () => void act('org_set_cut', { cutLevel: level }) }));
  const informantActions: SheetAction[] = [
    { id: 'confront', label: ORG_LABELS.actions.confront, disabled: !can || !view.canConfront, testId: 'org-informant-confront', onSelect: () => void act('org_informant', { way: 'confront' }) },
    { id: 'pay', label: ORG_LABELS.actions.pay, disabled: !can || !view.canPay, testId: 'org-informant-pay', onSelect: () => void act('org_informant', { way: 'pay' }) },
  ];

  return (
    <>
      <FeatureScreen
        open={open}
        title={cap(view.name)}
        onBack={onClose}
        testId="org-screen"
        info={
          <>
            <p>{ORG_LABELS.waits}</p>
            {between && view.block === 'age' && <p>{ORG_LABELS.blocks.age}</p>}
            {!view.leader && <p>{ORG_LABELS.notLeader}</p>}
            <p>{ORG_LABELS.rows.codes}:</p>
            <ul className="list-disc pl-5">
              {view.codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        }
      >
        <HeroCard lead={<Icon id="busts_in_silhouette" size={44} />} title={cap(view.name)} status={`${view.kindName} · ${view.city}`} testId="org-row-name">
          <StatCell label={ORG_LABELS.rows.rank} value={cap(view.rankTitle)} sub={`${view.rank} of ${view.ranks}`} testId="org-row-rank" />
          <StatCell label="Respect" value={standing.standing} testId="org-row-standing" />
          <StatCell label="Heat" value={standing.heat} testId="org-row-heat" />
        </HeroCard>
        {view.leader && (
          <ActionTileRow>
            <ActionTile label={ORG_LABELS.actions.job} icon="briefcase" tone="crime" status={`${view.members.length} members`} disabled={!can || view.members.length === 0} onClick={() => setPanel({ kind: 'pickMember' })} testId="org-jobs-open" />
            <ActionTile label={ORG_LABELS.rows.cut} icon="money_bag" tone="money" status={ORG_LABELS.cut[view.cut]} disabled={!can} onClick={() => setPanel({ kind: 'cut' })} testId="org-cut-more" />
            {view.informant && <ActionTile label={ORG_LABELS.rows.informant} icon="eyes" tone="crime" status={view.informant.name} disabled={!can} onClick={() => setPanel({ kind: 'informant' })} testId="org-informant-more" />}
          </ActionTileRow>
        )}
        <SegmentedTabs sticky tabs={TABS} value={tab} onChange={setTab} label={ORG_LABELS.title} />
        {tab === 'members' && (
          <RowList label={ORG_LABELS.tabs.members}>
            {view.members.length === 0 && <ListRow title={ORG_LABELS.noMembers} />}
            {view.members.map((m) => (
              <ListRow
                key={m.id}
                title={m.name}
                subtitle={`${cap(m.rankTitle)} · ${m.informant ? ORG_LABELS.outcomes.turned : m.jailed ? ORG_LABELS.jailed : (m.jobName || ORG_LABELS.jobNone)} · ${ORG_LABELS.memberWords[m.skillBand]}`}
                value={<MiniBar label={`${m.name}: loyalty`} value={m.loyalty} />}
                ending="dots"
                onMore={() => setPanel({ kind: 'member', id: m.id })}
                moreLabel={`Actions for ${m.name}`}
                moreTestId={`org-member-more-${m.id}`}
                testId={`org-member-${m.id}`}
              />
            ))}
          </RowList>
        )}
        {tab === 'members' && <Overview life={life} view={view} />}
        {tab === 'territory' && (
          <RowList label={ORG_LABELS.tabs.territory}>
            {view.hoods.map((h) => (
              <ListRow
                key={h.id}
                title={h.name}
                subtitle={`${h.holder === 'you' ? ORG_LABELS.holders.you : h.holder === 'rival' ? `${ORG_LABELS.holders.rival} ${h.holderName}` : ORG_LABELS.holders.none} · ${ORG_LABELS.incomeWords[h.income]} · ${ORG_LABELS.attentionWords[h.attention < 34 ? 0 : h.attention < 67 ? 1 : 2]}`}
                value={<MiniBar label={`${h.name}: police attention`} value={h.attention} kind="bad" />}
                ending={h.holder === 'you' ? 'none' : 'dots'}
                onMore={() => setPanel({ kind: 'hood', id: h.id })}
                moreLabel={`Actions for ${h.name}`}
                moreTestId={`org-hood-more-${h.id}`}
                testId={`org-hood-${h.id}`}
              />
            ))}
          </RowList>
        )}
        {tab === 'rivals' && (
          <RowList label={ORG_LABELS.tabs.rivals}>
            {view.rivals.map((r) => (
              <ListRow
                key={r.id}
                title={r.name}
                subtitle={`${r.kindName} · ${ORG_LABELS.status[r.status]} · ${ORG_LABELS.attitudeWords[r.attitudeBand]}${r.isSupplier ? ' · your supplier' : ''}`}
                value={<MiniBar label={`${r.name}: strength`} value={r.status === 'war' ? Math.max(r.war, 1) : [15, 40, 60, 78, 92][r.strengthBand]!} kind={r.status === 'war' ? 'bad' : 'stat'} />}
                ending="dots"
                onMore={() => setPanel({ kind: 'rival', id: r.id })}
                moreLabel={`Actions for ${r.name}`}
                moreTestId={`org-rival-more-${r.id}`}
                testId={`org-rival-${r.id}`}
              />
            ))}
          </RowList>
        )}
      </FeatureScreen>
      {panel?.kind === 'pickMember' && <ActionSheet open title={ORG_LABELS.actions.job} actions={view.members.map((m) => ({ id: m.id, label: m.name, detail: m.jobName || ORG_LABELS.jobNone, disabled: !can || !m.canAssign, testId: `org-pick-${m.id}`, onSelect: () => setPanel({ kind: 'jobs', id: m.id }) }))} onClose={close} />}
      {panel?.kind === 'member' && member(panel.id) && <ActionSheet open title={member(panel.id)!.name} actions={memberActions(member(panel.id)!)} onClose={close} />}
      {panel?.kind === 'jobs' && member(panel.id) && (
        <ActionSheet
          open
          title={`${ORG_LABELS.actions.job}: ${member(panel.id)!.name}`}
          actions={member(panel.id)!.jobs.map((j) => ({ id: j.id, label: j.name, detail: `${ORG_LABELS.effects[j.effect as keyof typeof ORG_LABELS.effects]} · ${ORG_LABELS.dangers[j.danger as keyof typeof ORG_LABELS.dangers]}`, disabled: !can, testId: `org-job-${j.id}`, onSelect: () => void act('org_assign_job', { personId: panel.id, jobId: j.id }) }))}
          onClose={close}
        />
      )}
      {panel?.kind === 'hood' && hood(panel.id) && <ActionSheet open title={hood(panel.id)!.name} actions={hoodActions(hood(panel.id)!)} onClose={close} />}
      {panel?.kind === 'rival' && rival(panel.id) && <ActionSheet open title={rival(panel.id)!.name} actions={rivalActions(rival(panel.id)!)} onClose={close} />}
      {panel?.kind === 'cut' && <ActionSheet open title={ORG_LABELS.rows.cut} actions={cutActions} onClose={close} />}
      {panel?.kind === 'informant' && <ActionSheet open title={ORG_LABELS.rows.informant} actions={informantActions} onClose={close} />}
      <ConfirmSheet
        open={panel?.kind === 'cutLoose'}
        title={ORG_LABELS.confirmCut(panel?.kind === 'cutLoose' ? (member(panel.id)?.name ?? '') : '')}
        body={ORG_LABELS.confirmCutBody}
        confirmLabel={ORG_LABELS.actions.cut}
        onCancel={close}
        onConfirm={() => {
          if (panel?.kind === 'cutLoose') void act('org_cut_loose', { personId: panel.id });
          close();
        }}
      />
    </>
  );
}

function Overview({ life, view }: { life: LifeState; view: OrgView }) {
  return (
    <div className="flex flex-col gap-3" data-testid="org-overview">
      <SectionLabel>The organization</SectionLabel>
      <CompactList label={ORG_LABELS.rows.org}>
        <CompactRow label={ORG_LABELS.rows.strength} value={ORG_LABELS.strengthWords[view.strengthBand]} testId="org-row-strength" />
        <CompactRow label={ORG_LABELS.rows.territory} value={view.hoodCount === 0 ? ORG_LABELS.holders.none : `${view.hoodCount} · ${ORG_LABELS.perYear(money(view.yearlyIncome))}`} testId="org-row-territory" />
        <CompactRow label={ORG_LABELS.rows.dirty} value={money(view.dirty)} testId="org-row-dirty" />
        {view.leader && <CompactRow label={ORG_LABELS.rows.cut} value={ORG_LABELS.cut[view.cut]} testId="org-row-cut" />}
        {view.buys && <CompactRow label={ORG_LABELS.rows.supplier} value={view.supplier?.name ?? 'None'} testId="org-row-supplier" />}
        {view.supplies && <CompactRow label={ORG_LABELS.rows.supplies} testId="org-row-supplies" />}
        {view.war && <CompactRow label={ORG_LABELS.rows.war} value={view.war.name} testId="org-row-war" />}
        {view.informant && <CompactRow label={ORG_LABELS.rows.informant} value={view.informant.name} testId="org-row-informant" />}
        {!view.initiation.done && <CompactRow label={ORG_LABELS.rows.initiation} value="Ahead" testId="org-row-initiation" />}
      </CompactList>
      <SectionLabel trailing={view.recap ? view.recap.year : undefined}>{ORG_LABELS.rows.recap}</SectionLabel>
      <div data-testid="org-recap">
        {view.recap === null ? (
          <CompactList label={ORG_LABELS.rows.recap}>
            <CompactRow muted label={ORG_LABELS.recap.none} />
          </CompactList>
        ) : (
          <CompactList label={ORG_LABELS.rows.recap}>
            {view.recap.jobs > 0 && <CompactRow label={ORG_LABELS.recap.jobs(money(view.recap.jobs))} />}
            {view.recap.hoodCount > 0 && <CompactRow label={ORG_LABELS.recap.hoods(view.recap.hoodCount, money(view.recap.hoods))} />}
            {view.recap.cleaned > 0 && <CompactRow label={ORG_LABELS.recap.cleaned(money(view.recap.cleaned))} />}
            {view.recap.units > 0 && <CompactRow label={ORG_LABELS.recap.units(view.recap.units)} />}
            {view.recap.results.map((r) => (
              <CompactRow key={`${r.id}-${r.outcome}`} label={`${r.name}: ${ORG_LABELS.outcomes[r.outcome as keyof typeof ORG_LABELS.outcomes]}${r.jobName ? ` (${r.jobName.toLowerCase()})` : ''}`} />
            ))}
            {view.recap.notes.map((n) => (
              <CompactRow key={n} label={n} />
            ))}
          </CompactList>
        )}
      </div>
      <SectionLabel>{ORG_LABELS.rows.record}</SectionLabel>
      <div data-testid="org-crime-record">
        <CrimeCard life={life} />
      </div>
    </div>
  );
}
