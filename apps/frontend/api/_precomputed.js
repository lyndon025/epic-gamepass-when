// Precomputed answers, read from files bundled with this function.
//
// pipeline.precompute writes one answer per game and service, produced by the
// backend's own /api/predict route with the exact request the site sends. An
// answer is served only when the incoming request carries the same inputs it
// was computed from; anything else - a game outside the catalogue, a game typed
// in by hand, RAWG having changed a detail since - falls through to the live
// backend. Every lookup reports why it did or did not serve, so a miss on the
// deployed site can be diagnosed from the answer itself.
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVICES = new Set(['epic', 'gamepass', 'psplus', 'humble']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

// Where the files are depends on how the function was bundled: next to this
// module is the dependable answer; the working-directory forms cover a local
// run from the frontend folder and a bundle rooted at the repository.
function findDir() {
    const candidates = [];
    try {
        candidates.push(path.join(path.dirname(fileURLToPath(import.meta.url)), '_precomputed'));
    } catch {
        /* not an ES module context */
    }
    candidates.push(path.join(process.cwd(), 'api', '_precomputed'));
    candidates.push(path.join(process.cwd(), 'apps', 'frontend', 'api', '_precomputed'));
    return candidates.find((d) => existsSync(path.join(d, 'meta.json'))) || null;
}

let dir;
let meta;
const shardCache = new Map();

function loadMeta() {
    if (meta !== undefined) return meta;
    dir = findDir();
    try {
        meta = dir ? JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) : null;
    } catch {
        meta = null;
    }
    return meta;
}

function loadShard(service, key) {
    const id = `${service}/${key}`;
    if (!shardCache.has(id)) {
        try {
            shardCache.set(id, JSON.parse(readFileSync(path.join(dir, service, `${key}.json`), 'utf8')));
        } catch {
            shardCache.set(id, null);
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

/** Which inputs differ from the stored ones; empty when they all match. */
function differences(stored, body) {
    const meta = body.metacritic_score === undefined || body.metacritic_score === '' ? null : body.metacritic_score;
    const want = platformNames(body.platforms);
    const out = [];
    if (stored.name !== body.game_name) out.push('name');
    if (stored.publisher !== (body.publisher || 'Unknown')) out.push('publisher');
    if ((stored.metacritic ?? null) !== (meta === null ? null : Number(meta) || null)) out.push('metacritic');
    if ((stored.released ?? null) !== (body.release_date ?? null)) out.push('release date');
    if (stored.platforms.length !== want.length || !stored.platforms.every((p, i) => p === want[i])) out.push('platforms');
    return out;
}

/** The backend build the stored answers came from, or null if none are bundled. */
export function expectedBackend() {
    return loadMeta()?.backend_hash || null;
}

/**
 * Look up a stored answer.
 * @returns {{answer: object|null, reason: string}} reason says why nothing was served
 */
export function precomputedLookup(body) {
    const m = loadMeta();
    if (!m) return { answer: null, reason: 'not bundled with this deployment' };
    if (!body) return { answer: null, reason: 'no request body' };
    const ageDays = (Date.now() - new Date(`${m.computed_at}T00:00:00Z`).getTime()) / 86400000;
    // A day of slack either way: the date is stamped in UTC and clocks differ.
    if (!(ageDays >= -1 && ageDays <= (m.serve_days || 120))) return { answer: null, reason: `expired (made ${m.computed_at})` };

    const { slug, platform } = body;
    if (!SERVICES.has(platform)) return { answer: null, reason: 'unknown service' };
    if (typeof slug !== 'string' || !SLUG.test(slug)) return { answer: null, reason: 'no RAWG slug (typed in by hand?)' };

    const key = createHash('sha1').update(slug, 'utf8').digest('hex')[0];
    const shard = loadShard(platform, key);
    if (!shard) return { answer: null, reason: 'answer file missing from this deployment' };
    const entry = shard[slug];
    if (!entry) return { answer: null, reason: 'game not in the stored set' };
    const diff = differences(entry.in, body);
    if (diff.length) return { answer: null, reason: `game details changed since stored (${diff.join(', ')})` };
    return { answer: entry.a, reason: 'served' };
}

/** The stored answer for this request, or null when it must be answered live. */
export function precomputedAnswer(body) {
    return precomputedLookup(body).answer;
}
