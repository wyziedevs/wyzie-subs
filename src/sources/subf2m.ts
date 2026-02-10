/** @format */

import { languageToCountryCode, subDLlanguageToCountryCode } from "~/utils/lookup";
import { getMovieNameFromImdb, numberToOrdinal, extractOrigin } from "~/utils/utils";
import type { RequestType, ResponseType } from "~/utils/types";
import { capitalizeFirstLetter } from "~/utils/utils";
import { proxyFetch } from "~/utils/proxy";
import ISO6391 from "iso-639-1";

interface MovieSearchResult {
  title: string;
  year: number;
  url: string;
  subtitleCount: number;
  score?: number; // Optional score property added during matching
}

// Update the SubtitleEntry interface
interface SubtitleEntry {
  language: string;
  downloadUrl: string;
  releases: string[];
  author: string;
  comment: string;
  rating: "good" | "neutral" | "not rated";
  subtitleDetails?: {
    hearingImpaired: boolean;
  };
}

// Add a function to fetch subtitle details when needed
async function fetchSubtitleDetails(url: string): Promise<SubtitleEntry["subtitleDetails"] | null> {
  try {
    const response = await subf2mFetch(url);
    if (!response.ok) return null;

    const html = await response.text();

    // Extract hearing impaired status
    const hearingImpairedMatch = html.match(/Hearing Impaired:\s*(\w+)/i);
    const hearingImpaired =
      hearingImpairedMatch ? hearingImpairedMatch[1].toLowerCase() === "yes" : false;

    return {
      hearingImpaired,
    };
  } catch (error) {
    console.error(`[Subf2m] ❌ Error fetching subtitle details: ${error}`);
    return null;
  }
}

/**
 * Custom fetch function for subf2m that avoids proxy issues
 * Since subf2m.co rejects the API-Token header from our proxy
 */
async function subf2mFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://subf2m.co/",
    ...options?.headers,
  };

  // Strategy 1: Try direct fetch (might work in some environments)
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    return response;
  } catch (error) {
    // ignore
  }

  // Strategy 2: Try with minimal proxy headers to avoid API-Token rejection
  try {
    const response = await proxyFetch(url, {
      ...options,
      headers: {
        // Send only the most essential headers
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    // Check if we got the API-Token error
    if (response.status === 401) {
      const errorText = await response.text();
      if (errorText.includes("i6.shark detected invalid API-Token header")) {
        throw new Error("API-Token header rejected by subf2m");
      }
      // If it's a different 401 error, return the response to let caller handle it
      return new Response(errorText, { status: 401, statusText: "Unauthorized" });
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Searches for subtitles on Subf2m
 * @param request - The search request parameters
 * @returns Array of subtitle results matching the criteria
 */
export async function searchSubf2m(request: RequestType): Promise<ResponseType[]> {
  try {
    // Extract movie name and year from IMDb ID for search
    const { name, year } = await extractMovieDataFromImdb(request.imdbId!);
    if (!name) {
      return [];
    }

    // Step 1: Enhanced search for the movie/show with season-aware queries
    const searchResults = await searchMoviesEnhanced(name, request.season);
    if (searchResults.length === 0) {
      return [];
    }

    // Step 2: Find the best matching movie/season with enhanced scoring
    const bestMatch = findBestMovieMatch(searchResults, name, request.imdbId, year, request.season);
    if (!bestMatch) {
      return [];
    }

    // Step 3: Fetch subtitles from the movie/season page
    const subtitles = await fetchMovieSubtitles(bestMatch.url);
    if (subtitles.length === 0) {
      return [];
    }

    // Step 4: Filter and format results
    const results = formatSubtitleResults(subtitles, bestMatch, request);

    return results;
  } catch (error) {
    console.error(`[Subf2m] ❌ Search failed: ${error}`);
    return [];
  }
}

/**
 * Extract movie name and year from IMDb ID using TMDb API directly
 */
async function extractMovieDataFromImdb(
  imdbId: string,
): Promise<{ name: string | null; year: number | null }> {
  // Randomly choose between two API keys
  const apiKeys = ["xxx", "xxx"];
  const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

  try {
    // Use TMDb's find endpoint to get movie/TV show data from IMDb ID
    const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    const response = await fetch(findUrl);

    if (!response.ok) {
      throw new Error(`TMDb API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Check for movie results first
    if (data.movie_results && data.movie_results.length > 0) {
      const movie = data.movie_results[0];
      const name = movie.title;
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;
      return { name, year };
    }

    // Check for TV show results
    if (data.tv_results && data.tv_results.length > 0) {
      const tvShow = data.tv_results[0];
      const name = tvShow.name;
      const year = tvShow.first_air_date ? new Date(tvShow.first_air_date).getFullYear() : null;
      return { name, year };
    }

    return { name: null, year: null };
  } catch (error) {
    // Fallback: try the original getMovieNameFromImdb function
    try {
      const movieName = await getMovieNameFromImdb(imdbId);
      if (movieName) {
        // Try to extract year from the movie name if it's included
        const yearMatch = movieName.match(/\((\d{4})\)$/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1], 10);
          const nameWithoutYear = movieName.replace(/\s*\(\d{4}\)$/, "").trim();
          return { name: nameWithoutYear, year };
        }

        return { name: movieName, year: null };
      }
    } catch (fallbackError) {
      // ignore
    }

    // Final fallback: use the IMDB ID directly for search
    return { name: imdbId, year: null };
  }
}

/**
 * Search for movies on Subf2m
 */
async function searchMovies(query: string): Promise<MovieSearchResult[]> {
  const url = `https://subf2m.co/subtitles/searchbytitle?query=${encodeURIComponent(query)}`;

  try {
    const response = await subf2mFetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      return [];
    }

    const html = await response.text();

    const results = parseSearchResults(html);

    return results;
  } catch (error) {
    return [];
  }
}

/**
 * Parse search results HTML to extract movie information
 */
function parseSearchResults(html: string): MovieSearchResult[] {
  const results: MovieSearchResult[] = [];

  // Extract movies from the "Exact" section
  const exactSection = html.match(/<h2 class="exact">Exact<\/h2>\s*<ul>(.*?)<\/ul>/s);
  if (!exactSection) {
    return results;
  }

  // Match each movie item
  const moviePattern =
    /<li>\s*<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>\s*<\/div>\s*<div class="subtle count">\s*(\d+)\s*subtitles\s*<\/div>\s*<\/li>/g;

  let match;
  while ((match = moviePattern.exec(exactSection[1])) !== null) {
    const [, url, titleWithYear, subtitleCount] = match;

    // Extract title and year from formats like "Memento (2000)" or "Movie Title (2021)"
    const titleYearMatch = titleWithYear.trim().match(/^(.+?)\s*\((\d{4})\)\s*$/);
    if (titleYearMatch) {
      const [, title, yearStr] = titleYearMatch;
      const year = parseInt(yearStr, 10);

      results.push({
        title: decodeHtmlEntities(title.trim()),
        year,
        url: url.startsWith("/") ? `https://subf2m.co${url}` : url,
        subtitleCount: parseInt(subtitleCount, 10),
      });
    }
  }

  return results;
}

/**
 * Find the best movie match from search results
 */
function findBestMovieMatch(
  results: MovieSearchResult[],
  searchQuery: string,
  imdbId?: string,
  expectedYear?: number | null,
  season?: number,
): MovieSearchResult | null {
  if (results.length === 0) return null;

  // Score each result based on multiple factors
  const scoredResults = results.map((result) => {
    let score = 0;

    // Factor 1: Exact title match (highest priority)
    const resultTitle = result.title.toLowerCase().trim();
    const queryTitle = searchQuery.toLowerCase().trim();

    if (resultTitle === queryTitle) {
      score += 1000; // Exact match gets highest score
    } else if (resultTitle.includes(queryTitle)) {
      score += 500; // Partial match
    } else if (queryTitle.includes(resultTitle)) {
      score += 300; // Query contains title
    }

    // Factor 2: Enhanced season matching for TV shows
    if (season) {
      // Use enhanced season matching
      if (matchesSeasonInTitle(resultTitle, season)) {
        score += 2000; // Very high score for season match
      } else {
        // Check if it has any season information that doesn't match
        const hasOtherSeasonInfo = [
          /\bs(\d+)\b(?!e)/i, // S1, S2, S3, etc.
          /\bseason\s*(\d+)\b/i, // Season 1, Season 2, etc.
          /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s*season\b/i,
          /\bseason\s*(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/i,
          /\b(\d+)(st|nd|rd|th)\s*season\b/i, // 1st season, 2nd season, etc.
          /\bseries\s*(\d+)\b/i, // Series 1, Series 2, etc.
          /\b(\d+)x\d+\b/i, // 1x01, 2x01, etc. (season indicators)
        ].some((pattern) => {
          const match = resultTitle.match(pattern);
          if (match) {
            // Extract the season number from the match
            const foundSeasonStr = match[1] || match[2];
            if (foundSeasonStr && /^\d+$/.test(foundSeasonStr)) {
              const foundSeason = parseInt(foundSeasonStr, 10);
              return foundSeason !== season;
            }
            // Handle ordinal words
            if (foundSeasonStr) {
              const ordinalMap: Record<string, number> = {
                first: 1,
                second: 2,
                third: 3,
                fourth: 4,
                fifth: 5,
                sixth: 6,
                seventh: 7,
                eighth: 8,
                ninth: 9,
                tenth: 10,
                eleventh: 11,
                twelfth: 12,
              };
              const foundSeason = ordinalMap[foundSeasonStr.toLowerCase()];
              return foundSeason && foundSeason !== season;
            }
          }
          return false;
        });

        if (hasOtherSeasonInfo) {
          score -= 1500; // Heavy penalty for wrong season
        }
      }
    } else {
      // If no season specified, prefer non-season specific results
      const hasSeasonInfo = [
        /\bs\d+\b(?!e)/i, // S1, S2, etc.
        /\bseason\s*\d+\b/i, // Season 1, Season 2, etc.
        /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*season\b/i,
        /\bseason\s*(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i,
        /\b\d+(st|nd|rd|th)\s*season\b/i, // 1st season, 2nd season, etc.
        /\bseries\s*\d+\b/i, // Series 1, Series 2, etc.
      ].some((pattern) => pattern.test(resultTitle));

      if (hasSeasonInfo) {
        score -= 300; // Moderate penalty for season-specific when no season requested
      }
    }

    // Factor 3: Year matching (important if we have expected year)
    if (expectedYear) {
      const yearDiff = Math.abs(result.year - expectedYear);
      if (yearDiff === 0) {
        score += 800; // Exact year match
      } else if (yearDiff <= 1) {
        score += 400; // Very close year
      } else if (yearDiff <= 2) {
        score += 200; // Close year
      } else if (yearDiff >= 10) {
        score -= 300; // Far from expected year
      }
    }

    // Factor 4: Subtitle count (more subtitles usually means more popular/main entry)
    score += Math.min(result.subtitleCount, 500); // Cap at 500 to prevent dominance

    // Factor 5: Avoid derivative works
    if (
      resultTitle.includes("chronological") ||
      resultTitle.includes("edition") ||
      resultTitle.includes("extended")
    ) {
      score -= 100; // Penalize special editions unless they're the only match
    }

    // Factor 6: Year preference (prefer movies from reasonable time periods)
    if (result.year >= 1990 && result.year <= 2025) {
      score += 50; // Prefer modern movies
    }

    // Factor 7: Penalize very old or very new results unless they're exact matches
    if (result.year < 1970 || result.year > 2030) {
      if (score < 1000) {
        // Don't penalize exact matches
        score -= 100;
      }
    }

    return { ...result, score };
  });

  // Sort by score (highest first)
  const sorted = scoredResults.sort((a, b) => b.score - a.score);

  const bestMatch = sorted[0];

  return bestMatch;
}

/**
 * Fetch subtitles from a movie detail page
 */
async function fetchMovieSubtitles(movieUrl: string): Promise<SubtitleEntry[]> {
  const response = await subf2mFetch(movieUrl);

  if (!response.ok) {
    throw new Error(`Movie page request failed with status ${response.status}`);
  }

  const html = await response.text();
  const subtitles = parseMovieSubtitles(html);

  // Optional: Fetch details for subtitles that may be hearing impaired
  // Note: This would make multiple requests, so it might be better to do selectively
  for (const subtitle of subtitles) {
    if (
      subtitle.releases.some((r) => /\b(hi|hearing.impaired|sdh)\b/i.test(r)) ||
      /\b(hi|hearing.impaired|sdh)\b/i.test(subtitle.comment)
    ) {
      subtitle.subtitleDetails = await fetchSubtitleDetails(subtitle.downloadUrl);
    }
  }

  return subtitles;
}

/**
 * Parse movie page HTML to extract subtitle information
 */
function parseMovieSubtitles(html: string): SubtitleEntry[] {
  const subtitles: SubtitleEntry[] = [];

  // Try multiple patterns to find the subtitle list with more robust extraction
  const patterns = [
    // Pattern 1: Standard double quotes
    /<ul class="sublist larglist">(.*?)<\/ul>/s,
    // Pattern 2: Single quotes
    /<ul class='sublist larglist'>(.*?)<\/ul>/s,
    // Pattern 3: More flexible pattern
    /<ul[^>]*class=[^>]*sublist[^>]*>(.*?)<\/ul>/s,
    // Pattern 4: Even more flexible - handle spacing issues
    /<ul[^>]*sublist[^>]*larglist[^>]*>(.*?)<\/ul>/s,
  ];

  let subtitleListMatch = null;
  let patternUsed = -1;

  for (let i = 0; i < patterns.length; i++) {
    subtitleListMatch = html.match(patterns[i]);
    if (subtitleListMatch) {
      patternUsed = i;
      break;
    }
  }

  if (!subtitleListMatch) {
    return subtitles;
  }

  const listContent = subtitleListMatch[1];

  // If the content is suspiciously short, let's try a different approach
  if (listContent.length < 1000) {
    // Strategy 1: Look for the subtitle list with a broader search
    const broadPattern = /class=['"]sublist larglist['"][^>]*>(.*?)(?=<\/ul>|<div class=['"]|$)/s;
    const broadMatch = html.match(broadPattern);

    if (broadMatch && broadMatch[1].length > listContent.length) {
      const broadContent = broadMatch[1];
      return parseSubtitleItems(broadContent, subtitles);
    }

    // Strategy 2: Find the entire subtitles section using manual parsing to handle nested elements
    const itemStartPattern = /<li class=['"]item[^>]*>/g;
    const allSubtitleItems = [];
    let match;

    while ((match = itemStartPattern.exec(html)) !== null) {
      const startPos = match.index;

      // Find the matching closing </li> by tracking nesting depth
      let depth = 1;
      let pos = startPos + match[0].length;
      let content = match[0];

      while (pos < html.length && depth > 0) {
        const nextOpenLi = html.indexOf("<li", pos);
        const nextCloseLi = html.indexOf("</li>", pos);

        if (nextCloseLi === -1) {
          // No more closing tags, take everything to the end or next item
          const nextItemStart = html.indexOf('<li class="item', pos);
          const endPos = nextItemStart !== -1 ? nextItemStart : html.length;
          content += html.substring(pos, endPos);
          break;
        }

        if (nextOpenLi !== -1 && nextOpenLi < nextCloseLi) {
          // Found opening li tag first
          content += html.substring(pos, nextOpenLi + 3);
          depth++;
          pos = nextOpenLi + 3;
        } else {
          // Found closing li tag
          content += html.substring(pos, nextCloseLi + 5);
          depth--;
          pos = nextCloseLi + 5;
        }
      }

      allSubtitleItems.push(content);
    }

    if (allSubtitleItems && allSubtitleItems.length > 0) {
      const combinedContent = allSubtitleItems.join("\n\n");
      return parseSubtitleItems(combinedContent, subtitles);
    }

    // Strategy 3: Look for the content between <ul class="sublist larglist"> and the first non-subtitle content
    const detailedPattern =
      /<ul class=['"]sublist larglist['"][^>]*>(.*?)(?=<div[^>]*(?:ads|fixed)|<\/div>|$)/s;
    const detailedMatch = html.match(detailedPattern);

    if (detailedMatch && detailedMatch[1].length > listContent.length) {
      return parseSubtitleItems(detailedMatch[1], subtitles);
    }

    // Strategy 4: Extract everything between the first <li class="item"> and the last </li>
    const firstItemIndex = html.indexOf('<li class="item');
    const lastLiIndex = html.lastIndexOf("</li>");

    if (firstItemIndex !== -1 && lastLiIndex !== -1 && lastLiIndex > firstItemIndex) {
      const extractedContent = html.substring(firstItemIndex, lastLiIndex + 5);

      if (extractedContent.length > listContent.length) {
        return parseSubtitleItems(extractedContent, subtitles);
      }
    }

    // Strategy 5: Debug - show us what the div actually contains
    const divPattern = /<div class=['"]subtitles-list['"]>(.*?)<\/div>/s;
    const divMatch = html.match(divPattern);

    if (divMatch) {
      // Look specifically within this div for the ul with subtitle content
      const ulPattern = /<ul class=['"]sublist larglist['"][^>]*>(.*?)<\/ul>/s;
      const ulMatch = divMatch[1].match(ulPattern);

      if (ulMatch) {
        if (ulMatch[1].length > listContent.length && ulMatch[1].includes("li class")) {
          return parseSubtitleItems(ulMatch[1], subtitles);
        }
      }
    }
  }

  return parseSubtitleItems(listContent, subtitles);
}

/**
 * Parse subtitle items from the extracted list content
 */
function parseSubtitleItems(listContent: string, subtitles: SubtitleEntry[]): SubtitleEntry[] {
  if (listContent.length === 0) {
    return subtitles;
  }

  // Split by <li class="item"> and process each section
  const itemSeparator = /<li class=['"]item[^'"]*['"][^>]*>/g;
  const matches = [];
  let match;

  // Find all starting positions
  while ((match = itemSeparator.exec(listContent)) !== null) {
    matches.push({
      start: match.index,
      fullMatch: match[0],
    });
  }

  if (matches.length === 0) {
    return subtitles;
  }

  // Extract content for each item (from start of one to start of next, or end of content)
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = i < matches.length - 1 ? matches[i + 1] : null;

    const startPos = currentMatch.start;
    const endPos = nextMatch ? nextMatch.start : listContent.length;

    let itemContent = listContent.substring(startPos, endPos);

    if (itemContent.length < 50) {
      continue;
    }

    try {
      // Extract language from span with class "language" - get the text content, not the class
      const langMatch = itemContent.match(
        /<span class=['"][^'"]*language[^'"]*['"]>([^<]+)<\/span>/,
      );
      if (!langMatch) {
        continue;
      }

      const language = decodeHtmlEntities(langMatch[1].trim());

      // Extract download URL - look for href="/subtitles/..." pattern
      let downloadUrl = null;

      // Pattern 1: Look for the download link with class "download"
      const downloadMatch = itemContent.match(
        /<a[^>]*class=['"][^'"]*download[^'"]*['"][^>]*href=['"]([^'"]+)['"][^>]*>/,
      );
      if (downloadMatch) {
        downloadUrl = downloadMatch[1];
      }

      // Pattern 2: Look for any href that contains subtitles path
      if (!downloadUrl) {
        const subtitleHrefMatch = itemContent.match(/href=['"]([^'"]*\/subtitles\/[^'"]+)['"]/);
        if (subtitleHrefMatch) {
          downloadUrl = subtitleHrefMatch[1];
        }
      }

      if (!downloadUrl) {
        continue;
      }

      // Ensure URL is absolute
      const fullDownloadUrl =
        downloadUrl.startsWith("/") ? `https://subf2m.co${downloadUrl}` : downloadUrl;

      // Extract releases/compatibility info from the scrolllist
      const releases: string[] = [];
      const scrollListPattern = /<ul class=['"]scrolllist['"]>(.*?)<\/ul>/s;
      const scrollListMatch = itemContent.match(scrollListPattern);

      if (scrollListMatch) {
        const releasePattern = /<li>([^<]+)<\/li>/g;
        let releaseMatch;
        while ((releaseMatch = releasePattern.exec(scrollListMatch[1])) !== null) {
          // Decode HTML entities
          const release = decodeHtmlEntities(releaseMatch[1].trim());
          releases.push(release);
        }
      }

      // Extract author from the "By" section
      const authorMatch = itemContent.match(/<b>By <a[^>]*>([^<]+)<\/a><\/b>/);
      const author = authorMatch ? decodeHtmlEntities(authorMatch[1].trim()) : "Unknown";

      // Extract comment from the paragraph tag
      const commentMatch = itemContent.match(/<p>([^<]*)<\/p>/);
      const comment = commentMatch ? decodeHtmlEntities(commentMatch[1].trim()) : "";

      // Extract rating from span with class "rate"
      let rating: "good" | "neutral" | "not rated" = "not rated";
      if (itemContent.includes("class='rate good'") || itemContent.includes('class="rate good"')) {
        rating = "good";
      } else if (
        itemContent.includes("class='rate neutral'") ||
        itemContent.includes('class="rate neutral"')
      ) {
        rating = "neutral";
      }

      subtitles.push({
        language,
        downloadUrl: fullDownloadUrl,
        releases,
        author,
        comment,
        rating,
      });
    } catch (error) {
      console.error(`[Subf2m] ❌ Error parsing subtitle item ${i + 1}:`, error);
      continue;
    }
  }

  return subtitles;
}

/**
 * Decode HTML entities in text content
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

/**
 * Format subtitle results according to the expected ResponseType structure
 */
function formatSubtitleResults(
  subtitles: SubtitleEntry[],
  movie: MovieSearchResult,
  request: RequestType,
): ResponseType[] {
  const results: ResponseType[] = [];

  for (const subtitle of subtitles) {
    // Convert language name to ISO code
    const langCode = getLanguageCode(subtitle.language);

    // Apply language filter
    if (request.languages && request.languages.length > 0) {
      if (!request.languages.includes(langCode)) {
        continue;
      }
    }

    // Apply format filter (assume SRT format for subf2m)
    const format = "srt";
    if (request.formats && request.formats.length > 0) {
      if (!request.formats.includes(format)) {
        continue;
      }
    }

    // Enhanced TV show episode filtering
    if (request.season && request.episode) {
      // First, check if this subtitle matches our specific episode
      const allReleaseText = subtitle.releases.join(" ") + " " + subtitle.comment;
      const hasCorrectEpisode = matchesEpisodeInContent(
        allReleaseText,
        request.season,
        request.episode,
      );

      // Also check if it contains wrong season/episode info that would exclude it
      const hasWrongEpisode = containsWrongSeasonEpisode(
        allReleaseText,
        request.season,
        request.episode,
      );

      if (!hasCorrectEpisode || hasWrongEpisode) {
        // Additional fallback: check if at least one release mentions the correct episode
        const hasBasicEpisodeMatch =
          subtitle.releases.some((release) => {
            const episodePatterns = createEpisodePatterns(request.season, request.episode);
            return episodePatterns.some((pattern) => pattern.test(release));
          }) ||
          createEpisodePatterns(request.season, request.episode).some((pattern) =>
            pattern.test(subtitle.comment),
          );

        if (!hasBasicEpisodeMatch) {
          // Skip if this subtitle doesn't match the requested episode
          continue;
        }
      }
    }

    // Generate flag URL
    const countryCode = languageToCountryCode[langCode] || langCode.toUpperCase();
    const flagUrl = `https://flagsapi.com/${countryCode}/flat/24.png`;

    // Parse the subf2m download URL to extract movie slug, language, and ID
    // Expected format: https://subf2m.co/subtitles/{movie-slug}/{language}/{id}
    let movieSlug = "";
    let languageSlug = "";
    let subtitleId = "";

    const urlMatch = subtitle.downloadUrl.match(/\/subtitles\/([^\/]+)\/([^\/]+)\/(\d+)$/);
    if (urlMatch) {
      movieSlug = urlMatch[1];
      languageSlug = urlMatch[2];
      subtitleId = urlMatch[3];
    } else {
      // Try TV show pattern: /subtitles/{show-slug}/season-{season}/episode-{episode}/{language}/{id}
      const tvShowMatch = subtitle.downloadUrl.match(
        /\/subtitles\/([^\/]+)\/season-(\d+)\/episode-(\d+)\/([^\/]+)\/(\d+)$/,
      );
      if (tvShowMatch) {
        const [, showSlug, seasonNum, episodeNum, langSlug, subId] = tvShowMatch;
        movieSlug = `${showSlug}-s${seasonNum}e${episodeNum}`;
        languageSlug = langSlug;
        subtitleId = subId;
      } else {
        // Fallback: generate from available data
        subtitleId = Date.now().toString();
        movieSlug = movie.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        languageSlug = subtitle.language.toLowerCase().replace(/[^a-z0-9]/g, "-");
      }
    }

    // Create compatible URL that encodes the subf2m path structure
    // Format: subf2m/{movieSlug}~{languageSlug}~{subtitleId}/{filename}
    const encodedPath = `${movieSlug}~${languageSlug}~${subtitleId}`;
    const cleanFilename = movie.title.replace(/[^a-zA-Z0-9]/g, "-");
    const compatibleUrl = `subf2m/${encodedPath}/${cleanFilename}`;

    // Create media display name with proper HTML entity decoding and consistent formatting
    const baseTitle = decodeHtmlEntities(movie.title);
    let mediaDisplay = baseTitle;
    if (
      request.season !== undefined &&
      request.season !== null &&
      request.episode !== undefined &&
      request.episode !== null
    ) {
      mediaDisplay = `${baseTitle} - S${request.season.toString().padStart(2, "0")}E${request.episode.toString().padStart(2, "0")}`;
    } else if (request.season !== undefined && request.season !== null) {
      mediaDisplay = `${baseTitle} - Season ${request.season}`;
    }

    // Create display name using clean language label only
    const languageLabel = decodeHtmlEntities(subtitle.language).trim();
    const mappedLanguageName = subDLlanguageToCountryCode[langCode]?.name;
    const rawDisplayName =
      languageLabel.length > 0 ? languageLabel
      : mappedLanguageName ? mappedLanguageName
      : langCode;
    const displayName =
      rawDisplayName.length > 0 ?
        capitalizeFirstLetter(rawDisplayName)
      : capitalizeFirstLetter(langCode);

    // Detect hearing impaired status from releases, comments, or subtitle details page
    const isHearingImpaired = !!(
      subtitle.releases.some((release) =>
        /\b(hi|hearing.impaired|sdh|cc|closed.caption)\b/i.test(release),
      ) ||
      /\b(hi|hearing.impaired|sdh|cc|closed.caption)\b/i.test(subtitle.comment) ||
      (subtitle.subtitleDetails && subtitle.subtitleDetails.hearingImpaired === true)
    );

    const normalizedReleases = subtitle.releases
      .map((release) => release?.trim())
      .filter((release): release is string => Boolean(release && release.length > 0));

    const origin =
      normalizedReleases.length ?
        (normalizedReleases.map((r) => extractOrigin(r)).find((o) => o) ?? null)
      : null;

    results.push({
      id: subtitleId,
      url: compatibleUrl,
      flagUrl: flagUrl,
      format: format,
      encoding: "UTF-8",
      display: displayName,
      language: langCode,
      media: mediaDisplay,
      isHearingImpaired: isHearingImpaired,
      source: "subf2m",
      release: normalizedReleases[0] ?? null,
      releases: normalizedReleases,
      origin,
      fileName: null,
    });
  }

  return results;
}

/**
 * Convert language name to ISO 639-1 code using lookup tables and smart matching
 */
function getLanguageCode(languageName: string): string {
  const lowerLangName = languageName.toLowerCase().trim();

  // Create reverse lookup map from subDLlanguageToCountryCode for language names
  const createLanguageNameMap = () => {
    const nameToCodeMap: Record<string, string> = {};

    // Add entries from subDLlanguageToCountryCode
    Object.entries(subDLlanguageToCountryCode).forEach(([code, info]) => {
      nameToCodeMap[info.name.toLowerCase()] = code;
      // Also add simplified versions
      nameToCodeMap[info.name.toLowerCase().split(";")[0].trim()] = code;
      nameToCodeMap[info.name.toLowerCase().split(",")[0].trim()] = code;
    });

    // Add entries from languageToCountryCode keys (these are already language codes)
    Object.keys(languageToCountryCode).forEach((code) => {
      nameToCodeMap[code] = code;
    });

    // Custom overrides for problematic languages
    nameToCodeMap["farsi"] = "fa";
    nameToCodeMap["brazilian"] = "pb";
    nameToCodeMap["brazilian portuguese"] = "pb";
    nameToCodeMap["portuguese (brazil)"] = "pb";

    return nameToCodeMap;
  };

  const languageNameMap = createLanguageNameMap();

  // 1. Check if it's already a language code (2-letter)
  if (lowerLangName.length === 2 && languageToCountryCode[lowerLangName]) {
    return lowerLangName;
  }

  // 2. Check language name mappings from lookup tables
  if (languageNameMap[lowerLangName]) {
    return languageNameMap[lowerLangName];
  }

  // 3. Try partial matching for compound language names
  const partialMatches = [
    // Try first word
    lowerLangName.split(" ")[0],
    lowerLangName.split("/")[0],
    lowerLangName.split(",")[0],
    lowerLangName.split("(")[0].trim(),
    // Try removing common suffixes
    lowerLangName.replace(/\s*\(.*\)$/, ""), // Remove parentheses content
    lowerLangName.replace(/\s*subtitles?$/, ""), // Remove "subtitle(s)"
    lowerLangName.replace(/\s*subs?$/, ""), // Remove "sub(s)"
  ];

  for (const partial of partialMatches) {
    const cleanPartial = partial.trim();
    if (cleanPartial && languageNameMap[cleanPartial]) {
      return languageNameMap[cleanPartial];
    }
  }

  // 4. Try ISO6391 lookup as fallback
  try {
    const isoCode = ISO6391.getCode(lowerLangName);
    if (isoCode) {
      return isoCode.toLowerCase();
    }
  } catch (error) {
    // ISO6391 might throw on invalid input
  }

  // 5. Default to unknown if nothing matches
  console.warn(`[Subf2m] ⚠️  Unknown language: "${languageName}", defaulting to "unknown"`);
  return "unknown";
}

/**
 * more better season matching patterns
 */
function createSeasonPatterns(season: number): RegExp[] {
  const ordinalSeason = numberToOrdinal(season).toLowerCase();
  const seasonPatterns = [
    // some standard patterns: S01, Season 1, Season 01
    new RegExp(`\\bs0*${season}\\b(?!e)`, "i"),
    new RegExp(`\\bseason\\s*0*${season}\\b(?!\\s*episode)`, "i"),

    // ordinal  patterns: First Season, 1st Season, etc.
    new RegExp(`\\b${ordinalSeason}\\s*season\\b`, "i"),
    new RegExp(`\\bseason\\s*${ordinalSeason}\\b`, "i"),

    // some other  formats
    new RegExp(`\\bs${season}\\b(?!e)`, "i"), // S1 (without leading zero)
    new RegExp(`\\bseries\\s*0*${season}\\b`, "i"), // Series 1, Series 01

    // numerical  ordinal patterns: 1st, 2nd, 3rd, etc.
    new RegExp(`\\b${season}${getOrdinalSuffix(season)}\\s*season\\b`, "i"),
    new RegExp(`\\bseason\\s*${season}${getOrdinalSuffix(season)}\\b`, "i"),

    // some other  formats
    new RegExp(`\\b${season}x\\b`, "i"), // Format like "1x" (season indicator)
  ];

  return seasonPatterns;
}

/**
 * more better episode matching patterns
 */
function createEpisodePatterns(season: number, episode: number): RegExp[] {
  const episodePatterns = [
    // some standard patterns: S01E01, S01E02, etc.
    new RegExp(`\\bs0*${season}e0*${episode}\\b`, "i"),
    new RegExp(`\\bs${season}e${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\bs0*${season}[-_\\.]e?0*${episode}\\b`, "i"),
    new RegExp(`\\bs0*${season}\\s*e\\s*0*${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\b0*${season}x0*${episode}\\b`, "i"),
    new RegExp(`\\bseason\\s*0*${season}\\s*episode\\s*0*${episode}\\b`, "i"),
    new RegExp(`\\bs0*${season}\\s*ep\\s*0*${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\b0*${season}\\.0*${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\bs\\s*0*${season}\\s*e\\s*0*${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\bepisode\\s*0*${episode}\\b`, "i"),
    new RegExp(`\\bep\\.?\\s*0*${episode}\\b`, "i"),
    new RegExp(`\\be0*${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\bpart\\s*0*${episode}\\b`, "i"),
    new RegExp(`\\bpt\\.?\\s*0*${episode}\\b`, "i"),

    // some other  formats
    new RegExp(`\\b${numberToOrdinal(episode).toLowerCase()}\\s*episode\\b`, "i"),
    new RegExp(`\\bepisode\\s*${numberToOrdinal(episode).toLowerCase()}\\b`, "i"),

    // some other  formats
    new RegExp(`\\b${episode}${getOrdinalSuffix(episode)}\\s*episode\\b`, "i"),
    new RegExp(`\\bepisode\\s*${episode}${getOrdinalSuffix(episode)}\\b`, "i"),

    // some other  formats
    new RegExp(`\\bchapter\\s*0*${episode}\\b`, "i"),
    new RegExp(`\\bch\\.?\\s*0*${episode}\\b`, "i"),
  ];

  return episodePatterns;
}

/**
 *  ordinal suffix for numbers (1st, 2nd, 3rd, 4th, etc.)
 */
function getOrdinalSuffix(num: number): string {
  const lastTwoDigits = num % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return "th";
  }

  const lastDigit = num % 10;
  switch (lastDigit) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 *  season matching for search results
 */
function matchesSeasonInTitle(title: string, season: number): boolean {
  const seasonPatterns = createSeasonPatterns(season);
  return seasonPatterns.some((pattern) => pattern.test(title));
}

/**
 *  episode matching for subtitle releases
 */
function matchesEpisodeInContent(content: string, season: number, episode: number): boolean {
  const episodePatterns = createEpisodePatterns(season, episode);
  return episodePatterns.some((pattern) => pattern.test(content));
}

/**
 * checker of wrong season/episode information
 */
function containsWrongSeasonEpisode(content: string, season: number, episode: number): boolean {
  const wrongSeasonPatterns = [
    /\bs(\d+)e\d+\b/gi, // S02E01, S03E05, etc.
    /\b(\d+)x\d+\b/gi, // 2x01, 3x05, etc.
    /\bseason\s*(\d+)\s*episode\s*\d+\b/gi,
  ];

  for (const pattern of wrongSeasonPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const seasonMatch = match.match(/(\d+)/);
        if (seasonMatch) {
          const foundSeason = parseInt(seasonMatch[1], 10);
          if (foundSeason !== season && foundSeason > 0) {
            return true; // Found a different season
          }
        }
      }
    }
  }

  const wrongEpisodePatterns = [
    new RegExp(`\\bs0*${season}e(\\d+)\\b`, "gi"),
    new RegExp(`\\b${season}x(\\d+)\\b`, "gi"),
    new RegExp(`\\bseason\\s*${season}\\s*episode\\s*(\\d+)\\b`, "gi"),
  ];

  for (const pattern of wrongEpisodePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const episodeMatch = match.match(/(\d+)$/);
        if (episodeMatch) {
          const foundEpisode = parseInt(episodeMatch[1], 10);
          if (foundEpisode !== episode && foundEpisode > 0) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function generateTvSearchQueries(name: string, season?: number): string[] {
  const queries = [name]; // Always include the base name

  if (season) {
    const ordinalSeason = numberToOrdinal(season).toLowerCase();

    // Add various season-specific search formats
    queries.push(
      `${name} season ${season}`,
      `${name} s${season}`,
      `${name} s${season.toString().padStart(2, "0")}`,
      `${name} ${ordinalSeason} season`,
      `${name} season ${ordinalSeason}`,
      `${name} series ${season}`,
    );

    // for first season, also try without season specifier as it might be just the show name
    if (season === 1) {
      queries.unshift(name);
    }
  }

  return queries;
}

async function searchMoviesEnhanced(name: string, season?: number): Promise<MovieSearchResult[]> {
  const searchQueries = generateTvSearchQueries(name, season);
  const allResults: MovieSearchResult[] = [];
  const seenUrls = new Set<string>();

  // try each search query and collect unique results
  for (const query of searchQueries) {
    try {
      const results = await searchMovies(query);

      // Filter out duplicates based on URL
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }

      // If we found good season-specific results, prioritize them
      if (season && results.length > 0) {
        const seasonMatches = results.filter((result) =>
          matchesSeasonInTitle(result.title, season),
        );
        if (seasonMatches.length > 0) {
          // Move season matches to the front
          const nonSeasonMatches = allResults.filter(
            (result) => !matchesSeasonInTitle(result.title, season),
          );
          return [...seasonMatches, ...nonSeasonMatches];
        }
      }
    } catch (error) {
      console.error(`[Subf2m] ❌ Search failed for query "${query}":`, error);
      continue;
    }
  }

  return allResults;
}
