import React, { useState } from "react";

export default function PredictionResults({
    prediction,
    platformConfig,
    selectedModel,
}) {
    const [showDetails, setShowDetails] = useState(false);

    const getCategoryColor = (category) => {
        if (!category) return "bg-gray-500";
        const cat = category.toLowerCase();
        if (cat.includes("not on pc") || cat.includes("console exclusive"))
            return "bg-gray-600";
        if (cat.includes("within 6 months")) return "bg-green-500";
        if (cat.includes("6-12 months")) return "bg-blue-500";
        if (cat.includes("more than 12 months") && !cat.includes("24"))
            return "bg-yellow-500";
        if (cat.includes("more than 24 months")) return "bg-orange-500";
        if (cat.includes("never")) return "bg-red-500";
        if (cat.includes("unknown")) return "bg-gray-500";
        return "bg-gray-500";
    };

    const getConfidenceColor = (confidence) => {
        if (confidence >= 80) return "bg-green-500";
        if (confidence >= 60) return "bg-blue-500";
        if (confidence >= 40) return "bg-yellow-500";
        if (confidence >= 20) return "bg-orange-500";
        return "bg-red-500";
    };

    return (
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-4 md:p-8 border border-purple-500/30 shadow-2xl animate-fadeIn">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 text-center">
                Prediction Results
            </h2>

            {/* Category Badge & Reasoning */}
            <div className="flex flex-col items-center mb-8">
                <div
                    className={`${getCategoryColor(
                        prediction.category
                    )} text-white px-6 py-3 md:px-8 md:py-4 rounded-full text-lg md:text-xl font-bold uppercase tracking-wide shadow-lg text-center mb-4`}
                >
                    {prediction.category}
                </div>

                {/* Reasoning Text */}
                <p className="text-gray-200 text-center max-w-2xl text-sm md:text-base leading-relaxed px-4 whitespace-pre-line">
                    {prediction.reasoning}
                </p>
            </div>

            {/* Stats Grid */}
            <div className="space-y-6 mb-8">
                {/* Confidence Rating - FULL WIDTH */}
                {prediction.confidence !== undefined && (
                    <div className="bg-white/5 backdrop-blur-lg rounded-xl p-4 md:p-6 border border-white/10">
                        <div className="text-sm text-gray-400 mb-2 text-center">
                            Confidence Rating
                        </div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                                <div
                                    className={`h-full ${getConfidenceColor(
                                        prediction.confidence
                                    )} transition-all duration-500`}
                                    style={{ width: `${prediction.confidence}%` }}
                                ></div>
                            </div>
                            <span className="text-xl md:text-2xl font-bold text-white min-w-[3rem] md:min-w-[4rem] text-right">
                                {prediction.confidence}%
                            </span>
                        </div>
                        <div className="text-sm text-gray-300 text-center">
                            {prediction.confidence >= 80
                                ? "High confidence"
                                : prediction.confidence >= 60
                                    ? "Moderate confidence"
                                    : "Low confidence"}
                        </div>
                    </div>
                )}


            </div>

            {/* Technical Details Toggle */}
            <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-lg font-semibold transition-all border border-white/10 text-sm md:text-base"
            >
                {showDetails ? "Hide" : "Show"} Technical Details
            </button>

            {/* Technical Details Section */}
            {showDetails && (
                <div className="mt-6 bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4">
                        Technical Details
                    </h3>
                    <div className="space-y-3 text-gray-300">
                        {/* Last Appearance Date (Humble Bundle) */}
                        {prediction.last_appearance_date && (
                            <div>
                                <span className="text-gray-400">Last Appearance:</span>{" "}
                                {prediction.last_appearance_date}
                            </div>
                        )}

                        {/* Theoretical Wait Time (Humble Bundle) */}
                        {prediction.theoretical_wait_time !== undefined && (
                            <div className="text-gray-400">
                                <span className="text-yellow-400">Theoretical Wait (if repeats allowed):</span>{" "}
                                {Math.floor(prediction.theoretical_wait_time / 12) > 0 &&
                                    `${Math.floor(prediction.theoretical_wait_time / 12)}y `}
                                {Math.round(prediction.theoretical_wait_time % 12)}m
                            </div>
                        )}

                        {/* Projected Arrival (New) */}
                        {prediction.projected_arrival && (
                            <div className="font-semibold text-green-400 border-b border-white/10 pb-2 mb-2">
                                <span className="text-gray-400 font-normal">Projected Arrival:</span>{" "}
                                {prediction.projected_arrival}
                            </div>
                        )}

                        {/* Model "Total" Prediction (New) */}
                        {prediction.predicted_total_days !== undefined && (
                            <div>
                                <span className="text-gray-400">Model "Total" Wait:</span>{" "}
                                {Math.round(prediction.predicted_total_days)} days (from release)
                            </div>
                        )}

                        {/* Publisher Average (New) */}
                        {prediction.publisher_avg_wait_days !== undefined && (
                            <div>
                                <span className="text-gray-400">Publisher Avg. Wait:</span>{" "}
                                {Math.round(prediction.publisher_avg_wait_days)} days
                            </div>
                        )}

                        {/* Metacritic Score (New) */}
                        {prediction.metacritic_score_used !== undefined && (
                            <div>
                                <span className="text-gray-400">Metacritic Score Used:</span>{" "}
                                {prediction.metacritic_score_used}
                            </div>
                        )}

                        {/* Estimated Wait Time */}
                        {prediction.predicted_months !== undefined && prediction.predicted_months > 0 && (
                            <div>
                                <span className="text-gray-400">Estimated Remaining Wait:</span>{" "}
                                {Math.floor(prediction.predicted_months / 12) > 0 &&
                                    `${Math.floor(prediction.predicted_months / 12)}y `}
                                {Math.round(prediction.predicted_months % 12)}m
                            </div>
                        )}
                        {/* Publisher History */}
                        {prediction.publisher_game_count !== undefined && (
                            <div>
                                <span className="text-gray-400">Publisher History:</span>{" "}
                                {prediction.publisher_game_count} games on service
                            </div>
                        )}
                        {prediction.tier && (
                            <div>
                                <span className="text-gray-400">Prediction Method:</span>{" "}
                                {prediction.tier}
                            </div>
                        )}

                        {/* Comparison/Analysis (Redundant but requested in Technical Details) */}
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <span className="text-gray-400 block mb-1">Full Analysis:</span>
                            <p className="text-gray-300 text-sm whitespace-pre-line">{prediction.reasoning}</p>
                        </div>
                        {prediction.sample_size !== undefined && (
                            <div>
                                <span className="text-gray-400">Sample Size:</span>{" "}
                                {prediction.sample_size} occurrence(s)
                            </div>
                        )}
                        {/* FIX: Add null check before calling toFixed() */}
                        {prediction.publisher_consistency !== undefined &&
                            prediction.publisher_consistency !== null && (
                                <div>
                                    <span className="text-gray-400">
                                        Publisher Consistency (CV):
                                    </span>{" "}
                                    {prediction.publisher_consistency.toFixed(2)}
                                </div>
                            )}
                    </div>
                </div>
            )}

            {/* Warning for recently appeared games */}
            {prediction.recently_appeared && selectedModel !== "epic" && (
                <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div className="text-yellow-200">
                            <p className="font-semibold mb-2">
                                **Note:** This game appeared on the{" "}
                                {platformConfig[selectedModel].name} service recently and may
                                still be available. This prediction assumes the game is
                                currently not on the service.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
