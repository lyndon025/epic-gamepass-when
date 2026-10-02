import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import GameDetails from "./GameDetails";
import PredictionResults from "./PredictionResults";
import { LOADING_STAGES, loadGame, predictionError, requestPrediction } from "../utils/predictApi";
import { predictionPath } from "../utils/predictionLink";

// Answers already opened on this visit, so going back to a game shows it at
// once, without a second RAWG lookup or a second search counted.
const opened = new Map();

/**
 * One game's prediction in a panel over the Rankings page, so a visitor can
 * go through the list without leaving it. It closes with its close button,
 * Escape, a click outside it, or the browser's Back button (the Rankings page
 * keeps the open game in its address).
 */
export default function PredictionSheet({ service, slug, platformConfig, onClose }) {
  const key = `${service}/${slug}`;
  const [state, setState] = useState(() => opened.get(key) || { status: "loading" });
  const sheetRef = useRef(null);
  const closeRef = useRef(null);
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    if (opened.has(key)) return undefined;
    let live = true;
    const timers = [];
    (async () => {
      let game;
      try {
        game = await loadGame(slug);
      } catch (error) {
        console.error("Error loading game:", error);
        if (live) setState({ status: "error", message: "We could not load this game. Please try again later." });
        return;
      }
      if (!live) return;
      setState({ status: "predicting", game, message: "" });
      for (const [delay, message] of LOADING_STAGES) {
        timers.push(setTimeout(() => setState((s) => (s.status === "predicting" ? { ...s, message } : s)), delay));
      }
      try {
        const done = { status: "ok", game, answer: await requestPrediction(game, service) };
        opened.set(key, done);
        if (live) setState(done);
      } catch (error) {
        console.error("Error predicting:", error);
        if (live) setState({ status: "error", game, message: predictionError(error) });
      } finally {
        timers.forEach(clearTimeout);
      }
    })();
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [key, service, slug]);

  // While open: the page behind does not scroll, Escape closes, and focus
  // stays in the panel, returning to the row that opened it on close.
  useEffect(() => {
    const before = document.activeElement;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") latestClose.current();
    };
    const onFocus = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) closeRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      root.style.overflow = overflow;
      if (before?.isConnected) before.focus();
    };
  }, []);

  // The tab title names the game while its answer is shown.
  const title = state.status === "ok" ? `${state.game.name} on ${platformConfig[service].name}` : null;
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = `${title} - Epic Game Pass When?`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  const config = platformConfig[service];
  const page = predictionPath(service, slug);
  // The ways onward, in the top bar and again under the answer. A phone shows
  // the short labels.
  const onward = (
    <>
      <Link className="cx-btn cx-btn-quiet" to="/">
        <span className="cx-long">Search another game</span>
        <span className="cx-short">New search</span>
      </Link>
      {page && (
        <Link className="cx-btn cx-btn-quiet" to={page}>
          <span className="cx-long">Compare other services</span>
          <span className="cx-short">Compare</span>
        </Link>
      )}
    </>
  );

  return (
    <div
      className="cx-sheet-wrap"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="cx-page cx-sheet"
        data-svc={service}
        role="dialog"
        aria-modal="true"
        aria-label={state.game ? `${state.game.name} on ${config.name}` : `Prediction on ${config.name}`}
      >
        <div className="cx-sheet-bar">
          <span className="cx-sheet-svc">
            <img src={config.iconPath} alt="" />
            <span>{config.name}</span>
          </span>
          <nav className="cx-sheet-go" aria-label="Go on">
            {onward}
          </nav>
          <button ref={closeRef} type="button" className="cx-sheet-x" onClick={onClose} aria-label="Close and go back to the rankings">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="cx-sheet-body">
          {state.game ? (
            <GameDetails selectedGame={state.game} platformConfig={platformConfig} selectedModel={service} />
          ) : (
            state.status === "loading" && (
              <div className="cx-tile cx-loading" role="status">
                <span className="cx-spinner" aria-hidden="true" />
                Fetching game details...
              </div>
            )
          )}

          {state.status === "predicting" && (
            <div className="cx-tile cx-loading" role="status">
              <span className="cx-spinner" aria-hidden="true" />
              {state.message || "Predicting..."}
            </div>
          )}

          {state.status === "error" && (
            <div className="cx-banner" role="alert">
              {state.message}
            </div>
          )}

          {state.status === "ok" && (
            <PredictionResults prediction={state.answer} platformConfig={platformConfig} selectedModel={service} game={state.game} />
          )}

          <div className="cx-sheet-actions">{onward}</div>
        </div>
      </div>
    </div>
  );
}
