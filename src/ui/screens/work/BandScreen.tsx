import { useState } from 'react';
import { content } from '../../../content';
import { getBandHubView, getFameView } from '../../../engine/selectors';
import { parseTitle } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { TextField } from '../../components/TextField';
import { BAND_HUB_LABELS, BAND_TAB_LABELS, COMMITMENT_LABELS, RECEPTION_LABELS, TITLE_ERROR, skillWord } from '../../labels';
import { BandSection } from './BandSection';
import { GrindSection } from './GrindSection';
import { ProjectSheet } from './ProjectSheet';

type Tab = 'overview' | 'members' | 'releases' | 'shows';
const TABS = (Object.keys(BAND_TAB_LABELS) as Tab[]).map((id) => ({ id, label: BAND_TAB_LABELS[id], testId: `band-tab-${id}` }));

/**
 * The band screen (C2): Overview (strength, chemistry, buzz, rehearsal, how hard the band works), Members (people with a skill
 * bar each, auditions for an open part, replacing someone), Releases and Shows. Without a band: forming one, or an offer.
 */
export function BandScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const hub = getBandHubView(life, content);
  const fame = getFameView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<Tab>('overview');
  const [rename, setRename] = useState<string | null>(null);
  const [project, setProject] = useState(false);
  const [findPart, setFindPart] = useState('');
  const [more, setMore] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'replace'; id: string; who: string } | { kind: 'leave'; solo: boolean } | null>(null);
  const disabled = busy || !hub.between;
  const band = fame.band;
  const renamed = rename ?? band?.name ?? '';
  const renameOk = parseTitle(renamed) !== null;
  const moreMember = hub.members.find((m) => m.id === more);

  return (
    <Sheet open={open} title={band?.name ?? 'Your band'} onClose={onClose}>
      <div data-testid="band-screen" className="flex flex-col gap-3">
        {!hub.has || !band ? (
          <BandSection life={life} view={fame} disabled={disabled} />
        ) : (
          <>
            <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Band" />

            {tab === 'overview' && (
              <div className="flex flex-col gap-3" data-testid="band-overview">
                <div>
                  <StatBar label={BAND_HUB_LABELS.strength} value={hub.strength} />
                  <p className="text-sm" data-testid="band-strength">
                    {BAND_HUB_LABELS.strengthWords[hub.strengthBand]}
                  </p>
                </div>
                <StatBar label={BAND_HUB_LABELS.chemistry} value={hub.chemistry} />
                <StatBar label={BAND_HUB_LABELS.buzz} value={hub.buzz} />
                <p className="text-sm text-muted">
                  You play {band.part.toLowerCase()}. {band.leader ? 'You lead it.' : `${band.leaderName ?? 'Someone else'} leads it.`} Together since {band.since}.
                </p>
                <div className="flex flex-col gap-2">
                  <Button variant="primary" block disabled={disabled || hub.rehearsals.block !== null} onClick={() => void act('rehearse')} data-testid="rehearse">
                    {BAND_HUB_LABELS.rehearse}
                  </Button>
                  <p className="text-sm text-muted" data-testid="rehearsal-count">
                    {BAND_HUB_LABELS.rehearsals(hub.rehearsals.done, hub.rehearsals.budget)}
                    {hub.rehearsals.block === 'budget' ? ` ${BAND_HUB_LABELS.rehearseBlock.budget}` : ''}
                  </p>
                </div>
                <div role="radiogroup" aria-label={BAND_HUB_LABELS.commitment} className="flex gap-1">
                  {(['back', 'steady', 'all'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={hub.commit === c}
                      disabled={disabled}
                      onClick={() => void act('set_role_commit', { roleId: 'band', commitment: c })}
                      data-testid={`band-commit-${c}`}
                      className={`min-h-11 flex-1 truncate rounded-xl border px-2 text-sm font-semibold disabled:opacity-60 ${hub.commit === c ? 'border-accent bg-surface-2' : 'border-border'}`}
                    >
                      {COMMITMENT_LABELS[c]}
                    </button>
                  ))}
                </div>
                {band.leader && (
                  <>
                    <TextField label={BAND_HUB_LABELS.rename} value={renamed} onChange={setRename} maxLength={60} error={renameOk ? undefined : TITLE_ERROR} data-testid="band-rename-input" />
                    <Button
                      variant="secondary"
                      disabled={disabled || !renameOk || renamed.trim() === band.name}
                      onClick={() => {
                        void act('rename_band', { bandName: renamed });
                        setRename(null);
                      }}
                      data-testid="band-rename"
                    >
                      {BAND_HUB_LABELS.rename}
                    </Button>
                  </>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" disabled={disabled} onClick={() => setConfirm({ kind: 'leave', solo: false })} data-testid="band-leave">
                    {BAND_HUB_LABELS.leave}
                  </Button>
                  <Button variant="ghost" className="flex-1" disabled={disabled} onClick={() => setConfirm({ kind: 'leave', solo: true })} data-testid="band-solo">
                    {BAND_HUB_LABELS.solo}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'members' && (
              <div className="flex flex-col gap-3" data-testid="band-members">
                {hub.members.length === 0 ? (
                  <p className="text-muted">{BAND_HUB_LABELS.noMembers}</p>
                ) : (
                  <RowList label={BAND_HUB_LABELS.members}>
                    {hub.members.map((m) => (
                      <ListRow
                        key={m.id}
                        title={m.name}
                        subtitle={`${m.part} · ${skillWord(m.skill)} · ${m.age} · ${BAND_HUB_LABELS.temper[m.temper ?? 'steady']}${m.improving ? ` · ${BAND_HUB_LABELS.improving}` : ''}`}
                        value={<MiniBar label={`${m.name} ${m.part}`} value={m.skill} />}
                        ending={band.leader ? 'dots' : 'none'}
                        onMore={() => setMore(m.id)}
                        moreTestId={`member-more-${m.id}`}
                        testId="band-member"
                      />
                    ))}
                  </RowList>
                )}
                {band.leader && band.openParts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted">{BAND_HUB_LABELS.poolNote}</p>
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      {BAND_HUB_LABELS.findMembers}
                      <select className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-text" value={findPart || band.openParts[0]!.id} onChange={(e) => setFindPart(e.target.value)} data-testid="find-part">
                        {band.openParts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button variant="secondary" disabled={disabled} onClick={() => void act('find_members', { part: findPart || band.openParts[0]!.id })} data-testid="find-members">
                      {BAND_HUB_LABELS.findFor((band.openParts.find((p) => p.id === (findPart || band.openParts[0]!.id)) ?? band.openParts[0]!).label)}
                    </Button>
                  </div>
                )}
                {hub.pool && (
                  <div data-testid="audition-pool">
                    <h3 className="text-base font-bold">
                      {BAND_HUB_LABELS.whoCame}: {hub.pool.part.toLowerCase()}
                    </h3>
                    <RowList label={BAND_HUB_LABELS.whoCame} className="mt-1">
                      {hub.pool.candidates.map((c) => (
                        <ListRow
                          key={c.index}
                          title={`${skillWord(c.skill)} ${hub.pool!.part.toLowerCase()}`}
                          subtitle={`${c.age} · ${BAND_HUB_LABELS.temper[c.temper]}`}
                          value={<MiniBar label={`Candidate ${c.index + 1}`} value={c.skill} />}
                          ending="chevron"
                          onClick={disabled ? undefined : () => void act('hire_member', { index: c.index })}
                          testId={`candidate-${c.index}`}
                        />
                      ))}
                    </RowList>
                  </div>
                )}
              </div>
            )}

            {tab === 'releases' && (
              <div className="flex flex-col gap-3" data-testid="band-releases">
                <Button variant="primary" disabled={disabled} onClick={() => setProject(true)} data-testid="band-make-release">
                  {BAND_HUB_LABELS.makeRelease}
                </Button>
                {fame.projects.length === 0 ? (
                  <p className="text-muted">{BAND_HUB_LABELS.noReleases}</p>
                ) : (
                  <RowList label={BAND_HUB_LABELS.releases}>
                    {fame.projects.map((p, i) => (
                      <ListRow key={`${p.title}-${i}`} title={p.title} subtitle={`${p.year} · ${p.noun} · ${RECEPTION_LABELS[p.band]}`} value={<MiniBar label={p.title} value={p.quality} />} />
                    ))}
                  </RowList>
                )}
              </div>
            )}

            {tab === 'shows' && (
              <div data-testid="band-shows">
                <GrindSection view={fame} disabled={disabled} />
              </div>
            )}
          </>
        )}
      </div>
      <ActionSheet
        open={moreMember !== undefined}
        title={moreMember?.name ?? ''}
        actions={moreMember ? [{ id: 'replace', label: BAND_HUB_LABELS.replace, detail: BAND_HUB_LABELS.replaceTitle, danger: true, testId: 'member-replace', onSelect: () => setConfirm({ kind: 'replace', id: moreMember.id, who: moreMember.name }) }] : []}
        onClose={() => setMore(null)}
      />
      <ConfirmSheet
        open={confirm?.kind === 'replace'}
        title={BAND_HUB_LABELS.replaceTitle}
        body={confirm?.kind === 'replace' ? BAND_HUB_LABELS.replaceBody(confirm.who) : ''}
        confirmLabel={BAND_HUB_LABELS.replace}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'replace') void act('replace_member', { personId: confirm.id });
          setConfirm(null);
        }}
      />
      <ConfirmSheet
        open={confirm?.kind === 'leave'}
        title={confirm?.kind === 'leave' && confirm.solo ? 'Go solo?' : 'Leave the band?'}
        body={confirm?.kind === 'leave' && confirm.solo ? 'Most of the fans come with you; your bandmates will not forget it.' : band?.leader ? 'It is your band: without you, it ends. Some fans will drift off with it.' : 'Some fans will stay with the band. Your bandmates will be sorry to see you go.'}
        confirmLabel={confirm?.kind === 'leave' && confirm.solo ? 'Go solo' : 'Leave'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'leave') void act('leave_band', { solo: confirm.solo });
          setConfirm(null);
        }}
      />
      {fame.active && <ProjectSheet life={life} paths={fame.paths} open={project} onClose={() => setProject(false)} />}
    </Sheet>
  );
}
