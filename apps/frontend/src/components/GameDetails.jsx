import React from "react";

// Release dates arrive as ISO strings; shown as "19 November 2026". Parsed by
// hand because new Date("2026-11-19") is UTC midnight and shows the day before
// west of Greenwich.
const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
function formatRelease(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso || "Unknown";
}

export default function GameDetails({
    selectedGame,
    predictGame,
    loading,
    platformConfig,
    selectedModel,
    loadingMessage,
}) {
    const art = selectedGame.background_image;
    const hasPlayer = selectedGame.userRating && selectedGame.userRatingCount > 0;

    return (
        <article className={`cx-tile cx-game${art ? "" : " cx-no-art"}`} aria-labelledby="game-name">
            {art && (
                <div className="cx-game-art">
                    <img src={art} alt={`${selectedGame.name} key art`} />
                </div>
            )}
            <div className="cx-game-body">
                <h2 id="game-name">{selectedGame.name}</h2>
                <dl className="cx-facts">
                    <div className="cx-fact">
                        <dt>Publisher</dt>
                        <dd>{selectedGame.publisher}</dd>
                    </div>
                    <div className="cx-fact">
                        <dt>Metacritic</dt>
                        <dd>{selectedGame.metacritic || "Not rated"}</dd>
                    </div>
                    <div className="cx-fact">
                        <dt>Player rating</dt>
                        <dd>
                            {hasPlayer ? `${selectedGame.userRating.toFixed(1)} / 5` : "Not rated"}
                            {hasPlayer && (
                                <small>{selectedGame.userRatingCount.toLocaleString()} ratings on RAWG</small>
                            )}
                        </dd>
                    </div>
                    <div className="cx-fact">
                        <dt>Release</dt>
                        <dd>{selectedGame.released ? formatRelease(selectedGame.released) : "Unknown"}</dd>
                    </div>
                </dl>
                <button
                    type="button"
                    className="cx-btn cx-btn-primary cx-btn-big"
                    onClick={predictGame}
                    disabled={loading}
                >
                    {loading ? "Predicting..." : `Predict on ${platformConfig[selectedModel].name}`}
                </button>
                {loading && (
                    <p className="cx-wait-msg" role="status">
                        {loadingMessage || "This can take a few seconds, or up to a minute if the service was asleep."}
                    </p>
                )}
            </div>
        </article>
    );
}
