# Consistency review (C1)

Every event was checked against the seven consistency rules in AGENTS.md ("if it doesn't make sense, it doesn't happen"), starting with the content build's warnings (`tools/content/consistency.ts`). This file lists every flagged event and how it was resolved, the checks that went beyond the warnings, and the fix (with its test or build check) for each problem in the C1 playtesting table (docs/expansion.md).

The content has 336 events. After the review, `npm run content` prints no warnings, and `tools/content/compile.test.ts` ("has no consistency warnings left unreviewed") fails if one appears. A warning is resolved by fixing the event or by giving the reason in the event's `justified` field; 38 events carry a justification.

## How the warnings were run

1. **First pass:** 55 warnings (time 6, money 29, past 20).
2. **Second pass**, after widening the money check to buying and spending ("buy", "spent", "babysit", "for a price") and narrowing the past check where the first pass showed false positives ("by the time you", "can't remember when", "you've never" on its own): 28 warnings, of which 17 were new.
3. **Third pass:** the widened check flagged "spend" for time ("spend it with", "spend the season"); the check now skips spending time, which cleared 8 false positives.
4. Later rounds widened the time check for follow-ups ("for three years") and found one more (`sober_anniversary`, below).

| Rule | Fixed | Justified | False positive |
|---|---|---|---|
| Time (follow-ups) | 6 | 0 | 0 |
| Money | 9 | 33 | 11 |
| Evidence (past) | 6 | 9 | 7 |

Counts are rows of the table below: one per flagged place (title, text or outcome) and pass.

## Every flagged event

| Event | Rule | Where | Flagged | Resolution |
|---|---|---|---|---|
| `after_the_divorce` | time | text | "It's been a year" | Fixed: reworded with {since} ("You and … divorced {since}"); also requires no partner at home ("too quiet") and the helper who visits is nearby. |
| `after_the_divorce` | time | title | "year after" | Fixed: reworded with {since} ("You and … divorced {since}"); also requires no partner at home ("too quiet") and the helper who visits is nearby. |
| `babysitting_gig` | money | choices.decline | "spend" | False positive ("spend Fridays"): the check no longer counts spending time. |
| `bad_boss` | money | choices.stand.check.success | "buy" | Justified: coworkers buy the coffee. |
| `bankruptcy_lawyer` | money | choices.pay | "debts" | Justified (keep paying: the ledger takes the payments). Also fixed: filing now charges the lawyer's $1,500 fee the title promises. |
| `boss_moving_on` | money | choices.shrug | "spend" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `bully_grown_up` | money | choices.nothing | "Pay" | Fixed: label reworded ("Bag your groceries and go"). |
| `candy_fundraiser` | money | text | "pay" | Justified: the school's and the family's money, not a child's. |
| `chore_chart` | money | choices.negotiate.check.failure | "dollars" | Justified: a failed negotiation pays nothing. |
| `class_reunion` | money | choices.homework | "owe" | Justified: "I owe you" is a figure of speech. |
| `copy_my_homework` | money | text | "owe" | Justified: "I'll owe you" is a figure of speech. |
| `coworker_payday` | money | choices.forget | "dollars" | Justified: the $200 left savings when it was lent. |
| `coworker_payday` | time | text | "It's been a while" | Fixed: "You lent … $200 {since}." |
| `coworker_short_on_cash` | money | choices.excuse | "rent" | Justified: the excuse keeps your money where it is. |
| `dark_season` | past | text | "you used to" | Justified: describes depression in general. Also fixed (household): the helper is nearby, and a partner you live with gets their own branch. |
| `dating_app` | money | choices.date.check.failure | "spends" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `discovery_wardrobe` | money | choices.home | "Buy" | Fixed: buying the clothes costs $120 (both choices that buy them); putting them back is justified. |
| `discovery_wardrobe` | money | choices.put_back | "buying" | Fixed: buying the clothes costs $120 (both choices that buy them); putting them back is justified. |
| `discovery_wardrobe` | money | choices.wear | "Buy" | Fixed: buying the clothes costs $120 (both choices that buy them); putting them back is justified. |
| `doctor_all_clear` | money | text | "bill" | Justified: "a clean bill of health" is an idiom; the visit was charged by the doctor action. |
| `dog_chews_shoes` | money | choices.forgive | "buy" | Fixed: the cheaper shoes cost $40. |
| `drifting_friend` | past | text | "You used to" | Fixed: "You used to talk every day" removed. |
| `emergency_bill` | money | choices.ask | "loan" | Justified: the loan goes straight to the mechanic; you owe the helper informally (memory). |
| `everything_is_too_much` | past | text | "remember when" | False positive ("can't remember when"); the check now skips it. Also fixed (household, playtesting): a partner you live with is woken, not called. |
| `ex_runs_into_you` | past | choices.coffee | "you used to" | Justified: having an ex proves the shared past. |
| `field_trip_museum` | money | choices.explore.check.failure | "spend" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `field_trip_museum` | money | choices.gift_shop | "buy" | Fixed: the gift-shop pencil costs $3. |
| `first_apartment` | money | choices.curb | "price" | Justified: free furniture. |
| `first_gig` | money | choices.spend | "paid" | Justified: the week's pay is earned and spent on the sneakers. |
| `found_wallet` | money | choices.return | "buying" | Justified: the owner buys lunch. |
| `friend_repays` | money | choices.let_slide | "$3" | Justified: the $300 left savings when it was lent. |
| `friend_repays` | money | choices.remind.check.failure | "money" | Justified: the $300 left savings when it was lent. |
| `friend_repays` | time | text | "It's been a while" | Fixed: "You lent … $300 {since}." |
| `golden_years` | past | choices.go | "you used to" | Justified: the event requires 25 years of marriage. |
| `golden_years` | past | text | "you always said" | Justified: the event requires 25 years of marriage. |
| `graffiti_crew` | money | choices.lookout | "spend" | False positive ("spend three cold hours"). |
| `grandparent_stories` | past | text | "you've never" | False positive ("one you've never heard"); the check now only flags "you've never" with been/had/missed/done/once/lost/failed. |
| `health_scare` | past | choices.later.check.failure | "the time you" | False positive ("by the time you"). Also reworded "Months later" in a same-year outcome. |
| `hospice_visit` | money | choices.hold | "price" | Justified: "the price of eggs" is small talk. |
| `interview_offer_call` | money | choices.negotiate.check.failure | "money" | Justified: a failed negotiation leaves the offer as it was. |
| `job_fair` | money | choices.pens | "buy" | Justified: a joke about free pens. |
| `letter_from_old_friend` | past | text | "you still remember" | Fixed: now requires the promised_to_write memory (the promise this letter answers); "you still remember" is the friend asking. |
| `letter_from_old_friend` | time | text | "years later" | Fixed: "who moved away {since}"; now requires the promised_to_write memory. |
| `liquid_lunch` | money | text | "buying" | Justified: the coworker is buying. |
| `loan_forgiveness_program` | money | choices.ignore | "loan" | Justified (ignoring it leaves the loan to the ledger). Also fixed: the event offered a job it never gave you and said "years later" for an immediate effect; it now concerns your current job (requires one) and reads as it happens. |
| `lottery_ticket` | money | choices.save | "dollars" | Justified: keeping your two dollars spends nothing. |
| `lunch_club` | past | choices.no | "You've never" | False positive: the player's own choice label ("You've never liked diners"). |
| `meteorite` | past | choices.keep | "when you were a child" | Justified: the history line records this very event. |
| `meteorite` | past | choices.museum | "when you were a child" | Justified: the history line records this very event. |
| `neighbor_sitter` | money | text | "spending" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `new_glasses` | past | choices.hide | "the time you" | False positive ("by the time you"). |
| `old_pace` | money | choices.no | "money" | Justified: "money in the bank" is a figure of speech. |
| `parent_drinks` | money | choices.pretend | "cost" | Justified: "cost you something" is a figure of speech. |
| `parents_split_holidays` | money | choices.with_a / with_b | "Spend" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `parents_years_later` | time | text | "years after" | Fixed: "Your parents split up {since}."; now requires the parents_split flag. |
| `passed_over` | money | choices.congrats | "costs" | Justified: "it costs you something" is a figure of speech. |
| `payday_loan` | money | choices.walk | "pay" | Fixed: paying late now costs a late fee (a tenth of a month's rent, rentMonths). |
| `pickleball` | money | choices.play.check.failure | "spend" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `prison_first_night` | money | choices.stand_tall.check.failure | "spend" | False positive ("spend your first week"). |
| `prison_library` | money | choices.skip | "spend" | False positive ("spend Tuesdays"). |
| `release_day` | money | choices.walk | "buy" | Fixed: the coffee costs $5. |
| `rent_hike` | past | choices.negotiate.check.success | "you've never" | Fixed: "you've never been late" removed (you may have been). |
| `rent_hike` | past | choices.negotiate.check.success | "you've never been" | Fixed: "you've never been late" removed (you may have been). |
| `retirement_countdown` | past | text | "you've never" | Fixed: "you've never actually done the math" → "you don't actually know". |
| `roommate_trouble` | money | choices.talk.check.success | "buys" | Justified: the roommate buys the pizza. |
| `scam_call` | money | choices.pay.check.success | "money" | Justified: seeing through the scam keeps your money. |
| `semester_abroad` | money | choices.stay | "money" | Justified: staying spends nothing. |
| `senior_dance` | past | text | "when you were young" | Justified: "the songs from when you were young" is true of every senior. |
| `shoplifting_dare` | money | choices.refuse | "buys" | Justified: the friend buys the pretzel. |
| `sibling_covers_for_you` | money | choices.thank | "owe" | Justified: "you owe me forever" is a figure of speech. |
| `sibling_rivalry` | money | choices.revenge | "Borrow" | Justified: borrowing a hoodie, not money. |
| `sibling_rivalry` | money | text | "borrowed" | Justified: borrowing a hoodie, not money. |
| `sitter_in_hospital` | past | text | "when you were small" | Fixed: requires the neighbor_sitter event it remembers. |
| `sitter_stories` | past | text | "you've never" | False positive ("one you've never heard"). |
| `skip_day` | money | choices.go.check.failure | "spends" | False positive ("spend it", "spend the …"): the check no longer counts spending time. |
| `star_performer` | money | choices.enjoy | "buy" | Fixed: "something nice" costs $250. |
| `star_performer` | past | text | "you've never" | False positive ("people you've never spoken to"). |
| `tax_refund` | money | choices.parent | "paying" | Justified: the refund pays for the dinner or trip. Also fixed: "for once" (wrong for a recurring event) reworded, and the parent you take to dinner must be nearby. |
| `the_big_dog` | past | choices.pet | "You've never" | Justified: "you've never been so happy to be trapped" is an idiom. |
| `the_big_dog` | past | choices.pet | "You've never been" | Justified: "you've never been so happy to be trapped" is an idiom. |
| `training_course` | money | text | "pay" | Justified: the employer pays. |

## Beyond the warnings

The warnings only see wording. These checks went through the content by rule.

### Rule 1: category contracts

Category contracts are enforced by the content build, so every event now meets its category's. Meeting them moved 31 events to other categories (most to the new `career` for finding work, `jobless`, `retirement` and `partner`) and added requirements to others (school events require enrollment, work events a job and no retirement, partner events a partner, prison events prison). `tempting_offer` (a work conference) now also requires a job.

### Rule 2: presence

Every cast role declares where the person must be: 218 events, 235 roles (city 99, anywhere 77, household 47, nearby 8, elsewhere 4). Roles that meet someone in person are city, household or nearby; roles reached by letter, phone or travel are anywhere; visitors from out of town are elsewhere. Reviewed in this pass: the helpers who visit or show up in `after_the_divorce`, `dark_season` and `hospital_stay` are now nearby; the parent taken to dinner in `tax_refund` is nearby. Where an outcome needs the person in person, the choice asks `where` (`parent_needs_care`, `parent_gives_up_keys`, `pride_march`). The restored grandparent events are anywhere (staying with them) or nearby (a hospital visit, stories in person).

### Rule 3: evidence

Besides the warnings: `sober_anniversary` now requires the intervention it remembers; `marathon` no longer says you go to a gym (it requires Fitness 55 or more and a friend talks you into it).

### Rule 4: time

Every "years later" style phrase was searched for in all event text, not only follow-ups. Follow-ups: the five fixed above, and `sober_anniversary` ("for three years" → "ever since"). Elsewhere: `night_shift_parent` no longer promises you'll find the drawings "decades later", `empty_party` drops "Years later", `health_scare` drops "Months later", `loan_forgiveness_program` drops "Years later". The remaining hits are YAML comments, and `fiftieth_reunion` ("Fifty years on"), which requires ages 66 to 70 and a high school diploma.

### Rule 5: money

Besides the warnings: `gym_resolution` charges the membership when you stick with it too (it only charged when you quit), `rent_hike` changes the rent by a percentage from now on instead of a one-time charge, and `landlord_repairs` refunds or charges a month of your rent instead of flat amounts.

### Rule 6: household

All 40 home and health events were read for a partner you live with. Support roles in home, health and partner events now cast a partner you live with first, even below the usual trust (`castCandidates`). Branched or reworded:

- `everything_is_too_much`: "Call {helper}" only for someone who doesn't live with you; a partner you live with is woken ("Wake {helper}"). "Nobody notices" became "If anyone notices, they don't say".
- `dark_season`: a partner you live with makes soup and stays in; someone in your city shows up every day.
- `hospital_stay`: "You get through it alone" became "You insist on doing everything yourself".
- `relapse`: "Nobody would ever know" became "Nobody would have to know".
- `chest_pains`: "A neighbor finds you" became "Someone finds you".
- `first_apartment`: "entirely yours" became "the first place with your name on the lease" (true with a partner or roommate).
- `after_the_divorce`: requires no partner at home ("home is too quiet").
- `rent_hike`: "Find a roommate" isn't offered while you live with your partner.

Already partner-aware: `attic`, `hearing_aid`, `leftover_pills` (spouse branches). The rest don't describe who is at home.

### Rule 7: status-aware text

A scan for "your partner/boyfriend/spouse…", "your boss/coworker/job/shift…" and "your class/teacher/homework…" in text whose event, category contract, cast or choice doesn't require that status found one problem: `homework_vs_shifts` (gig work) said "your boss"; it now says "the app", and "report card" became "grades" (it covers college too). `loan_forgiveness_program` offered a job and never gave it; it now concerns the job you have.

### Repeats

Repeats of events not marked recurring were about 45% of the events fired per life (300-life run). 22 events that describe things that come back are now `recurring` (holidays, birthdays, a tax refund, an office party, covering a shift, a friend asking to borrow money, a friend's wedding, and the follow-ups of those); any other event is less likely each time it comes back (`repeatWeight` in `balance/events.yaml`). Answers to your own actions and to system triggers count as recurring. Their texts were read for anything that only works once: `tax_refund` said "for once" and was reworded. Two of them then fired too often for the coverage report's share limit (3% of all events): `gym_resolution` (weight 7 → 4, cooldown 4 → 5 years) and `casino_weekend` (cooldown 4 → 6 years).

## Playtesting table

| Problem | Fix | Test or build check |
|---|---|---|
| "Years later" texts that don't fit when follow-ups arrive | All reworded (above); `{since}` placeholder; the build warns on fixed time phrases in follow-ups | `compile.test.ts` "warns on a fixed time gap in a follow-up", "keeps {since} to scheduled follow-ups"; `events.test.ts` "{since}"; `consistency.test.ts` "carries when a follow-up was set up into its card text" |
| Test prompts when not in school | Category contracts | `compile.test.ts` "enforces category contracts and presence declarations"; `consistency.test.ts` runtime invariant test |
| Shift cover, late and sick-day events when jobless or retired | Category contracts (work: a job and not retired); retired with a job is an invariant failure | `consistency.test.ts` "reports a pending event that breaks its category contract…" |
| Physically interacting with someone who moved away | Presence; `moveAway`; in-person actions need the person in your city | `consistency.test.ts` "moves someone to another city", "makes an in-person action unavailable with someone who lives elsewhere", "drops a follow-up when someone in it is no longer where it needs them" |
| "In town for a night" from a partner you live with | Presence (`old_friend_reunion` needs the friend elsewhere; a live-in partner is household) | `consistency.test.ts` "rejects 'in town for one night' for an old friend who now lives with you", "only casts people who are where the role needs them" |
| Weddings cost nothing | Courthouse, small or big, through the finance module, with family help and credit | `costs.test.ts` "weddings cost money by size" |
| Mental health events only involve friends; the partner never notices; "call them" acts as if you're single | Household-first support casting; branched texts | `consistency.test.ts` "casts a partner you live with as the helper… and offers to wake them instead of calling", "prefers a live-in partner for home and wellbeing support roles" |
| A late-life event about physical activity for someone who never did any | Evidence rule and warnings; `old_knees` requires the marathon flag; `marathon` no longer claims a gym habit | `compile.test.ts` "warns on money talk…, past claims without evidence…"; "has no consistency warnings left unreviewed" |
| Lending money, babysitting and similar events don't change money; "help out for a price" pays nothing | Money warnings and fixes (above); lending, babysitting and `old_employer_calls` all change money | `compile.test.ts` money warning test and "has no consistency warnings left unreviewed" |
| Rent increases are too small | `rent_change`: a percentage of current rent that sticks until you move | `costs.test.ts` "rent changes" |
| Money changes aren't visible | Outcome cards show each change and the new balance; choice buttons show known costs | `consistency.test.ts` "money on event cards"; `tests/e2e/aging.spec.ts` (phone) |
| Happiness averages about 93 | Yearly drift toward a personal baseline; obituary thresholds back to 70/40 | `aging.test.ts` "Happiness drift"; simulation target `consistency.lifetimeHappiness` |
| About half of all events fired are repeats | `recurring` events; repeat penalty for the rest | `events.test.ts` "keeps full weight for recurring events"; simulation and coverage target `consistency.maxRepeatShare` |
| No grandparents in any life | Generated at creation, alive or not; grandparent events restored | `life.test.ts` "grandparents (C1)" |
