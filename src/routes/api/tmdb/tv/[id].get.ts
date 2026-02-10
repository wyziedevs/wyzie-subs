
import { createErrorResponse } from "~/utils/utils";

const TMDB_KEYS = ["xxx", "xxx"];
const pickApiKey = () => TMDB_KEYS[Math.floor(Math.random() * TMDB_KEYS.length)];

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    return createErrorResponse(400, "Missing ID", "TV Show ID is required");
  }

  const tmdbUrl = `https://api.themoviedb.org/3/tv/${id}?api_key=${pickApiKey()}`;

  try {
    const response = await fetch(tmdbUrl);
    if (!response.ok) {
      return createErrorResponse(response.status, "TMDB Error", "Failed to fetch TV show details");
    }
    const data = await response.json();
    return {
      seasons: data.seasons || [],
      name: data.name,
      id: data.id
    };
  } catch (error) {
    return createErrorResponse(500, "Internal Server Error", "Failed to fetch from TMDB");
  }
});
