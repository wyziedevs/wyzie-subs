/** @format */

import { createErrorResponse, convertTmdbToImdb, applyReleaseAndFileFilters } from "~/utils/utils";
import type { RequestType, ResponseType } from "~/utils/types";
import { search } from "~/utils/function";
import { sourcesConfig } from "~/sourcesConfig";

const CACHE_VERSION = "v2";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  if (!query || !query.id) {
    return createErrorResponse(
      400,
      "Bad request",
      "No id parameter was provided. Please provide an id.",
      "/search?id=286217",
    );
  }

  const cacheKey = `${CACHE_VERSION}:${getRequestURL(event).toString()}`;
  // @ts-ignore - caches.default is available in CF Workers runtime
  const isCacheAvailable = typeof caches !== "undefined" && caches.default;
  // @ts-ignore - caches.default is available in CF Workers runtime
  const cache = isCacheAvailable ? caches.default : null;

  if (isCacheAvailable && cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log(`Cache HIT for: ${cacheKey}`);
        return cachedResponse;
      }
      console.log(`Cache MISS for: ${cacheKey}`);
    } catch (cacheError) {
      console.error(`Cache match error: ${cacheError}`);
    }
  }

  // all parameters must be lowercase and without spaces
  const id = (query.id as string).toLowerCase();
  const season = query.season ? parseInt(query.season as string) : undefined;
  const episode = query.episode ? parseInt(query.episode as string) : undefined;

  const parseFilterList = (value: unknown): string[] => {
    if (!value) return [];
    const rawValues = Array.isArray(value) ? value : [value];
    return rawValues
      .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  };

  const queryRecord = query as Record<string, unknown>;

  const languages =
    query.language ? (query.language as string).toLowerCase().split(",") : undefined;
  const formats = query.format ? (query.format as string).toLowerCase().split(",") : undefined;
  const encodings =
    query.encoding ? (query.encoding as string).toLowerCase().split(",") : undefined;
  const origins =
    query.origin ?
      (query.origin as string)
        .toUpperCase()
        .split(",")
        .map((o) => o.trim())
    : undefined;
  const releaseFilters = [...new Set(parseFilterList(query.release))];
  const rawFileFilters = [
    ...parseFilterList(query.file),
    ...parseFilterList(queryRecord.filename),
    ...parseFilterList(queryRecord.fileName),
  ];
  const fileFilters = [...new Set(rawFileFilters)];

  const hearingImpaired = query.hi as boolean | undefined;
  const source = query.source ? (query.source as string).toLowerCase() : "opensubtitles";
  var imdbId: string | undefined;
  var tmdbId: string | undefined;

  if (id.includes("tt")) {
    imdbId = id;
  } else {
    tmdbId = id;
  }

  if (tmdbId) {
    const mediaType = season !== undefined ? "tv" : "movie";
    imdbId = await convertTmdbToImdb(tmdbId, mediaType);
  }

  if (!imdbId || imdbId === null) {
    return createErrorResponse(
      400,
      "Missing required parameter",
      "The provided ID is invalid. Please provide a valid IMDb or TMDb ID.",
    );
  }

  if ((season && !episode) || (!season && episode)) {
    return createErrorResponse(
      400,
      "Both season and episode are required",
      "If episode or season is present the other must also be present. Or else... (shit jus acts up)",
      "/search?id=tt0111161&season=1&episode=1",
    );
  }

  if (languages && !languages.every((lang) => /^[a-z]{2}$/.test(lang))) {
    return createErrorResponse(
      400,
      "Invalid language format",
      "Languages must be in ISO 3166-2 code format, can be independent or in a list.",
      "/search?id=tt0111161&language=en,es,fr",
    );
  }

  if (source) {
    const validSources = [...Object.keys(sourcesConfig), "all"];
    const sourceList = source.split(",").map((s) => s.trim().toLowerCase());

    if (!sourceList.every((s) => validSources.includes(s))) {
      return createErrorResponse(
        400,
        "Invalid source",
        `Source must be one or more of the following: ${validSources.join(", ")}.`,
        "/search?id=tt0111161&source=subdl,subf2m,opensubtitles,podnapisi,animetosho,gestdown",
      );
    }
  }

  const request: RequestType = {
    languages,
    formats,
    encodings,
    imdbId,
    season,
    episode,
    hearingImpaired,
    source,
    releaseFilters: releaseFilters.length ? releaseFilters : undefined,
    fileFilters: fileFilters.length ? fileFilters : undefined,
  };

  try {
    const startTime = Date.now();
    const data = await search(request);
    const endTime = Date.now();
    const execTime = endTime - startTime;
    console.log(`Execution time: ${execTime}ms`);

    let filteredData = applyReleaseAndFileFilters(
      data,
      request.releaseFilters,
      request.fileFilters,
    );

    if (origins && origins.length > 0) {
      filteredData = filteredData.filter(
        (item) => item.origin && origins.includes(item.origin.toUpperCase()),
      );
    }

    if (!filteredData || filteredData.length === 0) {
      const hasReleaseFilters =
        (request.releaseFilters && request.releaseFilters.length > 0) ||
        (request.fileFilters && request.fileFilters.length > 0) ||
        (origins && origins.length > 0);

      if (hasReleaseFilters) {
        return createErrorResponse(
          400,
          "No matching release found",
          "Subtitles were found for this title, but none matched your release or file filters.",
        );
      }
      return createErrorResponse(
        400,
        "No subtitles found",
        "No subtitles found for your desired parameters, sorry :(",
      );
    }

    // Get host URL for subtitle download links
    const host =
      process.env.NODE_ENV === "production" ? "https://sub.wyzie.ru" : "http://localhost:3000";

    const transformedData = filteredData.map((item: ResponseType) => {
      const originalUrl = item.url;
      let newUrl = originalUrl;
      const normalizedFormat =
        item.format && item.format.toLowerCase() !== "unknown" ? item.format : undefined;
      const normalizedEncoding =
        item.encoding && item.encoding.toLowerCase() !== "unknown" ? item.encoding : undefined;
      const formatParam = normalizedFormat ? `format=${encodeURIComponent(normalizedFormat)}` : "";
      const encodingParam =
        normalizedEncoding ? `encoding=${encodeURIComponent(normalizedEncoding)}` : "";
      const queryParams = [formatParam, encodingParam].filter(Boolean).join("&");

      if (item.source === "subdl") {
        const [source, id, filename] = originalUrl.split("/");
        if (source === "subdl" && id && filename) {
          const pseudoVrf = id;
          const cleanFilename = filename.endsWith(".zip") ? filename.slice(0, -4) : filename;
          let downloadId = cleanFilename.includes("-") ? cleanFilename : `${id}-${cleanFilename}`;
          const suffixQuery = queryParams ? `?${queryParams}` : "";
          newUrl = `${host}/c/${pseudoVrf}/id/${downloadId}.subdl${suffixQuery}`;
        }
      } else if (item.source === "subf2m") {
        const [source, encodedPath, filename] = originalUrl.split("/");
        if (source === "subf2m" && encodedPath && filename) {
          const pseudoVrf = encodedPath;
          const cleanFilename = filename.replace(/[^a-zA-Z0-9-]/g, "-");
          const suffixQuery = queryParams ? `?${queryParams}` : "";
          newUrl = `${host}/c/${pseudoVrf}/id/${cleanFilename}.subf2m${suffixQuery}`;
        }
      } else if (item.source === "podnapisi") {
        const [source, pid, filename] = originalUrl.split("/");
        if (source === "podnapisi" && pid && filename) {
          const pseudoVrf = pid;
          const cleanFilename = filename.replace(/[^a-zA-Z0-9-]/g, "-");
          const suffixQuery = queryParams ? `?${queryParams}` : "";
          newUrl = `${host}/c/${pseudoVrf}/id/${cleanFilename}.podnapisi${suffixQuery}`;
        }
      } else if (item.source === "animetosho") {
        const attachmentId = item.id;
        if (attachmentId && /^[0-9]+$/.test(attachmentId)) {
          const suffixQuery = queryParams ? `?${queryParams}` : "";
          newUrl = `${host}/c/animetosho/id/${attachmentId}.animetosho${suffixQuery}`;
        }
      } else if (item.source === "gestdown") {
        const suffixQuery = queryParams ? `?${queryParams}` : "";
        const subtitleId = item.id ?? originalUrl.split("/").pop();
        if (subtitleId) {
          newUrl = `${host}/c/gestdown/id/${subtitleId}.gestdown${suffixQuery}`;
        }
      } else {
        const vrfMatch = originalUrl.match(/vrf-([a-z0-9]+)/);
        const fileIdMatch = originalUrl.match(/file\/(\d+)/);
        if (vrfMatch && vrfMatch[1] && fileIdMatch && fileIdMatch[1]) {
          const vrf = vrfMatch[1];
          const fileId = fileIdMatch[1];
          newUrl = `${host}/c/${vrf}/id/${fileId}${queryParams ? "?" + queryParams : ""}`;
        }
      }

      return {
        id: item.id,
        url: newUrl,
        flagUrl: item.flagUrl,
        format: item.format,
        encoding: item.encoding,
        display: item.display,
        language: item.language,
        media: item.media,
        isHearingImpaired: item.isHearingImpaired,
        source: item.source,
        release: item.release ?? null,
        releases: item.releases ?? [],
        origin: item.origin ?? null,
        fileName: item.fileName ?? null,
        matchedRelease: item.matchedRelease ?? null,
        matchedFilter: item.matchedFilter ?? null,
      };
    });

    const finalResponse = new Response(JSON.stringify(transformedData), {
      headers: {
        "content-type": "application/json",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });

    if (isCacheAvailable && cache && finalResponse.ok) {
      console.log(`Caching successful response with status: ${finalResponse.status}`);
      if (typeof event.waitUntil === "function") {
        event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      } else {
        await cache.put(cacheKey, finalResponse.clone());
      }
    } else if (isCacheAvailable && cache) {
      console.log(`Not caching response with status: ${finalResponse.status}`);
    }

    return finalResponse;
  } catch (e) {
    return createErrorResponse(
      500,
      "Internal server error",
      `An unexpected error occurred while processing your request. Reach out in the Discord for help. ${e}`,
    );
  }
});
