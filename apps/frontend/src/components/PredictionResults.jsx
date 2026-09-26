import React, { useCallback, useMemo, useState } from "react";
import ShareDialog from "./ShareDialog";
import { predictionUrl } from "../utils/predictionLink";
import { useDataStatus, formatDay, formatMonth } from "../utils/dataStatus";

// How often the single best-guess date lands within 1, 2 and 3 years of the
// real one, per service. Measured on games that arrived after a test version of
// the model was built (Jan-Aug 2026), so none of them were seen in training.
// Source: pipeline/scorecard.py. Regenerate after a retrain.
const TRACK_RECORD = {
    gamepass: { n: 73, y1: 4, y2: 6, y3: 8 },
    psplus: { n: 86, y1: 4, y2: 7, y3: 8 },
    epic: { n: 49, y1: 3, y2: 6, y3: 8 },
    humble: { n: 56, y1: 6, y2: 7, y3: 9 },
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

/** The headline, worded to match how firmly the evidence supports it. */
function headline(p, serviceName) {
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
        case "fading":
            return { kicker: "Past its usual window", value: "Possible, but fading" };
        case "unlikely-soon":
            return { kicker: "Long past its usual window", value: "Unlikely soon" };
        case "unlikely":
            return { kicker: "Already appeared", value: "Unlikely to return" };
        case "available":
            return p.leaving_on
                ? { kicker: `Leaving ${p.leaving_on}`, value: `On ${serviceName}` }
                : { kicker: "As of our last update", value: `On ${serviceName}` };
        case "announced":
            return { kicker: "Officially announced", value: `Joining ${p.arriving_on}` };
        case "ineligible":
            return { kicker: "Can't come to this service", value: sentenceCase(p.category) };
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
function Band({ lowLabel, highLabel, lowText, highText, pos, markerLabel, fade }) {
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
    const head = useMemo(() => headline(p, serviceName), [p, serviceName]);
    const record = TRACK_RECORD[selectedModel];

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

    // What the share image says. Mirrors the card so a shared picture never
    // claims more than the page did.
    const share = useMemo(() => {
        const dated = RANGED.has(grain);
        const answer = head ? head.value : p.category;
        const kicker = head ? head.kicker : "Prediction";
        let detail = null;
        if (dated && hasRange) detail = `${p.projected_arrival_low} to ${p.projected_arrival_high}`;
        else if (grain === "suppressed") detail = "The honest range spans more than eight years";
        else if (grain === "window" && hasWindow) detail = `Usual window: ${p.window_start} to ${p.window_end}`;
        else if ((grain === "fading" || grain === "unlikely-soon") && chance != null)
            detail = `About ${Math.max(1, Math.round(chance * 100))}% chance in the next 12 months`;
        else if (grain === "available") detail = p.leaving_on ? `Leaving ${p.leaving_on}` : null;

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
                asOf,
                image: game?.background_image,
                url: link,
                serviceKey: selectedModel,
            },
            caption: `${p.game_name} on ${serviceName}: ${phrase}. See it at ${link}`,
            fileName: `${slug || "prediction"}-${selectedModel || "service"}.png`,
        };
    }, [p, grain, head, hasRange, hasWindow, chance, serviceName, asOf, game, selectedModel]);

    const answer = head ? head.value : p.category;
    const isMonth = monthIndex(answer) !== null;
    const secondPanel = ranged || (grain === "window" && hasWindow);
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

            <div className="cx-grid">
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
                    {(grain === "fading" || grain === "unlikely-soon") && chance !== undefined && chance !== null && (
                        <p className="cx-chance">
                            About {Math.max(1, Math.round(chance * 100))}%
                            <small>chance it arrives in the next 12 months</small>
                        </p>
                    )}
                    {grain === "ineligible" && INELIGIBLE_NOTE[selectedModel] && (
                        <p className="cx-answer-note">{INELIGIBLE_NOTE[selectedModel]}</p>
                    )}
                    {(grain === "fading" || grain === "unlikely-soon") && hasWindow && (
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
                        />
                    </div>
                )}

                {grain === "window" && hasWindow && (
                    <div className="cx-panel cx-span-6">
                        <h3>Its usual window</h3>
                        <Band
                            lowLabel="Window opened"
                            highLabel="Window closes"
                            lowText={p.window_start}
                            highText={p.window_end}
                            pos={p.window_progress ?? null}
                            markerLabel="Today"
                        />
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

                {/* The publisher's own past arrivals, so the estimate can be checked */}
                {hasPrecedents && (
                    <div className={`cx-panel ${showRecord ? "cx-span-6" : "cx-span-12"}`}>
                        <h3>This publisher on {serviceName} before</h3>
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
                        <h3>How often our best guess lands close on {serviceName}</h3>
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
                            Based on {record.n} {serviceName} games that arrived after a test version of the
                            model was built, January to August 2026.
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

                {showDetails && (
                    <div className="cx-panel cx-span-12" id="tech-details">
                        <h3>Technical details</h3>
                        {p.reasoning && <p className="cx-reasoning">{p.reasoning}</p>}
                        <dl className="cx-details">
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
                                <div><dt>Chance within 12 months</dt><dd>{(chance * 100).toFixed(1)}% (games this age on this service)</dd></div>
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
                                        {game?.metacritic
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
                )}

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
