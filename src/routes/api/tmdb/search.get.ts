/** @format */

import { createErrorResponse } from "~/utils/utils";

const TMDB_KEYS = ["xxx", "xxx"];

const pickApiKey = () => TMDB_KEYS[Math.floor(Math.random() * TMDB_KEYS.length)];

type RawTmdbResult = {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  popularity?: number;
  vote_average?: number;
};

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawSearch = (query?.q || query?.query || "") as string;
  const searchTerm = typeof rawSearch === "string" ? rawSearch.trim() : "";

  if (!searchTerm || searchTerm.length < 2) {
    return createErrorResponse(
      400,
      "Missing search term",
      "Provide at least two characters to search TMDB titles.",
      "/api/tmdb/search?q=the+martian",
    );
  }

  const locale = typeof query?.language === "string" ? query.language : "en-US";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const tmdbUrl = new URL("https://api.themoviedb.org/3/search/multi");
    tmdbUrl.searchParams.set("query", searchTerm);
    tmdbUrl.searchParams.set("api_key", pickApiKey());
    tmdbUrl.searchParams.set("include_adult", "false");
    tmdbUrl.searchParams.set("language", locale);

    const response = await fetch(tmdbUrl.toString(), { signal: controller.signal });

    if (!response.ok) {
      console.error(`TMDB search failed with status ${response.status}`);
      return createErrorResponse(
        502,
        "TMDB search failed",
        "Unable to fetch search results from TMDB at the moment. Please try again later.",
      );
    }

    const payload = await response.json();
    const rawResults: RawTmdbResult[] = Array.isArray(payload?.results) ? payload.results : [];

    const results = rawResults
      .filter((item) => item && (item.media_type === "movie" || item.media_type === "tv"))
      .slice(0, 10)
      .map((item) => {
        const releaseDate = item.release_date || item.first_air_date || "";
        const releaseYear = releaseDate ? releaseDate.slice(0, 4) : null;

        return {
          id: item.id,
          mediaType: item.media_type,
          title: item.title || item.name || "Untitled",
          originalTitle: item.original_title || item.original_name || null,
          overview: item.overview || "",
          releaseYear,
          poster: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
          backdrop:
            item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : null,
          voteAverage: typeof item.vote_average === "number" ? item.vote_average : null,
          popularity: typeof item.popularity === "number" ? item.popularity : null,
        };
      });

    return new Response(JSON.stringify({ results }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=180, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return createErrorResponse(
        504,
        "TMDB search timeout",
        "The TMDB API took too long to respond. Please try again.",
      );
    }

    console.error("Unexpected TMDB search error", error);
    return createErrorResponse(
      500,
      "Unexpected TMDB error",
      "An unexpected error occurred while contacting TMDB.",
    );
  } finally {
    clearTimeout(timeoutId);
  }
});
