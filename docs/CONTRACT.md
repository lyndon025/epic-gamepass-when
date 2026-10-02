Contract version: v1.10 (2026-10-02)

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
| `metacritic_score_used` | number | Score fed to the model: the real Metacritic score (RAWG's, or the one on record in our data when RAWG has none), or the service's typical score when the game has none anywhere. Never a converted player rating |
| `precedents` | array | Up to three of this publisher's earlier arrivals on this service, newest first: `{game, months, joined}`, where `months` is the wait from release and `joined` an absolute month. Launch-window arrivals and waits over ten years are left out. Empty when the publisher has none |
| `window_start` | string | Start of the usual arrival window (P10), absolute month, NOT clamped to today |
| `window_end` | string | End of the usual window (P90), absolute month |
| `window_progress` | number | 0 to 1: how far through that window today falls |
| `game_age_years` | number | Years since release |
| `chance_next_year` | number | Chance it joins in the next 12 months. With `odds_method` "two_views": the average of the by-age and by-window views for this game (any timed answer). Otherwise only once the estimate has passed, the service-wide rate for games this old |
| `chance_by_window_end` | number | Chance it joins before its window closes. With `odds_method` "two_views": on any timed answer whose window end is still ahead. Otherwise on `window`, `fading` and `unlikely-soon` while the window is open, compounding the age table |
| `window_years_left` | number | With `chance_by_window_end`: years until the window closes |
| `odds_method` | string | "two_views" when the chance fields come from services/odds.py (D-041); absent when they come from the age table (a service the deploy's backtest kept on it) or there are none |
| `chance_ever` | number | With "two_views": chance it ever joins, from today |
| `chance_buckets` | array | With "two_views" and a window end still ahead: `{label, from_years, to_years, chance}` per calendar stretch from today to the window's end, e.g. "Oct-Dec 2026", "2027", "Jan-Jul 2031"; the chances add up to `chance_by_window_end` |
| `chance_views` | object | With "two_views": `{by_age, by_window, age_base, band, band_factor_age, pub_factor_age, band_factor_window, pub_factor_window, ever_like_it}`. `by_age` and `by_window` are each view's chance in the next 12 months (`by_window` null without timing); `age_base` the by-age figure before any factor; `band` the Metacritic band ("none", "<70", "70s", "80s", "90+"); `ever_like_it` the chance a game like it ever joins, from release |
| `metacritic_source` | string | Where the score came from: "rawg", "records" (our data, RAWG had none) or "none" |

## Present on Sony PS4/PS5 answers (PS Plus Extra)

Sony-published games with a release date, not already in the catalogue, are
answered from Sony's measured record rather than the model (`tier` "Sony
Window", `prediction_basis` "sony_window"). They carry the same date and window
fields as a model answer, plus:

| Field | Type | Meaning |
|---|---|---|
| `sony_window` | object | `{low, high, best, n}`: the range and best guess in months after release, and how many Sony games it was measured on |
| `months_since_release` | number or null | Whole months since release; null before release |
| `track_record` | object | `{n, y1, y2, y3, subject}`: how often the best guess landed within 1, 2 and 3 years on those games, in tenths, and what they are. The site shows it in place of the service's model record |

## Present on `ineligible` answers

| Field | Type | Meaning |
|---|---|---|
| `ineligible_reason` | string | `platform` (not on the service's platforms at all) or `classic` (a PlayStation game only on consoles before the PS4, which PS Plus Extra does not carry) |

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
| `chance_by_year` | number[8] | On `unlikely` and `may-return`: running chance it has returned within 1, 2, ... 8 years from now, from the same return table as `chance_next_year` (so element 0 equals it) |

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
| `window` | Estimate passed or due within ~6 weeks, and games this old still arrive at 8%+ a year; for a Sony answer, past the best guess but inside the range | "could be any time now", with the window and a "today" marker |
| `fading` | Estimate passed; yearly chance 3-8% | "possible, but fading", with the chance |
| `unlikely-soon` | Estimate passed; yearly chance under 3% | "unlikely soon", with the chance |
| `available` | In the catalogue as of `data_as_of` (Game Pass, PS Plus) | "On Game Pass", qualified "as of our last update" - or "leaving <date>" when a removal is announced. Never stated as "now": a blank removal date only proves membership on the collection date |
| `announced` | Arrival officially dated after the collection date | "Joining <date>" |
| `unlikely` | Appeared before and has not returned | "Rarely returns", with the chance by year and the service's return rate |
| `rule` | Publisher policy or first-party | Category badge, no range |
| `repeat` | The game's own history | Date plus range |
| `ineligible` | Not on this platform, or (`ineligible_reason` `classic`) an older PlayStation game | Category badge and a note |
| `no-interval` | Answered without a band | Category badge |

A dated Sony answer is always `year`: its best guess only ties a flat
18-month rule, so it is never worded as "most likely".

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

### v1.10 - 2026-10-02
Every timed model answer now says how likely the game is to join, not only
answers past their best guess (D-041). Adds `odds_method`, `chance_ever`,
`chance_buckets`, `chance_views` and `metacritic_source`. `chance_next_year` and
`chance_by_window_end` keep their names and meaning (the chance in the next 12
months; the chance before the window closes) but, with `odds_method`
"two_views", come from the game's age, Metacritic band, publisher record and its
own window instead of the service-wide age table, and are present on dated
answers too. When RAWG sends no Metacritic score, the score on record in our
data is used for the window and the chances (`metacritic_source` "records").
The `basis` line on `window`, `fading` and `unlikely-soon` reads "About N in 100
games like this one join <service> within a year". Sony's own games on PS Plus
Extra keep Sony's window and carry no `odds_method`. Additive; no field was
removed.

### v1.9 - 2026-10-02
Adds `chance_by_window_end` and `window_years_left` to answers past their best
guess whose usual window is still open. The `basis` line for `window`, `fading`
and `unlikely-soon` now names the age group its figure was measured on
("games released 2 to 3 years ago") and reads "Fewer than 1 in 100" under 1%,
instead of rounding to "1 in 100" or "0 in 100". The site also reads
`public/odds_rank.json` (written at deploy) to compare a yearly chance with
every game still waiting for that service; that file is not part of the
answer. Additive; no field was removed.

### v1.8 - 2026-09-27
Sony PS4/PS5 answers on PS Plus Extra come from Sony's measured window instead
of the fixed "Likely (within 12-24 months)" rule: they carry the usual date and
window fields plus `sony_window`, `months_since_release` and `track_record`, and
move through `year`, `window`, `fading` and `unlikely-soon` like model answers.
The `rule` grain no longer occurs on PS Plus. `ineligible` answers carry
`ineligible_reason`; `classic` marks a game only on older PlayStation consoles
("Not a PS Plus Extra game"). Additive; no field was removed.

### v1.7 - 2026-09-27
Adds `chance_by_year` to `unlikely` and `may-return` answers: the running
chance of a return within 1 to 8 years, which the site draws as a year-by-year
chart against the service's `return_rate`. The `unlikely` category now reads
"Rarely returns" (was "Unlikely to return"). Additive; no field was removed.

### v1.6 - 2026-09-27
Adds the `may-return` grain: a game that appeared before, whose measured chance
of coming back within a year is 3% or more ("Could return"). `unlikely` now
means that chance is under 3%. Both carry `chance_next_year` (the measured
return odds for a game in that position), `years_since_last` and
`last_run_ended`. A dated `repeat` answer now needs three or more runs at
regular intervals. Humble no longer has a separate "never repeats" rule.

### v1.5 - 2026-09-27
Every answer carries `backend_version`: the fingerprint of the backend build
that produced it (apps/backend/backend_version.py). The site's proxy adds
`source`: `precomputed` (a stored answer), `cache_hit` (saved from a recent
prediction) or `cache_miss` (live from the backend). The proxy saves a live
answer only when `backend_version` matches the build its stored answers were
made with, and keys saved answers by that build, so an answer from a backend
that has not finished redeploying is never served as the new one.

### v1.4 - 2026-09-26
Platform-check answers (a game not released on the service's platform) now carry
the `ineligible` grain instead of falling through to `no-interval`, and their
`category` is sentence case: "Not on PC", "Not on Xbox or PC", "Not on
PlayStation". The frontend shows every `category` in sentence case. Cache key
moves to v1.4 so answers stored with the old wording are not served.

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
