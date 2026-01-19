import { supabase } from './_supabase.js';

export default async function handler(req, res) {
    const { platform } = req.query;

    try {
        if (!supabase) {
            return res.status(500).json({ error: "Database not configured" });
        }

        // Fetch Top 10 Games
        // If platform is specified, filter by it. If not, maybe we want global sum?
        // But our structure is (game, platform, score).
        // For 'Global' view, we might need to sum scores across platforms or just show mixed?
        // Let's stick to platform specific or 'any' if we used that key.
        // Actually, let's just query normally.

        let leaderboard = [];

        if (!platform || platform === 'all' || platform === 'global') {
            // GLOBAL VIEW: Use Server-Side Aggregation via RPC
            const { data, error } = await supabase.rpc('get_global_leaderboard');

            if (error) throw error;

            leaderboard = data.map((item, index) => ({
                rank: index + 1,
                game: item.game,
                score: item.total_score,
                breakdown: item.breakdown
            }));

        } else {
            // SPECIFIC PLATFORM VIEW: Use direct index query
            // Much faster than loading 50k rows
            const { data, error } = await supabase
                .from('leaderboard')
                .select('game, score, platform')
                .eq('platform', platform)
                .order('score', { ascending: false })
                .limit(10);

            if (error) throw error;

            leaderboard = data.map((item, index) => ({
                rank: index + 1,
                game: item.game,
                score: item.score,
                breakdown: null // No breakdown needed for specific platform
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
