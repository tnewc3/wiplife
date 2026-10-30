import { useState } from 'react';
import { content } from '../../../content';
import type { ActivityLink } from '../../../content/schemas';
import { getActivityTabView, type ActivityCategoryView, type ActivityHubView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { ListRow, RowList } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { ACTIVITY_TAB_LABELS, HUB_BLOCK_WORDS } from '../../labels';

/** Why an activity is greyed out. */
function blockWords(block: NonNullable<ActivityHubView['block']>): string {
  if (block.reason === 'age') return HUB_BLOCK_WORDS.age(block.minAge);
  return HUB_BLOCK_WORDS[block.reason];
}

/** The categories you can see: "Do your own thing" is on the tab only when a model is connected (X1), and a category with nothing else in it goes with it. */
function visibleCategories(categories: ActivityCategoryView[], modelConnected: boolean): ActivityCategoryView[] {
  return categories
    .map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, activities: s.activities.filter((a) => a.kind !== 'own_thing' || modelConnected) })).filter((s) => s.activities.length > 0) }))
    .filter((c) => c.sections.length > 0);
}

/**
 * The Activities tab (U2): a list of categories, each opening its own submenu. A category appears only when it applies to you
 * (old enough, rich enough for Luxury, with something to do). Luxury is drawn in gold.
 */
export function ActivitiesTab({ life }: { life: LifeState }) {
  const modelConnected = useAppStore((s) => s.modelConnected);
  const category = useAppStore((s) => s.activityCategory);
  const openCategory = useAppStore((s) => s.openActivityCategory);
  const view = getActivityTabView(life, content);
  const categories = visibleCategories(view.categories, modelConnected);
  const open = categories.find((c) => c.id === category);
  if (open) return <CategoryScreen category={open} canAct={view.canAct} />;

  const regular = categories.filter((c) => c.accent === null);
  const gold = categories.filter((c) => c.accent === 'gold');
  return (
    <div className="flex flex-col gap-3" data-testid="activities-hub">
      {!view.canAct && <p className="text-sm text-muted">{HUB_BLOCK_WORDS.busy}</p>}
      <RowList label="Activity categories">
        {regular.map((c) => (
          <ListRow key={c.id} icon={c.icon} title={c.label} subtitle={c.subtitle} value={ACTIVITY_TAB_LABELS.categoryCount(c.open, c.total)} ending="chevron" onClick={() => openCategory(c.id)} testId={`activities-category-${c.id}`} />
        ))}
      </RowList>
      {gold.length > 0 && (
        <RowList label="Luxury" gold>
          {gold.map((c) => (
            <ListRow key={c.id} icon={c.icon} title={c.label} subtitle={c.subtitle} gold ending="chevron" onClick={() => openCategory(c.id)} testId={`activities-category-${c.id}`} />
          ))}
        </RowList>
      )}
    </div>
  );
}

/** What a `link` activity opens: a page that already does the job. */
function useLink(): (opens: ActivityLink) => void {
  const openGroups = useAppStore((s) => s.openGroups);
  const openHealth = useAppStore((s) => s.openHealth);
  const openMigration = useAppStore((s) => s.openMigration);
  const openSocial = useAppStore((s) => s.openSocial);
  const openTeen = useAppStore((s) => s.openTeen);
  const openBelongings = useAppStore((s) => s.openBelongings);
  return (opens) => {
    switch (opens) {
      case 'club':
      case 'service':
      case 'civic':
      case 'faith':
      case 'faith_explore':
        return openGroups(opens);
      case 'therapy': return openHealth();
      case 'migration': return openMigration();
      case 'social': return openSocial();
      case 'teen': return openTeen();
      case 'pets':
      case 'vehicles': return openBelongings();
    }
  };
}

/** One category's submenu: its Activities and Shopping sections, a row for each activity. A closed one is greyed out, and tapping it says why. */
function CategoryScreen({ category, canAct }: { category: ActivityCategoryView; canAct: boolean }) {
  const openActivity = useAppStore((s) => s.openActivity);
  const follow = useLink();
  const [explain, setExplain] = useState<string | null>(null);
  const gold = category.accent === 'gold';
  return (
    <div className="flex flex-col gap-3" data-testid={`activities-category-screen-${category.id}`}>
      {!canAct && <p className="text-sm text-muted">{HUB_BLOCK_WORDS.busy}</p>}
      {gold && <p className="text-sm text-gold">{ACTIVITY_TAB_LABELS.luxuryNote}</p>}
      {category.sections.map((section) => (
        <section key={section.id} aria-label={ACTIVITY_TAB_LABELS.sections[section.id]} data-testid={`activities-section-${category.id}-${section.id}`}>
          {category.sections.length > 1 && <SectionHeader>{ACTIVITY_TAB_LABELS.sections[section.id]}</SectionHeader>}
          <RowList label={ACTIVITY_TAB_LABELS.sections[section.id]} gold={gold}>
            {section.activities.map((a) => (
              <ActivityRow
                key={a.id}
                a={a}
                gold={gold}
                explaining={explain === a.id}
                onOpen={() => {
                  if (a.block) setExplain(explain === a.id ? null : a.id);
                  else if (a.opens) follow(a.opens);
                  else openActivity(a.id);
                }}
              />
            ))}
          </RowList>
        </section>
      ))}
    </div>
  );
}

function ActivityRow({ a, gold, explaining, onOpen }: { a: ActivityHubView; gold: boolean; explaining: boolean; onOpen: () => void }) {
  const done = a.kind === 'options' || a.kind === 'vacation' || a.kind === 'hobbies' ? (a.count > 0 ? `${a.count}/${a.limit}` : undefined) : undefined;
  return (
    <>
      {/* A link opens a page (a chevron); everything else opens a bottom sheet of options (three dots). */}
      <ListRow icon={a.icon} title={a.label} subtitle={a.subtitle} value={done} gold={gold} ending={a.opens ? 'chevron' : 'dots'} muted={a.block !== null} onClick={onOpen} onMore={onOpen} moreLabel={`Options for ${a.label}`} testId={`activity-hub-${a.id}`} moreTestId={`activity-hub-more-${a.id}`} />
      {explaining && a.block && (
        <li className="px-3 py-2 text-sm" data-testid={`activity-hub-why-${a.id}`} role="status">
          {blockWords(a.block)}
        </li>
      )}
    </>
  );
}
