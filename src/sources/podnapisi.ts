/** @format */

import type { RequestType, ResponseType } from "~/utils/types";
import { languageToCountryCode } from "~/utils/lookup";
import {
  capitalizeFirstLetter,
  extractFilenameFromDisposition,
  formatEncodingForOutput,
  getMovieNameFromImdb,
  headersInitToObject,
  normalizeEncodingValue,
  normalizeFormatName,
  parseFormatAndEncodingFromFilename,
  readPositiveIntEnv,
  runWithConcurrency,
  safeCancelReadableStream,
  extractOrigin,
} from "~/utils/utils";
import { proxyFetch } from "~/utils/proxy";

const SERVER_URL = "https://www.podnapisi.net/subtitles/";
const PAGE_FETCH_CONCURRENCY = readPositiveIntEnv("PODNAPISI_PAGE_FETCH_CONCURRENCY", 6);
const LANGUAGE_FETCH_CONCURRENCY = readPositiveIntEnv("PODNAPISI_LANGUAGE_FETCH_CONCURRENCY", 8);
const METADATA_FETCH_CONCURRENCY = readPositiveIntEnv("PODNAPISI_METADATA_FETCH_CONCURRENCY", 24);

const PODNAPISI_MAX_PAGES = readPositiveIntEnv("PODNAPISI_MAX_PAGES", 1);
const PODNAPISI_MAX_RESULTS_PER_LANGUAGE = readPositiveIntEnv(
  "PODNAPISI_MAX_RESULTS_PER_LANGUAGE",
  120,
);

// Map of language codes to ISO 639-1 codes for Podnapisi
const podnapisiLanguageOverrides: Record<string, string> = {
  "sr-cyrl": "sr",
  pb: "pt-br", // Portuguese (Brazil) requested as pb, mapped to pt-br for Podnapisi
};

const PODNAPISI_SUPPORTED_LANGUAGES = new Set([
  "af",
  "sq",
  "am",
  "ar",
  "an",
  "es-ar",
  "as",
  "az",
  "eu",
  "be",
  "bn",
  "bs",
  "pt-br",
  "bg",
  "yyef",
  "ca",
  "zh",
  "hr",
  "cs",
  "da",
  "nl",
  "dz",
  "en",
  "eo",
  "et",
  "fo",
  "fa",
  "fi",
  "fr",
  "ka",
  "de",
  "el",
  "kl",
  "gu",
  "ht",
  "haw",
  "he",
  "hi",
  "hu",
  "is",
  "id",
  "ga",
  "it",
  "ja",
  "jv",
  "kn",
  "kk",
  "km",
  "rw",
  "ko",
  "ku",
  "ky",
  "lo",
  "la",
  "lv",
  "lt",
  "lb",
  "mk",
  "ms",
  "ml",
  "mt",
  "cmn",
  "mr",
  "mn",
  "nb",
  "ne",
  "se",
  "no",
  "nn",
  "oc",
  "or",
  "pa",
  "ps",
  "pl",
  "pt",
  "qu",
  "ro",
  "ru",
  "sr",
  "sr-latn",
  "si",
  "sk",
  "sl",
  "es",
  "sw",
  "sv",
  "tl",
  "ta",
  "te",
  "th",
  "tr",
  "tk",
  "uk",
  "ur",
  "ug",
  "vi",
  "vo",
  "wa",
  "cy",
  "xh",
  "zu",
]);

interface PodnapisiSubtitle {
  pid: string;
  language: string;
  languageName?: string;
  title: string;
  releases: string[];
  year: number | null;
  season: number | null;
  episode: number | null;
  isHearingImpaired: boolean;
  isForeign: boolean;
  pageLink: string;
  format?: string | null;
}

type SubtitleDownloadMetadata = ReturnType<typeof parseFormatAndEncodingFromFilename>;

const downloadMetadataCache = new Map<string, SubtitleDownloadMetadata>();

function readNonNegativeIntEnv(envKey: string, defaultValue: number): number {
  if (typeof process === "undefined" || !process?.env) {
    return defaultValue;
  }

  const rawValue = process.env[envKey];
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }

  return parsed;
}

const PODNAPISI_DIRECT_TIMEOUT_MS = readNonNegativeIntEnv("PODNAPISI_DIRECT_TIMEOUT_MS", 1200);
const PODNAPISI_PROXY_DELAY_MS = readNonNegativeIntEnv("PODNAPISI_PROXY_DELAY_MS", 150);
const PODNAPISI_PAGE_MAX_ATTEMPTS = readPositiveIntEnv("PODNAPISI_PAGE_MAX_ATTEMPTS", 2);
const PODNAPISI_PAGE_RETRY_DELAY_MS = readNonNegativeIntEnv("PODNAPISI_PAGE_RETRY_DELAY_MS", 200);

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachAbortSignal(controller: AbortController, external?: AbortSignal): AbortSignal {
  if (!external) {
    return controller.signal;
  }

  if (external.aborted) {
    controller.abort();
    return controller.signal;
  }

  const abortListener = () => controller.abort();
  external.addEventListener("abort", abortListener, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => external.removeEventListener("abort", abortListener),
    { once: true },
  );

  return controller.signal;
}

interface PodnapisiFetchFailure {
  source: "direct" | "proxy";
  response?: Response;
  error?: unknown;
}

function resolveLanguageCode(language: string): string {
  const lower = language.toLowerCase();
  const normalized = podnapisiLanguageOverrides[lower] ?? lower;

  if (!PODNAPISI_SUPPORTED_LANGUAGES.has(normalized)) {
    console.warn(
      `[Podnapisi] Requested language "${language}" is not in the official list, using "${normalized}" as-is.`,
    );
  }

  return normalized;
}

const PODNAPISI_DEFAULT_HEADERS: Record<string, string> = {
  Accept: "text/xml,application/xml,application/xhtml+xml,*/*;q=0.8",
};

function buildPodnapisiHeaders(extra?: HeadersInit): Record<string, string> {
  return { ...PODNAPISI_DEFAULT_HEADERS, ...headersInitToObject(extra) };
}

async function fetchSubtitleMetadata(pid: string): Promise<SubtitleDownloadMetadata> {
  if (downloadMetadataCache.has(pid)) {
    return downloadMetadataCache.get(pid)!;
  }

  const defaultMetadata: SubtitleDownloadMetadata = { format: null, encoding: null };
  const downloadUrl = `${SERVER_URL}${pid}/download?container=zip`;

  const metadataHeaders = { Accept: "*/*" } satisfies Record<string, string>;

  try {
    let response = await podnapisiFetch(downloadUrl, {
      method: "HEAD",
      headers: metadataHeaders,
    });

    if (!response.ok) {
      console.warn(
        `[Podnapisi] HEAD metadata request returned ${response.status} for pid ${pid}, retrying with range request`,
      );
      response = await podnapisiFetch(downloadUrl, {
        method: "GET",
        headers: { ...metadataHeaders, Range: "bytes=0-0" },
      });
    }

    if (!response.ok) {
      console.warn(`[Podnapisi] Unable to retrieve metadata for pid ${pid}: ${response.status}`);
      downloadMetadataCache.set(pid, defaultMetadata);
      return defaultMetadata;
    }

    const filename = extractFilenameFromDisposition(response.headers.get("Content-Disposition"));
    const metadata = parseFormatAndEncodingFromFilename(filename);

    try {
      await response.body?.cancel();
    } catch (cancelError) {
      console.warn(`[Podnapisi] Failed to cancel body stream for pid ${pid}:`, cancelError);
    }

    downloadMetadataCache.set(pid, metadata);
    return metadata;
  } catch (error) {
    console.error(`[Podnapisi] Error retrieving download metadata for pid ${pid}:`, error);
    downloadMetadataCache.set(pid, defaultMetadata);
    return defaultMetadata;
  }
}

/**
 * Custom fetch for Podnapisi with proper headers
 */
interface PodnapisiPageResult {
  subtitles: PodnapisiSubtitle[];
  currentPage: number;
  totalPages: number;
}

async function podnapisiFetch(url: string, options?: RequestInit): Promise<Response> {
  const { headers: _ignoredHeaders, signal: externalSignal, ...restOptions } = options ?? {};
  const headers = buildPodnapisiHeaders(_ignoredHeaders);

  const directController = new AbortController();
  const proxyController = new AbortController();

  const directSignal = attachAbortSignal(directController, externalSignal);
  const proxySignal = attachAbortSignal(proxyController, externalSignal);

  let directTimeout: NodeJS.Timeout | undefined;
  if (PODNAPISI_DIRECT_TIMEOUT_MS > 0) {
    directTimeout = setTimeout(() => {
      directController.abort();
    }, PODNAPISI_DIRECT_TIMEOUT_MS);
  }

  const directPromise = (async () => {
    try {
      const response = await fetch(url, {
        ...restOptions,
        headers,
        signal: directSignal,
      });

      if (!response.ok) {
        throw { source: "direct", response } satisfies PodnapisiFetchFailure;
      }

      return response;
    } catch (error) {
      if ((error as PodnapisiFetchFailure)?.source === "direct") {
        throw error;
      }

      throw { source: "direct", error } satisfies PodnapisiFetchFailure;
    } finally {
      if (directTimeout) {
        clearTimeout(directTimeout);
      }
    }
  })();

  const proxyPromise = (async () => {
    try {
      if (PODNAPISI_PROXY_DELAY_MS > 0) {
        await delay(PODNAPISI_PROXY_DELAY_MS);
      }

      if (proxyController.signal.aborted) {
        throw {
          source: "proxy",
          error: new Error("Proxy fetch aborted"),
        } satisfies PodnapisiFetchFailure;
      }

      const response = await proxyFetch(url, {
        ...restOptions,
        headers,
        signal: proxySignal,
      });

      if (!response.ok) {
        throw { source: "proxy", response } satisfies PodnapisiFetchFailure;
      }

      return response;
    } catch (error) {
      if ((error as PodnapisiFetchFailure)?.source === "proxy") {
        throw error;
      }

      throw { source: "proxy", error } satisfies PodnapisiFetchFailure;
    }
  })();

  // Race direct and proxy attempts, preferring whichever succeeds first.
  const attempts: Array<Promise<{ source: "direct" | "proxy"; response: Response }>> = [
    directPromise.then((response) => ({ source: "direct" as const, response })),
    proxyPromise.then((response) => ({ source: "proxy" as const, response })),
  ];

  return await new Promise<Response>((resolve, reject) => {
    let resolved = false;
    let pending = attempts.length;
    const failures: PodnapisiFetchFailure[] = [];

    const finalizeFailure = () => {
      const proxyFailure = failures.find((failure) => failure.source === "proxy");
      const directFailure = failures.find((failure) => failure.source === "direct");

      if (directFailure?.response) {
        if (proxyFailure?.response) {
          console.warn(
            `[Podnapisi] Proxy fetch returned ${proxyFailure.response.status}, using direct response instead.`,
          );
        }
        resolve(directFailure.response);
        return;
      }

      if (proxyFailure?.response) {
        resolve(proxyFailure.response);
        return;
      }

      if (proxyFailure?.error) {
        reject(proxyFailure.error);
        return;
      }

      if (directFailure?.error) {
        reject(directFailure.error);
        return;
      }

      reject(new Error(`[Podnapisi] All fetch attempts failed for ${url}`));
    };

    const recordFailure = (failure: PodnapisiFetchFailure) => {
      if (resolved) {
        return;
      }

      failures.push(failure);
      pending -= 1;

      if (pending === 0) {
        finalizeFailure();
      }
    };

    const onSuccess = ({
      source,
      response,
    }: {
      source: "direct" | "proxy";
      response: Response;
    }) => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (source === "direct") {
        proxyController.abort();
      } else {
        directController.abort();
      }
      resolve(response);
    };

    for (const attempt of attempts) {
      attempt
        .then((result) => onSuccess(result))
        .catch((failure: PodnapisiFetchFailure) => recordFailure(failure));
    }
  });
}

async function fetchPodnapisiPage(
  request: RequestType,
  movieName: string,
  apiLang: string | null,
  langLabel: string,
  pageNumber: number,
): Promise<PodnapisiPageResult | null> {
  const params = buildSearchParams(request, movieName, apiLang);
  if (pageNumber > 1) {
    params.set("page", pageNumber.toString());
  }

  const searchUrl = `${SERVER_URL}search/old?${params.toString()}`;
  for (let attempt = 1; attempt <= PODNAPISI_PAGE_MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await podnapisiFetch(searchUrl);
    } catch (error) {
      if (attempt < PODNAPISI_PAGE_MAX_ATTEMPTS) {
        console.warn(
          `[Podnapisi] Fetch attempt ${attempt} failed for ${langLabel} page ${pageNumber}, retrying...`,
          error,
        );
        await delay(PODNAPISI_PAGE_RETRY_DELAY_MS * attempt);
        continue;
      }

      console.error(`[Podnapisi] Error searching for ${langLabel} page ${pageNumber}:`, error);
      return null;
    }

    if (!response.ok) {
      const { status } = response;
      if (RETRYABLE_HTTP_STATUSES.has(status) && attempt < PODNAPISI_PAGE_MAX_ATTEMPTS) {
        console.warn(
          `[Podnapisi] HTTP ${status} for ${langLabel} page ${pageNumber} (attempt ${attempt}), retrying...`,
        );
        await safeCancelReadableStream(response.body);
        await delay(PODNAPISI_PAGE_RETRY_DELAY_MS * attempt);
        continue;
      }

      console.error(`[Podnapisi] HTTP error for ${langLabel}: ${status}`);
      await safeCancelReadableStream(response.body);
      return null;
    }

    let xml: string;
    try {
      xml = await response.text();
    } catch (readError) {
      console.warn(
        `[Podnapisi] Failed to read response for ${langLabel} page ${pageNumber}: ${
          readError instanceof Error ? readError.message : readError
        }. Retrying direct fetch.`,
      );
      await safeCancelReadableStream(response.body);

      try {
        const directResponse = await fetch(searchUrl, { headers: buildPodnapisiHeaders() });

        if (!directResponse.ok) {
          console.error(
            `[Podnapisi] Direct fetch HTTP error for ${langLabel} page ${pageNumber}: ${directResponse.status}`,
          );
          return null;
        }

        xml = await directResponse.text();
      } catch (fallbackError) {
        if (attempt < PODNAPISI_PAGE_MAX_ATTEMPTS) {
          console.warn(
            `[Podnapisi] Direct fetch fallback failed for ${langLabel} page ${pageNumber}, retrying...`,
            fallbackError,
          );
          await delay(PODNAPISI_PAGE_RETRY_DELAY_MS * attempt);
          continue;
        }

        console.error(
          `[Podnapisi] Direct fetch fallback failed for ${langLabel} page ${pageNumber}:`,
          fallbackError,
        );
        return null;
      }
    }

    const { subtitles, currentPage, totalPages } = parseXmlResponse(xml);

    return { subtitles, currentPage, totalPages };
  }

  console.error(
    `[Podnapisi] Exhausted retries searching for ${langLabel} page ${pageNumber} after ${PODNAPISI_PAGE_MAX_ATTEMPTS} attempts`,
  );
  return null;
}

async function fetchLanguageSubtitles(
  request: RequestType,
  movieName: string,
  apiLang: string | null,
  langLabel: string,
): Promise<PodnapisiSubtitle[]> {
  const collected: PodnapisiSubtitle[] = [];
  const localSeen = new Set<string>();

  const firstPage = await fetchPodnapisiPage(request, movieName, apiLang, langLabel, 1);
  if (!firstPage) {
    return collected;
  }

  for (const sub of firstPage.subtitles) {
    if (!localSeen.has(sub.pid)) {
      localSeen.add(sub.pid);
      collected.push(sub);
      if (collected.length >= PODNAPISI_MAX_RESULTS_PER_LANGUAGE) {
        return collected;
      }
    }
  }

  const maxPages = Math.min(firstPage.totalPages, PODNAPISI_MAX_PAGES);

  if (maxPages > 1) {
    const remainingPages: number[] = [];
    for (let page = 2; page <= maxPages; page++) {
      remainingPages.push(page);
    }

    if (remainingPages.length > 0) {
      const pageResults = await runWithConcurrency(
        remainingPages,
        PAGE_FETCH_CONCURRENCY,
        async (page) => fetchPodnapisiPage(request, movieName, apiLang, langLabel, page),
      );

      for (const pageResult of pageResults) {
        if (!pageResult) {
          continue;
        }

        for (const sub of pageResult.subtitles) {
          if (!localSeen.has(sub.pid)) {
            localSeen.add(sub.pid);
            collected.push(sub);
            if (collected.length >= PODNAPISI_MAX_RESULTS_PER_LANGUAGE) {
              return collected;
            }
          }
        }
      }
    }
  }

  return collected;
}

/**
 * Parse XML text content helper
 */
function getXmlTextContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Parse XML number content helper
 */
function getXmlNumberContent(xml: string, tagName: string): number | null {
  const text = getXmlTextContent(xml, tagName);
  if (text === null || text === "") return null;
  const num = parseInt(text, 10);
  return isNaN(num) ? null : num;
}

/**
 * Parse a subtitle element from the XML response
 */
function parseSubtitleXml(subtitleXml: string): PodnapisiSubtitle | null {
  try {
    const pid = getXmlTextContent(subtitleXml, "pid");
    if (!pid) return null;

    const language = getXmlTextContent(subtitleXml, "language");
    if (!language) return null;

    const languageName = getXmlTextContent(subtitleXml, "languageName") || undefined;

    const title = getXmlTextContent(subtitleXml, "title") || "Unknown";
    const pageLink = getXmlTextContent(subtitleXml, "url") || "";
    const releaseText = getXmlTextContent(subtitleXml, "release") || "";
    const formatText = getXmlTextContent(subtitleXml, "format");

    // Parse releases (space-separated list)
    const releases: string[] = [];
    if (releaseText) {
      for (const release of releaseText.split(/\s+/)) {
        // Remove trailing dots
        releases.push(release.replace(/\.+$/, ""));
      }
    }

    const year = getXmlNumberContent(subtitleXml, "year");
    const season = getXmlNumberContent(subtitleXml, "tvSeason");
    const episode = getXmlNumberContent(subtitleXml, "tvEpisode");

    // Check flags for hearing impaired and foreign subtitles
    const flags = getXmlTextContent(subtitleXml, "flags") || "";
    const isHearingImpaired = flags.includes("n"); // 'n' flag means hearing impaired
    const isForeign = flags.includes("f"); // 'f' flag means foreign parts only

    return {
      pid,
      language,
      languageName,
      title,
      releases,
      year,
      season,
      episode,
      isHearingImpaired,
      isForeign,
      pageLink,
      format: formatText && formatText.toUpperCase() !== "N/A" ? formatText : null,
    };
  } catch (error) {
    console.error(`[Podnapisi] Error parsing subtitle XML:`, error);
    return null;
  }
}

/**
 * Parse the full XML response
 */
function parseXmlResponse(xml: string): {
  subtitles: PodnapisiSubtitle[];
  totalResults: number;
  currentPage: number;
  totalPages: number;
} {
  const subtitles: PodnapisiSubtitle[] = [];

  // Parse pagination info
  const totalResults = getXmlNumberContent(xml, "results") || 0;
  const currentPage = getXmlNumberContent(xml, "current") || 1;
  const totalPages = getXmlNumberContent(xml, "count") || 1;

  // Extract all subtitle elements
  const subtitlePattern = /<subtitle>([\s\S]*?)<\/subtitle>/gi;
  let match;

  while ((match = subtitlePattern.exec(xml)) !== null) {
    const subtitle = parseSubtitleXml(match[1]);
    if (subtitle) {
      subtitles.push(subtitle);
    }
  }

  return { subtitles, totalResults, currentPage, totalPages };
}

/**
 * Build search parameters for Podnapisi API
 */
function buildSearchParams(
  request: RequestType,
  keyword: string,
  language?: string | null,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("sXML", "1");
  if (language) {
    params.set("sL", language.toLowerCase());
  }
  params.set("sK", keyword);

  if (request.season !== undefined && request.season !== null) {
    params.set("sTS", request.season.toString());
  }
  if (request.episode !== undefined && request.episode !== null) {
    params.set("sTE", request.episode.toString());
  }

  return params;
}

/**
 * Search for subtitles on Podnapisi
 * @param request - The search request parameters
 * @returns Array of subtitle results matching the criteria
 */
export async function searchPodnapisi(request: RequestType): Promise<ResponseType[]> {
  if (!request.imdbId) {
    console.warn("[Podnapisi] Missing IMDB ID in request");
    return [];
  }

  try {
    // Get the movie/show name from IMDB ID
    const movieName = await getMovieNameFromImdb(request.imdbId);
    if (!movieName) {
      console.warn("[Podnapisi] Could not get movie name from IMDB ID");
      return [];
    }

    type LanguageTarget = { label: string; api: string | null };
    const languageTargets: LanguageTarget[] = [];
    const seenTargets = new Set<string | null>();

    if (request.languages && request.languages.length > 0) {
      const requested = Array.isArray(request.languages) ? request.languages : [request.languages];
      for (const lang of requested) {
        const apiLang = resolveLanguageCode(lang);
        if (!seenTargets.has(apiLang)) {
          seenTargets.add(apiLang);
          languageTargets.push({ label: lang, api: apiLang });
        }
      }
    } else {
      // No language specified: request all languages in a single query
      languageTargets.push({ label: "all", api: null });
    }

    const languageFilterSet =
      request.languages && request.languages.length > 0 ?
        new Set(
          (Array.isArray(request.languages) ? request.languages : [request.languages]).map((lang) =>
            resolveLanguageCode(lang),
          ),
        )
      : null;

    const allSubtitles: PodnapisiSubtitle[] = [];
    const seenPids = new Set<string>();

    const perLanguageResults = await runWithConcurrency(
      languageTargets,
      LANGUAGE_FETCH_CONCURRENCY,
      async ({ label, api }) => fetchLanguageSubtitles(request, movieName, api, label),
    );

    for (const subtitles of perLanguageResults) {
      if (!subtitles) {
        continue;
      }
      for (const sub of subtitles) {
        if (!seenPids.has(sub.pid)) {
          seenPids.add(sub.pid);
          allSubtitles.push(sub);
        }
      }
    }

    // Filter and format results
    const results: ResponseType[] = [];
    const formatFilters = (
      request.formats ?
        Array.isArray(request.formats) ?
          request.formats
        : [request.formats]
      : [])
      .map((format) => normalizeFormatName(format))
      .filter((format): format is string => !!format);
    const encodingFilters = (
      request.encodings ?
        Array.isArray(request.encodings) ?
          request.encodings
        : [request.encodings]
      : [])
      .map((encoding) => normalizeEncodingValue(encoding))
      .filter((encoding): encoding is string => !!encoding);

    interface SubtitleCandidate {
      subtitle: PodnapisiSubtitle;
      langCode: string;
      countryCode: string;
      display: string;
      compatibleUrl: string;
    }

    const candidates: SubtitleCandidate[] = [];

    for (const subtitle of allSubtitles) {
      // Skip foreign-only subtitles unless specifically requested (not implemented)
      if (subtitle.isForeign) {
        continue;
      }

      // Season/Episode matching for TV shows
      if (request.season !== undefined && request.season !== null) {
        if (subtitle.season !== request.season) {
          continue;
        }
        if (
          request.episode !== undefined &&
          request.episode !== null &&
          subtitle.episode !== request.episode
        ) {
          continue;
        }
      }

      // Hearing impaired filter
      if (request.hearingImpaired === true && !subtitle.isHearingImpaired) {
        continue;
      }

      // Get language code from the subtitle's language
      // Only normalize specific known patterns like "sr-latn" to "sr", preserve other codes
      const langCode = subtitle.language.toLowerCase();

      if (languageFilterSet && !languageFilterSet.has(langCode)) {
        continue;
      }

      // Get country code for flag
      const countryCode = languageToCountryCode[langCode] || langCode.toUpperCase();

      // Create compatible URL
      // Format: podnapisi/{pid}/download.zip
      // Preserve letters, numbers, spaces, hyphens, and underscores for readability
      const cleanFilename = subtitle.title.replace(/[^a-zA-Z0-9\s\-_]/g, "").replace(/\s+/g, "-");
      const compatibleUrl = `podnapisi/${subtitle.pid}/${cleanFilename}`;

      // Build display name using human readable language name when available
      const fallbackDisplay = subtitle.languageName ? subtitle.languageName.trim() : null;
      const normalizedDisplay =
        fallbackDisplay && fallbackDisplay.length > 0 ?
          fallbackDisplay
        : capitalizeFirstLetter(langCode);

      candidates.push({
        subtitle,
        langCode,
        countryCode,
        display: normalizedDisplay,
        compatibleUrl,
      });
    }

    // Process candidates with bounded concurrency while resolving download metadata for format/encoding details.
    const candidateResults = await runWithConcurrency(
      candidates,
      METADATA_FETCH_CONCURRENCY,
      async (candidate) => {
        const { subtitle } = candidate;

        let normalizedFormat = normalizeFormatName(subtitle.format);
        let normalizedEncoding: string | null = null;
        // Fetch metadata to populate format/encoding details for clients and filters.
        const metadata = await fetchSubtitleMetadata(subtitle.pid);

        if (!normalizedFormat) {
          normalizedFormat = normalizeFormatName(metadata.format);
        }

        normalizedEncoding = normalizeEncodingValue(metadata.encoding);

        const formatForFiltering = normalizedFormat;
        const encodingForFiltering = normalizedEncoding;

        if (formatFilters.length > 0) {
          if (!formatForFiltering || !formatFilters.includes(formatForFiltering)) {
            return null;
          }
        }

        if (encodingFilters.length > 0) {
          if (!encodingForFiltering || !encodingFilters.includes(encodingForFiltering)) {
            return null;
          }
        }

        if (!normalizedFormat) {
          normalizedFormat = "unknown";
        }

        if (!normalizedEncoding) {
          normalizedEncoding = "unknown";
        }

        const finalEncoding = formatEncodingForOutput(normalizedEncoding);

        const normalizedReleases =
          Array.isArray(subtitle.releases) ?
            subtitle.releases
              .map((release) => release?.trim())
              .filter((release): release is string => Boolean(release && release.length > 0))
          : [];

        const primaryRelease =
          normalizedReleases[0] ??
          (typeof subtitle.title === "string" && subtitle.title.trim().length > 0 ?
            subtitle.title.trim()
          : null);

        return {
          id: subtitle.pid,
          url: candidate.compatibleUrl,
          flagUrl: `https://flagsapi.com/${candidate.countryCode}/flat/24.png`,
          format: normalizedFormat,
          encoding: finalEncoding,
          display: candidate.display,
          language: candidate.langCode,
          media: subtitle.title,
          isHearingImpaired: subtitle.isHearingImpaired,
          source: "podnapisi",
          release: primaryRelease,
          releases: normalizedReleases,
          origin:
            extractOrigin(primaryRelease) ||
            (normalizedReleases.length ?
              (normalizedReleases.map((r) => extractOrigin(r)).find((o) => o) ?? null)
            : null),
          fileName: subtitle.title,
        } satisfies ResponseType;
      },
    );

    for (const result of candidateResults) {
      if (result) {
        results.push(result);
      }
    }

    return results;
  } catch (error) {
    console.error(`[Podnapisi] Error searching for subtitles:`, error);
    return [];
  }
}
