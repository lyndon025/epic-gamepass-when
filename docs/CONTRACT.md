Contract version: v1.3 (2026-09-25)

# Prediction output schema

The fields `/api/predict` returns and the frontend binds to. Renaming or removing
anything here is a breaking change: bump the version, add a changelog entry, and
update the frontend in the same commit.

`pipeline/preflight.py` asserts the required fields are present, so a rename that
skips this document still fails the gate.

## Always present

| Field | Type | Meaning |
|---|---|---|
| `game_name` | string | Echo of the query |
| `category` | string | Coarse bucket, e.g. "Day One (Xbox Game Pass Ultimate)", "6-12 months" |
| `tier` | string | Which part of the cascade answered. Diagnostic, shown under Technical Details |
| `reasoning` | string | Prose explanation. May contain newlines |
| `grain` | string | How precisely the answer may be stated. See below |
| `basis` | string | One sentence naming what the answer rests on |
| `confidence` | number | 0-100. **Retained for compatibility, not displayed.** See note |
| `data_as_of` | string | ISO date the underlying data was collected. Every answer is only as current as this |
| `next_update_by` | string | ISO date the next data refresh is due (cadence: quarterly) |

## Present when the answer came from the model

| Field | Type | Meaning |
|---|---|---|
| `predicted_months` | number or null | P50 months from now. Negative means the estimate has passed. Null on `unlikely` answers, which carry no forecast |
| `predicted_months_low` | number | P10 bound, months from now |
| `predicted_months_high` | number | P90 bound, months from now |
| `projected_arrival` | string | P50 as an absolute month, e.g. "March 2028" |
| `projected_arrival_low` | string | P10 as an absolute month |
| `projected_arrival_high` | string | P90 as an absolute month |
| `predicted_total_days` | number | Total wait from release, not from now |
| `publisher_game_count` | number | Games from this publisher already on the service |
| `publisher_avg_wait_days` | number | That publisher's mean wait |
| `publisher_consistency` | number | Coefficient of variation. Higher means more erratic |
| `metacritic_score_used` | number | Score fed to the model: the real Metacritic score, or the service's typical score when the game has none. Never a converted player rating |
| `precedents` | array | Up to three of this publisher's earlier arrivals on this service, newest first: `{game, months, joined}`, where `months` is the wait from release and `joined` an absolute month. Launch-window arrivals and waits over ten years are left out. Empty when the publisher has none |
| `window_start` | string | Start of the usual arrival window (P10), absolute month, NOT clamped to today |
| `window_end` | string | End of the usual window (P90), absolute month |
| `window_progress` | number | 0 to 1: how far through that window today falls |
| `game_age_years` | number | Years since release |
| `chance_next_year` | number | Only once the estimate has passed: share of games this old, not yet on this service, that arrive within a year. Service-wide base rate, from `arrival_hazard.json` |

## Present on the history path

| Field | Type | Meaning |
|---|---|---|
| `last_appearance_date` | string | When it was last on the service |
| `sample_size` | number | How many times it has appeared |
| `recently_appeared` | bool | Still likely available, so the prediction may be moot |
| `repeat_outlook` | string | `available`, `announced`, `unlikely` or `rotating` |
| `leaving_on` | string | On `available`: announced removal date, when one exists |
| `arriving_on` | string | On `announced`: the published arrival date |
| `games_on_service` | number | On `unlikely`: games this service has ever had |
| `games_returned` | number | On `unlikely`: how many of those ever came back |
| `return_rate` | number | `games_returned / games_on_service` |

## `grain` values

Resolved in the backend, never recomputed in the UI, so the thresholds live in
one place. Driven by the width of the calibrated band: a 40-month range does not
support naming a month.

| Value | Meaning | Rendered as |
|---|---|---|
| `month` | Band under 24 months | "Most likely March 2028" plus the drawn range |
| `year` | Band 24-48 months | "Best estimate March 2028" plus the range |
| `floor` | Band 48-96 months | "Rough estimate December 2028" plus the range |
| `suppressed` | Band over 96 months | "Very rough guess", with a warning that the range spans 8+ years |
| `window` | Estimate passed or due within ~6 weeks, and games this old still arrive at 8%+ a year | "could be any time now", with the window and a "today" marker |
| `fading` | Estimate passed; yearly chance 3-8% | "possible, but fading", with the chance |
| `unlikely-soon` | Estimate passed; yearly chance under 3% | "unlikely soon", with the chance |
| `available` | In the catalogue as of `data_as_of` (Game Pass, PS Plus) | "On Game Pass", qualified "as of our last update" - or "leaving <date>" when a removal is announced. Never stated as "now": a blank removal date only proves membership on the collection date |
| `announced` | Arrival officially dated after the collection date | "Joining <date>" |
| `unlikely` | Appeared before and has not returned | "unlikely to return", with the service's return rate |
| `rule` | Publisher policy or first-party | Category badge, no range |
| `repeat` | The game's own history | Date plus range |
| `ineligible` | Not on this platform | Category badge |
| `no-interval` | Answered without a band | Category badge |

Rule answers carry no range on purpose: their risk is a policy changing, not
statistical spread, so a confidence band would misrepresent it.

## On `confidence`

Still returned so nothing breaks, and **no longer displayed**.

It was a stack of hand-picked constants: a base from publisher sample size,
adjustments for variance and whether a Metacritic score existed, a per-platform
multiplier, then a cap. It was not the probability of any event, so no
observation could ever contradict it.

`basis` replaces it. "Based on 34 previous games from Devolver Digital" is
checkable against the publisher stats on the same page; "71% confident" is not.

Removing the field entirely is deferred to v2.0, so any consumer still reading it
keeps working.

## Interval meaning

`predicted_months_low` to `predicted_months_high` is an **80% interval**,
conformally calibrated: over many predictions the true arrival should fall inside
it about four in five times. Measured coverage on out-of-time data is 85%.

The bounds are ordered before being returned. The three quantile models are
fitted independently and can cross, so sorting is what guarantees
low <= mid <= high.

## Changelog

### v1.3 - 2026-09-25
Adds `precedents`. `metacritic_score_used` is no longer fed a RAWG player rating
scaled to 100 when Metacritic is missing; the frontend sends null and the model
uses its typical value. Cache key moves to v1.3.

### v1.2 - 2026-09-25
Catalogue membership is stated only as far as the data makes it certain. Adds
`data_as_of` and `next_update_by` to every answer, `leaving_on` for announced
removals, and the `announced` grain with `arriving_on` for dated future arrivals.
`available` no longer means "on the service now": it means "on the service as of
the last collection", and the UI says so.

### v1.1 - 2026-09-25
Replaces `overdue` with three grains - `window`, `fading`, `unlikely-soon` - chosen
by the measured yearly arrival chance for games of that age on that service,
instead of treating every passed estimate as "any time now". Adds `available` for
catalogue games that are on the service right now, and `unlikely` for games that
appeared before and have not returned, since only about 1% of Epic giveaways, 7%
of Game Pass titles and 13% of PS Plus titles have ever come back. Dated grains
now lead with the best-guess month rather than a year or a floor. Adds the
window, age, chance and return-rate fields above. `predicted_months` may now be
null. The Vercel proxy's cache key carries this version, so a bump invalidates
cached answers immediately.

### v1.0 - 2026-08-24
First versioned schema. Adds `grain` and `basis`. Marks `confidence` retained but
undisplayed. Documents the interval as an 80% conformally calibrated band and the
ordering guarantee on its bounds.
