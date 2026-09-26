import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import apiKeyManager from "../utils/apiKeyManager";
import config from "../config";
import { isService, isSlug, predictionPath } from "../utils/predictionLink";

import PlatformSelector from "../components/PlatformSelector";
import GameSearch from "../components/GameSearch";
import GameDetails from "../components/GameDetails";
import PredictionResults from "../components/PredictionResults";

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
  humble: {
    name: "Humble Choice (Monthly)",
    shortName: "Humble",
    color: "from-red-600 to-orange-600",
    iconPath: "/logos/humble.svg",
    enabled: true,
  },
};

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
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [linkError, setLinkError] = useState(false);

  const API_URL = config.backendUrl;

  // A prediction page is /p/<service>/<slug>. `shownKey` is the service/slug
  // currently on screen, so writing the address after a prediction does not
  // make the page load it a second time.
  const { service: routeService, slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const shownKey = useRef(null);


  const searchGames = useCallback(async () => {
    if (!gameQuery.trim()) return;
    setIsSearching(true);
    setManualEntryMode(false); // Reset manual mode on new search attempt

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
      // If keys run out or other error, trigger manual fallback
      setManualEntryMode(true);
      setGameResults([]); // Clear any partial results
    }
    setIsSearching(false);
  }, [gameQuery]);

  // RAWG accepts either a numeric id or a slug here, so the same lookup serves
  // a search result and a prediction page address.
  const loadGame = useCallback(async (idOrSlug) => {
    let gameDetails = await apiKeyManager.makeRequest(
      `https://api.rawg.io/api/games/${idOrSlug}`
    );
    // A renamed game answers its old slug with {redirect: true, slug: <new>}
    // rather than the game. Followed once, so a link keeps working after RAWG
    // corrects a title.
    if (gameDetails?.redirect && gameDetails.slug && gameDetails.slug !== idOrSlug) {
      gameDetails = await apiKeyManager.makeRequest(
        `https://api.rawg.io/api/games/${gameDetails.slug}`
      );
    }
    if (!gameDetails || !gameDetails.name) {
      throw new Error("No game details returned");
    }
    let publisher = "Unknown";
    if (gameDetails.publishers && gameDetails.publishers.length > 0) {
      publisher = gameDetails.publishers[0].name;
    }
    // Only a real Metacritic score is sent to the model. Player ratings are a
    // different scale and population, so a missing score stays missing and
    // the model uses its own typical value rather than a converted guess.
    return {
      name: gameDetails.name,
      slug: gameDetails.slug || null,
      publisher: publisher,
      metacritic: gameDetails.metacritic || null,
      userRating: gameDetails.rating || null,
      userRatingCount: gameDetails.ratings_count || 0,
      released: gameDetails.released,
      background_image: gameDetails.background_image,
      platforms: gameDetails.platforms || [],
    };
  }, []);

  const selectGame = useCallback(async (game) => {
    setIsLoadingDetails(true);
    setGameResults([]); // Clears results as requested to reduce clutter
    try {
      setSelectedGame(await loadGame(game.id));
      setLinkError(false);
      // Clear prediction when selecting a new game, and leave any prediction
      // page address behind with it.
      setPrediction(null);
      if (shownKey.current) {
        shownKey.current = null;
        navigate("/", { replace: true });
      }
    } catch (error) {
      console.error("Error fetching game details:", error);
      alert("Error loading game details: " + error.message);
    }
    setIsLoadingDetails(false);
  }, [loadGame, navigate]);

  const runPrediction = useCallback(async (game, model) => {
    if (!game) return;

    if (!platformConfig[model].enabled) {
      alert(`${platformConfig[model].name} predictions coming soon!`);
      return;
    }

    setIsPredicting(true);
    setLoadingMessage("");

    // Staged messages, so a slow cold start reads as progress instead of a hang.
    // Naming the reason matters more than the wording: people wait happily for a
    // delay they understand, and bail on a silent spinner.
    const loadingStages = [
      [3000, "Checking historical records..."],
      [10000, "Waking up the prediction service - the first request can take up to a minute."],
      [25000, "Still working. The service sleeps when idle to keep this site free, so it should answer shortly."],
    ];
    const stageTimers = loadingStages.map(([delay, message]) =>
      setTimeout(() => setLoadingMessage(message), delay)
    );

    try {
      const platformsData =
        Array.isArray(game.platforms) && game.platforms.length > 0 ? game.platforms : null;

      const response = await axios.post(`/api/predict`, {
        game_name: game.name,
        publisher: game.publisher,
        metacritic_score: game.metacritic,
        platform: model,
        platforms: platformsData,
        release_date: game.released,
      }, {
        timeout: 120000 // 2 minutes timeout for cold starts
      });

      setPrediction(response.data);

      // Give the answer its own address, so the browser's address bar is
      // already a link to it. Games typed in by hand have no slug and stay on /.
      const path = predictionPath(model, game.slug);
      if (path) {
        shownKey.current = `${model}/${game.slug}`;
        navigate(path, { replace: true });
      }
    } catch (error) {
      console.error("Error predicting:", error);
      if (error.response) {
        console.error("Backend error:", error.response.data);
        alert(
          `Error: ${error.response.data.error || "Error making prediction"}`
        );
      } else if (error.code === 'ECONNABORTED') {
        alert("That took too long, so we stopped waiting. The prediction service was most likely still starting up - it should be awake now, so trying again usually works.");
      } else {
        alert("Error making prediction. Check console for details.");
      }
    } finally {
      stageTimers.forEach(clearTimeout);
      setIsPredicting(false);
      setLoadingMessage("");
    }
  }, [navigate]);

  const predictGame = useCallback(
    () => runPrediction(selectedGame, selectedModel),
    [runPrediction, selectedGame, selectedModel]
  );

  // Opening /p/<service>/<slug> loads that game and predicts it straight away.
  // No "still mounted" flag: React's development double-run would cancel the
  // only real run. `shownKey` does the job instead - if the visitor has moved
  // on by the time the lookup returns, the result is dropped.
  useEffect(() => {
    if (!isService(routeService) || !isSlug(routeSlug)) return;
    const key = `${routeService}/${routeSlug}`;
    if (shownKey.current === key) return;
    shownKey.current = key;
    setLinkError(false);
    setSelectedModel(routeService);
    setGameResults([]);
    setPrediction(null);
    setIsLoadingDetails(true);
    (async () => {
      let game = null;
      try {
        game = await loadGame(routeSlug);
      } catch (error) {
        console.error("Error loading linked game:", error);
      }
      if (shownKey.current !== key) return;
      setIsLoadingDetails(false);
      if (!game) {
        shownKey.current = null;
        setLinkError(true);
        return;
      }
      setSelectedGame(game);
      runPrediction(game, routeService);
    })();
  }, [routeService, routeSlug, loadGame, runPrediction]);

  // The tab title names the prediction, which is what a bookmark or a pasted
  // link preview shows first.
  useEffect(() => {
    const base = "Epic Game Pass When?";
    document.title =
      prediction && selectedGame
        ? `${selectedGame.name} on ${platformConfig[selectedModel].name} - ${base}`
        : base;
  }, [prediction, selectedGame, selectedModel]);

  const handleManualSelect = useCallback((gameData) => {
    setSelectedGame({
      name: gameData.name,
      publisher: gameData.publisher,
      metacritic: null, // Unknown for manual entry; the model uses its typical value
      released: null, // User doesn't input this
      background_image: null,
      platforms: [],
    });
    setManualEntryMode(false);
    setPrediction(null);
  }, []);

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

        {linkError && (
          <div className="bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded-xl px-4 py-3 mb-6 text-sm">
            We could not find the game in that link. Search for it below.
          </div>
        )}

        <GameSearch
          gameQuery={gameQuery}
          setGameQuery={setGameQuery}
          searchGames={searchGames}
          loading={isSearching} // Only affects search button
          gameResults={gameResults}
          selectGame={selectGame}
          manualEntryMode={manualEntryMode}
          onManualSelect={handleManualSelect}
        />

        {isLoadingDetails && (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-8 mb-8 border border-white/10 shadow-2xl flex flex-col items-center justify-center min-h-[200px] animate-pulse">
            <div className="w-12 h-12 border-4 border-[#66c0f4] border-t-transparent rounded-full animate-spin mb-4"></div>
            <div className="text-[#66c0f4] font-semibold text-lg">
              Fetching Game Details...
            </div>
          </div>
        )}

        {!isLoadingDetails && selectedGame && (
          <div className="transition-opacity duration-300 opacity-100">
            <GameDetails
              selectedGame={selectedGame}
              predictGame={predictGame}
              loading={isPredicting} // Only affects predict button
              platformConfig={platformConfig}
              selectedModel={selectedModel}
              loadingMessage={loadingMessage}
            />
          </div>
        )}

        {prediction && !isLoadingDetails && (
          <PredictionResults
            prediction={prediction}
            platformConfig={platformConfig}
            selectedModel={selectedModel}
            game={selectedGame}
          />
        )}
      </div>
    </div>
  );
}
