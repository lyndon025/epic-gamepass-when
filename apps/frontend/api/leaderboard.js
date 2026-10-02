// The most searched games, for one service or across all of them.
//
// GET /api/leaderboard?platform=<epic|gamepass|psplus|humble>&limit=<1-20>
// Without a platform (or with "all"/"global") the counts are summed across the
// services by the get_global_leaderboard RPC. Each row also carries `image`,
// the game's cover art from api/_precomputed/images.json when it is there.
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { supabase } from './_supabase.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function parseLimit(raw) {
    const n = Number.parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, n));
}

// Same key the pipeline uses to match names: lowercase, letters and digits only.
function normName(name) {
    return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Found the same way api/_precomputed.js finds its files: next to this module
// first, then the working-directory forms for a local run and a bundle rooted
// at the repository. Loaded once per instance; a missing or unreadable file
// means no images, never a failed request.
let images;

function loadImages() {
    if (images !== undefined) return images;
    images = null;
    const candidates = [];
    try {
        candidates.push(path.join(path.dirname(fileURLToPath(import.meta.url)), '_precomputed', 'images.json'));
    } catch {
        /* not an ES module context */
    }
    candidates.push(path.join(process.cwd(), 'api', '_precomputed', 'images.json'));
    candidates.push(path.join(process.cwd(), 'apps', 'frontend', 'api', '_precomputed', 'images.json'));
    const file = candidates.find((f) => existsSync(f));
    if (!file) return images;
    try {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        images = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch {
        images = null;
    }
    return images;
}

function imageFor(game) {
    const url = loadImages()?.[normName(game)];
    return typeof url === 'string' && url ? url : null;
}

export default async function handler(req, res) {
    const { platform } = req.query;
    const limit = parseLimit(req.query.limit);

    try {
        if (!supabase) {
            return res.status(500).json({ error: "Database not configured" });
        }

        let leaderboard = [];

        if (!platform || platform === 'all' || platform === 'global') {
            // GLOBAL VIEW: summed server-side by the RPC, already in order.
            const { data, error } = await supabase.rpc('get_global_leaderboard');

            if (error) throw error;

            leaderboard = (data || []).slice(0, limit).map((item, index) => ({
                rank: index + 1,
                game: item.game,
                score: item.total_score,
                breakdown: item.breakdown,
                image: imageFor(item.game),
            }));

        } else {
            // SPECIFIC PLATFORM VIEW: direct index query.
            const { data, error } = await supabase
                .from('leaderboard')
                .select('game, score, platform')
                .eq('platform', platform)
                .order('score', { ascending: false })
                .limit(limit);

            if (error) throw error;

            leaderboard = (data || []).map((item, index) => ({
                rank: index + 1,
                game: item.game,
                score: item.score,
                breakdown: null, // No breakdown needed for specific platform
                image: imageFor(item.game),
            }));
        }

        return res.status(200).json({
            platform: platform || 'Global',
            leaderboard
        });

    } catch (error) {
        console.error("Leaderboard Fetch Error:", error);
        return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
}
