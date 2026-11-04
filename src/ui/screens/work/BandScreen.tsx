import { useState } from 'react';
import { content } from '../../../content';
import { bandNameSuggestion, getBandHubView, getFameView, parseTitle } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionSheet } from '../../components/ActionSheet';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { EmptyState } from '../../components/EmptyState';
import { EffectChip, FactChip } from '../../components/FactChip';
import { FeatureScreen } from '../../components/FeatureScreen';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { JoinCard } from '../../components/JoinCard';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
import { RenameDialog } from '../../components/RenameDialog';
import { SectionLabel } from '../../components/SectionLabel';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { BAND_BLOCK_LABELS, BAND_HUB_LABELS, PAST_BAND_LABELS, RECEPTION_LABELS, TITLE_ERROR, skillWord } from '../../labels';
import { GrindSection } from './GrindSection';
import { ProjectSheet } from './ProjectSheet';

type Tab = 'members' | 'music' | 'shows';
const TABS: { id: Tab; label: string; testId: string }[] = [
  { id: 'members', label: 'Members', testId: 'band-tab-members' },
  { id: 'music', label: 'Music', testId: 'band-tab-releases' },
  { id: 'shows', label: 'Shows', testId: 'band-tab-shows' },
];

/**
 * The band (C2, rebuilt in U3 on the feature screen template): a hero with the genre and member count and the stats Strength,
 * Chemistry and Buzz; tiles Rehearse, Write and Play a show; tabs Members, Music and Shows. Renaming, going solo and leaving
 * are in the ⋯ menu. An open spot in the roster has an Audition button that opens a sheet of candidates. Without a band, it
 * offers the bands that want you, or starting your own.
 */
export function BandScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const hub = getBandHubView(life, content);
  const fame = getFameView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [tab, setTab] = useState<Tab>('members');
  const [dialog, setDialog] = useState<'rename' | 'form' | null>(null);
  const [project, setProject] = useState(false);
  const [more, setMore] = useState<string | null>(null);
  const [auditions, setAuditions] = useState(false);
  const [partPicker, setPartPicker] = useState(false);
  const [part, setPart] = useState('');
  const [suggest, setSuggest] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: 'replace'; id: string; who: string } | { kind: 'leave'; solo: boolean } | null>(null);
  const disabled = busy || !hub.between;
  const band = fame.band;
  const moreMember = hub.members.find((m) => m.id === more);
  const genre = fame.paths[0]?.genre?.name;
  const nameCheck = (t: string) => (parseTitle(t) === null ? TITLE_ERROR : undefined);

  const overlays = (
    <>
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
      <RenameDialog open={dialog === 'rename'} title={BAND_HUB_LABELS.rename} label="Band name" initial={band?.name ?? ''} error={nameCheck} testId="band-rename-input" saveTestId="band-rename" busy={busy} onCancel={() => setDialog(null)} onSave={(t) => { setDialog(null); void act('rename_band', { bandName: t }); }} />
      <RenameDialog open={dialog === 'form'} title="Name your band" label="Band name" initial={bandNameSuggestion(life, suggest, content)} allowSame error={nameCheck} testId="band-name-input" saveTestId="band-form" saveLabel="Hold auditions" hint="Type your own, or keep the suggestion." onCancel={() => setDialog(null)} onSave={(t) => { setDialog(null); void act('form_band', { bandName: t, ...(part || fame.parts[0] ? { part: part || fame.parts[0]!.id } : {}) }); }} />
      <OptionPickerSheet open={partPicker} title="Your part" icon="guitar" onClose={() => setPartPicker(false)} testId="band-part-picker">
        {fame.parts.map((p) => (
          <OptionCard key={p.id} name={p.label} testId={`band-part-${p.id}`} onClick={() => { setPart(p.id); setPartPicker(false); setSuggest((n) => n + 1); setDialog('form'); }} />
        ))}
      </OptionPickerSheet>
      {band && (
        <OptionPickerSheet open={auditions && hub.pool !== null} title={hub.pool ? `${BAND_HUB_LABELS.whoCame}: ${hub.pool.part.toLowerCase()}` : 'Auditions'} icon="microphone" onClose={() => setAuditions(false)} testId="audition-pool">
          {hub.pool?.candidates.map((c) => (
            <OptionCard
              key={c.index}
              name={`${skillWord(c.skill)} ${hub.pool!.part.toLowerCase()}`}
              chips={
                <>
                  <EffectChip tone="good">Skill {Math.round(c.skill)}%</EffectChip>
                  <FactChip>Age {c.age}</FactChip>
                  <FactChip>{BAND_HUB_LABELS.temper[c.temper]}</FactChip>
                </>
              }
              reason={disabled ? 'Not now' : undefined}
              testId={`candidate-${c.index}`}
              onClick={() => {
                setAuditions(false);
                void act('hire_member', { index: c.index });
              }}
            />
          ))}
        </OptionPickerSheet>
      )}
      {fame.active && <ProjectSheet life={life} paths={fame.paths} open={project} onClose={() => setProject(false)} />}
    </>
  );

  if (!hub.has || !band) {
    return (
      <FeatureScreen open={open} title="Your band" onBack={onClose} testId="band-screen" overlays={overlays}>
        <HeroCard lead={<Icon id="guitar" size={44} />} title="Your band" status="You perform on your own." />
        {fame.formBlock === null && (
          <ActionTileRow>
            <ActionTile label="Start a band" icon="guitar" tone="fame" status="Hold auditions" disabled={disabled} onClick={() => (fame.parts.length > 1 ? setPartPicker(true) : (setSuggest((n) => n + 1), setDialog('form')))} testId="band-start" />
          </ActionTileRow>
        )}
        {fame.formBlock !== null && <EmptyState text={BAND_BLOCK_LABELS[fame.formBlock]} />}
        {fame.offers.length > 0 && <SectionLabel>Bands that want you</SectionLabel>}
        <ul className="flex flex-col gap-2" aria-label="Bands that want you">
          {fame.offers.map((o, i) => (
            <JoinCard key={o.name} icon="guitar" name={o.name} kind={`${o.genre} band of ${o.size}`} chips={<FactChip>You on {o.part.toLowerCase()}</FactChip>} join={() => void act('join_band', { offer: i })} joinLabel="Join them" joinDisabled={disabled || fame.formBlock !== null} testId="band-offer" joinTestId={`join-band-${i}`} />
          ))}
        </ul>
        {fame.pastBands.length > 0 && (
          <>
            <SectionLabel>Bands you were in</SectionLabel>
            <RowList label="Bands you were in">
              {fame.pastBands.map((b, i) => (
                <ListRow key={i} title={b.name} subtitle={`${b.from}–${b.to} · ${PAST_BAND_LABELS[b.how]}`} />
              ))}
            </RowList>
          </>
        )}
      </FeatureScreen>
    );
  }

  const actions = [
    ...(band.leader ? [{ id: 'rename', label: BAND_HUB_LABELS.rename, disabled, testId: 'band-rename-open', onSelect: () => setDialog('rename' as const) }] : []),
    { id: 'solo', label: BAND_HUB_LABELS.solo, danger: true, disabled, testId: 'band-solo', onSelect: () => setConfirm({ kind: 'leave', solo: true }) },
    { id: 'leave', label: BAND_HUB_LABELS.leave, danger: true, disabled, testId: 'band-leave', onSelect: () => setConfirm({ kind: 'leave', solo: false }) },
  ];

  return (
    <FeatureScreen
      open={open}
      title={band.name}
      onBack={onClose}
      testId="band-screen"
      actions={actions}
      info={
        <>
          <p>{BAND_HUB_LABELS.poolNote}</p>
          <p>
            You play {band.part.toLowerCase()}. {band.leader ? 'You lead it.' : `${band.leaderName ?? 'Someone else'} leads it.`} Together since {band.since}.
          </p>
        </>
      }
      overlays={overlays}
    >
      <HeroCard lead={<Icon id="guitar" size={44} />} title={band.name} status={`${genre ? `${genre} · ` : ''}${hub.members.length + 1} members`}>
        <StatCell label={BAND_HUB_LABELS.strength} value={BAND_HUB_LABELS.strengthWords[hub.strengthBand]} bar={hub.strength} testId="band-strength" />
        <StatCell label={BAND_HUB_LABELS.chemistry} value={`${Math.round(hub.chemistry)}%`} bar={hub.chemistry} />
        <StatCell label={BAND_HUB_LABELS.buzz} value={`${Math.round(hub.buzz)}%`} bar={hub.buzz} />
      </HeroCard>
      <ActionTileRow>
        <ActionTile label={BAND_HUB_LABELS.rehearse} icon="drum" tone="fame" status={BAND_HUB_LABELS.rehearsals(hub.rehearsals.done, hub.rehearsals.budget)} disabled={disabled || hub.rehearsals.block !== null} onClick={() => void act('rehearse')} testId="rehearse" />
        {fame.active && <ActionTile label="Write" icon="memo" tone="fame" status={fame.plan ? 'Lined up' : 'Nothing yet'} disabled={disabled || fame.projectBlock !== null} onClick={() => setProject(true)} testId="band-make-release" />}
        <ActionTile label="Play a show" icon="microphone" tone="fame" status={fame.shows.venue ? `${fame.shows.played} of ${fame.shows.max}` : 'None'} disabled={disabled || fame.shows.block !== null} onClick={() => void act('play_show')} testId="play-show" />
      </ActionTileRow>
      <span className="sr-only" data-testid="rehearsal-count">
        {BAND_HUB_LABELS.rehearsals(hub.rehearsals.done, hub.rehearsals.budget)}
        {hub.rehearsals.block === 'budget' ? ` ${BAND_HUB_LABELS.rehearseBlock.budget}` : ''}
      </span>
      <SegmentedTabs sticky tabs={TABS} value={tab} onChange={setTab} label="Band" />

      {tab === 'members' && (
        <div className="flex flex-col gap-2" data-testid="band-members">
          <RowList label={BAND_HUB_LABELS.members}>
            {hub.members.map((m) => (
              <ListRow
                key={m.id}
                title={m.name}
                subtitle={`${m.part} · ${m.age} · ${skillWord(m.skill)}${m.improving ? ' · ▲' : ''}`}
                value={<MiniBar label={`${m.name} ${m.part}`} value={m.skill} />}
                ending={band.leader ? 'dots' : 'none'}
                onMore={() => setMore(m.id)}
                moreTestId={`member-more-${m.id}`}
                testId="band-member"
              />
            ))}
            {band.leader &&
              band.openParts.map((p, i) => (
                <ListRow
                  key={p.id}
                  title={`${p.label} · Open spot`}
                  muted
                  value={
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setAuditions(true);
                        void act('find_members', { part: p.id });
                      }}
                      data-testid={i === 0 ? 'find-members' : `find-members-${p.id}`}
                      className="wl-press min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-contrast disabled:opacity-50"
                    >
                      Audition
                    </button>
                  }
                />
              ))}
          </RowList>
          {hub.pool && !auditions && (
            <ActionTileRow label="Auditions">
              <ActionTile label="Auditions" icon="microphone" tone="fame" status={`${hub.pool.candidates.length} came`} onClick={() => setAuditions(true)} testId="auditions-open" />
            </ActionTileRow>
          )}
        </div>
      )}

      {tab === 'music' && (
        <div className="flex flex-col gap-2" data-testid="band-releases">
          {fame.projects.length === 0 ? (
            <EmptyState text={BAND_HUB_LABELS.noReleases} {...(fame.active ? { action: 'Write something', onAction: () => setProject(true) } : {})} />
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
    </FeatureScreen>
  );
}
