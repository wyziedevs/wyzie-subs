
import { createErrorResponse } from "~/utils/utils";

const TMDB_KEYS = ["xxx", "xxx"];
const pickApiKey = () => TMDB_KEYS[Math.floor(Math.random() * TMDB_KEYS.length)];

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const season = getRouterParam(event, "season");

  if (!id || !season) {
    return createErrorResponse(400, "Missing parameters", "ID and Season number are required");
  }

  const tmdbUrl = `https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${pickApiKey()}`;

  try {
    const response = await fetch(tmdbUrl);
    if (!response.ok) {
      return createErrorResponse(response.status, "TMDB Error", "Failed to fetch season details");
    }
    const data = await response.json();
    return {
      episodes: data.episodes || [],
      season_number: data.season_number,
      id: data._id
    };
  } catch (error) {
    return createErrorResponse(500, "Internal Server Error", "Failed to fetch from TMDB");
  }
});
