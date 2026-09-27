// The site mark: an 8-bit calendar holding a histogram of possible months,
// with the most likely month lit. One 16x16 sprite, drawn as SVG in the nav
// and on canvas in the share card. public/logo.svg, logo.png and
// apple-touch-icon.png are rendered from these same rows.
//
//   #  calendar body      A  accent (header band and the likely month)
//   .  empty (the page shows through)

export const LOGO_ROWS = [
    "....##....##....",
    ".AAA##AAAA##AAA.",
    "AAAAAAAAAAAAAAAA",
    "AAAAAAAAAAAAAAAA",
    "################",
    "################",
    "#######AA#######",
    "#######AA#######",
    "####..#AA#######",
    "####..#AA#..####",
    "####..#AA#..####",
    "#..#..#AA#..#..#",
    "#..#..#AA#..#..#",
    "################",
    "################",
    ".##############.",
];

export const LOGO_GRID = 16;
export const LOGO_ACCENT = "#FF4FA3";

// Horizontal runs of one colour, so neither SVG nor canvas shows seams between
// neighbouring pixels.
export const LOGO_RUNS = LOGO_ROWS.flatMap((row, y) => {
    const runs = [];
    let x = 0;
    while (x < row.length) {
        const ch = row[x];
        let end = x;
        while (end < row.length && row[end] === ch) end += 1;
        if (ch !== ".") runs.push({ x, y, w: end - x, accent: ch === "A" });
        x = end;
    }
    return runs;
});

// Draw the mark at (x, y), `size` pixels square. Whole-pixel cells keep it
// sharp, so size should be a multiple of 16.
export function drawLogoMark(ctx, x, y, size, { body, accent = LOGO_ACCENT }) {
    const cell = size / LOGO_GRID;
    for (const run of LOGO_RUNS) {
        ctx.fillStyle = run.accent ? accent : body;
        ctx.fillRect(x + run.x * cell, y + run.y * cell, run.w * cell, cell);
    }
}
