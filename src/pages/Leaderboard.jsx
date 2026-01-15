import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Leaderboard() {
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('global');

    const platforms = [
        { id: 'global', name: 'Global Top 10' },
        { id: 'gamepass', name: 'Xbox Game Pass' },
        { id: 'psplus', name: 'PS Plus Extra' },
        { id: 'epic', name: 'Epic Games' },
        { id: 'humble', name: 'Humble Choice' }
    ];

    useEffect(() => {
        fetchLeaderboard(activeTab);
    }, [activeTab]);

    const fetchLeaderboard = async (platform) => {
        setLoading(true);
        try {
            const queryParam = platform === 'global' ? '' : `?platform=${encodeURIComponent(platform)}`;
            const response = await axios.get(`/api/leaderboard${queryParam}`);
            setLeaderboardData(response.data.leaderboard || []);
        } catch (error) {
            console.error("Failed to fetch statistics", error);
        } finally {
            setLoading(false);
        }
    };

    const getBreakdownString = (breakdown) => {
        if (!breakdown) return "";
        const mapping = { epic: 'Epic', gamepass: 'Xbox', psplus: 'PS Plus', humble: 'Humble' };
        return Object.entries(breakdown)
            .map(([key, count]) => `${mapping[key] || key}: ${count}`)
            .join(', ');
    };

    return (
        <div className="min-h-screen py-12 px-4">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-4xl md:text-5xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-600">
                    Prediction Statistics
                </h1>

                {/* Tabs */}
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                    {platforms.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setActiveTab(p.id)}
                            className={`px-4 py-2 rounded-full font-medium transition-all ${activeTab === p.id
                                ? 'bg-white text-black shadow-lg scale-105'
                                : 'bg-slate-800 text-gray-400 hover:bg-slate-700 hover:text-white'
                                }`}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="bg-slate-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-400">Loading top predictions...</div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/10 text-gray-400 text-sm uppercase tracking-wider">
                                    <th className="p-4 w-16 text-center">Rank</th>
                                    <th className="p-4">Game</th>
                                    <th className="p-4 text-right">Specific Requests</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboardData.length > 0 ? (
                                    leaderboardData.map((item, index) => (
                                        <tr
                                            key={index}
                                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                        >
                                            <td className="p-4 text-center font-bold text-yellow-500">
                                                {index + 1}
                                            </td>
                                            <td className="p-4 font-medium text-white">
                                                <div>{item.game}</div>
                                                {/* Only show breakdown if not filtering by specific platform, or always? */
                                                    // User asked for it on "Global results".
                                                    activeTab === 'global' && item.breakdown && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {getBreakdownString(item.breakdown)}
                                                        </div>
                                                    )
                                                }
                                            </td>
                                            <td className="p-4 text-right text-purple-300 font-mono">
                                                {item.score}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-gray-500">
                                            No data found for this category yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <p className="text-center text-gray-500 text-sm mt-8">
                    * Rankings based on global user searches since Jan 15, 2026.
                </p>
            </div>
        </div>
    );
}
