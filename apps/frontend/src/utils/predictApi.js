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

// When RAWG is down (it was for days in November 2026), search and game pages
// fall back to /api/games: our own catalogue first, then the Steam store
// (D-058). RAWG gets a few seconds; after it fails, it is skipped for a while
// so every search does not wait on it again.
const RAWG_WAIT_MS = 7000;
const RAWG_REST_MS = 10 * 60 * 1000;
let rawgFailedAt = 0;

async function rawg(url) {
  if (Date.now() - rawgFailedAt < RAWG_REST_MS) throw new Error("RAWG recently unavailable");
  let timer;
  try {
    return await Promise.race([
      apiKeyManager.makeRequest(url, 1),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("RAWG timed out")), RAWG_WAIT_MS);
      }),
    ]);
  } catch (error) {
    rawgFailedAt = Date.now();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fallback(params) {
  const response = await fetch(`/api/games?${new URLSearchParams(params)}`);
  if (!response.ok) throw new Error(`Game lookup failed (${response.status})`);
  return response.json();
}

/** Search results in RAWG's shape: [{ id, name, released, background_image }]. */
/**
 * Search results in RAWG's shape: [{ id, name, released, background_image }].
 * Our own /api/games comes first - the games we already hold, then IGDB, then
 * Steam (D-059) - and RAWG only when that finds nothing.
 */
export async function searchGames(query) {
  if (!String(query).trim()) return [];
  try {
    const data = await fallback({ search: query });
    if (Array.isArray(data.results) && data.results.length) return data.results;
  } catch (error) {
    console.warn("Game search unavailable, trying RAWG:", error.message);
  }
  const data = await rawg(`https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&page_size=5`);
  return data && Array.isArray(data.results) ? data.results : [];
}

async function fromRawg(idOrSlug) {
  let details = await rawg(`https://api.rawg.io/api/games/${idOrSlug}`);
  // A renamed game answers its old slug with {redirect: true, slug: <new>}
  // rather than the game. Followed once, so a link keeps working after RAWG
  // corrects a title.
  if (details?.redirect && details.slug && details.slug !== idOrSlug) {
    details = await rawg(`https://api.rawg.io/api/games/${details.slug}`);
  }
  if (!details?.name) throw new Error("No game details returned");
  return details;
}

async function gameDetailsOf(idOrSlug) {
  const key = String(idOrSlug);
  // A numeric id came from a RAWG search, so only RAWG knows it.
  if (/^\d+$/.test(key)) return fromRawg(key);
  try {
    return await fallback({ id: key });
  } catch (error) {
    // Not one we hold (an old link, say): RAWG, when it is up.
    if (/^(steam|igdb)-\d+$/.test(key)) throw error;
    return fromRawg(key);
  }
}

// RAWG accepts either a numeric id or a slug here, so the same lookup serves
// a search result and a prediction page address.
export async function loadGame(idOrSlug) {
  const gameDetails = await gameDetailsOf(idOrSlug);
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
