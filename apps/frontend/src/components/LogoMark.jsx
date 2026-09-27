import { LOGO_GRID, LOGO_RUNS } from "../utils/logoMark";

// The pixel calendar mark. Colours come from --cx-logo-body and
// --cx-logo-accent, so it follows the light and dark themes.
export default function LogoMark({ className = "" }) {
    return (
        <svg
            className={className}
            viewBox={`0 0 ${LOGO_GRID} ${LOGO_GRID}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
        >
            {LOGO_RUNS.map((r) => (
                <rect
                    key={`${r.x}-${r.y}`}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={1}
                    fill={r.accent ? "var(--cx-logo-accent)" : "var(--cx-logo-body)"}
                />
            ))}
        </svg>
    );
}
