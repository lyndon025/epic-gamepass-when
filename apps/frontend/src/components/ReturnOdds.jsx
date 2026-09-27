// The comeback chart and tiles shown when a game has already been on a
// service: its running chance of returning over the next 8 years, set against
// the share of the service's games that have ever come back. Both numbers come
// from the backend (chance_by_year and return_rate, docs/CONTRACT.md v1.7).

import { RETURN_WORDS, RETURN_YEARS as YEARS } from "../utils/returnOdds";

function pctLabel(v) {
    return v < 1 ? "<1%" : `${Math.round(v)}%`;
}

function shapeNote(cum) {
    const last = cum[YEARS - 1];
    if (last > 0 && cum[2] / last > 0.6) {
        return "Most of the chance falls in the first 3 years; after that it barely grows.";
    }
    const perYear = (last / YEARS).toFixed(1).replace(/\.0$/, "");
    return `It grows slowly, about ${perYear}% a year, because it has been away a long time.`;
}

/** Running chance by year, with a dashed line at the service's comeback rate. */
export function ReturnChart({ p, serviceKey }) {
    const w = RETURN_WORDS[serviceKey] || { short: "This service" };
    const cum = p.chance_by_year.slice(0, YEARS).map((v) => v * 100);
    const rate = p.return_rate * 100;
    const base = 120;
    const top = 34;
    const per = (base - top) / Math.max(rate, ...cum);
    const lineY = base - rate * per;
    const label = `Chance it has returned: ${cum
        .map((v, i) => `${pctLabel(v)} after ${i + 1} year${i ? "s" : ""}`)
        .join(", ")}. ${w.short} overall: ${Math.round(rate)}%.`;

    return (
        <>
            <svg className="cx-return-chart" viewBox="0 0 320 146" role="img" aria-label={label}>
                <line className="cx-rc-line" x1="10" x2="310" y1={lineY} y2={lineY} />
                <text className="cx-rc-muted cx-rc-rate" x="310" y={lineY - 7} textAnchor="end">
                    {w.short} overall: {Math.round(rate)}%
                </text>
                {cum.map((v, i) => {
                    const x = 14 + i * 37;
                    const h = Math.max(2, v * per);
                    return (
                        <g key={i}>
                            <rect className={i === 0 ? "cx-rc-lit" : "cx-rc-bar"} x={x} y={base - h} width="28" height={h} rx="4" />
                            {(i === 0 || i === 2 || i === YEARS - 1) && (
                                <text className="cx-rc-value" x={x + 14} y={base - h - 6} textAnchor="middle">
                                    {pctLabel(v)}
                                </text>
                            )}
                            <text className="cx-rc-muted" x={x + 14} y="138" textAnchor="middle">
                                {i === 0 ? "1 yr" : i === YEARS - 1 ? `${YEARS} yrs` : i + 1}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <p className="cx-rc-note">{shapeNote(cum)}</p>
        </>
    );
}

function Segments({ on }) {
    return (
        <div className="cx-segs" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={i < on ? "cx-on" : undefined} />
            ))}
        </div>
    );
}

/** Three tiles in the track-record style; a full bar is the service's rate. */
export function ReturnTiles({ p, serviceKey }) {
    const w = RETURN_WORDS[serviceKey] || { short: "this service", verb: "back" };
    const rate = p.return_rate * 100;
    const cum = p.chance_by_year.map((v) => v * 100);
    const tiles = [
        ["within 1 year", cum[0]],
        ["within 3 years", cum[2]],
        [`within ${YEARS} years`, cum[YEARS - 1]],
    ];
    return (
        <>
            <h3>How likely {p.game_name} is {w.verb}</h3>
            <div className="cx-track">
                {tiles.map(([when, v]) => (
                    <div key={when} className="cx-trk">
                        <span className="cx-trk-big">
                            {v < 1 ? "<1" : Math.round(v)} <small>in 100</small>
                        </span>
                        <span className="cx-trk-when">{when}</span>
                        <Segments on={Math.min(10, Math.round((v / rate) * 10))} />
                    </div>
                ))}
            </div>
            <p className="cx-caption">
                A full bar is the {Math.round(rate)}% of {w.short} games that have come back at some point.
            </p>
        </>
    );
}
