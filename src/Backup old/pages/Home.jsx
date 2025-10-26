import { useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [selectedModel, setSelectedModel] = useState('epic');
  const [gameQuery, setGameQuery] = useState('');
  const [gameResults, setGameResults] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  const RAWG_API_KEY = import.meta.env.VITE_RAWG_API_KEY || '';
  const API_URL = import.meta.env.VITE_API_URL || '';

  const searchGames = async () => {
    if (!gameQuery.trim()) return;
    
    setLoading(true);
    setPrediction(null);
    try {
      const response = await axios.get(
        `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(gameQuery)}&page_size=5`
      );
      setGameResults(response.data.results);
    } catch (error) {
      console.error('Error searching games:', error);
      alert('Error searching games. Please check your API key.');
    }
    setLoading(false);
  };

  const selectGame = async (game) => {
    setLoading(true);
    setGameResults([]);
    try {
      const detailsResponse = await axios.get(
        `https://api.rawg.io/api/games/${game.id}?key=${RAWG_API_KEY}`
      );
      
      const gameDetails = detailsResponse.data;
      
      let publisher = 'Unknown';
      if (gameDetails.publishers && gameDetails.publishers.length > 0) {
        publisher = gameDetails.publishers[0].name;
      }
      
      setSelectedGame({
        name: gameDetails.name,
        publisher: publisher,
        metacritic: gameDetails.metacritic,
        released: gameDetails.released,
        background_image: gameDetails.background_image
      });
    } catch (error) {
      console.error('Error fetching game details:', error);
      alert('Error loading game details.');
    }
    setLoading(false);
  };

  const predictGame = async () => {
    if (!selectedGame) return;

    setLoading(true);
    try {
      const releaseDate = new Date(selectedGame.released);
      
      const response = await axios.post(`${API_URL}/api/predict`, {
        game_name: selectedGame.name,
        publisher: selectedGame.publisher,
        metacritic_score: selectedGame.metacritic,
        release_year: releaseDate.getFullYear(),
        release_month: releaseDate.getMonth() + 1
      });

      setPrediction(response.data);
    } catch (error) {
      console.error('Error predicting:', error);
      alert('Error making prediction. Make sure your Python backend is running.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            🎮 Epic Game Pass When?
          </h1>
          <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto px-4">
            Predict when your favorite games will be free on Epic Games Store / Xbox Game Pass Ultimate / PS Plus Extra
          </p>
        </div>

        {/* Platform Selector Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 sm:p-6 border border-white/20 shadow-2xl mb-6 hover:shadow-purple-500/20 transition-all">
          <label className="block text-sm font-semibold text-gray-200 mb-3">
            📱 Select Platform
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-4 py-3 sm:py-3.5 bg-white/10 backdrop-blur-md border border-white/30 rounded-xl text-white text-base font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:bg-white/15"
          >
            <option value="epic" className="bg-slate-800">🎁 Epic Games Store</option>
            <option value="xbox" disabled className="bg-slate-800">🎮 Xbox Game Pass Ultimate (Coming Soon)</option>
            <option value="ps" disabled className="bg-slate-800">🎯 PS Plus Extra (Coming Soon)</option>
          </select>
        </div>

        {/* Search Section Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 sm:p-8 border border-white/20 shadow-2xl mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-2">
            <span>🔍</span>
            <span>Search Game</span>
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              value={gameQuery}
              onChange={(e) => setGameQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchGames()}
              placeholder="Enter game name (e.g., GTA V, Minecraft)..."
              className="flex-1 px-4 py-3 sm:py-3.5 bg-white/10 border border-white/30 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-base"
            />
            <button
              onClick={searchGames}
              disabled={loading || !gameQuery.trim()}
              className="px-6 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 text-base"
            >
              {loading ? '⏳ Searching...' : '🔍 Search'}
            </button>
          </div>

          {/* Search Results with Thumbnails */}
          {gameResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 mb-3">Found {gameResults.length} results:</p>
              {gameResults.map((game) => (
                <button
                  key={game.id}
                  onClick={() => selectGame(game)}
                  className="w-full text-left p-3 sm:p-4 bg-white/5 hover:bg-white/15 border border-white/20 hover:border-purple-500/50 rounded-xl transition-all group"
                >
                  <div className="flex gap-3 sm:gap-4">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      <img 
                        src={game.background_image || 'https://via.placeholder.com/80x80?text=No+Image'} 
                        alt={game.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-white/20 group-hover:border-purple-500/50 transition-all"
                      />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold text-base sm:text-lg mb-1 truncate group-hover:text-purple-300 transition-colors">
                        {game.name}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400 flex flex-wrap items-center gap-2">
                        {game.metacritic && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded-md font-medium">
                            {game.metacritic} ⭐
                          </span>
                        )}
                        {game.released && (
                          <span>📅 {game.released}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected Game Card */}
          {selectedGame && !prediction && (
            <div className="mt-6 p-4 sm:p-6 bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-xl shadow-xl animate-fadeIn">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                {/* Game Thumbnail */}
                {selectedGame.background_image && (
                  <img 
                    src={selectedGame.background_image} 
                    alt={selectedGame.name}
                    className="w-full sm:w-32 h-32 sm:h-32 object-cover rounded-lg border-2 border-purple-500/50"
                  />
                )}
                {/* Game Info */}
                <div className="flex-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">{selectedGame.name}</h3>
                  <div className="space-y-2 text-sm sm:text-base text-gray-200">
                    <p className="flex items-center gap-2">
                      <span className="font-semibold">🏢 Publisher:</span> 
                      <span>{selectedGame.publisher}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-semibold">⭐ Metacritic:</span> 
                      <span>{selectedGame.metacritic || 'N/A'}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-semibold">📅 Release:</span> 
                      <span>{selectedGame.released}</span>
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={predictGame}
                disabled={loading}
                className="mt-4 sm:mt-6 w-full px-6 py-3 sm:py-4 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-green-500/50 text-base sm:text-lg"
              >
                {loading ? '⏳ Analyzing...' : '🔮 Predict When'}
              </button>
            </div>
          )}
        </div>

        {/* Prediction Results Card */}
        {prediction && (
          <div className="bg-gradient-to-br from-green-900/30 to-blue-900/30 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-green-500/30 shadow-2xl animate-fadeIn">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 flex items-center gap-2">
              <span>📊</span>
              <span>Prediction Results</span>
            </h2>
            
            <div className="space-y-6">
              {/* Main Prediction Card */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-white/20">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="text-center sm:text-left">
                    <p className="text-sm text-gray-300 mb-2">Predicted Wait Time from Release Date</p>
                    <p className="text-2xl sm:text-3xl font-bold text-green-400">
                      {prediction.years_whole} year{prediction.years_whole !== 1 ? 's' : ''}
                      {prediction.months_whole > 0 && ` ${prediction.months_whole}mo`}
                    </p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-sm text-gray-300 mb-2">Confidence Range</p>
                    <p className="text-lg sm:text-xl font-semibold text-blue-400">
                      {prediction.lower_bound_years.toFixed(1)} - {prediction.upper_bound_years.toFixed(1)} years
                    </p>
                  </div>
                </div>
              </div>

              {/* Detailed Explanation */}
              <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-white/10">
                <p className="text-sm sm:text-base text-gray-200 leading-relaxed">
                  {prediction.sentence.replace(/\*\*/g, '')}
                </p>
              </div>

              {/* Try Another Button */}
              <button
                onClick={() => {
                  setSelectedGame(null);
                  setPrediction(null);
                  setGameQuery('');
                }}
                className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold rounded-xl transition-all"
              >
                🔄 Try Another Game
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
