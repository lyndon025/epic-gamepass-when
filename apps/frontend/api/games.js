// Game search and details, without RAWG (D-058, D-059).
//
//   GET /api/games?search=<text>  -> { results: [{ id, slug, name, released, background_image }] }
//   GET /api/games?id=<slug>      -> one game, in the fields RAWG's details give
//
// First from our own catalogue (api/_precomputed/catalogue.json: every game the
// site has stored details for, written by pipeline/site_data.py), then IGDB
// when TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are set (free, all platforms,
// the key never leaves the server), then the Steam store (free, no key, PC
// only). IGDB and Steam games get ids "igdb-<id>" and "steam-<appid>", so their
// prediction links keep working too.

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const STEAM_SEARCH = 'https://store.steampowered.com/api/storesearch/';
const STEAM_DETAILS = 'https://store.steampowered.com/api/appdetails';
const LIMIT = 5;
const IGDB_GAMES = 'https://api.igdb.com/v4/games';
const IGDB_FIELDS = 'fields name,slug,first_release_date,platforms.name,cover.image_id,'
    + 'involved_companies.company.name,involved_companies.publisher;';

// Steam's search also returns add-ons; only games are wanted.
const NOT_A_GAME = /(?<![a-z])(soundtrack|ost|demo)(?![a-z])/i;
// These name an add-on only after the game's own name ("... - Padrino Pack"), not on
// their own ("Pack Leader" is a game).
const ADD_ON = /.(?<![a-z])(dlc|expansion pass|season pass|season \d+|costume|artbook|art book|wallpaper|upgrade|bundle|persona set|skin|pack|kit|outfit|cosmetic|mod tools|sdk)(?![a-z])/i;

/** Drops add-ons: a result named "<another result> - ..." or "<another result>: ...". */
function gamesOnly(items) {
    const names = items.map((i) => String(i.name).toLowerCase());
    return items.filter((i) => {
        const n = String(i.name).toLowerCase();
        if (NOT_A_GAME.test(n) || ADD_ON.test(n)) return false;
        return !names.some((m) => m !== n && (n.startsWith(`${m} - `) || n.startsWith(`${m}: `) || n.startsWith(`${m} – `)));
    });
}

// Steam writes the legal name ("CAPCOM Co., Ltd."); our records use the
// trading name, as pipeline/steam.py does.
const LEGAL = /,?\s+(?:co\.?,?\s+ltd\.?|ltd\.?|inc\.?|llc|s\.r\.l\.?|gmbh|s\.a\.?|corp\.?|k\.k\.)\s*$/i;
const tradingName = (n) => String(n).replace(LEGAL, '').trim();

let catalogue;

function loadCatalogue() {
    if (catalogue !== undefined) return catalogue;
    catalogue = {};
    const candidates = [];
    try {
        candidates.push(path.join(path.dirname(fileURLToPath(import.meta.url)), '_precomputed', 'catalogue.json'));
    } catch {
        /* not an ES module context */
    }
    candidates.push(path.join(process.cwd(), 'api', '_precomputed', 'catalogue.json'));
    candidates.push(path.join(process.cwd(), 'apps', 'frontend', 'api', '_precomputed', 'catalogue.json'));
    const file = candidates.find((f) => existsSync(f));
    if (file) {
        try {
            catalogue = JSON.parse(readFileSync(file, 'utf8')) || {};
        } catch {
            catalogue = {};
        }
    }
    return catalogue;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// [name, publisher, released, metacritic, platforms, image] -> RAWG's detail fields.
function fromCatalogue(slug, row) {
    const [name, publisher, released, metacritic, platforms, image] = row;
    return {
        id: slug,
        slug,
        name,
        released: released || null,
        background_image: image || null,
        publishers: publisher ? [{ name: publisher }] : [],
        metacritic: metacritic || null,
        rating: null,
        ratings_count: 0,
        platforms: (platforms || []).map((p) => ({ platform: { name: p } })),
        source: 'catalogue',
    };
}

/** Catalogue matches, best first: the whole name, then its start, then every word. */
function searchCatalogue(term) {
    const q = norm(term);
    if (!q) return [];
    const words = q.split(' ');
    const scored = [];
    for (const [slug, row] of Object.entries(loadCatalogue())) {
        const n = norm(row[0]);
        let score = 0;
        if (n === q) score = 4;
        else if (n.startsWith(q)) score = 3;
        else if (n.includes(q)) score = 2;
        else if (words.every((w) => n.split(' ').includes(w))) score = 1;
        if (score) scored.push([score, n.length, slug, row]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return scored.slice(0, LIMIT).map(([, , slug, row]) => fromCatalogue(slug, row));
}

async function steamJson(url, params) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const r = await fetch(`${url}?${new URLSearchParams(params)}`, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'epic-gamepass-when' },
        });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Steam's "Aug 7, 2025" or "7 Aug, 2025" as "2025-08-07". */
function isoDate(text) {
    const s = String(text || '');
    const y = s.match(/\b(\d{4})\b/);
    const m = s.match(/\b([A-Za-z]{3})[a-z]*\b/);
    const d = s.match(/\b(\d{1,2})\b(?!\d)/);
    if (!y || !m || !MONTHS[m[1].toLowerCase()]) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${y[1]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(d ? d[1] : 1)}`;
}

async function steamDetails(appid) {
    const j = await steamJson(STEAM_DETAILS, { appids: appid, cc: 'us', l: 'en' });
    const entry = j && j[String(appid)];
    const d = entry && entry.success ? entry.data : null;
    if (!d) return null;
    const rel = d.release_date || {};
    return {
        id: `steam-${appid}`,
        slug: `steam-${appid}`,
        name: d.name,
        released: rel.coming_soon ? null : isoDate(rel.date),
        background_image: d.header_image || null,
        publishers: (d.publishers || []).map((name) => ({ name: tradingName(name) })),
        metacritic: (d.metacritic && d.metacritic.score) || null,
        rating: null,
        ratings_count: 0,
        // Steam knows a game is on PC, not whether it is also on consoles.
        // "PC only" made PS Plus answer "Not on PlayStation" for console games,
        // so the platforms are left unknown and no service rules a game out.
        platforms: [],
        source: 'steam',
    };
}

async function searchSteam(term) {
    const j = await steamJson(STEAM_SEARCH, { term, cc: 'us', l: 'en' });
    return gamesOnly(((j && j.items) || []).filter((i) => i.type === 'app')).slice(0, LIMIT).map((i) => ({
        id: `steam-${i.id}`,
        slug: `steam-${i.id}`,
        name: i.name,
        released: null,
        background_image: i.tiny_image || null,
        source: 'steam',
    }));
}

// ---------- IGDB (D-059) ----------
// A token from Twitch's client-credentials flow lasts about 60 days; one per
// running instance is plenty.
let igdbToken = { value: null, expires: 0 };

const igdbReady = () => Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

async function igdbAccess() {
    if (igdbToken.value && Date.now() < igdbToken.expires - 300000) return igdbToken.value;
    const params = new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
    });
    const r = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
    if (!r.ok) return null;
    const j = await r.json();
    igdbToken = { value: j.access_token, expires: Date.now() + Number(j.expires_in || 0) * 1000 };
    return igdbToken.value;
}

async function igdbQuery(body, retried = false) {
    if (!igdbReady()) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const token = await igdbAccess();
        if (!token) return null;
        const r = await fetch(IGDB_GAMES, {
            method: 'POST',
            body,
            signal: ctrl.signal,
            headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
        });
        if (r.status === 401) igdbToken = { value: null, expires: 0 };
        if (r.status === 429 && !retried) {
            // IGDB allows 4 requests a second per app, shared by every visitor
            // and the pipeline: wait a moment and try once more, then fall back.
            await new Promise((ok) => setTimeout(ok, 400));
            return igdbQuery(body, true);
        }
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// An IGDB game in RAWG's detail fields. No Metacritic: IGDB's critic rating
// is a different panel, so the model uses its own typical value instead.
function fromIgdb(g) {
    const pubs = (g.involved_companies || []).filter((c) => c.publisher && c.company).map((c) => ({ name: c.company.name }));
    const cover = g.cover && g.cover.image_id;
    return {
        id: `igdb-${g.id}`,
        slug: `igdb-${g.id}`,
        name: g.name,
        released: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
        background_image: cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover}.jpg` : null,
        publishers: pubs,
        metacritic: null,
        rating: null,
        ratings_count: 0,
        platforms: (g.platforms || []).filter((p) => p.name).map((p) => ({ platform: { name: p.name } })),
        source: 'igdb',
    };
}

async function searchIgdb(term) {
    const safe = String(term).replace(/["\\]/g, ' ');
    const rows = await igdbQuery(`search "${safe}"; ${IGDB_FIELDS} where version_parent = null; limit 10;`);
    return (rows || []).map(fromIgdb);
}

async function igdbDetails(gameId) {
    const rows = await igdbQuery(`${IGDB_FIELDS} where id = ${Number(gameId)};`);
    return rows && rows[0] ? fromIgdb(rows[0]) : null;
}

// Our catalogue's platform lists are as of the last data update, so a game
// ported since (Hades II reached PS5 after it was stored) would be ruled out of
// a service it is now on. IGDB's current list is added to the stored one when
// IGDB has the same game: same name, released within a year (D-060).
const IGDB_AS_RAWG = { 'PC (Microsoft Windows)': 'PC', 'Xbox Series X|S': 'Xbox Series S/X', Mac: 'macOS' };

async function withCurrentPlatforms(game) {
    if (!igdbReady() || !game) return game;
    const year = Number(String(game.released || '').slice(0, 4)) || null;
    const match = (await searchIgdb(game.name)).find((g) => norm(g.name) === norm(game.name)
        && (!year || !g.released || Math.abs(Number(g.released.slice(0, 4)) - year) <= 1));
    if (!match) return game;
    const have = new Set(game.platforms.map((p) => p.platform.name.toLowerCase()));
    const added = match.platforms
        .map((p) => IGDB_AS_RAWG[p.platform.name] || p.platform.name)
        .filter((n) => !have.has(n.toLowerCase()));
    if (!added.length) return game;
    return { ...game, platforms: [...game.platforms, ...added.map((name) => ({ platform: { name } }))] };
}

export default async function handler(req, res) {
    const { search, id } = req.query;
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    try {
        if (id) {
            const key = String(id);
            const steam = key.match(/^steam-(\d+)$/);
            const igdb = key.match(/^igdb-(\d+)$/);
            const game = steam ? await steamDetails(steam[1])
                : igdb ? await igdbDetails(igdb[1])
                : loadCatalogue()[key] ? await withCurrentPlatforms(fromCatalogue(key, loadCatalogue()[key])) : null;
            return game ? res.status(200).json(game) : res.status(404).json({ error: 'Game not found' });
        }
        if (search && String(search).trim()) {
            const ours = searchCatalogue(search);
            if (ours.length >= LIMIT) return res.status(200).json({ results: ours });
            // IGDB, then Steam, fill the rest, without repeating a game already listed.
            const seen = new Set(ours.map((g) => norm(g.name)));
            const out = [...ours];
            for (const source of [searchIgdb, searchSteam]) {
                if (out.length >= LIMIT) break;
                const found = gamesOnly([...out, ...(await source(String(search)))]).filter((g) => !seen.has(norm(g.name)));
                for (const g of found) {
                    seen.add(norm(g.name));
                    out.push(g);
                }
            }
            return res.status(200).json({ results: out.slice(0, LIMIT) });
        }
        return res.status(400).json({ error: 'Pass ?search= or ?id=' });
    } catch (error) {
        console.error('Games fallback error:', error);
        return res.status(500).json({ error: 'Game lookup failed' });
    }
}
