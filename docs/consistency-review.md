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

## E2b (heirs and inheritance)

The 30 heir events (categories `estate`, `guardianship` and `legacy`) were written against the same rules, and `npm run content` prints no warnings for them.

- **Category contracts:** each of the three categories requires `family: { heir: true }` (`registries/categories.yaml`); any event that casts a parent who has died must require it too (`checkHeir`).
- **Presence:** a guardian is always `household` (a minor heir lives with them: `whereabouts` treats `housing.guardianId` as the household), siblings in disputes are `anywhere` (a phone call or a letter), and the people the heir meets in the legacy events are `city`.
- **Evidence:** the memory events require the memory of how the heir was raised (`heir_warm_home`...) from the parent, the foster events require `in_foster_care`, the "left out" event requires `left_out_of_will`, the will events require `estate_will` or `estate_no_will`, the family-home event requires `inherited_a_home`, and the guardian events require who the guardian is. Claims about the past that the heir can't know are avoided (the family-home text doesn't say the heir grew up there).
- **Time:** the follow-ups use no fixed gaps ("a week later" and "last week" were reworded).
- **Money:** the contested estate and the contested will charge `legal_help` (scaled by city), and selling the family home goes through the `housing` effect; no other heir event mentions money, and the amounts an heir inherits are on the "Previously" card and the Money tab, not in event text.
- **Household:** the family-home decision doesn't happen while a partner lives with the heir (it would have to account for them).
- **Adults only:** the guardianship events are about a minor's family and use no romantic wording; nothing in them casts a partner.

## W2 (belonging): the faith events

Expansion plan, "Second-wave writing guidance": no religion is presented as better, worse, truer or sillier than another; the writing never mocks belief or the lack of it; congregations vary in how welcoming or strict they are, so no faith is painted as one thing, and people within them vary too; hard tensions are handled with weight, with reactions that differ from person to person and no community written as a villain. Congregation names and clubs are fictional; the religions are real.

Besides the rules in AGENTS.md (checked by the content build as for every event, `npm run content` prints no warnings for these), the content build now enforces a few of these mechanically (`tools/content/belonging.ts`):

- every faith has a congregation, and every congregation asks the same hours, costs and values and draws its traits from the same ranges (the tradition changes the name, the words and nothing about how hard it is to belong);
- the faiths, groups, rites and events contain none of a list of words that mock belief or the lack of it, or name a religion as something to fear;
- an event names a group, a role, a faith or a pull toward a faith only where it requires one;
- a conversion to "the faith of the group" needs a faith group, and returning needs a faith you were raised in.

All 31 events below were then read in full against the four points of the guidance. "Checks" is what was looked for and found; "Changed" is what the review changed.

| Event | About | Checks | Changed |
|---|---|---|---|
| `faith_holiday_gathering` | Your tradition's holy days at home | Names no religion: it uses `{faith}`, so the same words fit every tradition; hosting, services only and a quiet year are each shown as a valid way to keep it. | None needed. |
| `faith_holiday_far_from_home` | A holy day away from family | Same for every tradition; travelling, phoning and building your own way are equally respected. | The trip costs money through the `holiday_travel` cost item. |
| `rite_jewish_coming_of_age` | Bar, bat or b'nei mitzvah | Names the three forms because communities differ; a young person who is unsure is answered calmly by the teacher, parents are not villains. | Reworded the candy-throwing detail (some communities only) to "the congregation answers with a song". |
| `rite_christian_confirmation` | Confirmation or its equivalent | "Or the equivalent in your church" covers traditions that mark it differently; waiting a year is met with respect. | None needed. |
| `rite_muslim_first_fast` | A first fast | Half a day is called a fine beginning; waiting is accepted without fuss; nothing says how much a child must do. | Replaced "dates" (also the content build's romance word) with "dried fruits". |
| `rite_dharmic_young_practice` | Taking up the practice (Hindu, Buddhist, Sikh) | One event for three traditions, with no ceremony described that belongs to only one, and the elders say the practice has a place whether or not you stay. | Kept generic on purpose: three accurate rites would each be a different event. |
| `faith_engagement_blessing` | Marrying in your congregation | A full ceremony, a blend of two traditions and a simple one are all warm; the congregation sends a gift and a note even for the simple one. | Title changed from "within the walls" to "in your congregation". |
| `faith_comfort_in_illness` | A congregation after an illness | Prayer is offered "in their own way" and asked first; accepting everything, only the practical help, or privacy are all fine and nobody is offended. | None needed. |
| `faith_crisis_of_faith` | Doubt after a hard stretch | Three ways through (ask, sit with it, let go), none better; no tradition is claimed to answer doubt in a particular way. | Reworded "the hard times are when belief matters most" (a claim about every tradition) to "you were taught"; "honest doubt is old company in your tradition" became "doubt is not unusual"; "putting down something you have carried so long you forgot it was heavy" (belief as a burden) became "something that held you up for a long time". |
| `faith_doubts_young_adult` | Questions away from home | Studying your own tradition, looking at others and setting it aside are all shown as ordinary; exploring is not shown as a fall. | None needed. |
| `faith_found_in_hard_time` | Finding a faith | Names the group's religion with `{groupFaith}`; staying, going as a guest and turning back are all shown with dignity; a person without faith is not cast as lacking. | None needed. |
| `faith_return_late_life` | Returning to the faith you were raised in | Going back, honoring it in memory and exploring elsewhere are equal; a secular life is not a mistake. | None needed. |
| `faith_conversion_study` | Studying a partner's faith | Converting, learning without converting and declining kindly all keep the relationship warm; the partner never pressures. | None needed. |
| `faith_interfaith_holidays` | Two calendars, one home | Celebrating both, alternating and keeping them apart are each named as working, each with its small cost. | Removed a line that assigned the holidays to "his, hers" with hardcoded pronouns. |
| `faith_interfaith_children` | What the children will be taught | Raising them in either faith, or both, is treated symmetrically; the grandparents have views and are not blamed. | None needed. |
| `faith_parent_hurt_by_leaving` | A devout parent when you stop believing | The parent is hurt, not hostile: no punishment, no ultimatum; staying close and taking distance are both open to you. | None needed. |
| `faith_parent_shrugs_at_leaving` | A parent who is not surprised | Shows the other common reaction (relief, shared honesty), so reactions differ from parent to parent. Does not imply belief is hollow: the parent's remark is about this one faith being "more mine than yours". | None needed. |
| `faith_parent_and_conversion` | A parent and your new faith | The parent's feelings are real and mixed; sharing, inviting and waiting are all warm; the failure case is a misunderstanding, not a fight. | None needed. |
| `faith_strict_congregation_tension` | A hard tension: being who you are in a strict congregation | Written with weight. Reactions differ person to person: an ally who stays beside you, an elder who is kind and does not move, a leader who says nothing unkind. Nobody is a villain and the congregation is not; leaving is shown as a grief, staying quietly as a cost, speaking up as uncertain. | Checked that it requires the congregation to be strict, that you have come out and that the speaker is a member; the outcomes never end with someone cast out. |
| `faith_welcoming_congregation` | A congregation that welcomes you | The counterpart: a congregation that is welcoming (the same faith can be either), so no faith is painted as one thing. | None needed. |
| `faith_child_asks` | A child asks why | Tell them honestly, say there are many answers, or put it off: all fine. | None needed. |
| `faith_work_observance` | A day your tradition sets aside, at work | The boss is not hostile in either outcome; the failure leaves a workable compromise. | None needed. |
| `faith_neighbor_preaches` | A neighbor who wants to talk about eternity | Gentle comedy at the neighbor's expense was the first draft; now the neighbor is kind and committed and the three choices (listen, set a boundary, argue for fun) all end warmly. | Reworded "utterly sure about what you ought to believe" to "deeply committed to their faith, and hopeful you might come to share it". |
| `faith_retreat_weekend` | A retreat | Stress relief as a consequence of the practice, not a verdict on it; skipping is not punished. | The retreat costs money through the `faith_retreat` cost item. |
| `invite_faith_curious` | An invitation to a faith that is not yours | Visiting as a guest, declining and asking questions are all welcomed; nobody asks what you believe. | None needed. |
| `invite_faith_congregation` | An invitation to a congregation of your own religion | Joining casually, committing or waiting are all fine; "not yet" is not criticized. | Reworded "years ago" (a fixed gap in a follow-up) to "long before". |
| `discovery_faith_find` | A pull toward a faith you do not have | Following it, holding it quietly and putting it away are all allowed; the pull is not a symptom. | Removed "it isn't your family's" (could be false). |
| `discovery_faith_lose` | Going through the motions | Admitting it, talking to someone and carrying on are all fine; loss is not shown as failure. | Reworded "relief at no longer pretending" (implying the belief was false) to "relief at being honest with yourself". |
| `discovery_faith_convert` | A different house of prayer | Switching, studying and staying are all respectful; "not a rejection of what raised you". | None needed. |
| `resurface_faith_find` | The pull is back | Same as the first time: listen or put it away again. | None needed. |
| `resurface_faith_lose` | The doubt that didn't go away | Accepting, or keeping the practice for what it gives you, both shown as honest ways to belong. | Replaced a group-standing effect (the event is not about a group) with a value effect. |

The four rites (Jewish, Christian, Muslim, and one shared by the Hindu, Buddhist and Sikh traditions) are written to be accurate and generic rather than detailed: where a tradition varies between communities (the form of a ceremony, how much a child fasts), the text says so. The other belonging events happen in a group of any type (invitations, roles, scandals, a fundraiser) and mention no religion; they were read for the same points and need nothing from this review. Reviewers should look especially at `faith_strict_congregation_tension`, which is the one hard tension in this stage.

## W3 (businesses): the events

The 47 business events (`business`, `bizstart` and `bizpast`) were written against AGENTS.md and the second-wave writing guidance (all brands, chains, shops and people are fictional; humor from situations, not from where people are from), then run through the content build. The first pass gave 16 warnings, all of the same kind: text or a choice that mentioned money ("costs", "pay", "loan", "owe", "price", "rent", "wages") without changing money. Each was resolved by rewording where no money should change ("It costs nothing" became "It's free"; "the loan officer" became "the officer"; "a 'for rent' sign" became "a vacant storefront"), or by making the choice move money (`business: pay`/`receive`, `cost`, `repay`), and by counting a raise (`staffRaise`) as an ongoing change to your money in the build's check. After that `npm run content` prints no warnings, and nothing needed a `justified` entry.

What the review looked at beyond the warnings:

| Rule | What was checked | Result |
|---|---|---|
| Category contracts | Every `business` event requires `business: { owned: true }`, every `bizstart` event requires that you own none, every `bizpast` event requires `failedWithin`; the build rejects one that doesn't. | Enforced by `registries/categories.yaml`. |
| Presence | Workers, investors, a co-founder and a manager are cast from the business itself (`cast: { business: ... }`) with the presence the scene needs: staff `city` (they are at the shop), investors and a manager `anywhere` (a phone call, a letter), a partner at home `household`. | Done in each event. |
| Evidence | Events about investors require the memory that proves it (`invested_in_your_business`), co-founder events `cofounded_with_you`, the failed-investor events `lost_money_in_your_business`; text that speaks of a past failure requires `failedWithin`; text that speaks of years of trading requires `years`. | Done; `biz_investor_update` and `biz_investor_wants_out` were the ones that first lacked the memory. |
| Time | No fixed gaps in follow-ups. | None found. |
| Money | Every amount an event moves is a share of the business's own yearly revenue (`pay`, `receive`, `theft`) or a scaled cost item (`biz_salvage`, `biz_repay_start`, `biz_repay_more` in `balance/economy.yaml`), so it grows with the business and the city; the screen shows the amount and the new balance. | `biz_failure_closing_day` and the two investor-loss events first used fixed dollars and were changed to cost items. |
| Household | `biz_partner_resents_hours` casts a partner who lives with you and requires that you run the business yourself. | Done. |
| Status-aware text | Choices that need staff, a manager or a co-founder are hidden unless the business has one (`visibleIf`). | Done. |
| Pronouns | Every person is cast with pronoun placeholders; a buyer in `biz_offer_to_buy` and an owner in `biz_emergency_job` first had a hardcoded "he" and "she" (caught by the render test) and were changed. | Done. |

Tone and subject matter worth a second look: `biz_staff_theft` (a worker takes money; the choices are to confront, let them go, or lock the drawer, and the worker's reason is a bill, not a villain), `biz_failure_closing_day` and `biz_failure_debts` (failure and guaranteed debts, with the debt counselor and bankruptcy shown as ordinary ways through), and `biz_investor_lost_money_family` (a relative who lost money, written without blame).

## W4a (countries): the review of existing events and the new packs

Every existing event was checked for US-only references by the content build's new country contract (`countryTags` in `registries/categories.yaml`: US-only terms, words said differently per country, literal dollar amounts). The build's first run listed what needed changing; 45 event files were changed and the build now refuses a regression.

| Finding | Events | Result |
|---|---|---|
| Amounts written as `$300` or "dollars" | about 28 (for example `lost_tooth`, `found_wallet`, `payday_loan`, `lottery_ticket`, `busker_duet`, `pay_it_back`, the `friend_asks_to_borrow` chain) | Now `{$N}` (scaled to the country's prices and shown in its currency) or `{currency}`. The effects were already scaled by the country's price level, so the text and the money agree. |
| School words (high school, middle school, principal, college) | `chore_chart`, `college_essay`, `semester_abroad`, history and obituary text | `{highSchool}`, `{middleSchool}`, `{principal}`, `{college}`, `{diploma}`, `{equivalency}` and the other country words. |
| Drinking and gambling at a fixed 21 | `liquid_lunch`, `one_more_for_the_road`, `offer_bar_regular`, `scandal_night_out`, `casino_weekend` | `legalAge: drinking` or `gambling` (and `age gte 18` where the scene needs an adult). |
| US-only | `surprise_medical_bill`, `valedictorian` (US and Canada) | Tagged `countries`. |
| Health bills | `chest_pains` | Reworded; the medical cost items pay the country's share (`health:` key), so a public system charges little. |

The 91 new events (31 Canadian, 30 British, 30 Mexican) were written against AGENTS.md and the second-wave writing guidance: no national stereotypes, no named real brands or people, every NPC a placeholder (relatives who may not exist are written as "a relative"), every amount `{$N}` with a matching money effect, every event tagged `countries: [..]`. Warnings the build raised were fixed by rewording; none is justified.

## W4b — Language

Reviewed the twenty `events/any/language/language_*.yaml` ordinary events and `language_class_result`, plus the chat barrier variants. Language-learning claims require an existing skill; family-language stories require the relevant native flag; the school-partner event requires enrollment. Montreal's counter story requires Montreal and a French skill below conversational level. The two social events cast an adult acquaintance in the player's city and provide barrier wording from the same shared-language check as interactions. No language event is romantic. The class action charges through finance and its existing event-result money record shows the charge and new savings. No event assumes a fixed time gap or writes a literal currency amount.
