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

        let query = supabase
            .from('leaderboard')
            .select('game, score, platform')
            .limit(1000); // Fetch enough to aggregate

        if (platform && platform !== 'all' && platform !== 'global') {
            query = query.eq('platform', platform);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Aggregate Data
        const aggregated = {};

        data.forEach(item => {
            if (!aggregated[item.game]) {
                aggregated[item.game] = {
                    game: item.game,
                    score: 0,
                    breakdown: {}
                };
            }
            aggregated[item.game].score += item.score;
            aggregated[item.game].breakdown[item.platform] = (aggregated[item.game].breakdown[item.platform] || 0) + item.score;
        });

        // Convert to array and sort
        const leaderboard = Object.values(aggregated)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map((item, index) => ({
                rank: index + 1,
                game: item.game,
                score: item.score,
                breakdown: item.breakdown
            }));

        return res.status(200).json({
            platform: platform || 'Global',
            leaderboard
        });

    } catch (error) {
        console.error("Leaderboard Fetch Error:", error);
        return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
}
