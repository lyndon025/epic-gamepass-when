// Precomputed answers, read from files bundled with this function.
//
// pipeline.precompute writes one answer per game and service, produced by the
// backend's own /api/predict route with the exact request the site sends. An
// answer is served only when the incoming request carries the same inputs it
// was computed from; anything else - a game outside the catalogue, a game typed
// in by hand, RAWG having changed a detail since - returns null and the caller
// falls through to the live backend.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'api', '_precomputed');
const SERVICES = new Set(['epic', 'gamepass', 'psplus', 'humble']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

let meta;
const shardCache = new Map();

function loadMeta() {
    if (meta !== undefined) return meta;
    try {
        meta = JSON.parse(readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
    } catch {
        meta = null; // no precomputed set in this deployment
    }
    return meta;
}

function loadShard(service, key) {
    const id = `${service}/${key}`;
    if (!shardCache.has(id)) {
        try {
            shardCache.set(id, JSON.parse(readFileSync(path.join(DIR, service, `${key}.json`), 'utf8')));
        } catch {
            shardCache.set(id, {});
        }
    }
    return shardCache.get(id);
}

function platformNames(platforms) {
    if (!Array.isArray(platforms)) return [];
    const names = platforms
        .map((p) => String(p?.platform?.name ?? p?.name ?? '').trim().toLowerCase())
        .filter(Boolean);
    return [...new Set(names)].sort();
}

function sameInputs(stored, body) {
    const meta = body.metacritic_score === undefined || body.metacritic_score === '' ? null : body.metacritic_score;
    const want = platformNames(body.platforms);
    return (
        stored.name === body.game_name &&
        stored.publisher === (body.publisher || 'Unknown') &&
        (stored.metacritic ?? null) === (meta === null ? null : Number(meta) || null) &&
        (stored.released ?? null) === (body.release_date ?? null) &&
        stored.platforms.length === want.length &&
        stored.platforms.every((p, i) => p === want[i])
    );
}

/** The backend build the stored answers came from, or null if none are bundled. */
export function expectedBackend() {
    return loadMeta()?.backend_hash || null;
}

/** The stored answer for this request, or null when it must be answered live. */
export function precomputedAnswer(body) {
    const m = loadMeta();
    if (!m || !body) return null;
    const ageDays = (Date.now() - new Date(`${m.computed_at}T00:00:00Z`).getTime()) / 86400000;
    // A day of slack either way: the date is stamped in UTC and clocks differ.
    if (!(ageDays >= -1 && ageDays <= (m.serve_days || 120))) return null;

    const { slug, platform } = body;
    if (!SERVICES.has(platform) || typeof slug !== 'string' || !SLUG.test(slug)) return null;

    const key = createHash('sha1').update(slug, 'utf8').digest('hex')[0];
    const entry = loadShard(platform, key)[slug];
    if (!entry || !sameInputs(entry.in, body)) return null;
    return entry.a;
}
