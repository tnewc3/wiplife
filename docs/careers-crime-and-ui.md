# WIPlife — Career Hub, Crime, Drugs, UI Tightening & Mini-Games

A standalone plan for five stages, kept separate from the other plan docs. Same gate format and AGENTS.md rules as every other stage.

| Stage | Name | After it, the player can... |
|---|---|---|
| U2 | UI tightening & Activities hub | Use a denser, less scroll-heavy interface, and an Activities tab where every feature has a proper home |
| C2 | Career hub | Run several careers at once (school, a job, sports, a band, fame, crime) from one Career tab, with skills that grow and fade |
| D1 | Drugs | Buy, use, deal, grow and make drugs, with addiction, overdose, rehab and the law |
| O1 | Organized crime | Join or lead street gangs, mafia families, cartels and motorcycle clubs, run territory and give members work |
| G1 | Mini-games | Play quick skill moments: sports big moments, heists and runs, and casino games |

**Order:** U2 → C2 → D1 → O1 → G1.

- **U2 comes first,** so new screens are built in the tightened style.
- **D1 comes before O1,** because organizations deal and supply drugs.
- **G1 comes last,** because its games plug into sports, heists and the casino.

---

## Decisions

| Area | Decision |
|---|---|
| Career tab | The Job tab becomes **Career**, with sections for Job, School, Sports, Music, Fame and Crime |
| Multiple careers | Any mix, limited by time and energy. More careers means more stress and burnout |
| Sports | Kids can try and switch sports freely; starting one never locks out another |
| Skills | Every skill (sports, instruments, hobbies) grows a little each year it's used, and fades a little after 2 or more years untouched |
| Bands | Recruit members with real skill levels. Elite players are rare early on, and weaker members improve over time |
| Training | Training, practice and rehearsals show a short 2–3 second animation that ends with the result |
| Burnout | Meditation, walks, outdoor activities and other leisure lower Stress and burnout |
| God mode | Can edit sports, music, fame and crime careers |
| Activities | A hub of categories, each with its own submenu. Groups and faith get their own sections there instead of living in People |
| UI density | Smaller rows, subsections and in-screen tabs instead of long scrolling lists |
| Drugs | Buying (dealers, contacts, prices), using (with addiction and overdose risk), dealing for money, and growing or making them as a business |
| Organizations | Street gangs, mafia families, cartels (suppliers) and motorcycle clubs, with territory by neighborhood in each city |
| Running an organization | Both: assign members to jobs each year, plus events and choices |
| First mini-games | Sports big moments, heists and runs, casino (blackjack and slots) |

### Writing guidance for D1 and O1

- **Story and consequences only, never real-world instructions.** No recipes, methods, dosages, sourcing techniques or ways to avoid police. Growing and making drugs are business abstractions (capacity, quality, risk, raids), not processes.
- **Real drug names are fine,** and effects are described at the level of how they feel and what they cost the character, not how to use them.
- **Organization membership, dealing and making drugs are adults-only (18+),** matching the existing crime-career rule. Teens can still get into trouble through existing events, and can be approached by gangs in events, but can't join.
- **Overdose and violent death are possible, rare, and never come out of nowhere.** They follow the C1 consistency rules and the crew-death rule: danger must be readable first.
- **Addiction is written with weight,** with recovery as possible as decline.
- **All organization, gang, cartel, club and business names are fictional.**

---

## U2 — UI Tightening & Activities Hub

**Objective:** Make the interface quicker to use on a phone: less scrolling, less clutter, and a proper home for every feature.

### Density rules (added to the design tokens and AGENTS.md)

- **List rows:** about 56 px tall (never below the 44 px touch target), with a 28 px icon, a 16 px title and a one-line 13 px subtitle. Current rows are much larger.
- **Row endings:**
  - A chevron (›) opens a new screen.
  - Three dots (…) open a quick action sheet without leaving the screen.
- **Sticky section headers,** about 28 px.
- **In-screen tabs** (a segmented control at the top) on any screen with more than two sections or more than about 12 rows. For example, a person's page gets Overview | Interact | History.
- **Collapsible groups** in long lists (People groups, Activities categories), remembering which are open.
- **Bottom sheets** for actions and confirmations, instead of new screens.
- **No more than two levels** of menus below a tab where possible.
- **Inline summaries:** a row shows its key value (a bar, a price, "$15/hour") so you rarely need to open it to know what it is.

### Screen cleanup

- Apply the density rules to every screen.
- Audit each screen for clutter and record the result in `docs/ui-audit.md`: what moved, what got grouped, what became a tab.
- **People** keeps only people: Love, Family, Children, Friends, Work, Pets, Late relationships. Groups and faith move to Activities.

### Activities hub

The Activities tab becomes a list of categories. Each category opens its own submenu, split into **Activities** and **Shopping** sections where it fits. Categories only appear when they apply (for example, Luxury appears above a net-worth threshold).

| Category | Contents |
|---|---|
| **Featured** | Do your own thing (X1) |
| **Health** | Doctor, Emergency room, Specialists (eyes, dentist), Therapist (M1), Alternative medicine, Donate blood or plasma |
| **Recovery** | Support groups, Rehab center, Counseling (D1 adds drug rehab) |
| **Mind & body** | Gym, Walk, Meditate, Yoga, Read |
| **Outdoors** | Hike, Fish, Camp, Birdwatch, Swim or snorkel, Off-road (with a vehicle); Shopping: outdoor gear and off-road vehicles |
| **Social & love** | Dating (18+), Nightlife, Parties |
| **Groups** | Clubs and hobby groups, Volunteering and causes, Neighborhood and civic groups (W2, moved from People) |
| **Faith** | Your faith community, services, holidays, Explore other faiths (W2, moved from People) |
| **Leisure** | Vacation, Salon & spa, Hobbies, Pets |
| **Money & luck** | Lottery, Casino, Shopping (stores submenu) |
| **Black market** | Added by D1 |
| **Crime** | Individual crimes from the existing legal system |
| **Luxury** (above a net-worth threshold, with its own gold-accented styling) | VIP events, Luxury spa, Private societies, Charity donations; Shopping: luxury cars, boats, aircraft, jewelry, private islands (as E5 possessions) |

- Every activity follows A1's rules: diminishing returns, money through the ledger, age and legal limits.
- **Burnout relief:** Walk, Meditate, Yoga, Outdoors, Leisure and the spa lower Stress and burnout, with diminishing returns.
- **Audit:** every existing action in the game must be reachable from a sensible place. Record anything that had no home, and where it went, in `docs/ui-audit.md`.

### Acceptance criteria

- The density rules apply to every screen, and no list screen needs more than about two phone-heights of scrolling before tabs or collapsible groups take over.
- Every existing feature is reachable, and `docs/ui-audit.md` lists every move.
- Groups and faith live in Activities, each in its own section, and are gone from People.
- The Activities hub has every category in the table; categories appear only when they apply.
- Outdoors and Luxury activities and stores work, through the ledger and E5 possessions.
- Burnout relief activities measurably lower Stress and burnout, with diminishing returns.
- End-to-end tests are updated, with screenshots of the main screens at 390×844 in the pull request.

### Coding-AI prompt

```text
You are implementing U2 (UI Tightening & Activities Hub) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/portraits-and-ui.md and docs/careers-crime-and-ui.md (the decisions and section U2). Inspect every screen, the Activities tab (A1), groups and faith (W2), possessions (E5) and the end-to-end tests first. Restyle and reorganize; don't rewrite game logic.

Build only U2, as section U2 describes:
- Add the density rules to the design tokens and AGENTS.md, and apply them to every screen: smaller rows, chevron versus three-dot endings, sticky section headers, in-screen tabs, collapsible groups that remember their state, bottom sheets for actions, inline summaries.
- Move groups and faith out of People into their own Activities sections.
- Rebuild the Activities tab as the category hub in the U2 table, with submenus split into Activities and Shopping, categories appearing only when they apply, and a gold-accented Luxury section above a net-worth threshold in balance.
- Add the Outdoors and Luxury activities and stores (luxury items as E5 possessions), and burnout relief from walking, meditation, yoga, outdoors, leisure and spa, following A1's rules.
- Audit every screen and every action; record moves and clutter fixes in docs/ui-audit.md.
- Update the end-to-end tests.

Meet every U2 acceptance criterion. Run all checks, open a pull request into main with screenshots of the main screens at 390×844, wait for CI, and report what changed, deviations and why, and open questions. Report only verified facts.
```

---

## C2 — Career Hub

**Objective:** One place to run every career, with several running side by side, skills that grow and fade, and sports and music screens as good as the rest of the app.

### The Career tab

```text
CAREER
── You ─────────────────────────────
 🏀 Point guard · Fictional League   Greatness ███████░
 🎸 The Night Shift (band)            Buzz      ████░░░░
 🎓 Westbrook High · Junior           Grades    ██████░░
 📅 Schedule                          Load      ██████░░  (stress)
── Find work ───────────────────────
 💼 Jobs                     ›   full-time listings
 ⏱ Part-time                 ›
 🧢 Gigs                     ›   $8–20/hour, inline
 🎓 Education                ›
── Special careers ─────────────────
 🏀 Sports  🎵 Music  🎬 Acting  📷 Modeling  📱 Social media
 ✍️ Writing & art  🏢 Business (W3)  🕶 Crime organizations (O1)
```

- **"You"** lists every active role with one key bar each (Greatness, Buzz, Grades, Performance, Rank). Tapping one opens its screen.
- **Schedule** shows your total load as a bar. Tapping it shows each role's share, and lets you set commitment per role (holding back, steady, all in, from E6b).

### Several careers at once

- Any mix is allowed: school plus a sport plus a band, or a job plus a band plus a gang.
- Each role has a **time cost** that depends on its commitment level, in `balance/careers.yaml`.
- **Total load** above a comfortable level raises Stress and burnout, and lowers performance in every role. Way above it, something gives (grades slip, a coach benches you, the band gets annoyed).
- Full-time jobs and pro sports clash: a pro contract counts as full-time.

### Skills

- A **skill** record per activity (each sport, each instrument, singing, acting, each hobby, and so on), from 0 to 100.
- **Each year a skill is used,** it grows a little (more with practice, talent and commitment, with diminishing returns).
- **After 2 or more years untouched,** it fades a little each year, never below a floor tied to the highest level reached.
- Numbers in `balance/skills.yaml`. Existing hobby skills (A1) and talents (Stage 9) move onto this system.

### Sports

- **Young players can try anything.** Kids and teens can join several school or youth teams, quit, and switch. Switching costs only lost skill growth, never a lockout.
- **Adults** can go pro in one sport at a time, but can keep others as hobbies.
- **Sports screen,** with tabs **Overview | Season | League | History**:
  - **Overview:** your role row (position, Greatness bar) and team row (team strength bar), contract and agent rows, then actions: Practice, Physical therapy, Surgery (when injured), Request trade, Performance enhancers (risky: testing, suspension and health, linked to D1), Retire.
  - **Season:** this season's form, games, and big moments (G1 later).
  - **League:** standings with fictional teams, team colors as small jersey icons, and strength bars.
  - **History:** one compact row per season (team, Greatness bar, a trophy icon for championships). Tapping a row shows that season's summary.
- Builds on E6c's systems; this stage reworks the screens and rules.

### Music

- **Solo or band.** A band screen with tabs **Overview | Members | Releases | Shows.**
- **Recruiting:**
  - "Find members" runs auditions. Candidates are people with a role (vocals, guitar, bass, drums, keys, producer), a skill level and a personality.
  - The **quality of the candidate pool** depends on your fame, your city and your reputation. Early on, most candidates are beginners or decent, and elite players are rare. As you grow, better players show up.
  - Members are real people in your circle, with ties to each other (E4): they can clash, date, quit or leave for a better band.
  - Weaker members **improve over time** through rehearsal (the skills system), so a loyal beginner can become great.
  - You can replace members, at a cost to the relationship.
- **Band strength** comes from members' skills and chemistry, and drives E6b's project quality.
- Builds on E6b's projects, fans, contracts and tours.

### Training pop-ups

- Practice, training, rehearsal, studying and gym sessions show a **short animated card** (2–3 seconds): an icon, a filling skill bar, then the result ("Shooting +2", "Your drummer is getting tighter").
- Tap to skip. Respects reduced motion (shows the result instantly).

### God mode

- Extend the existing god mode to edit:
  - **Sports:** sport, team, position, contract, Greatness, skills, injuries, season history.
  - **Music:** band members and their skills, buzz, fans, releases.
  - **Fame:** fame level, image, fans and fan mood, agent, contracts.
  - **Crime:** organization, rank, heat, territory (after O1).
- Edits go through the same validation as normal play, so they can't corrupt a save.

### Acceptance criteria

- The Career tab shows every active role with one bar each, plus Schedule.
- Several careers run together, with load raising Stress and burnout and lowering performance as defined in balance; the simulation shows multi-career lives working.
- Kids can join, quit and switch sports freely; adults go pro in one sport.
- Skills grow with use and fade after 2 or more idle years, never below their floor.
- Band recruiting draws from a pool whose quality grows with fame, city and reputation; weaker members improve; members are people with ties.
- The sports and music screens use tabs and compact rows, and fit the rest of the app.
- Training pop-ups play for practice, training, rehearsal, studying and gym, and can be skipped.
- God mode edits sports, music, fame and (after O1) crime careers, through normal validation.
- A 10,000-life simulation reports multi-career lives, load and burnout, skill curves, sports switching, band member skill growth, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing C2 (Career Hub) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (E6b, E6c), docs/portraits-and-ui.md and docs/careers-crime-and-ui.md (the decisions and section C2). Inspect careers, education, fame (E6b), sports (E6c), hobbies and activities (A1), talents, people and ties (E3, E4), burnout and god mode first. Extend them; don't duplicate them.

Build only C2, as section C2 describes:
- Rename the Job tab to Career: a "You" section with every active role and one key bar each, a Schedule row, Find work and Special careers sections.
- Multiple careers at once, with per-role time cost by commitment, total load raising Stress and burnout and lowering performance; numbers in balance/careers.yaml.
- A shared skills system (grow with use, fade after 2+ idle years, floor tied to peak) in balance/skills.yaml; move hobby skills and talents onto it.
- Sports: free joining, quitting and switching for kids and teens; one pro sport for adults; the Sports screen with Overview, Season, League and History tabs; performance enhancers with testing and suspension risk.
- Music: solo or band; auditions from a pool whose quality depends on fame, city and reputation; members as people with ties who improve with rehearsal; band strength feeding project quality; the band screen with Overview, Members, Releases and Shows tabs.
- Training pop-ups (2–3 seconds, skippable, reduced-motion aware).
- God mode editing for sports, music and fame careers (crime after O1), through normal validation.
- Follow the U2 density rules.
- Upgrade existing saves. Extend tools/simulate.ts with the C2 reports.

Meet every C2 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main with screenshots of the Career, Sports and band screens at 390×844, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## D1 — Drugs

**Objective:** Make drugs a real part of the world, from a first try to addiction, dealing and running a supply business, with consequences at every step.

### Player experience

- **Buying:** through dealers in your circle (people with a dealer role), friends who know someone, nightlife, or the **Black market** in Activities. Prices vary by drug, city and quality. Risks: getting ripped off, bad or cut product, getting robbed, or getting caught.
- **Using:** from your inventory or offered in events and at parties. Short-term effects on Happiness, Stress and Health; longer-term effects on Health, work, school and relationships.
- **Addiction:** builds with use, faster for characters with high vice susceptibility. Cravings, tolerance and withdrawal show up as events. People notice (E4 gossip, M1 noticing).
- **Overdose:** possible, more likely with harder drugs, mixing, and heavy use. It can lead to the ER, a close call, or rarely death. Never from a first, ordinary use without warning signs.
- **Recovery:** Activities → Recovery (support groups, rehab center, counseling), with relapse possible.
- **Dealing:** buy in bulk, sell to customers (people and events), set prices, manage stock and heat. Ties into O1 territory.
- **Growing and making:** as a business (a grow operation or a lab): setup cost, capacity, quality, yearly output, risk of raids, fires or theft, and the need to sell the product. Abstracted, never a process.

### Systems

- **Drug definitions** (YAML): name, category, street price range by city, effects, addiction strength, overdose risk, legal severity.
- **Inventory:** amounts held, as possessions with a hidden-stash option.
- **Use and addiction:** extends Stage 9's addiction conditions and vice; tolerance, cravings and withdrawal.
- **Overdose:** risk by drug, amount, mixing and tolerance, through the health and death systems.
- **Dealing:** a dealing role in the C2 Career hub, with customers, prices, stock, heat (E6a heat) and income as dirty money (E6a laundering).
- **Production:** extends W3 businesses with grow-op and lab types (capacity, quality, output, raid risk).
- **Legal:** possession, intent to sell, trafficking and manufacturing offenses with escalating sentences.
- **Athletes:** performance enhancers from C2 use this system.

### Acceptance criteria

- Drugs can be bought from dealers, contacts, nightlife and the black market, with prices and risks varying by drug, city and quality.
- Use changes stats as defined; addiction builds by vice susceptibility and use, with cravings and withdrawal.
- Overdose is possible, rare, and never from an ordinary first use without warning signs.
- Recovery works through Activities → Recovery, with relapse possible.
- Dealing and production run through the career, heat, dirty money, laundering and business systems.
- All offenses go through the legal system with escalating severity.
- Dealing, production and buying for resale are adults-only.
- No content gives real-world instructions; every D1 event is reviewed against the writing guidance and recorded in `docs/consistency-review.md`.
- A 10,000-life simulation reports use, addiction, overdose, recovery, dealing income and arrests, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing D1 (Drugs) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (E6a, M1, W3) and docs/careers-crime-and-ui.md (the decisions, writing guidance and section D1). Inspect health, addiction and vice, death, legal, heat and dirty money (E6a), businesses (W3), possessions, the Career hub (C2), Activities (U2) and people's lives first. Extend them; don't duplicate them.

Build only D1, as section D1 describes:
- Drug definitions in YAML (category, price ranges by city, effects, addiction strength, overdose risk, legal severity).
- Buying through dealers, contacts, nightlife and an Activities → Black market section, with rip-offs, bad product, robbery and arrest risks.
- Inventory as possessions with a hidden-stash option; use with short- and long-term effects; addiction with tolerance, cravings and withdrawal; overdose through health and death (rare, never without warning signs).
- Recovery in Activities → Recovery, with relapse.
- Dealing as a Career role (customers, prices, stock, heat, dirty money) and production as W3 business types (capacity, quality, output, raid risk).
- Escalating legal offenses; performance enhancers for athletes.
- Adults-only for dealing, production and buying for resale.
- Story and consequences only, never real-world instructions. Review every D1 event against the writing guidance and record it in docs/consistency-review.md.
- Upgrade existing saves. Extend tools/simulate.ts with the D1 reports and targets in balance/targets.yaml.

Meet every D1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## O1 — Organized Crime

**Objective:** Turn E6a's crews into four kinds of criminal organization you can join, rise through and lead, with territory and people working for you.

### Organization types

| Type | Ranks | What it does | Feel |
|---|---|---|---|
| **Street gang** | Associate → member → shot-caller → leader | Street dealing, robberies, protecting territory | Fast, loud, violent, young |
| **Mafia family** | Associate → soldier ("made") → capo → underboss → boss | Rackets (protection, gambling, loansharking), fronts, laundering | Slower, more money, strict codes and loyalty |
| **Cartel** | Worker → runner → lieutenant → plaza boss → leader | Supply and trafficking; supplies dealers and gangs (D1) | Huge money, extreme danger |
| **Motorcycle club** | Hang-around → prospect → patched member → officer → president | Runs, protection, side businesses, chapters | Brotherhood, rules, rivalries with other clubs |

### Player experience

- **Getting in:** through people in your circle, dealing (D1), prison, or events. Each type has its own initiation.
- **As a member:** jobs come as events and from your boss each year: runs, collections, dealing, robberies, protection, fights. Rank rises with results, loyalty and respect.
- **As a leader:** an **Organization screen** in the Career tab, with tabs **Overview | Members | Territory | Rivals**:
  - **Members:** each is a person with skill, loyalty, heat and a job. Assign each member a job for the year (dealing, runs, protection, robberies, laundering, recruiting, or lying low). Results come back in the year recap: money, heat, injuries, arrests.
  - **Territory:** each city has neighborhoods; controlling one brings yearly income and attention. Rivals try to take it, and you can expand.
  - **Rivals:** other organizations with strength and attitude toward you. Truces, wars and betrayals happen through events.
  - **Decisions:** promote, discipline or cut members; set your cut; deal with informants; make alliances.
- **Leaving:** possible, with the past following you, as in E6a.

### Systems

- **Organization definitions** (YAML): type, ranks, initiation, typical jobs, codes (for example, mafia rules against cooperating with police).
- **Generated organizations** per city with fictional names, strength, territory and leaders.
- **Neighborhoods** per city, in the city content, with income value and police attention.
- **Membership and rank** for the player, building on E6a's crew state.
- **Member jobs:** yearly assignment and resolution using each member's skill and loyalty, with outcomes through the ledger (dirty money), legal system (arrests, informants), health (injuries) and relationships.
- **Territory and rivals:** yearly contest for neighborhoods, war escalation, truces.
- **Supply chain:** cartels supply D1 drugs; gangs and clubs buy and deal.
- **Death:** violent organization lives can end in death, following the E6a rule (rare, only after clearly dangerous choices or a visibly escalating conflict).
- **God mode** gains crime career editing (from C2).

### Acceptance criteria

- All four types can be joined, risen through and led, each with its own ranks and initiation.
- Leaders can assign members to jobs yearly, with results applied through existing systems and shown in the year recap.
- Territory by neighborhood brings income and attention; rivals contest it; wars and truces happen.
- Cartels supply drugs used by dealers and gangs.
- Membership is adults-only; violent death follows the E6a rule.
- All names are fictional; no content gives real-world instructions; every O1 event is reviewed and recorded in `docs/consistency-review.md`.
- The law-abiding test player's targets stay met.
- A 10,000-life simulation reports membership by type, ranks reached, leadership, territory held, income, arrests, deaths and informants, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing O1 (Organized Crime) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (E6a) and docs/careers-crime-and-ui.md (the decisions, writing guidance and section O1). Inspect the E6a crew system, heat and dirty money, drugs (D1), legal, health, death, people and ties (E3, E4), cities, the Career hub (C2) and god mode first. Extend E6a; don't build a parallel system.

Build only O1, as section O1 describes:
- Organization definitions in YAML for street gangs, mafia families, cartels and motorcycle clubs (ranks, initiation, jobs, codes), and generated fictional organizations per city.
- Neighborhoods per city with income value and police attention.
- Joining, initiation, rank progression and member jobs as events.
- For leaders, an Organization screen in the Career tab with Overview, Members, Territory and Rivals tabs: yearly job assignment per member, results in the year recap through the ledger, legal, health and relationships; promotions, discipline, cuts, informants, alliances.
- Territory contests, wars and truces; cartels supplying D1 drugs to dealers and gangs.
- Adults-only membership; violent death following the E6a rule; crime career editing in god mode.
- All names fictional; story and consequences only. Review every O1 event and record it in docs/consistency-review.md.
- Follow the U2 density rules. Upgrade existing saves. Extend tools/simulate.ts with the O1 reports, keeping the law-abiding player's targets met.

Meet every O1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main with screenshots of the Organization screen, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## G1 — Mini-Games

**Objective:** Add quick, optional skill moments that make big moments feel played, not just read.

### Rules for every mini-game

- **Always optional:** every mini-game has an **Auto** button that resolves it from stats. Simulated test players always use Auto.
- **Stats shape difficulty:** a strong shooter gets a bigger, slower timing window; a weak one gets a small, fast one. Skill can push the odds, not replace them.
- **Saved for replay:** the result is recorded in the input log; replays use the stored result.
- **No grinding:** mini-games tied to activities follow the diminishing-returns rule.
- **Loaded only when used,** to keep the game fast to open.
- **Simple shapes and Fluent Emoji art;** no new art pipeline.
- **Accessible:** large touch targets, and reduced motion slows animations or offers Auto by default.

### The first pack

| Mini-game | Where it appears | How it plays |
|---|---|---|
| **Last shot / free throw** | Basketball big moments (C2 Season tab, events) | A timing bar; tap when the marker is in the zone |
| **Penalty kick** | Soccer big moments | Choose a spot and power; the keeper guesses |
| **Swing** | Baseball and golf big moments | A power-and-accuracy meter |
| **Lockpick** | Heists and burglaries (crime events, O1 jobs) | Rotate and tap to set pins before time runs out |
| **Getaway / run** | Runs and escapes (O1, D1) | Swipe to dodge obstacles for a few seconds |
| **Blackjack** | Activities → Casino | Hit or stand against the house, with real stakes through the ledger |
| **Slots** | Activities → Casino | A spin with a stop button |

### Acceptance criteria

- A shared framework: lazy loading, Auto resolution, stat-based difficulty, input-log recording, reduced-motion support.
- All seven mini-games work on phones at 390×844 and on desktop.
- Auto results and played results come from the same odds model, so playing well helps without breaking balance.
- Casino stakes go through the ledger and feed vice and gambling addiction.
- Replays reproduce stored results exactly.
- Initial bundle size doesn't grow by more than a few kilobytes.

### Coding-AI prompt

```text
You are implementing G1 (Mini-Games) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/careers-crime-and-ui.md (the decisions and section G1). Inspect the event engine, input log, sports (E6c, C2), crime and organizations (E6a, O1), drugs (D1), the casino (A1, U2), finance, vice and addiction first.

Build only G1, as section G1 describes:
- A shared mini-game framework: lazy-loaded modules, an Auto button that resolves from stats, stat-based difficulty, results recorded in the input log, reduced-motion support.
- The seven mini-games in the G1 table, hooked into sports big moments, heists, runs and escapes, and the casino.
- One odds model shared by Auto and played results; casino stakes through the ledger feeding vice and gambling addiction.
- Simple shapes and Fluent Emoji art only.
- Simulated players always use Auto.

Meet every G1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main with a short screen recording or screenshots of each mini-game, wait for CI, and report what you built, deviations and why, and open questions. Report only verified facts.
```
