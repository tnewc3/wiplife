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

## C2: the Career hub

| Screen | Before | Now |
|---|---|---|
| Job tab | A stack of cards (school, job, ways to work, special careers) | **Career** tab: **You** (one 56px row per role with its key bar and a chevron), the **Schedule** row (load bar), **Find work** (Jobs, Part-time, Gigs, Education) and **Special careers** (Sports, Music, Acting, Social media, Writing & art, Business, Crime). Each row opens the role's own screen over the tab |
| Schedule | None | A sheet with the total load, burnout, what each role takes and the commitment (holding back, steady, all in) per role, and your skills with their peaks |
| Sports screen | One long scroll of 14 sections | Tabs **Overview / Season / League / History**. Overview starts with four rows (role with Greatness, team with strength, contract, agent) and the rest in collapsible groups that remember if they are open (position and team, try out or switch, practice, contract and agent, commitment, performance enhancers, retire). League is a table of jerseys and strength bars. History is one compact row per season, a tap shows its summary |
| Band (was a section of the Fame screen) | Members, rename, recruit, leave, shows and releases mixed into the Fame scroll | Its own screen with tabs **Overview / Members / Releases / Shows**; the Fame screen keeps a single row that opens it |
| Training | A silent number change | A 2–3 second card (skippable, instant with reduced motion) after practice, training, rehearsal, studying and the gym |
| Gig work, Business, Time abroad cards | Expandable "ways" rows | Sheets opened from Find work and Special careers. **Time abroad** is a row under Find work |
| Modeling | Listed in the plan | Not a career in the game (E6b has no modeling path), so there is no row |

## D1: drugs

| Screen | Before | Now |
|---|---|---|
| Activities → Black market | **The market**: a sheet with three drug goods mixed in with papers and stolen goods | **Drug market** (a page: tabs **Buy** and **Stash**; a drug is a 56px row with its price range and the law's view of it; a row's three dots open the buy sheet with the sources and amounts), and **The market** keeps its other goods |
| Activities → Recovery | Support group, Rehab center, Counseling (each hidden while nothing was wrong) | The same three, plus **Your recovery** (a page: one row per habit with a dependence bar, years clean and a Quit button; hidden until you have used something) |
| Career → Special careers | Sports, Music, Acting, Social media, Writing & art, Business, Crime | Adds **Dealing** (adults), which opens a sheet with tabs **Overview** (customers, standing, heat, dirty money, price and stock) and **Production** (the grow operations and labs you run, and the ones you can set up) |
| Career → You | A row per role | A **Dealing** row appears once you deal or run an operation, with its standing bar |
| Schedule | Eight roles | Nine: **Dealing** takes load like any other role |

## O1: organized crime

| Screen | Before | Now |
|---|---|---|
| Career → Special careers → Crime | A sheet with the crime card (crew, rank, standing, heat, people) | In an organization the row opens the **Organization** screen with in-screen tabs **Overview / Members / Territory / Rivals** (no more than two levels below the tab: row, then a bottom sheet of actions). Without one it still opens the crime card. |
| Overview | n/a | Two row lists (the organization, your place) with 56px rows; the last year's results and the code are collapsible groups that remember if they are open. Your cut and an informant end in three dots (quick action sheet). |
| Members | The crime card listed names | One 56px row per member (name, rank, job, skill word, loyalty bar); three dots open an action sheet (give a job, promote, put in line, cut loose with a confirm sheet); the job choice is a second bottom sheet. |
| Territory | n/a | One row per neighborhood (holder, income word, attention word, attention bar); three dots on a neighborhood you do not hold order an attack. |
| Rivals | n/a | One row per organization (kind, status, attitude word, strength bar); three dots offer a truce or an alliance, or make a cartel your supplier. |
| God mode → Career | Sports, music, fame | Adds **Crime** (rank, standing, heat, dirty money, your cut, each member's skill and loyalty, end a war). |

## G1: mini-games

| Screen | Before | Now |
|---|---|---|
| Event card | A choice with a chance check resolved at once | A choice that carries a mini-game (a sports big moment, a heist, a run) shows a second line, "A quick game. Play it, or let Auto play.", and opens the mini-game sheet. Choices without a game are unchanged. |
| Activities → Casino (blackjack, slots), Crime (burglary) | One button per stake or option that resolved at once | The same buttons, with the same line under the blurb; they open the mini-game sheet, and the result comes back with the same stake, quality and companion choices. The receipt is unchanged. |
| Mini-game sheet (new) | n/a | A bottom sheet over the screen (one level, not a menu): title, one line of how to play, your skill as a bar with its percentage, the game, then how you did (a word, the accuracy and what it does to the odds) and **Continue**. **Auto** and **Not now** sit at the bottom from the first moment (44px or taller). With reduced motion the game is slower and Auto is the primary button. |

## U3: the feature screen overhaul

The plan is `docs/ui-overhaul.md`. U3 changes how every screen below a tab is built, not what it does: no game logic, content effect or balance changed (one new balance number: `confirm` in `balance/activities.yaml`, the share of your savings above which a purchase asks first).

### The templates

| Template | Components (`src/ui/components`) | What it is |
|---|---|---|
| **Feature screen** | `FeatureScreen`, `ScreenHeader`, `HeroCard`, `StatCell`, `ActionTile`, `ActionTileRow`, `SegmentedTabs` (`sticky`), `SectionLabel`, `CompactRow`, `CompactList`, `OverflowMenu`, `InfoSheet`, `RenameDialog`, `EmptyState` | A full screen over the tab (it slides in from the right, a back button, swiping right from the left edge goes back, Escape goes back): a header with back, the title (it wraps, it never truncates), ⓘ (the rules, in a sheet) and ⋯ (secondary and destructive actions, in a sheet, with a confirmation when they can't be undone); a hero card with 2 or 3 stat cells; up to four action tiles; sticky tabs only when needed |
| **Option picker sheet** | `OptionPickerSheet`, `OptionCard`, `EffectChip`, `FactChip`, `FreshnessPips` | One quick decision: a header with the icon, the title, one line, the balance and the freshness; a card for each option (the whole card is the button) with effect chips and a price chip. Holds no tabs, accordions, text fields or other sheets |
| **Store** | `StoreScreen`, `ItemCard`, `ItemDetailSheet`, `FilterChips` | A feature screen with the balance, filter chips and a two-column grid; a card opens a detail sheet with Buy (or Sell when you own it) |
| **Join list** | `JoinCard`, `FilterChips` | Tabs Yours and Join, filter chips by kind, cards with fact chips and an inline Join button, "Show N more"; in Yours a card opens the group's own feature screen |
| **Choice chips** | `ChipSelect`, `FilterChips` | Replaces every dropdown: a label and chips |

Effect chips are read from the option's tiers in content (`src/ui/screens/activities/effectChips.ts`), so they cannot drift from what happens. Freshness pips come from the existing diminishing-returns counters (times done this year, and the most; `components/freshness.ts`). A press state (`wl-press`: a slight scale and darkening) and a light haptic (`src/ui/haptics.ts`) are on every tile, card and chip that acts.

### Screens and the template each now uses

| Screen | Template | What changed |
|---|---|---|
| Career → Schedule | Feature screen | Was a sheet. The one place where commitment (holding back, steady, all in) is set; load and burnout in the hero; the rules behind ⓘ |
| Career → Sports | Feature screen | Was a sheet with four tabs and seven accordions. Hero (role, team; Greatness, Standing, Record); tiles Practice, Try out, Contract (or Offers while there are scholarship offers) and Recover (only when hurt); tabs Season, League, History. Practice, Try out, Position, Contract and Offers are option picker sheets. Switch sport (young players), Quit, Request a trade, Performance enhancers, Leave your team and Retire are in ⋯. Fame, image and fan bars show only once fame is above zero; contract, agent and deal rows only when there is one. Commitment moved to the Schedule |
| Career → Music / Acting / Writing & art (Fame) | Feature screen | Was a sheet with one long scroll. Hero (rung; fame and fans once there is any); tiles Write, Band, Agent, Scene; tabs Career, Releases and (once you are known) Fame. Break the contract, part with the agent, drop the project and step away are in ⋯ |
| Band | Feature screen | Was a sheet with four tabs and a rename text box. Hero (genre and members; Strength, Chemistry, Buzz); tiles Rehearse, Write, Play a show; tabs Members, Music, Shows. An open spot shows "Keys · Open spot" with an Audition button that opens a sheet of candidate cards. Rename (a dialog), Go solo and Leave are in ⋯. Without a band: tile Start a band, and join cards for the bands that want you |
| Shows, tours, sound, practice (inside Fame and Band) | Rows and option pickers | The genre and instrument dropdowns are pickers |
| Line up a project | Option picker sheet | The title and the track titles are dialogs; the genre is chips; the press run is a toggle chip |
| Organization (O1) | Feature screen | Was a sheet with four tabs. Hero (Rank, Respect, Heat); tiles Assign jobs, Your cut, Informant (only for the leader, and only while there is one); tabs Members, Territory, Rivals. The record, the year's results and the code are plain lists and ⓘ |
| Dealing | Feature screen | Was a sheet. Hero (Standing, Heat, Dirty money); tiles Start selling or Price, and Set up; tabs Overview, Stock, Production. Stop selling is in ⋯ |
| Business | Feature screen | Was a sheet over a card. Hero for the business you pick (chips when you own several); tiles Start one and For sale; tabs Report, Products, Team, Places, Franchise. Sell it and Close it are in ⋯ and ask first. The decision hints are behind ⓘ. The start sheet names the business in a dialog and picks the city with chips |
| Jobs, Education, Gigs, Time abroad, Crime (no crew) | Feature screen | Were sheets. Gigs and Time abroad have a hero and a tile; the job, school and crime cards sit inside the screen |
| Social media (Career) | Page | The row opens the Social media page directly (the extra sheet is gone) |
| Every activity (gym, nightlife, spa, doctor, casino, loans, lawsuits, names...) | Option picker sheet | Was a title, a paragraph, then an outlined button repeating the title. Now option cards with effect chips and a price chip, freshness pips and the balance in the header, and a confirmation above the threshold. A greyed card says why ("Needs $40 more", "Done this year"). Companions, looks, a lawsuit's route and a stake are chips; a name is two rows that open a dialog |
| Every shop (Stores, Fine goods, Outdoor gear, the black market, Luxury cars, Boats, Aircraft, Jewelry, Private islands) | Store | Was an option sheet. Filter chips (All, kinds of item, I can afford, Owned); the luxury shops use the gold tokens; Sell for something you own |
| Groups, Faith, Explore other faiths | Join list | Was rows with three dots. Join cards with hours, cost and benefit chips, filter by kind, "Show N more". A group you belong to opens its own feature screen (Standing, the people you know, Change commitment and Leave in ⋯) |
| Travel, Move abroad | Chips | The dropdowns are chips |
| Page headers over a tab (Health, Family, Possessions, Teen years, Properties, Will, Later life...) | Header only | They use `ScreenHeader`: the title wraps instead of truncating |

### The pages over a tab (second pass)

Health, Possessions, Properties, Family, Will, Later life, Teen years, Social media, Trips, Move abroad, the Drug market and Recovery keep their layout (they were already full pages with a header), but now follow the copy rules: their explanatory paragraphs moved behind the header's ⓘ (`PageInfo`, `components/PageInfo.tsx`; one ⓘ for all of a page's text); the pet's name, an account's handle and a business name are `RenameDialog` rows; the language to learn is chips. A page's status lines stay.

### Still not on the feature templates

The person and pet pages, Health, Possessions, Properties, Family, Will, Later life, Teen years, Social media, Trips, Move abroad, the Drug market and Recovery have no hero card or action tiles yet. The Money tab's dirty-money amount is still a typed field (it sits in the Assets tab, not below it). The Sports "Big game" tile and "N people you know" on join cards need engine data that does not exist.
