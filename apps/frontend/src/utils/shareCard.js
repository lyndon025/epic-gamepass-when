// Renders a prediction as a 1200x630 PNG - the size Reddit, X, Discord and
// Facebook all use for link previews, so it posts cleanly without cropping.
//
// Drawn directly on a canvas rather than screenshotting the page: the layout is
// then identical on every device, and nothing on screen (buttons, scroll
// position) leaks into the image. The site address is part of the artwork, so
// it travels with the picture wherever it gets reposted, and a QR code in the
// corner opens this exact prediction.

import qrcode from "qrcode-generator";

export const SITE_URL = "https://epic-gamepass-when.vercel.app/";
const SITE_LABEL = "epic-gamepass-when.vercel.app";

const W = 1200;
const H = 630;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
 * @param {string} card.answer     the headline answer, e.g. "December 2028"
 * @param {string} [card.detail]   one supporting line, e.g. the range
 * @param {string} [card.basis]    what the answer rests on
 * @param {string} [card.asOf]     "25 September 2026"
 * @param {string} [card.image]    RAWG background_image URL
 * @param {string} [card.url]      address the QR code opens
 * @returns {Promise<Blob>}
 */
export async function renderShareCard(card) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Background: the site's slate-to-purple gradient.
    const paintBackground = (c) => {
        const bg = c.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, "#0f172a");
        bg.addColorStop(0.55, "#581c87");
        bg.addColorStop(1, "#0f172a");
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);
    };
    paintBackground(ctx);

    // Cover art down the left, fading into the background.
    const art = await loadImage(artUrl(card.image));
    const ART_W = 430;
    let x0 = 72;
    if (art) {
        drawCover(ctx, art, 0, 0, ART_W, H);
        // Fade the art into the SAME gradient it sits on, not a flat colour, so
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
    let y = 62;

    // Service line
    ctx.font = `700 22px ${SANS}`;
    ctx.fillStyle = "#d8b4fe";
    ctx.fillText(`WHEN WILL IT BE ON ${String(card.service || "").toUpperCase()}?`.slice(0, 64), x0, y);
    y += 46;

    // Game title
    ctx.font = `800 50px ${SANS}`;
    ctx.fillStyle = "#ffffff";
    for (const line of wrap(ctx, card.game, maxW, 2)) {
        ctx.fillText(line, x0, y);
        y += 58;
    }
    y += 22;

    // Kicker + answer
    if (card.kicker) {
        ctx.font = `700 22px ${SANS}`;
        ctx.fillStyle = "#c084fc";
        ctx.fillText(card.kicker.toUpperCase(), x0, y);
        y += 36;
    }
    ctx.font = `900 60px ${SANS}`;
    const answerGrad = ctx.createLinearGradient(x0, 0, x0 + maxW, 0);
    answerGrad.addColorStop(0, "#ffffff");
    answerGrad.addColorStop(1, "#f9a8d4");
    ctx.fillStyle = answerGrad;
    for (const line of wrap(ctx, card.answer, maxW, 2)) {
        ctx.fillText(line, x0, y);
        y += 68;
    }

    if (card.detail) {
        ctx.font = `500 26px ${SANS}`;
        ctx.fillStyle = "#e5e7eb";
        for (const line of wrap(ctx, card.detail, lowW, 1)) {
            ctx.fillText(line, x0, y + 4);
            y += 38;
        }
    }
    if (card.basis) {
        ctx.font = `400 21px ${SANS}`;
        ctx.fillStyle = "#9ca3af";
        for (const line of wrap(ctx, card.basis, lowW, 2)) {
            ctx.fillText(line, x0, y + 10);
            y += 30;
        }
    }

    // Footer: the address is the point of the card, so it gets the most
    // contrast of anything in the footer.
    const fy = H - 92;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x0, fy - 20, lowW, 1);

    ctx.font = `800 30px ${SANS}`;
    const brand = ctx.createLinearGradient(x0, 0, x0 + 360, 0);
    brand.addColorStop(0, "#c084fc");
    brand.addColorStop(1, "#db2777");
    ctx.fillStyle = brand;
    ctx.fillText("Epic Game Pass When?", x0, fy);

    // Without a QR the date sits on the brand line, which is short, so it cannot
    // collide with the web address below. With one, that line is too narrow for
    // both, and the date goes under the code instead.
    if (card.asOf && !qr) {
        ctx.font = `400 16px ${SANS}`;
        ctx.fillStyle = "#9ca3af";
        ctx.textAlign = "right";
        ctx.fillText(`Data as of ${card.asOf}`, W - 64, fy + 10);
        ctx.textAlign = "left";
    }

    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`Check yours at ${SITE_LABEL}`, x0, fy + 42);

    if (qr) {
        drawQr(ctx, qr);
        const cx = qr.x + qr.size / 2;
        ctx.textAlign = "center";
        ctx.font = `600 15px ${SANS}`;
        ctx.fillStyle = "#e9d5ff";
        ctx.fillText("Scan for this prediction", cx, qr.y - 24);
        if (card.asOf) {
            ctx.font = `400 13px ${SANS}`;
            ctx.fillStyle = "#9ca3af";
            ctx.fillText(`Data as of ${card.asOf}`, cx, qr.y + qr.size + 9);
        }
        ctx.textAlign = "left";
    }

    return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png")
    );
}
