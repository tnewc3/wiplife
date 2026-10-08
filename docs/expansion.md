# WIPlife — Expansion Plan

**Status:** Complete plan for everything after Stage 10: the consistency pass (C1), the first-wave expansions (E1–E6c), life stages and mental health (M1, T1, L1) and the second wave (W1–W6). This one file replaces both `docs/expansion.md` and `docs/second-wave.md`; delete `docs/second-wave.md` when adding it.

---

## Why expand

The MVP (Stages 1–10) covers a full life. The expansions are what make WIPlife better than other life sims. The first wave makes the people in your life a living web you can act on directly, continues lives across generations, and adds the big careers. The second wave widens the world: how you're remembered, where you belong, what you build, and where in the world you live.

## Roadmap

| Stage | Name | After it, the player can... |
|---|---|---|
| C1 | Consistency pass | Play lives where events fit their situation, and every money change is real and visible |
| E1 | Interaction menu | Chat, gift, argue, flirt, ask for help and more with anyone in their life, as often as they like |
| E2a | Children & parenting | Have, adopt or gain children, raise them, and shape who they become |
| E2b | Heir play & inheritance | Write a will, pass on an estate and family reputation, and continue as any child |
| E3 | People's own lives | See the people they know get jobs, move, fall in love and change on their own |
| E4 | Social web | See the people they know form their own relationships, feuds and gossip |
| M1 | Mental health | Live with depression, anxiety, PTSD or neurodivergence, choose how to treat it, and see who's there for them |
| E5 | Pets, vehicles & homes | Own pets, cars, vacation homes, and renovate |
| T1 | Teen years | Find their crowd, earn freedom, push against house rules, get into real trouble and figure out who they are |
| E6a | Crime careers | Join a crew, climb its ranks, and stay ahead of the police and rivals |
| E6b | Fame (arts & media) | Climb from nobody to superstar in music, acting, social media, or writing and art |
| E6c | Sports | Chase sports stardom with teams, contracts, injuries, trades and playoff runs |
| W1 | Eulogy | Hear their life described by the person closest to them, and see who didn't come |
| L1 | Later life | Grow old with grandkids, second acts, amends, care when it's needed, and an ending they can prepare for |
| W2 | Belonging | Join clubs, faith communities, causes and civic groups, rise in them, and be shaped by them |
| W3 | Businesses | Start a business of their own design, grow it, or buy an established one |
| W4a | Countries | Be born in or live in Canada, the UK or Mexico, each with its own rules |
| W4b | Language | Speak, learn and lose languages, with effects on jobs and friendships |
| W5 | Travel & time abroad | Take vacations, meet people abroad, and study or work overseas |
| W6 | Emigration & citizenship | Move countries legally or without papers, and work toward citizenship |

### Order

**Stage 10 → C1 → E1 → E2a → E2b → E3 → E4 → M1 → E5 → T1 → E6a → E6b → E6c → W1 → L1 → W2 → W3 → W4a → W4b → W5 → W6 → avatar stage → Stage 11 (Polish) → Stage 12 (Balancing) → Stage 13 (Launch).**

- **C1 comes first,** because every later stage adds dozens of events, and the consistency rules have to exist before that content is written.
- **E3 comes before E4,** because people need their own lives before they can have relationships with each other.
- **M1 after E4,** so people can notice and react through the social web; **T1 after E5,** for parenting style, cliques and a first car; **L1 after W1,** because end-of-life choices feed the eulogy.
- **W4a and W4b come before W5 and W6,** because travel and emigration need other countries and languages to exist.
- **Polish, balancing and launch come last,** because every expansion changes the economy, relationships and event frequencies. Doing them earlier would mean doing them twice. Each stage still keeps the simulation targets green, and the playable game on Netlify keeps updating along the way.
- **Launch (Stage 13) is postponed,** but its save-reliability and cross-browser work must still happen before real players arrive.

## Rules for every stage

- Same gate format as `docs/technical.md`: objective, player experience, systems, content, data, UI, dependencies, acceptance criteria, testing, failure modes and a coding-AI prompt.
- Follows AGENTS.md, including the content rules, the adults-only romance rule and the consistency rules from C1 (if it doesn't make sense, it doesn't happen).
- Upgrades existing saves, extends the simulation runner, and ends with a pull request into main with a green CI run.
- The repo's docs are the source of truth. Later changes to this plan arrive as edits, and "as built" notes go into `docs/technical.md` as stages land.

## Design changes

- **Pillar 1** becomes "Moments that matter": the story still comes from events, and a per-person interaction menu handles everyday relationships between them, designed so repeating an action never becomes a grind.
- **Core loop step 2** becomes "Manage and interact."

## First-wave decisions

| Area | Decision |
|---|---|
| First expansion | You interacting with people |
| Interaction style | Unlimited menu for each person |
| Preventing grinding | Repeats with the same person give less each year, and reactions vary and can backfire |
| Interaction groups | Everyday, conflict, romance (adults only), practical |
| Results | A short outcome card |
| Moods | Shown for close people only |
| Intimacy before children exist | Health risks now; pregnancy once children exist |
| Consistency | If it doesn't make sense, it doesn't happen; C1 runs before E1 |

Decisions for E2, E3–E4 and E5–E6 are listed at the start of their sections, and the second wave's before W1.

---

## C1 — Consistency Pass

**Objective:** Make the game follow one rule everywhere: if it doesn't make sense, it doesn't happen. Fix the problems found in playtesting, and add rules and checks so the same kinds of problems can't come back.

### Problems found in playtesting

| Problem | Root cause | Fix |
|---|---|---|
| "Years later" texts that don't fit when follow-ups arrive | Follow-ups can fire within a year, but the text assumes a long gap | Reword all of them; add an elapsed-time placeholder; the content build flags fixed time phrases |
| Test prompts when not in school | School events don't require enrollment | Category contracts |
| Shift cover, late and sick-day events when jobless or retired | Work events don't require a current job | Category contracts |
| Physically interacting with someone who moved away | In-person actions don't check location | Presence rules |
| "In town for a night" from a partner you live with | Casting ignores who lives with you | Presence rules and household awareness |
| Weddings cost nothing | No cost in the marriage flow | Wedding costs |
| Mental health events only involve friends; the partner never notices; choosing "call them" acts as if you're single | Casting and text ignore your partner | Household awareness and status-aware text |
| A late-life event about physical activity for a lab tech who never did any | Text states history the character doesn't have | Evidence rule |
| Lending money, babysitting and similar events don't change money; "help out for a price" pays nothing | Missing money effects | Money rule and content check |
| Rent increases are too small | Flat amounts instead of scaling with current rent | Rent changes scale with rent and update housing cost going forward |
| Money changes aren't visible | Outcome cards don't show amounts | Money shown on every change |
| Happiness averages about 93, so it stops meaning anything (found in Stage 10) | Events and lifestyle add more happiness than they take, with nothing pulling it back | Yearly drift toward a personal baseline; obituary thresholds go back to normal |
| About half of all events fired are repeats within the same life (found in Stage 10) | Too few events marked as one-time or with long cooldowns | Separate intentionally recurring events; cut other repeats |
| No grandparents in any life (found in Stage 10) | The family generator doesn't create them | Generate grandparents at creation; restore grandparent events |

### Rules (added to AGENTS.md)

1. **Category contracts.** Each event category declares required conditions, and the content build rejects events missing them. For example: school needs enrollment; work needs a current job and no retirement; partner needs a partner; parent needs a living parent.
2. **Presence.** Every cast role declares where the person must be: your household, your city, or anywhere. Casting picks only people who fit. Moving away, or a person moving, updates what's possible. In-person interactions and actions need the same city.
3. **Evidence.** Text that states something about your past must require the flag or memory that proves it.
4. **Time.** No fixed time gaps in follow-up text. An elapsed-time placeholder (for example `{since}`, rendering "last year", "a few years ago" or "a decade ago") fills in the real gap, or the text avoids time phrases.
5. **Money.** Text or labels that mention money must come with a money effect, and every money effect is shown. Situational amounts scale (rent changes are a percentage of current rent and change the housing cost going forward; pay scales with the job).
6. **Household.** If you live with a partner, events about your home, health or wellbeing account for them: they're cast, or the text branches.
7. **Status-aware text.** Text that depends on relationship status, job or school branches on it or requires it.

### Systems

- **Content build checks** for category contracts, presence declarations, time phrases in follow-ups, money words without money effects, and history statements without a required flag or memory. Where a check can't be exact (wording), it produces warnings for review rather than failing the build.
- **Runtime checks** in development and the simulation: an event firing outside its category contract or presence rule counts as an invariant failure.
- **Presence-aware casting.** Casting knows each person's city and whether they live with you. Partners you live with are preferred for home and wellbeing events.
- **Wedding costs.** Getting married offers a choice of wedding (courthouse, small, big), with costs through the finance module, help from family based on wealth and closeness, and the option of debt.
- **Money display.** Event and interaction outcome cards show each money change and your new balance. Choices that cost a known amount show it on the button (for example, "Lend $200").
- **Report a problem.** In development builds, a button on event and outcome cards copies the event ID, choice and a short state summary, so playtest notes are exact.

### Content review

- Every existing event is checked against the seven rules, starting with the content build's warnings.
- All "years later" style texts are reworded.
- Every flagged event is fixed or justified, and the results are written to `docs/consistency-review.md`.

### Acceptance criteria

- Every problem in the table above is fixed and covered by a test or a content-build check.
- The content build enforces category contracts and presence declarations, and warns on time phrases, money words without money effects, and unsupported history statements.
- A 10,000-life simulation finds zero category-contract or presence violations.
- Every money change in events and interactions is shown with its amount and the new balance.
- Weddings cost money according to the chosen size.
- Rent changes scale with current rent and change housing costs going forward.
- Average Happiness across simulated lives sits well below the maximum (target range in `targets.yaml`), and the obituary thresholds are set back to normal values.
- Repeats of events not marked as recurring are under 15% of events fired per life.
- Grandparents are generated at creation (alive or not, depending on ages) and appear in events.
- `docs/consistency-review.md` lists every flagged event and how it was resolved.

### Coding-AI prompt

```text
You are implementing C1 (Consistency Pass) of WIPlife. The rule: if it doesn't make sense, it doesn't happen.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (section C1, including the playtesting table). Inspect the existing event engine, casting, content build, finance, housing and relationship code first. Extend them; do not duplicate them.

Build only C1:
- Add the seven consistency rules to AGENTS.md (and its copy in docs/technical.md section P), as listed in C1.
- Content build: enforce category contracts and presence declarations; warn on fixed time phrases in follow-ups, money words without money effects, and statements about the player's past without a required flag or memory.
- Runtime: treat events that break a category contract or presence rule as invariant failures in development and the simulation.
- Presence-aware casting using each person's city and who lives with you; prefer a live-in partner for home and wellbeing events.
- An elapsed-time placeholder for follow-up text.
- Wedding costs: courthouse, small or big, through the finance module, with family help and the option of debt.
- Rent changes as a percentage of current rent that update housing cost going forward.
- Show every money change with its amount and the new balance on event and interaction outcome cards; show known costs on choice buttons.
- A development-only "Report a problem" button that copies the event ID, choice and a short state summary.
- Review every existing event against the seven rules, starting with the build warnings. Reword every "years later" style text. Fix each problem in the C1 playtesting table, with a test or build check for each. Record every flagged event and its resolution in docs/consistency-review.md.

Meet every C1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you fixed, the review summary, deviations and why, and open questions. Report only verified facts.
```

---

## E1 — Interaction Menu

**Objective:** Let players act on their relationships directly, as often as they like, without it turning into a grind.

### Player experience

On any person's page, an **Interact** button opens a menu grouped into Everyday, Conflict, Romance and Practical. Only interactions that make sense right now are shown. Choosing one shows a short outcome card with the person's reaction, what changed in words, and sometimes a choice when the moment is big (an argument that could escalate, an intimate moment). For close people, their current mood is shown ("in a great mood," "stressed," "annoyed with you").

Interactions are unlimited, but each repeat with the same person gives less that year, and how someone reacts depends on their personality, mood and history with you. Compliment someone ten times in a row and they'll start finding it strange.

### First interactions (about 20)

| Group | Interactions |
|---|---|
| Everyday | Chat, spend time, compliment, give a gift (small, medium or big), hug, joke around |
| Conflict | Argue, insult, prank, pick a fight |
| Romance (adults only) | Flirt, go on a date, kiss, be intimate |
| Practical | Ask for money, ask for advice, apologize, ask a favor, offer help |

### Systems

- **Interactions as content.** Each interaction is a YAML definition: who it's available with (relationship kinds, ages, status), whether it needs to happen in person, its outcome tiers, effects and text variants.
- **Reaction roll.** Each interaction rolls an outcome tier: great, good, neutral, bad or backfire. The odds come from the person's personality and mood, affection and trust, your relevant stats (Looks, Confidence, Kindness), memories between you, and how often you've already done it this year. All numbers live in `balance/interactions.yaml`.
- **Diminishing returns.** A per-person, per-year counter for each interaction and in total. Gains shrink with each repeat, and repeating the same thing raises the chance of annoying the person. Counters reset each year.
- **Mood.** A new value on each person. It starts each year from their personality and circumstances, moves with interactions and events, and drifts back toward their baseline. Close people (family, partner, friends above an affection level) show it as a word; others keep it hidden.
- **In person or remote.** In-person interactions (spend time, hug, fight, date, intimacy, give a gift) need the person to live in the same city. Remote ones (chat, apologize, ask for advice or money) work anywhere. In prison, only visit-style interactions are available.
- **Big moments.** Some outcome tiers open a choice inside the outcome card, such as walking away from an argument or keeping it going.
- **Links to existing systems:**
  - **Gifts** spend real money through the finance module (savings first, then debt).
  - **Asking for money** depends on the person's new **wealth level**, set from their occupation and family background. Repeated asks cost trust. Money can come as a gift or a loan; a loan leaves a memory and can lead to events about repaying it.
  - **Picking a fight** can cause an injury through the health system and an assault charge through the legal system for adults, or school discipline for minors.
  - **Intimacy** carries a health-risk chance through the health system (a few new conditions). With someone other than your partner, it sets cheating flags that the existing discovery events can pick up. Pregnancy waits until E2.
  - **Flirting** with someone else while in a relationship can also be discovered.
- **Memories.** Notable outcomes write memory tags (for example, `big_fight`, `generous_gift`, `lent_money`, `humiliated_them`) that later events check.
- **History.** Big moments go into life history.
- **Input log and determinism.** Every interaction is recorded in the input log and rolled with the seeded generator, so lives still replay exactly.

### Content

- About 20 interactions, each with 3–5 outcome tiers and 2–3 text variants per tier, using pronoun placeholders.
- About 10 new events that react to the new memory tags.
- Romance interactions are marked as romance, so the existing adults-only rule applies. The content build also rejects any romance interaction without an 18+ requirement for both people, and any romance or intimacy with family.
- Intimacy text is suggestive, never graphic.

### Data

- `InteractionDef` content type with its schema.
- `Person`: `mood` and `wealthLevel`.
- `Relationship`: interaction counts for the current year and the year of the last interaction.
- A pending interaction result, so the outcome card survives a reload.
- Save upgrade for existing lives.

### UI

- Interact button on each person's page, opening a grouped bottom sheet that only shows available interactions.
- Gift sheet with price tiers and the cost shown.
- Outcome card in the same style as event cards, with an optional choice.
- Mood word for close people, on their page and in the People list.

### Dependencies

Stages 5, 6 and 9, all done. Start after Stage 10 is merged to avoid conflicts in event content.

### Acceptance criteria

- Interactions only appear when valid: right relationship, ages, city (for in-person), alive, and not blocked by prison or estrangement (except apologize).
- No romance interaction is ever available unless both people are 18 or older and not family. Both the engine and the content build enforce this.
- Repeating one interaction can't take a neutral relationship to maximum affection within a single year, and the simulation proves it with a spamming test player.
- Backfires happen, and get more likely with repetition and a bad mood.
- Gifts, loans and asking for money all go through the existing finance module, so no money appears from nowhere.
- Fights can lead to injuries and assault charges through the existing systems. Intimacy health risks go through the health system.
- Moods are visible for close people only.
- Lives with interactions replay exactly from the input log.
- At least 10 events check memories written by interactions.
- The simulation runner includes interactions for all three test players, plus a spamming player, and reports: interactions per year, outcome tier rates, how many relationships reach maximum affection, money given and borrowed, fights leading to charges, and new health risks. Zero invariant failures.

### Testing

- Unit tests for the reaction roll, diminishing returns, mood drift, availability rules, the adults-only rule for interactions, and each link (gift, loan, fight, intimacy).
- End-to-end tests at phone size: open the menu, perform an everyday interaction, a gift with money taken, a fight escalating, and checking a mood on a close person.
- 10,000-life simulation with the new players.

### Common failure modes

- Interactions that always succeed, which makes them a grind.
- Interactions so random that players stop trusting them.
- Money created or lost outside the finance module.
- Menus crowded with options that don't fit the situation.
- Text that repeats so much that interactions feel robotic.

### Coding-AI prompt

```text
You are implementing expansion E1 (Interaction Menu) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (section E1). Inspect the existing code first, especially the relationship, event, finance, health and legal systems. Extend them; do not duplicate them.

Build only E1:
- InteractionDef as a YAML content type with a Zod schema: availability (relationship kinds, ages, status, in-person or remote), outcome tiers (great, good, neutral, bad, backfire) with effects and 2–3 text variants each.
- A reaction roll using the person's personality and mood, affection, trust, memories, the player's relevant stats, and repeats this year. All numbers in balance/interactions.yaml.
- Diminishing returns per person per year, with repeats raising the chance of annoyance. Counters reset yearly.
- A mood value on each person: yearly baseline from personality and circumstances, moved by interactions and events, drifting back. Show it as a word only for close people.
- A wealth level on each person, from occupation and family background.
- Links: gifts and money requests through the finance module; fights to injuries and assault charges (school discipline for minors); intimacy to health risks and cheating flags. No pregnancy yet.
- Romance interactions are marked romance so the adults-only rule applies; the content build rejects romance interactions without 18+ for both people, or with family.
- Record every interaction in the input log and use the seeded generator.
- A pending interaction result so the outcome card survives a reload. Upgrade existing saves.
- UI: Interact button on each person's page, a grouped bottom sheet showing only available interactions, a gift sheet with price tiers, an outcome card with an optional choice, and mood words for close people.
- About 20 interactions and about 10 new events that check the new memory tags, following AGENTS.md (intimacy is suggestive, never graphic).
- Extend tools/simulate.ts: interactions for all three test players, plus a spamming player, and the reports listed in the E1 acceptance criteria.

Meet every E1 acceptance criterion. When finished, run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E2 — Children & Heir Play: decisions

E2 is the largest expansion, so it's split into two stages: **E2a** (children and parenting) and **E2b** (heir play and inheritance).

| Area | Decision |
|---|---|
| Ways to have children | Pregnancy, adoption, IVF or surrogacy, stepchildren through marriage |
| Who can carry a pregnancy | Based on gender category: women can, men can't, and nonbinary characters choose at creation |
| Raising children | Deep: your parenting style shapes their personality and future |
| Unplanned pregnancy | Possible from intimacy, with a protection choice |
| Unplanned pregnancy choices | Keep it, place for adoption, or end the pregnancy |
| Miscarriage | Possible, rare, handled with weight |
| A child dying before you | Possible, rare, handled with weight |
| Heir | Any child, at any age |
| Inheritance | Money and property, family relationships, family reputation, and possessions (once E5 exists) |
| Estate | Optional will; without one, split between spouse and children |
| Genetics | Looks, stats, health risks, personality tendencies and talents; orientation and gender identity are not inherited |

### Writing guidance for E2

- **Ending a pregnancy** is written neutrally and without judgment. The partner's reaction depends on their personality and your relationship. Since the game doesn't model state-by-state laws, the option works the same in every city.
- **Miscarriage and a child's death** never come from throwaway events. Each leads to a grief chain and leaves a lasting mark on the life history and obituary.
- **Harsh parenting** can exist and carries consequences, following the existing content rules: never sexual, never graphic.
- **The player's children are under 18 for much of the game.** No romance or sexual content involving them, ever. The existing adults-only rule already covers them, and the content build checks it.

---

## E2a — Children & Parenting

**Objective:** Let players have or gain children in every way they chose, and make how they raise them matter.

### Player experience

- **Having children:** with a partner, "Try for a baby" appears as an action when one of you can carry a pregnancy. Intimacy can also lead to an unplanned pregnancy, depending on the protection choice in its outcome card. An unplanned pregnancy offers three choices: keep it, place for adoption, or end it. Couples who can't conceive, or don't want to, can try IVF or surrogacy (costly, with odds that fall with age) or adopt (with eligibility checks and a wait). Marrying someone with children makes them your stepchildren.
- **The year after a pregnancy begins,** the baby is born in a birth event. Rarely, a pregnancy ends in miscarriage, followed by a grief chain.
- **Raising children:** your kids appear in the People tab with their own page. The E1 menu gains parenting interactions (read together, help with homework, praise, discipline, play, ignore), and events ask you to make parenting decisions at every stage: tantrums, school trouble, teenage rebellion, leaving home.
- **Parenting style:** everything you do builds a style along three lines: warm or cold, strict or relaxed, involved or absent. Over the years it shapes each child's personality, grades, mood and trust in you. They remember it, and later events (and their own life, in E2b) bring it back.
- **Family costs and custody:** children cost money every year, depending on city and lifestyle. If you divorce, a custody event lets you fight for custody, share it, or give it up, and child support goes through the ledger.
- **Grown children** move out, start careers and can need (or offer) help. Rarely, a child dies before you.

### Systems

- **Fertility.** Whether a couple can conceive depends on who can carry a pregnancy, both ages (fertility falls with age), and health. Numbers live in `balance/family.yaml`.
- **Pregnancy.** A pregnancy record with its start year, how it began, and the other parent. The decision event comes first (for unplanned pregnancies), then birth or miscarriage the next year.
- **Adoption, IVF and surrogacy.** Eligibility (age, record, money, housing), costs through the finance module, waiting times and success odds.
- **Stepchildren.** Generated potential partners can have children, depending on their age. Marriage turns them into stepchildren.
- **Child simulation.** Children are people with fuller data than other NPCs: stats, personality, hidden values, school progress and mood, updated each year by a light version of the education and stat systems.
- **Parenting style.** Three values on each parent-child relationship, moved by parenting interactions and event choices. Each year they nudge the child's personality, grades, mood and trust, and notable moments become memories on the child's side (such as `parent_missed_recital`).
- **Genetics.** A child's starting looks, stats, health risk, personality tendencies and talent chance come from both biological parents with random variation. Adopted children are generated independently. Orientation and gender identity, including hidden ones, are rolled independently.
- **Ledger and custody.** A yearly cost per child in the ledger, a custody event on divorce, and child support payments.
- **Grief chains.** Events after a miscarriage or a child's death that affect happiness, stress and the partner relationship, plus history entries.

### Content

- About 50 events: trying to conceive, pregnancy, birth, adoption, IVF and surrogacy, parenting at every age, custody, grown children, and the grief chains.
- About 6 parenting interactions added to the E1 menu.

### Data

- Who can carry a pregnancy (from gender category, or the creation choice for nonbinary characters).
- Pregnancy record, child data on people, parenting style values on relationships, and the `child` relationship kind (planned since Stage 2).
- Save upgrade for existing lives.

### UI

- Children in the People tab with their own page, parenting interactions and parenting-style words (for example, "You've been warm but strict").
- Pregnancy shown on Home while it lasts.
- Adoption and IVF options under More, with costs and odds shown in words.
- Custody result and child costs on the Money tab.

### Dependencies

E1 (the menu that parenting interactions extend).

### Acceptance criteria

- A pregnancy only happens between two adults when one of them can carry it. An unplanned pregnancy depends on the protection choice and fertility.
- An unplanned pregnancy always offers all three choices, written neutrally.
- IVF, surrogacy and adoption costs go through the finance module, and their odds and eligibility follow `balance/family.yaml`.
- Children's starting values sit between their biological parents' with variation. Identity traits are never inherited.
- Parenting style measurably changes children's personality and grades in the simulation, in both directions.
- No romance or sexual content ever involves a child; the engine and the content build both enforce it.
- Miscarriage and child death rates match targets in `targets.yaml` and always lead to their grief chains.
- Child costs, custody and child support appear in the ledger.
- A 10,000-life simulation with zero invariant failures reports births per life, adoption, IVF and surrogacy rates, miscarriage and child death rates, custody outcomes, and how parenting style affects children.

### Common failure modes

- Children who are just names that age, with no real presence.
- Parenting style effects too small to notice, or so large they feel scripted.
- Heavy moments (miscarriage, a child's death, ending a pregnancy) written carelessly or treated as routine.
- Child costs that make having kids financially impossible, or free.

### Coding-AI prompt

```text
You are implementing expansion E2a (Children & Parenting) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E2 decisions, writing guidance and section E2a). Inspect the existing code first, especially relationships, interactions (E1), finance, education and health. Extend them; do not duplicate them.

Build only E2a:
- Who can carry a pregnancy: from gender category, with a creation choice for nonbinary characters (add it to custom creation and to random starts).
- Fertility, pregnancy records, "Try for a baby", unplanned pregnancy from intimacy depending on the protection choice in its outcome card, the three-choice unplanned pregnancy event (keep, place for adoption, end), birth the following year, and rare miscarriage with a grief chain. Numbers in balance/family.yaml.
- Adoption, IVF and surrogacy with eligibility, waits, odds and costs through the finance module. Stepchildren through marrying someone with children.
- Children as people with fuller data, updated yearly (stats, personality, school progress, mood), using the existing systems in a light form.
- Parenting style (warmth, strictness, involvement) on each parent-child relationship, moved by about 6 new parenting interactions in the E1 menu and by event choices, shaping the child yearly and writing memories on the child's side.
- Genetics: starting values from both biological parents with variation; identity traits rolled independently, never inherited.
- Yearly child costs, custody on divorce and child support in the ledger. Rare child death with a grief chain.
- UI: children in the People tab, parenting interactions and style words, pregnancy on Home, adoption and IVF under More, custody and child costs on the Money tab.
- About 50 events following AGENTS.md and the E2 writing guidance: neutral writing about ending a pregnancy, weight for loss, and no romance or sexual content ever involving a child.
- Upgrade existing saves. Extend tools/simulate.ts with the reports in the E2a acceptance criteria and targets in balance/targets.yaml.

Do not build heir play, wills or inheritance (that is E2b).

Meet every E2a acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E2b — Heir Play & Inheritance

**Objective:** Make a death the start of the next chapter: pass on an estate, a family reputation and a family, and continue as any child.

### Player experience

- **Wills:** under More, "Write a will" lets you split your estate by percentage between your spouse, children, other people you know, or a cause. You can change it any time. Without one, the estate is split between your spouse and children by default.
- **When you die,** the Death screen shows the estate being settled: debts paid first, then what each person receives. If you have living children, you choose one to continue as, at whatever age they are, or start a new life instead.
- **Continuing as a child:** your heir starts at their current age, with the family you left behind seen from their side. Your spouse is now their parent (or stepparent), your other children their siblings, your parents their grandparents. They remember how you raised them, and events bring it up.
- **A minor heir** lives with their surviving parent. If there isn't one, a relative becomes their guardian, and if no one can, foster care follows as an event path. Anything they inherit is held in trust until 18.
- **Family reputation:** what your family is known for (a conviction, wealth, generosity, a scandal) passes to your heir. It affects how people and employers treat them, and events can bring it up.
- **The archive** groups lives into family lines, showing each generation.
- **Inheritance drama:** events where siblings dispute a will, an estranged child contests it, or an unexpected beneficiary appears.

### Systems

- **Will.** Beneficiaries and shares, stored on the life, edited through a management action.
- **Estate settlement.** Debts other than mortgages are paid from savings and assets. Property passes with its mortgage. If the estate is negative, heirs receive nothing (debts aren't passed to heirs). Without a will, shares follow `balance/family.yaml` (for example, half to a spouse and the rest split between children; with no spouse, children share equally; with no children, parents or siblings).
- **Heir conversion.** A child becomes the new player character: their child data expands into a full character, relationships are rebuilt from their point of view, inherited money and property move to them (in trust if under 18), the guardian and housing are set, family reputation carries over, and `lineage` records the generation and parent life.
- **Childhood recap.** The heir's life history starts with a short summary of their life so far, built from their memories and milestones.
- **Family reputation.** A value on the family line that changes with notable deeds and sets the heir's starting reputation. Numbers in balance.
- **Trust.** Inherited money for a minor heir is locked until 18, then released.
- **Possessions hook.** The estate settlement leaves a clear place for E5 possessions to pass on.

### Content

About 25 events: will disputes, contested estates, unexpected beneficiaries, guardianship and foster care for minor heirs, receiving an inheritance, living with a family reputation, and memories of the previous generation.

### Data

- `Will` on the life state.
- Family line record: family reputation and generations.
- Trust balance and release age for minor heirs.
- Archive entries grouped by family line.
- Save upgrade.

### UI

- Write a will under More.
- Estate settlement and heir choice on the Death screen.
- A short "Previously" card when continuing as an heir.
- Family lines in the archive.

### Dependencies

E2a.

### Acceptance criteria

- Without a will, the estate is split by the default rules. With one, it follows the will exactly.
- Debts are paid before inheritance, and heirs never inherit debt beyond the property it's attached to.
- Any living child can be chosen as heir at any age, and the new life starts correctly: relationships rebuilt from their view, inherited assets in place, guardian and housing set for minors, and money in trust until 18.
- Lives continue correctly across at least three generations, with zero invariant failures.
- Family reputation carries over and measurably affects the heir.
- The heir's memories of being raised appear in events.
- The archive shows family lines.
- In a 10,000-life simulation that continues as heirs for three generations: how often heirs are minors, inheritance amounts, and a check that family wealth doesn't grow without limit across generations (a target in `targets.yaml`).

### Common failure modes

- Relationships rebuilt from the wrong point of view (your spouse listed as the heir's spouse).
- Money created or lost during estate settlement.
- Family wealth snowballing across generations until money stops mattering.
- Minor heirs getting adult options, or having no one to live with.

### Coding-AI prompt

```text
You are implementing expansion E2b (Heir Play & Inheritance) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E2 decisions and section E2b). Inspect the existing code first, especially E2a's children, the finance module, the archive and the lineage fields. Extend them; do not duplicate them.

Build only E2b:
- A will on the life state (beneficiaries and percentage shares), edited through a "Write a will" action under More.
- Estate settlement at death: debts other than mortgages paid first, property passing with its mortgage, no inherited debt beyond attached property, then distribution by the will or by default shares in balance/family.yaml.
- Heir choice on the Death screen: any living child at any age, or a new life.
- Heir conversion: expand the child into a full character, rebuild relationships from the heir's point of view, move inherited assets (in trust until 18 for minors), set guardian and housing (surviving parent, then a relative, then a foster care event path), carry family reputation, and update lineage.
- A "Previously" card and a childhood recap at the start of the heir's history.
- Family reputation on the family line, set by notable deeds, numbers in balance.
- Archive entries grouped by family line.
- About 25 events following AGENTS.md: will disputes, contested estates, guardianship and foster care, inheritance, family reputation, memories of the previous generation.
- A clear extension point for E5 possessions in estate settlement.
- Upgrade existing saves. Extend tools/simulate.ts to continue as heirs for three generations and report the E2b metrics, with a family wealth target in balance/targets.yaml.

Meet every E2b acceptance criterion. Run all checks and a 10,000-life, three-generation simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E3 & E4 — People's Own Lives and the Social Web: decisions

| Area | Decision |
|---|---|
| What people do on their own | Careers and money, love lives, moving, having kids and growing up, and trouble (illness, crime, addiction) |
| How you find out | A yearly "news from your people" feed, plus event cards for big news |
| How much their lives pull you in | Often: they ask for help, invite you and need you |
| Who is simulated | Everyone you know, in more detail the closer they are to you |
| Relationships between other people | Family with each other, your partner with your family and friends, friends with each other (coworkers aren't included) |
| Gossip | Spreads through people who know each other, and stories get twisted or made up |
| Secrets gossip can expose | Any, including affairs, crimes and identity |
| Your role in the web | Introduce people and take sides |
| Staying neutral in a feud | Possible, but it costs you with both sides |

### Writing guidance for E3 and E4

- **Being outed** is always handled with weight, never played for laughs. It runs through the existing coming-out reactions (based on affection and trust), and the player always gets to respond.
- **Low-stakes rumors can be funny,** in keeping with the balanced tone. Twisted versions of serious secrets stay serious.
- **The adults-only rule covers everyone:** romance between other people, including the player's friends and children, only happens between adults. The engine enforces it.
- **Requests for help** (bail, caring for a parent, an intervention) are real choices with costs either way, never a guilt trip with one right answer.

---

## E3 — People's Own Lives

**Objective:** Make the people in your life live their own lives, and pull you into them.

### Player experience

- **Each year,** a "news from your people" section in the recap and on Home lists what happened to the people you know: your sister got promoted, an old friend moved to Chicago, your father was diagnosed with diabetes, your college roommate got married.
- **Big news arrives as event cards** that involve you: a wedding invitation, a friend asking for bail money, a sibling asking you to cosign a loan, a parent who can no longer live alone, a friend who has relapsed, a baby shower, a funeral.
- **People's pages** show their job, partner, children, city and current troubles, so you always know where they are in life.

### Systems

- **Life tiers.** Close people (family, your partner, close friends) get a fuller yearly update. Everyone else gets a lighter one with only major milestones. Tiers follow closeness and change as relationships change.
- **People's yearly step.** For each person, by tier:
  - **Career and money:** finding and losing jobs and promotions, using the existing job definitions and balance numbers, which updates their wealth level from E1.
  - **Love life:** dating, marrying, divorcing and being widowed. A partner can be someone off your list, or (from E4) someone in your circle. Adults only.
  - **Moving, kids and growing up:** moving cities, having children (kept off your People list unless they enter your life), and children in your circle aging into adults.
  - **Trouble:** illness from the existing health conditions, crime from existing offenses, and addiction, with recovery paths.
- **Reuse, not duplication.** People's lives use the existing content (jobs, conditions, offenses, cities) and balance numbers, through a simpler summary model. They don't run a second copy of the player's systems.
- **News feed.** Each year's notable changes become short news lines, kept in a capped log.
- **Requests.** Changes in people's lives can trigger events that involve you. These count toward the pacing director's yearly budget, so the cap of 6 still holds.
- **Care for aging parents.** A chain where a parent needs care: move them in, pay for care, or leave it to a sibling. It connects to housing, money and the social web.

### Content

- About 40 events driven by people's lives: weddings, births, funerals, bail, loans and cosigning, care for parents, interventions, celebrations, someone moving away.
- About 60 news line templates.

### Data

- On each person: life tier, career summary (job and level), their own partner and children, current troubles, and a gossip tendency (used by E4).
- A capped news log per year.
- Save upgrade.

### UI

- "News from your people" in the year recap and on Home.
- Fuller person pages: job, partner, children, city, troubles.

### Dependencies

E2b (children and heir play exist, so people's kids and family rebuilds work across generations).

### Acceptance criteria

- People's lives change every year, with rates for jobs, marriage, divorce, moves, children, illness and crime close to the player's own rates (targets in `targets.yaml`).
- Romance between other people only ever involves adults; the engine enforces it.
- The yearly feed shows each notable change once, and big changes become event cards.
- Requests route through existing systems: bail through legal and money, care through housing and money, loans through the debt system.
- Requests count toward the pacing budget, and the cap of 6 events per year still holds.
- The People list stays within its existing cap.
- `beginYear` stays under 20 ms on a mid-range phone with the full circle simulated.
- A 10,000-life simulation reports people's life outcomes, request frequency and feed length, with zero invariant failures.

### Common failure modes

- Every person's life feeling the same, or changing so much it's noise.
- So many requests that the player's own story disappears.
- A second, drifting copy of the career or health system.
- Performance dropping as circles grow.

### Coding-AI prompt

```text
You are implementing expansion E3 (People's Own Lives) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E3 & E4 decisions, writing guidance and section E3). Inspect the existing code first: people, relationships, interactions (E1), children and heirs (E2), careers, health, legal, finance and the pacing director. Reuse existing content and balance numbers; do not build a second copy of the player's systems.

Build only E3:
- Life tiers by closeness, and a yearly step for people: career and money (updating wealth level), love life (adults only, enforced by the engine), moving, having children, growing up, and trouble (illness, crime, addiction with recovery), using a simpler summary model over existing content.
- A news feed: notable changes become short lines in a capped yearly log, shown in the year recap and on Home.
- Request events driven by people's lives (weddings, bail, loans and cosigning, interventions, funerals, care for aging parents), counted in the pacing budget.
- Fuller person pages: job, partner, children, city, current troubles.
- About 40 events and about 60 news templates, following AGENTS.md and the E3 & E4 writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the E3 reports and targets in balance/targets.yaml, and measure beginYear time.

Do not build relationships between other people, gossip or feuds (that is E4).

Meet every E3 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E4 — Social Web

**Objective:** Connect the people in your life to each other, so what happens between them, and what they say about you, shapes your story.

### Player experience

- **The people you know have relationships with each other.** Your parents' marriage can be happy or falling apart. Siblings can be close or bitter rivals. Your mother might never accept your spouse. Two of your friends might start dating, or stop speaking.
- **Each person's page has a Connections section** showing who they're close to and who they're feuding with, in words.
- **Feuds pull you in.** When people you know fall out, events ask you to take a side or stay neutral. Taking a side costs you with the other person. Staying neutral is allowed, but both sides think a little less of you every year it lasts.
- **You can introduce people** to each other through the interaction menu. Introductions can turn into friendships, rivalries or (between adults) romance.
- **Gossip travels.** What you do can be seen by someone, and then spread to the people they know, changing along the way. Different people can believe different versions: your sister heard you lost your job, your aunt heard you were fired for stealing. Secrets can come out, including affairs, crimes, debts and your identity.
- **You can push back** with "Set the record straight" in the interaction menu, which may or may not convince someone, and "Ask them to keep it quiet," which depends on trust.

### Systems

- **Ties.** A relationship record between two people in your circle: kind (married, dating, siblings, parent and child, in-law, friends), affection and status (close, normal, strained, feuding). Created from family structure, when your partner meets your family and friends, between friends who share a city or school, and by introductions. Ties drift and change yearly and through events.
- **Feuds.** A tie that falls below a set level becomes a feud. Feuds trigger side-taking events, cost both sides' affection with you each year you stay neutral, and can be resolved by events, time or mediation choices.
- **Knowledge and gossip.**
  - Notable things about you (and about other people) become knowledge items: what happened, whether it's a secret, and who knows which version.
  - Each year, items spread along ties, weighted by closeness and each person's gossip tendency.
  - Each time an item passes from one person to another, there's a chance it twists into a different version. Twisted versions are defined in content (for example, "lost job" can become "fired for stealing").
  - Each person reacts to the version they believe, through affection and trust changes and existing events. A partner learning of an affair triggers the existing discovery chain; family learning of your identity triggers the coming-out reactions.
- **Secrets.** Affairs (from cheating flags), crimes not yet known, hidden debts, addiction, and identity you've accepted but not shared. Each starts known only to whoever witnessed it.
- **New interactions.** Introduce (choose another person you know), set the record straight, and ask to keep it quiet.

### Content

- About 35 events: feuds and side-taking, family tension, in-law conflict, friends dating or falling out, gossip reaching someone, secrets coming out, being outed, and mediation.
- Twisted versions for each kind of secret and rumor.
- The three new interactions.

### Data

- Ties between people in your circle.
- Knowledge items with who holds which version.
- Save upgrade.

### UI

- Connections on each person's page.
- "What they've heard" on close people's pages, shown as their version of the story.
- The new interactions in the menu, with "Introduce" opening a picker of people you know.

### Dependencies

E3.

### Acceptance criteria

- Ties exist for all three kinds, created sensibly: parents have a tie to each other, your partner forms ties with your family and friends when they meet, and friends who share a context can form ties.
- Ties always involve two living people in your circle, are the same from both sides, and never hold a romance unless both people are adults and not family.
- Feuds form and end. Staying neutral costs affection with both sides each year, and taking a side changes affection with both.
- Introductions create ties, and introduced adults can become a couple.
- Gossip spreads along ties, twists at the set rate, and different people can hold different versions. Each person reacts to the version they believe.
- Secrets, including identity, can come out through gossip. Identity coming out triggers the coming-out reactions, and the player always gets to respond.
- "Set the record straight" and "Ask them to keep it quiet" work some of the time, depending on trust and closeness.
- `beginYear` stays under 20 ms on a mid-range phone.
- A 10,000-life simulation reports feuds per life, how far and how fast secrets spread, how often stories twist, how often secrets come out by kind, and the effect on relationships, with zero invariant failures.

### Common failure modes

- Gossip spreading so fast that no secret ever lasts, or so slowly it never matters.
- Feuds everywhere, making every relationship feel hostile.
- Twisted stories that make no sense, or a twist that's funny when it should be serious.
- Ties left pointing at people who died or left your circle.
- Performance dropping as ties grow.

### Coding-AI prompt

```text
You are implementing expansion E4 (Social Web) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E3 & E4 decisions, writing guidance and section E4). Inspect the existing code first: people's lives (E3), relationships, interactions (E1), children and heirs (E2) and the event engine. Extend them; do not duplicate them.

Build only E4:
- Ties between people in your circle (married, dating, siblings, parent and child, in-law, friends) with affection and status, created from family structure, when your partner meets your people, from shared context, and by introductions; yearly drift and change. Ties are the same from both sides, only between living people in your circle, and romance ties only between unrelated adults.
- Feuds: a tie below a set level becomes a feud, triggering side-taking events; staying neutral costs affection with both sides each year; feuds can end.
- Knowledge and gossip: knowledge items for notable facts and secrets (affairs, unknown crimes, hidden debts, addiction, identity accepted but not shared), holders and their versions, yearly spread along ties weighted by closeness and gossip tendency, twisting into content-defined versions, and reactions based on each person's version (reusing the existing discovery and coming-out chains).
- Three new interactions: Introduce (with a picker), Set the record straight, Ask them to keep it quiet.
- UI: Connections and "What they've heard" on person pages, and the new interactions.
- About 35 events and twisted versions for each secret and rumor kind, following AGENTS.md and the E3 & E4 writing guidance (being outed is handled with weight and the player always gets to respond).
- Upgrade existing saves, rebuilding ties correctly during heir conversion. Extend tools/simulate.ts with the E4 reports and targets in balance/targets.yaml, and measure beginYear time.

Meet every E4 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Life stages and mental health: decisions

| Area | Decision |
|---|---|
| Teen years | Social life, freedom, rebellion and trouble, and figuring yourself out |
| School social life | Cliques you can join, switch or clash with |
| Steering teen years | Teen actions, plus a yearly focus (school, friends, work or a passion) |
| House rules | Set by your parents' personality and parenting style; you can push back |
| Teen trouble | Up to underage drinking, drugs, fights and vandalism, with real consequences |
| Teen romance | None; dating starts at 18 |
| Later life | Family, health and independence, freedom, and reflection |
| Decline | Light, but care can become necessary near the end |
| Reflection | Late-life chances to make amends, and regrets and proud moments at the end |
| Grandparenting | Full relationships with grandkids, and raising a grandchild if needed |
| End of life | Sometimes you see it coming, with end-of-life choices (hospice, final wishes, who's there) |
| Mental health coverage | Ongoing conditions, treatment and recovery, crisis moments |
| Conditions | Depression, anxiety, PTSD after traumatic events, ADHD and other neurodivergence from birth |
| Visibility | Named on the Health page once diagnosed |
| Treatment | Therapy, medication, leaning on people, or ignoring it, each with trade-offs |
| Effect on play | Stat effects, and the people around you notice and are affected |
| Others' reactions | From supportive to dismissive, based on each person's personality and values |

### Life stages and mental health: writing guidance

- **Mental health** is written accurately and without stigma. Conditions are part of a life, not the whole of it. Treatment is never shown as weakness or a magic fix.
- **Suicide and self-harm are never player choices,** and the game never describes methods. They can exist in the story (for example, losing someone), handled with care and pointing toward help.
- **Medication** is described generally ("an antidepressant," "ADHD medication"), never with doses or instructions.
- **Neurodivergence** comes with strengths as well as challenges.
- **PTSD** can follow traumatic events already in the game (accidents, crime, violence, childhood mistreatment), written without graphic detail.
- **Teen trouble** is written frankly and never glamorized, with recovery as possible as decline, and never as real-world instructions. The existing content rules apply: no romance or sexual content involving anyone under 18.
- **Decline, care and dying** are written with dignity. Humor is welcome where it's kind.

---

## M1 — Mental Health


**Objective:** Make mental health an honest part of a life: conditions that come and go, real choices about treatment, and people who notice.

### Player experience

- **Conditions:** depression, anxiety and PTSD can develop over a life, shaped by genetics (E2a), hard events, stress and support. ADHD and other neurodivergence are present from birth. Before diagnosis, they show only through stats and events.
- **Diagnosis** comes from seeing a doctor or therapist, school testing (for ADHD and neurodivergence), or a crisis. Once diagnosed, the condition is named on the Health page in words.
- **Treatment choices, each with trade-offs:**
  - Therapy costs time and money.
  - Medication can bring side effects.
  - Leaning on people depends on who you have, and can strain them.
  - Ignoring it costs nothing up front, and more later.
- **Crisis moments,** such as a breakdown or a hospital stay, are handled with care and are often the turning point toward help.
- **People notice.** A partner you live with, close family and friends can notice that you're struggling, through the household rules from C1. Each reacts by their personality and values, from supportive to dismissive. Their support (or its absence) affects recovery, and your struggles affect them too.
- **It can be a secret.** A diagnosis can be kept private and can spread through gossip (E4), with reactions shaped by each person.

### Systems

- **Mental health conditions** as content in the health system: onset factors, yearly course with ups and downs, stat effects, and recovery and relapse.
- **Neurodivergence** as birth traits with strengths and challenges, inherited in part (E2a genetics), diagnosable in childhood or later.
- **Treatment:** therapy (cost and time, through the finance module), medication (cost and side-effect chance), support from people (draws on high-trust ties, with strain), or no treatment. Numbers in `balance/mental-health.yaml`.
- **Noticing and reactions:** close people roll to notice based on closeness and living together; reactions use personality (and values once W2 exists).
- **Crises:** a rare, weighted chain with a path toward help and diagnosis.
- **Links:** PTSD from traumatic events already in the game, the C1 Happiness baseline, addiction from Stage 9, and the E4 knowledge system for secrecy.

### Content

- Five condition definitions (depression, anxiety, PTSD, ADHD, and a broader neurodivergence trait).
- About 45 events: first signs, diagnosis, therapy, medication, good years and hard years, crises, support and dismissal, telling people, and living well with a condition.

### Acceptance criteria

- Conditions develop with the factors set in balance, rise and fall over time, and can recover or relapse.
- Conditions are named only after diagnosis.
- Each treatment choice has its trade-offs, and all costs go through the finance module.
- Close people notice by closeness and living together, and their reactions follow personality.
- No event offers suicide or self-harm as a choice or describes methods; the content build flags any text that does.
- A 10,000-life simulation reports prevalence by condition, diagnosis rates and timing, treatment choices and outcomes, crisis rates and the effect of support.

### Coding-AI prompt

```text
You are implementing M1 (Mental Health) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the life stages and mental health decisions, writing guidance and section M1). Inspect the existing health, Happiness baseline (C1), genetics (E2a), social web and knowledge (E4), addiction and finance code first. Extend them; do not duplicate them.

Build only M1:
- Depression, anxiety and PTSD as conditions with onset factors, yearly course, stat effects, recovery and relapse; ADHD and broader neurodivergence as partly inherited birth traits with strengths and challenges.
- Diagnosis through doctors, therapists, school testing or a crisis; conditions named on the Health page only after diagnosis.
- Treatment choices (therapy, medication, support from people, none) with their trade-offs; costs through the finance module; numbers in balance/mental-health.yaml.
- Close people noticing by closeness and living together, and reacting by personality from supportive to dismissive; support affecting recovery.
- Diagnosis as a possible secret in the E4 knowledge system.
- A rare crisis chain that leads toward help.
- A content-build check that flags any suicide or self-harm choice or method description.
- About 45 events following AGENTS.md and the writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the M1 reports and targets in balance/targets.yaml.

Meet every M1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E5 & E6 — Possessions, Crime and Fame: decisions

| Area | Decision |
|---|---|
| Possessions | Pets, vehicles, and extra homes with renovations (no valuables) |
| Pets | Moderate: care needs, vet costs, personality, events |
| Vehicles | Moderate: buy, sell, condition, accidents, insurance |
| Extra homes | Vacation homes and renovations; no renting out |
| Crime careers | Moderate: crews, police attention, rivals, laundering money |
| Prison | Stays a time skip |
| Fame paths | Music, acting, social media, writing and art (E6b); sports (E6c) |
| What fame is about | 1. The climb, 2. the craft, 3. the lifestyle, 4. the price |
| Creative control | Creative choices inside each project: genre, style, how much to risk |
| Fame and the rest of life | It can take over your whole life if you let it (a commitment setting) |
| Pace | A steady climb with rare big breaks |
| Falling | Fame fades without new work; comebacks are possible |
| Fans | A collective mood, plus superfans and haters as real people in your life |
| Without talent | Grit and luck rarely carry anyone far |
| Crossing over | Possible once you're famous enough (an actor who sings, an athlete turned host) |
| Fame depth | Deep: agents, contracts, tours, awards seasons |
| Sports depth | Deep: team, position, contract years, injuries, trades, and choices in big games and playoff runs |
| Fame and secrets | Tabloids can expose secrets to everyone |

E6 is split into **E6a** (crime careers), **E6b** (fame in arts and media) and **E6c** (sports), since each is a full system.

### Writing guidance for E5 and E6

- **Crime stays at the level of story and consequences,** never real-world instructions. A heist is a tense choice with odds and fallout, not a how-to.
- **Crime careers are for adults (18+).** Teens can still get into trouble through existing events.
- **Fame for minors** (child actors, young athletes, teen creators) is allowed, with parents involved in contracts, and the existing content rules still apply: no romance or sexual content involving anyone under 18.
- **Leagues, labels, studios, platforms, awards and brands are all fictional,** like the game's companies and schools.
- **A pet's death** is handled with lighter weight than a person's, but still felt.

---

## E5 — Pets, Vehicles & Homes

**Objective:** Let players own things that matter: pets with personalities, cars that open doors and cause trouble, and homes beyond the one they live in.

### Player experience

- **Belongings** under More lists everything you own, with value and condition in words.
- **Pets:** adopt or buy a pet. Each has a species, a name you choose, a personality (playful, anxious, stubborn, lazy) and needs. Care costs money every year, vet visits are an action, and pets bring events. They appear in a Pets group in the People tab, with a few interactions (play, walk, give a treat). Pets age and die, and in a divorce, an event decides who keeps them.
- **Vehicles:** buy new or used, with cash or a car loan. Condition wears down over time and with use; maintenance costs money; insurance is a yearly cost that depends on the car, your age and your record. Accidents can happen, more likely with risk-taking, a worn-out car or a drunk-driving choice, and lead to injuries, charges and insurance claims (which raise premiums). Selling depends on condition. Some jobs need a car, and how much you need one depends on the city.
- **Extra homes:** buy a vacation home in any city, with upkeep and a mortgage if needed. It raises happiness and brings its own events. Renovate a home you own (kitchen, bathroom, addition) to raise its value and comfort.
- **Everything passes to heirs** through the E2b estate.

### Systems

- **Possessions.** A shared record for anything owned: kind, definition, acquired year, value, condition and (for pets) a name. Yearly upkeep goes through the ledger.
- **Pets.** Species definitions (lifespan, costs, care needs), pet personality, health and bond, yearly care, vet visits, aging and death.
- **Vehicles.** Definitions (type, price, depreciation, maintenance), condition decline, car loans through the debt system, insurance premiums and claims, accidents linked to the health and legal systems (including a drunk-driving offense), and a "has a vehicle" condition for job requirements, weighted by city.
- **Homes.** Vacation homes as extra owned properties (value, upkeep, mortgage), and renovations that raise value and comfort.
- **Estate.** Possessions plug into the E2b estate extension point.
- **Theft and damage.** Events can steal or damage possessions, with insurance where it applies.

### Content

- About 8 pet species, 8 vehicle types, about 6 renovation types.
- About 35 events: pets, cars, accidents, vacation homes, renovations, theft.
- Pet interactions added to the E1 menu.

### Data

- `PetDef`, `VehicleDef` and `RenovationDef` content types.
- Possessions on the life state.
- Save upgrade.

### UI

- Belongings under More: buy, sell, vet visit, maintenance and renovate.
- Pets in the People tab.
- Insurance and upkeep lines on the Money tab.

### Dependencies

E2b (for passing possessions to heirs).

### Acceptance criteria

- Every purchase, upkeep, loan, insurance payment and claim goes through the finance module.
- Pets age, need care, have personalities that change events and interactions, and die within their species' lifespan range.
- Vehicles lose value and condition over time; accidents link to health and legal; claims raise premiums.
- Jobs that need a car check for one, and city affects how much that matters.
- Vacation homes and renovations change value, comfort and happiness as defined in balance.
- Possessions pass to heirs through the estate.
- A 10,000-life simulation reports pet ownership, pet lifespans, vehicle ownership and accident rates, insurance costs, vacation home and renovation rates, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing expansion E5 (Pets, Vehicles & Homes) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E5 & E6 decisions, writing guidance and section E5). Inspect the existing code first: finance and debt, housing, health, legal, careers, interactions (E1) and the E2b estate extension point. Extend them; do not duplicate them.

Build only E5:
- A shared possessions record (kind, definition, acquired year, value, condition, pet name) with yearly upkeep through the ledger.
- Pets: species definitions, personality, health, bond, care costs, vet visits, aging and death, a Pets group in the People tab, pet interactions in the E1 menu, and who keeps the pet in a divorce.
- Vehicles: definitions, buying with cash or a car loan, depreciation and condition, maintenance, insurance premiums and claims, accidents linked to health and legal (including drunk driving), selling, and a "has a vehicle" job requirement weighted by city.
- Homes: vacation homes as extra owned properties, and renovations that raise value and comfort.
- Possessions passing to heirs through the E2b estate extension point. Theft and damage events.
- UI: Belongings under More; insurance and upkeep on the Money tab.
- About 35 events following AGENTS.md and the E5 & E6 writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the E5 reports and targets in balance/targets.yaml.

Meet every E5 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## T1 — Teen Years


**Objective:** Make ages 13 to 17 a real phase of life: finding your crowd, earning freedom, pushing against home, getting into trouble and working out who you are.

### Player experience

- **Cliques:** your school has social groups (fictional, with their own names and character, avoiding real-world stereotypes of race, religion or class). You can join, switch or clash with them. Each brings people (who join your circle with ties), standing at school, and its own kind of trouble and opportunity.
- **Teen actions:** learn to drive and take the test, get a part-time job, join a team or club, ask for more freedom.
- **A yearly focus:** choose where most of your energy goes this year (school, friends, work or a passion). It shapes grades, friendships, money and talent. A passion can lead to scholarships, early fame (E6b, E6c) or a career.
- **House rules:** your parents set curfews, chores and limits based on their personality and parenting style (E2a). You can follow them, negotiate, argue or break them. Getting caught leads to grounding, lost privileges or worse, depending on the parent and the relationship.
- **Trouble:** sneaking out, skipping class, parties, underage drinking, drugs, fights and vandalism, with real consequences: school discipline, police, juvenile records (sealed at 18), injuries, and the start of addiction for characters prone to it.
- **Figuring yourself out:** identity moments from the self-discovery system, discovering interests, and thinking about the future (college, trade, work, leaving home).
- **No romance** before 18. Teen social life is friendship, rivalry, loyalty and belonging.

### Systems

- **Cliques:** definitions with traits and standing, per-school generation, membership, switching and conflicts, using E4 ties.
- **Teen actions:** driving lessons and the license test (and a first car through E5), teen job rules, teams and clubs.
- **Yearly focus:** a setting that shifts yearly gains between school, friendships, money and talent.
- **House rules:** generated from each parent's personality and parenting style; rule-breaking, getting caught and consequences; negotiation as a chance check on the relationship.
- **Teen trouble:** events using the existing legal, health and addiction systems, with juvenile handling.

### Content

- About 8 clique types with fictional names.
- About 50 events: cliques, first jobs, driving, parties, rule-breaking, fights at home, trouble and its fallout, identity moments, and planning the future.

### Acceptance criteria

- Cliques form, can be joined, switched and clashed with, and bring people with ties.
- The yearly focus measurably shifts grades, friendships, money and talent.
- House rules differ by parent personality and style, and breaking them has consequences that depend on the relationship.
- Teen trouble runs through the existing legal, health and addiction systems, with juvenile handling.
- No romance or sexual content involves anyone under 18; the engine and the content build enforce it.
- A 10,000-life simulation reports clique membership, focus choices and their effects, licenses, teen jobs, rule-breaking and trouble rates.

### Coding-AI prompt

```text
You are implementing T1 (Teen Years) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the life stages and mental health decisions, writing guidance and section T1). Inspect the existing education, parenting style (E2a), social web (E4), vehicles (E5), self-discovery, legal, health and addiction code first. Extend them; do not duplicate them.

Build only T1:
- Cliques with fictional names and traits (no real-world stereotypes), per-school generation, joining, switching and conflict, using E4 ties.
- Teen actions: driving lessons and the license test (first car through E5), teen jobs, teams and clubs.
- A yearly focus (school, friends, work, a passion) that shifts yearly gains.
- House rules generated from each parent's personality and parenting style; rule-breaking, getting caught, consequences and negotiation.
- Teen trouble through the existing legal, health and addiction systems with juvenile handling.
- No romance or sexual content involving anyone under 18, enforced by the engine and the content build.
- About 50 events following AGENTS.md and the writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the T1 reports.

Meet every T1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E6a — Crime Careers

**Objective:** Offer a criminal path as a real career: rising through a crew, keeping police attention low, handling rivals and making dirty money usable.

### Player experience

- **Getting in:** adults can be drawn in through events, friends in the social web, or debt and desperation. Risk-taking makes the offer more likely.
- **The crew:** you join a fictional crew, made up of real people in your life (with ties from E4), and climb its ranks to crew leader. Each year brings jobs as events: tense choices with odds, payouts and fallout.
- **Police attention:** a "heat" level builds with each job and with spending dirty money, and lowers when you lie low. High heat brings investigations, informant scares and arrests through the existing legal system.
- **Rivals:** rival crews threaten, betray, compete and retaliate.
- **Dirty money:** crime pays in money you can't spend freely. Spending it raises heat. Laundering it (through fictional cash businesses, for a cut and a risk) turns it into normal savings.
- **Getting out:** possible, but the past can follow you: old crew members, rivals, investigations.

### Systems

- **Crime career.** A career kind separate from legal jobs, with its own ranks, entry conditions (18+) and yearly standing in the crew, alongside or instead of a legal job.
- **Heat.** A value that rises and decays, feeding the legal system's odds of investigation and arrest.
- **Crews.** Fictional crews with members as people and ties; rival crews.
- **Dirty money.** A separate balance in the finance module, with laundering actions, fees and risk.
- **Jobs as events,** with chance checks, payouts in dirty money, heat changes, injuries and legal outcomes.

### Content

About 45 events: recruitment, jobs, close calls, betrayals, rivals, investigations, informants, laundering, getting out, and the past catching up. Fictional crew and business names.

### Data

- Crime career state on the life (crew, rank, standing, heat).
- Dirty money balance.
- Crew definitions.
- Save upgrade.

### UI

- Crime career shown on the Work tab, with rank, standing and heat as words.
- Dirty money and laundering on the Money tab.

### Dependencies

Stage 9 (legal) and E4 (ties, for crew members).

### Acceptance criteria

- Crime careers are only available to adults; the content build checks it.
- Heat rises and falls as defined and changes investigation and arrest odds through the legal system.
- Dirty money can't be spent freely without raising heat, and laundering moves it into savings for a fee and a risk.
- Arrests, convictions and prison use the existing legal system.
- The law-abiding test player never enters a crime career, and its targets stay met.
- A 10,000-life simulation reports how many lives enter crime careers, how far they rise, earnings, arrests and prison, with zero invariant failures, plus a check that crime doesn't out-earn legal careers without matching risk.

### Later (not built yet)

- **An heir finds a hidden stash.** Dirty money you hold at death is lost today (it is never part of the estate). A later event for the heir could find part of it (a hidden stash, a number written down, a person who knew), with its own heat and its own choices about what to do with it. It would use the existing heir play events and needs a way for the estate to remember that a stash existed; it must not turn dirty money into inheritance by itself.

### Coding-AI prompt

```text
You are implementing expansion E6a (Crime Careers) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E5 & E6 decisions, writing guidance and section E6a). Inspect the existing code first: careers, legal, finance, the social web (E4) and the event engine. Extend them; do not duplicate them.

Build only E6a:
- A crime career kind for adults only, with ranks, entry conditions and yearly crew standing, alongside or instead of a legal job.
- Heat that rises and decays and feeds the legal system's investigation and arrest odds.
- Fictional crews with members as people and ties, and rival crews.
- A dirty money balance in the finance module, with laundering actions, fees and risk.
- Jobs as events with chance checks, dirty money payouts, heat, injuries and legal outcomes.
- UI: crime career on the Work tab (rank, standing, heat as words), dirty money and laundering on the Money tab.
- About 45 events following AGENTS.md and the E5 & E6 writing guidance: story and consequences only, never real-world instructions.
- Upgrade existing saves. Extend tools/simulate.ts with the E6a reports and targets in balance/targets.yaml, and keep the law-abiding player's targets met.

Meet every E6a acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E6b — Fame (Arts & Media)

**Objective:** Let players climb from nobody to superstar in music, acting, social media, or writing and art, through the work they make, with fame able to take over their life if they let it.

### What fame is about (in priority order)

1. **The climb:** a visible ladder from nobody to superstar, with clear milestones.
2. **The craft:** making great work, with creative choices that shape how it's received.
3. **The lifestyle:** money, perks and the scene, as rewards along the way.
4. **The price:** scandals, pressure and burnout, as the cost rather than the focus.

### Player experience

- **The ladder.** Each path has named rungs, shown on the Fame screen with the next milestone in words:

  | Path | Example rungs |
  |---|---|
  | Music | Open mics → local gigs → first release → signed → first hit → touring headliner → arena star |
  | Acting | Extra → bit parts → recurring role → lead → film lead → A-list |
  | Social media | First posts → small following → creator → sponsored → household name |
  | Writing and art | Submissions → first published or shown → critical notice → bestseller or major show → icon |

- **The pace is mostly steady:** projects, gigs and reputation move you up a rung at a time. Rare big breaks (a viral moment, a lucky audition, a famous co-sign) can jump you several rungs at once.
- **Talent matters most.** Without real talent you can still get somewhere through grit and luck, but rarely far. Hidden talents from Stage 9 make a real difference here.
- **The craft.** Each project (a song or album, a role, a series of posts, a book or show) asks for creative choices:
  - Genre or kind of work.
  - Style: commercial or artistic.
  - How much to risk: a safe crowd-pleaser or a bold swing.
  Talent, skill, the team and those choices decide quality. Critics and fans can disagree: a bold flop might win awards, and a safe hit might be panned but sell. Reviews appear as short quotes in the outcome card.
- **How much you give it.** A commitment setting (holding back, steady, all in) decides how much fame takes. All in means more tours, press and output, a faster climb, and less time for your partner, kids, friends and health. Relationships strain, burnout risk rises, and events pull at you. Holding back protects your life and slows the climb. Fame can take over your whole life, but only if you let it.
- **Falling and comebacks.** Without new work, fame slowly fades, one rung at a time. Comebacks are possible, which gives older characters reasons to try again.
- **Fans.** Your fan base has a mood: devoted, restless or turned on you. It moves with your work, your image and your scandals. Some fans become real people in your life:
  - **Superfans** can be sweet, or can cross lines into stalking, which runs through the existing legal system (police, restraining orders).
  - **Haters, critics and rivals** can follow your whole career.
  Both join your circle with ties, memories and events.
- **Agents and contracts.** A better agent takes a bigger cut and opens bigger doors. Offers come as contracts with terms: an advance, a percentage, length and exclusivity. Breaking one has consequences.
- **Tours, press runs and awards seasons.** Tours and press bring money, fans and strain. Each field has fictional awards; nominations depend on quality and fame, and the ceremony is an event.
- **The lifestyle.** Money, perks, invitations, an entourage and the scene, with homes and cars from E5 to spend it on.
- **Tabloids.** Above a set fame level, secrets from the E4 gossip system can go public, reaching everyone at once and changing your image and your fans' mood.
- **Crossing over.** Once you're famous enough, you can move into a second path: an actor who releases an album, a creator who gets an acting role, a writer who gets cast. Fame partly carries over.
- **Young stars.** Child actors, young musicians and teen creators are possible, with parents handling contracts.

### Systems

- **Path definitions:** rungs with requirements, entry routes, project types, creative options, income model, awards and retirement.
- **Fame, public image and fans:** fame level and rung, public image, fan count and fan mood, with slow decay without new work.
- **Projects:** yearly projects with creative choices, a quality roll from talent, skill, team and choices, separate critic and fan reception, money through the ledger and fame changes.
- **Big breaks:** rare events, more likely with high quality and exposure, that jump several rungs.
- **Commitment:** a setting that changes climb speed and takes time from relationships and health, with burnout risk.
- **Fan people:** superfans, haters and critics generated as people with ties and memories; stalking linked to the legal system.
- **Agents, contracts, tours, press and awards.**
- **Tabloids:** above a set fame level, E4 secret knowledge items can become public.
- **Crossover:** a second path unlocked by fame, with partial carryover.

### Content

- Four path definitions with rungs and creative options; fictional labels, studios, platforms, publishers, galleries, awards and brands.
- About 70 events: auditions, gigs, releases, reviews, big breaks, tours, press, awards, superfans and stalkers, haters and rivals, scandals and tabloids, burnout, comebacks, crossovers.

### Data

- Fame career state: path, rung, fame, public image, fans and fan mood, commitment, agent, contracts, projects, awards, crossover path.
- Save upgrade.

### UI

- A Fame screen from the Work tab:
  - The ladder with your rung and the next milestone.
  - Fame, image and fan mood as bars or words.
  - Commitment setting.
  - Agent and current contract.
  - Projects with their reception.
  - An awards shelf.
- A creative choices step when starting a project.
- Tabloid headlines in the news feed.

### Dependencies

E4 (gossip for tabloids), E3 (news feed) and E5 (lifestyle spending).

### Acceptance criteria

- All four paths are playable from first step to retirement, with visible rungs and milestones.
- Creative choices measurably change quality and critic and fan reception, and critics and fans can disagree.
- The climb is mostly steady, with big breaks rare (target rate in `targets.yaml`).
- Without talent, characters rarely pass the middle rungs (target in `targets.yaml`).
- Commitment changes climb speed and measurably affects relationships, health and burnout.
- Fame fades without new work, and comebacks happen.
- Fan mood moves with work, image and scandals; superfans and haters appear as people; stalking runs through the legal system.
- Contracts change income and obligations, and breaking them has consequences.
- Tabloids can make secrets public above the set fame level.
- Crossover unlocks at the set fame level with partial carryover.
- Minors can enter with parents handling contracts, and no romance or sexual content ever involves them.
- Fame income goes through the ledger; famous lives are reported separately from the net worth target.
- A 10,000-life simulation reports entries per path, rung reached, big breaks, the effect of talent, commitment effects, fades and comebacks, awards, scandals, stalkers and crossovers, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing E6b (Fame: Arts & Media) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E5 & E6 decisions, writing guidance and section E6b). Inspect the existing careers, talents, finance, people's lives (E3), social web and gossip (E4), possessions (E5) and legal code first. Extend them; do not duplicate them.

Build only E6b:
- Four paths (music, acting, social media, writing and art) with named rungs, entry routes, project types, creative options, income, awards and retirement.
- Fame, public image, fans and fan mood, with slow decay without new work and possible comebacks.
- Yearly projects with creative choices (kind, commercial or artistic, safe or bold), a quality roll from talent, skill, team and choices, and separate critic and fan reception.
- Rare big breaks that jump several rungs; talent mattering most, with grit and luck rarely carrying anyone far.
- A commitment setting (holding back, steady, all in) that trades climb speed against time for relationships and health, with burnout risk.
- Superfans, haters and critics as people with ties and memories; stalking through the legal system.
- Agents and contracts, tours and press, a yearly awards cycle, lifestyle spending, tabloids exposing E4 secrets above a set fame level, and crossover into a second path once famous enough.
- Minors can enter with parents handling contracts; no romance or sexual content ever involves them.
- UI: the Fame screen (ladder, bars, commitment, agent, contract, projects, awards), the creative choices step, tabloid headlines in the news feed.
- About 70 events with all names fictional, following AGENTS.md and the writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the E6b reports and targets in balance/targets.yaml, reporting famous lives separately for the net worth target.

Do not build sports (E6c).

Meet every E6b acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## E6c — Sports

**Objective:** Let players chase sports stardom with the depth of a real career: teams, positions, contracts, injuries, trades, and choices in the biggest moments.

### Player experience

- **Sports:** basketball, American football, soccer, baseball and hockey, each with fictional leagues (more leagues can come with W4a's countries).
- **The ladder:** youth and school teams → college or academy → draft or signing → bench → starter → star → all-star → legend. Talent and Fitness matter most, and the climb follows the same mostly-steady pace with rare big breaks (a scout in the stands, a breakout game).
- **Each season:**
  - You play for a team at a position.
  - A season report shows how you did in words and key numbers.
  - Big moments come as events with choices: take the last shot or pass, play through an injury or sit, speak up in the locker room or stay quiet.
  - A good season can lead into a playoff run, a short chain of high-stakes events within the year.
- **Contracts and trades:** contract years, salary and options. You can be traded, released or re-signed, and you can push for a trade or a new contract through your agent.
- **Injuries** run through the health system. Playing through pain raises the risk of a worse injury, and serious injuries can end a career.
- **Age and retirement:** athletes peak young and decline. Retiring early can lead to coaching, broadcasting (a crossover into E6b's media paths) or a normal career.
- **Fame, fans and tabloids** work as in E6b: fan mood, superfans and haters, agents, endorsements, awards (MVP, championships, halls of fame) and the commitment setting.

### Systems

- **Sport definitions:** positions, the stats that matter, season structure, career length and peak ages, fictional leagues and teams.
- **Season step:** performance from talent, Fitness, position fit, team quality, injuries and big-moment choices; season results and playoff qualification.
- **Big-moment and playoff events:** choices with chance checks that can swing a season.
- **Contracts, drafts, trades and releases,** with money through the ledger.
- **Injuries** through the health system, with a play-through-pain choice.
- **Decline and retirement,** with routes into coaching, broadcasting or a normal career.
- **Shared fame systems from E6b:** fame, image, fans, agents, endorsements, awards, commitment and tabloids.

### Content

- Five sports with positions, fictional leagues, teams and awards.
- About 50 events: tryouts, drafts, rookie seasons, big games, playoff runs, locker rooms, injuries, trades, contract fights, scandals, retirement, life after sports.

### Data

- Sports career state: sport, position, team, league, contract, season history, injuries, awards.
- Save upgrade.

### UI

- A Sports screen from the Work tab: ladder, team and position, contract, latest season report, awards, and the shared fame bars.
- Big-moment and playoff events in the event sheet.

### Dependencies

E6b (shared fame systems).

### Acceptance criteria

- All five sports are playable from youth teams to retirement.
- Season results depend on talent, Fitness, position fit, team and big-moment choices.
- Playoff runs happen as event chains after strong seasons.
- Contracts, trades and releases change team, money and story; all money goes through the ledger.
- Injuries go through the health system, playing through pain raises risk, and serious injuries can end careers.
- Athletes peak and decline by age, and retirement offers coaching, broadcasting or a normal career.
- A 10,000-life simulation reports entries per sport, how far players get, injuries, career length, championships and earnings, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing E6c (Sports) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E5 & E6 decisions, writing guidance and section E6c). Inspect the existing fame systems (E6b), careers, health, education, finance and event engine first. Reuse E6b's fame, fans, agents, awards, commitment and tabloid systems; do not duplicate them.

Build only E6c:
- Five sports (basketball, American football, soccer, baseball, hockey) with positions, key stats, season structure, career length, peak ages, and fictional leagues, teams and awards.
- A ladder from youth teams to legend, with the same mostly-steady pace and rare big breaks; talent and Fitness mattering most.
- A season step with performance from talent, Fitness, position fit, team quality, injuries and choices; big-moment events and playoff-run chains.
- Drafts, contracts, trades and releases with money through the ledger.
- Injuries through the health system with a play-through-pain choice; decline and retirement into coaching, broadcasting or a normal career.
- UI: a Sports screen from the Work tab and big-moment events in the event sheet.
- About 50 events with all names fictional, following AGENTS.md and the writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the E6c reports and targets in balance/targets.yaml.

Meet every E6c acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Second-wave decisions

| Area | Decision |
|---|---|
| **Eulogy** | One speaker, your closest person, plus a list of who chose not to come |
| **Business types** | Food and retail (café, bakery, shop); services and trades (salon, plumbing, cleaning) |
| **Running a business** | Moderate: hire staff, set prices, market, open new locations |
| **Customizing a business** | Name, type, city and style (budget to premium) |
| **Buying a business** | Start your own, or buy an established one, from a corner café up to a big fictional chain |
| **Funding** | Savings, a business loan, family and friends investing, a co-founder |
| **Owner role** | Run it yourself full-time, or hire a manager and keep your job |
| **Business failure** | Depends on your choices, stats and luck |
| **Groups** | Clubs and hobbies, faith communities, volunteering and causes, neighborhood and civic groups |
| **What belonging gives** | People, events, roles to rise in, and effects on your reputation and values |
| **Faith** | Real religions, handled respectfully |
| **Travel** | Vacations, encounters abroad, and studying or working abroad |
| **Countries** | A few done deeply now (Canada, United Kingdom, Mexico), more over time |
| **Born abroad** | Lives can start in Canada, the UK or Mexico |
| **French** | Canada includes Montreal, with French |
| **Language** | Matters: you can learn languages, and they affect jobs and friendships |
| **Emigration** | Realistic: visas, work, study and family routes, citizenship over years, including undocumented routes with real risks |

### Second-wave writing guidance

- **Faith:** no religion is presented as better, worse, truer or sillier than another, and the writing never mocks belief or the lack of it. Congregations vary in how welcoming or strict they are, so no faith is painted as one thing, and people within them vary too. Hard tensions (for example, a gay member of a strict congregation) are handled with weight, with reactions that differ from person to person, and no community written as a villain.
- **Countries and cultures:** no national or ethnic stereotypes, including as jokes. Humor comes from situations, not from where people are from.
- **Undocumented emigration:** written with humanity, never as a joke or a villain story. It stays at the level of story and consequences, never real-world instructions for crossing borders or obtaining documents.
- **Businesses, brands, chains, congregation names and schools are fictional.** Real religions, countries and cities are real.

---

## W1 — Eulogy

**Objective:** End every life with a personal account from the person who knew you best, and a list of who stayed away.

### Player experience

After death, the funeral screen shows:

- **The eulogy:** one speaker, chosen as your closest living person. It's written from *their* point of view: the memories you share, the version of your life they believe (from the E4 gossip system), and their relationship with you. A devoted spouse, a loyal friend and a dutiful but distant son all speak very differently. If no one is close enough, there's no eulogy, and the screen says so plainly.
- **Who didn't come:** people from your life who chose not to attend, such as estranged family, feuding friends or an ex, each with a short reason in words ("still hadn't forgiven you").
- **The obituary** stays as the factual summary. The eulogy is the personal one, and both go into the archive.

### Systems

- **Speaker choice.** The living person with the highest combined affection and trust, excluding estranged people. Ties go to a spouse, then children, then others.
- **Eulogy builder.** Sections drawn from the speaker's memories with you, their beliefs about you (including twisted versions), your major life moments, and their relationship to you, with tone set by affection, trust and how they knew you. It's assembled from content templates, never free text.
- **Attendance.** Each person in your circle decides whether to attend, based on affection, trust, feuds, estrangement and distance. Those who chose not to come are listed with a reason; people who simply couldn't (in prison, very ill, too far) are handled separately or left off.
- **Heir view.** When continuing as an heir, the funeral appears before the "Previously" card.

### Content

About 120 eulogy template pieces (openings, memory lines, belief lines, closing lines) across relationship types and tones, and reason lines for not attending. Some lines can quietly reveal what the speaker never knew, or believed wrongly.

### Acceptance criteria

- The speaker is always the closest eligible living person, and their eulogy only references memories and beliefs they actually hold.
- If no one qualifies, there's no eulogy, and the screen says so.
- The not-attending list only includes people who chose not to come, each with a fitting reason.
- Eulogies are stored in the archive and shown in archived lives.
- Rendering every eulogy template with four pronoun sets passes.
- In a 10,000-life simulation, eulogies vary meaningfully (measured by template variety and speaker types), and the share of lives with no speaker is reported.

### Coding-AI prompt

```text
You are implementing W1 (Eulogy) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the second-wave decisions and writing guidance, and section W1). Inspect the existing obituary, archive, social web (E4) and heir code first. Extend them; do not duplicate them.

Build only W1:
- Speaker choice: the closest living person by affection and trust, excluding estranged people, ties broken by spouse, then children, then others.
- A eulogy builder from content templates using the speaker's memories, their beliefs (including twisted versions), your major moments and their relationship to you, with tone from affection and trust.
- Attendance: who chose not to come, each with a reason; people who couldn't come are handled separately.
- A funeral screen after death (before the "Previously" card for heirs); eulogies stored and shown in the archive.
- About 120 template pieces following AGENTS.md and the writing guidance.
- Upgrade existing saves and archives. Extend tools/simulate.ts with W1 reports.

Meet every W1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## L1 — Later Life


**Objective:** Make the last decades of a life as full as the first: family, freedom, slow decline, making amends, and an ending you can prepare for.

### Player experience

- **Family:** full relationships with grandchildren (babysit, spoil, mentor, play favorites), through new interactions in the E1 menu. If their parents can't, you can raise a grandchild yourself, using E2b's guardianship. Adult children's lives (E3) pull you in, and you decide what to pass on and when.
- **Freedom:** retirement plans, new hobbies, travel (W5), volunteering (W2) and second careers.
- **Decline is light:** you slow down, and health events become more common. Near the end, care can become necessary: someone has to help, or you move into assisted living. Who steps up depends on your relationships, and an estranged child might come back, or stay away.
- **Making amends:** later years bring chances to reconcile, apologize, or finish something you abandoned, built from your real history and memories.
- **Seeing the end coming:** sometimes a terminal diagnosis or a long decline gives time to prepare. You choose hospice or not, state final wishes, update your will (E2b), and decide who you want there. Those choices shape the funeral, the eulogy (W1) and who attends.
- **At the end:** a list of regrets and proud moments, built from your actual life, sits beside the eulogy.

### Systems

- **Grandchildren** as people with relationships and interactions; raising a grandchild through guardianship.
- **Late-life care:** a near-end care need, with options (family, paid care through finance, assisted living through housing), and who steps up based on ties.
- **Amends:** events generated from unresolved strained ties, abandoned goals and regret-worthy memories.
- **Terminal phase:** some deaths come with warning; final-wishes and hospice choices stored for the funeral and eulogy.
- **Regrets and proud moments:** a life review built from history, memories and relationships, stored in the archive.

### Content

- About 45 events: grandparenting, raising a grandchild, retirement plans, second careers, slowing down, care decisions, amends, terminal diagnoses, final wishes, last visits.
- Grandparent interactions in the E1 menu.
- Templates for regrets and proud moments.

### Acceptance criteria

- Grandchildren have full relationships and interactions, and raising a grandchild works through guardianship.
- Decline stays light, and care can become necessary near the end, with who steps up based on ties.
- Amends opportunities come from real unresolved history.
- Some deaths are foreseen, and final wishes, hospice choices and chosen visitors affect the funeral, eulogy and attendance.
- Regrets and proud moments come only from the character's actual life, and are stored in the archive.
- A 10,000-life simulation reports grandparenting, care needs and who provides care, amends taken, foreseen deaths and final-wishes choices.

### Coding-AI prompt

```text
You are implementing L1 (Later Life) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the life stages and mental health decisions, writing guidance and section L1). Inspect the existing children and heirs (E2a, E2b), people's lives (E3), social web (E4), interactions (E1), housing, finance, health, eulogy (W1) and archive code first. Extend them; do not duplicate them.

Build only L1:
- Grandchildren as people with relationships and grandparent interactions in the E1 menu; raising a grandchild through E2b guardianship.
- Late-life care near the end: family, paid care through finance, or assisted living through housing, with who steps up based on ties.
- Amends events generated from unresolved strained ties, abandoned goals and regret-worthy memories.
- Foreseen deaths with final wishes, hospice choices and chosen visitors, feeding the funeral, eulogy and attendance; a will update prompt.
- A regrets-and-proud-moments life review from real history, stored in the archive.
- About 45 events following AGENTS.md and the writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the L1 reports.

Meet every L1 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## W2 — Belonging

**Objective:** Give characters places to belong that come with people, purpose and a lasting effect on who they become.

### Player experience

- **Groups** under More list what's available in your city: book clubs, rec leagues, bands, congregations, food banks, animal shelters, causes, neighborhood associations, community boards. You join, choose how committed you are (casual or committed), and can leave.
- **Each group brings people,** who join your circle with ties to each other through the social web. A rec league teammate becomes a best friend, the choir director becomes a rival.
- **Roles:** committed members can rise, for example from member to organizer to leader, through events and selection. Leaders face bigger decisions.
- **Values and reputation:** what you belong to slowly shapes your values (for example, faith, community, compassion, tradition) and your reputation in your city. A respected volunteer gets more trust; a scandal in a congregation travels fast.
- **Faith:** characters are born into a family's faith (or none), and can deepen, question, lose, find or change faith over a life. Holidays, rites of passage, interfaith relationships and community support all appear as events.

### Systems

- **Group definitions.** Type, real religion where relevant, activities, role ladder, time and money commitment (dues, donations), values they nudge, and city availability. Congregations and clubs are generated per city with their own traits (welcoming or strict, casual or intense).
- **Membership.** Join, leave, commitment level, years in, current role. Commitment takes time, which lightly affects work, school and relationships.
- **Values.** A small set of values on each character that drift with membership and choices, and that events and NPC reactions can check.
- **Faith.** A faith affiliation and a strength of belief on each character, set at birth from family, changeable through events and self-discovery (finding, losing, converting, returning). Added to custom creation.
- **Reputation.** Group standing and community reputation feed the existing hidden reputation.
- **Social web.** Groups create ties between members, and group news spreads through gossip.

### Content

- Group definitions across the four types, including real religions and their major traditions, with fictional congregation and club names.
- About 50 events: joining, rising, conflicts within groups, holidays and rites of passage, crises of faith, finding faith, interfaith relationships, volunteering stories, civic fights.

### Acceptance criteria

- Groups are available by city, and joining, leaving, commitment and roles work.
- Members join your circle with ties to each other.
- Values and reputation change measurably with long membership and with choices.
- Faith is set at birth from family, can change through events and self-discovery, and is available in custom creation.
- Every faith event passes a review against the writing guidance, recorded in `docs/consistency-review.md`.
- A 10,000-life simulation reports group participation by type, role progression, faith changes and their effects, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing W2 (Belonging) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the second-wave decisions and writing guidance, and section W2). Inspect the existing social web (E4), people's lives (E3), self-discovery, reputation and creation code first. Extend them; do not duplicate them.

Build only W2:
- Group definitions as YAML (type, real religion where relevant, activities, role ladder, commitment, costs, values, city availability), with per-city congregations and clubs that have their own traits.
- Membership: join, leave, commitment level, years and roles, with commitment lightly affecting work, school and relationships.
- A small set of values on characters, drifting with membership and choices, readable by events and reactions.
- Faith: affiliation and strength of belief, set at birth from family, changeable through events and self-discovery, and added to custom creation.
- Group standing feeding reputation; groups creating ties between members; group news spreading through gossip.
- UI: Groups under More, membership and role on the Profile sheet.
- About 50 events following AGENTS.md and the faith writing guidance. Review every faith event against the guidance and record it in docs/consistency-review.md.
- Upgrade existing saves. Extend tools/simulate.ts with W2 reports.

Meet every W2 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## W3 — Businesses

**Objective:** Let players build a business of their own design from nothing, or buy one already running, and grow it as far as they can.

### Player experience

- **Starting a business:** choose a type (café, bakery, shop, salon, plumbing, cleaning), name it, pick the city and set its style from budget to premium. Fund it with savings, a business loan, investment from family and friends, or a co-founder from your circle, each with their own share.
- **Buying one:** a "For sale" list in each city offers established businesses, from a corner café with loyal regulars to big fictional chains with many locations. The price depends on how much they earn.
- **Running it, each year:**
  - Set prices.
  - Hire and fire staff (new people, or people you already know).
  - Spend on marketing.
  - Improve quality.
  - Open new locations in your city or others.
  - Run it yourself full-time, or hire a manager and keep your job. A good manager keeps things steady, and a bad one can quietly run it into the ground.
- **What happens:** a yearly report shows customers, revenue, costs and profit in words and numbers. Events bring inspections, bad reviews, viral moments, a competitor opening next door, staff drama, theft and expansion chances.
- **Trades:** a plumbing business needs a licensed plumber, you or someone you hire.
- **Ending:** sell the business, close it, lose it when the money runs out, or pass it to an heir as a family business.

### Systems

- **Business definitions.** Type, startup costs by style, base demand, staffing needs, license needs, and how city and style fit together (a premium café does better in New York than in a small town).
- **Funding.** Business loans through the debt system (approval depends on income, record and plan), investors as people with stakes and memories (they remember losing their money), and co-founders with ownership shares and disputes.
- **Yearly business step.** Demand from city, style fit, reputation, marketing and quality (from staff skill and the owner's or manager's stats); revenue from demand and prices; costs (rent, wages, supplies, loan payments); profit or loss through the ledger.
- **Staff.** Employees are people in your circle, with ties and gossip. Wages, skill, morale and quitting.
- **Locations.** Each location has its own city, style and results.
- **Market.** Established businesses and chains for sale per city, priced from their earnings; selling uses the same valuation.
- **Failure.** When a business can't cover its costs, savings and loans cover the gap until they can't. Then it closes, with personally guaranteed debts going through the existing debt and bankruptcy systems. Investors and co-founders react.
- **Estate.** Businesses pass to heirs through the E2b estate.

### Content

- Six business types with style tiers, fictional chains for sale, and fictional business names for the market.
- About 45 events: openings, inspections, reviews, viral moments, competitors, staff drama, investors and co-founders, expansion, near-failure, selling, family businesses.

### Acceptance criteria

- Every business type can be started with any of the four funding sources, customized by name, city and style, and run yearly with the moderate controls.
- Established businesses and chains can be bought and sold, priced from earnings.
- All money (revenue, costs, loans, investments, sale prices) goes through the finance module, and the yearly report shows it.
- Failure depends on choices, stats and luck: the simulation shows good decisions and fitting stats clearly improve survival, without guaranteeing it.
- Staff and investors are people with ties and memories.
- Trades businesses require a license, held by you or a staff member.
- Businesses pass to heirs.
- A 10,000-life simulation reports how many lives start or buy a business, survival over 1, 5 and 10 years by type and style, profits, failures and their debts, and a check that owning a business doesn't out-earn careers without matching risk.

### Coding-AI prompt

```text
You are implementing W3 (Businesses) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the second-wave decisions and writing guidance, and section W3). Inspect the existing finance and debt, careers and licenses, people's lives (E3), social web (E4) and estate (E2b) code first. Extend them; do not duplicate them.

Build only W3:
- Six business types as YAML with style tiers, startup costs, demand, staffing and license needs, and city fit.
- Starting a business with name, type, city and style, funded by savings, a business loan (through the debt system), investors from your circle (with stakes and memories), or a co-founder (with shares and disputes).
- A "For sale" market of established businesses and fictional chains per city, priced from earnings; buying and selling.
- A yearly business step: demand, revenue, costs and profit through the ledger; staff as people with wages, skill, morale and quitting; marketing, prices, quality and new locations; running it yourself or through a manager.
- Failure when money runs out, with guaranteed debts going through the existing debt and bankruptcy systems. Businesses pass to heirs through the estate.
- UI: a Business screen from the Work tab (yearly report, staff, locations, decisions), the market, and business money on the Money tab.
- About 45 events following AGENTS.md and the writing guidance, all names fictional.
- Upgrade existing saves. Extend tools/simulate.ts with the W3 reports and targets in balance/targets.yaml.

Meet every W3 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Shared rule for W4–W6

The game models each country's rules at a high level and doesn't take political positions. Immigration, enforcement and citizenship are written as personal stories with real stakes, following the writing guidance above.

**Money stays in one internal unit.** All amounts are stored as whole numbers in a single base currency (as today) and shown in the local currency using exchange rates in `balance/countries.yaml`. This avoids conversion bugs while players see pounds, pesos or Canadian dollars.

---

## W4a — Countries

**Objective:** Turn the United States from "the world" into one country among four, each with its own rules, and let lives start in any of them.

### Player experience

- **Creation** offers a country (United States, Canada, United Kingdom, Mexico) and then a city.
- **Each country plays differently:**
  - Its school stages and names.
  - Its legal ages for drinking, driving and marriage.
  - Healthcare costs (low under public systems).
  - Taxes, pension age and benefits, job market, cost of living, and sentencing.
- **Money appears in the local currency** (USD, CAD, GBP, MXN).
- **Events fit where you are.** US-specific ones only happen in the US, and each country has its own events.

### Cities

| Country | Cities |
|---|---|
| Canada | Toronto, Vancouver, Montreal (French-speaking), a small town |
| United Kingdom | London, Manchester, a small town |
| Mexico | Mexico City, Guadalajara, Monterrey, a small town |

Legal ages can vary below country level. For example, the drinking age is 18 in Quebec but 19 in Ontario and British Columbia.

### Systems

- **Country definitions.** Currency and exchange rate, legal ages (with city overrides), school structure (stage names, ages, exams, tuition and student finance), healthcare cost model, tax brackets, pension age and benefit rules, job market and salary multipliers, sentencing adjustments, official and common languages, name pools and family wealth distribution.
- **The systems read the country.** Education, economy, retirement, health costs, legal and creation all take their country-specific numbers from the country definition, instead of the current US assumptions.
- **Content tagging.**
  - Existing events are reviewed for US-only references (state names, US exams, dollar amounts written in text) and either made country-neutral with placeholders (`{currency}`, school stage names) or tagged as US-only.
  - A new category contract makes country-tagged events require that country.
- **Country event packs:** about 30 events each for Canada, the UK and Mexico.
- **Creation:** country choice in custom creation, and random starts spread across countries (weights in balance).

### Acceptance criteria

- Lives can start in any of the four countries, and every system uses that country's rules.
- No US-specific text or rule appears outside the US; the content build enforces country tags.
- Money displays in local currency while stored in the base unit, with conversion tested.
- School, healthcare, taxes, pensions and legal ages match each country's definition, with tests per country.
- A 10,000-life simulation per country passes invariants and reports lifespan, education, income, home ownership and bankruptcy against per-country targets.

### Coding-AI prompt

```text
You are implementing W4a (Countries) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the second-wave decisions, the shared rule for W4–W6, and section W4a). Inspect every system that currently assumes the United States: creation, education, economy and ledger, retirement, health costs, legal, careers and content. Extend them to read from country definitions; do not duplicate them.

Build only W4a:
- Country definitions in YAML for the US, Canada, the UK and Mexico (currency and exchange rate, legal ages with city overrides, school structure and student finance, healthcare cost model, taxes, pension rules, job market and salary multipliers, sentencing adjustments, languages, name pools, family wealth distribution), and the cities listed in W4a.
- All systems reading country-specific values from the definitions.
- Money stored in the base unit and shown in local currency.
- A review of every existing event for US-only references: make them country-neutral with placeholders or tag them US-only. Add a category contract for country tags.
- About 30 events per new country, following AGENTS.md and the writing guidance (no national stereotypes).
- Country choice in custom creation and random starts across countries.
- Upgrade existing saves (existing lives are in the US). Extend tools/simulate.ts to run per country with per-country targets.

Do not build languages (W4b), travel (W5) or emigration (W6).

Meet every W4a acceptance criterion. Run all checks and a 10,000-life simulation per country, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## W4b — Language

**Objective:** Make language a real part of life: what you grow up speaking, what you learn, and what it opens or closes.

### Player experience

- **Native languages** come from where you're born and your family: English, French (Montreal), Spanish (Mexico), or bilingual households (for example, a Spanish-speaking family in Houston).
- **Learning:** foreign language classes at school, paid classes as adults, and immersion from living somewhere. Skill grows in levels: basic, conversational, fluent. Unused languages fade slowly.
- **Effects:**
  - Most jobs need conversational or fluent skill in the local language.
  - Meeting and befriending people is easier in a shared language, and interactions go better.
  - Some events change with a language barrier.
  - In Montreal, French opens more doors, but English still works for many jobs.
- **The Profile sheet** lists your languages and levels in words.

### Systems

- **Languages on characters and people:** each language with a skill level and whether it's native.
- **Native assignment** from country, city and family background, including heritage languages.
- **Learning and fading:** school classes, a paid "Take language classes" action, yearly immersion gains, and slow loss without use. Numbers in `balance/languages.yaml`.
- **Effects:** language requirements on jobs (by country and city), shared-language weighting in meeting people and in interaction odds, and a `language` condition for events.

### Acceptance criteria

- Every character and person has native languages consistent with their background.
- Learning, immersion and fading follow the balance numbers.
- Jobs check language requirements, and shared language affects meeting people and interactions.
- Montreal's job market reflects French and English as defined.
- A 10,000-life simulation reports languages spoken, learning rates, and how language affects jobs and friendships.

### Coding-AI prompt

```text
You are implementing W4b (Language) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (section W4b). Inspect the countries (W4a), creation, education, careers, people's lives (E3) and interaction (E1) code first. Extend them; do not duplicate them.

Build only W4b:
- Languages with skill levels and native flags on characters and people, assigned from country, city and family background, including heritage languages.
- Learning through school classes, a paid classes action and immersion; slow fading without use. Numbers in balance/languages.yaml.
- Language requirements on jobs by country and city; shared-language weighting in meeting people and interaction odds; a language condition for events; language-barrier text variants where relevant.
- Languages on the Profile sheet.
- About 20 events about learning, barriers and bilingual life, following AGENTS.md.
- Upgrade existing saves. Extend tools/simulate.ts with W4b reports.

Meet every W4b acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## W5 — Travel & Time Abroad

**Objective:** Let characters see the world: vacations with real stories, people met along the way, and stretches of life spent studying or working in another country.

### Player experience

- **Plan a trip** under More:
  - Choose a destination, a budget level and who comes (partner, friends, family or solo).
  - Destinations include the four countries' cities plus vacation-only places such as France, Italy, Spain, Japan, Thailand and Jamaica.
  - The trip costs money, lifts happiness or lowers stress, and brings events.
- **Encounters abroad:** people you meet can join your circle at a distance. A holiday romance (adults only) can become a long-distance relationship, following the presence rules. Trouble can happen: theft, injury, a missed flight, an arrest abroad.
- **Study abroad:** college students can spend a semester or year at a partner school in another country, through the education system.
- **Work abroad:** adults can take a temporary stint in another country, through a working-holiday permit or a transfer from their employer.
- **Coming home** brings the effects back with you: language gains, new people, changed relationships at home (distance strains ties).

### Systems

- **Destinations.** The four countries' cities, plus vacation-only destinations with light definitions (language, cost level, kind of trip).
- **Trips.** An action with cost through the finance module, companions from your circle, effects, and travel events. A trip happens within the year.
- **Temporary stays.** A residence record for the current country with type (visitor, student, temporary worker) and an end year. W6 extends it with permanent and undocumented status.
- **Study and work abroad.** Exchange programs through the education system and temporary work through careers, with language immersion and distance effects on ties.

### Acceptance criteria

- Trips cost money, change stats as defined and produce destination-fitting events.
- People met abroad join your circle at a distance, and the presence rules apply to them.
- Holiday romance follows the adults-only rule.
- Study and work abroad move you temporarily, give immersion and strain ties at home, and end with a return.
- A 10,000-life simulation reports trips per life, destinations, encounters, study and work abroad rates and their effects.

### Coding-AI prompt

```text
You are implementing W5 (Travel & Time Abroad) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (section W5). Inspect the countries (W4a), language (W4b), education, careers, finance and social web code first. Extend them; do not duplicate them.

Build only W5:
- Destinations: the four countries' cities plus light vacation-only destinations.
- A "Plan a trip" action under More: destination, budget, companions, costs through the finance module, effects and travel events.
- Encounters abroad: new people joining your circle at a distance (presence rules apply), adults-only holiday romance, and trouble abroad.
- A residence record for temporary stays (visitor, student, temporary worker, with an end year), designed for W6 to extend.
- Study abroad through the education system and temporary work abroad through careers, with immersion and distance effects on ties.
- About 40 events following AGENTS.md and the writing guidance (no national stereotypes).
- Upgrade existing saves. Extend tools/simulate.ts with W5 reports.

Do not build permanent emigration, undocumented status or citizenship (W6).

Meet every W5 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## W6 — Emigration & Citizenship

**Objective:** Let characters move countries for good, through realistic routes or without papers, and live with what that means over years.

### Player experience

- **Legal routes:** move through a job offer that sponsors you, study that leads to work, family or marriage to a citizen, or investment if you're wealthy. Each route has requirements (education, skills, language, record, money), costs, waiting years and approval odds.
- **Over time:** temporary status can become permanent residency, then citizenship after enough years, a language level, a clean record and a citizenship test event. Dual citizenship is possible.
- **Without papers:** characters can stay after a visa ends or move without authorization. Life without papers is defined by risk and limits:
  - Informal, lower-paid work, and employers who take advantage.
  - No access to things like loans or professional licenses.
  - A yearly risk of deportation, raised by contact with police.
  - Separation from family, and fear and stress.
  - Support from community groups (W2).
  - Uncertain routes to legal status, through marriage, long residence or changes in the rules.
- **Leaving people behind:** ties at home strain with distance. You can send money home and visit.
- **Coming back:** returning to your home country is always possible for citizens.
- **Children** born abroad get that country's citizenship by birth, and can also have their parents' citizenship.
- **People in your life** can emigrate too (through E3), sometimes asking you for help.

### Systems

- **Citizenship and residence.** A list of citizenships on each character and person, and the residence record from W5 extended with permanent residency and undocumented status.
- **Routes.** Work sponsorship (jobs that can sponsor), study-to-work, family and marriage sponsorship, and investment. Eligibility, costs, waits and odds per country in `balance/immigration.yaml`.
- **Naturalization.** Years of residence, language level, clean record, and a test event.
- **Undocumented status.** Job restrictions to informal work, lower pay and exploitation events, blocked access to loans and licenses, a yearly deportation risk linked to the legal system, stress effects, and routes to status.
- **Remittances and visits.** Sending money home through the ledger, and visits that refresh ties.
- **People's emigration** in E3's yearly step.
- **Heirs.** Citizenship passes by birthplace and parentage.

### Content

About 50 events: applications and waits, approvals and denials, arriving, first years in a new country, homesickness, citizenship tests and ceremonies, life without papers (work, fear, community, close calls, deportation, regularization), remittances, visits and returning home. Written with humanity, never as jokes or villain stories, and never as real-world instructions.

### Acceptance criteria

- Each legal route works per country, with requirements, costs, waits and odds from balance.
- Residency and citizenship progress as defined, and dual citizenship works.
- Undocumented status restricts jobs and access, carries deportation risk linked to the legal system, and has uncertain routes to status.
- Remittances go through the ledger.
- Children's citizenship follows birthplace and parents.
- People in your life can emigrate.
- Every emigration event passes a review against the writing guidance, recorded in `docs/consistency-review.md`.
- A 10,000-life simulation reports emigration by route and country, time to citizenship, undocumented outcomes (regularized, deported, stayed, returned), and remittances, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing W6 (Emigration & Citizenship) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the second-wave writing guidance, the shared rule for W4–W6, and section W6). Inspect the countries (W4a), language (W4b), travel and residence (W5), careers, legal, finance, people's lives (E3), groups (W2) and heir (E2b) code first. Extend them; do not duplicate them.

Build only W6:
- Citizenships on characters and people; extend the W5 residence record with permanent residency and undocumented status.
- Legal routes per country (work sponsorship, study-to-work, family and marriage, investment) with eligibility, costs, waits and odds in balance/immigration.yaml.
- Naturalization (years, language, clean record, test event) and dual citizenship.
- Undocumented status: informal work with lower pay and exploitation events, blocked loans and licenses, a yearly deportation risk linked to the legal system, stress effects, community support through groups, and uncertain routes to status.
- Remittances through the ledger and visits home; people in your life emigrating through E3; citizenship for children by birthplace and parentage.
- About 50 events following AGENTS.md and the writing guidance: with humanity, never as jokes or villain stories, and never as real-world instructions. Review every emigration event against the guidance and record it in docs/consistency-review.md.
- Upgrade existing saves. Extend tools/simulate.ts with W6 reports.

Meet every W6 acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## After the expansions

1. **Avatar stage.** Once the regenerated tops and neck sheets are ready, a stage to build layered, recolorable portraits that age and pass looks to children (connecting to E2a genetics). Its gate gets written when the assets exist.
2. **Stage 11 (Polish), Stage 12 (Balancing) and Stage 13 (Launch),** as planned in `docs/technical.md`, now covering the expanded game.
