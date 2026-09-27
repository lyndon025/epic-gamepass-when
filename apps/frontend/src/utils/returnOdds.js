// Wording and checks for the comeback answer, shared by the results card
// and the ReturnOdds chart and tiles.

// How each service talks about a game coming back.
export const RETURN_WORDS = {
    epic: { short: "Epic", verb: "given away again", catalogue: false },
    humble: { short: "Humble Choice", verb: "given away again", catalogue: false },
    gamepass: { short: "Game Pass", verb: "back on Game Pass", catalogue: true },
    psplus: { short: "PS Plus", verb: "back on PS Plus", catalogue: true },
};

// Below this a service's games almost never return (Humble), and a chart of
// near-zero bars would say less than the plain answer.
const MIN_RATE = 0.02;

export const RETURN_YEARS = 8;

function timesWord(n) {
    if (n === 1) return "once";
    if (n === 2) return "twice";
    return `${n} times`;
}

/** "Given away 3 times" or "On Game Pass once", from how many runs it has had. */
export function returnKicker(p, serviceKey) {
    const w = RETURN_WORDS[serviceKey];
    const n = Math.max(1, Number(p.sample_size) || 1);
    if (!w) return "Already appeared";
    return w.catalogue ? `On ${w.short} ${timesWord(n)}` : `Given away ${timesWord(n)}`;
}

/** True when the answer carries what the chart and tiles need. */
export function hasReturnOdds(p) {
    return (
        Array.isArray(p.chance_by_year) &&
        p.chance_by_year.length >= RETURN_YEARS &&
        typeof p.return_rate === "number" &&
        p.return_rate >= MIN_RATE
    );
}
