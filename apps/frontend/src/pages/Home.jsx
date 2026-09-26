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

// The selected service's colours, applied to the whole page. Epic's brand black
// would disappear on the dark page, so it takes an off-white accent instead.
const SERVICE_THEME = {
  epic: {
    "--cx-brand": "#8A8F99", "--cx-brand-deep": "#2F3238", "--cx-brand-hi": "#D9DBE0",
    "--cx-brand-soft": "rgba(217, 219, 224, 0.4)", "--cx-brand-glow": "rgba(200, 200, 200, 0.25)",
    "--cx-brand-btn": "#ECEBE7", "--cx-brand-btn-ink": "#111317",
  },
  gamepass: {
    "--cx-brand": "#107C10", "--cx-brand-deep": "#0A4F0A", "--cx-brand-hi": "#5CC24A",
    "--cx-brand-soft": "rgba(92, 194, 74, 0.55)", "--cx-brand-glow": "rgba(16, 124, 16, 0.5)",
    "--cx-brand-btn": "#107C10", "--cx-brand-btn-ink": "#FFFFFF",
  },
  psplus: {
    "--cx-brand": "#0070D1", "--cx-brand-deep": "#003E78", "--cx-brand-hi": "#4DA3FF",
    "--cx-brand-soft": "rgba(77, 163, 255, 0.55)", "--cx-brand-glow": "rgba(0, 112, 209, 0.5)",
    "--cx-brand-btn": "#0070D1", "--cx-brand-btn-ink": "#FFFFFF",
  },
  humble: {
    "--cx-brand": "#CC2929", "--cx-brand-deep": "#6E1616", "--cx-brand-hi": "#FF6B6B",
    "--cx-brand-soft": "rgba(255, 107, 107, 0.5)", "--cx-brand-glow": "rgba(204, 41, 41, 0.5)",
    "--cx-brand-btn": "#CC2929", "--cx-brand-btn-ink": "#FFFFFF",
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
    <div className="cx-page" style={SERVICE_THEME[selectedModel]}>
      {/* The chosen game's own art, blurred, behind everything */}
      <div className="cx-backdrop" aria-hidden="true">
        {selectedGame?.background_image && <img src={selectedGame.background_image} alt="" />}
      </div>

      <main className="cx-shell">
        <div className="cx-intro">
          <h1>Epic Game Pass When?</h1>
          <p>Predict when games will be free on Epic and subscription services</p>
        </div>

        <PlatformSelector
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          platformConfig={platformConfig}
        />

        {linkError && (
          <div className="cx-banner" role="status">
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
          <div className="cx-tile cx-loading" role="status">
            <span className="cx-spinner" aria-hidden="true" />
            Fetching game details...
          </div>
        )}

        {!isLoadingDetails && selectedGame && (
          <GameDetails
            selectedGame={selectedGame}
            predictGame={predictGame}
            loading={isPredicting} // Only affects predict button
            platformConfig={platformConfig}
            selectedModel={selectedModel}
            loadingMessage={loadingMessage}
          />
        )}

        {prediction && !isLoadingDetails && (
          <PredictionResults
            prediction={prediction}
            platformConfig={platformConfig}
            selectedModel={selectedModel}
            game={selectedGame}
          />
        )}

        <footer className="cx-foot">
          <p>Data sources: <strong>RAWG</strong> and community catalogue lists</p>
          <p>Built by <strong>lyndon025</strong></p>
        </footer>
      </main>
    </div>
  );
}
