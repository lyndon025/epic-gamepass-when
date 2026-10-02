import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiKeyManager from "../utils/apiKeyManager";
import { LOADING_STAGES, loadGame, predictionError, requestPrediction } from "../utils/predictApi";
import config from "../config";
import { isService, isSlug, predictionPath } from "../utils/predictionLink";

import PlatformSelector from "../components/PlatformSelector";
import GameSearch from "../components/GameSearch";
import GameDetails from "../components/GameDetails";
import PredictionResults from "../components/PredictionResults";
import { FadeImg } from "../components/Motion";

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
  // Answers for the game on screen, one per service, so switching services
  // shows that service's own answer (or none yet) and switching back brings
  // the earlier one straight back. `pending` holds the services still being
  // predicted, each with its loading message.
  const [answers, setAnswers] = useState({});
  const [pending, setPending] = useState({});
  const prediction = answers[selectedModel] || null;
  const isPredicting = selectedModel in pending;
  const loadingMessage = pending[selectedModel] || "";

  // Separate loading states
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [linkError, setLinkError] = useState(false);

  const API_URL = config.backendUrl;

  // A prediction page is /p/<service>/<slug>. `shownKey` is the service/slug
  // currently on screen, so writing the address after a prediction does not
  // make the page load it a second time.
  const { service: routeService, slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const shownKey = useRef(null);

  // Counts game changes. An answer, or a linked game, that arrives after the
  // visitor has moved to another game is dropped rather than shown.
  const gameRun = useRef(0);
  const clearAnswers = useCallback(() => {
    gameRun.current += 1;
    setAnswers({});
    setPending({});
  }, []);


  const searchGames = useCallback(async () => {
    if (!gameQuery.trim()) return;
    setIsSearching(true);
    setManualEntryMode(false); // Reset manual mode on new search attempt

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

  const selectGame = useCallback(async (game) => {
    setIsLoadingDetails(true);
    setGameResults([]); // Clears results as requested to reduce clutter
    try {
      setSelectedGame(await loadGame(game.id));
      setLinkError(false);
      // A new game starts with no answers.
      clearAnswers();
    } catch (error) {
      console.error("Error fetching game details:", error);
      alert("Error loading game details: " + error.message);
    }
    setIsLoadingDetails(false);
  }, [clearAnswers]);

  const runPrediction = useCallback(async (game, model) => {
    if (!game) return;

    if (!platformConfig[model].enabled) {
      alert(`${platformConfig[model].name} predictions coming soon!`);
      return;
    }

    const run = gameRun.current;
    const current = () => run === gameRun.current;
    setPending((p) => ({ ...p, [model]: "" }));

    const stageTimers = LOADING_STAGES.map(([delay, message]) =>
      setTimeout(() => {
        if (current()) setPending((p) => (model in p ? { ...p, [model]: message } : p));
      }, delay)
    );

    try {
      const answer = await requestPrediction(game, model);
      if (current()) setAnswers((a) => ({ ...a, [model]: answer }));
    } catch (error) {
      console.error("Error predicting:", error);
      if (current()) alert(predictionError(error));
    } finally {
      stageTimers.forEach(clearTimeout);
      if (current()) {
        setPending((p) => {
          const next = { ...p };
          delete next[model];
          return next;
        });
      }
    }
  }, []);

  const predictGame = useCallback(
    () => runPrediction(selectedGame, selectedModel),
    [runPrediction, selectedGame, selectedModel]
  );

  // The address follows what is on screen: /p/<service>/<slug> while a
  // service's answer is shown, so the address bar is already a link to it, and
  // / otherwise. Games typed in by hand have no slug and stay on /. This runs
  // before the link effect below, so a page opened from a link keeps its
  // address while the game loads.
  useEffect(() => {
    if (isLoadingDetails || selectedModel in pending) return;
    const path = answers[selectedModel] ? predictionPath(selectedModel, selectedGame?.slug) : null;
    const key = path ? `${selectedModel}/${selectedGame.slug}` : null;
    if (key === shownKey.current) return;
    shownKey.current = key;
    navigate(path || "/", { replace: true });
  }, [answers, pending, selectedModel, selectedGame, isLoadingDetails, navigate]);

  // Opening /p/<service>/<slug> loads that game and predicts it straight away.
  // No "still mounted" flag: React's development double-run would cancel the
  // only real run. `gameRun` does the job instead - if the visitor has chosen
  // another game by the time the lookup returns, the result is dropped.
  useEffect(() => {
    if (!isService(routeService) || !isSlug(routeSlug)) return;
    const key = `${routeService}/${routeSlug}`;
    if (shownKey.current === key) return;
    shownKey.current = key;
    setLinkError(false);
    setSelectedModel(routeService);
    setGameResults([]);
    clearAnswers();
    const run = gameRun.current;
    setIsLoadingDetails(true);
    (async () => {
      let game = null;
      try {
        game = await loadGame(routeSlug);
      } catch (error) {
        console.error("Error loading linked game:", error);
      }
      if (run !== gameRun.current) return;
      setIsLoadingDetails(false);
      if (!game) {
        shownKey.current = null;
        setLinkError(true);
        return;
      }
      setSelectedGame(game);
      runPrediction(game, routeService);
    })();
  }, [routeService, routeSlug, runPrediction, clearAnswers]);

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
    clearAnswers();
  }, [clearAnswers]);

  return (
    <div className="cx-page" data-svc={selectedModel}>
      {/* The chosen game's own art, blurred, behind everything */}
      <div className="cx-backdrop" aria-hidden="true">
        {selectedGame?.background_image && <FadeImg key={selectedGame.background_image} src={selectedGame.background_image} alt="" />}
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
          saved={Object.keys(answers)}
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
          <p>
            Built by{" "}
            <a href="https://github.com/lyndon025" target="_blank" rel="noopener noreferrer">
              lyndon025
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
