import { useState } from 'react';
import type { TrainingMode } from '../../../content/schemas';
import type { SportsView, TeamOptionView } from '../../../engine/selectors';
import { Button } from '../../components/Button';
import {
  money,
  ODDS_WORDS,
  OFFER_BLOCK_LABELS,
  ROLE_LABELS,
  SCHOLARSHIP_SYSTEM_LABELS,
  SKILL_WORDS,
  SPORT_LEVEL_LABELS,
  TEAM_QUALITY_WORDS,
  TRAIN_BLOCK_LABELS,
  TRAINING_MODE_BLURBS,
  TRAINING_MODE_LABELS,
  TRYOUT_BLOCK_LABELS,
} from '../../labels';
import { TRAINING_MODES } from '../../../content/schemas';
import type { LifeActionId, LifeActionParams } from '../../../engine/actions';

type TakeAction = (actionId: LifeActionId, params?: LifeActionParams) => Promise<void>;

export function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-5" aria-label={title} {...(testId ? { 'data-testid': testId } : {})}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** One team you could try out for: its level, how hard it is to make, and a button. */
function TeamRow({ team, pathId, disabled, act }: { team: TeamOptionView; pathId: string; disabled: boolean; act: TakeAction }) {
  const camp = team.level === 'pro';
  return (
    <li className="flex min-w-0 flex-col gap-1 py-2" data-testid={`team-${pathId}-${team.key}`}>
      <span className="font-semibold break-words">{team.name}</span>
      <span className="text-sm text-muted">
        {camp ? 'Pro camp' : team.tierLabel} · {SPORT_LEVEL_LABELS[team.level].toLowerCase()}
        {team.club ? ' · alongside your school team' : ''} · {TEAM_QUALITY_WORDS[team.qualityBand]!.toLowerCase()}
      </span>
      <span className="text-sm" data-testid={`odds-${pathId}-${team.key}`}>
        {ODDS_WORDS[team.oddsBand]} to make it
        {team.fee > 0 ? ` · ${money(team.fee)} a year` : ''}
      </span>
      {team.block ? (
        <span className="text-sm text-muted">{TRYOUT_BLOCK_LABELS[team.block]}</span>
      ) : (
        <Button variant="secondary" disabled={disabled} onClick={() => void act('try_out', { pathId, teamKey: team.key })} data-testid={`tryout-${pathId}-${team.key}`}>
          {camp ? 'Go to camp' : 'Try out'}
        </Button>
      )}
    </li>
  );
}

/** The teams at each level with their tryout buttons (also the ways in before a career). */
export function TeamsList({ teams, pathId, disabled, act, label }: { teams: TeamOptionView[]; pathId: string; disabled: boolean; act: TakeAction; label: string }) {
  if (teams.length === 0) return <p className="mt-1 text-sm text-muted">No team is holding a tryout for you right now.</p>;
  const levels = (['youth', 'school', 'college', 'pro'] as const).filter((l) => teams.some((t) => t.level === l));
  return (
    <div className="mt-1 flex flex-col gap-3" aria-label={label}>
      {levels.map((level) => (
        <div key={level}>
          <p className="text-sm font-semibold text-muted">{level === 'pro' ? 'Pro camps' : SPORT_LEVEL_LABELS[level]}</p>
          <ul className="flex flex-col divide-y divide-border" aria-label={`${level === 'pro' ? 'Pro camp' : SPORT_LEVEL_LABELS[level]} options`}>
            {teams
              .filter((t) => t.level === level)
              .map((t) => (
                <TeamRow key={t.key} team={t} pathId={pathId} disabled={disabled} act={act} />
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Where you stand on a team: your role, number and the captain's band, and the club team alongside. */
export function TeamStanding({ view, disabled, act }: { view: SportsView; disabled: boolean; act: TakeAction }) {
  if (!view.team && !view.club) return null;
  return (
    <div className="mt-2 text-sm" data-testid="standing-line">
      {view.role && view.team && (
        <p>
          {ROLE_LABELS[view.role]}
          {view.number !== null ? ` · number ${view.number}` : ''}
          {view.captain ? ' · captain' : ''}
        </p>
      )}
      {view.club && (
        <p data-testid="club-line">
          Alongside: {view.club.name} ({view.club.tierLabel.toLowerCase()}).{' '}
          <Button variant="ghost" disabled={disabled} onClick={() => void act('leave_club')} data-testid="leave-club">
            Leave the club team
          </Button>
        </p>
      )}
      {view.team && view.level !== 'pro' && (
        <Button variant="ghost" disabled={disabled} onClick={() => void act('leave_team')} data-testid="leave-team">
          Leave your team
        </Button>
      )}
    </div>
  );
}

/** Training sessions: the year's budget, where to train and what each skill gains. */
export function TrainingSection({ view, disabled, act }: { view: SportsView; disabled: boolean; act: TakeAction }) {
  const t = view.training;
  const [pick, setPick] = useState<TrainingMode | null>(null);
  if (!t.available && t.skills.length === 0) return null;
  const mode: TrainingMode = pick ?? (t.hasTeam ? 'team' : 'gym');
  const row = t.modes.find((m) => m.id === mode)!;
  return (
    <Section title="Training sessions" testId="training">
      <p className="mt-1 text-sm text-muted" data-testid="session-budget">
        {t.left} of {t.budget} sessions left this year. More commitment, more sessions. Training never hurts you; games do.
      </p>
      <div role="radiogroup" aria-label="Where to train" className="mt-2 flex flex-col gap-2">
        {TRAINING_MODES.map((id) => {
          const m = t.modes.find((x) => x.id === id)!;
          const unavailable = id === 'team' && !t.hasTeam;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              disabled={disabled || unavailable}
              onClick={() => setPick(id)}
              data-testid={`train-mode-${id}`}
              className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${mode === id ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
            >
              <span className="font-semibold">
                {TRAINING_MODE_LABELS[id]} <span className="font-normal text-muted">· {m.cost > 0 ? `${money(m.cost)}${id === 'gym' ? ' membership' : ' a session'}` : unavailable ? 'no team' : t.member && id === 'gym' ? 'paid for this year' : 'free'}</span>
              </span>
              <span className="text-sm text-muted">{TRAINING_MODE_BLURBS[id]}</span>
            </button>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Skills">
        {t.skills.map((s) => {
          const block = s.blocks[mode];
          return (
            <li key={s.id} className="flex min-w-0 flex-col gap-1 py-2" data-testid={`skill-${s.id}`}>
              <span className="font-semibold">
                {s.label} <span className="font-normal text-muted">· {SKILL_WORDS[s.levelBand]}</span>
              </span>
              <span className="text-sm text-muted">{s.blurb}</span>
              {block ? (
                <span className="text-sm text-muted">{TRAIN_BLOCK_LABELS[block]}</span>
              ) : (
                <Button variant="secondary" disabled={disabled} onClick={() => void act('train', { skillId: s.id, trainMode: mode })} data-testid={`train-${s.id}`}>
                  Train {s.label.toLowerCase()}
                  {row.cost > 0 ? ` (${money(row.cost)})` : ''}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Athletic scholarship offers and the one you hold. */
export function ScholarshipSection({ view, disabled, act }: { view: SportsView; disabled: boolean; act: TakeAction }) {
  if (!view.aid.available || (view.offers.length === 0 && !view.scholarship)) return null;
  const word = view.aid.word;
  return (
    <Section title="Scholarships" testId="scholarships">
      <p className="mt-1 text-sm text-muted">{SCHOLARSHIP_SYSTEM_LABELS[view.aid.system]}</p>
      {view.scholarship && (
        <p className="mt-1" data-testid="scholarship-line">
          Your {word} at {view.scholarship.school} covers {Math.round(view.scholarship.share * 100)}% of tuition while you play for the team and keep your grades up.
          {view.scholarship.warned ? ' You are on warning: another year under the grade floor and it is gone.' : ''}
        </p>
      )}
      {view.offers.length > 0 && !view.scholarship && (
        <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Offers">
          {view.offers.map((o) => (
            <li key={o.tier} className="flex min-w-0 flex-col gap-1 py-2" data-testid={`offer-${o.tier}`}>
              <span className="font-semibold break-words">{o.school}</span>
              <span className="text-sm text-muted">
                A {word} for {Math.round(o.share * 100)}% of tuition.
              </span>
              {o.block ? (
                <span className="text-sm text-muted">{OFFER_BLOCK_LABELS[o.block as keyof typeof OFFER_BLOCK_LABELS] ?? ''}</span>
              ) : (
                <Button variant="secondary" disabled={disabled} onClick={() => void act('accept_scholarship', { tier: o.tier })} data-testid={`accept-${o.tier}`}>
                  Accept the offer
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.offers.length > 0 && !view.scholarship && (
        <Button variant="ghost" disabled={disabled} onClick={() => void act('decline_scholarship')} data-testid="decline-offers">
          Turn the offers down
        </Button>
      )}
    </Section>
  );
}

/** The draft card: where scouts project you, in words. */
export function DraftSection({ view }: { view: SportsView }) {
  const p = view.prospect;
  if (!p) return null;
  return (
    <Section title="The draft" testId="draft-card">
      <p className="mt-1" data-testid="draft-projection">
        {p.line}
      </p>
      <p className="text-sm text-muted" data-testid="draft-range">
        {p.best === p.worst ? `Scouts agree: ${p.likely}.` : `On a good day, ${p.best}. On a bad one, ${p.worst}.`}
      </p>
      {p.combine !== 0 && <p className="text-sm text-muted">{p.combine > 0 ? 'Your workouts and interviews have helped.' : 'Your workouts and interviews have cost you.'}</p>}
      {p.passed && <p className="mt-1 text-sm">The draft has passed you by once. Camps and open tryouts are how you earn a deal now.</p>}
    </Section>
  );
}

