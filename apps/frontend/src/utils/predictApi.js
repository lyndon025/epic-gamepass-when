import axios from "axios";
import apiKeyManager from "./apiKeyManager";

// Looking up a game and predicting it, shared by the home page and the
// Rankings page's prediction panel so both do it the same way.

// Staged messages, so a slow cold start reads as progress instead of a hang.
// Naming the reason matters more than the wording: people wait happily for a
// delay they understand, and bail on a silent spinner.
export const LOADING_STAGES = [
  [3000, "Checking historical records..."],
  [10000, "Waking up the prediction service - the first request can take up to a minute."],
  [25000, "Still working. The service sleeps when idle to keep this site free, so it should answer shortly."],
];

// RAWG accepts either a numeric id or a slug here, so the same lookup serves
// a search result and a prediction page address.
export async function loadGame(idOrSlug) {
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
}

/** One game's answer on one service, from /api/predict. */
export async function requestPrediction(game, model) {
  const platformsData =
    Array.isArray(game.platforms) && game.platforms.length > 0 ? game.platforms : null;

  const response = await axios.post(`/api/predict`, {
    slug: game.slug || null,
    game_name: game.name,
    publisher: game.publisher,
    metacritic_score: game.metacritic,
    platform: model,
    platforms: platformsData,
    release_date: game.released,
  }, {
    timeout: 120000 // 2 minutes timeout for cold starts
  });
  return response.data;
}

/** What to tell the visitor when a prediction fails. */
export function predictionError(error) {
  if (error.response) {
    console.error("Backend error:", error.response.data);
    return `Error: ${error.response.data?.error || "Error making prediction"}`;
  }
  if (error.code === "ECONNABORTED") {
    return "That took too long, so we stopped waiting. The prediction service was most likely still starting up - it should be awake now, so trying again usually works.";
  }
  return "Error making prediction. Check console for details.";
}
