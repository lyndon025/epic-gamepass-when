import React from "react";

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
                            <span className="text-gray-400">🏢 Publisher:</span>{" "}
                            {selectedGame.publisher}
                        </p>
                        <p>
                            <span className="text-gray-400">⭐ Metacritic/RAWG Rating:</span>{" "}
                            {selectedGame.metacritic || "N/A"}
                        </p>
                        <p>
                            <span className="text-gray-400">📅 Release:</span>{" "}
                            {selectedGame.released}
                        </p>
                    </div>
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
