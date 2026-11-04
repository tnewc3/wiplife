import { useState } from 'react';
import { content } from '../../../content';
import { FAME_SCENES } from '../../../content/schemas';
import { getFameView, type FamePathView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import type { SheetAction } from '../../components/ActionSheet';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { EmptyState } from '../../components/EmptyState';
import { FactChip } from '../../components/FactChip';
import { FeatureScreen } from '../../components/FeatureScreen';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
import { CompactList, CompactRow, SectionLabel } from '../../components/SectionLabel';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import {
  CONTRACT_TERMS_LABELS,
  FAME_CROSS_BLOCK_LABELS,
  FAME_ENTER_BLOCK_LABELS,
  FAME_WORDS,
  FAN_MOOD_WORDS,
  IMAGE_WORDS,
  money,
  RECEPTION_LABELS,
  reactionWord,
  RISK_LABELS,
  SCENE_BLURBS,
  SCENE_LABELS,
  STALKER_STAGE_LABELS,
  STYLE_LABELS,
  fansLabel,
} from '../../labels';
import { BandScreen } from './BandScreen';
import { GrindSection } from './GrindSection';
import { ProjectSheet } from './ProjectSheet';

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);

export function Ladder({ path }: { path: FamePathView }) {
  return (
    <div className="mt-2" data-testid={`ladder-${path.id}`}>
      <p className="font-semibold">{path.name}</p>
      <ol aria-label={`${path.name} ladder`} className="mt-1 flex flex-col">
        {[...path.ladder].reverse().map((rung, i) => {
          const number = path.ladder.length - i;
          return (
            <li key={number} aria-current={rung.current ? 'step' : undefined} className={`flex min-h-9 items-baseline gap-2 border-l-4 py-1 pl-3 ${rung.current ? 'border-accent font-semibold' : rung.reached ? 'border-border' : 'border-transparent text-muted'}`}>
              <span className="min-w-0 break-words">{cap(rung.title)}</span>
              {rung.current && <span className="shrink-0 text-sm text-link">You are here</span>}
              {!rung.current && rung.reached && <span className="shrink-0 text-sm text-muted">Reached</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-sm text-muted" data-testid={`next-${path.id}`}>
        {path.next ? `Next: ${path.next.title}. ${path.next.milestone}. It takes fame and work that is good enough.` : 'You are at the top of the ladder. The only way is down, or out.'}
      </p>
      {path.faded && <p className="text-sm text-muted">You stood higher once: {path.peakTitle}.</p>}
    </div>
  );
}

type Tab = 'career' | 'releases' | 'fame';
type Picker = 'scene' | 'agent' | null;

/**
 * The Fame screen (E6b, rebuilt in U3 on the feature screen template): acting, music, writing and art. The hero shows your rung and,
 * once you have any, your fame and fans; the tiles are Write (line up a project), Band (when there is one) and Agent; the tabs are
 * Career, Releases and Fame (it waits until you are known). Breaking a contract, parting with an agent and stepping away are in
 * the ⋯ menu and ask first. How hard you work is on the Schedule.
 */
export function FameScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getFameView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [project, setProject] = useState(false);
  const [bandOpen, setBandOpen] = useState(false);
  const [confirm, setConfirm] = useState<'break' | 'retire' | null>(null);
  const [tab, setTab] = useState<Tab>('career');
  const [picker, setPicker] = useState<Picker>(null);
  const disabled = busy || !view.between;
  const main = view.paths[0];
  const known = (main?.fame ?? 0) > 0;
  const tabs: { id: Tab; label: string; testId: string }[] = [
    { id: 'career', label: 'Career', testId: 'fame-tab-career' },
    { id: 'releases', label: 'Releases', testId: 'fame-tab-releases' },
    ...(known ? [{ id: 'fame' as const, label: 'Fame', testId: 'fame-tab-fame' }] : []),
  ];
  const shownTab: Tab = tabs.some((t) => t.id === tab) ? tab : 'career';
  const actions: SheetAction[] = view.active
    ? [
        ...(view.contract ? [{ id: 'break', label: 'Break the contract', danger: true, disabled, testId: 'break-contract', onSelect: () => setConfirm('break' as const) }] : []),
        ...(view.agent ? [{ id: 'agent', label: 'Part ways with your agent', disabled, testId: 'drop-agent', onSelect: () => void act('drop_agent') }] : []),
        ...(view.plan ? [{ id: 'drop', label: 'Drop this year’s project', disabled, testId: 'drop-project', onSelect: () => void act('cancel_project') }] : []),
        { id: 'retire', label: 'Step away from it all', danger: true, disabled, testId: 'retire', onSelect: () => setConfirm('retire' as const) },
      ]
    : [];

  const overlays = (
    <>
      <BandScreen life={life} open={bandOpen} onClose={() => setBandOpen(false)} />
      {view.active && <ProjectSheet life={life} paths={view.paths} open={project} onClose={() => setProject(false)} />}
      <OptionPickerSheet open={picker === 'scene'} title="The scene" icon="sparkles" onClose={() => setPicker(null)} testId="scene-picker">
        {FAME_SCENES.map((id) => {
          const s = view.scenes.find((x) => x.id === id)!;
          const checked = view.scene === id;
          return (
            <OptionCard
              key={id}
              name={SCENE_LABELS[id]}
              chips={<FactChip>{SCENE_BLURBS[id]}</FactChip>}
              price={`about ${Math.round(s.cost * 100)}% of earnings`}
              reason={checked ? 'Now' : !s.allowed ? 'Not open' : disabled ? 'Not now' : undefined}
              testId={`scene-${id}`}
              onClick={() => {
                setPicker(null);
                void act('set_scene', { scene: id });
              }}
            />
          );
        })}
      </OptionPickerSheet>
      <OptionPickerSheet open={picker === 'agent'} title="Agents" icon="handshake" line={view.agent ? `${view.agent.name} · takes ${Math.round(view.agent.cut * 100)}%` : 'No agent'} onClose={() => setPicker(null)} testId="agent-picker">
        {view.openAgents.length === 0 && <EmptyState text="Agents come when you have climbed a little and people like you." />}
        {view.openAgents.map((a) => (
          <OptionCard
            key={a.id}
            name={a.name}
            chips={<FactChip>{a.blurb}</FactChip>}
            price={`takes ${Math.round(a.cut * 100)}%`}
            reason={disabled ? 'Not now' : undefined}
            testId={`hire-${a.id}`}
            onClick={() => {
              setPicker(null);
              void act('hire_agent', { agentId: a.id });
            }}
          />
        ))}
      </OptionPickerSheet>
      <ConfirmSheet open={confirm === 'break'} title="Break the contract?" body="You will repay part of the advance, and your public image and your fans’ goodwill will suffer. The company will not forget it." confirmLabel="Break it" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void act('break_contract'); }} />
      <ConfirmSheet open={confirm === 'retire'} title="Step away?" body="Your contract and your agent end. Fame turns into royalties that fade. You can come back, but not to where you left off." confirmLabel="Step away" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void act('retire_fame'); }} />
    </>
  );

  return (
    <FeatureScreen
      open={open}
      title={main?.name ?? 'Fame'}
      onBack={onClose}
      testId="fame-screen"
      actions={actions}
      overlays={overlays}
      info={
        <>
          {view.minor && view.active && <p>A parent signs your contracts and holds part of what you earn until you are grown.</p>}
          <p>Without new work, fame slowly fades.{view.contract ? ' Your contract will assign you something.' : ''}</p>
          <p>Agents come when you have climbed a little and people like you. Offers come as you climb.</p>
        </>
      }
    >
      {!view.between && <p className="px-1 text-sm text-muted">Choices wait until the year is over.</p>}

      {view.active && main && (
        <>
          <HeroCard lead={<Icon id={main.id.includes('music') ? 'microphone' : main.id.includes('act') ? 'clapper_board' : 'books'} size={44} />} title={main.rungTitle ? cap(main.rungTitle) : main.name} status={main.name}>
            {known ? (
              <>
                <StatCell label="Fame" value={FAME_WORDS[main.fameBand]!} bar={main.fame} testId="screen-fame" />
                {view.fans > 0 && <StatCell label="Fans" value={fansLabel(view.fans)} sub={FAN_MOOD_WORDS[view.moodBand]} bar={view.mood} testId="screen-mood" />}
                <StatCell label="Image" value={IMAGE_WORDS[view.imageBand]!} bar={view.image} testId="screen-image" />
              </>
            ) : (
              <StatCell label="Next step" value={view.paths[0]?.next ? cap(view.paths[0].next.title) : 'Top of the ladder'} sub="Nobody knows your name yet" />
            )}
          </HeroCard>
          <ActionTileRow>
            <ActionTile label="Write" icon="memo" tone="fame" status={view.plan ? 'Lined up' : 'Nothing yet'} disabled={disabled || view.projectBlock !== null} onClick={() => setProject(true)} testId="plan-open" />
            {(view.band !== null || view.formBlock !== 'path') && <ActionTile label="Band" icon="guitar" tone="fame" status={view.band ? view.band.name : 'Start or join'} onClick={() => setBandOpen(true)} testId="band-open" />}
            <ActionTile label="Agent" icon="handshake" tone="money" status={view.agent ? `${Math.round(view.agent.cut * 100)}%` : view.openAgents.length > 0 ? `${view.openAgents.length} offers` : 'None'} onClick={() => setPicker('agent')} testId="agent-open" />
            {!view.minor && <ActionTile label="Scene" icon="sparkles" tone="love" status={SCENE_LABELS[view.scene]} disabled={disabled} onClick={() => setPicker('scene')} testId="scene-open" />}
          </ActionTileRow>
          <SegmentedTabs sticky tabs={tabs} value={shownTab} onChange={setTab} label="Fame" />

          {shownTab === 'career' && (
            <div className="flex flex-col gap-3" data-testid="fame-career">
              <SectionLabel>This year</SectionLabel>
              <CompactList label="This year’s project">
                {view.plan ? (
                  <CompactRow
                    testId="plan-summary"
                    label={`${view.plan.kindLabel}${view.plan.title ? ` “${view.plan.title}”` : ''}: ${view.plan.genre ? `${view.plan.genre.toLowerCase()}, ` : ''}${STYLE_LABELS[view.plan.style].toLowerCase()}, ${RISK_LABELS[view.plan.risk].toLowerCase()}${view.plan.press ? ', press run' : ''}${view.plan.offGenre ? ' · outside your sound' : ''}`}
                    value="Change"
                    onClick={disabled ? undefined : () => setProject(true)}
                  />
                ) : (
                  <CompactRow muted label="Nothing lined up" value="Write" onClick={disabled || view.projectBlock !== null ? undefined : () => setProject(true)} />
                )}
              </CompactList>
              <SectionLabel>Your ladder</SectionLabel>
              {view.paths.map((p) => (
                <Ladder key={p.id} path={p} />
              ))}
              {(view.agent || view.contract) && (
                <>
                  <SectionLabel>Your deal</SectionLabel>
                  <CompactList label="Agent and contract">
                    {view.agent && <CompactRow testId="agent-line" label={`Agent: ${view.agent.name}`} value={`${Math.round(view.agent.cut * 100)}%`} />}
                    {view.contract && (
                      <CompactRow
                        testId="contract-line"
                        label={`${cap(view.contract.company)} · ${CONTRACT_TERMS_LABELS[view.contract.terms].toLowerCase()} · until ${view.contract.until}${view.contract.exclusive ? ' · no other work' : ''}${view.contract.byParent ? ' · signed by your parent' : ''}`}
                        value={`${Math.round(view.contract.share * 100)}% theirs`}
                      />
                    )}
                  </CompactList>
                </>
              )}
              <GrindSection view={view} disabled={disabled} />
              {view.cross.length > 0 && (
                <>
                  <SectionLabel>Crossing over</SectionLabel>
                  <RowList label="Second paths">
                    {view.cross.map((c) => (
                      <ListRow key={c.pathId} title={`Cross over into ${c.name.toLowerCase()}`} subtitle={c.block ? FAME_CROSS_BLOCK_LABELS[c.block] : undefined} muted={c.block !== null || disabled} ending="chevron" onClick={c.block || disabled ? undefined : () => void act('cross_over', { pathId: c.pathId })} testId={`cross-${c.pathId}`} />
                    ))}
                  </RowList>
                </>
              )}
            </div>
          )}

          {shownTab === 'releases' && (
            <div className="flex flex-col gap-3" data-testid="projects">
              {view.projects.length === 0 ? (
                <EmptyState text="Nothing put out yet." {...(view.projectBlock === null ? { action: 'Write something', onAction: () => setProject(true) } : {})} />
              ) : (
                <RowList label="Projects">
                  {view.projects.map((p) => (
                    <ListRow
                      key={`${p.year}-${p.title}`}
                      title={p.title}
                      subtitle={`${p.year} · ${cap(p.noun)}${p.genre ? ` · ${p.genre.toLowerCase()}` : ''} · ${RECEPTION_LABELS[p.band]} · critics ${reactionWord(p.critics).toLowerCase()}, fans ${reactionWord(p.fans).toLowerCase()} · ${money(p.earned)}`}
                      value={<MiniBar label={p.title} value={p.quality} />}
                      testId="project-row"
                    />
                  ))}
                </RowList>
              )}
              {view.income && view.income.gross > 0 && (
                <p className="px-1 text-sm text-muted" data-testid="fame-income">
                  This year’s pay: {money(view.income.gross)} earned
                  {view.income.agent + view.income.company > 0 ? `, ${money(view.income.agent + view.income.company)} to your agent and company` : ''}
                  {view.income.trust > 0 ? `, ${money(view.income.trust)} held in trust` : ''}
                  {view.income.tour > 0 ? `, ${money(view.income.tour)} for the tour` : ''}.
                </p>
              )}
            </div>
          )}

          {shownTab === 'fame' && (
            <div className="flex flex-col gap-3" data-testid="fame-fame">
              <SectionLabel>Awards</SectionLabel>
              <CompactList label="Awards shelf">
                {view.nominated && <CompactRow testId="nominated" label={`Nominated for ${view.nominated.name} (${view.nominated.category}) for ${view.nominated.project}`} />}
                {view.awards.map((a, i) => (
                  <CompactRow key={i} label={`${a.won ? 'Won' : 'Nominated'}: ${a.name}, ${a.category}, for ${a.project}`} value={String(a.year)} />
                ))}
                {view.awards.length === 0 && !view.nominated && <CompactRow muted label="An empty shelf" />}
              </CompactList>
              {view.people.super.length + view.people.hater.length + view.people.critic.length > 0 && (
                <>
                  <SectionLabel>People who came with it</SectionLabel>
                  <CompactList label="Fans and critics">
                    {view.people.super.length > 0 && <CompactRow label="Superfans" value={view.people.super.join(', ')} />}
                    {view.people.hater.length > 0 && <CompactRow label="Haters" value={view.people.hater.join(', ')} />}
                    {view.people.critic.length > 0 && <CompactRow label="Critics" value={view.people.critic.join(', ')} />}
                  </CompactList>
                </>
              )}
              {view.stalker && (
                <p className="px-1 font-semibold text-danger" data-testid="stalker">
                  {view.stalker.name}: {STALKER_STAGE_LABELS[view.stalker.stage]}.
                </p>
              )}
              {view.headlines.length > 0 && (
                <>
                  <SectionLabel>In the tabloids</SectionLabel>
                  <CompactList label="Headlines">
                    {view.headlines.map((h, i) => (
                      <CompactRow key={i} label={h.text} value={String(h.year)} />
                    ))}
                  </CompactList>
                </>
              )}
            </div>
          )}
        </>
      )}

      {view.retired && (
        <div className="flex flex-col gap-3">
          <HeroCard lead={<Icon id="crown" size={44} />} title="Retired" status="Royalties still come in, a little less each year." />
          <ActionTileRow>
            <ActionTile label="Go back to work" icon="rocket" tone="fame" status="Ready" disabled={disabled} onClick={() => void act('return_fame')} testId="return-fame" />
          </ActionTileRow>
        </div>
      )}

      {!view.active && !view.retired && (
        <div className="flex flex-col gap-3" data-testid="entry">
          {view.minor && <p className="px-1 text-sm">A parent has to sign for you.</p>}
          {view.entry.map((e) => (
            <div key={e.pathId} className="flex flex-col gap-2">
              <SectionLabel>{e.name}</SectionLabel>
              {e.routes.map((r) => (
                <OptionCard
                  key={r.id}
                  name={r.label}
                  chips={<FactChip>{r.blurb}</FactChip>}
                  price="Start"
                  reason={r.block ? (r.block === 'age' ? `From age ${r.minAge}` : FAME_ENTER_BLOCK_LABELS[r.block]) : disabled ? 'Not now' : undefined}
                  testId={`enter-${e.pathId}-${r.id}`}
                  onClick={() => void act('enter_fame', { pathId: e.pathId, routeId: r.id })}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </FeatureScreen>
  );
}
