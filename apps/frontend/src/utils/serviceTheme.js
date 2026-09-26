// The selected service's colours for the share image, which is always drawn
// dark. They match the dark theme's accents in styles/console.css (.cx-page
// [data-svc]), so a shared picture looks like the page it came from. Epic's
// brand black would vanish on dark, so it takes an off-white accent.
export const SERVICE_COLORS = {
    epic: { brand: "#8A8F99", deep: "#2F3238", hi: "#D9DBE0", soft: "rgba(217, 219, 224, 0.4)", glow: "rgba(200, 200, 200, 0.25)", btn: "#ECEBE7", btnInk: "#111317" },
    gamepass: { brand: "#107C10", deep: "#0A4F0A", hi: "#5CC24A", soft: "rgba(92, 194, 74, 0.55)", glow: "rgba(16, 124, 16, 0.5)", btn: "#107C10", btnInk: "#FFFFFF" },
    psplus: { brand: "#0070D1", deep: "#003E78", hi: "#4DA3FF", soft: "rgba(77, 163, 255, 0.55)", glow: "rgba(0, 112, 209, 0.5)", btn: "#0070D1", btnInk: "#FFFFFF" },
    humble: { brand: "#CC2929", deep: "#6E1616", hi: "#FF6B6B", soft: "rgba(255, 107, 107, 0.5)", glow: "rgba(204, 41, 41, 0.5)", btn: "#CC2929", btnInk: "#FFFFFF" },
};

