import { supabase } from './_supabase.js';

export default async function handler(req, res) {
    // Support both GET (query) and POST (body)
    const game = req.query.game || req.body?.game_name;
    const platform = req.query.platform || req.body?.platform;

    if (!game) {
        return res.status(400).json({ error: "Game name is required" });
    }

    const platformKey = platform || 'any';
    const cacheKey = `predict:${game.toLowerCase()}:${platformKey}`;

    // 1. Check Cache (Supabase)
    try {
        if (supabase) {
            const { data: cachedEntry, error } = await supabase
                .from('cache')
                .select('*')
                .eq('key', cacheKey)
                .single();

            if (cachedEntry && !error) {
                // Check TTL (24 hours)
                const now = new Date();
                const createdAt = new Date(cachedEntry.created_at);
                const ageInMs = now - createdAt;
                const oneDayInMs = 24 * 60 * 60 * 1000;

                if (ageInMs < oneDayInMs) {
                    // Cache Hit
                    await incrementLeaderboard(game, platformKey, req);
                    return res.status(200).json({ ...cachedEntry.data, source: 'cache_hit' });
                } else {
                    // Cache Expired
                    console.log("Cache expired for:", cacheKey);
                }
            }
        }
    } catch (e) {
        console.warn("Supabase Cache Error (Reading):", e);
    }

    // 2. Cache Miss - Fetch from Python Backend
    try {
        const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:5000';

        const fetchOptions = {
            headers: { 'Content-Type': 'application/json' }
        };

        let backendApiUrl = `${backendUrl}/api/predict`;

        if (req.method === 'POST') {
            fetchOptions.method = 'POST';
            fetchOptions.body = JSON.stringify(req.body);
        } else {
            fetchOptions.method = 'GET';
            backendApiUrl += `?game=${encodeURIComponent(game)}&platform=${encodeURIComponent(platform)}`;
        }

        const response = await fetch(backendApiUrl, fetchOptions);

        if (!response.ok) {
            throw new Error(`Backend Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // 3. Store in Cache & Leaderboard
        if (data && !data.error && supabase) {
            try {
                // Upsert to Cache
                await supabase.from('cache').upsert({
                    key: cacheKey,
                    data: data,
                    created_at: new Date().toISOString()
                });

                await incrementLeaderboard(game, platformKey, req);
            } catch (e) {
                console.warn("Supabase Cache Error (Writing):", e);
            }
        }

        return res.status(200).json({ ...data, source: 'cache_miss' });

    } catch (error) {
        console.error("Prediction Proxy Error:", error);
        return res.status(500).json({ error: "Failed to fetch prediction", details: error.message });
    }
}

async function incrementLeaderboard(game, platform, req) {
    if (!supabase) return;

    try {
        // --- SPAM PROTECTION (Rate Limiting) ---
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

        // Skip rate limit for local development IPs
        const isLocal = !ip || ip === '::1' || ip === '127.0.0.1' || ip.includes('localhost');

        if (!isLocal) {
            const rateLimitKey = `rate_limit:${ip}:${game.toLowerCase()}:${platform}`;

            // Check if user voted recently (1 hour cooldown)
            const { data: limitEntry } = await supabase
                .from('cache')
                .select('created_at')
                .eq('key', rateLimitKey)
                .single();

            if (limitEntry) {
                const lastVoted = new Date(limitEntry.created_at);
                const timeDiff = new Date() - lastVoted;
                const oneHour = 60 * 60 * 1000;

                if (timeDiff < oneHour) {
                    console.log(`Rate Limit: Blocked increment for ${game} from ${ip}`);
                    return; // EXIT: Do not increment
                }
            }

            // Record this vote timestamp
            // We reuse the 'cache' table, storing minimal data
            await supabase.from('cache').upsert({
                key: rateLimitKey,
                data: { type: 'rate_limit' },
                created_at: new Date().toISOString()
            });
        }
        // ---------------------------------------

        // Call the Postgres function we defined
        const { error } = await supabase.rpc('increment_leaderboard', {
            p_game: game,
            p_platform: platform
        });

        if (error) console.error("Leaderboard RPC Error:", error);
    } catch (e) {
        console.error("Leaderboard Error:", e);
    }
}
