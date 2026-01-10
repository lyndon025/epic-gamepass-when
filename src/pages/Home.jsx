import { useState } from "react";
import axios from "axios";
import apiKeyManager from "../utils/apiKeyManager";
import config from "../config";

import PlatformSelector from "../components/PlatformSelector";
import GameSearch from "../components/GameSearch";
import GameDetails from "../components/GameDetails";
import PredictionResults from "../components/PredictionResults";

export default function Home() {
  const [selectedModel, setSelectedModel] = useState("epic");
  const [gameQuery, setGameQuery] = useState("");
  const [gameResults, setGameResults] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [prediction, setPrediction] = useState(null);

  // Separate loading states
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const API_URL = config.backendUrl;

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
    setIsSearching(true);
    // Optional: Clear prediction when searching new games?
    // setPrediction(null); 
    try {
      const data = await apiKeyManager.makeRequest(
        `https://api.rawg.io/api/games?search=${encodeURIComponent(
          gameQuery
        )}&page_size=5`
      );

      if (data && data.results) {
        setGameResults(data.results);
      } else {
        console.error("Unexpected response format:", data);
        setGameResults([]);
      }
    } catch (error) {
      console.error("Error searching games:", error);
      alert("Error searching games: " + error.message);
      setGameResults([]);
    }
    setIsSearching(false);
  };

  const selectGame = async (game) => {
    setIsLoadingDetails(true);
    setGameResults([]); // Clears results as requested to reduce clutter
    try {
      const gameDetails = await apiKeyManager.makeRequest(
        `https://api.rawg.io/api/games/${game.id}`
      );

      if (!gameDetails) {
        throw new Error("No game details returned");
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

      // Clear prediction when selecting a new game
      setPrediction(null);
    } catch (error) {
      console.error("Error fetching game details:", error);
      alert("Error loading game details: " + error.message);
    }
    setIsLoadingDetails(false);
  };

  const predictGame = async () => {
    if (!selectedGame) return;

    if (!platformConfig[selectedModel].enabled) {
      alert(`${platformConfig[selectedModel].name} predictions coming soon!`);
      return;
    }

    setIsPredicting(true);
    setLoadingMessage("");

    // Set a timer to show "Waking up" message if request takes too long
    const slowResponseTimer = setTimeout(() => {
      setLoadingMessage("Waking up server... (Cold start may take ~1 min)");
    }, 2000); // Show after 2 seconds

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
      }, {
        timeout: 120000 // 2 minutes timeout for cold starts
      });

      setPrediction(response.data);
    } catch (error) {
      console.error("Error predicting:", error);
      if (error.response) {
        console.error("Backend error:", error.response.data);
        alert(
          `Error: ${error.response.data.error || "Error making prediction"}`
        );
      } else if (error.code === 'ECONNABORTED') {
        alert("Request timed out. The server might be waking up or is busy. Please try again.");
      } else {
        alert("Error making prediction. Check console for details.");
      }
    } finally {
      clearTimeout(slowResponseTimer);
      setIsPredicting(false);
      setLoadingMessage("");
    }
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

        <PlatformSelector
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          platformConfig={platformConfig}
        />

        <GameSearch
          gameQuery={gameQuery}
          setGameQuery={setGameQuery}
          searchGames={searchGames}
          loading={isSearching} // Only affects search button
          gameResults={gameResults}
          selectGame={selectGame}
        />

        {(selectedGame || isLoadingDetails) && (
          <div className={`transition-opacity duration-300 ${isLoadingDetails ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
            {selectedGame && (
              <GameDetails
                selectedGame={selectedGame}
                predictGame={predictGame}
                loading={isPredicting} // Only affects predict button
                platformConfig={platformConfig}
                selectedModel={selectedModel}
                loadingMessage={loadingMessage}
              />
            )}
          </div>
        )}

        {prediction && !isLoadingDetails && (
          <PredictionResults
            prediction={prediction}
            platformConfig={platformConfig}
            selectedModel={selectedModel}
          />
        )}
      </div>
    </div>
  );
}
