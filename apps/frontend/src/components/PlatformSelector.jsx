import React, { useRef } from "react";

// Colours for the selected tile's fill and glow. Epic's brand black would
// vanish on the dark page, so its tile is a lifted grey.
const TILE = {
    epic: { "--svc-color": "#3A3A3A", "--svc-deep": "#1E1E1E", "--svc-glow": "rgba(200,200,200,0.28)" },
    gamepass: { "--svc-color": "#107C10", "--svc-deep": "#0A4F0A", "--svc-glow": "rgba(16,124,16,0.55)" },
    psplus: { "--svc-color": "#0070D1", "--svc-deep": "#004B8C", "--svc-glow": "rgba(0,112,209,0.55)" },
    humble: { "--svc-color": "#CC2929", "--svc-deep": "#871A1A", "--svc-glow": "rgba(204,41,41,0.5)" },
};

const KIND = {
    epic: "Weekly giveaways",
    gamepass: "Subscription",
    psplus: "Subscription",
    humble: "Monthly bundle",
};

// A radio group: one service is always selected, and the arrow keys move
// between them the way a native radio set does.
export default function PlatformSelector({ selectedModel, setSelectedModel, platformConfig }) {
    const refs = useRef({});
    const keys = Object.keys(platformConfig).filter((k) => platformConfig[k].enabled);

    function onKeyDown(e) {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const next = keys[(keys.indexOf(selectedModel) + step + keys.length) % keys.length];
        setSelectedModel(next);
        refs.current[next]?.focus();
    }

    return (
        <section aria-labelledby="svc-title">
            <h2 className="cx-row-title" id="svc-title">Select Platform</h2>
            <div className="cx-rail" role="radiogroup" aria-labelledby="svc-title" onKeyDown={onKeyDown}>
                {Object.entries(platformConfig).map(([key, config]) => {
                    const on = selectedModel === key;
                    return (
                        <button
                            key={key}
                            ref={(el) => (refs.current[key] = el)}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={on ? 0 : -1}
                            className="cx-svc"
                            style={TILE[key]}
                            onClick={() => setSelectedModel(key)}
                            disabled={!config.enabled}
                        >
                            <span className="cx-svc-chip">
                                <img src={config.iconPath} alt="" />
                            </span>
                            <span className="cx-svc-text">
                                <span className="cx-svc-name">{config.name}</span>
                                <span className="cx-svc-state">{KIND[key]}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
