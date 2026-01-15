import React, { memo } from "react";
import getCroppedImageUrl from "../utils/imageUtils";

const GameSearch = memo(function GameSearch({
    gameQuery,
    setGameQuery,
    searchGames,
    loading,
    gameResults,
    selectGame,
    manualEntryMode = false,
    onManualSelect,
}) {
    const [manualPublisher, setManualPublisher] = React.useState("");

    const handleManualSubmit = () => {
        if (gameQuery.trim() && manualPublisher.trim()) {
            onManualSelect({
                name: gameQuery,
                publisher: manualPublisher
            });
        }
    };

    if (manualEntryMode) {
        return (
            <div className="bg-slate-800 rounded-2xl p-4 md:p-6 mb-8 border border-red-500/50 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="text-red-400 font-bold text-lg md:text-xl">⚠️ Connection Issue / API Limit Limit Reached</div>
                </div>

                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 md:p-4 mb-6">
                    <p className="text-red-200 text-sm md:text-base">
                        We couldn't search for the game automatically. Please enter the details manually below.
                    </p>
                    <p className="text-red-300 text-xs md:text-sm mt-2 font-semibold">
                        *Important: Ensure the Game/Publisher name is spelled correctly (e.g. "Marvel's Spider-Man 2", "Rockstar Games", "The Legend of Zelda: Breath of the Wild").
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-gray-400 mb-1 text-sm">Game Name</label>
                        <input
                            type="text"
                            value={gameQuery}
                            onChange={(e) => setGameQuery(e.target.value)}
                            placeholder="e.g. Red Dead Redemption 2"
                            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>

                    <div>
                        <label className="block text-gray-400 mb-1 text-sm">Publisher</label>
                        <input
                            type="text"
                            value={manualPublisher}
                            onChange={(e) => setManualPublisher(e.target.value)}
                            placeholder="e.g. Rockstar Games"
                            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>

                    <button
                        onClick={handleManualSubmit}
                        disabled={!gameQuery.trim() || !manualPublisher.trim()}
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                        Use Manual Entry
                    </button>

                    <div className="text-center mt-2">
                        <button
                            onClick={() => window.location.reload()}
                            className="text-gray-500 text-sm hover:text-white underline"
                        >
                            Try refreshing page
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-800 rounded-2xl p-4 md:p-6 mb-8 border border-purple-500/30 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4 text-white">
                Search for a Game
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
                <input
                    type="text"
                    value={gameQuery}
                    onChange={(e) => setGameQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchGames()}
                    placeholder="Enter game name..."
                    className="flex-1 bg-slate-700 text-white px-4 py-3 rounded-lg border border-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                    onClick={searchGames}
                    disabled={loading}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 whitespace-nowrap"
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
                            className="w-full bg-slate-700 hover:bg-slate-600 p-3 md:p-4 rounded-lg text-left transition-colors duration-200 border border-white/10"
                        >
                            <div className="flex items-center gap-3 md:gap-4">
                                {game.background_image && (
                                    <img
                                        src={getCroppedImageUrl(game.background_image)}
                                        alt={game.name}
                                        className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg"
                                        loading="lazy"
                                    />
                                )}
                                <div>
                                    <div className="text-white font-semibold text-base md:text-lg line-clamp-1">
                                        {game.name}
                                    </div>
                                    <div className="text-gray-400 text-xs md:text-sm">
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
});

export default GameSearch;
