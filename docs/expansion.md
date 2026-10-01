# WIPlife — Expansion Plan, Part 3

**Status:** Complete draft (all 4 batches): E1 through E6, ready for review.

| Batch | Contents | Status |
| --- | --- | --- |
| 1 | Overview, design changes, E1 Interaction menu | Done |
| 2 | E2a Children & parenting · E2b Heir play & inheritance | Done |
| 3 | E3 People's own lives · E4 Social web | Done |
| 4 | E5 Pets, vehicles & homes · E6a Crime careers · E6b Fame | Draft for review |

---

## Why expand

The MVP (Stages 1–10) covers a full life. The expansions are what make WIPlife better than other life sims: the people in your life become a living web you can act on directly, lives continue across generations, and your choices ripple through other people's lives as well as your own.

## Decisions from the expansion interview

| Area | Decision |
| --- | --- |
| First expansion | You interacting with people |
| Interaction style | Unlimited menu for each person |
| Preventing grinding | Repeats with the same person give less each year, and reactions vary and can backfire |
| Interaction groups | Everyday, conflict, romance (adults only), practical |
| Results | A short outcome card |
| Moods | Shown for close people only |
| Intimacy before children exist | Health risks now; pregnancy once children exist |
| Order after E1 | Children & heir play → social web → pets, vehicles & possessions → crime & fame careers |
| Launch (Stage 13) | Postponed; its save-reliability and cross-browser work must still happen before real players arrive |
| Consistency | New rule: if it doesn't make sense, it doesn't happen. A consistency stage (C1) runs before E1 |

## Design changes

- **Pillar 1** becomes "Moments that matter": the story still comes from events, and a per-person interaction menu handles everyday relationships between them, designed so repeating an action never becomes a grind. `docs/design.md` is updated.
- **Core loop step 2** becomes "Manage and interact."

## Expansion roadmap

| Expansion | Name | After it, the player can... |
| --- | --- | --- |
| C1 | Consistency pass | Play lives where events fit their situation, and every money change is real and visible |
| E1 | Interaction menu | Chat, gift, argue, flirt, ask for help and more with anyone in their life, as often as they like |
| E2a | Children & parenting | Have, adopt or gain children, raise them, and shape who they become |
| E2b | Heir play & inheritance | Write a will, pass on an estate and family reputation, and continue as any child |
| E3 | People's own lives | See the people they know get jobs, move, fall in love and change on their own |
| E4 | Social web | See the people they know form their own relationships, feuds and gossip |
| E5 | Pets, vehicles & homes | Own pets, cars, vacation homes, and renovate |
| E6a | Crime careers | Join a crew, climb its ranks, and stay ahead of the police and rivals |
| E6b | Fame | Chase fame in music, acting, sports, social media, or writing and art |

E3 comes before E4 because people need their own lives before they can have relationships with each other.

### Where the expansions fit

**Recommended order:** Stage 10 → C1 → E1 → E2a → E2b → E3 → E4 → E5 → E6a → E6b → avatar stage → Stage 11 (Polish) → Stage 12 (Balancing) → Stage 13 (Launch).

Polishing and balancing before the expansions would mean doing both again afterwards, since every expansion changes the economy, relationships and event frequencies. Each expansion still keeps the simulation targets green, and the playable game on Netlify keeps updating along the way.

### Rules that carry over

Every expansion uses the same gate format as Part 2, follows AGENTS.md (including the content rules and adults-only romance rule), upgrades existing saves, extends the simulation runner, and ends with a pull request into main with a green CI run.

C1 comes before every expansion because each one adds dozens of events, and the new rules have to exist before that content is written.

---

## C1 — Consistency Pass

**Objective:** Make the game follow one rule everywhere: if it doesn't make sense, it doesn't happen. Fix the problems found in playtesting, and add rules and checks so the same kinds of problems can't come back.

### Problems found in playtesting

| Problem | Root cause | Fix |
| --- | --- | --- |
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
| --- | --- |
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
| --- | --- |
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
| --- | --- |
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

## E5 & E6 — Possessions, Crime and Fame: decisions

| Area | Decision |
| --- | --- |
| Possessions | Pets, vehicles, and extra homes with renovations (no valuables) |
| Pets | Moderate: care needs, vet costs, personality, events |
| Vehicles | Moderate: buy, sell, condition, accidents, insurance |
| Extra homes | Vacation homes and renovations; no renting out |
| Crime careers | Moderate: crews, police attention, rivals, laundering money |
| Prison | Stays a time skip |
| Fame paths | Music and acting, sports, social media, writing and art |
| Fame depth | Deep: agents, contracts, tours, awards seasons |
| Fame and secrets | Tabloids can expose secrets to everyone |

E6 is split into **E6a** (crime careers) and **E6b** (fame), since each is a full system.

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

## E6b — Fame

**Objective:** Let players chase fame through five paths, with the deep machinery of a career in the spotlight, and the price of being watched.

### Player experience

- **Paths:** music, acting, sports, social media, and writing and art. Each has its own way in: auditions, tryouts, posting, submissions, open mics. Hidden talents from Stage 9 matter a lot here.
- **Fame:** a fame level (unknown, local, rising, famous, superstar), fans or followers, and a public image that can be loved or hated.
- **Agents and contracts:** hire an agent (better agents take a bigger cut but open bigger doors). Offers come as contracts with terms: an advance, a percentage, length and exclusivity. Breaking one has consequences.
- **Projects:** each year can bring a project (an album, a film, a season, a book, a series of posts or a gallery show) with a quality roll based on talent, skill and the team. Success brings money and fame.
- **Tours and seasons:** tours, sports seasons and press runs, with their own events and strain on health and relationships.
- **Awards seasons:** each field has fictional awards. Nominations depend on project quality and fame, and the ceremony is an event.
- **Endorsements, rivals and scandals:** brand deals with fictional brands, rivals in your field, and scandals.
- **Tabloids:** once you're famous enough, your secrets can go public, reaching everyone at once, not just your circle.
- **Young stars:** child actors, young athletes and teen creators are possible, with parents handling contracts.

### Systems

- **Fame careers.** Five path definitions, each with entry routes, progression, project types, income model and retirement (sports has an earlier one).
- **Fame and public image.** Values with tiers, fans or followers, and decay without new work.
- **Agents and contracts.** Agent quality and cut; contract offers with terms; breach events.
- **Projects.** Yearly projects with quality rolls, money through the ledger, and fame changes.
- **Awards.** A yearly cycle per field: nominations from quality and fame, results, history entries.
- **Tabloids.** Above a set fame level, secret knowledge items (from E4) can become public, reaching everyone and changing public image.
- **Endorsements and scandals.** Offers based on fame and image; scandals from events and tabloids.

### Content

- Five path definitions, fictional awards, leagues, labels, studios, platforms and brands.
- About 60 events across the five paths, tours and seasons, awards, endorsements, rivals, scandals and tabloids.

### Data

- Fame career state (path, fame, public image, fans, agent, contracts, projects, awards).
- Save upgrade.

### UI

- A Fame screen from the Work tab: fame and image as bars, fans in words, agent, current contract, projects and an awards shelf.
- Tabloid headlines in the news feed.

### Dependencies

E4 (knowledge items and gossip for tabloids) and E3 (news feed).

### Acceptance criteria

- All five paths are playable from entry to retirement.
- Contracts change income and obligations, and breaking them has consequences.
- Project quality depends on talent, skill and team, and drives money and fame.
- Awards follow a yearly cycle, with nominations tied to quality and fame.
- Above the set fame level, secrets can become public and reach everyone, changing public image.
- Minors can enter fame paths with parents handling contracts, and no romance or sexual content ever involves them.
- Fame income goes through the ledger, and the net worth target in `targets.yaml` still holds for typical lives, with famous lives reported separately.
- A 10,000-life simulation reports how many lives try each path, how far they get, earnings, awards, scandals and tabloid exposures, with zero invariant failures.

### Coding-AI prompt

```text
You are implementing expansion E6b (Fame) of WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md and docs/expansion.md (the E5 & E6 decisions, writing guidance and section E6b). Inspect the existing code first: careers, talents, finance, the social web's knowledge items (E4), the news feed (E3) and the event engine. Extend them; do not duplicate them.

Build only E6b:
- Five fame paths (music, acting, sports, social media, writing and art) with entry routes, progression, project types, income and retirement.
- Fame and public image with tiers, fans or followers, and decay.
- Agents and contracts: agent quality and cut, contract offers with terms, breach events.
- Yearly projects with quality rolls from talent, skill and team; money through the ledger; fame changes.
- Tours and seasons, a yearly awards cycle per field, endorsements, rivals and scandals.
- Tabloids: above a set fame level, secret knowledge items can become public and reach everyone, changing public image.
- Minors can enter fame paths with parents handling contracts; no romance or sexual content ever involves them.
- UI: a Fame screen from the Work tab and tabloid headlines in the news feed.
- About 60 events and all names fictional, following AGENTS.md and the E5 & E6 writing guidance.
- Upgrade existing saves. Extend tools/simulate.ts with the E6b reports and targets in balance/targets.yaml, reporting famous lives separately for the net worth target.

Meet every E6b acceptance criterion. Run all checks and a 10,000-life simulation, open a pull request into main, wait for CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## After the expansions

1. **Avatar stage.** Once the regenerated tops and neck sheets are ready, a stage to build layered, recolorable portraits that age and pass looks to children (connecting to E2a genetics). Its gate gets written when the assets exist.
2. **Stage 11 (Polish), Stage 12 (Balancing) and Stage 13 (Launch),** as planned in Part 2, now covering the expanded game.