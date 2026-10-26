import { useState } from 'react';
import { content } from '../../../content';
import type { SocialTone } from '../../../content/schemas';
import { getSocialView, handleIssue, type AccountView, type SocialView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import {
  money,
  postsLeftWords,
  SOCIAL_COLLAB_BLOCK_LABELS,
  SOCIAL_CONTROVERSY_WORDS,
  SOCIAL_CROSS_BLOCK_LABELS,
  SOCIAL_HANDLE_ISSUES,
  SOCIAL_MODEL_LABELS,
  SOCIAL_OPEN_BLOCK_LABELS,
  SOCIAL_OUTCOME_LABELS,
  SOCIAL_PAY_WORDS,
  SOCIAL_POST_BLOCK_LABELS,
  SOCIAL_PROMOTE_BLOCK_LABELS,
  SOCIAL_TONE_LABELS,
  SOCIAL_TONE_NOTES,
  socialAgeBlock,
} from '../../labels';

/** The Social screen (Batch 8): your accounts on the platforms, what you can post, and what they earn. From More (everyone) and from Work (creators). */
export function SocialScreen({ life }: { life: LifeState }) {
  const view = getSocialView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const disabled = busy || !view.canAct;
  const [tone, setTone] = useState<SocialTone>('safe');

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-labelledby="social-title" data-testid="social-summary">
        <h2 id="social-title" className="text-2xl leading-tight font-bold">
          Your accounts
        </h2>
        {view.accounts.length === 0 ? (
          <p className="mt-1 text-muted">You have no accounts yet. Open one below, with a handle you choose.</p>
        ) : (
          <p className="mt-1 text-muted" data-testid="social-reach">
            You reach {view.reachWords} across {view.accounts.length} {view.accounts.length === 1 ? 'account' : 'accounts'}.
            {view.career && ` In the career you are ${view.career.title}.`}
          </p>
        )}
        {view.minor && <p className="mt-2 text-sm">A parent keeps an eye on your accounts and signs for any deal until you are 18.</p>}
        {view.incomeThisYear > 0 && <p className="mt-2 text-sm">The platforms paid you {money(view.incomeThisYear)} this year, after any cut.</p>}
        {view.sponsor && <p className="mt-1 text-sm">Sponsored by {view.sponsor.company}.</p>}
        {view.controversy && <p className="mt-2 text-sm font-semibold">{SOCIAL_CONTROVERSY_WORDS[view.controversy]}</p>}
        {view.algorithm.map((a) => (
          <p key={a.platformName} className="mt-1 text-sm text-muted">
            {a.mood === 'up' ? `${a.platformName}'s algorithm is favouring you this year.` : `${a.platformName}'s algorithm is not favouring you this year.`}
          </p>
        ))}
        {view.inPrison && <p className="mt-2 text-sm">You cannot post from where you are.</p>}
      </Card>

      {view.accounts.length > 0 && (
        <Card role="region" aria-labelledby="tone-title">
          <h3 id="tone-title" className="text-lg font-bold">
            How you post
          </h3>
          <div role="radiogroup" aria-labelledby="tone-title" className="mt-2 flex gap-2">
            {(['safe', 'bold'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                data-testid={`tone-${t}`}
                onClick={() => setTone(t)}
                className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-semibold ${tone === t ? 'border-accent bg-accent/10' : 'border-border'}`}
              >
                {SOCIAL_TONE_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{SOCIAL_TONE_NOTES[tone]}</p>
        </Card>
      )}

      {view.last && (
        <Card role="status" data-testid="social-last">
          <p className="font-semibold">
            {SOCIAL_OUTCOME_LABELS[view.last.result.outcome]} on {view.last.platformName}
          </p>
          <p className="mt-1 text-sm">{view.last.text}</p>
          <p className="mt-1 text-sm text-muted">{view.last.result.gained.toLocaleString('en-US')} new followers.</p>
        </Card>
      )}

      {view.accounts.map((a) => (
        <AccountCard key={a.platform} account={a} tone={tone} disabled={disabled} act={act} />
      ))}

      {view.accounts.length > 1 && <CrossCard view={view} disabled={disabled} act={act} />}
      {view.collabs.people.length > 0 && <CollabCard view={view} disabled={disabled} act={act} />}
      <OpenCard view={view} disabled={disabled} act={act} />
    </div>
  );
}

type Act = (id: 'open_account' | 'close_account' | 'set_private' | 'post' | 'cross_promote' | 'collab' | 'promote_work', params?: Record<string, unknown>) => Promise<void>;

function AccountCard({ account: a, tone, disabled, act }: { account: AccountView; tone: SocialTone; disabled: boolean; act: Act }) {
  const [confirmClose, setConfirmClose] = useState(false);
  const blocked = a.postBlock !== null;
  return (
    <Card role="region" aria-labelledby={`acct-${a.platform}`} data-testid={`account-${a.platform}`}>
      <h3 id={`acct-${a.platform}`} className="text-lg font-bold">
        {a.platformName} · @{a.handle}
      </h3>
      <p className="mt-1" data-testid={`followers-${a.platform}`}>
        {a.followerWords} ({a.followersText})
      </p>
      <p className="text-sm text-muted">
        About {a.nicheName.toLowerCase()}. {a.engagementWords}.{a.private ? ' Private.' : ''}
      </p>
      <p className="mt-1 text-sm text-muted">
        {a.demonetized
          ? 'The platform has stopped paying this account for now.'
          : a.paying
            ? `The platform pays you for this account (${SOCIAL_MODEL_LABELS[a.payModel]}).`
            : (SOCIAL_PAY_WORDS[a.payModel]?.(a.threshold) ?? '')}
      </p>
      {a.paidThisYear > 0 && <p className="text-sm">It paid {money(a.paidThisYear)} this year.</p>}
      <p className="mt-2 text-sm font-semibold" data-testid={`budget-${a.platform}`}>
        {postsLeftWords(a.left, a.postNoun, a.postPlural)}
      </p>
      <Button
        block
        className="mt-2"
        disabled={disabled || blocked}
        data-testid={`post-${a.platform}`}
        onClick={() => void act('post', { platformId: a.platform, tone })}
      >
        {a.postVerb} ({a.left} left)
      </Button>
      {blocked && a.postBlock !== 'budget' && <p className="mt-1 text-sm text-muted">{SOCIAL_POST_BLOCK_LABELS[a.postBlock!]}</p>}
      {a.promoteBlock === null && (
        <Button block variant="secondary" className="mt-2" disabled={disabled} data-testid={`promote-${a.platform}`} onClick={() => void act('promote_work', { platformId: a.platform })}>
          Tell them about your work
        </Button>
      )}
      {a.promoteBlock === 'done' && <p className="mt-1 text-sm text-muted">{SOCIAL_PROMOTE_BLOCK_LABELS.done}</p>}
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" className="flex-1" disabled={disabled} data-testid={`private-${a.platform}`} onClick={() => void act('set_private', { platformId: a.platform, on: !a.private })}>
          {a.private ? 'Make public' : 'Make private'}
        </Button>
        <Button variant="ghost" className="flex-1" disabled={disabled} data-testid={`close-${a.platform}`} onClick={() => (confirmClose ? void act('close_account', { platformId: a.platform }) : setConfirmClose(true))}>
          {confirmClose ? 'Really close it' : 'Close account'}
        </Button>
      </div>
    </Card>
  );
}

function CrossCard({ view, disabled, act }: { view: SocialView; disabled: boolean; act: Act }) {
  return (
    <Card role="region" aria-labelledby="cross-title" data-testid="social-cross">
      <h3 id="cross-title" className="text-lg font-bold">
        Cross-promotion
      </h3>
      <p className="mt-1 text-sm text-muted">Point the followers of one account at another. {view.crossPromos.left} left this year.</p>
      <ul className="mt-2 flex flex-col gap-2" aria-label="Cross-promotion">
        {view.crossPromos.options.map((o) => (
          <li key={`${o.fromId}>${o.toId}`}>
            <Button block variant="secondary" disabled={disabled || o.block !== null} onClick={() => void act('cross_promote', { fromId: o.fromId, toId: o.toId })}>
              {o.label}
            </Button>
            {o.block && <p className="text-xs text-muted">{SOCIAL_CROSS_BLOCK_LABELS[o.block]}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CollabCard({ view, disabled, act }: { view: SocialView; disabled: boolean; act: Act }) {
  return (
    <Card role="region" aria-labelledby="collab-title" data-testid="social-collab">
      <h3 id="collab-title" className="text-lg font-bold">
        Make something together
      </h3>
      <p className="mt-1 text-sm text-muted">People you know who make things. {view.collabs.left} left this year.</p>
      <ul className="mt-2 flex flex-col gap-3" aria-label="Creators you know">
        {view.collabs.people.map((p) => (
          <li key={p.personId}>
            <p className="font-semibold">
              {p.name} <span className="font-normal text-muted">· {p.followerWords}</span>
            </p>
            {p.platforms.map((pl) => (
              <div key={pl.id} className="mt-1">
                <Button block variant="secondary" disabled={disabled || pl.block !== null} onClick={() => void act('collab', { platformId: pl.id, personId: p.personId })}>
                  On {pl.name}
                </Button>
                {pl.block && <p className="text-xs text-muted">{SOCIAL_COLLAB_BLOCK_LABELS[pl.block]}</p>}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OpenCard({ view, disabled, act }: { view: SocialView; disabled: boolean; act: Act }) {
  const [platform, setPlatform] = useState<string>('');
  const [niche, setNiche] = useState<string>('');
  const [handle, setHandle] = useState('');
  const [touched, setTouched] = useState(false);
  const options = view.platforms.filter((p) => p.block !== 'have');
  const chosen = view.platforms.find((p) => p.id === platform);
  const issue = touched ? handleIssue(handle, content) : null;
  const block = chosen?.block ?? null;
  const ready = chosen !== undefined && block === null && niche !== '' && handleIssue(handle, content) === null;
  if (options.length === 0) return null;
  return (
    <Card role="region" aria-labelledby="open-title" data-testid="social-open">
      <h3 id="open-title" className="text-lg font-bold">
        Open an account
      </h3>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">Platform</legend>
        <div className="mt-1 flex flex-col gap-2" role="radiogroup" aria-label="Platform">
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={platform === p.id}
              data-testid={`platform-${p.id}`}
              onClick={() => setPlatform(p.id)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left ${platform === p.id ? 'border-accent bg-accent/10' : 'border-border'}`}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="block text-sm text-muted">{p.blurb}</span>
              {p.block === 'age' && <span className="block text-xs">{socialAgeBlock(p.age)}</span>}
              {p.block && p.block !== 'age' && <span className="block text-xs">{SOCIAL_OPEN_BLOCK_LABELS[p.block as keyof typeof SOCIAL_OPEN_BLOCK_LABELS]}</span>}
            </button>
          ))}
        </div>
      </fieldset>
      <TextField
        className="mt-3"
        label="Handle"
        value={handle}
        onChange={(v) => {
          setHandle(v);
          setTouched(true);
        }}
        autoCapitalize="none"
        placeholder={view.suggestion}
        data-testid="handle-input"
        error={issue ? SOCIAL_HANDLE_ISSUES[issue] : undefined}
        hint="Letters, numbers, dots and underscores."
      />
      <Button variant="ghost" className="mt-1" onClick={() => { setHandle(view.suggestion); setTouched(true); }} data-testid="handle-suggest">
        Suggest one
      </Button>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">What it is about</legend>
        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Niche">
          {view.niches.map((n) => (
            <button
              key={n.id}
              type="button"
              role="radio"
              aria-checked={niche === n.id}
              data-testid={`niche-${n.id}`}
              onClick={() => setNiche(n.id)}
              className={`min-h-11 rounded-xl border px-3 text-sm ${niche === n.id ? 'border-accent bg-accent/10 font-semibold' : 'border-border'}`}
            >
              {n.name}
            </button>
          ))}
        </div>
      </fieldset>
      <Button
        block
        className="mt-3"
        disabled={disabled || !ready}
        data-testid="open-account"
        onClick={() => {
          void act('open_account', { platformId: platform, handle, nicheId: niche }).then(() => {
            setHandle('');
            setTouched(false);
            setPlatform('');
          });
        }}
      >
        Open the account
      </Button>
      {block && block !== 'age' && <p className="mt-1 text-sm text-muted">{SOCIAL_OPEN_BLOCK_LABELS[block as keyof typeof SOCIAL_OPEN_BLOCK_LABELS]}</p>}
    </Card>
  );
}
