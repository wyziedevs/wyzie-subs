/** @format */

import numberToWords from "number-to-words";
import type { ResponseType } from "~/utils/types";

const { toWords } = numberToWords;

const TMDB_API_KEYS = ["xxx", "xxx"];

function pickTmdbApiKey(): string {
  return TMDB_API_KEYS[Math.floor(Math.random() * TMDB_API_KEYS.length)];
}

const encodingSuffixPattern =
  /-(?<encoding>(?:utf|iso|windows|cp|mac|ansi|koi|shift|big5|euc|unicode)[^.]+)$/i;

const formatAliasMap: Record<string, string> = {
  subrip: "srt",
  srt: "srt",
  microdvd: "sub",
  vobsub: "sub",
  mpl2: "txt",
  tmplayer: "txt",
  subviewer: "sub",
  subviewer2: "sub",
  ass: "ass",
  ssa: "ssa",
  ssa2: "ssa",
  webvtt: "vtt",
  vtt: "vtt",
  pgs: "sup",
  sup: "sup",
  idx: "idx",
  dvbsub: "dvb",
  txt: "txt",
};

export function readPositiveIntEnv(envKey: string, defaultValue: number): number {
  if (typeof process === "undefined" || !process?.env) {
    return defaultValue;
  }

  const rawValue = process.env[envKey];
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Get movie/TV show details from TMDb API including title and IMDB ID
 */
export const getMovieDetails = async (tmdbId: string, mediaType: "movie" | "tv" = "movie") => {
  const apiKey = pickTmdbApiKey();

  try {
    // Get basic details
    const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}`;
    const detailsResponse = await fetch(detailsUrl);

    if (!detailsResponse.ok) {
      throw new Error(`HTTP error! status: ${detailsResponse.status}`);
    }

    const detailsData = await detailsResponse.json();

    // Get external IDs (including IMDB ID)
    const externalIdsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${apiKey}`;
    const externalIdsResponse = await fetch(externalIdsUrl);

    if (!externalIdsResponse.ok) {
      throw new Error(`HTTP error! status: ${externalIdsResponse.status}`);
    }

    const externalIdsData = await externalIdsResponse.json();

    return {
      title: mediaType === "movie" ? detailsData.title : detailsData.name,
      originalTitle: mediaType === "movie" ? detailsData.original_title : detailsData.original_name,
      year:
        mediaType === "movie" ?
          new Date(detailsData.release_date).getFullYear()
        : new Date(detailsData.first_air_date).getFullYear(),
      imdbId: externalIdsData.imdb_id,
      overview: detailsData.overview,
      posterPath: detailsData.poster_path,
    };
  } catch (e) {
    console.error(`Error fetching movie details: ${e}`);
    throw e;
  }
};

const imdbTitleCache = new Map<string, string | null>();

/**
 * Get movie name from IMDB ID using TMDb API
 */
export const getMovieNameFromImdb = async (imdbId: string): Promise<string | null> => {
  if (imdbTitleCache.has(imdbId)) {
    return imdbTitleCache.get(imdbId) ?? null;
  }

  const apiKey = pickTmdbApiKey();

  try {
    // Try movie first
    let findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    const response = await fetch(findUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Check for movie results
    if (data.movie_results && data.movie_results.length > 0) {
      const title = data.movie_results[0].title;
      imdbTitleCache.set(imdbId, title);
      return title;
    }

    // Check for TV show results
    if (data.tv_results && data.tv_results.length > 0) {
      const name = data.tv_results[0].name;
      imdbTitleCache.set(imdbId, name);
      return name;
    }

    console.warn(`No movie/TV show found for IMDB ID: ${imdbId}`);
    imdbTitleCache.set(imdbId, null);
    return null;
  } catch (e) {
    console.error(`Error getting movie name from IMDB: ${e}`);
    imdbTitleCache.delete(imdbId);
    return null;
  }
};

export interface TvIdentifierResult {
  tmdbId: number | null;
  tvdbId: number | null;
  name: string | null;
  firstAirDate: string | null;
}

export const getTvIdentifiersFromImdb = async (imdbId: string): Promise<TvIdentifierResult> => {
  if (!imdbId) {
    return { tmdbId: null, tvdbId: null, name: null, firstAirDate: null };
  }

  const apiKey = pickTmdbApiKey();

  try {
    const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    const response = await fetch(findUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const tvResults = Array.isArray(data.tv_results) ? data.tv_results : [];

    if (tvResults.length === 0) {
      return { tmdbId: null, tvdbId: null, name: null, firstAirDate: null };
    }

    const primary = tvResults[0];
    const tmdbId = typeof primary.id === "number" ? primary.id : null;
    let tvdbId: number | null = null;

    if (tmdbId !== null) {
      try {
        const externalIdsUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${apiKey}`;
        const externalIdsResponse = await fetch(externalIdsUrl);

        if (externalIdsResponse.ok) {
          const externalIdsData = await externalIdsResponse.json();
          if (typeof externalIdsData.tvdb_id === "number") {
            tvdbId = externalIdsData.tvdb_id;
          } else if (typeof externalIdsData.tvdb_id === "string") {
            const parsed = Number.parseInt(externalIdsData.tvdb_id, 10);
            tvdbId = Number.isNaN(parsed) ? null : parsed;
          }
        } else {
          console.warn(
            `[TMDB] Failed to fetch external IDs for TMDB ID ${tmdbId}: ${externalIdsResponse.status} ${externalIdsResponse.statusText}`,
          );
        }
      } catch (externalError) {
        console.error(`[TMDB] Error retrieving external IDs for TMDB ID ${tmdbId}:`, externalError);
      }
    }

    return {
      tmdbId,
      tvdbId,
      name: typeof primary.name === "string" ? primary.name : null,
      firstAirDate: typeof primary.first_air_date === "string" ? primary.first_air_date : null,
    };
  } catch (error) {
    console.error(`[TMDB] Error resolving TV identifiers for IMDb ID ${imdbId}:`, error);
    return { tmdbId: null, tvdbId: null, name: null, firstAirDate: null };
  }
};

export function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function extractFilenameFromDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const filenameStarMatch = contentDisposition.match(/filename\*=([^;]+)/i);
  if (filenameStarMatch && filenameStarMatch[1]) {
    const rawValue = stripWrappingQuotes(filenameStarMatch[1].trim());
    const withoutPrefix = rawValue.replace(/^utf-8''/i, "");
    try {
      return stripWrappingQuotes(decodeURIComponent(withoutPrefix));
    } catch {
      return stripWrappingQuotes(withoutPrefix);
    }
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (filenameMatch && filenameMatch[1]) {
    return stripWrappingQuotes(filenameMatch[1]);
  }

  return null;
}

export function parseFormatAndEncodingFromFilename(filename: string | null): {
  format: string | null;
  encoding: string | null;
} {
  if (!filename) {
    return { format: null, encoding: null };
  }

  const normalized = filename.split("/").pop()?.trim();
  if (!normalized) {
    return { format: null, encoding: null };
  }

  const withoutExtension = normalized.replace(/\.[^.]+$/, "");
  const encodingMatch = encodingSuffixPattern.exec(withoutExtension);

  let encoding: string | null = null;
  let beforeEncoding = withoutExtension;

  if (encodingMatch && encodingMatch.groups?.encoding) {
    encoding = encodingMatch.groups.encoding;
    const matchIndex = encodingMatch.index ?? withoutExtension.lastIndexOf(encodingMatch[0]);
    if (matchIndex >= 0) {
      beforeEncoding = withoutExtension.slice(0, matchIndex);
    }
  }

  let format: string | null = null;
  if (beforeEncoding) {
    const formatMatch = beforeEncoding.match(/-([^\-\s]+)$/);
    if (formatMatch && formatMatch[1]) {
      format = formatMatch[1];
    }
  }

  return { format, encoding };
}

export function normalizeFormatName(formatRaw: string | null | undefined): string | null {
  if (!formatRaw) return null;
  const trimmed = formatRaw.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") return null;

  const lowercase = trimmed.toLowerCase();

  return formatAliasMap[lowercase] ?? lowercase;
}

export function normalizeEncodingValue(encodingRaw: string | null | undefined): string | null {
  if (!encodingRaw) return null;
  const trimmed = encodingRaw.trim();
  if (!trimmed || trimmed.toUpperCase() === "N/A") return null;

  let normalized = trimmed.toLowerCase().replace(/_/g, "-");
  const utfMatch = normalized.match(/^utf(?:-)?(\d+)$/i);
  if (utfMatch && utfMatch[1]) {
    normalized = `utf-${utfMatch[1]}`;
  }

  return normalized;
}

export function formatEncodingForOutput(encoding: string): string {
  if (encoding === "unknown") {
    return "Unknown";
  }

  if (encoding.startsWith("utf")) {
    return encoding.replace(/^utf/, "UTF").toUpperCase();
  }

  if (encoding.startsWith("windows-")) {
    return encoding;
  }

  const segments = encoding.split("-").map((segment, index) => {
    if (index === 0) {
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    }
    return segment.toUpperCase();
  });

  return segments.join("-");
}

export const convertTmdbToImdb = async (tmdbId: string, mediaType: "movie" | "tv" = "movie") => {
  const apiKey = pickTmdbApiKey();
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (!data.imdb_id) {
      console.warn(`No IMDB ID found for TMDB ID: ${tmdbId}`);
    }

    return data.imdb_id || null;
  } catch (e) {
    console.error(`Error converting TMDB to IMDB: ${e}`);

    return createErrorResponse(
      500,
      "TMDB to IMDB Conversion Error",
      "Failed to convert TMDB ID to IMDB ID. Please check your TMDB API key and the provided TMDB ID.",
    );
  }
};

export const createErrorResponse = (
  code: number,
  message: string,
  details: string,
  example?: string,
) => {
  const errorResponse = {
    code,
    message,
    details,
    example,
  };

  return new Response(JSON.stringify(errorResponse), {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
};

export function numberToOrdinal(num: number): string {
  const ordinals: { [key: number]: string } = {
    1: "First",
    2: "Second",
    3: "Third",
    4: "Fourth",
    5: "Fifth",
    6: "Sixth",
    7: "Seventh",
    8: "Eighth",
    9: "Ninth",
    10: "Tenth",
    11: "Eleventh",
    12: "Twelfth",
    13: "Thirteenth",
    14: "Fourteenth",
    15: "Fifteenth",
    16: "Sixteenth",
    17: "Seventeenth",
    18: "Eighteenth",
    19: "Nineteenth",
    20: "Twentieth",
  };

  // For numbers beyond 20, use the general rule
  if (num > 20) {
    const lastDigit = num % 10;
    const suffix =
      lastDigit === 1 ? "st"
      : lastDigit === 2 ? "nd"
      : lastDigit === 3 ? "rd"
      : "th";
    return `${num}${suffix}`;
  }

  return ordinals[num] || `${num}th`;
}

export function numberToCardinal(n: number): string {
  if (n <= 0) {
    throw new Error("numberToCardinal only works with positive numbers");
  }

  // Special case for single-digit numbers for simplicity
  if (n < 10) {
    switch (n) {
      case 1:
        return "first";
      case 2:
        return "second";
      case 3:
        return "third";
      case 4:
        return "fourth";
      case 5:
        return "fifth";
      case 6:
        return "sixth";
      case 7:
        return "seventh";
      case 8:
        return "eighth";
      case 9:
        return "ninth";
    }
  }

  // Get the word representation of the number
  const words = toWords(n);

  // Handle exceptions for 11, 12, 13
  const lastTwoDigits = n % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${words}th`;
  }

  const lastDigit = n % 10;
  switch (lastDigit) {
    case 1:
      return words.replace(/(\W|^)(one)$/, "$1first");
    case 2:
      return words.replace(/(\W|^)(two)$/, "$1second");
    case 3:
      return words.replace(/(\W|^)(three)$/, "$1third");
    case 4:
      return words.replace(/(\W|^)(four)$/, "$1fourth");
    case 5:
      return words.replace(/(\W|^)(five)$/, "$1fifth");
    case 6:
      return words.replace(/(\W|^)(six)$/, "$1sixth");
    case 7:
      return words.replace(/(\W|^)(seven)$/, "$1seventh");
    case 8:
      return words.replace(/(\W|^)(eight)$/, "$1eighth");
    case 9:
      return words.replace(/(\W|^)(nine)$/, "$1ninth");
    case 0:
      return `${words}th`;
    default:
      return `${words}th`;
  }
}

export const fetchWithTimeout = (
  url: string | URL | Request,
  options: RequestInit = {},
  timeoutMs: number = 10000,
): Promise<Response> => {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  const fetchPromise = fetch(url, {
    ...options,
    signal,
  });

  return Promise.race([fetchPromise, timeoutPromise]);
};

export async function safeCancelReadableStream(stream?: ReadableStream | null): Promise<void> {
  if (!stream || typeof stream.cancel !== "function") {
    return;
  }

  // @ts-ignore - ReadableStream.locked exists in runtime but TS may not know
  if (typeof stream.locked === "boolean" && stream.locked) {
    return;
  }

  try {
    await stream.cancel();
  } catch (error) {
    if (process?.env?.NODE_ENV !== "production") {
      console.warn("[utils] Ignored stream cancel error:", error);
    }
  }
}

export function headersInitToObject(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) {
      result[key] = value as string;
    }
  }

  return result;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        break;
      }

      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

type ReleaseFilterDescriptor = {
  raw: string;
  normalizedValues: string[];
  type: "release" | "file";
};

type ReleaseCandidateDescriptor = {
  raw: string;
  normalizedValues: string[];
  type: "release" | "file";
};

const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/g;

function normalizeReleaseValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.toLowerCase().replace(NON_ALPHANUMERIC_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function normalizeFileValues(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const variants = new Set<string>();
  const normalizedRaw = normalizeReleaseValue(value);
  if (normalizedRaw) {
    variants.add(normalizedRaw);
  }

  const base = value.split(/[\\/]/).pop() ?? value;
  const withoutExt = base.replace(/\.[^.]+$/, "");

  for (const candidate of [base, withoutExt]) {
    const normalized = normalizeReleaseValue(candidate);
    if (normalized) {
      variants.add(normalized);
    }
  }

  return Array.from(variants);
}

function buildFilterDescriptors(
  values: string[] | undefined,
  type: "release" | "file",
): ReleaseFilterDescriptor[] {
  if (!values || values.length === 0) {
    return [];
  }

  const descriptors: ReleaseFilterDescriptor[] = [];

  for (const raw of values) {
    if (!raw) continue;
    const normalizedValues =
      type === "file" ? normalizeFileValues(raw) : [normalizeReleaseValue(raw)];
    const filtered = normalizedValues.filter((entry) => entry.length > 0);
    if (filtered.length === 0) continue;
    descriptors.push({ raw, normalizedValues: filtered, type });
  }

  return descriptors;
}

function buildCandidateDescriptors(item: ResponseType): ReleaseCandidateDescriptor[] {
  const candidates: ReleaseCandidateDescriptor[] = [];

  const pushCandidate = (raw: string | null | undefined, type: "release" | "file") => {
    if (!raw) return;
    const normalizedValues =
      type === "file" ? normalizeFileValues(raw) : [normalizeReleaseValue(raw)];
    const filtered = normalizedValues.filter((entry) => entry.length > 0);
    if (filtered.length === 0) return;
    candidates.push({ raw, normalizedValues: filtered, type });
  };

  pushCandidate(item.release ?? null, "release");
  if (Array.isArray(item.releases)) {
    for (const release of item.releases) {
      pushCandidate(release, "release");
    }
  }
  pushCandidate(item.fileName ?? null, "file");
  pushCandidate(item.url ?? null, "file");

  return candidates;
}

function matchFilterToCandidates(
  filters: ReleaseFilterDescriptor[],
  candidates: ReleaseCandidateDescriptor[],
): { candidate: ReleaseCandidateDescriptor; filter: ReleaseFilterDescriptor } | null {
  for (const filter of filters) {
    for (const filterValue of filter.normalizedValues) {
      if (!filterValue) continue;
      for (const candidate of candidates) {
        for (const candidateValue of candidate.normalizedValues) {
          if (!candidateValue) continue;
          if (candidateValue.includes(filterValue) || filterValue.includes(candidateValue)) {
            return { candidate, filter };
          }
        }
      }
    }
  }

  return null;
}

export function applyReleaseAndFileFilters(
  items: ResponseType[],
  releaseFilters?: string[],
  fileFilters?: string[],
): ResponseType[] {
  const releaseDescriptors = buildFilterDescriptors(releaseFilters, "release");
  const fileDescriptors = buildFilterDescriptors(fileFilters, "file");

  if (releaseDescriptors.length === 0 && fileDescriptors.length === 0) {
    return items;
  }

  const filtered: ResponseType[] = [];

  for (const item of items) {
    const candidates = buildCandidateDescriptors(item);

    const releaseMatch =
      releaseDescriptors.length > 0 ?
        matchFilterToCandidates(releaseDescriptors, candidates)
      : null;
    if (releaseDescriptors.length > 0 && !releaseMatch) {
      continue;
    }

    const fileMatch =
      fileDescriptors.length > 0 ? matchFilterToCandidates(fileDescriptors, candidates) : null;
    if (fileDescriptors.length > 0 && !fileMatch) {
      continue;
    }

    const matchToRecord = releaseMatch ?? fileMatch;
    if (matchToRecord) {
      filtered.push({
        ...item,
        matchedRelease: matchToRecord.candidate.raw,
        matchedFilter: matchToRecord.filter.raw,
      });
    } else {
      filtered.push(item);
    }
  }

  return filtered;
}

export function extractOrigin(text: string | null | undefined): string | null {
  if (!text) return null;

  const patterns: [RegExp, string][] = [
    [/\b(?:BluRay|Blu-Ray|BDRip|BRRip|BD)\b/i, "BluRay"],
    [/\b(?:WEB-DL|WEB-RIP|WEBRip|WEB|AMZN|NF|NFLX|DSNP|HMAX|HULU|iTunes|WEB-CAP|WEBCap)\b/i, "WEB"],
    [/\b(?:HDTV|PDTV|DSR|DSRip)\b/i, "HDTV"],
    [/\b(?:DVDRip|DVD|NTSC|PAL|DVD5|DVD9)\b/i, "DVD"],
    [/\b(?:CAM|CamRip|TS|HDCAM|HD-TS|TELESYNC|TC|TELECINE|SCr|SCREENER|DVDSCR|R5)\b/i, "CAM"],
    [/\b(?:HDRip)\b/i, "HDRip"],
  ];

  for (const [regex, origin] of patterns) {
    if (regex.test(text)) {
      return origin;
    }
  }

  return null;
}
