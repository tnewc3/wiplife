import { useState } from 'react';
import { content } from '../../../content';
import { getAbroadView, getBandHubView, getCharacterSummary, getHubView, getSportsView, getWorkView, type RoleRowView } from '../../../engine/selectors';
import type { LifeState, RoleId } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ActionTile, ActionTileRow } from '../../components/ActionTile';
import { FeatureScreen } from '../../components/FeatureScreen';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { Icon } from '../../components/Icon';
import { InteractSheet } from '../../components/InteractSheet';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionHeader } from '../../components/SectionHeader';
import { Sheet } from '../../components/Sheet';
import { CAREER_LABELS, COMMITMENT_LABELS, money } from '../../labels';
import { AbroadCard } from './AbroadCard';
import { BandScreen } from './BandScreen';
import { CrimeCard } from './CrimeCard';
import { OrganizationScreen } from '../org/OrganizationScreen';
import { DealingSheet } from '../drugs/DealingSheet';
import { BusinessScreen } from './BusinessScreen';
import { FameScreen } from './FameScreen';
import { JobCard } from './JobCard';
import { SchoolCard } from './SchoolCard';
import { ScheduleScreen } from './ScheduleScreen';
import { SportsScreen } from './SportsScreen';

/** Gig work (U3): a feature screen with your typical year and one tile to start or stop. */
function GigScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getWorkView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  return (
    <FeatureScreen open={open} title={CAREER_LABELS.gigTitle} onBack={onClose} info={<p>Deliveries, rides and odd jobs. The pay is low and changes every year, but it’s always there.</p>} testId="gig-screen">
      <HeroCard lead={<Icon id="money_bag" size={44} />} title={CAREER_LABELS.gigTitle} status={view.gig ? 'You’re doing gig work.' : 'You’re not doing gig work.'}>
        <StatCell label="A typical year" value={money(view.expectedGigPay)} />
        {view.lastIncome > 0 && <StatCell label="Last year" value={money(view.lastIncome)} sub="before tax" />}
      </HeroCard>
      <p className="sr-only" data-testid="gig-status">
        {view.gig ? 'You’re doing gig work.' : 'You’re not doing gig work.'} A typical year pays about {money(view.expectedGigPay)}.
      </p>
      <ActionTileRow>
        <ActionTile label={view.gig ? 'Stop gig work' : 'Start gig work'} icon="money_bag" tone="money" status={view.gig ? 'Working' : 'Ready'} disabled={busy || !view.between} onClick={() => void act(view.gig ? 'stop_gig' : 'start_gig')} testId="gig-toggle" />
      </ActionTileRow>
    </FeatureScreen>
  );
}

type Opened = RoleId | 'schedule' | 'jobs' | 'gigs' | 'education' | 'sports' | 'music' | 'acting' | 'social' | 'writing' | 'business' | 'crime' | 'drugs' | 'abroad' | null;

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
  const openSocial = useAppStore((s) => s.openSocial);
  const enrolled = getCharacterSummary(life, content).school !== null;
  const age = life.character.age;
  const open = (id: Opened) => setOpened(id);
  const abroad = getAbroadView(life, { destinationId: '', route: 'year' }, content).oldEnough;
  const bandHub = getBandHubView(life, content);
  const specials = hub.special;
  const businessAge = content.balance.business.limits.minAge;
  const teen = age >= 14 && age < 18;
  const gigOk = work.canGig && !work.job;
  const roleSheet = (id: RoleId): Opened => (id === 'sports' ? 'sports' : id === 'fame' ? 'music' : id === 'band' ? 'band' : id === 'dealing' ? 'drugs' : id);

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
            return <ListRow key={s.id} icon={s.icon} title={CAREER_LABELS.specials[s.id]} subtitle={closed ? CAREER_LABELS.closed : subtitle} ending="chevron" muted={closed} onClick={() => (closed ? setReason(CAREER_LABELS.closedAge(s.id === 'business' ? businessAge : s.minAge)) : s.id === 'social' ? openSocial() : open(s.id))} testId={s.id === 'sports' ? 'sports-open' : s.id === 'music' ? 'fame-open' : `special-${s.id}`} />;
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
      <ScheduleScreen life={life} open={idle && opened === 'schedule'} onClose={close} />
      <FeatureScreen open={idle && (opened === 'school' || opened === 'education')} title={CAREER_LABELS.education.title} onBack={close} testId="education-screen">
        <SchoolCard life={life} />
      </FeatureScreen>
      <FeatureScreen open={idle && (opened === 'job' || opened === 'jobs')} title={CAREER_LABELS.jobs.title} onBack={close} testId="jobs-screen">
        <JobCard life={life} />
      </FeatureScreen>
      <GigScreen life={life} open={idle && (opened === 'gig' || opened === 'gigs')} onClose={close} />
      <FeatureScreen open={idle && opened === 'abroad'} title={CAREER_LABELS.abroad.title} onBack={close} testId="abroad-screen">
        <AbroadCard life={life} />
      </FeatureScreen>
      <BusinessScreen life={life} open={idle && opened === 'business'} onClose={close} />
      <FeatureScreen open={idle && opened === 'crime' && life.crime.crew === null} title={CAREER_LABELS.specials.crime} onBack={close} testId="crime-screen">
        <CrimeCard life={life} />
      </FeatureScreen>
      <OrganizationScreen life={life} open={idle && opened === 'crime' && life.crime.crew !== null} onClose={close} />
      <DealingSheet life={life} open={idle && (opened === 'drugs' || opened === 'dealing')} onClose={close} />
      <SportsScreen life={life} open={idle && opened === 'sports'} onClose={close} />
      <FameScreen life={life} open={idle && (opened === 'music' || opened === 'acting' || opened === 'writing')} onClose={close} />
      <BandScreen life={life} open={idle && opened === 'band'} onClose={close} />
    </div>
  );
}
