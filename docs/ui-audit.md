# UI audit (U2)

What the tightening pass (stage U2, `docs/careers-crime-and-ui.md`) changed, screen by screen, and where every action of the game lives now. The density rules are in `AGENTS.md` and the sizes are tokens in `src/ui/theme/tokens.css`.

## The density rules, as built

| Rule | Where it lives |
|---|---|
| Rows are about 56px (`--wl-row-h`), 28px icon, 16px title, one-line 13px subtitle | `ListRow`, `RowList` (`src/ui/components/ListRow.tsx`) |
| A chevron opens a new screen; three dots open a quick action sheet | `ListRow` `ending`, `ActionSheet` |
| Sticky section headers, about 28px (`--wl-section-h`) | `SectionHeader` |
| In-screen tabs on a screen with more than two sections or about 12 rows | `SegmentedTabs` |
| Collapsible groups that remember if they are open | `CollapsibleGroup`, `WayRow`; saved in the settings (`settings.openGroups`, `src/persistence/settings.ts`) |
| Bottom sheets for actions and confirmations | `Sheet`, `ActionSheet`, `ConfirmSheet` |
| At most two levels of menus below a tab | Tab → category → activity (a sheet, or the page it links to) |
| Inline summaries | `MiniBar` (a stat bar in a row), a count of times done this year, a price, a net worth |
| Cards are tighter | `Card` padding 16px → 12px, for every screen |

## Screens

"Converted" means rebuilt on the shared row, tab and group components. "Tightened" means it picked up the smaller `Card` and the new sticky headers or `WayRow` density but keeps its layout. "Not changed" is said plainly: those screens still use the U1 layout and are the next candidates.

| Screen | Status | What moved, grouped or became a tab |
|---|---|---|
| Activities tab | Converted | One long list of groups and "More ways" became a list of up to 14 categories (12 for most lives: "Do your own thing" waits for a model, and Luxury for a net worth), each opening a submenu with Activities and Shopping sections. "Everything else", "Plan a trip", "Move abroad", "Social media" and "Teen years" no longer sit under a heading of their own: each is an activity in a category |
| Activity sheet (options of one activity) | Tightened | The notes that used to head a category on the old Leisure page (crime, the black market, gambling, lawsuits, names, loans) now head the sheet of the activity they belong to |
| People tab | Converted | Collapsible groups (Love, Parents, Siblings, Other family, Children, Grandchildren, Friends, School, Work, Pets, Late relationships) with a count, sticky headers, 56px rows with a 40px portrait and an affection bar. Late relationships start closed. The Groups button is gone (it moved to Activities → Groups and Faith); Family is one row |
| A person's page | Converted | Header (portrait, name, relationship, mood, both bars) and tabs: **Overview** (child details, their life, who they know), **Interact** (the Interact button, actions, god mode edit) and **History** (memories, what you have heard). It opens on Interact when there is something to do |
| A pet's page | Not changed | |
| Assets tab | Converted | Three tabs: **Money** (the finances, unchanged), **Home** (where you live, vacation homes, Properties), **Things** (possessions with a condition bar or a value, Go shopping, Your will) |
| Job / School tab | Tightened | "Ways to work" and "Special careers" use the sticky header; every way is a 56px row that remembers if it is open. The job and school cards are unchanged (the Career hub is stage C2) |
| Groups page (was More → Groups) | Converted | Opens on the part you chose from Activities: Clubs and hobby groups, Volunteering and causes, Neighborhood and civic groups, Your faith community, or Explore other faiths. Tabs **Yours** and **Join/Explore**, rows with a three-dot sheet. Faith adds the belief and values card. Groups you left are a closed collapsible group |
| Home tab, stat panel, life log | Tightened | `Card` padding only |
| Money (inside Assets → Money), Properties, Possessions, Will, Later life, Family, Health, Teen years, Trips, Move abroad, Social media, Business | Tightened | `Card` padding only. These are the longest pages left; they are not yet tabs |
| Event card, interaction sheet, profile, menu, settings, archive, life history, death, funeral, creation, god mode editor, event sandbox | Not changed | |

## Where each action lives

Every leisure and self activity (`src/content/pastimes`) now names an activity of the hub; the content build refuses one that does not, so none can be orphaned. The old "Leisure and self" page (More → Activities, "Everything else") is gone.

| Category | Activities | Shopping |
|---|---|---|
| Featured | Do your own thing (when a model is connected) | |
| Health | Doctor, Emergency room, Eye doctor, Dentist, Therapist (opens Health), Alternative medicine, Donate blood or plasma, Cosmetic surgeon | |
| Recovery | Support group, Rehab center (both only with an addiction), Counseling | |
| Mind & body | Gym, Walk, Meditate, Yoga, Read | |
| Outdoors | Hike, Fish, Camp, Birdwatch, Swim or snorkel, Off-road (needs a vehicle), Garden and picnic | Outdoor gear, Off-road vehicles (opens Possessions) |
| Social & love | Dating, Nightlife, Parties, Social media | |
| Groups | Clubs and hobby groups, Volunteering and causes, Neighborhood and civic groups | |
| Faith | Your faith community, Explore other faiths | |
| Leisure | Vacation (with Plan a longer trip inside), Salon & spa, Hobbies, Movie theater, Pets (opens Possessions) | |
| Money & luck | Lottery, Casino, Loans | Stores, Fine goods |
| Black market | The market | |
| Crime | Crimes | |
| Law & life | Lawsuits, Change your name, Move abroad and citizenship, Teen years | |
| Luxury (net worth threshold, gold) | VIP events, Luxury spa, Private societies, Charity donations | Luxury cars, Boats and yachts, Aircraft, Jewelry, Private islands |

Things that had no home in the plan's table, and where they went:

| Had no home | Now |
|---|---|
| Movies | Leisure → Movie theater |
| Plastic surgery | Health → Cosmetic surgeon |
| Loans | Money & luck → Loans |
| Lawsuits, legal name changes | New category **Law & life** (not in the plan's table) |
| Move abroad and citizenship, Teen years | Law & life |
| Social media | Social & love |
| Pets | Leisure → Pets (a link to Possessions, where adopting and caring already are) |
| The black market's goods | Black market. The plan says D1 adds this category; the goods already existed, so the category is here now and D1 extends it |
| The fine goods (a suit, a watch, a painting) | Money & luck → Shopping → Fine goods. Only the jewelry, yachts and the new cars, aircraft and islands are Luxury |

Actions that are not leisure activities (jobs, school, money, housing, family, teen, fame, sports, social, crime, business, estate, travel and languages) are reached from their own screens as before. `tools` checked every life action id against the UI: 152 of 154 appear by name in `src/ui` or `src/store`; `study_abroad` and `work_abroad` are built from the route chosen on the Time abroad card (Job → Ways to work).

## Clutter fixed

- The Activities tab was one scroll of five groups, 14 activity rows of 56px plus a "More ways" block of 5 more; it is now a list of 12 category rows.
- The People tab was a stack of full cards with two bars per person and two large buttons; it is now collapsible groups with one bar per person.
- A person's page was one scroll of up to eight cards; it is now three tabs.
- Assets was one scroll of finances, properties and possessions; it is now three tabs.
