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
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

 const platformConfig = {
  epic: {
    name: 'Epic Games Store',
    shortName: 'Epic',
    color: 'from-purple-600 to-pink-600',
    iconPath: '/logos/epic.svg',
    enabled: true  // ✅ Already enabled
  },
  gamepass: {
    name: 'Xbox Game Pass Ultimate',
    shortName: 'Xbox',
    color: 'from-green-600 to-green-800',
    iconPath: '/logos/xbox.svg',
    enabled: true  // ✅ CHANGE THIS TO TRUE
  },
  psplus: {
    name: 'PlayStation Plus Extra',
    shortName: 'PS Plus',
    color: 'from-blue-600 to-blue-800',
    iconPath: '/logos/ps.svg',
    enabled: true  // Keep false until PS Plus model is ready, then set to true
  }
};


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
      alert('Error searching games.');
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
      background_image: gameDetails.background_image,
      platforms: gameDetails.platforms // NEW: Add platforms data
    });
  } catch (error) {
    console.error('Error fetching game details:', error);
    alert('Error loading game details.');
  }
  
  setLoading(false);
};

  const predictGame = async () => {
  if (!selectedGame) return;

  if (!platformConfig[selectedModel].enabled) {
    alert(`${platformConfig[selectedModel].name} predictions coming soon!`);
    return;
  }

  setLoading(true);

  try {
    // Sanitize platforms data
    let platformsData = null;
    if (selectedGame.platforms && Array.isArray(selectedGame.platforms) && selectedGame.platforms.length > 0) {
      platformsData = selectedGame.platforms;
    }

    console.log('Sending to backend:', {
      gamename: selectedGame.name,
      publisher: selectedGame.publisher,
      metacriticscore: selectedGame.metacritic,
      platform: selectedModel,
      platforms: platformsData
    });

    const response = await axios.post(`${API_URL}/api/predict`, {
      gamename: selectedGame.name,
      publisher: selectedGame.publisher,
      metacriticscore: selectedGame.metacritic,
      platform: selectedModel,
      platforms: platformsData  // ← Fixed: only send if valid
    });

    setPrediction(response.data);
  } catch (error) {
    console.error('Error predicting:', error);
    if (error.response) {
      console.error('Backend error:', error.response.data);
      alert(`Error: ${error.response.data.error || 'Error making prediction'}`);
    } else {
      alert('Error making prediction. Check console for details.');
    }
  }

  setLoading(false);
};


  const getCategoryColor = (category) => {
  if (!category) return 'bg-gray-500';
  const cat = category.toLowerCase();
  if (cat.includes('not on pc') || cat.includes('console exclusive')) return 'bg-gray-600'; // NEW
  if (cat.includes('within 6 months')) return 'bg-green-500';
  if (cat.includes('6-12 months')) return 'bg-blue-500';
  if (cat.includes('more than 12 months') && !cat.includes('24')) return 'bg-yellow-500';
  if (cat.includes('more than 24 months')) return 'bg-orange-500';
  if (cat.includes('never')) return 'bg-red-500';
  if (cat.includes('unknown')) return 'bg-gray-500';
  return 'bg-gray-500';
};
  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-blue-500';
    if (confidence >= 40) return 'bg-yellow-500';
    if (confidence >= 20) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-4 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
          Free Game Pass When?
        </h1>
        <p className="text-center text-gray-300 mb-8">
          Predict when games will be free on Epic and platform subscription services
        </p>

        {/* Platform Selector with Image Icons */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <label className="block text-sm font-semibold mb-3 text-gray-300">Select Platform</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(platformConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedModel(key)}
                disabled={!config.enabled}
                className={`
                  relative p-4 rounded-lg font-semibold transition-all
                  ${selectedModel === key 
                    ? `bg-gradient-to-r ${config.color} ring-2 ring-white shadow-lg transform scale-105` 
                    : 'bg-gray-700 hover:bg-gray-600'
                  }
                  ${!config.enabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex flex-col items-center gap-3">
                  <img 
                    src={config.iconPath} 
                    alt={config.name}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-sm text-center">{config.name}</span>
                </div>
                {!config.enabled && (
                  <span className="absolute top-2 right-2 text-xs bg-yellow-600 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Search for a Game</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={gameQuery}
              onChange={(e) => setGameQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchGames()}
              placeholder="Enter game name..."
              className="flex-1 p-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={searchGames}
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Search Results */}
        {gameResults.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-bold mb-4">Found {gameResults.length} results:</h3>
            <div className="space-y-2">
              {gameResults.map((game) => (
                <button
                  key={game.id}
                  onClick={() => selectGame(game)}
                  className="w-full text-left p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition flex items-center gap-4"
                >
                  {game.background_image && (
                    <img src={game.background_image} alt={game.name} className="w-16 h-16 object-cover rounded" />
                  )}
                  <div>
                    <div className="font-semibold">{game.name}</div>
                    <div className="text-sm text-gray-400">Released: {game.released || 'Unknown'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Game */}
        {selectedGame && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-2xl font-bold mb-4">{selectedGame.name}</h3>
            {selectedGame.background_image && (
              <img src={selectedGame.background_image} alt={selectedGame.name} className="w-full h-48 object-cover rounded-lg mb-4" />
            )}
            <div className="space-y-2 mb-4">
              <p>🏢 Publisher: {selectedGame.publisher}</p>
              <p>⭐ Metacritic: {selectedGame.metacritic || 'N/A'}</p>
              <p>📅 Release: {selectedGame.released}</p>
            </div>
            <button
              onClick={predictGame}
              disabled={loading}
              className={`w-full py-3 rounded-lg font-bold disabled:opacity-50 bg-gradient-to-r ${platformConfig[selectedModel].color} hover:opacity-90 transition flex items-center justify-center gap-2`}
            >
              {loading ? 'Predicting... It may take a few seconds to a minute' : `🔮 Predict on ${platformConfig[selectedModel].shortName}`}
            </button>
          </div>
        )}

        {/* Prediction Results */}
        {prediction && (
          <div className="bg-gray-800 rounded-lg p-8 border-2 border-purple-500">
            <h3 className="text-3xl font-bold mb-8 text-center">Prediction Results</h3>
            
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
              
              {/* Platform Badge with Image Icon */}
              <div className="flex justify-center mb-4">
                <span className={`px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-r ${platformConfig[selectedModel].color} flex items-center gap-2`}>
                  <img 
                    src={platformConfig[selectedModel].iconPath} 
                    alt={platformConfig[selectedModel].name}
                    className="w-5 h-5 object-contain"
                  />
                  <span>{platformConfig[selectedModel].name}</span>
                </span>
              </div>

              {/* Tier Badge */}
              {prediction.tier && (
                <div className="flex justify-center mb-6">
                  <span className={`px-5 py-2 rounded-full text-sm font-semibold ${
                    prediction.tier.includes('Historical') ? 'bg-blue-600' : 'bg-purple-600'
                  }`}>
                    {prediction.tier}
                  </span>
                </div>
              )}

              {/* Time Category */}
              {prediction.category && (
                <div className="text-center mb-8">
                  <div className={`inline-block px-8 py-4 rounded-xl text-2xl font-bold shadow-lg ${getCategoryColor(prediction.category)}`}>
                    {prediction.category.toUpperCase()}
                  </div>
                </div>
              )}

              {/* Estimated Time */}
              {prediction.predicted_months !== undefined && prediction.predicted_months !== null && (
                <div className="text-center mb-8">
                  <div className="text-sm text-gray-400 mb-2">Expected Wait Time</div>
                  <div className="text-5xl font-bold text-purple-400">
                    {(() => {
                      const years = Math.floor(prediction.predicted_months / 12);
                      const months = Math.round(prediction.predicted_months % 12);
                      if (years > 0 && months > 0) {
                        return `${years}y ${months}m`;
                      } else if (years > 0) {
                        return `${years} year${years !== 1 ? 's' : ''}`;
                      } else if (months > 0) {
                        return `${months} month${months !== 1 ? 's' : ''}`;
                      } else {
                        return 'Very Soon';
                      }
                    })()}
                  </div>
                </div>
              )}

              {/* Confidence Bar */}
              {prediction.confidence !== undefined && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-300">Confidence</span>
                    <span className="text-2xl font-bold">{prediction.confidence}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-6 rounded-full transition-all duration-500 ${getConfidenceColor(prediction.confidence)}`}
                      style={{ width: `${prediction.confidence}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-400 mt-2 text-center">
                    {prediction.confidence >= 80 ? '🟢 High confidence' :
                     prediction.confidence >= 60 ? '🔵 Moderate confidence' :
                     prediction.confidence >= 40 ? '🟡 Low confidence' : '🔴 Very low confidence'}
                  </div>
                </div>
              )}
            </div>

            {/* Data Source */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {prediction.sample_size !== undefined ? (
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-1">Data Points</div>
                  <div className="text-lg font-bold">{prediction.sample_size} appearance{prediction.sample_size !== 1 ? 's' : ''}</div>
                </div>
              ) : prediction.publisher_game_count !== undefined && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-1">Publisher History</div>
                  <div className="text-lg font-bold">{prediction.publisher_game_count} game{prediction.publisher_game_count !== 1 ? 's' : ''}</div>
                </div>
              )}

              {prediction.publisher_consistency !== undefined && prediction.publisher_consistency !== null && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-400 mb-1">Timing Pattern</div>
                  <div className="text-lg font-bold">
                    {prediction.publisher_consistency < 0.5 ? '✓ Consistent' : 
                     prediction.publisher_consistency < 0.8 ? '≈ Moderate' : '~ Variable'}
                  </div>
                </div>
              )}
            </div>

            {/* Analysis */}
            {prediction.reasoning && (
              <div className="bg-gray-900 rounded-lg p-5 border-l-4 border-purple-500">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">💡</div>
                  <div>
                    <div className="text-sm font-semibold text-purple-400 mb-2">Analysis</div>
                    <p className="text-gray-300 leading-relaxed">{prediction.reasoning}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
