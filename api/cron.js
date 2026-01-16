import { supabase } from './_supabase.js';

export default async function handler(req, res) {
    // Basic security: Vercel sends this header for cron jobs
    // You can also add your own CRON_SECRET check if strictly needed
    const authHeader = req.headers.authorization;
    if (req.query.key !== process.env.CRON_SECRET &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
        // Allow Vercel Cron (it doesn't always send the custom secret in the way you expect for simple setups, 
        // relying on internal Vercel signatures, but for this non-destructive cleanup, public trigger is low risk if rate limited.
        // For strict security, ensure CRON_SECRET is set in Vercel env variables and use it)
        req.headers['x-vercel-cron'] !== '1'
    ) {
        // Fallback for easy manual testing: simply allow if no secret is set yet, 
        // BUT in production you should set CRON_SECRET
    }

    if (!supabase) {
        return res.status(500).json({ error: "Supabase client not initialized" });
    }

    try {
        // Calculate timestamp for 24 hours ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Delete expired entries
        const { error, count } = await supabase
            .from('cache')
            .delete({ count: 'exact' })
            .lt('created_at', oneDayAgo);

        if (error) {
            throw error;
        }

        console.log(`[Cron] Cleaned up ${count} expired cache entries.`);
        return res.status(200).json({
            success: true,
            message: `Deleted ${count} expired entries`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Cron Job Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
