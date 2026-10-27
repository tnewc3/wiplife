# WIPlife — Portraits, UI Redesign & Activities

A standalone plan for three stages, kept separate from `docs/expansion.md`. Same gate format and AGENTS.md rules as every other stage.

| Stage | Name | After it, the player can... |
|---|---|---|
| P1 | Portrait engine | See every character as a layered, recolorable portrait that ages with them and passes looks to their children |
| U1 | UI redesign | Play a polished, mobile-game-style interface: a life log front and center, a big Age button, four main tabs and redesigned event cards |
| A1 | Activities | Use an Activities tab for the gym, doctor, nightlife, dating, lottery, casino, shopping, vacations, salon and hobbies |

**Order:** P1 → U1 → A1. U1 shows portraits everywhere, and A1 lives in U1's Activities tab and uses P1 for salon and shopping changes. Don't run these three in parallel with each other.

---

## Decisions

| Area | Decision |
|---|---|
| Portrait source | The `wiplife_portrait_integration_v1` package (manifest revision 14): React component, renderer and 2,558 layers |
| Who gets portraits | The player and every person in their life |
| Body type | Male or female portrait template, defaulting from gender category and changeable any time; nonbinary characters choose at creation |
| Age stages | Mapped from age in `balance/portraits.yaml` (see P1) |
| Look changes | Automatic aging (graying hair and the older templates) and salon or shopping activities. No free editing after creation, and events don't change looks |
| Collared-shirt art | Patched by code (all 14 front layers have rectangular cutouts beside the collar) |
| Activities tab | Yes: mind & body, social, money & luck, leisure |
| Activity limits | Unlimited, with diminishing returns (the same rule as the interaction menu) |
| Stats | Bars **with percentages** (this replaces the earlier "bars only" decision) |
| Theme | Dark by default, light available in Settings |
| Visual identity | WIPlife's own palette, logo and type. Layout patterns are inspired by mobile life sims, but no other game's colors, logo, wording or art are copied |
| Icons | Microsoft Fluent Emoji (MIT) for content icons; Lucide (ISC) for interface icons |

### Design docs to update (P1 and U1 do this)

- `docs/design.md`: stats show bars with percentages; an Activities tab exists (A1); dark theme by default; portraits on every character.
- AGENTS.md: replace any "bars without numbers" wording with "bars with percentages."

---

## Getting the portrait package into the repo

The package is about 192 MB in 2,633 files. That's too many for GitHub's web uploader. Two options:

**Option A (works from anywhere, recommended): a GitHub Release**

1. On GitHub, open the repo → **Releases** → **Draft a new release**.
2. Tag: `portrait-assets-v1`. Title: `Portrait assets v1`.
3. Attach `wiplife_portrait_integration_v1.zip` and publish.

The P1 session downloads it with `gh release download portrait-assets-v1`.

**Option B: on your computer**

Copy the zip into the root of your local `wiplife` folder, and run the P1 session from Claude Code on your computer instead of the cloud.

---

## P1 — Portrait Engine

**Objective:** Give every character a portrait built from the layered art, saved as settings, aging with them and inherited by their children, without slowing the game down.

### Player experience

- **Character creation** gets a Look step with a live portrait: body type, skin tone, hair color and style, eye color and shape, brows, lashes, nose, outfit and color, plus glasses and earrings. "Surprise me" randomizes everything.
- **Portraits appear** in the header, the profile, the People list, person pages, event cards that involve someone, the death screen and the archive.
- **Aging is automatic:**
  - The portrait moves through baby, young child, teenager, young adult, adult, middle aged, senior and very old.
  - Hair goes gray at a personal age.
  - Facial hair and adult accessories only appear when the age allows.
- **Children inherit** skin tone, hair color and eye color from their biological parents, with variation.
- **Expression follows mood:** smiling when happy, neutral otherwise.

### Systems

- **Package installation.**
  - Copy the package's `src/` into `src/portraits/` (adjusting imports), and its `assets/` into `public/portraits/`.
  - Keep the package's tests and add them to the repo's test run.
  - Record the art and its source in `CREDITS.md`.
- **Appearance data,** stored on the character and on every person: body type, hairstyle, outfit, eye shape, brow style, lash style, nose shape, facial hair, eyewear, earrings, hat, skin, natural hair color, dyed hair color (optional, with the year it was dyed), eye color, clothing color, hat color, and graying age.
- **The portrait template is never stored.** It's derived from body type plus age stage whenever a portrait renders, so aging needs no save changes.
- **Age stages,** in `balance/portraits.yaml`:

  | Stage | Ages |
  |---|---|
  | baby | 0–2 |
  | young child | 3–12 |
  | teenager | 13–17 |
  | young adult | 18–29 |
  | adult | 30–44 |
  | middle aged | 45–59 |
  | senior | 60–74 |
  | very old | 75+ |

- **Graying:** each person gets a graying age (seeded, roughly 40–65). From then on, natural hair renders silver. Dyed hair overrides it until the dye fades (a number of years in balance).
- **Expression:** smile when Happiness is at least 60, neutral otherwise. Event cards can show "surprised" for shocking events.
- **Generation:**
  - Random characters and new people get appearances from the seeded generator, weighted by balance tables (skin, hair and eye distributions can later vary by country in W4a).
  - Children are generated from both biological parents' appearance (E2a genetics); adopted children are generated independently.
- **Normalization:** use the package's `normalizeAppearance` on every render, so impossible combinations (a beard on a child) fall back cleanly. Show its notices only in development builds.
- **Collared-shirt fix.**
  - All 14 `top_front_collared_shirt_*` layers have hard-edged rectangular cutouts beside the collar points, so square patches of neck skin show.
  - Patch each layer (and its matching clothing mask, so recoloring still works) so the inner collar edge is a smooth, natural curve with no straight-edged transparent areas.
  - Produce a review sheet of all 14, rendered in three skin tones and two clothing colors, at `review/collared-shirt-fix.png`, and include it in the pull request for the owner to approve.
- **Performance.**
  - One shared catalog and renderer for the whole app.
  - **Thumbnails** (96 px and 192 px) are rendered once per appearance and age stage, then cached in IndexedDB, keyed by a hash of the rendered settings plus the asset revision. Lists only ever show cached thumbnails.
  - Full-size renders are used only on the profile and the death screen.
  - The service worker never precaches portrait assets. It uses a runtime cache with a size cap.
  - Optional: convert the PNGs to **lossless** WebP if a test proves every converted file is pixel-identical (including masks). Otherwise keep PNG.
- **Save upgrade:** existing characters and people get generated appearances. The player's old appearance descriptors from Stage 2 are mapped to the nearest options where possible.
- **Determinism:** appearance generation uses the seeded generator, so replays produce the same faces.

### UI

- The Look step in custom creation, with a live preview and "Surprise me."
- A shared `<CharacterPortrait person size>` component that uses cached thumbnails, with a neutral silhouette placeholder while loading.
- Portraits in the existing header, profile, People list, person pages, event cards, death screen and archive (U1 restyles these screens later).

### Acceptance criteria

- Every character and person has a valid appearance after the save upgrade, and new ones are generated deterministically.
- Portraits change stage at the ages in `balance/portraits.yaml`, hair grays at each person's graying age, and invalid combinations never render.
- Children's colors come from their biological parents.
- The collared-shirt review sheet shows no square patches, and the owner approves it before merging.
- A People list of 30 people scrolls smoothly on a mid-range phone after the first visit, using cached thumbnails.
- The first portrait on a cold start appears within 2 seconds on 4G.
- The service worker doesn't precache portrait assets.
- All package tests pass in the repo's CI, plus new tests for age mapping, graying, inheritance, generation and the save upgrade.

### Coding-AI prompt

```text
You are implementing P1 (Portrait Engine) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/portraits-and-ui.md (the decisions and section P1). Inspect the existing character creation, people generation, genetics (E2a), save upgrades, service worker and every screen that shows a person first.

Get the portrait package: run `gh release download portrait-assets-v1` and unzip wiplife_portrait_integration_v1.zip (or use the zip in the repo root if it's there). Read its README.md and review/REVIEW.md. Delete the zip once the contents are in place; never commit the zip.

Build only P1, as section P1 describes:
- Install the package's src/ into src/portraits/ and its assets/ into public/portraits/; keep its tests in the test run; record the art in CREDITS.md.
- Appearance data on the character and every person (the template is derived from body type and age stage, never stored); age stages, graying ages and dye fading in balance/portraits.yaml; expression from Happiness.
- Seeded generation for new characters and people; inheritance from biological parents; a save upgrade that gives everyone an appearance.
- Normalize every render with normalizeAppearance.
- Patch all 14 top_front_collared_shirt layers and their clothing masks so there are no rectangular cutouts, and produce review/collared-shirt-fix.png (all 14 layers, three skin tones, two clothing colors) for the owner to approve.
- One shared catalog and renderer; IndexedDB thumbnail cache (96 and 192 px) keyed by rendered settings plus asset revision; no portrait precaching in the service worker; optional lossless WebP conversion only if a test proves pixel-identical output.
- The Look step in custom creation with a live preview and "Surprise me"; a shared CharacterPortrait component; portraits on every existing screen that shows a person.
- Update docs/design.md for portraits on every character.

Meet every P1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main with the review sheet attached, wait for CI, and report what you built, the performance measurements, deviations and why, and open questions. Report only verified facts.
```

---

## U1 — UI Redesign

**Objective:** Rebuild the interface into a polished mobile-game layout with WIPlife's own identity, built around the life log, a big Age button and four main tabs.

### Layout

```text
┌──────────────────────────────────────┐
│ ☰  [portrait] Name            $12,340│  header: tap portrait or name for profile
│              Occupation · City  Balance│
├──────────────────────────────────────┤
│ Age 23                               │
│ I started a new job at ...           │  life log, grouped by age,
│ +$4,200 from ...  (green)            │  newest at the bottom, auto-scrolls
│ ...                                  │
├──────────────────────────────────────┤
│ [Job] [Assets]  ( AGE + )  [People] [Activities] │
├──────────────────────────────────────┤
│ Happiness 😀 ████████░░ 74%          │
│ Health    ❤️ █████████░ 92%          │
│ Smarts    💡 ███████░░░ 70%          │
│ Looks     🔥 ████████░░ 81%          │  (+ Fame when famous)
└──────────────────────────────────────┘
```

### Screens

| Screen | Contents |
|---|---|
| **Home** | Header, life log, Age button with four tabs, stat panel. Year headings ("Age 23"), money lines in green or red with amounts, important lines in bold |
| **Menu (☰)** | New life, Lives in progress (if more than one is kept), Archive, Settings, Free actions settings, Report a problem (development builds) |
| **Profile** (tap portrait or name) | Large portrait, name, pronouns, age, occupation, city, all six stats as bars with percentages, personality, languages and faith once those stages exist, and the editable identity fields from Stage 9 |
| **Job** (becomes **School** while enrolled) | School: current school with a grades bar and school actions. Work: current job card, then a list of ways to work (Jobs, Part-time, Gig work, and Special careers for crime and fame). Unavailable items are greyed out; tapping one explains why |
| **Assets** | Finances (the ledger), Properties, Vehicles, Possessions, Businesses and Crime money once they exist, and a "Go shopping" button (A1). Items show condition bars |
| **People** | Groups: Love, Parents, Siblings, Children, Friends, Work, Pets, then "Late relationships" (a memorial icon and "Died X years ago"). Each row: portrait thumbnail, name, (relation), relationship bar. A "Spend time with everyone" button at the bottom |
| **Activities** | Built in A1; U1 adds the tab with a "coming soon" state |
| **Event card** | See below |
| **Year recap, death and obituary, archive, settings** | Restyled to match |

**Moving existing features:**

| Was | Moves to |
|---|---|
| Life tab | Home (life log) |
| People tab | People |
| Work/School tab | Job / School |
| Money tab | Assets → Finances |
| More → Home (housing) | Assets → Properties |
| More → Health | Profile (health status) and Activities → Doctor (A1) |
| Settings, Archive | Menu |

### Event card

- A **category banner** across the top-right (Family, Love, Work, School, Money, Health, Crime, Fame and so on), with the card's border and banner color set by category.
- An **icon and title.** For events about a person, a **person header** with their portrait thumbnail and name instead.
- The body text, then "What will you do?" when there are choices.
- **Full-width choice buttons,** stacked. A known cost shows on the button ("Lend $200").
- An optional **meter** (for example "Your concern"), declared by the event and filled from a value.
- A **"Surprise me"** link that picks a choice at random. It uses the seeded generator and is recorded in the input log like any other choice.
- **Outcome** on the same card, with money changes shown as amounts plus the new balance (from C1), then Continue.
- Events can declare their category, icon and optional meter in YAML; the content build checks them. Existing events get a category from their current category field and a default icon per category.

### Visual identity

- **Palette** (dark default; light theme mirrors it):

  | Token | Dark | Use |
  |---|---|---|
  | Background | `#12141C` | App background |
  | Surface | `#1C1F2B` | Cards, lists |
  | Raised | `#262A3A` | Headers, sheets |
  | Text | `#F2F3F7` | Main text |
  | Muted | `#9AA0B4` | Subtitles |
  | Primary | `#7C6CF2` (violet) | Choice buttons, links |
  | Age button | `#FF7A45` (coral) | The Age button |
  | Positive | `#3DD68C` | Money gained, good bars |
  | Negative | `#FF5D6C` | Money lost, low bars |
  | Warning | `#FFC145` | Middling bars |

  Stat bars color by value (low red, middle amber, high green), with the percentage shown.
- **Type:** Fredoka for headings and the logo, Nunito for body text. Both are free (SIL Open Font License) and self-hosted through `@fontsource` so they work offline.
- **Logo:** a "WIPlife" wordmark with a small progress-bar motif (for "work in progress"), as SVG.
- **Icons:**
  - Content icons from **Microsoft Fluent Emoji** (MIT), Color style, fetched from github.com/microsoft/fluentui-emoji. Include only the icons used, as SVG in `public/icons/`, listed in `CREDITS.md`.
  - Interface icons (menu, close, chevrons, back) from **Lucide** (`lucide-react`, ISC).
- **Motion:** cards slide up, bars animate on change, the Age button gives a press bounce and light haptics. All of it respects reduced motion.
- **Not included:** no other game's name, logo, colors, button wording, emoji art or layout details beyond common patterns. No ads, store, premium labels or rating buttons.

### Acceptance criteria

- Every existing feature is reachable through the new layout (the move table above), with no feature lost.
- The life log groups by age, scrolls smoothly over a full 100-year life, and shows money lines with amounts.
- Event cards show the category banner and color, icon or person header, choices, optional meter, "Surprise me" (seeded and logged) and outcomes with balances.
- Dark is the default; light works everywhere; both pass WCAG AA contrast.
- Stat bars show percentages and color by value.
- Fonts and icons work offline, and every icon used is listed in `CREDITS.md`.
- Layouts work at 360×640, 390×844, tablet and desktop, with safe areas.
- All existing end-to-end tests are updated to the new layout and pass.

### Coding-AI prompt

```text
You are implementing U1 (UI Redesign) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/portraits-and-ui.md (the decisions and section U1). Inspect every existing screen, the navigation, the event sheet, the design tokens and the end-to-end tests first. Restyle and reorganize; do not rewrite game logic.

Build only U1, as section U1 describes:
- The new Home (header with portrait, name, occupation, city and balance; life log grouped by age with money lines; the Age button between four tabs: Job/School, Assets, People, Activities; the stat panel with bars and percentages).
- The menu, profile, Job/School, Assets, People (with late relationships and "Spend time with everyone" as a group interaction with diminishing returns) and an Activities tab placeholder.
- Move every existing feature according to the move table, losing none.
- Redesigned event cards: category banner and color, icon or person header with portrait, stacked choices with known costs, optional meter, a seeded and logged "Surprise me", outcomes with amounts and balance. Add category, icon and meter fields to the event schema and content build; give existing events a category and a default icon per category.
- Visual identity: the palette tokens (dark default, light option), Fredoka and Nunito via @fontsource, an SVG "WIPlife" wordmark with a progress-bar motif, Fluent Emoji (Color, MIT) SVGs for content icons fetched from github.com/microsoft/fluentui-emoji (only those used), Lucide for interface icons, everything listed in CREDITS.md. Motion that respects reduced motion.
- No other game's name, logo, colors, wording or art.
- Update docs/design.md and AGENTS.md: stats show bars with percentages, an Activities tab exists, dark theme by default.
- Update all end-to-end tests to the new layout.

Meet every U1 acceptance criterion. Run all checks, open a pull request into main with screenshots of every main screen in dark and light at 390×844, wait for CI, and report what you built, deviations and why, and open questions. Report only verified facts.
```

---

## A1 — Activities

**Objective:** Give players things to do between age-ups, in a way that adds to the story without turning into a grind.

### Player experience

The Activities tab lists, with icons and short subtitles:

| Group | Activities |
|---|---|
| **Featured** | Do your own thing (X1), shown when a model is connected |
| **Mind & body** | Gym, Meditate, Read (library), Doctor (moves "See a doctor" here; links to therapy once M1 exists) |
| **Social** | Nightlife (bars and clubs), Dating (find someone; adults only), Parties (host or go) |
| **Money & luck** | Lottery, Casino (games with stakes), Shopping (clothes, accessories, hats, and items once E5 possessions exist) |
| **Leisure** | Vacation (W5 trips once they exist; a simple version before), Salon & spa (haircut, new style, dye, spa day), Hobbies (pick a hobby and practice it) |

Each activity opens a small sheet of options (for example, the gym offers a light or hard workout), then a short outcome card like the interaction menu's.

### Rules

- **Unlimited, with diminishing returns:** gains shrink with each repeat of the same activity in a year, and repeats raise the chance of a bad result (an injury at the gym, a hangover, a bad haircut). Counters reset yearly. Numbers in `balance/activities.yaml`.
- **Age and legal limits** come from the country rules (W4a once built; US defaults before): nightlife and casino 21+ in the US, lottery 18+, dating 18+ (the existing adults-only rule).
- **Real consequences through existing systems:**
  - All money goes through the ledger, with costs shown on buttons and outcomes showing the new balance.
  - Nightlife can lead to meeting people (E1/E4), drinking and fights (health and legal), or vice escalation.
  - Casino losses feed vice and can start a gambling addiction (Stage 9 conditions).
  - Gym affects Fitness, Health and injury risk; meditation lowers Stress; reading raises Smarts.
  - Hobbies grow a skill and can reveal a hidden talent (Stage 9), and connect to fame paths (E6b) where relevant.
  - Salon and shopping change the portrait (P1): hairstyle, dye (fades over time), outfit and color, glasses, earrings, hats.
- **Events:** some outcomes start existing events or new activity events (someone you met at a club calls you).
- **Determinism:** every activity is recorded in the input log and rolled with the seeded generator.

### Content

- Activity definitions as YAML: options, costs, age limits, outcome tiers with effects, and text variants.
- About 40 activity outcome events and follow-ups.

### Acceptance criteria

- Every activity in the table works, with age and legal limits enforced.
- Repeating an activity within a year gives less each time and raises the chance of a bad result; a spamming test player can't max any stat in one year.
- All money goes through the ledger and shows on buttons and outcomes.
- Gambling can lead to addiction, nightlife to legal and health consequences, hobbies to talent discovery.
- Salon and shopping change the portrait, and dye fades as defined.
- Dating follows the adults-only rule in both the engine and the content build.
- A 10,000-life simulation with players who use activities reports usage, outcome tiers, money spent and won, addiction rates and stat effects, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing A1 (Activities) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/free-actions.md and docs/portraits-and-ui.md (the decisions and section A1). Inspect the interaction menu (E1), event engine, finance, health, legal, addiction and conditions, talents, people's lives, possessions (E5), portraits (P1) and the U1 Activities tab first. Reuse them; do not duplicate them.

Build only A1, as section A1 describes:
- Activity definitions as YAML with schemas (options, costs, age and legal limits, outcome tiers with effects and text variants), and the Activities tab with the groups and items in the A1 table, including "Do your own thing" when a model is connected.
- Diminishing returns per activity per year, with repeats raising the chance of a bad result; numbers in balance/activities.yaml.
- Consequences through existing systems: ledger, meeting people, health, legal, vice and gambling addiction, talents and hobby skills, fame links, and portrait changes from salon and shopping (with dye fading).
- Move "See a doctor" into Activities → Doctor.
- About 40 activity outcome events and follow-ups, following AGENTS.md and the consistency rules; dating follows the adults-only rule in the engine and content build.
- Record every activity in the input log and use the seeded generator.
- Extend tools/simulate.ts with activity-using players (including a spamming player) and the A1 reports.

Meet every A1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```
