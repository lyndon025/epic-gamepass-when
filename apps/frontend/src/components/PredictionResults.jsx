import React, { useState } from "react";

// How often a prediction lands within a year, measured per service on arrivals
// the model never saw (pipeline/scorecard.py). Shown next to the answer because
// a range is easier to trust when you know the track record behind it.
const WITHIN_A_YEAR = {
    gamepass: "about 4 in 10",
    psplus: "about half",
    epic: "about half",
    humble: "about 6 in 10",
};

const GRAIN_ACCENT = {
    month: "from-green-600 to-emerald-600",
    year: "from-blue-600 to-cyan-600",
    floor: "from-yellow-600 to-amber-600",
    suppressed: "from-gray-600 to-gray-700",
    overdue: "from-purple-700 to-pink-600",
    rule: "from-green-600 to-emerald-600",
    repeat: "from-indigo-600 to-blue-600",
    ineligible: "from-gray-600 to-gray-700",
};

function yearOf(monthYear) {
    if (!monthYear) return null;
    const m = String(monthYear).match(/(\d{4})/);
    return m ? m[1] : null;
}

/** The headline, worded to match how precisely the model can actually answer. */
function headline(p) {
    const grain = p.grain;
    if (grain === "month") return { kicker: "Most likely", value: p.projected_arrival };
    if (grain === "year") return { kicker: "Best estimate", value: `sometime in ${yearOf(p.projected_arrival) || "—"}` };
    if (grain === "floor") return { kicker: "Not before", value: yearOf(p.projected_arrival_low) || yearOf(p.projected_arrival) || "—" };
    if (grain === "repeat") return { kicker: "Likely around", value: p.projected_arrival };
    if (grain === "overdue") return { kicker: null, value: "Could be any time now" };
    if (grain === "suppressed") return { kicker: null, value: "We can't narrow this down" };
    return null; // rule / ineligible / no-interval keep the category badge
}

export default function PredictionResults({
    prediction,
    platformConfig,
    selectedModel,
}) {
    const [showDetails, setShowDetails] = useState(false);

    const grain = prediction.grain || "no-interval";
    const head = headline(prediction);
    const accent = GRAIN_ACCENT[grain] || "from-gray-600 to-gray-700";

    // A drawn band only helps when it is tight enough to read. Past that it is
    // wide enough to be meaningless, and floor answers have no honest top end.
    const showBand =
        (grain === "month" || grain === "year" || grain === "repeat") &&
        prediction.projected_arrival_low &&
        prediction.projected_arrival_high;

    const showOpenBand = grain === "floor";

    return (
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-4 md:p-8 border border-purple-500/30 shadow-2xl animate-fadeIn">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 text-center">
                Prediction Results
            </h2>

            {/* Headline: a date where one is warranted, a plain statement where not */}
            {head ? (
                <div className="text-center mb-6">
                    {head.kicker && (
                        <p className="text-xs md:text-sm uppercase tracking-widest text-purple-300 mb-2">
                            {head.kicker}
                        </p>
                    )}
                    <p className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
                        {head.value}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col items-center mb-6">
                    <div
                        className={`bg-gradient-to-r ${accent} text-white px-6 py-3 md:px-8 md:py-4 rounded-full text-lg md:text-xl font-bold uppercase tracking-wide shadow-lg text-center`}
                    >
                        {prediction.category}
                    </div>
                </div>
            )}

            {/* The range, drawn rather than described, so its width is felt */}
            {showBand && (
                <div className="mb-6 px-2 md:px-6">
                    <div className="relative h-3 rounded-full bg-gradient-to-r from-purple-500/20 via-purple-500/50 to-purple-500/20 border border-purple-500/40">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-[3px] border-pink-600 shadow-lg" />
                    </div>
                    <div className="flex justify-between mt-2 text-xs md:text-sm text-gray-400">
                        <span>
                            as early as
                            <span className="block text-gray-200 font-medium">
                                {prediction.projected_arrival_low}
                            </span>
                        </span>
                        <span className="text-right">
                            as late as
                            <span className="block text-gray-200 font-medium">
                                {prediction.projected_arrival_high}
                            </span>
                        </span>
                    </div>
                </div>
            )}

            {/* Floor answers fade out to the right: there is no trustworthy top end */}
            {showOpenBand && (
                <div className="mb-6 px-2 md:px-6">
                    <div className="relative h-3 rounded-full bg-gradient-to-r from-purple-500/60 to-purple-500/5 border border-purple-500/30">
                        <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-[3px] border-pink-600 shadow-lg" />
                    </div>
                    <div className="flex justify-between mt-2 text-xs md:text-sm text-gray-400">
                        <span>
                            earliest
                            <span className="block text-gray-200 font-medium">
                                {yearOf(prediction.projected_arrival_low) || "—"}
                            </span>
                        </span>
                        <span className="text-right">
                            no reliable upper end
                            <span className="block text-gray-200 font-medium">
                                could be much later
                            </span>
                        </span>
                    </div>
                </div>
            )}

            {/* What the answer rests on. This is the honest replacement for a
                confidence percentage: a reader can actually check it. */}
            {prediction.basis && (
                <div className="flex items-start gap-3 bg-white/5 border-l-[3px] border-purple-500 rounded-r-lg px-4 py-3 mb-5">
                    <span className="text-purple-300 select-none">&#9656;</span>
                    <p className="text-sm md:text-base text-gray-200 leading-relaxed">
                        {prediction.basis}
                    </p>
                </div>
            )}

            {/* Reasoning prose, still useful for the detail the headline drops */}
            {prediction.reasoning && (
                <p className="text-gray-300 text-center max-w-2xl mx-auto text-sm md:text-base leading-relaxed px-2 whitespace-pre-line mb-5">
                    {prediction.reasoning}
                </p>
            )}

            {/* Track record, so the range comes with its own hit rate */}
            {WITHIN_A_YEAR[selectedModel] &&
                grain !== "rule" &&
                grain !== "ineligible" && (
                    <p className="text-center text-xs md:text-sm text-gray-400 border-t border-white/10 pt-4 mb-6">
                        On {platformConfig?.[selectedModel]?.name || "this service"},{" "}
                        <span className="text-gray-200 font-semibold">
                            {WITHIN_A_YEAR[selectedModel]}
                        </span>{" "}
                        of our predictions land within a year of the real date.
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
                    <h3 className="text-lg font-semibold text-white mb-4">
                        Technical Details
                    </h3>
                    <div className="space-y-3 text-gray-300 text-sm">
                        {prediction.tier && (
                            <div>
                                <span className="text-gray-400">Prediction method:</span>{" "}
                                {prediction.tier}
                            </div>
                        )}
                        <div>
                            <span className="text-gray-400">Answer precision:</span> {grain}
                        </div>
                        {prediction.category && (
                            <div>
                                <span className="text-gray-400">Bucket:</span>{" "}
                                {prediction.category}
                            </div>
                        )}
                        {prediction.projected_arrival && (
                            <div className="font-semibold text-green-400">
                                <span className="text-gray-400 font-normal">
                                    Projected arrival:
                                </span>{" "}
                                {prediction.projected_arrival}
                                {prediction.projected_arrival_low &&
                                    ` (${prediction.projected_arrival_low} to ${prediction.projected_arrival_high})`}
                            </div>
                        )}
                        {prediction.predicted_total_days !== undefined && (
                            <div>
                                <span className="text-gray-400">Model total wait:</span>{" "}
                                {Math.round(prediction.predicted_total_days)} days from release
                            </div>
                        )}
                        {prediction.publisher_avg_wait_days !== undefined && (
                            <div>
                                <span className="text-gray-400">Publisher average wait:</span>{" "}
                                {Math.round(prediction.publisher_avg_wait_days)} days
                            </div>
                        )}
                        {prediction.publisher_game_count !== undefined &&
                            prediction.publisher_game_count !== null && (
                                <div>
                                    <span className="text-gray-400">Publisher history:</span>{" "}
                                    {prediction.publisher_game_count} games on service
                                </div>
                            )}
                        {prediction.metacritic_score_used !== undefined && (
                            <div>
                                <span className="text-gray-400">Metacritic used:</span>{" "}
                                {prediction.metacritic_score_used}
                            </div>
                        )}
                        {prediction.last_appearance_date && (
                            <div>
                                <span className="text-gray-400">Last appearance:</span>{" "}
                                {prediction.last_appearance_date}
                            </div>
                        )}
                        {prediction.sample_size !== undefined &&
                            prediction.sample_size !== null && (
                                <div>
                                    <span className="text-gray-400">Sample size:</span>{" "}
                                    {prediction.sample_size} occurrence(s)
                                </div>
                            )}
                        {prediction.publisher_consistency !== undefined &&
                            prediction.publisher_consistency !== null && (
                                <div>
                                    <span className="text-gray-400">
                                        Publisher consistency (CV):
                                    </span>{" "}
                                    {prediction.publisher_consistency.toFixed(2)}
                                </div>
                            )}
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <span className="text-gray-400 block mb-1">
                                Why ranges instead of one date:
                            </span>
                            <p className="text-gray-300 text-sm">
                                These are multi-year waits, so a single month would be false
                                precision. The range is an 80% interval: the real date should
                                fall inside it about four times in five. When it is wide, that
                                is the model telling you it does not know.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {prediction.recently_appeared && selectedModel !== "epic" && (
                <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
                    <div className="text-yellow-200 text-sm md:text-base">
                        <p className="font-semibold">
                            This game appeared on{" "}
                            {platformConfig?.[selectedModel]?.name || "the service"} recently
                            and may still be available. This prediction assumes it is not
                            currently on the service.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
