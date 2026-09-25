import React from "react";
import { hypeLabel, hypePercentile, useHypeReference } from "../utils/hype";

// A labelled bar. `fill` is 0 to 1; null draws an empty track.
function Meter({ label, value, fill, caption, tone }) {
    return (
        <div>
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-xs uppercase tracking-wider text-gray-400">{label}</span>
                <span className="text-sm font-semibold text-white">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                {fill !== null && (
                    <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(3, fill * 100)}%` }} />
                )}
            </div>
            {caption && <p className="text-xs text-gray-400 mt-1">{caption}</p>}
        </div>
    );
}

// Hype (how followed, against games from the same year) and ratings (critics
// and players, kept separate - they are different scales and audiences).
function GameMeters({ game }) {
    const ref = useHypeReference();
    const year = game.released ? Number(String(game.released).slice(0, 4)) : NaN;
    const hype = hypePercentile(ref, year, Number(game.added));
    const hasCritic = Number.isFinite(game.metacritic);
    const hasPlayer = Number.isFinite(game.userRating) && game.userRatingCount > 0;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 bg-white/5 border border-white/10 rounded-xl p-4">
            <Meter
                label="Hype"
                value={hype ? hypeLabel(hype.pct) : "Unknown"}
                fill={hype ? hype.pct / 100 : null}
                tone="bg-gradient-to-r from-amber-500 to-pink-500"
                caption={
                    hype
                        ? `More followed than ${hype.pct}% of ${hype.year} games we track${hype.exactYear ? "" : ", the newest year we have"}`
                        : "Not enough follower data for this game"
                }
            />
            <div className="space-y-3">
                <Meter
                    label="Critics"
                    value={hasCritic ? `${game.metacritic} / 100` : "Not rated"}
                    fill={hasCritic ? game.metacritic / 100 : null}
                    tone="bg-gradient-to-r from-emerald-500 to-teal-400"
                    caption={hasCritic ? "Metacritic" : null}
                />
                <Meter
                    label="Players"
                    value={hasPlayer ? `${game.userRating.toFixed(1)} / 5` : "Not rated"}
                    fill={hasPlayer ? game.userRating / 5 : null}
                    tone="bg-gradient-to-r from-sky-500 to-indigo-400"
                    caption={hasPlayer ? `${game.userRatingCount.toLocaleString()} ratings on RAWG` : null}
                />
            </div>
        </div>
    );
}

export default function GameDetails({
    selectedGame,
    predictGame,
    loading,
    platformConfig,
    selectedModel,
    loadingMessage,
}) {
    return (
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-purple-500/30 shadow-2xl">
            <div className="flex flex-col md:flex-row gap-6">
                {selectedGame.background_image && (
                    <img
                        src={selectedGame.background_image}
                        alt={selectedGame.name}
                        className="w-full md:w-48 h-48 object-cover rounded-xl"
                    />
                )}
                <div className="flex-1">
                    <h2 className="text-3xl font-bold text-white mb-4">
                        {selectedGame.name}
                    </h2>
                    <div className="space-y-2 text-gray-300">
                        <p>
                            <span className="text-gray-400">Publisher:</span>{" "}
                            {selectedGame.publisher}
                        </p>
                        <p>
                            <span className="text-gray-400">Release:</span>{" "}
                            {selectedGame.released || "Unknown"}
                        </p>
                    </div>
                    <GameMeters game={selectedGame} />
                    <button
                        onClick={predictGame}
                        disabled={loading}
                        className={`w-full py-3 mt-6 text-white rounded-lg font-bold disabled:opacity-50 bg-gradient-to-r ${platformConfig[selectedModel].color} hover:opacity-90 transition flex items-center justify-center gap-2`}
                    >
                        {loading ? (
                            <span className="animate-pulse">
                                {loadingMessage || "Predicting... It may take a few seconds to a minute, thank you for your patience..."}
                            </span>
                        ) : (
                            `🔮 Predict on ${platformConfig[selectedModel].shortName}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
