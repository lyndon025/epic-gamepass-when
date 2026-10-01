import { useEffect, useState } from "react";

// How a game's yearly chance compares with every game still waiting for the
// same service. Written by pipeline.hazard at deploy into public/odds_rank.json,
// from the same age table and the same waiting games the chances come from, so
// "better odds than about 9 in 10" and "about 5% a year" cannot disagree.
export function useOddsRank() {
    const [rank, setRank] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch("/odds_rank.json")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (alive) setRank(d);
            })
            .catch(() => { });
        return () => {
            alive = false;
        };
    }, []);
    return rank;
}

/**
 * {beats, under1, median} for a yearly chance on a service, or null. `beats`
 * is the share of waiting games with lower odds.
 */
export function compareOdds(rank, serviceKey, chance) {
    const s = rank?.services?.[serviceKey];
    if (!s || !s.waiting || chance === null || chance === undefined) return null;
    const below = s.buckets.reduce((n, [c, k]) => (c < chance - 1e-9 ? n + k : n), 0);
    return { beats: below / s.waiting, under1: s.under_1, median: s.median };
}

/** "about 9 in 10", or "more than 9 in 10" once it would round to 10. */
export function inTen(share) {
    return share >= 0.95 ? "more than 9 in 10" : `about ${Math.round(share * 10)} in 10`;
}
