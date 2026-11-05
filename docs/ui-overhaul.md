# WIPlife — U3: Feature Screen Overhaul

A standalone plan for one stage, kept separate from the other plan docs. Same gate format and AGENTS.md rules as every other stage.

**After it, the player can** move through every career, activity, store and group screen quickly, with one consistent, game-like layout instead of stacked sheets, paragraphs and form fields.

**Scope:** every screen *below* a tab: career screens (sports, music, fame, acting, modeling, social media, writing and art, business, crime organizations, dealing), every Activities category and activity, every store, groups, faith, recovery, health, travel, luxury, possessions and person pages. The tab overviews (Home, Career list, Activities hub, People list) stay as they are, apart from shared components.

---

## What's wrong now (from the U2 and C2 screenshots)

1. **Big features live in bottom sheets.** Sports and the band open as sheets over a dimmed Career screen, with tabs, accordions and scrolling inside the sheet. A whole career squeezed into a pop-up feels cramped and temporary.
2. **Activity sheets are walls of text.** Each option is a title, a description, then an outlined button that repeats the title ("Follow a diet plan" → "Follow a diet plan · $50"). Every sheet opens with the same paragraph about savings and diminishing returns.
3. **Explanations everywhere.** "You are not in the pros until you are grown…", "Young players can try anything…", "Gold marks the finest things…", "Better players turn up as your fame…". These are rules written for a developer, shown to the player every time.
4. **Forms in the middle of game screens.** "Rename the band" is a text box and button on the band overview; finding members uses a plain dropdown and a separate button.
5. **Actions are scattered and inconsistent.** A filled button (Rehearse), a segmented control (Holding back / Steady / All in), outlined buttons, text links (Leave the band, Go solo, Quit this sport) and collapsed accordions holding actions (Position and team, Switch sports, Practice) all appear on one screen. The most important actions are hardest to find.
6. **No hierarchy.** Every row looks the same, so nothing reads as the main thing to do. Titles truncate ("Sunset Park High S…", "Point guard · Baske…") because bars and percentages take the room.
7. **Irrelevant information.** A high-school player's Season tab shows fame, public image and fan mood bars at near zero.
8. **Join lists are bare.** Clubs are a flat list of names with "…" and no cost, time or benefit shown.

---

## The rules

### Navigation

- **A feature is a screen, never a sheet.** Anything with its own sections, tabs or lists (a career, a band, an organization, a store, a group list) opens as a full screen with a header and back button, sliding in from the right. Swipe-back works.
- **Sheets are only for one quick decision:** picking an option, confirming a purchase, choosing a person. A sheet never contains tabs, accordions, text inputs or another sheet.
- **Depth:** tab → category → feature screen → sheet. Never deeper.

### Copy

- **No explanatory paragraphs on screens.** Rules and tips move behind an ⓘ button in the header, which opens a short info sheet.
- **One short line, at most,** under any title.
- **Status, not instructions:** "Fresh ●●●○" instead of "Done 0 of 14 times this year. Each time you do the same thing…".
- **Titles never truncate** at 390 px. If space runs out, the bar or value moves to the second line.
- **Hide what doesn't apply:** fame, image and fan bars appear only once fame is above zero; contract and agent rows only when there is one.

### Actions

- **One place for the main actions:** an **action tile row** (up to 4 tiles: icon, label, one status line such as "1 of 10", "$120", "Ready", "●●○").
- **Secondary and destructive actions** (rename, leave, go solo, quit, switch sport, retire, sell) live in the header's **⋯ overflow menu**, as a sheet of options, with confirmation for anything irreversible.
- **Settings-like choices** (commitment: holding back, steady, all in) live in one place, the Career → Schedule screen, not on every career screen.
- **No accordions holding actions.**
- **No text inputs or dropdowns on feature screens.** Renaming opens a small dialog from the overflow menu. Choices use chips or option cards.

---

## Templates

Build these as shared components, then rebuild every screen in scope from them.

### 1. Feature screen (careers, bands, organizations, businesses, groups you belong to)

```text
┌ ‹  Basketball                        ⋯ ┐  header: back, title, ⓘ (optional), overflow
│ ┌──────────────────────────────────┐   │
│ │ [team jersey]  Point guard        │   │  hero card: big icon or portrait,
│ │                Sunset Park Knights│   │  title, one status line
│ │ ┌Greatness┐ ┌Standing┐ ┌Record┐  │   │  2–3 stat cells: label, big value,
│ │ │  66% ▬▬ │ │  3rd   │ │ 12–6 │  │   │  bar or sub-label
│ │ └─────────┘ └────────┘ └──────┘  │   │
│ └──────────────────────────────────┘   │
│ [Practice] [Big game] [Recover] [Showcase]  action tiles (≤4)
│ ( Season | League | History )          │  segmented tabs (sticky), only if needed
│ COMING UP                              │  compact sections
│  Rivalry game · tied late      [Play]  │
│ THIS SEASON                            │
│  12.5 Points · 6.3 Assists · 92%       │
└────────────────────────────────────────┘
```

- **Sports:** tiles Practice, Big game (G1, when one is ready), Recover or Physical therapy (when injured), Showcase or Contract. Tabs Season | League | History. Overflow: Switch sport, Request trade, Performance enhancers, Quit or Retire.
- **Band:** hero with genre and member count; stat cells Strength, Chemistry, Buzz. Tiles Rehearse, Write, Play a show, Release. Tabs Members | Music | Shows. **Members** is a roster: avatar, name, role and age, a skill bar with percentage, and this year's change (▲ 4). An empty spot shows "Keys · Open spot" with an inline **Audition** button, which opens a sheet of candidate cards (skill, attitude, asking cut). Overflow: Rename, Go solo, Leave.
- **Organization (O1):** stat cells Rank, Respect, Heat. Tiles Do a job, Collect, Lie low, Recruit. Tabs Members | Territory | Rivals.
- **Fame paths, acting, modeling, social media, writing and art, business, dealing:** the same pattern, each with its own tiles and tabs.

### 2. Option picker sheet (every activity: gym, nightlife, spa, doctor, casino games and so on)

```text
┌──────────────── grabber ─────────────────┐
│ [icon] Gym             $3,000,000         │  header: icon, title, one line;
│        Pick a session  Fresh ●●●○         │  balance and freshness on the right
│ ┌────────────────────────────────────┐    │
│ │ Hit the gym                  [$28] │    │  option card: name, effect chips,
│ │ (+ Fitness) (− Stress)             │    │  price chip; the whole card is
│ └────────────────────────────────────┘    │  the button
│ ┌────────────────────────────────────┐    │
│ │ Hard workout                 [$28] │    │
│ │ (++ Fitness) (Injury risk)         │    │
│ └────────────────────────────────────┘    │
│ ⓘ Each repeat this year gives less.       │  one line, at most
└───────────────────────────────────────────┘
```

- Tapping a card does it immediately and shows the normal outcome card. Purchases over a threshold (in balance, as a share of savings) ask to confirm first.
- **Effect chips** come from the option's effects in content (good effects in green, risks in amber), so they never drift from what actually happens.
- **Freshness** shows the diminishing-returns state as pips, from the existing counters.
- Unaffordable or age-locked options show greyed, with the reason as the chip ("Needs $40 more", "18+").

### 3. Store screen (every shop: stores, fine goods, luxury cars, boats, aircraft, jewelry, islands, outdoor gear, vehicles, black market)

```text
┌ ‹  Boats & yachts              $3,000,000 ┐
│ (All) (Sail) (Motor) (I can afford) (Owned)│  filter chips, scroll sideways
│ ┌──────────┐ ┌──────────┐                  │
│ │  [art]   │ │ [art] ⓄOwned               │  2-column item cards: art tile,
│ │ Day sailer │ Cruising sailboat           │  name, one fact line,
│ │ Sleeps 0 · $900/yr │ Sleeps 4 · $2,100/yr│  price
│ │ $18,500  │ │ $41,800  │                  │
│ └──────────┘ └──────────┘                  │
```

- Tapping a card opens a **detail sheet**: larger art, facts (upkeep, insurance, condition, value), and **Buy** (cash, or a loan where allowed) or **Sell** if owned.
- Items you can't afford show greyed with "Needs $X more".
- **Luxury stores** use the gold tokens for titles, prices and the top-tier cards.
- Art: Fluent Emoji (Color) for the item tile, on a tinted background per item type.

### 4. Join list (clubs and groups, faith communities, gyms, schools, teams)

- **Tabs: Yours · N | Join.**
- **Filter chips** by kind.
- **Cards** with: icon, name, kind, "N people you know" when true; **fact chips** (time per week, cost, main benefit); an inline **Join** button.
- **"Show N more"** instead of an endless list.
- **Yours** shows the same cards with your role and a chevron to the group's feature screen (template 1).

### 5. Shared components

- `ScreenHeader` (back, title, optional ⓘ, optional overflow)
- `HeroCard` and `StatCell`
- `ActionTile` and `ActionTileRow`
- `SegmentedTabs` (sticky)
- `SectionLabel`, `CompactRow`
- `OptionPickerSheet` and `OptionCard`
- `StoreScreen`, `ItemCard`, `ItemDetailSheet`
- `JoinCard`, `FilterChips`
- `FactChip` and `EffectChip`
- `OverflowMenu`, `InfoSheet`, `RenameDialog`
- `EmptyState` (one line plus one button)

Every screen in scope must be built from these; no screen-specific one-off layouts.

### Visual details

- Hero cards and option cards use `surface`, stat cells use `surface-2`, with radius 20 / 16 / 14 px for hero / cards / cells.
- Action tile icons sit on a colored square using the event category colors (sports green, fame violet, money green, health red and so on).
- Section labels: 12 px, bold, uppercase, letter-spaced, muted.
- Big numbers in Fredoka; everything else in Nunito.
- Press states on every tappable card (slight scale and darken), and a light haptic on actions.

---

## Acceptance criteria

- No feature with tabs, lists or sections opens as a sheet; every one is a full screen with a header and swipe-back.
- No sheet contains tabs, accordions, text inputs or another sheet.
- No feature screen has an explanatory paragraph; rules live behind ⓘ.
- No title truncates at 390 px on any screen in scope.
- Every activity uses the option picker, with effect chips generated from content and freshness pips.
- Every shop uses the store template with filters, item cards and a detail sheet.
- Groups, faith communities and other joinable lists use join cards with fact chips.
- Rename, leave, quit, switch, sell and similar actions live only in overflow menus, with confirmation where irreversible.
- Commitment settings live only on the Schedule screen.
- Fame, image, fan, contract and agent information appears only when it applies.
- Every screen in scope is built from the shared components; `docs/ui-audit.md` lists each screen and the template it now uses.
- Both themes pass WCAG AA; all end-to-end tests are updated and pass.
- The pull request includes screenshots at 390×844, dark theme, of: Sports, Band, an organization, one activity picker, one store, one item detail sheet, the clubs list and one overflow menu.

---

## Coding-AI prompt

```text
You are implementing U3 (Feature Screen Overhaul) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/portraits-and-ui.md, docs/careers-crime-and-ui.md, docs/ui-audit.md and docs/ui-overhaul.md (the whole file). Look at docs/screenshots/u2 and docs/screenshots/c2 to see the current problems. Inspect every screen below the tabs first. Restyle and restructure; don't change game logic, content effects or balance.

Build only U3, as docs/ui-overhaul.md describes:
- The shared components listed in "Shared components".
- Navigation: every feature with sections, tabs or lists becomes a full screen with a header and swipe-back; sheets only for one quick decision, never containing tabs, accordions, inputs or another sheet.
- Rebuild every career screen (sports, band and music, fame paths, acting, modeling, social media, writing and art, business, organizations, dealing) on the feature screen template, with action tiles, sticky tabs only where needed, and secondary or destructive actions in the overflow menu.
- Rebuild every activity on the option picker sheet, with effect chips generated from each option's content effects, freshness pips from the existing diminishing-returns counters, a confirmation above the threshold in balance, and greyed options with the reason.
- Rebuild every shop on the store template with filter chips, item cards and an item detail sheet (buy with cash or loan, sell if owned), luxury stores in gold.
- Rebuild groups, faith communities and other joinable lists on the join card template.
- Remove explanatory paragraphs (move them to ⓘ info sheets), prevent title truncation, hide fame, image, fan, contract and agent information when it doesn't apply, and move commitment settings to the Schedule screen only.
- Update docs/ui-audit.md with every screen and its template, and update all end-to-end tests.

Meet every U3 acceptance criterion. Run all checks, open a pull request into main with the screenshots listed in the acceptance criteria, wait for CI, and report what changed, deviations and why, and open questions. Report only verified facts.
```
