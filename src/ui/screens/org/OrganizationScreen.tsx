import { useState } from 'react';
import { content } from '../../../content';
import { getCrimeView, getOrgView, type OrgHoodView, type OrgMemberView, type OrgRivalView, type OrgView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet, type SheetAction } from '../../components/ActionSheet';
import { CollapsibleGroup } from '../../components/CollapsibleGroup';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { CrimeCard } from '../work/CrimeCard';
import { Sheet } from '../../components/Sheet';
import { HEAT_WORDS, money, ORG_LABELS, STANDING_WORDS } from '../../labels';

type OrgTab = 'overview' | 'members' | 'territory' | 'rivals';
const TABS = (Object.keys(ORG_LABELS.tabs) as OrgTab[]).map((id) => ({ id, label: ORG_LABELS.tabs[id], testId: `org-tab-${id}` }));

const cap = (text: string) => (text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1));

/** Which sheet is open over the screen: a member's actions or job choice, a hood, a rival, the cut, the informant. */
type Panel = { kind: 'member'; id: string } | { kind: 'jobs'; id: string } | { kind: 'hood'; id: string } | { kind: 'rival'; id: string } | { kind: 'cut' } | { kind: 'informant' } | { kind: 'cutLoose'; id: string } | null;

/**
 * O1: the Organization screen (Career → Crime): Overview, Members, Territory and Rivals. Anyone in an organization can
 * see it; the leader's decisions (jobs, promotions, discipline, cuts, your cut, informants, a supplier, an attack on a
 * neighborhood, a truce or an alliance) are enabled for the one who runs it, between years.
 */
export function OrganizationScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getOrgView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<OrgTab>('overview');
  const [panel, setPanel] = useState<Panel>(null);
  if (!view) return null;
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
      <Sheet open={open} title={`${ORG_LABELS.title} · ${cap(view.name)}`} onClose={onClose}>
        <div data-testid="org-screen">
          {!between && <p className="mt-1 text-sm text-muted">{ORG_LABELS.waits}</p>}
          {between && view.block === 'age' && <p className="mt-1 text-sm text-muted">{ORG_LABELS.blocks.age}</p>}
          {between && !view.leader && <p className="mt-1 text-sm text-muted">{ORG_LABELS.notLeader}</p>}
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label={ORG_LABELS.title} />
          {tab === 'overview' && <Overview life={life} view={view} setPanel={setPanel} />}
          {tab === 'members' && (
            <RowList label={ORG_LABELS.tabs.members} className="mt-3">
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
          {tab === 'territory' && (
            <RowList label={ORG_LABELS.tabs.territory} className="mt-3">
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
            <RowList label={ORG_LABELS.tabs.rivals} className="mt-3">
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
        </div>
      </Sheet>
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

function Overview({ life, view, setPanel }: { life: LifeState; view: OrgView; setPanel: (p: Panel) => void }) {
  const crime = getCrimeView(life, content);
  const standing = { standing: STANDING_WORDS[crime.standingBand]!, heat: HEAT_WORDS[crime.heatBand]! };
  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="org-overview">
      <RowList label={ORG_LABELS.rows.org}>
        <ListRow icon="busts_in_silhouette" title={cap(view.name)} subtitle={`${view.kindName} · ${view.city}`} testId="org-row-name" />
        <ListRow title={ORG_LABELS.rows.rank} subtitle={`${view.rank} of ${view.ranks}`} value={cap(view.rankTitle)} testId="org-row-rank" />
        <ListRow title={ORG_LABELS.rows.strength} subtitle={ORG_LABELS.strengthWords[view.strengthBand]} value={<MiniBar label={ORG_LABELS.rows.strength} value={Math.min(100, view.strength)} />} testId="org-row-strength" />
        <ListRow title={ORG_LABELS.rows.territory} subtitle={view.hoodCount === 0 ? ORG_LABELS.holders.none : `${ORG_LABELS.perYear(money(view.yearlyIncome))} to you as leader`} value={String(view.hoodCount)} testId="org-row-territory" />
        <ListRow title={ORG_LABELS.rows.dirty} value={money(view.dirty)} testId="org-row-dirty" />
      </RowList>
      <RowList label="Your place">
        <ListRow title={ORG_LABELS.rows.standing} value={standing.standing} testId="org-row-standing" />
        <ListRow title={ORG_LABELS.rows.attention} value={standing.heat} testId="org-row-heat" />
        <ListRow title={ORG_LABELS.rows.initiation} subtitle={view.initiation.blurb} value={view.initiation.done ? 'Passed' : 'Ahead'} testId="org-row-initiation" />
        {view.leader && <ListRow title={ORG_LABELS.rows.cut} subtitle={ORG_LABELS.cutDetail[view.cut]} value={ORG_LABELS.cut[view.cut]} ending="dots" onMore={() => setPanel({ kind: 'cut' })} moreLabel="Change your cut" moreTestId="org-cut-more" testId="org-row-cut" />}
        {view.buys && <ListRow title={ORG_LABELS.rows.supplier} subtitle={view.supplier ? undefined : ORG_LABELS.noSupplier} value={view.supplier?.name ?? 'None'} testId="org-row-supplier" />}
        {view.supplies && <ListRow title={ORG_LABELS.rows.supplies} subtitle="Supply jobs sell to dealers and gangs" testId="org-row-supplies" />}
        {view.war && <ListRow title={ORG_LABELS.rows.war} value={view.war.name} testId="org-row-war" />}
        {view.informant && <ListRow title={ORG_LABELS.rows.informant} subtitle={view.informant.name} ending={view.leader ? 'dots' : 'none'} onMore={() => setPanel({ kind: 'informant' })} moreLabel="Deal with the informant" moreTestId="org-informant-more" testId="org-row-informant" />}
      </RowList>
      <CollapsibleGroup id="org-crime-card" title={ORG_LABELS.rows.record} defaultOpen testId="org-crime-record">
        <CrimeCard life={life} />
      </CollapsibleGroup>
      <CollapsibleGroup id="org-recap" title={ORG_LABELS.rows.recap} count={view.recap ? view.recap.year : 0} testId="org-recap">
        {view.recap === null ? (
          <p className="text-sm text-muted">{ORG_LABELS.recap.none}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm" data-testid="org-recap-list">
            {view.recap.jobs > 0 && <li>{ORG_LABELS.recap.jobs(money(view.recap.jobs))}</li>}
            {view.recap.hoodCount > 0 && <li>{ORG_LABELS.recap.hoods(view.recap.hoodCount, money(view.recap.hoods))}</li>}
            {view.recap.cleaned > 0 && <li>{ORG_LABELS.recap.cleaned(money(view.recap.cleaned))}</li>}
            {view.recap.units > 0 && <li>{ORG_LABELS.recap.units(view.recap.units)}</li>}
            {view.recap.results.map((r) => (
              <li key={`${r.id}-${r.outcome}`}>
                {r.name}: {ORG_LABELS.outcomes[r.outcome as keyof typeof ORG_LABELS.outcomes]}
                {r.jobName ? ` (${r.jobName.toLowerCase()})` : ''}
              </li>
            ))}
            {view.recap.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </CollapsibleGroup>
      <CollapsibleGroup id="org-codes" title={ORG_LABELS.rows.codes} count={view.codes.length} defaultOpen={false} testId="org-codes">
        <ul className="flex flex-col gap-1 text-sm">
          {view.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </CollapsibleGroup>
    </div>
  );
}
