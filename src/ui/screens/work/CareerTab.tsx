import { useState } from 'react';
import { content } from '../../../content';
import { getAbroadView, getBandHubView, getCharacterSummary, getHubView, getSportsView, getWorkView, type RoleRowView } from '../../../engine/selectors';
import type { CommitLevel, LifeState, RoleId } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { InteractSheet } from '../../components/InteractSheet';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionHeader } from '../../components/SectionHeader';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { CAREER_LABELS, COMMITMENT_LABELS, money, skillWord } from '../../labels';
import { AbroadCard } from './AbroadCard';
import { BandScreen } from './BandScreen';
import { BusinessCard } from './BusinessCard';
import { CrimeCard } from './CrimeCard';
import { FameScreen } from './FameScreen';
import { JobCard } from './JobCard';
import { SchoolCard } from './SchoolCard';
import { SocialCard } from './SocialCard';
import { SportsScreen } from './SportsScreen';

/** Gig work: deliveries, rides and odd jobs, as a card. */
function GigCard({ life }: { life: LifeState }) {
  const view = getWorkView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  return (
    <Card role="region" aria-labelledby="gig-title">
      <h2 id="gig-title" className="text-lg font-bold">
        Gig work
      </h2>
      <p className="mt-1 text-muted">Deliveries, rides and odd jobs. The pay is low and changes every year, but it’s always there.</p>
      <p className="mt-3" data-testid="gig-status">
        {view.gig ? 'You’re doing gig work.' : 'You’re not doing gig work.'} A typical year pays about {money(view.expectedGigPay)}.
      </p>
      {view.lastIncome > 0 && <p className="mt-1 text-sm text-muted">Last year you earned {money(view.lastIncome)} before tax.</p>}
      <Button block variant={view.gig ? 'secondary' : 'primary'} className="mt-3" disabled={busy || !view.between} onClick={() => void act(view.gig ? 'stop_gig' : 'start_gig')}>
        {view.gig ? 'Stop gig work' : 'Start gig work'}
      </Button>
    </Card>
  );
}

type Opened = RoleId | 'schedule' | 'jobs' | 'gigs' | 'education' | 'sports' | 'music' | 'acting' | 'social' | 'writing' | 'business' | 'crime' | 'abroad' | null;

/** The Schedule: your total load, what each role takes, and how hard you work at each. */
function ScheduleSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getHubView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const disabled = busy || !view.between;
  return (
    <Sheet open={open} title={CAREER_LABELS.scheduleTitle} onClose={onClose}>
      <div data-testid="schedule-sheet" className="flex flex-col gap-3">
        <StatBar label={CAREER_LABELS.load} value={Math.min(100, Math.round((view.load.total / (view.load.comfortable * 1.6)) * 100))} kind="bad" />
        <p className="text-sm" data-testid="schedule-load">
          {CAREER_LABELS.loadWords[view.loadBand]}
          {view.load.over > 0 ? ` · ${CAREER_LABELS.over(view.load.over)}` : ''}
        </p>
        <StatBar label={CAREER_LABELS.burnout} value={view.burnout} kind="bad" />
        {view.penalty > 0 && <p className="text-sm text-muted">{CAREER_LABELS.penalty(view.penalty)}</p>}
        {view.gave && view.gave.year >= life.currentYear - 1 && <p className="text-sm font-semibold">{CAREER_LABELS.gave[view.gave.what]}</p>}
        <p className="text-sm text-muted">{CAREER_LABELS.scheduleNote}</p>
        {view.roles.length === 0 && <p className="text-muted">{CAREER_LABELS.noRoles}</p>}
        <RowList label="Roles">
          {view.roles.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0" data-testid={`schedule-${r.id}`}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display truncate text-base font-semibold">{r.title || CAREER_LABELS.roleNames[r.id]}</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">{view.load.shares.find((s) => s.id === r.id)?.points ?? 0} pts</span>
              </span>
              <span role="radiogroup" aria-label={`${CAREER_LABELS.commitment}: ${CAREER_LABELS.roleNames[r.id]}`} className="flex gap-1">
                {(['back', 'steady', 'all'] as const).map((c: CommitLevel) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={r.commit === c}
                    disabled={disabled}
                    onClick={() => void act('set_role_commit', { roleId: r.id, commitment: c })}
                    data-testid={`commit-${r.id}-${c}`}
                    className={`min-h-11 flex-1 truncate rounded-xl border px-2 text-sm font-semibold disabled:opacity-60 ${r.commit === c ? 'border-accent bg-surface-2' : 'border-border'}`}
                  >
                    {COMMITMENT_LABELS[c]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </RowList>
        <h3 className="text-base font-bold">{CAREER_LABELS.skills}</h3>
        {view.skills.length === 0 ? (
          <p className="text-sm text-muted">{CAREER_LABELS.noSkills}</p>
        ) : (
          <RowList label={CAREER_LABELS.skills}>
            {view.skills.slice(0, 12).map((k) => (
              <ListRow key={k.key} title={k.label} subtitle={`${skillWord(k.level)}${CAREER_LABELS.skillLine(Math.round(k.peak), k.idle) ? ` · ${CAREER_LABELS.skillLine(Math.round(k.peak), k.idle)}` : ''}`} value={<MiniBar label={k.label} value={k.level} />} testId={`skill-${k.key}`} />
            ))}
          </RowList>
        )}
      </div>
    </Sheet>
  );
}

/** One role in "You": a row with its key bar; tapping it opens its screen. */
function roleRow(r: RoleRowView, onOpen: () => void) {
  const bar = r.bar;
  return (
    <ListRow
      key={r.id}
      icon={r.icon}
      title={r.id === 'gig' ? CAREER_LABELS.gigTitle : r.title}
      subtitle={[r.subtitle, COMMITMENT_LABELS[r.commit]].filter((x) => x).join(' · ')}
      value={bar ? <MiniBar label={CAREER_LABELS.bar[bar.key]} value={bar.value} /> : undefined}
      ending="chevron"
      onClick={onOpen}
      testId={`role-${r.id}`}
    />
  );
}

/**
 * The Career tab (C2): "You" lists every role you have, each with its one key bar, and the Schedule (your load);
 * "Find work" is jobs, part-time work, gigs and education; "Special careers" are sports, music, acting, social media,
 * writing and art, a business and crime. A tap opens the role's own screen over the tab.
 */
export function CareerTab({ life }: { life: LifeState }) {
  const hub = getHubView(life, content);
  const work = getWorkView(life, content);
  const sports = getSportsView(life, content);
  const [opened, setOpened] = useState<Opened>(null);
  const [reason, setReason] = useState<string | null>(null);
  const close = () => setOpened(null);
  // An event answers on top of everything: the screens wait behind it and come back when it is over.
  const talking = useAppStore((s) => s.interactSheet !== null);
  const idle = life.phase !== 'action' && life.phase !== 'events' && !talking;
  const openTeen = useAppStore((s) => s.openTeen);
  const enrolled = getCharacterSummary(life, content).school !== null;
  const age = life.character.age;
  const open = (id: Opened) => setOpened(id);
  const abroad = getAbroadView(life, { destinationId: '', route: 'year' }, content).oldEnough;
  const bandHub = getBandHubView(life, content);
  const specials = hub.special;
  const businessAge = content.balance.business.limits.minAge;
  const teen = age >= 14 && age < 18;
  const gigOk = work.canGig && !work.job;
  const roleSheet = (id: RoleId): Opened => (id === 'sports' ? 'sports' : id === 'fame' ? 'music' : id === 'band' ? 'band' : id);

  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="you-title" className="flex flex-col gap-1.5">
        <SectionHeader id="you-title">{CAREER_LABELS.you}</SectionHeader>
        <RowList label={CAREER_LABELS.you}>
          {hub.roles.map((r) => roleRow(r, () => open(roleSheet(r.id))))}
          <ListRow
            icon="alarm_clock"
            title={CAREER_LABELS.schedule}
            subtitle={hub.roles.length === 0 ? CAREER_LABELS.noRoles : `${CAREER_LABELS.loadWords[hub.loadBand]}${hub.load.over > 0 ? ` · ${CAREER_LABELS.over(hub.load.over)}` : ''}`}
            value={<MiniBar label={CAREER_LABELS.load} value={Math.min(100, Math.round((hub.load.total / (hub.load.comfortable * 1.6)) * 100))} kind="bad" />}
            ending="chevron"
            onClick={() => open('schedule')}
            testId="role-schedule"
          />
        </RowList>
      </section>

      <section aria-labelledby="find-title" className="flex flex-col gap-1.5">
        <SectionHeader id="find-title">{CAREER_LABELS.findWork}</SectionHeader>
        <RowList label={CAREER_LABELS.findWork}>
          <ListRow icon="briefcase" title={CAREER_LABELS.jobs.title} subtitle={work.job ? `${work.job.title} · ${work.job.employer}` : CAREER_LABELS.jobs.subtitle} ending="chevron" onClick={() => open('jobs')} testId="find-jobs" />
          <ListRow icon="alarm_clock" title={CAREER_LABELS.partTime.title} subtitle={teen ? CAREER_LABELS.partTime.subtitle : 'Teen jobs open from 14 to 17'} ending="chevron" muted={!teen} onClick={() => (teen ? openTeen() : setReason(CAREER_LABELS.partTime.closed))} testId="find-parttime" />
          <ListRow icon="money_bag" title={CAREER_LABELS.gigs.title} subtitle={gigOk || work.gig ? `${CAREER_LABELS.gigs.subtitle} · about ${money(work.expectedGigPay)} a year` : CAREER_LABELS.gigs.subtitle} ending="chevron" muted={!gigOk && !work.gig} onClick={() => (!gigOk && !work.gig ? setReason(work.job ? 'You have a full-time job, so there’s no time for gig work.' : `You can start gig work at ${work.gigMinAge}.`) : open('gigs'))} testId="find-gigs" />
          {abroad && <ListRow icon="airplane" title={CAREER_LABELS.abroad.title} subtitle={CAREER_LABELS.abroad.subtitle} ending="chevron" onClick={() => open('abroad')} testId="find-abroad" />}
          <ListRow icon="graduation_cap" title={CAREER_LABELS.education.title} subtitle={enrolled ? 'You’re enrolled' : CAREER_LABELS.education.subtitle} ending="chevron" onClick={() => open('education')} testId="find-education" />
        </RowList>
      </section>

      <section aria-labelledby="special-title" className="flex flex-col gap-1.5">
        <SectionHeader id="special-title">{CAREER_LABELS.special}</SectionHeader>
        <RowList label={CAREER_LABELS.special}>
          {specials.map((s) => {
            const closed = s.id === 'business' ? age < businessAge : !s.open;
            const subtitle =
              s.id === 'sports' && sports.active && sports.sport
                ? sports.sport.name
                : s.id === 'music' && bandHub.has
                  ? life.fame.band!.name
                  : CAREER_LABELS.specialSubtitles[s.id];
            return <ListRow key={s.id} icon={s.icon} title={CAREER_LABELS.specials[s.id]} subtitle={closed ? CAREER_LABELS.closed : subtitle} ending="chevron" muted={closed} onClick={() => (closed ? setReason(CAREER_LABELS.closedAge(s.id === 'business' ? businessAge : s.minAge)) : open(s.id))} testId={s.id === 'sports' ? 'sports-open' : s.id === 'music' ? 'fame-open' : `special-${s.id}`} />;
          })}
        </RowList>
      </section>

      {/* The Talk buttons on the school and job cards open the interaction menu here. */}
      <InteractSheet life={life} />

      <Sheet open={idle && reason !== null} title={CAREER_LABELS.closed} onClose={() => setReason(null)}>
        <p role="status" data-testid="closed-reason">
          {reason}
        </p>
      </Sheet>
      <ScheduleSheet life={life} open={idle && opened === 'schedule'} onClose={close} />
      <Sheet open={idle && (opened === 'school' || opened === 'education')} title={CAREER_LABELS.education.title} onClose={close}>
        <SchoolCard life={life} />
      </Sheet>
      <Sheet open={idle && (opened === 'job' || opened === 'jobs')} title={CAREER_LABELS.jobs.title} onClose={close}>
        <JobCard life={life} />
      </Sheet>
      <Sheet open={idle && (opened === 'gig' || opened === 'gigs')} title={CAREER_LABELS.gigTitle} onClose={close}>
        <GigCard life={life} />
      </Sheet>
      <Sheet open={idle && (opened === 'abroad')} title={CAREER_LABELS.abroad.title} onClose={close}>
        <AbroadCard life={life} />
      </Sheet>
      <Sheet open={idle && (opened === 'business')} title={CAREER_LABELS.specials.business} onClose={close}>
        <BusinessCard life={life} />
      </Sheet>
      <Sheet open={idle && (opened === 'crime')} title={CAREER_LABELS.specials.crime} onClose={close}>
        <CrimeCard life={life} />
      </Sheet>
      <Sheet open={idle && (opened === 'social')} title={CAREER_LABELS.specials.social} onClose={close}>
        <SocialCard life={life} />
      </Sheet>
      <SportsScreen life={life} open={idle && opened === 'sports'} onClose={close} />
      <FameScreen life={life} open={idle && (opened === 'music' || opened === 'acting' || opened === 'writing')} onClose={close} />
      <BandScreen life={life} open={idle && opened === 'band'} onClose={close} />
    </div>
  );
}
