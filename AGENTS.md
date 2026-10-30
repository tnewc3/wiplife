# AGENTS.md — rules for working on WIPlife

## Read first
- docs/design.md (game design) and docs/technical.md (architecture, data model, stage gates).
- Inspect the existing code before changing anything.

## Scope
- Implement only the stage you were asked to implement. Never start the next stage.
- Do not rewrite working systems. Do not create a second system that does the same job as an existing one.
- If something is ambiguous or would change the architecture, stop and ask.

## Architecture boundaries
- src/engine is pure TypeScript: no React, no DOM, no browser APIs, no Math.random, no Date.now.
- All randomness goes through the seeded rng stored in the life state.
- Game content lives in src/content as YAML. Never hardcode events, jobs, names or other content in code or UI.
- Exception: fixed interface words for built-in values (wealth levels, relationship labels such as Mother, Father or Parent, housing types) live in one file, src/ui/labels.ts. Anything story-like belongs in content.
- Tuning numbers (rates, curves, budgets, prices, odds) live in src/content/balance as YAML, never inline in code.
- The UI reads state through selectors and changes it only through store actions that call the engine.
- Persistence code lives only in src/persistence.

## Quality
- TypeScript strict mode. No `any` without a comment explaining why.
- Validate every player input and every loaded save.
- Every new system gets unit tests. Every new screen gets a phone-sized end-to-end test.
- Run lint, type check, tests and content build before finishing. All must pass.
- Mobile first: touch targets at least 44px, respect safe areas, nothing depends on hover.
- Stats show as bars with percentages, colored by value. The game has four main tabs (Job or School, Assets, People, Activities) around the Age button; Activities is a hub of categories, each with its own submenu split into Activities and Shopping. Dark is the default theme and light must work everywhere; both pass WCAG AA.
- Density (U2, docs/careers-crime-and-ui.md; the sizes are tokens in src/ui/theme/tokens.css): a list row is about 56px (never below the 44px touch target) with a 28px icon, a 16px title and a one-line 13px subtitle; use `ListRow`/`RowList`. A chevron ends a row that opens a new screen; three dots end a row that opens a quick action sheet. Section headers are sticky and about 28px (`SectionHeader`). A screen with more than two sections or about 12 rows uses in-screen tabs (`SegmentedTabs`) or collapsible groups that remember if they are open (`CollapsibleGroup`, kept in the settings). Actions and confirmations are bottom sheets (`ActionSheet`, `ConfirmSheet`). At most two levels of menus below a tab. A row shows its key value inline (a `MiniBar`, a price, "$15/hour"). Every new screen is checked against these rules, and a screen that moves or regroups is recorded in docs/ui-audit.md.
- Colors come from the tokens in src/ui/theme/tokens.css, never raw values. Content icons are Microsoft Fluent Emoji listed in src/content/registries/icons.yaml and CREDITS.md; interface icons are Lucide. Use no other game's name, logo, colors, wording or art.

## Content rules
- Mature and taboo themes are allowed and must carry consequences. Write frankly, suggestive rather than graphic.
- No romantic or sexual content involving anyone under 18. Dating and romance are for adults only.
- Childhood mistreatment is never sexual and never graphic.
- Sexual violence is never a player choice.
- The player is "you". Use pronoun placeholders for every NPC; never hardcode he or she.

## Consistency rules (if it doesn't make sense, it doesn't happen)
- Category contracts: every event category has required conditions, enforced by the content build (school events need enrollment; work events need a current job and no retirement; partner events need a partner). See src/content/registries/categories.yaml.
- Presence: every cast role declares where the person must be (household, city, nearby, elsewhere or anywhere). Casting respects where people live and who lives with you. Never cast a live-in partner as visiting. In-person actions need the same city.
- Evidence: any text that states something about your past (a sport you played, a habit, a debt) must require the flag, memory or earlier event that proves it.
- Time: never write fixed gaps like "years later" in follow-ups. Use the elapsed-time placeholder {since}, or no time phrase.
- Money: any event or interaction that mentions money must change money, and any money change must be shown with the amount and your new balance. Amounts that depend on your situation (rent, wages, big costs) scale with it.
- Household: if you live with a partner, events about your home and wellbeing must account for them (cast them, or branch the text).
- Status-aware text: text that depends on relationship status, job or school must branch on it or require it.
- The content build warns on wording it can't judge exactly (fixed time gaps in follow-ups, money words without money effects, claims about your past without evidence). Fix each warning, or give the reason in the event's `justified` field.

## Commands
See README.md for build, test and check commands.

## Git workflow
- Branch from the latest main. Open pull requests into main only, never into another feature branch.
- One stage (or one follow-up task) per pull request. Don't bring in unrelated commits.
- At the end of every stage, open its pull request into main without asking.
- A pull request merges only when CI is green.

## When finished
Report what you built, any deviations from the docs and why, anything left undone, and open questions.
Only report facts you checked in the code, tests, files or CI logs. Label anything you didn't check as unverified.
