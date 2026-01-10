import React from "react";

export default function GameSearch({
    gameQuery,
    setGameQuery,
    searchGames,
    loading,
    gameResults,
    selectGame,
}) {
    return (
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-purple-500/30 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4 text-white">
                Search for a Game
            </h3>
            <div className="flex gap-3">
                <input
                    type="text"
                    value={gameQuery}
                    onChange={(e) => setGameQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchGames()}
                    placeholder="Enter game name..."
                    className="flex-1 bg-slate-700/50 text-white px-4 py-3 rounded-lg border border-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                    onClick={searchGames}
                    disabled={loading}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50"
                >
                    {loading ? "Searching..." : "Search"}
                </button>
            </div>

            {/* Game Results */}
            {gameResults.length > 0 && (
                <div className="mt-6 space-y-3">
                    {gameResults.map((game) => (
                        <button
                            key={game.id}
                            onClick={() => selectGame(game)}
                            className="w-full bg-slate-700/50 hover:bg-slate-700 p-4 rounded-lg text-left transition-colors duration-200 border border-white/10"
                        >
                            <div className="flex items-center gap-4">
                                {game.background_image && (
                                    <img
                                        src={game.background_image}
                                        alt={game.name}
                                        className="w-20 h-20 object-cover rounded-lg"
                                        loading="lazy"
                                    />
                                )}
                                <div>
                                    <div className="text-white font-semibold text-lg">
                                        {game.name}
                                    </div>
                                    <div className="text-gray-400 text-sm">
                                        Released: {game.released || "Unknown"}
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
