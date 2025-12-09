import { useState } from "react";
import axios from "axios";
import apiKeyManager from "../utils/apiKeyManager";


export default function Home() {
  const [selectedModel, setSelectedModel] = useState("epic");
  const [gameQuery, setGameQuery] = useState("");
  const [gameResults, setGameResults] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // const RAWG_API_KEY = import.meta.env.VITE_RAWG_API_KEY || "";
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const platformConfig = {
    epic: {
      name: "Epic Games Store",
      shortName: "Epic",
      color: "from-purple-600 to-pink-600",
      iconPath: "/logos/epic.svg",
      enabled: true,
    },
    gamepass: {
      name: "Xbox Game Pass Ultimate",
      shortName: "Xbox",
      color: "from-green-600 to-green-800",
      iconPath: "/logos/xbox.svg",
      enabled: true,
    },
    psplus: {
      name: "PlayStation Plus Extra",
      shortName: "PS Plus",
      color: "from-blue-600 to-blue-800",
      iconPath: "/logos/ps.svg",
      enabled: true,
    },
  };

  const searchGames = async () => {
  if (!gameQuery.trim()) return;
  setLoading(true);
  setPrediction(null);
  try {
    const data = await apiKeyManager.makeRequest(
      `https://api.rawg.io/api/games?search=${encodeURIComponent(gameQuery)}&page_size=5`
    );
    
    if (data && data.results) {
      setGameResults(data.results);
    } else {
      console.error('Unexpected response format:', data);
      setGameResults([]);
    }
  } catch (error) {
    console.error("Error searching games:", error);
    alert("Error searching games: " + error.message);
    setGameResults([]);
  }
  setLoading(false);
};




  const selectGame = async (game) => {
  setLoading(true);
  setGameResults([]);
  try {
    const gameDetails = await apiKeyManager.makeRequest(
      `https://api.rawg.io/api/games/${game.id}`
    );
    
    if (!gameDetails) {
      throw new Error('No game details returned');
    }

    let publisher = "Unknown";
    if (gameDetails.publishers && gameDetails.publishers.length > 0) {
      publisher = gameDetails.publishers[0].name;
    }

    const platformsData = gameDetails.platforms || [];
    let metacritic = gameDetails.metacritic;

    if (!metacritic && gameDetails.rating) {
      metacritic = gameDetails.rating * 20;
    } else if (!metacritic && gameDetails.reviews_count > 1000) {
      metacritic = 75;
    }

    if (metacritic) {
      metacritic = Math.round(metacritic * 100) / 100;
    }

    setSelectedGame({
      name: gameDetails.name,
      publisher: publisher,
      metacritic: metacritic,
      released: gameDetails.released,
      background_image: gameDetails.background_image,
      platforms: platformsData,
    });
  } catch (error) {
    console.error("Error fetching game details:", error);
    alert("Error loading game details: " + error.message);
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
      let platformsData = null;
      if (
        selectedGame.platforms &&
        Array.isArray(selectedGame.platforms) &&
        selectedGame.platforms.length > 0
      ) {
        platformsData = selectedGame.platforms;
      }

      console.log("Sending to backend:", {
        game_name: selectedGame.name,
        publisher: selectedGame.publisher,
        metacritic_score: selectedGame.metacritic,
        platform: selectedModel,
        platforms: platformsData,
      });

      const response = await axios.post(`${API_URL}/api/predict`, {
        game_name: selectedGame.name,
        publisher: selectedGame.publisher,
        metacritic_score: selectedGame.metacritic,
        platform: selectedModel,
        platforms: platformsData,
        release_date: selectedGame.released,
      });

      setPrediction(response.data);
    } catch (error) {
      console.error("Error predicting:", error);
      if (error.response) {
        console.error("Backend error:", error.response.data);
        alert(
          `Error: ${error.response.data.error || "Error making prediction"}`
        );
      } else {
        alert("Error making prediction. Check console for details.");
      }
    }

    setLoading(false);
  };

  const getCategoryColor = (category) => {
    if (!category) return "bg-gray-500";
    const cat = category.toLowerCase();
    if (cat.includes("not on pc") || cat.includes("console exclusive"))
      return "bg-gray-600";
    if (cat.includes("within 6 months")) return "bg-green-500";
    if (cat.includes("6-12 months")) return "bg-blue-500";
    if (cat.includes("more than 12 months") && !cat.includes("24"))
      return "bg-yellow-500";
    if (cat.includes("more than 24 months")) return "bg-orange-500";
    if (cat.includes("never")) return "bg-red-500";
    if (cat.includes("unknown")) return "bg-gray-500";
    return "bg-gray-500";
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return "bg-green-500";
    if (confidence >= 60) return "bg-blue-500";
    if (confidence >= 40) return "bg-yellow-500";
    if (confidence >= 20) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
          Epic Game Pass When?
        </h1>
        <p className="text-center text-gray-300 mb-12 text-lg">
          Predict when games will be free on Epic and platform subscription
          services
        </p>

        {/* Platform Selector */}
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-purple-500/30 shadow-2xl">
          <h3 className="text-xl font-semibold mb-4 text-white">
            Select Platform
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(platformConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSelectedModel(key)}
                disabled={!config.enabled}
                className={`
                  relative overflow-hidden rounded-xl p-6 transition-all duration-300
                  ${
                    selectedModel === key
                      ? `bg-gradient-to-br ${config.color} shadow-lg scale-105`
                      : "bg-white/5 hover:bg-white/10"
                  }
                  ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}
                  border-2 ${
                    selectedModel === key
                      ? "border-white/30"
                      : "border-white/10"
                  }
                `}
              >
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={config.iconPath}
                    alt={config.name}
                    className="w-16 h-16 object-contain"
                  />
                  <span className="text-white font-medium text-center">
                    {config.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Search for a Game */}
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-purple-500/30 shadow-2xl">
          <h3 className="text-xl font-semibold mb-4 text-white">
            Search for a Game
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={gameQuery}
              onChange={(e) => setGameQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchGames()}
              placeholder="Enter game name..."
              className="flex-1 bg-slate-700/50 text-white px-4 py-3 rounded-lg border border-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={searchGames}
              disabled={loading}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Game Results */}
          {gameResults.length > 0 && (
            <div className="mt-6 space-y-3">
              {gameResults.map((game) => (
                <button
                  key={game.id}
                  onClick={() => selectGame(game)}
                  className="w-full bg-slate-700/50 hover:bg-slate-700 p-4 rounded-lg text-left transition-all border border-white/10 hover:border-purple-500/50"
                >
                  <div className="flex items-center gap-4">
                    {game.background_image && (
                      <img
                        src={game.background_image}
                        alt={game.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    )}
                    <div>
                      <div className="text-white font-semibold text-lg">
                        {game.name}
                      </div>
                      <div className="text-gray-400 text-sm">
                        Released: {game.released || "Unknown"}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Game */}
        {selectedGame && (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-purple-500/30 shadow-2xl">
            <div className="flex flex-col md:flex-row gap-6">
              {selectedGame.background_image && (
                <img
                  src={selectedGame.background_image}
                  alt={selectedGame.name}
                  className="w-full md:w-48 h-48 object-cover rounded-xl"
                />
              )}
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-white mb-4">
                  {selectedGame.name}
                </h2>
                <div className="space-y-2 text-gray-300">
                  <p>
                    <span className="text-gray-400">🏢 Publisher:</span>{" "}
                    {selectedGame.publisher}
                  </p>
                  <p>
                    <span className="text-gray-400">
                      ⭐ Metacritic/RAWG Rating:
                    </span>{" "}
                    {selectedGame.metacritic || "N/A"}
                  </p>
                  <p>
                    <span className="text-gray-400">📅 Release:</span>{" "}
                    {selectedGame.released}
                  </p>
                </div>
                <button
                  onClick={predictGame}
                  disabled={loading}
                  className={`w-full py-3 text-white rounded-lg font-bold disabled:opacity-50 bg-gradient-to-r ${platformConfig[selectedModel].color} hover:opacity-90 transition flex items-center justify-center gap-2`}
                >
                  {loading
                    ? "Predicting... It may take a few seconds to a minute"
                    : `🔮 Predict on ${platformConfig[selectedModel].shortName}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Prediction Results */}
        {prediction && (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-8 border border-purple-500/30 shadow-2xl animate-fadeIn">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">
              Prediction Results
            </h2>

            {/* Category Badge */}
            <div className="flex justify-center mb-8">
              <div
                className={`${getCategoryColor(
                  prediction.category
                )} text-white px-8 py-4 rounded-full text-xl font-bold uppercase tracking-wide shadow-lg`}
              >
                {prediction.category}
              </div>
            </div>

            {/* Stats Grid */}
            {/* Stats Grid */}
            <div className="space-y-6 mb-8">
              {/* Confidence Rating - FULL WIDTH */}
              {prediction.confidence !== undefined && (
                <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                  <div className="text-sm text-gray-400 mb-2 text-center">
                    Confidence Rating
                  </div>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                      <div
                        className={`h-full ${getConfidenceColor(
                          prediction.confidence
                        )} transition-all duration-500`}
                        style={{ width: `${prediction.confidence}%` }}
                      ></div>
                    </div>
                    <span className="text-2xl font-bold text-white min-w-[4rem] text-right">
                      {prediction.confidence}%
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 text-center">
                    {prediction.confidence >= 80
                      ? "High confidence"
                      : prediction.confidence >= 60
                      ? "Moderate confidence"
                      : "Low confidence"}
                  </div>
                </div>
              )}

              {/* Timing Pattern - FULL WIDTH CENTERED */}
              {prediction.sample_size && (
                <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 text-center">
                  <div className="text-sm text-gray-400 mb-2">
                    Timing Pattern
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {prediction.sample_size === 1 ? "Variable" : "Consistent"}
                  </div>
                </div>
              )}
            </div>

            {/* Analysis */}
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 mb-6">
              <div className="text-sm text-gray-400 mb-3">Analysis</div>
              <p className="text-gray-200 leading-relaxed">
                {prediction.reasoning}
              </p>
            </div>

            {/* Technical Details Toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-lg font-semibold transition-all border border-white/10"
            >
              {showDetails ? "Hide" : "Show"} Technical Details
            </button>

            {/* Technical Details Section */}
            {showDetails && (
              <div className="mt-6 bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Technical Details
                </h3>
                <div className="space-y-3 text-gray-300">
                  {/* Estimated Wait Time */}
                  {prediction.predicted_months !== undefined && (
                    <div>
                      <span className="text-gray-400">
                        Estimated Wait Time:
                      </span>{" "}
                      {Math.floor(prediction.predicted_months / 12) > 0 &&
                        `${Math.floor(prediction.predicted_months / 12)}y `}
                      {Math.round(prediction.predicted_months % 12)}m
                    </div>
                  )}
                  {/* Publisher History */}
                  {prediction.publisher_game_count && (
                    <div>
                      <span className="text-gray-400">Publisher History:</span>{" "}
                      {prediction.publisher_game_count} games on service
                    </div>
                  )}
                  {prediction.tier && (
                    <div>
                      <span className="text-gray-400">Prediction Method:</span>{" "}
                      {prediction.tier}
                    </div>
                  )}
                  {prediction.sample_size && (
                    <div>
                      <span className="text-gray-400">Sample Size:</span>{" "}
                      {prediction.sample_size} occurrence(s)
                    </div>
                  )}
                  {/* FIX: Add null check before calling toFixed() */}
                  {prediction.publisher_consistency !== undefined &&
                    prediction.publisher_consistency !== null && (
                      <div>
                        <span className="text-gray-400">
                          Publisher Consistency (CV):
                        </span>{" "}
                        {prediction.publisher_consistency.toFixed(2)}
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Warning for recently appeared games */}
            {prediction.recently_appeared && selectedModel !== "epic" && (
              <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div className="text-yellow-200">
                    <p className="font-semibold mb-2">
                      **Note:** This game appeared on the{" "}
                      {platformConfig[selectedModel].name} service recently and
                      may still be available. This prediction assumes the game
                      is currently not on the service.
                    </p>
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
