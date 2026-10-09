import { useState } from 'react';
import { content } from '../../../content';
import { FAME_COMMITMENTS, FAME_SCENES } from '../../../content/schemas';
import { getFameView, type FamePathView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import {
  BURNOUT_WORDS,
  COMMITMENT_BLOCK_LABELS,
  COMMITMENT_BLURBS,
  COMMITMENT_LABELS,
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
import { ProjectSheet } from './ProjectSheet';

const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-5" aria-label={title} {...(testId ? { 'data-testid': testId } : {})}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Ladder({ path }: { path: FamePathView }) {
  return (
    <div className="mt-2" data-testid={`ladder-${path.id}`}>
      <p className="font-semibold">{path.name}</p>
      <ol aria-label={`${path.name} ladder`} className="mt-1 flex flex-col">
        {[...path.ladder].reverse().map((rung, i) => {
          const number = path.ladder.length - i;
          return (
            <li key={number} aria-current={rung.current ? 'step' : undefined} className={`flex min-h-9 items-baseline gap-2 border-l-4 py-1 pl-3 ${rung.current ? 'border-accent font-semibold' : rung.reached ? 'border-border' : 'border-transparent text-muted'}`}>
              <span className="min-w-0 break-words">{cap(rung.title)}</span>
              {rung.current && <span className="shrink-0 text-sm text-accent">You are here</span>}
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

/**
 * E6b: the Fame screen from the Work tab: the ladder with your rung and the
 * next milestone, fame, public image and fan mood, your commitment and scene,
 * your agent and contract, the projects you have released and how they were
 * received, an awards shelf, the people fame brought into your life, ways to
 * cross over, and the ways in before you begin. Words and bars, never numbers
 * for the scores; everything tappable is 44px or more.
 */
export function FameScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getFameView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [project, setProject] = useState(false);
  const [confirm, setConfirm] = useState<'break' | 'retire' | null>(null);
  const disabled = busy || !view.between;
  const main = view.paths[0];
  return (
    <>
      <Sheet open={open} title="Fame" onClose={onClose}>
        <div data-testid="fame-screen">
          {!view.between && <p className="mt-1 text-sm text-muted">Choices wait until the year is over.</p>}
          {view.minor && view.active && <p className="mt-1 text-sm">A parent signs your contracts and holds part of what you earn until you are grown.</p>}

          {view.active && main && (
            <>
              <Section title="Your ladder">
                {view.paths.map((p) => (
                  <Ladder key={p.id} path={p} />
                ))}
              </Section>
              <Section title="How you stand">
                <div className="mt-2 flex flex-col gap-3">
                  <div>
                    <StatBar label="Fame" value={main.fame} />
                    <p className="text-sm" data-testid="screen-fame">
                      {FAME_WORDS[main.fameBand]}
                    </p>
                  </div>
                  <div>
                    <StatBar label="Public image" value={view.image} />
                    <p className="text-sm" data-testid="screen-image">
                      {IMAGE_WORDS[view.imageBand]}
                    </p>
                  </div>
                  <div>
                    <StatBar label="Fan mood" value={view.mood} />
                    <p className="text-sm" data-testid="screen-mood">
                      {FAN_MOOD_WORDS[view.moodBand]} · about {fansLabel(view.fans)} fans
                    </p>
                  </div>
                  <div>
                    <StatBar label="Burnout" value={view.burnout} />
                    <p className="text-sm" data-testid="screen-burnout">
                      {BURNOUT_WORDS[view.burnoutBand]}
                    </p>
                  </div>
                </div>
              </Section>
              <Section title="How much you give it" testId="commitment">
                <div role="radiogroup" aria-label="Commitment" className="mt-2 flex flex-col gap-2">
                  {FAME_COMMITMENTS.map((id) => {
                    const c = view.commitments.find((x) => x.id === id)!;
                    const checked = view.commitment === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled || (!checked && !c.allowed)}
                        onClick={() => void act('set_commitment', { commitment: id })}
                        data-testid={`commitment-${id}`}
                        className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${checked ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
                      >
                        <span className="font-semibold">{COMMITMENT_LABELS[id]}</span>
                        <span className="text-sm text-muted">{c.block ? COMMITMENT_BLOCK_LABELS[c.block] : COMMITMENT_BLURBS[id]}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>
              <Section title="This year’s project" testId="project">
                {view.plan ? (
                  <p className="mt-1" data-testid="plan-summary">
                    {view.plan.kindLabel}: {STYLE_LABELS[view.plan.style].toLowerCase()}, {RISK_LABELS[view.plan.risk].toLowerCase()}
                    {view.plan.tour ? ', with a tour' : ''}
                    {view.plan.press ? ', with a press run' : ''}. It comes out as the year begins.
                  </p>
                ) : (
                  <p className="mt-1 text-muted">Nothing lined up. Without new work, fame slowly fades.{view.contract ? ' Your contract will assign you something.' : ''}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" className="flex-1" disabled={disabled || view.projectBlock !== null} onClick={() => setProject(true)} data-testid="plan-open">
                    {view.plan ? 'Change it' : 'Line up a project'}
                  </Button>
                  {view.plan && (
                    <Button variant="ghost" disabled={disabled} onClick={() => void act('cancel_project')}>
                      Drop it
                    </Button>
                  )}
                </div>
              </Section>
              <Section title="Agent and contract" testId="business">
                <p className="mt-1" data-testid="agent-line">
                  {view.agent ? `${view.agent.name} · takes ${Math.round(view.agent.cut * 100)}%` : 'No agent.'}
                </p>
                {view.agent && (
                  <Button variant="ghost" disabled={disabled} onClick={() => void act('drop_agent')}>
                    Part ways with your agent
                  </Button>
                )}
                {view.openAgents.length > 0 && (
                  <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Agents who would take you on">
                    {view.openAgents.map((a) => (
                      <li key={a.id} className="flex min-w-0 flex-col gap-1 py-2">
                        <span className="font-semibold break-words">
                          {a.name} · takes {Math.round(a.cut * 100)}%
                        </span>
                        <span className="text-sm text-muted">{a.blurb}</span>
                        <Button variant="secondary" disabled={disabled} onClick={() => void act('hire_agent', { agentId: a.id })} data-testid={`hire-${a.id}`}>
                          Take them on
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {!view.agent && view.openAgents.length === 0 && <p className="text-sm text-muted">Agents come when you have climbed a little and people like you.</p>}
                <p className="mt-3" data-testid="contract-line">
                  {view.contract
                    ? `${cap(view.contract.company)} · ${CONTRACT_TERMS_LABELS[view.contract.terms].toLowerCase()} · until ${view.contract.until} · they keep ${Math.round(view.contract.share * 100)}% of what the work earns${view.contract.exclusive ? ' · no other work' : ''}${view.contract.byParent ? ' · signed by your parent' : ''}`
                    : 'No contract. Offers come as you climb.'}
                </p>
                {view.contract && (
                  <Button variant="ghost" disabled={disabled} onClick={() => setConfirm('break')} data-testid="break-contract">
                    Break the contract
                  </Button>
                )}
              </Section>
              {!view.minor && (
                <Section title="The scene" testId="scene">
                  <div role="radiogroup" aria-label="Scene" className="mt-2 flex flex-col gap-2">
                    {FAME_SCENES.map((id) => {
                      const s = view.scenes.find((x) => x.id === id)!;
                      const checked = view.scene === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          disabled={disabled || (!checked && !s.allowed)}
                          onClick={() => void act('set_scene', { scene: id })}
                          data-testid={`scene-${id}`}
                          className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${checked ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
                        >
                          <span className="font-semibold">{SCENE_LABELS[id]}</span>
                          <span className="text-sm text-muted">
                            {SCENE_BLURBS[id]} Costs about {Math.round(s.cost * 100)}% of what you earn.
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Section>
              )}
              <Section title="What you have put out" testId="projects">
                {view.projects.length === 0 ? (
                  <p className="mt-1 text-muted">Nothing yet.</p>
                ) : (
                  <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Projects">
                    {view.projects.map((p) => (
                      <li key={`${p.year}-${p.title}`} className="flex min-w-0 flex-col gap-1 py-2" data-testid="project-row">
                        <span className="font-semibold break-words">
                          {p.title} <span className="font-normal text-muted">· {p.year}</span>
                        </span>
                        <span className="text-sm text-muted">
                          {cap(p.noun)} · {STYLE_LABELS[p.style].toLowerCase()}, {RISK_LABELS[p.risk].toLowerCase()}
                          {p.assigned ? ' · assigned by your company' : ''}
                        </span>
                        <span className="text-sm">
                          {RECEPTION_LABELS[p.band]}. Critics: {reactionWord(p.critics).toLowerCase()}. Fans: {reactionWord(p.fans).toLowerCase()}. It earned {money(p.earned)} before the cuts.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {view.income && view.income.gross > 0 && (
                  <p className="mt-2 text-sm text-muted" data-testid="fame-income">
                    The year’s pay went through your yearly ledger: {money(view.income.gross)} earned
                    {view.income.agent + view.income.company > 0 ? `, ${money(view.income.agent + view.income.company)} to your agent and company` : ''}
                    {view.income.trust > 0 ? `, ${money(view.income.trust)} held in trust` : ''}.
                  </p>
                )}
              </Section>
              <Section title="Awards" testId="awards">
                {view.nominated && (
                  <p className="mt-1" data-testid="nominated">
                    Nominated for {view.nominated.name} ({view.nominated.category}) for {view.nominated.project}. The night is next year.
                  </p>
                )}
                {view.awards.length === 0 && !view.nominated ? (
                  <p className="mt-1 text-muted">An empty shelf. Good work gets nominated.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1" aria-label="Awards shelf">
                    {view.awards.map((a, i) => (
                      <li key={i} className="break-words">
                        {a.won ? 'Won' : 'Nominated'}: {a.name}, {a.category}, for {a.project} ({a.year})
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="People who came with it" testId="fan-people">
                {view.people.super.length + view.people.hater.length + view.people.critic.length === 0 ? (
                  <p className="mt-1 text-muted">No one stands out yet.</p>
                ) : (
                  <dl className="mt-1 flex flex-col gap-1">
                    {(
                      [
                        ['Superfans', view.people.super],
                        ['Haters', view.people.hater],
                        ['Critics', view.people.critic],
                      ] as const
                    ).map(([label, names]) =>
                      names.length === 0 ? null : (
                        <div key={label} className="flex justify-between gap-3">
                          <dt>{label}</dt>
                          <dd className="min-w-0 break-words text-right">{names.join(', ')}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}
                {view.stalker && (
                  <p className="mt-2 font-semibold text-danger" data-testid="stalker">
                    {view.stalker.name}: {STALKER_STAGE_LABELS[view.stalker.stage]}.
                  </p>
                )}
              </Section>
              {view.headlines.length > 0 && (
                <Section title="In the tabloids" testId="headlines">
                  <ul className="mt-1 flex flex-col gap-1" aria-label="Headlines">
                    {view.headlines.map((h, i) => (
                      <li key={i} className="break-words">
                        {h.text} <span className="text-sm text-muted">({h.year})</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {view.cross.length > 0 && (
                <Section title="Crossing over" testId="crossover">
                  <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Second paths">
                    {view.cross.map((c) => (
                      <li key={c.pathId} className="flex min-w-0 flex-col gap-1 py-2">
                        <span className="font-semibold">{c.name}</span>
                        {c.block ? (
                          <span className="text-sm text-muted">{FAME_CROSS_BLOCK_LABELS[c.block]}</span>
                        ) : (
                          <Button variant="secondary" disabled={disabled} onClick={() => void act('cross_over', { pathId: c.pathId })} data-testid={`cross-${c.pathId}`}>
                            Cross over into {c.name.toLowerCase()}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              <Button variant="ghost" block className="mt-5" disabled={disabled} onClick={() => setConfirm('retire')} data-testid="retire">
                Step away from it all
              </Button>
            </>
          )}

          {view.retired && (
            <Section title="Retired">
              <p className="mt-1 text-muted">You stepped away. Royalties still come in, a little less each year. You can go back.</p>
              <Button block className="mt-2" disabled={disabled} onClick={() => void act('return_fame')} data-testid="return-fame">
                Go back to work
              </Button>
            </Section>
          )}

          {!view.active && !view.retired && (
            <Section title="Ways in" testId="entry">
              {view.minor && <p className="mt-1 text-sm">A parent has to sign for you.</p>}
              {view.entry.map((e) => (
                <Card key={e.pathId} className="mt-2">
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-sm text-muted">{e.blurb}</p>
                  <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={`${e.name} routes`}>
                    {e.routes.map((r) => (
                      <li key={r.id} className="flex min-w-0 flex-col gap-1 py-2">
                        <span className="font-semibold break-words">{r.label}</span>
                        <span className="text-sm text-muted">{r.blurb}</span>
                        {r.block ? (
                          <span className="text-sm text-muted">{r.block === 'age' ? `From age ${r.minAge}.` : FAME_ENTER_BLOCK_LABELS[r.block]}</span>
                        ) : (
                          <Button variant="secondary" disabled={disabled} onClick={() => void act('enter_fame', { pathId: e.pathId, routeId: r.id })} data-testid={`enter-${e.pathId}-${r.id}`}>
                            Start
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </Section>
          )}
        </div>
      </Sheet>
      {view.active && <ProjectSheet life={life} paths={view.paths} open={project} onClose={() => setProject(false)} />}
      <ConfirmSheet
        open={confirm === 'break'}
        title="Break the contract?"
        body="You will repay part of the advance, and your public image and your fans’ goodwill will suffer. The company will not forget it."
        confirmLabel="Break it"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void act('break_contract');
        }}
      />
      <ConfirmSheet
        open={confirm === 'retire'}
        title="Step away?"
        body="Your contract and your agent end. Fame turns into royalties that fade. You can come back, but not to where you left off."
        confirmLabel="Step away"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void act('retire_fame');
        }}
      />
    </>
  );
}
