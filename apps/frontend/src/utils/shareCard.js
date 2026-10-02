// Renders a prediction as a 1200x630 PNG - the size Reddit, X, Discord and
// Facebook all use for link previews, so it posts cleanly without cropping.
//
// Drawn directly on a canvas rather than screenshotting the page: the layout is
// then identical on every device, and nothing on screen (buttons, scroll
// position) leaks into the image. The site address is part of the artwork, so
// it travels with the picture wherever it gets reposted, and a QR code in the
// corner opens this exact prediction.

import qrcode from "qrcode-generator";
import { SERVICE_COLORS } from "./serviceTheme";
import { drawLogoMark } from "./logoMark";

export const SITE_URL = "https://epic-gamepass-when.vercel.app/";
const SITE_LABEL = "epic-gamepass-when.vercel.app";

const W = 1200;
const H = 630;
const UI = '"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const DISPLAY = '"Outfit", "Manrope", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

// The site's page colours, so the image looks like the page it came from.
const PAGE = "#0B0C0F";
const TEXT = "#F2F1EE";
const MUTED = "#A4A8B2";

// Canvas text silently falls back to a system face if the web font has not
// loaded yet, so wait for the two faces the card uses. A failure just means
// the fallback is used; the card still renders.
async function fontsReady() {
    if (typeof document === "undefined" || !document.fonts) return;
    try {
        await Promise.all([
            document.fonts.load(`700 64px ${DISPLAY}`),
            document.fonts.load(`800 26px ${UI}`),
            document.fonts.load(`600 22px ${UI}`),
        ]);
    } catch {
        /* fallback faces are fine */
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
}

// Larger RAWG rendition than the site's 600x400 crop, so the art stays sharp
// at card size. RAWG serves these with open CORS, so the canvas can still be
// exported after drawing them.
function artUrl(url) {
    if (!url) return null;
    const marker = "media.rawg.io/media/";
    const i = url.indexOf(marker);
    if (i === -1) return url;
    const rest = url.slice(i + marker.length).replace(/^(crop\/\d+\/\d+|resize\/\d+\/-)\//, "");
    return `${url.slice(0, i + marker.length)}resize/1280/-/${rest}`;
}

function loadImage(src) {
    return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // no art is fine; a broken card is not
        img.src = src;
    });
}

// Word-wraps into at most maxLines, ellipsing the last line if it overflows.
function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (ctx.measureText(trial).width <= maxWidth || !line) {
            line = trial;
        } else {
            lines.push(line);
            line = word;
            if (lines.length === maxLines) break;
        }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(`${last}...`).width > maxWidth) {
            last = last.slice(0, -1);
        }
        lines[maxLines - 1] = `${last.trimEnd()}...`;
    }
    return lines;
}

// The largest size from `size` down to `min` at which the text fits on one
// line; leaves ctx.font set to it. Returns null when it does not fit even at
// `min`.
function fitSize(ctx, text, maxWidth, weight, size, min, family) {
    for (let s = size; s >= min; s -= 1) {
        ctx.font = `${weight} ${s}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) return s;
    }
    return null;
}

// QR geometry. Whole-pixel modules keep the edges crisp (fractional ones blur
// into grey and scan badly); 4px survives the image being shown at half size
// in a feed. Two modules of quiet zone, since the white plate already
// separates the code from the dark background.
const QR_MODULE = 4;
const QR_QUIET = 2;
const QR_MARGIN = 40;

function makeQr(url) {
    if (!url) return null;
    try {
        const qr = qrcode(0, "L");
        qr.addData(url);
        qr.make();
        const n = qr.getModuleCount();
        const size = (n + QR_QUIET * 2) * QR_MODULE;
        return { qr, n, size, x: W - QR_MARGIN - size, y: H - QR_MARGIN - size };
    } catch {
        return null; // a card without a code is fine; no card is not
    }
}

function drawQr(ctx, q) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(q.x, q.y, q.size, q.size, 10);
    else ctx.rect(q.x, q.y, q.size, q.size);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    const off = QR_QUIET * QR_MODULE;
    for (let r = 0; r < q.n; r++) {
        for (let c = 0; c < q.n; c++) {
            if (q.qr.isDark(r, c)) {
                ctx.fillRect(q.x + off + c * QR_MODULE, q.y + off + r * QR_MODULE, QR_MODULE, QR_MODULE);
            }
        }
    }
}

// The page's own picture of the answer, redrawn for the card: the range with
// its marker, or the comeback chart. Heights are the least each needs, so the
// layout can tell whether it fits above the footer; the chart grows into any
// room left over, up to BARS_MAX.
const VISUAL_HEIGHT = { band: 70, bars: 88 };
const BARS_MAX = 132;

function clamp01(v) {
    return Math.min(1, Math.max(0, v));
}

function drawBand(ctx, v, x, y, w, accent) {
    const barY = y + 38;
    const barH = 10;
    const track = ctx.createLinearGradient(x, 0, x + w, 0);
    track.addColorStop(0, accent.hi);
    track.addColorStop(1, v.fade ? "rgba(255,255,255,0.14)" : accent.brand);
    ctx.fillStyle = track;
    roundRect(ctx, x, barY, w, barH, barH / 2);
    ctx.fill();

    ctx.font = `600 15px ${UI}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    for (const t of v.ticks || []) {
        ctx.fillText(String(t.year), x + w * clamp01(t.at), barY + barH + 9);
    }
    ctx.textAlign = "left";

    if (v.pos === null || v.pos === undefined) return;
    const mx = x + w * clamp01(v.pos);
    ctx.beginPath();
    ctx.arc(mx, barY + barH / 2, 12, 0, Math.PI * 2);
    ctx.fillStyle = TEXT;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = accent.brand;
    ctx.stroke();

    if (v.marker) {
        ctx.font = `700 16px ${UI}`;
        const pw = ctx.measureText(v.marker).width + 22;
        const px = Math.min(Math.max(x, mx - pw / 2), x + w - pw);
        ctx.fillStyle = TEXT;
        roundRect(ctx, px, y, pw, 28, 14);
        ctx.fill();
        ctx.fillStyle = PAGE;
        ctx.fillText(v.marker, px + 11, y + 6);
    }
}

function drawBars(ctx, v, x, y, w, h, accent) {
    const values = v.values || [];
    const n = values.length;
    if (!n) return;
    const top = y + 26;
    const base = y + h - 20;
    const per = (base - top) / Math.max(v.rate, ...values);
    const step = w / n;
    const bw = Math.min(44, step * 0.62);
    const pct = (p) => (p < 1 ? "<1%" : `${Math.round(p)}%`);

    // The service's comeback rate as a dashed line across the chart.
    const lineY = base - v.rate * per;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + w, lineY);
    ctx.stroke();
    ctx.restore();
    ctx.font = `600 15px ${UI}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "right";
    ctx.fillText(`${v.label}: ${Math.round(v.rate)}%`, x + w, lineY - 20);
    if (v.title) {
        ctx.textAlign = "left";
        ctx.font = `700 17px ${UI}`;
        ctx.fillStyle = TEXT;
        ctx.fillText(v.title, x, y - 4);
    }

    ctx.textAlign = "center";
    values.forEach((p, i) => {
        const bx = x + i * step + (step - bw) / 2;
        const bh = Math.max(3, p * per);
        ctx.fillStyle = i === 0 ? accent.hi : "rgba(255,255,255,0.16)";
        roundRect(ctx, bx, base - bh, bw, bh, 5);
        ctx.fill();
        if (i === 0 || i === 2 || i === n - 1) {
            ctx.font = `700 15px ${UI}`;
            ctx.fillStyle = TEXT;
            ctx.fillText(pct(p), bx + bw / 2, base - bh - 20);
        }
        ctx.font = `600 14px ${UI}`;
        ctx.fillStyle = MUTED;
        ctx.fillText(i === 0 ? "1 yr" : i === n - 1 ? `${n} yrs` : String(i + 1), bx + bw / 2, base + 5);
    });
    ctx.textAlign = "left";
}

function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * @param {object} card
 * @param {string} card.game       game title
 * @param {string} card.service    e.g. "Xbox Game Pass Ultimate"
 * @param {string} card.kicker     small label above the answer, e.g. "Most likely"
 * @param {string} [card.lead]     a short line over the answer, e.g. "If it joins, around"
 * @param {string} card.answer     the headline answer, e.g. "December 2028"
 * @param {string|string[]} [card.detail]  a supporting line, e.g. the range; given
 *                                 as parts, it breaks between them when it needs two lines
 * @param {string} [card.basis]    what the answer rests on
 * @param {object} [card.visual]   {type: "band", ticks, pos, marker, fade} or
 *                                 {type: "bars", values, rate, label, title}, drawn when it fits
 * @param {string} [card.asOf]     "25 September 2026"
 * @param {string} [card.image]    RAWG background_image URL
 * @param {string} [card.url]      address the QR code opens
 * @param {string} [card.serviceKey] epic | gamepass | psplus | humble, for the accent
 * @returns {Promise<Blob>}
 */
export async function renderShareCard(card) {
    await fontsReady();
    const accent = SERVICE_COLORS[card.serviceKey] || SERVICE_COLORS.gamepass;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const art = await loadImage(artUrl(card.image));

    // Background: the page's near-black, with the game's art faintly behind it
    // and a glow of the service's colour, like the site's own backdrop. Drawn
    // with an overlay rather than a blur filter, which Safari's canvas lacks.
    // The art behind the text is only a colour wash: shrunk to a few pixels and
    // stretched back, so no figure in it is recognisable. Drawing it sharp (or
    // at a different crop from the panel on the left) showed the same people
    // twice. Shrink-and-stretch blurs in every browser, including Safari, whose
    // canvas has no blur filter.
    let wash = null;
    if (art) {
        wash = document.createElement("canvas");
        wash.width = 24;
        wash.height = 13;
        const w = wash.getContext("2d");
        w.imageSmoothingEnabled = true;
        w.imageSmoothingQuality = "high";
        drawCover(w, art, 0, 0, wash.width, wash.height);
    }
    const paintBackground = (c) => {
        c.fillStyle = PAGE;
        c.fillRect(0, 0, W, H);
        if (wash) {
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = "high";
            c.drawImage(wash, 0, 0, W, H);
            c.fillStyle = "rgba(11, 12, 15, 0.82)";
            c.fillRect(0, 0, W, H);
        }
        const glow = c.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.7);
        glow.addColorStop(0, accent.glow);
        glow.addColorStop(1, "rgba(11, 12, 15, 0)");
        c.fillStyle = glow;
        c.fillRect(0, 0, W, H);
    };
    paintBackground(ctx);

    // Cover art down the left, fading into the same background.
    const ART_W = 430;
    let x0 = 72;
    if (art) {
        drawCover(ctx, art, 0, 0, ART_W, H);
        // Fade the art into the SAME background it sits on, not a flat colour, so
        // there is no seam where the two meet: paint the background on a second
        // canvas, mask it to ramp from clear to opaque across the art's edge,
        // and lay it over.
        const veil = document.createElement("canvas");
        veil.width = W;
        veil.height = H;
        const v = veil.getContext("2d");
        paintBackground(v);
        v.globalCompositeOperation = "destination-in";
        const ramp = v.createLinearGradient(ART_W - 220, 0, ART_W, 0);
        ramp.addColorStop(0, "rgba(0,0,0,0)");
        ramp.addColorStop(1, "rgba(0,0,0,1)");
        v.fillStyle = ramp;
        v.fillRect(0, 0, W, H);
        ctx.drawImage(veil, 0, 0);
        x0 = ART_W + 48;
    }
    const maxW = W - x0 - 64;
    // The QR sits in the bottom-right corner, so everything low enough to reach
    // it - the supporting lines and the footer - stops short of it.
    const qr = makeQr(card.url);
    const lowW = qr ? qr.x - 28 - x0 : maxW;

    ctx.textBaseline = "top";
    let y = 60;

    // The question, in sentence case like the page
    ctx.font = `600 22px ${UI}`;
    ctx.fillStyle = MUTED;
    for (const line of wrap(ctx, `When will it be on ${card.service || "this service"}?`, maxW, 1)) {
        ctx.fillText(line, x0, y);
    }
    y += 44;

    // Game title
    ctx.font = `700 50px ${DISPLAY}`;
    ctx.fillStyle = TEXT;
    for (const line of wrap(ctx, card.game, maxW, 2)) {
        ctx.fillText(line, x0, y);
        y += 58;
    }
    y += 14;

    // Kicker as a pill, then the answer
    if (card.kicker) {
        ctx.font = `700 20px ${UI}`;
        const kw = Math.min(maxW, ctx.measureText(card.kicker).width + 28);
        ctx.fillStyle = accent.deep;
        roundRect(ctx, x0, y, kw, 36, 18);
        ctx.fill();
        ctx.fillStyle = TEXT;
        ctx.fillText(card.kicker, x0 + 14, y + 8);
        y += 48;
    }
    if (card.lead) {
        ctx.font = `700 24px ${UI}`;
        ctx.fillStyle = MUTED;
        for (const line of wrap(ctx, card.lead, maxW, 1)) {
            ctx.fillText(line, x0, y);
            y += 32;
        }
    }
    ctx.font = `700 64px ${DISPLAY}`;
    ctx.fillStyle = TEXT;
    for (const line of wrap(ctx, card.answer, maxW, 2)) {
        ctx.fillText(line, x0, y);
        y += 70;
    }

    // The supporting line (often a date range) is never cut short: one line,
    // a little smaller if that is what it takes, or else two - between its
    // parts when it has them, so "As late as" stays with its date.
    if (card.detail) {
        const parts = Array.isArray(card.detail) ? card.detail.filter(Boolean) : [card.detail];
        const joined = parts.join(" · ");
        const one = fitSize(ctx, joined, lowW, 700, 26, 22, UI);
        let lines;
        let size;
        if (one) {
            size = one;
            lines = [joined];
        } else if (parts.length > 1) {
            // Each part starts its own line, so it starts with a capital.
            lines = parts.slice(0, 2).map((t) => t.charAt(0).toUpperCase() + t.slice(1));
            size = Math.min(...lines.map((t) => fitSize(ctx, t, lowW, 700, 26, 18, UI) || 18));
        } else {
            size = 24;
            ctx.font = `700 ${size}px ${UI}`;
            lines = wrap(ctx, joined, lowW, 2);
        }
        ctx.font = `700 ${size}px ${UI}`;
        ctx.fillStyle = accent.hi;
        for (const line of lines) {
            ctx.fillText(line, x0, y + 4);
            y += size + 12;
        }
    }
    // The room left above the footer goes first to the basis line (up to two
    // lines), then to the page's own picture of the answer, set just above the
    // footer. When the picture does not fit, the basis takes the space instead
    // of being cut short.
    const fy = H - 92;
    const bottom = fy - 26;
    const LINE = 30;
    const GAP = 10;
    const basisTop = y + 10;
    ctx.font = `500 21px ${UI}`;
    const needed = card.basis ? wrap(ctx, card.basis, lowW, 4).length : 0;
    const minVis = card.visual ? VISUAL_HEIGHT[card.visual.type] || 0 : 0;
    // The comeback chart shows what that answer's basis line says (how long
    // it has been, how rarely games return), so when it fits it takes the
    // basis line's place and gets the room to be read.
    const replacesBasis = card.visual?.type === "bars";
    const showVisual = minVis > 0
        && bottom - minVis - GAP - basisTop >= (replacesBasis ? 0 : Math.min(needed, 2) * LINE);
    if (card.basis && !(showVisual && replacesBasis)) {
        const room = (showVisual ? bottom - minVis - GAP : bottom) - basisTop;
        const lines = Math.max(1, Math.min(needed, Math.floor(room / LINE)));
        ctx.font = `500 21px ${UI}`;
        ctx.fillStyle = MUTED;
        for (const line of wrap(ctx, card.basis, lowW, lines)) {
            ctx.fillText(line, x0, y + 10);
            y += LINE;
        }
    }
    if (showVisual) {
        const free = bottom - (y + 10) - GAP;
        if (card.visual.type === "band") {
            drawBand(ctx, card.visual, x0, bottom - minVis, lowW, accent);
        } else if (card.visual.type === "bars") {
            const h = Math.min(BARS_MAX, Math.max(minVis, free));
            drawBars(ctx, card.visual, x0, bottom - h, lowW, h, accent);
        }
    }

    // Footer: brand mark and name, then the address.
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x0, fy - 20, lowW, 1);

    drawLogoMark(ctx, x0, fy - 1, 32, { body: TEXT });
    ctx.font = `800 26px ${UI}`;
    ctx.fillStyle = TEXT;
    ctx.fillText("Epic Game Pass When?", x0 + 44, fy + 1);

    // Without a QR the date sits on the brand line, which is short, so it cannot
    // collide with the web address below. With one, that line is too narrow for
    // both, and the date goes under the code instead.
    if (card.asOf && !qr) {
        ctx.font = `500 16px ${UI}`;
        ctx.fillStyle = MUTED;
        ctx.textAlign = "right";
        ctx.fillText(`Data as of ${card.asOf}`, W - 64, fy + 8);
        ctx.textAlign = "left";
    }

    ctx.font = `600 20px ${UI}`;
    ctx.fillStyle = MUTED;
    ctx.fillText("Check yours at ", x0, fy + 44);
    const lead = ctx.measureText("Check yours at ").width;
    ctx.fillStyle = TEXT;
    ctx.fillText(SITE_LABEL, x0 + lead, fy + 44);

    if (qr) {
        drawQr(ctx, qr);
        const cx = qr.x + qr.size / 2;
        ctx.textAlign = "center";
        ctx.font = `700 15px ${UI}`;
        ctx.fillStyle = TEXT;
        ctx.fillText("Scan for this prediction", cx, qr.y - 24);
        if (card.asOf) {
            ctx.font = `500 13px ${UI}`;
            ctx.fillStyle = MUTED;
            ctx.fillText(`Data as of ${card.asOf}`, cx, qr.y + qr.size + 9);
        }
        ctx.textAlign = "left";
    }

    return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png")
    );
}
