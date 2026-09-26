import React, { memo } from "react";
import getCroppedImageUrl from "../utils/imageUtils";

const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
    </svg>
);

// The one control nobody should miss: the largest tile on the page, outlined in
// the selected service's colour, with the results attached directly beneath.
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
            onManualSelect({ name: gameQuery, publisher: manualPublisher });
        }
    };

    if (manualEntryMode) {
        return (
            <section className="cx-tile cx-search-tile cx-warn" aria-labelledby="manual-title">
                <h2 id="manual-title">Enter the game yourself</h2>
                <p className="cx-warn-note">
                    Game search is not responding right now, so enter the details by hand. Spell the game
                    and publisher exactly as they appear in stores, for example &quot;Marvel&apos;s Spider-Man 2&quot;
                    and &quot;Sony Interactive Entertainment&quot;.
                </p>
                <div className="cx-field">
                    <label htmlFor="manual-game">Game name</label>
                    <input
                        id="manual-game"
                        type="text"
                        value={gameQuery}
                        onChange={(e) => setGameQuery(e.target.value)}
                        placeholder="e.g. Red Dead Redemption 2"
                    />
                </div>
                <div className="cx-field">
                    <label htmlFor="manual-publisher">Publisher</label>
                    <input
                        id="manual-publisher"
                        type="text"
                        value={manualPublisher}
                        onChange={(e) => setManualPublisher(e.target.value)}
                        placeholder="e.g. Rockstar Games"
                    />
                </div>
                <button
                    type="button"
                    className="cx-btn cx-btn-primary cx-btn-big"
                    onClick={handleManualSubmit}
                    disabled={!gameQuery.trim() || !manualPublisher.trim()}
                >
                    Use these details
                </button>
                <button type="button" className="cx-link" onClick={() => window.location.reload()}>
                    Try search again
                </button>
            </section>
        );
    }

    return (
        <section className="cx-tile cx-search-tile" aria-labelledby="search-title">
            <h2 id="search-title">Search for a Game</h2>
            <form
                className="cx-search-form"
                role="search"
                onSubmit={(e) => {
                    e.preventDefault();
                    searchGames();
                }}
            >
                <div className="cx-search-field">
                    <SearchIcon />
                    <label htmlFor="game-q" className="sr-only">Game name</label>
                    <input
                        id="game-q"
                        type="search"
                        value={gameQuery}
                        onChange={(e) => setGameQuery(e.target.value)}
                        placeholder="Search any game, e.g. Hades"
                        autoComplete="off"
                        enterKeyHint="search"
                    />
                </div>
                <button type="submit" className="cx-btn cx-btn-primary cx-search-go" disabled={loading}>
                    <SearchIcon />
                    {loading ? "Searching..." : "Search"}
                </button>
            </form>
            <p className="cx-search-hint">
                Type a game&apos;s name<span className="cx-desk-only"> and press <kbd>Enter</kbd></span>, then pick the right match.
            </p>

            {gameResults.length > 0 && (
                <>
                    <div className="cx-results-head">
                        <span>
                            {gameResults.length} {gameResults.length === 1 ? "result" : "results"}
                        </span>
                        <span>Pick one</span>
                    </div>
                    <ul className="cx-results">
                        {gameResults.map((game) => (
                            <li key={game.id}>
                                <button type="button" className="cx-result" onClick={() => selectGame(game)}>
                                    <span className="cx-result-thumb">
                                        {game.background_image && (
                                            <img src={getCroppedImageUrl(game.background_image)} alt="" loading="lazy" />
                                        )}
                                    </span>
                                    <span className="cx-result-text">
                                        <span className="cx-result-name">{game.name}</span>
                                        <span className="cx-result-year">
                                            {game.released ? game.released.slice(0, 4) : "Release date unknown"}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
});

export default GameSearch;
