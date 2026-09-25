import { useEffect, useState } from "react";

// How followed a game is, compared with games released the same year. Raw RAWG
// follower counts mostly say how OLD a game is - its community was far larger
// years ago - so the count is only meaningful ranked within a release year.
// pipeline.deploy writes public/hype_reference.json: for each year, the 0th to
// 100th percentile follower counts among the games we track.
export function useHypeReference() {
    const [ref, setRef] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch("/hype_reference.json")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (alive) setRef(j);
            })
            .catch(() => { });
        return () => {
            alive = false;
        };
    }, []);
    return ref;
}

// Percentile (0-100) of `added` among games from `year`, or null when either is
// unknown. Years past the newest in the table use the newest, and say so.
export function hypePercentile(ref, year, added) {
    if (!ref?.years || !Number.isFinite(year) || !Number.isFinite(added)) return null;
    const years = Object.keys(ref.years).map(Number).sort((a, b) => a - b);
    if (!years.length) return null;
    const useYear = years.includes(year) ? year : year > years[years.length - 1] ? years[years.length - 1] : null;
    if (useYear === null) return null;
    const cuts = ref.years[String(useYear)].cuts;
    let pct;
    if (added <= cuts[0]) pct = 0;
    else if (added >= cuts[100]) pct = 100;
    else {
        let i = 0;
        while (i < 99 && cuts[i + 1] <= added) i++;
        const span = cuts[i + 1] - cuts[i];
        pct = i + (span > 0 ? (added - cuts[i]) / span : 0);
    }
    return { pct: Math.round(pct), year: useYear, exactYear: useYear === year };
}

export function hypeLabel(pct) {
    if (pct >= 90) return "Huge";
    if (pct >= 70) return "High";
    if (pct >= 40) return "Moderate";
    if (pct >= 15) return "Low";
    return "Niche";
}
