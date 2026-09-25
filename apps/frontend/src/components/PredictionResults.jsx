import React, { useState } from "react";
import { useDataStatus, formatDay, formatMonth } from "../utils/dataStatus";

// How often the single best-guess date lands within 1, 2 and 3 years of the
// real one, per service. Measured on games that arrived after a test version of
// the model was built (Jan-Aug 2026), so none of them were seen in training.
// Source: pipeline/scorecard.py. Regenerate after a retrain.
const TRACK_RECORD = {
    gamepass: { n: 74, y1: 4, y2: 6, y3: 7 },
    psplus: { n: 86, y1: 5, y2: 7, y3: 9 },
    epic: { n: 49, y1: 5, y2: 7, y3: 8 },
    humble: { n: 56, y1: 6, y2: 7, y3: 9 },
};

// Answers that rest on a forecast date, and so earn a track record.
const DATED = new Set(["month", "year", "floor", "suppressed", "window", "repeat"]);

const BADGE = {
    rule: "from-green-600 to-emerald-600",
    ineligible: "from-gray-600 to-gray-700",
    "no-interval": "from-gray-600 to-gray-700",
};

function clamp01(x) {
    return Math.min(1, Math.max(0, x));
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
        default:
            return null; // rule / ineligible / no-interval keep the category badge
    }
}

function Band({ lowLabel, highLabel, lowText, highText, pos, markerLabel, fade }) {
    return (
        <div className="mb-6 px-2 md:px-6">
            <div
                className={`relative h-3 rounded-full border border-purple-500/40 ${fade
                        ? "bg-gradient-to-r from-purple-500/60 to-purple-500/5"
                        : "bg-gradient-to-r from-purple-500/20 via-purple-500/50 to-purple-500/20"
                    }`}
            >
                {pos !== null && pos !== undefined && (
                    <>
                        {markerLabel && (
                            <span
                                className="absolute -top-6 -translate-x-1/2 text-[11px] font-bold text-white whitespace-nowrap"
                                style={{ left: `${pos * 100}%` }}
                            >
                                {markerLabel}
                            </span>
                        )}
                        <div
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-[3px] border-pink-600 shadow-lg"
                            style={{ left: `${pos * 100}%` }}
                        />
                    </>
                )}
            </div>
            <div className="flex justify-between mt-2 text-xs md:text-sm text-gray-400">
                <span>
                    {lowLabel}
                    <span className="block text-gray-200 font-medium">{lowText}</span>
                </span>
                <span className="text-right">
                    {highLabel}
                    <span className="block text-gray-200 font-medium">{highText}</span>
                </span>
            </div>
        </div>
    );
}

export default function PredictionResults({
    prediction: p,
    platformConfig,
    selectedModel,
}) {
    const [showDetails, setShowDetails] = useState(false);
    const status = useDataStatus();
    const asOf = formatDay(p.data_as_of || status?.collected_on);
    const nextBy = formatMonth(p.next_update_by || status?.next_update_by);
    const cadence = status?.cadence_label || "quarterly";

    const serviceName = platformConfig?.[selectedModel]?.name || "this service";
    const grain = p.grain || "no-interval";
    const head = headline(p, serviceName);
    const record = TRACK_RECORD[selectedModel];

    // Where the best guess sits inside its range, for the marker.
    const lo = p.predicted_months_low;
    const hi = p.predicted_months_high;
    const mid = p.predicted_months;
    const midPos =
        lo !== undefined && hi !== undefined && mid !== undefined && hi > lo
            ? clamp01((mid - lo) / (hi - lo))
            : 0.5;

    const hasRange = p.projected_arrival_low && p.projected_arrival_high;
    const hasWindow = p.window_start && p.window_end;
    const chance = p.chance_next_year;

    return (
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-4 md:p-8 border border-purple-500/30 shadow-2xl animate-fadeIn">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 text-center">
                Prediction Results
            </h2>

            {head ? (
                <div className="text-center mb-6">
                    <p className="text-xs md:text-sm uppercase tracking-widest text-purple-300 mb-2">
                        {head.kicker}
                    </p>
                    <p className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
                        {head.value}
                    </p>
                    {(grain === "month" || grain === "year" || grain === "floor" || grain === "repeat") &&
                        hasRange && (
                            <p className="mt-2 text-sm md:text-base text-gray-300">
                                {p.projected_arrival_low} to {p.projected_arrival_high}
                            </p>
                        )}
                    {grain === "suppressed" && (
                        <p className="mt-2 text-sm md:text-base text-gray-300">
                            The honest range spans more than eight years, so treat this date loosely.
                        </p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center mb-6">
                    <div
                        className={`bg-gradient-to-r ${BADGE[grain] || BADGE["no-interval"]} text-white px-6 py-3 md:px-8 md:py-4 rounded-full text-lg md:text-xl font-bold uppercase tracking-wide shadow-lg text-center`}
                    >
                        {p.category}
                    </div>
                </div>
            )}

            {/* A dated forecast: draw the range with the best guess marked on it */}
            {(grain === "month" || grain === "year" || grain === "floor" || grain === "repeat") &&
                hasRange && (
                    <Band
                        lowLabel="as early as"
                        highLabel="as late as"
                        lowText={p.projected_arrival_low}
                        highText={p.projected_arrival_high}
                        pos={midPos}
                        fade={grain === "floor"}
                    />
                )}

            {/* Any time now: show the window and where today sits inside it */}
            {grain === "window" && hasWindow && (
                <Band
                    lowLabel="window opened"
                    highLabel="window closes"
                    lowText={p.window_start}
                    highText={p.window_end}
                    pos={p.window_progress ?? null}
                    markerLabel="today"
                />
            )}

            {/* Past the window: the chance of arriving is the real answer */}
            {(grain === "fading" || grain === "unlikely-soon") && (
                <div className="mb-6 text-center">
                    {chance !== undefined && chance !== null && (
                        <p className="text-4xl md:text-5xl font-extrabold text-white">
                            ~{Math.max(1, Math.round(chance * 100))}%
                            <span className="block text-sm md:text-base font-medium text-gray-300 mt-1">
                                chance it arrives in the next 12 months
                            </span>
                        </p>
                    )}
                    {hasWindow && (
                        <p className="mt-3 text-sm text-gray-400">
                            Its usual window ran {p.window_start} to {p.window_end}.
                        </p>
                    )}
                </div>
            )}

            {/* What the answer rests on - the checkable replacement for a confidence % */}
            {p.basis && (
                <div className="flex items-start gap-3 bg-white/5 border-l-[3px] border-purple-500 rounded-r-lg px-4 py-3 mb-5">
                    <span className="text-purple-300 select-none">&#9656;</span>
                    <p className="text-sm md:text-base text-gray-200 leading-relaxed">{p.basis}</p>
                </div>
            )}

            {/* Track record at three horizons, and what it is measured on */}
            {record && DATED.has(grain) && (
                <div className="border-t border-white/10 pt-4 mb-6">
                    <p className="text-center text-xs md:text-sm text-gray-400 mb-3">
                        How often our best guess lands close on {serviceName}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                            ["within 1 year", record.y1],
                            ["within 2 years", record.y2],
                            ["within 3 years", record.y3],
                        ].map(([label, v]) => (
                            <div key={label} className="bg-white/5 rounded-lg py-2">
                                <p className="text-lg md:text-xl font-bold text-white">{v} in 10</p>
                                <p className="text-[11px] md:text-xs text-gray-400">{label}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-[11px] md:text-xs text-gray-500 mt-3">
                        Based on {record.n} {serviceName} games that arrived after a test version of
                        the model was built, January to August 2026.
                    </p>
                </div>
            )}

            {/* How fresh this is. Every answer is only as current as the last data update. */}
            {asOf && (
                <p className="text-center text-[11px] md:text-xs text-gray-500 mb-4">
                    Data as of {asOf} &middot; updated {cadence}
                    {nextBy && <> &middot; next update by {nextBy}</>}
                </p>
            )}

            <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-lg font-semibold transition-all border border-white/10 text-sm md:text-base"
            >
                {showDetails ? "Hide" : "Show"} Technical Details
            </button>

            {showDetails && (
                <div className="mt-6 bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4">Technical Details</h3>
                    <div className="space-y-3 text-gray-300 text-sm">
                        {p.reasoning && (
                            <p className="text-gray-300 whitespace-pre-line pb-3 border-b border-white/10">
                                {p.reasoning}
                            </p>
                        )}
                        {p.tier && (
                            <div>
                                <span className="text-gray-400">Prediction method:</span> {p.tier}
                            </div>
                        )}
                        {p.projected_arrival && (
                            <div className="font-semibold text-green-400">
                                <span className="text-gray-400 font-normal">Projected arrival:</span>{" "}
                                {p.projected_arrival}
                                {hasRange && ` (${p.projected_arrival_low} to ${p.projected_arrival_high})`}
                            </div>
                        )}
                        {hasWindow && (
                            <div>
                                <span className="text-gray-400">Usual window:</span> {p.window_start} to{" "}
                                {p.window_end}
                            </div>
                        )}
                        {p.game_age_years !== undefined && p.game_age_years !== null && (
                            <div>
                                <span className="text-gray-400">Game age:</span> {p.game_age_years} years
                            </div>
                        )}
                        {chance !== undefined && chance !== null && (
                            <div>
                                <span className="text-gray-400">Chance within 12 months:</span>{" "}
                                {(chance * 100).toFixed(1)}% (games this age on this service)
                            </div>
                        )}
                        {p.predicted_total_days !== undefined && (
                            <div>
                                <span className="text-gray-400">Model total wait:</span>{" "}
                                {Math.round(p.predicted_total_days)} days from release
                            </div>
                        )}
                        {p.publisher_avg_wait_days !== undefined && (
                            <div>
                                <span className="text-gray-400">Publisher average wait:</span>{" "}
                                {Math.round(p.publisher_avg_wait_days)} days
                            </div>
                        )}
                        {p.publisher_game_count !== undefined && p.publisher_game_count !== null && (
                            <div>
                                <span className="text-gray-400">Publisher history:</span>{" "}
                                {p.publisher_game_count} games on service
                            </div>
                        )}
                        {p.last_appearance_date && (
                            <div>
                                <span className="text-gray-400">Last appearance:</span>{" "}
                                {p.last_appearance_date}
                            </div>
                        )}
                        {p.games_on_service !== undefined && (
                            <div>
                                <span className="text-gray-400">Return rate on this service:</span>{" "}
                                {p.games_returned} of {p.games_on_service} games have ever come back
                            </div>
                        )}
                        {p.metacritic_score_used !== undefined && (
                            <div>
                                <span className="text-gray-400">Metacritic used:</span>{" "}
                                {p.metacritic_score_used}
                            </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <span className="text-gray-400 block mb-1">
                                Why ranges instead of one date:
                            </span>
                            <p className="text-gray-300 text-sm">
                                These are multi-year waits, so a single month would be false precision. The
                                range is an 80% interval: the real date should fall inside it about four times
                                in five. When it is wide, the model is telling you it does not know.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {p.recently_appeared && grain !== "available" && selectedModel !== "epic" && (
                <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
                    <p className="font-semibold text-yellow-200 text-sm md:text-base">
                        This game was on {serviceName} recently and may still be available.
                    </p>
                </div>
            )}
        </div>
    );
}
