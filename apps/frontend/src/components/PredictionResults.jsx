import React, { useCallback, useMemo, useState } from "react";
import ShareDialog from "./ShareDialog";
import { ReturnChart, ReturnTiles } from "./ReturnOdds";
import { RETURN_WORDS, hasReturnOdds, returnKicker } from "../utils/returnOdds";
import { predictionUrl } from "../utils/predictionLink";
import { useDataStatus, formatDay, formatMonth } from "../utils/dataStatus";
import { useOddsRank, compareOdds, inTen } from "../utils/oddsRank";
import "../styles/odds.css";
import { CountUp } from "./Motion";

// How often the single best-guess date lands within 1, 2 and 3 years of the
// real one, per service. Measured on games that arrived after a test version of
// the model was built (Jan-Aug 2026), so none of them were seen in training.
// Source: pipeline/scorecard.py. Regenerate after a retrain.
const TRACK_RECORD = {
    gamepass: { n: 63, y1: 5, y2: 6, y3: 8 },
    psplus: { n: 82, y1: 5, y2: 7, y3: 8 },
    epic: { n: 47, y1: 3, y2: 6, y3: 8 },
    humble: { n: 55, y1: 6, y2: 7, y3: 9 },
};

// A measured chance as a reader would say it: "About 3%", or "Under 1%"
// rather than a rounded-up "1%" for something rarer than that.
function chanceText(chance) {
    return chance < 0.01 ? "Under 1%" : `About ${Math.round(chance * 100)}%`;
}

// Where the proxy found this answer (api/predict.js sets `source`).
const SOURCE_LABEL = {
    precomputed: "Stored answer, served instantly",
    cache_hit: "Saved from a recent prediction",
    cache_miss: "Live from the prediction service",
};

// Answers that rest on a forecast date, and so earn a track record.
const DATED = new Set(["month", "year", "floor", "suppressed", "window", "repeat"]);
// Answers whose headline is a month and whose range is drawn.
const RANGED = new Set(["month", "year", "floor", "repeat"]);

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

function clamp01(x) {
    return Math.min(1, Math.max(0, x));
}

// "April 2027" -> a month count, so positions on the bar come from the same
// dates the labels show rather than a second calculation that could disagree.
function monthIndex(label) {
    const m = String(label || "").match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const i = MONTHS.indexOf(m[1]);
    return i < 0 ? null : Number(m[2]) * 12 + i;
}

// Past its best guess with the window's end still ahead. The yearly odds are
// measured for games this age that have not joined; the window says when games
// like this one that did join arrived, and it can still be open. While it is,
// the window leads and the odds support it; once it ends, the odds lead.
function windowStillOpen(p) {
    return p.window_progress !== undefined && p.window_progress !== null && p.window_progress < 1;
}

/** The headline, worded to match how firmly the evidence supports it. */
function headline(p, serviceName, serviceKey) {
    switch (p.grain) {
        case "month":
            return { kicker: "Most likely", value: p.projected_arrival };
        case "year":
            return { kicker: "Best estimate", value: p.projected_arrival };
        case "floor":
            return { kicker: "Rough estimate", value: p.projected_arrival };
        case "suppressed":
            return { kicker: "Very rough guess", value: p.projected_arrival };
        case "repeat":
            return { kicker: "Likely around", value: p.projected_arrival };
        case "window":
            return { kicker: "Inside its usual window", value: "Could be any time now" };
        // "Still in the running" needs both an open window and odds of 3% a
        // year or more (the fading band); under that the plain headline stays.
        case "fading":
            return windowStillOpen(p)
                ? { kicker: "Inside its usual window", value: "Still in the running" }
                : { kicker: "Past its usual window", value: "Possible, but fading" };
        case "unlikely-soon":
            return {
                kicker: windowStillOpen(p) ? "Inside its usual window" : "Long past its usual window",
                value: "Unlikely soon",
            };
        case "unlikely":
            return { kicker: returnKicker(p, serviceKey), value: "Rarely returns" };
        case "may-return":
            return { kicker: returnKicker(p, serviceKey), value: "Could return" };
        case "available":
            return p.leaving_on
                ? { kicker: `Leaving ${p.leaving_on}`, value: `On ${serviceName}` }
                : { kicker: "As of our last update", value: `On ${serviceName}` };
        case "announced":
            return { kicker: "Officially announced", value: `Joining ${p.arriving_on}` };
        case "ineligible":
            return {
                kicker: p.ineligible_reason === "classic" ? "Older PlayStation game" : "Can't come to this service",
                value: sentenceCase(p.category),
            };
        case "rule":
            return { kicker: "Publisher policy", value: sentenceCase(p.category) };
        default:
            return { kicker: "Prediction", value: sentenceCase(p.category) };
    }
}

// Backend labels arrive in mixed casing; shown as a sentence, never in capitals.
function sentenceCase(text) {
    const t = String(text || "").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "No prediction";
}

// Why a game cannot reach a service, in plain words.
const INELIGIBLE_NOTE = {
    epic: "Epic Games Store only gives away PC games, and this one isn't on PC.",
    gamepass: "Game Pass only includes Xbox and PC games, and this one isn't on either.",
    psplus: "PS Plus only includes PlayStation games, and this one isn't on PlayStation.",
};

// A PlayStation game from before the PS4 (D-035).
const CLASSIC_NOTE =
    "PS Plus Extra is the PS4 and PS5 catalogue. Older PlayStation games only come back as streamed or emulated classics in PS Plus Premium, which this site doesn't track yet.";

const ShareIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="M7 8l5-5 5 5" />
        <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
);

/**
 * A range drawn to scale: year ticks and the marker are placed from the same
 * month labels printed at its ends.
 */
// The current month as a month count, with the day as a fraction, so the
// window's stretches (measured from today) land where today is on the bar.
function nowIndex() {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth() + (d.getDate() - 1) / 30;
}

// "About 1 in 5" reads better than "About 19%" for a long-run chance.
function everText(c) {
    if (c === null || c === undefined) return null;
    return c >= 0.1 ? `About 1 in ${Math.round(1 / c)}` : chanceText(c);
}

const pct1 = (c) => `${(c * 100).toFixed(1)}%`;

// The age group the by-age figure is read at, in words. Epic and Humble only
// offer PC games, so their figures are measured on PC games.
function ageGroup(age, serviceKey) {
    const who = serviceKey === "epic" || serviceKey === "humble" ? "PC games" : "Games";
    if (age === null || age === undefined) return who;
    const a = Math.floor(age);
    return a < 1 ? `${who} released in the last year` : `${who} ${a} to ${a + 1} years old`;
}

// The publisher as the site shows it: the first of RAWG's list.
function publisherName(game) {
    const name = String(game?.publisher || "").split(",")[0].trim();
    return name && name !== "Unknown" ? name : null;
}

/** Year ticks for a range, at 0-100% along it; shared with the share card. */
function bandTicks(lowText, highText) {
    const lo = monthIndex(lowText);
    const hi = monthIndex(highText);
    const ticks = [];
    if (lo !== null && hi !== null && hi > lo) {
        const firstYear = Math.floor(lo / 12) + 1;
        const lastYear = Math.floor(hi / 12);
        const step = lastYear - firstYear > 6 ? 2 : 1;
        for (let y = firstYear; y <= lastYear; y += step) {
            ticks.push({ year: y, at: ((y * 12 - lo) / (hi - lo)) * 100 });
        }
    }
    return ticks;
}

function Band({ lowLabel, highLabel, lowText, highText, pos, markerLabel, fade, buckets }) {
    const ticks = bandTicks(lowText, highText);
    const lo = monthIndex(lowText);
    const hi = monthIndex(highText);
    const now = nowIndex();
    const bars = [];
    if (Array.isArray(buckets) && lo !== null && hi !== null && hi > lo) {
        const top = Math.max(...buckets.map((b) => b.chance), 1e-9);
        for (const b of buckets) {
            const a = Math.max(lo, now + b.from_years * 12);
            const z = Math.min(hi + 1, now + b.to_years * 12);
            if (z <= a) continue;
            bars.push({
                key: b.label,
                label: b.label,
                left: ((a - lo) / (hi + 1 - lo)) * 100,
                width: ((z - a) / (hi + 1 - lo)) * 100,
                height: (b.chance / top) * 100,
                text: b.chance < 0.001 ? "<0.1%" : `${(b.chance * 100).toFixed(1)}%`,
            });
        }
    }
    const at = pos === null || pos === undefined ? null : clamp01(pos) * 100;
    // Keep the flag inside the panel near either end.
    const lean = at === null ? 0 : at < 15 ? -10 : at > 85 ? -90 : -50;

    return (
        <div className="cx-rangebar">
            <div className="cx-rb-ends">
                <div className="cx-rb-end">
                    <span>{lowLabel}</span>
                    <strong>{lowText}</strong>
                </div>
                <div className="cx-rb-end">
                    <span>{highLabel}</span>
                    <strong>{highText}</strong>
                </div>
            </div>
            <div className="cx-rb-track-wrap">
                {at !== null && markerLabel && (
                    <span className="cx-rb-flag" style={{ left: `${at}%`, transform: `translateX(${lean}%)` }}>
                        {markerLabel}
                    </span>
                )}
                <div className={`cx-rb-track${fade ? " cx-fade" : ""}`}>
                    {at !== null && <span className="cx-rb-marker" style={{ left: `${at}%` }} />}
                </div>
            </div>
            {bars.length > 0 && (
                <div className="cx-buckets" role="img" aria-label={`Chance it joins in each stretch: ${bars.map((b) => `${b.label} ${b.text}`).join(", ")}`}>
                    {bars.map((b) => (
                        <span key={b.key} className="cx-bk" style={{ left: `${b.left}%`, width: `${b.width}%` }} title={`${b.label}: ${b.text}`}>
                            <em>{b.text}</em>
                            <i style={{ height: `${Math.max(4, b.height * 0.56)}px` }} />
                        </span>
                    ))}
                </div>
            )}
            {ticks.length > 0 && (
                <div className="cx-rb-ticks" aria-hidden="true">
                    {ticks.map((t) => (
                        <span key={t.year} style={{ left: `${t.at}%` }}>{t.year}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

function Segments({ on }) {
    return (
        <div className="cx-segs" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={i < on ? "cx-on" : undefined} />
            ))}
        </div>
    );
}

export default function PredictionResults({
    prediction: p,
    platformConfig,
    selectedModel,
    game,
}) {
    const [showDetails, setShowDetails] = useState(false);
    const [sharing, setSharing] = useState(false);
    const closeShare = useCallback(() => setSharing(false), []);
    const openShare = useCallback(() => setSharing(true), []);
    const status = useDataStatus();
    const asOf = formatDay(p.data_as_of || status?.collected_on);
    const nextBy = formatMonth(p.next_update_by || status?.next_update_by);
    const cadence = status?.cadence_label || "quarterly";

    const serviceName = platformConfig?.[selectedModel]?.name || "this service";
    const grain = p.grain || "no-interval";
    const head = useMemo(() => headline(p, serviceName, selectedModel), [p, serviceName, selectedModel]);
    // An answer can carry its own record (Sony's measured window does);
    // otherwise the service's model record applies.
    const ownRecord = p.track_record && p.track_record.n ? p.track_record : null;
    const record = ownRecord || TRACK_RECORD[selectedModel];

    const hasRange = p.projected_arrival_low && p.projected_arrival_high;
    const hasWindow = p.window_start && p.window_end;
    const chance = p.chance_next_year;
    const ranged = RANGED.has(grain) && hasRange;

    // Best guess inside its range: from the printed months when they parse,
    // otherwise from the model's month counts.
    const bestPos = useMemo(() => {
        const lo = monthIndex(p.projected_arrival_low);
        const hi = monthIndex(p.projected_arrival_high);
        const mid = monthIndex(p.projected_arrival);
        if (lo !== null && hi !== null && mid !== null && hi > lo) return (mid - lo) / (hi - lo);
        const a = p.predicted_months_low;
        const b = p.predicted_months_high;
        const m = p.predicted_months;
        return a !== undefined && b !== undefined && m !== undefined && b > a ? (m - a) / (b - a) : 0.5;
    }, [p]);

    const returnOdds = (grain === "may-return" || grain === "unlikely") && hasReturnOdds(p);

    // Past the best guess: is the usual window still open, and how do this
    // game's odds compare with everything else still waiting?
    const overdue = grain === "fading" || grain === "unlikely-soon";
    const insideWindow = overdue && hasWindow && windowStillOpen(p);
    // Every forecast with the two-view figures (D-041) also says how likely the
    // game is to join at all, not just when.
    const twoViews = p.odds_method === "two_views" && chance !== undefined && chance !== null;
    const datedOdds = twoViews && (RANGED.has(grain) || grain === "suppressed");
    const views = twoViews ? p.chance_views : null;
    const oddsRank = useOddsRank();
    const cmp = useMemo(
        () => (insideWindow || datedOdds ? compareOdds(oddsRank, selectedModel, chance) : null),
        [insideWindow, datedOdds, oddsRank, selectedModel, chance],
    );
    const waitingFor = RETURN_WORDS[selectedModel]?.short || serviceName;
    const byEnd = p.chance_by_window_end;
    const endSoon = byEnd !== undefined && byEnd !== null && (p.window_years_left ?? 0) < 1;

    // What the share image says. Mirrors the card so a shared picture never
    // claims more than the page did.
    const share = useMemo(() => {
        const dated = RANGED.has(grain);
        const answer = head ? head.value : p.category;
        const kicker = head ? head.kicker : "Prediction";
        let detail = null;
        if (dated && hasRange) detail = `${p.projected_arrival_low} to ${p.projected_arrival_high}`;
        else if (grain === "suppressed") detail = "The honest range spans more than eight years";
        // The kicker above it already says "Inside its usual window".
        else if (grain === "window" && hasWindow) detail = `${p.window_start} to ${p.window_end}`;
        // Inside the window the card leads with how the odds compare, so the
        // picture does too; the yearly figure is in the basis line under it.
        // The image line is narrow beside the art: no "about", and capped at
        // 9 in 10, which stays true for anything that beats more.
        else if (insideWindow && cmp && cmp.beats >= 0.5)
            detail = `Better odds than ${Math.min(9, Math.round(cmp.beats * 10))} in 10 waiting games`;
        else if (overdue && chance != null)
            detail = `${chanceText(chance)} chance in the next 12 months`;
        else if ((grain === "may-return" || grain === "unlikely") && chance != null)
            detail = `${chanceText(chance)} chance in the next 12 months`;
        else if (grain === "available") detail = p.leaving_on ? `Leaving ${p.leaving_on}` : null;

        // The same picture the page draws next to the answer.
        const ticks01 = (lo, hi) => bandTicks(lo, hi).map((t) => ({ year: t.year, at: t.at / 100 }));
        let visual = null;
        if (dated && hasRange) {
            visual = { type: "band", ticks: ticks01(p.projected_arrival_low, p.projected_arrival_high), pos: bestPos, marker: `Best guess: ${p.projected_arrival}`, fade: grain === "floor" };
        } else if ((grain === "window" || insideWindow) && hasWindow) {
            visual = { type: "band", ticks: ticks01(p.window_start, p.window_end), pos: p.window_progress ?? null, marker: "Today" };
        } else if (returnOdds) {
            visual = {
                type: "bars",
                values: p.chance_by_year.slice(0, 8).map((v) => v * 100),
                rate: p.return_rate * 100,
                label: `${RETURN_WORDS[selectedModel]?.short || serviceName} overall`,
                title: "Chance it has returned by then",
            };
        }

        const phrase = dated ? `${kicker.toLowerCase()} ${answer}` : answer;
        const slug = String(p.game_name || "game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        // This prediction's own page; the site root for games typed in by hand.
        const link = predictionUrl(selectedModel, game?.slug);
        return {
            link,
            card: {
                game: p.game_name,
                service: serviceName,
                kicker,
                answer,
                detail,
                basis: p.basis,
                visual,
                asOf,
                image: game?.background_image,
                url: link,
                serviceKey: selectedModel,
            },
            caption: `${p.game_name} on ${serviceName}: ${phrase}. See it at ${link}`,
            fileName: `${slug || "prediction"}-${selectedModel || "service"}.png`,
        };
    }, [p, grain, head, hasRange, hasWindow, chance, serviceName, asOf, game, selectedModel, bestPos, returnOdds, overdue, insideWindow, cmp]);

    const answer = head ? head.value : p.category;
    const isMonth = monthIndex(answer) !== null;
    const returnVerb = RETURN_WORDS[selectedModel]?.verb;
    const secondPanel = ranged || ((grain === "window" || insideWindow) && hasWindow) || returnOdds;
    const hasPrecedents = Array.isArray(p.precedents) && p.precedents.length > 0;
    const showRecord = record && DATED.has(grain);

    return (
        <section className="cx-tile cx-pred-card" aria-labelledby="pred-title">
            <div className="cx-pred-head">
                <div className="cx-pred-title-block">
                    <h2 id="pred-title">Prediction Results</h2>
                    <p>
                        {p.game_name} on {serviceName}
                    </p>
                </div>
                <button type="button" className="cx-share-icon" onClick={openShare} aria-label="Share this prediction" title="Share this prediction">
                    <ShareIcon />
                </button>
            </div>

            {/* A new key per answer, so its panels reveal again for each one. */}
            <div className="cx-grid" key={`${p.game_name}|${selectedModel}|${p.grain}|${p.projected_arrival}|${chance}`}>
                {/* The answer, with the share button on it */}
                <div className={`cx-panel cx-month ${secondPanel ? "cx-span-6" : "cx-span-12"}`}>
                    <span className="cx-kicker">{head ? head.kicker : "Prediction"}</span>
                    <p className={`cx-answer${isMonth ? "" : " cx-answer-words"}`}>{answer}</p>
                    {ranged && (
                        <p className="cx-answer-sub cx-num">
                            {p.projected_arrival_low} to {p.projected_arrival_high}
                        </p>
                    )}
                    {grain === "suppressed" && (
                        <p className="cx-answer-note">The honest range spans more than eight years, so treat this date loosely.</p>
                    )}
                    {datedOdds && (
                        <>
                            <p className="cx-q">Will it join at all?</p>
                            <div className={`cx-quiet-figs cx-three${byEnd === undefined || byEnd === null ? " cx-two" : ""}`}>
                                <div><b><CountUp value={chance} format={chanceText} /></b><span>in the next 12 months</span></div>
                                {byEnd !== undefined && byEnd !== null && (
                                    <div><b><CountUp value={byEnd} format={chanceText} /></b><span>by {p.window_end}, when its window closes</span></div>
                                )}
                                {p.chance_ever !== undefined && p.chance_ever !== null && (
                                    <div><b><CountUp value={p.chance_ever} format={everText} /></b><span>that it ever joins</span></div>
                                )}
                            </div>
                            {cmp && cmp.beats >= 0.5 && (
                                <p className="cx-odds-context">Better odds than {inTen(cmp.beats)} games still waiting for {waitingFor}.</p>
                            )}
                        </>
                    )}
                    {overdue && !insideWindow && chance !== undefined && chance !== null && (
                        <p className="cx-chance">
                            <CountUp value={chance} format={chanceText} />
                            <small>chance it arrives in the next 12 months</small>
                        </p>
                    )}
                    {insideWindow && chance !== undefined && chance !== null && (
                        <>
                            {cmp && cmp.beats >= 0.5 && (
                                <p className="cx-odds-rel">
                                    Better odds than {inTen(cmp.beats)} games still waiting for {waitingFor}.
                                </p>
                            )}
                            <div className={`cx-quiet-figs${endSoon || byEnd === undefined || byEnd === null ? " cx-one" : ""}`}>
                                {/* Under a year left, "before it closes" shrinks toward zero as the
                                    window ends (a few weeks left reads "Under 1%" for a 7%-a-year
                                    game), so the yearly chance stays the figure and the close date
                                    is said beside it. */}
                                {endSoon ? (
                                    <div><b><CountUp value={chance} format={chanceText} /></b><span>in the next 12 months · its window closes in {p.window_end}</span></div>
                                ) : (
                                    <>
                                        <div><b><CountUp value={chance} format={chanceText} /></b><span>in the next 12 months</span></div>
                                        {byEnd !== undefined && byEnd !== null && (
                                            <div><b><CountUp value={byEnd} format={chanceText} /></b><span>by {p.window_end}, when its window closes</span></div>
                                        )}
                                    </>
                                )}
                            </div>
                            {cmp && (
                                <p className="cx-odds-context">
                                    {cmp.under1 >= 0.5
                                        ? `Most games waiting for ${waitingFor} are under 1% a year.`
                                        : `The typical game waiting for ${waitingFor} has ${chanceText(cmp.median).toLowerCase()} a year.`}
                                </p>
                            )}
                        </>
                    )}
                    {(grain === "may-return" || grain === "unlikely") && chance !== undefined && chance !== null && (
                        <p className="cx-chance">
                            <CountUp value={chance} format={chanceText} />
                            <small>{returnVerb ? `chance it's ${returnVerb} in the next 12 months` : "chance it returns in the next 12 months"}</small>
                        </p>
                    )}
                    {grain === "ineligible" && p.ineligible_reason === "classic" && (
                        <p className="cx-answer-note">{CLASSIC_NOTE}</p>
                    )}
                    {grain === "ineligible" && p.ineligible_reason !== "classic" && INELIGIBLE_NOTE[selectedModel] && (
                        <p className="cx-answer-note">{INELIGIBLE_NOTE[selectedModel]}</p>
                    )}
                    {overdue && hasWindow && !insideWindow && (
                        <p className="cx-answer-note">Its usual window ran {p.window_start} to {p.window_end}.</p>
                    )}
                    <button type="button" className="cx-btn cx-share-big" onClick={openShare}>
                        <ShareIcon />
                        Share this prediction
                    </button>
                </div>

                {ranged && (
                    <div className="cx-panel cx-span-6">
                        <h3>Likely window</h3>
                        <Band
                            lowLabel="As early as"
                            highLabel="As late as"
                            lowText={p.projected_arrival_low}
                            highText={p.projected_arrival_high}
                            pos={bestPos}
                            markerLabel={`Best guess: ${p.projected_arrival}`}
                            fade={grain === "floor"}
                            buckets={twoViews ? p.chance_buckets : null}
                        />
                        {twoViews && Array.isArray(p.chance_buckets) && p.chance_buckets.length > 0 && (
                            <p className="cx-caption">
                                The line: when, if it joins. The bars: the chance it joins in each stretch
                                {byEnd !== undefined && byEnd !== null ? `, adding up to ${chanceText(byEnd).toLowerCase()} by ${p.window_end}` : ""}.
                            </p>
                        )}
                    </div>
                )}

                {(grain === "window" || insideWindow) && hasWindow && (
                    <div className="cx-panel cx-span-6">
                        <h3>Its usual window</h3>
                        <Band
                            lowLabel="Window opened"
                            highLabel="Window closes"
                            lowText={p.window_start}
                            highText={p.window_end}
                            pos={p.window_progress ?? null}
                            markerLabel="Today"
                            buckets={twoViews ? p.chance_buckets : null}
                        />
                        {insideWindow && p.projected_arrival && (
                            <p className="cx-caption">Best guess was {p.projected_arrival}.</p>
                        )}
                    </div>
                )}

                {/* A game that has been here before: its chance of coming back, year by year */}
                {returnOdds && (
                    <div className="cx-panel cx-span-6">
                        <h3>Chance it has returned by then</h3>
                        <ReturnChart p={p} serviceKey={selectedModel} />
                    </div>
                )}
                {returnOdds && (
                    <div className="cx-panel cx-span-12">
                        <ReturnTiles p={p} serviceKey={selectedModel} />
                    </div>
                )}

                {/* How the yearly figure was reached: two views, averaged (D-041) */}
                {views && (datedOdds || overdue || grain === "window") && (
                    <div className="cx-panel cx-span-12">
                        <h3>How we got {chanceText(chance).toLowerCase()}</h3>
                        <div className="cx-views">
                            <div className="cx-view">
                                <h4>By its age</h4>
                                <div className="cx-vline"><span>{ageGroup(p.game_age_years, selectedModel)}</span><b>{pct1(views.age_base)}</b></div>
                                <div className="cx-vline">
                                    <span>
                                        {views.band_neutral
                                            ? "No Metacritic score yet, so not counted"
                                            : p.metacritic_source === "none" ? "No Metacritic score" : `Metacritic ${Math.round(p.metacritic_score_used)}`}
                                    </span>
                                    <b>&times;{views.band_factor_age.toFixed(2)}</b>
                                </div>
                                <div className="cx-vline">
                                    <span>{publisherName(game) ? `${publisherName(game)}'s record on ${serviceName}` : `The publisher's record on ${serviceName}`}</span>
                                    <b>&times;{views.pub_factor_age.toFixed(2)}</b>
                                </div>
                                <div className="cx-vres"><span>Next 12 months</span><b>{pct1(views.by_age)}</b></div>
                            </div>
                            {views.by_window !== null && views.by_window !== undefined && (
                                <div className="cx-view">
                                    <h4>By its own window</h4>
                                    <div className="cx-vline"><span>Games like it that end up on {serviceName}</span><b>{Math.round(views.ever_like_it * 100)}%</b></div>
                                    {hasWindow && (
                                        <div className="cx-vline"><span>Spread across its window, {p.window_start} to {p.window_end}</span><b /></div>
                                    )}
                                    <div className="cx-vres"><span>Next 12 months</span><b>{pct1(views.by_window)}</b></div>
                                </div>
                            )}
                        </div>
                        <div className="cx-avg">
                            <p>{views.by_window !== null && views.by_window !== undefined ? "The average of the two" : "The chance"}</p>
                            <b>{pct1(chance)}</b>
                            <small>Shown as "{chanceText(chance)}". "Like it" means its age, whether it can come to this service, its Metacritic score and its publisher's record here.</small>
                        </div>
                    </div>
                )}

                {/* What the answer rests on */}
                {p.basis && (
                    <div className="cx-panel cx-row cx-span-12">
                        <span className="cx-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="4" y="5" width="16" height="4" rx="1.5" />
                                <rect x="4" y="11" width="16" height="4" rx="1.5" />
                                <path d="M6 19h12" />
                            </svg>
                        </span>
                        <p>{p.basis}</p>
                    </div>
                )}

                {/* The publisher's own come-back record, beside the service-wide odds */}
                {p.publisher_returns?.text && (
                    <div className="cx-panel cx-row cx-span-12">
                        <span className="cx-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12a8 8 0 1 0 2.4-5.7" />
                                <path d="M4 4v4h4" />
                                <path d="M12 8v4l3 2" />
                            </svg>
                        </span>
                        <p>{p.publisher_returns.text}</p>
                    </div>
                )}

                {/* The publisher's own past arrivals, so the estimate can be checked */}
                {hasPrecedents && (
                    <div className={`cx-panel ${showRecord ? "cx-span-6" : "cx-span-12"}`}>
                        <h3>{p.sony_window ? "Sony" : "This publisher"} on {serviceName} before</h3>
                        <ul className="cx-prec-list">
                            {p.precedents.map((x) => (
                                <li key={x.game} className="cx-prec">
                                    <span className="cx-prec-wait">
                                        <b>{x.months}</b>
                                        <i>{x.months === 1 ? "month" : "months"}</i>
                                    </span>
                                    <span className="cx-prec-name">{x.game}</span>
                                    <span className="cx-prec-meta">
                                        {x.months} {x.months === 1 ? "month" : "months"} after release, joined {x.joined}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Track record at three horizons, and what it is measured on */}
                {showRecord && (
                    <div className={`cx-panel ${hasPrecedents ? "cx-span-6" : "cx-span-12"}`}>
                        <h3>How often our best guess lands close {ownRecord ? "for Sony games" : `on ${serviceName}`}</h3>
                        <div className="cx-track">
                            {[
                                ["within 1 year", record.y1],
                                ["within 2 years", record.y2],
                                ["within 3 years", record.y3],
                            ].map(([label, v]) => (
                                <div key={label} className="cx-trk">
                                    <span className="cx-trk-big">
                                        {v} <small>in 10</small>
                                    </span>
                                    <span className="cx-trk-when">{label}</span>
                                    <Segments on={v} />
                                </div>
                            ))}
                        </div>
                        <p className="cx-caption">
                            {ownRecord
                                ? `Based on ${record.n} ${record.subject}.`
                                : `Based on ${record.n} ${serviceName} games that arrived after a test version of the model was built, January to August 2026.`}
                        </p>
                    </div>
                )}

                {/* How fresh this is */}
                {asOf && (
                    <div className="cx-panel cx-row cx-span-7">
                        <span className="cx-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                            </svg>
                        </span>
                        <p>
                            Data as of {asOf} <span>&middot;</span> updated {cadence}
                            {nextBy && (
                                <>
                                    {" "}<span>&middot;</span> next update by {nextBy}
                                </>
                            )}
                        </p>
                    </div>
                )}

                <div className={`cx-panel cx-actions ${asOf ? "cx-span-5" : "cx-span-12"}`}>
                    <button
                        type="button"
                        className="cx-btn cx-btn-quiet"
                        onClick={() => setShowDetails(!showDetails)}
                        aria-expanded={showDetails}
                        aria-controls="tech-details"
                    >
                        {showDetails ? "Hide" : "Show"} technical details
                    </button>
                </div>

                <div className={`cx-collapse cx-span-12${showDetails ? " is-open" : ""}`} inert={!showDetails} aria-hidden={!showDetails}>
                    <div className="cx-collapse-inner">
                    <div className="cx-panel" id="tech-details">
                        <h3>Technical details</h3>
                        {p.reasoning && <p className="cx-reasoning">{p.reasoning}</p>}
                        <dl className="cx-details">
                            {SOURCE_LABEL[p.source] && (
                                <div>
                                    <dt>Answered from</dt>
                                    <dd>
                                        {SOURCE_LABEL[p.source]}
                                        {p.precompute_check && p.source !== "precomputed" && (
                                            <small className="cx-caption" style={{ display: "block", marginTop: 4 }}>
                                                Not stored: {p.precompute_check}
                                            </small>
                                        )}
                                    </dd>
                                </div>
                            )}
                            {p.tier && (
                                <div><dt>Prediction method</dt><dd>{p.tier}</dd></div>
                            )}
                            {p.projected_arrival && (
                                <div>
                                    <dt>Projected arrival</dt>
                                    <dd>
                                        {p.projected_arrival}
                                        {hasRange && ` (${p.projected_arrival_low} to ${p.projected_arrival_high})`}
                                    </dd>
                                </div>
                            )}
                            {hasWindow && (
                                <div><dt>Usual window</dt><dd>{p.window_start} to {p.window_end}</dd></div>
                            )}
                            {p.game_age_years !== undefined && p.game_age_years !== null && (
                                <div><dt>Game age</dt><dd>{p.game_age_years} years</dd></div>
                            )}
                            {chance !== undefined && chance !== null && (
                                <div>
                                    <dt>Chance within 12 months</dt>
                                    <dd>
                                        {twoViews && views
                                            ? `${pct1(chance)}: by age ${pct1(views.by_age)}${views.by_window !== null && views.by_window !== undefined ? `, by its own window ${pct1(views.by_window)}, averaged` : ""}`
                                            : `${(chance * 100).toFixed(1)}% (games this age on this service)`}
                                    </dd>
                                </div>
                            )}
                            {twoViews && p.chance_ever !== undefined && p.chance_ever !== null && (
                                <div>
                                    <dt>Chance it ever joins</dt>
                                    <dd>{pct1(p.chance_ever)} from today{views ? `; ${Math.round(views.ever_like_it * 100)}% for games like it from release` : ""}</dd>
                                </div>
                            )}
                            {twoViews && views && (
                                <div>
                                    <dt>Factors used</dt>
                                    <dd>Metacritic band {views.band} &times;{views.band_factor_age.toFixed(2)}; publisher &times;{views.pub_factor_age.toFixed(2)} (by age), &times;{views.pub_factor_window.toFixed(2)} (by window)</dd>
                                </div>
                            )}
                            {p.predicted_total_days !== undefined && (
                                <div><dt>Model total wait</dt><dd>{Math.round(p.predicted_total_days)} days from release</dd></div>
                            )}
                            {p.publisher_avg_wait_days !== undefined && (
                                <div><dt>Publisher average wait</dt><dd>{Math.round(p.publisher_avg_wait_days)} days</dd></div>
                            )}
                            {p.publisher_game_count !== undefined && p.publisher_game_count !== null && (
                                <div><dt>Publisher history</dt><dd>{p.publisher_game_count} games on service</dd></div>
                            )}
                            {p.last_appearance_date && (
                                <div><dt>Last appearance</dt><dd>{p.last_appearance_date}</dd></div>
                            )}
                            {p.games_on_service !== undefined && (
                                <div><dt>Return rate on this service</dt><dd>{p.games_returned} of {p.games_on_service} games have ever come back</dd></div>
                            )}
                            {p.metacritic_score_used !== undefined && (
                                <div>
                                    <dt>Metacritic used</dt>
                                    <dd>
                                        {p.metacritic_source === "records"
                                            ? `${p.metacritic_score_used} (from our records; RAWG has none published)`
                                            : game?.metacritic
                                                ? p.metacritic_score_used
                                                : `${p.metacritic_score_used} (typical score; this game has none published)`}
                                    </dd>
                                </div>
                            )}
                        </dl>
                        <p className="cx-caption">
                            Why ranges instead of one date: these are multi-year waits, so a single month would
                            be false precision. The range is an 80% interval: the real date should fall inside it
                            about four times in five. When it is wide, the model is telling you it does not know.
                        </p>
                    </div>
                    </div>
                </div>

                {p.recently_appeared && grain !== "available" && selectedModel !== "epic" && (
                    <div className="cx-panel cx-span-12">
                        <p className="cx-note">This game was on {serviceName} recently and may still be available.</p>
                    </div>
                )}
            </div>

            {sharing && (
                <ShareDialog
                    card={share.card}
                    caption={share.caption}
                    link={share.link}
                    fileName={share.fileName}
                    onClose={closeShare}
                />
            )}
        </section>
    );
}
