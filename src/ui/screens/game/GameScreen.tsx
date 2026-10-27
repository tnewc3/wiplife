import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import type { LifeState } from '../../../engine/types';
import { getCharacterSummary } from '../../../engine/selectors';
import { content } from '../../../content';
import { useAppStore, type TabId } from '../../../store/appStore';
import { EventSheet } from '../../components/EventSheet';
import { GameNav } from '../../components/GameNav';
import { InteractionCard } from '../../components/InteractionCard';
import { LegalBanner } from '../../components/LegalBanner';
import { TAB_LABELS } from '../../labels';
import { ActivitiesTab } from '../activities/ActivitiesTab';
import { AssetsTab } from '../assets/AssetsTab';
import { HomeHeader } from '../home/HomeHeader';
import { HomeTab } from '../home/HomeTab';
import { MenuSheet } from '../home/MenuSheet';
import { ProfileSheet } from '../home/ProfileSheet';
import { StatPanel } from '../home/StatPanel';
import { BelongingsScreen } from '../more/BelongingsScreen';
import { FamilyScreen } from '../more/FamilyScreen';
import { GroupsScreen } from '../more/GroupsScreen';
import { HealthScreen } from '../more/HealthScreen';
import { HousingScreen } from '../more/HousingScreen';
import { LaterScreen } from '../more/LaterScreen';
import { MigrationScreen } from '../more/MigrationScreen';
import { ActivitiesScreen } from '../more/ActivitiesScreen';
import { SocialScreen } from '../more/SocialScreen';
import { TeenScreen } from '../more/TeenScreen';
import { TravelScreen } from '../more/TravelScreen';
import { WillScreen } from '../more/WillScreen';
import { PeopleTab } from '../people/PeopleTab';
import { PersonScreen } from '../people/PersonScreen';
import { PetScreen } from '../people/PetScreen';
import { WorkTab } from '../work/WorkTab';

/** The pages that open over a tab (Assets → Properties, Profile → Health, Activities → Trips...), by the store's moreView. */
const PAGE_TITLES = {
  travel: 'Plan a trip',
  migration: 'Move abroad',
  home: 'Properties',
  health: 'Health',
  family: 'Family',
  will: 'Your will',
  later: 'Later life',
  belongings: 'Possessions',
  groups: 'Groups',
  teen: 'Teen years',
  pastimes: 'Leisure and self',
  social: 'Social media',
} as const;

function PageHeader({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <header className="pt-safe px-safe flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-surface-2">
      <button type="button" onClick={onBack} aria-label={backLabel} className="-ml-2 flex size-11 items-center justify-center rounded-full text-link active:bg-surface">
        <ChevronLeft aria-hidden="true" size={28} />
      </button>
      <h1 className="font-display truncate py-3 text-xl font-semibold">{title}</h1>
    </header>
  );
}

/** The in-game layout (U1): a header, the page, and at the bottom the tabs around the Age button (and on Home the stat panel). */
export function GameScreen({ life }: { life: LifeState }) {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const personId = useAppStore((s) => s.personId);
  const closePerson = useAppStore((s) => s.closePerson);
  const moreView = useAppStore((s) => s.moreView);
  const closeHome = useAppStore((s) => s.closeHome);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const enrolled = getCharacterSummary(life, content).school !== null;
  const tabTitle = (id: TabId) => (id === 'work' ? (enrolled ? TAB_LABELS.school : TAB_LABELS.job) : TAB_LABELS[id]);

  const person = tab === 'people' && personId !== null && life.people[personId] ? personId : null;
  const pet = tab === 'people' && personId !== null && life.possessions.items.some((p) => p.id === personId && p.kind === 'pet') ? personId : null;

  let header;
  if (person || pet) header = <PageHeader title="People" onBack={closePerson} backLabel="Back to People" />;
  else if (moreView) header = <PageHeader title={PAGE_TITLES[moreView]} onBack={closeHome} backLabel={`Back to ${tabTitle(tab)}`} />;
  else if (tab === 'home') header = <HomeHeader life={life} onMenu={() => setMenuOpen(true)} onProfile={() => setProfileOpen(true)} />;
  else header = <PageHeader title={tabTitle(tab)} onBack={() => setTab('home')} backLabel="Back to Home" />;
  const home = tab === 'home' && !moreView && !person && !pet;

  const page = moreView ? (
    {
      travel: <TravelScreen life={life} />,
      migration: <MigrationScreen life={life} />,
      home: <HousingScreen life={life} />,
      health: <HealthScreen life={life} />,
      family: <FamilyScreen life={life} />,
      will: <WillScreen life={life} />,
      later: <LaterScreen life={life} />,
      belongings: <BelongingsScreen life={life} />,
      groups: <GroupsScreen life={life} />,
      teen: <TeenScreen life={life} />,
      pastimes: <ActivitiesScreen life={life} />,
      social: <SocialScreen life={life} />,
    }[moreView]
  ) : tab === 'home' ? (
    <HomeTab life={life} />
  ) : tab === 'people' ? (
    person ? (
      <PersonScreen key={person} life={life} personId={person} />
    ) : pet ? (
      <PetScreen key={pet} life={life} petId={pet} />
    ) : (
      <PeopleTab life={life} />
    )
  ) : tab === 'work' ? (
    <WorkTab life={life} />
  ) : tab === 'assets' ? (
    <AssetsTab life={life} />
  ) : (
    <ActivitiesTab life={life} />
  );

  return (
    <div className="flex h-dvh w-full justify-center bg-bg">
      <div className="flex h-full w-full max-w-lg flex-col md:border-x md:border-border">
        {header}
        <main className="px-safe min-h-0 flex-1 overflow-y-auto py-4" data-testid="game-main">
          <LegalBanner life={life} />
          {page}
          <EventSheet life={life} />
          <InteractionCard life={life} />
        </main>
        <div className="shrink-0">
          <GameNav />
          {home && <StatPanel life={life} />}
        </div>
      </div>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <ProfileSheet life={life} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
