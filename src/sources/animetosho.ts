/** @format */

// https://animetosho.org/
// (requires AniDb HTTP API client described at https://wiki.anidb.net/HTTP_API_Definition)

import { DOMParser } from "@xmldom/xmldom";
import ISO6391 from "iso-639-1";
import { iso6393 } from "iso-639-3";
import { languageToCountryCode } from "~/utils/lookup";
import { proxyFetch } from "~/utils/proxy";
import { readPositiveIntEnv, extractOrigin } from "~/utils/utils";
import type { RequestType, ResponseType } from "~/utils/types";

const TMDB_API_KEYS = ["xxx", "xxx"];

const ANIMETOSHO_SEARCH_THRESHOLD = readPositiveIntEnv("ANIMETOSHO_SEARCH_THRESHOLD", 6);
const ANIMETOSHO_FEED_URL = "https://feed.animetosho.org/json";
const ANIMETOSHO_STORAGE_URL = "https://animetosho.org/storage/attach";
const ANIME_LIST_URL =
  "https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list.xml";

type ExternalIds = {
  tvdbId: number | null;
  tmdbId: number | null;
  title?: string;
};

type AniDbMappingResult = {
  seriesId: number;
  episodeNumber: number;
  offset: number;
};

type AnimetoshoFeedEntry = {
  id: number;
  status?: string;
  timestamp?: number;
  title?: string;
};

type AnimetoshoAttachmentInfo = {
  lang?: string;
  name?: string;
  codec?: string;
  default?: number;
  forced?: number;
};

type AnimetoshoAttachment = {
  id: number;
  filename?: string;
  type?: string;
  info?: AnimetoshoAttachmentInfo;
};

type AnimetoshoFile = {
  filename?: string;
  attachments?: AnimetoshoAttachment[];
};

type AnimetoshoTorrentDetails = {
  files?: AnimetoshoFile[];
};

type LanguageLookupEntry = {
  iso2?: string;
  iso3: string;
  name: string;
};

const LANGUAGE_LOOKUP: Map<string, LanguageLookupEntry> = (() => {
  const lookup = new Map<string, LanguageLookupEntry>();

  for (const entry of iso6393) {
    const normalized: LanguageLookupEntry = {
      iso2: entry.iso6391 ? entry.iso6391.toLowerCase() : undefined,
      iso3: entry.iso6393.toLowerCase(),
      name: entry.name,
    };

    const codes: string[] = [entry.iso6393, entry.iso6392B, entry.iso6392T, entry.iso6391]
      .map((code) => (code ? code.toLowerCase() : undefined))
      .filter((code): code is string => typeof code === "string" && code.length > 0);

    for (const code of codes) {
      lookup.set(code, normalized);
    }
  }

  return lookup;
})();

type ResolvedLanguage = {
  base: string;
  iso2?: string;
  iso3?: string;
  normalized: string;
  displayName: string;
  region?: string;
};

function resolveLanguageInfo(raw: string | undefined | null): ResolvedLanguage {
  const cleaned = raw?.trim().toLowerCase() ?? "";
  if (!cleaned) {
    return {
      base: "und",
      iso2: undefined,
      iso3: undefined,
      normalized: "und",
      displayName: "Unknown",
    };
  }

  const [base, region] = cleaned.split(/[-_]/, 2);
  const lookup = LANGUAGE_LOOKUP.get(base);
  const iso2 = lookup?.iso2 ?? (ISO6391.validate(base) ? base : undefined);
  const iso3 = lookup?.iso3 ?? (base.length === 3 ? base : undefined);
  const normalized = iso2 ?? iso3 ?? base;
  const displayName =
    (iso2 && ISO6391.getName(iso2)) ||
    lookup?.name ||
    (iso3 ? iso3.toUpperCase() : base.toUpperCase());

  return {
    base,
    iso2,
    iso3,
    normalized,
    displayName,
    region: region?.toLowerCase(),
  };
}

const externalIdsCache = new Map<string, ExternalIds | null>();
let animeListDocumentPromise: Promise<Document> | null = null;
const aniDbEpisodeCache = new Map<number, Map<string, number>>();
let lastAniDbRequestTs = 0;

type MovieMetadata = {
  tmdbId: number | null;
  titles: string[];
  year?: number;
};

const movieMetadataCache = new Map<string, MovieMetadata | null>();

function normalizeFilter(value?: string | string[] | null): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => entry.toLowerCase());
  }

  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

async function fetchWithProxyFallback(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await proxyFetch(url, options);
  } catch (error) {
    console.warn("[Animetosho] Proxy fetch failed, falling back to direct fetch:", error);
    return fetch(url, options);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickTmdbApiKey(): string {
  return TMDB_API_KEYS[Math.floor(Math.random() * TMDB_API_KEYS.length)];
}

function safeParseInt(value: string | null | undefined, defaultValue = 0): number {
  if (value === undefined || value === null || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getAttribute(element: Element, attributeName: string): string | null {
  const value = element.getAttribute(attributeName);
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return value;
}

function findChildElements(parent: Element, tagName: string): Element[] {
  const nodes: Element[] = [];
  const children = parent.getElementsByTagName(tagName);

  for (let index = 0; index < children.length; index += 1) {
    const item = children.item(index);
    if (item && item.parentNode === parent && item.nodeType === 1) {
      nodes.push(item as Element);
    }
  }

  return nodes;
}

async function resolveExternalIds(imdbId: string): Promise<ExternalIds | null> {
  if (externalIdsCache.has(imdbId)) {
    return externalIdsCache.get(imdbId) ?? null;
  }

  const apiKey = pickTmdbApiKey();
  const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;

  try {
    const findResponse = await fetch(findUrl);
    if (!findResponse.ok) {
      console.warn(
        `[Animetosho] Failed to resolve TMDb data for ${imdbId}. Status: ${findResponse.status}`,
      );
      externalIdsCache.set(imdbId, null);
      return null;
    }

    const findData = await findResponse.json();
    const tvResult = Array.isArray(findData?.tv_results) ? findData.tv_results[0] : null;

    if (!tvResult) {
      console.warn(`[Animetosho] No TV results matched IMDB ID ${imdbId}.`);
      externalIdsCache.set(imdbId, null);
      return null;
    }

    const tmdbId = typeof tvResult.id === "number" ? tvResult.id : null;

    if (!tmdbId) {
      console.warn(`[Animetosho] TMDb result for ${imdbId} did not include a TMDb ID.`);
      externalIdsCache.set(imdbId, null);
      return null;
    }

    const externalIdsUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${apiKey}`;
    const externalIdsResponse = await fetch(externalIdsUrl);

    if (!externalIdsResponse.ok) {
      console.warn(
        `[Animetosho] Failed to resolve external IDs for TMDb ${tmdbId}. Status: ${externalIdsResponse.status}`,
      );
      externalIdsCache.set(imdbId, null);
      return null;
    }

    const externalIdsData = await externalIdsResponse.json();
    const tvdbId = typeof externalIdsData?.tvdb_id === "number" ? externalIdsData.tvdb_id : null;

    if (!tvdbId) {
      console.warn(`[Animetosho] No TVDB ID found for TMDb ${tmdbId} (IMDB ${imdbId}).`);
    }

    const resolved: ExternalIds = {
      tvdbId,
      tmdbId,
      title: typeof tvResult.name === "string" ? tvResult.name : undefined,
    };

    externalIdsCache.set(imdbId, resolved);
    return resolved;
  } catch (error) {
    console.error(`[Animetosho] Error resolving external IDs for ${imdbId}:`, error);
    externalIdsCache.set(imdbId, null);
    return null;
  }
}

async function resolveMovieMetadata(imdbId: string): Promise<MovieMetadata | null> {
  if (movieMetadataCache.has(imdbId)) {
    return movieMetadataCache.get(imdbId) ?? null;
  }

  const apiKey = pickTmdbApiKey();

  try {
    const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    const findResponse = await fetch(findUrl);

    if (!findResponse.ok) {
      console.warn(
        `[Animetosho] Failed to resolve movie metadata for ${imdbId}. Status: ${findResponse.status}`,
      );
      movieMetadataCache.set(imdbId, null);
      return null;
    }

    const findData = await findResponse.json();
    const movieResults = Array.isArray(findData?.movie_results) ? findData.movie_results : [];

    if (movieResults.length === 0) {
      console.warn(`[Animetosho] No movie metadata matched IMDB ID ${imdbId}.`);
      movieMetadataCache.set(imdbId, null);
      return null;
    }

    const primary = movieResults[0];
    const titles = new Set<string>();

    const addTitle = (value: unknown) => {
      if (typeof value !== "string") {
        return;
      }

      const trimmed = value.trim();
      if (trimmed.length > 0) {
        titles.add(trimmed);
      }
    };

    addTitle(primary?.title);
    addTitle(primary?.original_title);

    let year: number | undefined;
    if (typeof primary?.release_date === "string" && primary.release_date.trim().length >= 4) {
      const parsedYear = Number.parseInt(primary.release_date.slice(0, 4), 10);
      if (Number.isFinite(parsedYear)) {
        year = parsedYear;
      }
    }

    const tmdbId = typeof primary?.id === "number" ? primary.id : null;

    if (tmdbId !== null) {
      try {
        const detailsUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=alternative_titles`;
        const detailsResponse = await fetch(detailsUrl);

        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          addTitle(detailsData?.title);
          addTitle(detailsData?.original_title);

          if (Array.isArray(detailsData?.alternative_titles?.titles)) {
            for (const alternative of detailsData.alternative_titles.titles) {
              addTitle(alternative?.title);
            }
          }

          if (!year && typeof detailsData?.release_date === "string") {
            const parsedYear = Number.parseInt(detailsData.release_date.slice(0, 4), 10);
            if (Number.isFinite(parsedYear)) {
              year = parsedYear;
            }
          }
        } else {
          console.warn(
            `[Animetosho] Failed to fetch TMDb movie details for ${tmdbId}. Status: ${detailsResponse.status}`,
          );
        }
      } catch (detailsError) {
        console.error(
          `[Animetosho] Error fetching TMDb details for movie ${tmdbId}:`,
          detailsError,
        );
      }
    }

    const cleanedTitles = Array.from(titles);

    if (cleanedTitles.length === 0) {
      movieMetadataCache.set(imdbId, null);
      return null;
    }

    const metadata: MovieMetadata = {
      tmdbId,
      titles: cleanedTitles,
      year,
    };

    movieMetadataCache.set(imdbId, metadata);
    return metadata;
  } catch (error) {
    console.error(`[Animetosho] Error resolving movie metadata for IMDB ${imdbId}:`, error);
    movieMetadataCache.set(imdbId, null);
    return null;
  }
}

function buildMovieQueries(titles: string[], year?: number): string[] {
  const queries = new Set<string>();

  for (const title of titles) {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      continue;
    }

    queries.add(trimmed);

    const sanitized = sanitizeTitleForSearch(trimmed);
    if (sanitized && sanitized !== trimmed) {
      queries.add(sanitized);
    }

    if (year) {
      queries.add(`${trimmed} ${year}`);
      if (sanitized && sanitized !== trimmed) {
        queries.add(`${sanitized} ${year}`);
      }
    }
  }

  return Array.from(queries).slice(0, 12);
}

function collectMovieTokens(titles: string[], year?: number): string[] {
  const tokenSet = new Set<string>();

  for (const title of titles) {
    for (const token of tokenizeTitle(title)) {
      tokenSet.add(token);
    }
  }

  if (year) {
    tokenSet.add(String(year));
  }

  return Array.from(tokenSet);
}

function isLikelyEpisodeTitle(title?: string | null): boolean {
  if (!title) {
    return false;
  }

  const lower = title.toLowerCase();
  const patterns = [
    /s\d{1,2}e\d{1,3}/i,
    /\b\d{1,2}x\d{1,3}\b/,
    /episode\s*\d+/i,
    /\bep\s*\d+\b/i,
    /\bpart\s*\d+\b/i,
  ];

  return patterns.some((pattern) => pattern.test(lower));
}

function entryMatchesMovieTitles(
  candidate: string | undefined,
  titles: string[],
  year?: number,
): boolean {
  if (!candidate) {
    return false;
  }

  const normalizedCandidate = sanitizeTitleForSearch(candidate).toLowerCase();
  if (!normalizedCandidate) {
    return false;
  }

  const yearPattern = year ? new RegExp(`\\b${year}\\b`) : null;

  for (const title of titles) {
    const normalizedTitle = sanitizeTitleForSearch(title).toLowerCase();
    if (!normalizedTitle) {
      continue;
    }

    if (!normalizedCandidate.includes(normalizedTitle)) {
      continue;
    }

    if (normalizedTitle.length <= 3) {
      if (yearPattern) {
        if (!yearPattern.test(normalizedCandidate)) {
          continue;
        }
      } else if (normalizedCandidate !== normalizedTitle) {
        continue;
      }
    }

    return true;
  }

  if (yearPattern && yearPattern.test(normalizedCandidate)) {
    return true;
  }

  return false;
}

async function loadAnimeListDocument(): Promise<Document | null> {
  if (!animeListDocumentPromise) {
    animeListDocumentPromise = (async () => {
      const response = await fetch(ANIME_LIST_URL);
      if (!response.ok) {
        throw new Error(`Failed to download anime-list.xml (status ${response.status}).`);
      }

      const xmlText = await response.text();
      const parser = new DOMParser();
      return parser.parseFromString(xmlText, "application/xml");
    })().catch((error) => {
      console.error("[Animetosho] Unable to prepare anime list document:", error);
      throw error;
    });
  }

  try {
    return await animeListDocumentPromise;
  } catch (error) {
    animeListDocumentPromise = null;
    console.error("[Animetosho] Failed to cache anime list document:", error);
    return null;
  }
}

function parseEpisodeFromMapping(entry: string): { anidb: number | null; tvdbEpisodes: number[] } {
  const trimmed = entry.trim();
  if (!trimmed) {
    return { anidb: null, tvdbEpisodes: [] };
  }

  const [anidbPart, tvdbPart] = trimmed.split("-");
  if (!anidbPart || !tvdbPart) {
    return { anidb: null, tvdbEpisodes: [] };
  }

  const anidbEpisode = Number.parseInt(anidbPart, 10);
  const tvdbEpisodes = tvdbPart
    .split("+")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  return {
    anidb: Number.isFinite(anidbEpisode) ? anidbEpisode : null,
    tvdbEpisodes,
  };
}

function findMappedEpisode(animeNode: Element, season: string, tvdbEpisode: number): number | null {
  const mappingLists = findChildElements(animeNode, "mapping-list");

  for (const mappingList of mappingLists) {
    const mappingNodes = findChildElements(mappingList, "mapping");

    for (const mappingNode of mappingNodes) {
      const mappingSeason = getAttribute(mappingNode, "tvdbseason");
      if (mappingSeason && mappingSeason !== season) {
        continue;
      }

      const raw = mappingNode.textContent ?? "";
      const parts = raw.split(";").filter((entry) => entry.trim().length > 0);

      for (const part of parts) {
        const { anidb, tvdbEpisodes } = parseEpisodeFromMapping(part);

        if (anidb === null) {
          continue;
        }

        if (tvdbEpisodes.includes(tvdbEpisode)) {
          return anidb;
        }
      }
    }
  }

  return null;
}

function findAnimeNodesBySeason(doc: Document, tvdbId: number, season: string): Element[] {
  const nodes = Array.from(doc.getElementsByTagName("anime"));
  const tvdbString = String(tvdbId);

  return nodes.filter((node) => {
    const tvdbAttr = getAttribute(node, "tvdbid");
    const seasonAttr = getAttribute(node, "defaulttvdbseason");

    if (!tvdbAttr || !seasonAttr) {
      return false;
    }

    const matchesId = tvdbAttr
      .split(",")
      .map((value) => value.trim())
      .includes(tvdbString);
    return matchesId && seasonAttr === season;
  });
}

function findSpecialAnimeNodes(doc: Document, tvdbId: number): Element[] {
  const nodes = Array.from(doc.getElementsByTagName("anime"));
  const tvdbString = String(tvdbId);

  return nodes.filter((node) => {
    const tvdbAttr = getAttribute(node, "tvdbid");
    const seasonAttr = getAttribute(node, "defaulttvdbseason");

    if (!tvdbAttr || !seasonAttr) {
      return false;
    }

    const matchesId = tvdbAttr
      .split(",")
      .map((value) => value.trim())
      .includes(tvdbString);
    return matchesId && seasonAttr === "a";
  });
}

function convertSpecialMapping(
  nodes: Element[],
  targetSeason: string,
  episode: number,
): AniDbMappingResult | null {
  for (const node of nodes) {
    const mappingLists = findChildElements(node, "mapping-list");
    for (const mappingList of mappingLists) {
      const mappingNodes = findChildElements(mappingList, "mapping");
      const seasonMappings = mappingNodes.filter((mappingNode) => {
        const seasonAttr = getAttribute(mappingNode, "tvdbseason");
        return seasonAttr === targetSeason;
      });

      if (seasonMappings.length === 0) {
        continue;
      }

      const matchingNode = seasonMappings[0];
      const mappedEpisode = findMappedEpisode(node, targetSeason, episode);

      if (mappedEpisode !== null) {
        return {
          seriesId: safeParseInt(getAttribute(node, "anidbid")),
          episodeNumber: mappedEpisode,
          offset: 0,
        };
      }

      const offset = safeParseInt(getAttribute(matchingNode, "offset"));
      const anidbId = safeParseInt(getAttribute(node, "anidbid"));

      if (!anidbId) {
        continue;
      }

      return {
        seriesId: anidbId,
        episodeNumber: episode - offset,
        offset,
      };
    }
  }

  return null;
}

function resolveAniDbEpisode(
  doc: Document,
  tvdbId: number,
  season: number,
  episode: number,
): AniDbMappingResult | null {
  const seasonString = String(season);
  const candidates = findAnimeNodesBySeason(doc, tvdbId, seasonString);

  if (candidates.length > 0) {
    const enriched = candidates.map((node) => ({
      node,
      episodeOffset: safeParseInt(getAttribute(node, "episodeoffset")),
      id: safeParseInt(getAttribute(node, "anidbid")),
    }));

    enriched.sort((a, b) => a.episodeOffset - b.episodeOffset);

    for (const entry of enriched) {
      const direct = findMappedEpisode(entry.node, seasonString, episode);
      if (direct !== null) {
        return {
          seriesId: entry.id,
          episodeNumber: direct,
          offset: 0,
        };
      }
    }

    for (const entry of enriched.slice().reverse()) {
      if (!entry.id) {
        continue;
      }

      if (episode > entry.episodeOffset) {
        return {
          seriesId: entry.id,
          episodeNumber: episode - entry.episodeOffset,
          offset: entry.episodeOffset,
        };
      }
    }
  }

  const specialNodes = findSpecialAnimeNodes(doc, tvdbId);
  return convertSpecialMapping(specialNodes, seasonString, episode);
}

async function loadAniDbEpisodeMap(seriesId: number): Promise<Map<string, number> | null> {
  if (aniDbEpisodeCache.has(seriesId)) {
    return aniDbEpisodeCache.get(seriesId) ?? null;
  }

  const envVars = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const clientKey = envVars?.ANIDB_CLIENT;
  const clientVer = envVars?.ANIDB_CLIENT_VER ?? "1";

  if (!clientKey) {
    console.warn("[Animetosho] ANIDB_CLIENT is not configured. Skipping AniDB lookup.");
    aniDbEpisodeCache.set(seriesId, new Map());
    return null;
  }

  const now = Date.now();
  const elapsed = now - lastAniDbRequestTs;
  if (elapsed < 2000) {
    await sleep(2000 - elapsed);
  }

  const url = new URL("http://api.anidb.net:9001/httpapi");
  url.searchParams.set("request", "anime");
  url.searchParams.set("client", clientKey);
  url.searchParams.set("clientver", String(clientVer));
  url.searchParams.set("protover", "1");
  url.searchParams.set("aid", String(seriesId));

  lastAniDbRequestTs = Date.now();

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Wyzie-API-Animetosho/1.0",
      },
    });

    if (!response.ok) {
      console.warn(
        `[Animetosho] AniDB request for ${seriesId} failed with status ${response.status}.`,
      );
      return null;
    }

    const xml = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const root = doc.documentElement;
    const responseCode = root?.getAttribute("code");

    if (responseCode === "500") {
      console.error("[Animetosho] AniDB API reported abuse detection (code 500).");
      return null;
    }

    if (responseCode === "302") {
      console.error("[Animetosho] AniDB API client is disabled or does not exist (code 302).");
      return null;
    }

    const episodesNodes = root.getElementsByTagName("episodes");
    const episodesNode = episodesNodes?.item(0) as Element | null;

    if (!episodesNode) {
      console.warn(`[Animetosho] AniDB response for ${seriesId} did not contain episodes.`);
      return null;
    }

    const episodeMap = new Map<string, number>();
    const episodeNodes = episodesNode.getElementsByTagName("episode");

    for (let index = 0; index < episodeNodes.length; index += 1) {
      const episodeNode = episodeNodes.item(index) as Element | null;
      if (!episodeNode) {
        continue;
      }

      const idAttr = getAttribute(episodeNode, "id");
      const epnoNode = episodeNode.getElementsByTagName("epno").item(0);
      const epnoText = epnoNode?.textContent?.trim();

      if (!idAttr || !epnoText) {
        continue;
      }

      const episodeId = Number.parseInt(idAttr, 10);
      if (!Number.isFinite(episodeId)) {
        continue;
      }

      episodeMap.set(epnoText, episodeId);
    }

    aniDbEpisodeCache.set(seriesId, episodeMap);
    return episodeMap;
  } catch (error) {
    console.error(`[Animetosho] Failed to fetch AniDB episodes for ${seriesId}:`, error);
    return null;
  }
}

async function resolveAniDbEpisodeId(
  seriesId: number,
  episodeNumber: number,
): Promise<number | null> {
  const episodeMap = await loadAniDbEpisodeMap(seriesId);
  if (!episodeMap) {
    return null;
  }

  const episodeId = episodeMap.get(String(episodeNumber));
  if (episodeId !== undefined) {
    return episodeId;
  }

  return null;
}

function detectHearingImpaired(candidate: string): boolean {
  return /\b(hi|sdh|hearing impaired|hearing-impaired)\b/i.test(candidate);
}

function formatFromAttachment(attachment: AnimetoshoAttachment, parent: AnimetoshoFile): string {
  const codec = attachment.info?.codec;
  if (codec && typeof codec === "string" && codec.trim().length > 0) {
    return codec.trim().toLowerCase();
  }

  const filename = attachment.filename ?? parent.filename ?? "";
  const match = filename.match(/\.([^.]+)$/);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  return "unknown";
}

function detectEncoding(descriptor: string, format: string): string {
  const lowered = descriptor.toLowerCase();
  if (/utf[-_]?8/.test(lowered)) {
    return "utf-8";
  }
  if (/utf[-_]?16/.test(lowered)) {
    return "utf-16";
  }
  if (/shift[-_]?jis/.test(lowered)) {
    return "shift-jis";
  }
  if (/gb[-_]?2312/.test(lowered)) {
    return "gb2312";
  }
  if (/iso[-_]?8859[-_]?1/.test(lowered)) {
    return "iso-8859-1";
  }

  if (["ass", "ssa", "srt", "vtt"].includes(format)) {
    return "utf-8";
  }

  return "unknown";
}

function buildDownloadUrl(attachmentId: number): string {
  const hex = attachmentId.toString(16).padStart(8, "0");
  return `${ANIMETOSHO_STORAGE_URL}/${hex}/${attachmentId}.xz`;
}

function toResponse(
  attachment: AnimetoshoAttachment,
  parent: AnimetoshoFile,
  entry: AnimetoshoFeedEntry,
  request: RequestType,
): ResponseType | null {
  const languageFilters = normalizeFilter(request.languages);
  const formatFilters = normalizeFilter(request.formats);
  const encodingFilters = normalizeFilter(request.encodings);

  const attachmentId = attachment.id;
  if (!Number.isFinite(attachmentId)) {
    return null;
  }

  const rawLang = attachment.info?.lang;
  const resolvedLanguage = resolveLanguageInfo(rawLang);
  const normalizedLanguage = resolvedLanguage.normalized;

  if (languageFilters.length > 0) {
    const candidateCodes = [
      resolvedLanguage.normalized,
      resolvedLanguage.iso2,
      resolvedLanguage.iso3,
      resolvedLanguage.base,
      rawLang?.toLowerCase(),
    ].filter((code): code is string => Boolean(code && code.length > 0));

    const matches = candidateCodes.some((code) => languageFilters.includes(code.toLowerCase()));
    if (!matches) {
      return null;
    }
  }

  const format = formatFromAttachment(attachment, parent);
  if (formatFilters.length > 0 && !formatFilters.includes(format)) {
    return null;
  }

  const descriptor = `${attachment.info?.name ?? ""} ${attachment.filename ?? ""}`;
  const isHearingImpaired = detectHearingImpaired(descriptor);
  if (request.hearingImpaired && !isHearingImpaired) {
    return null;
  }

  const encoding = detectEncoding(descriptor, format);
  if (encodingFilters.length > 0 && !encodingFilters.includes(encoding)) {
    return null;
  }

  const displayName = resolvedLanguage.displayName;
  const isBrazilian = resolvedLanguage.base === "por" && /brazil/i.test(descriptor);
  const regionCode =
    resolvedLanguage.region && /^[a-z]{2}$/i.test(resolvedLanguage.region) ?
      resolvedLanguage.region.toUpperCase()
    : undefined;
  const mappedCountry =
    resolvedLanguage.iso2 ? languageToCountryCode[resolvedLanguage.iso2] : undefined;
  const countryCode = ((): string => {
    if (isBrazilian) {
      return "BR";
    }
    if (regionCode) {
      return regionCode;
    }
    if (mappedCountry) {
      return mappedCountry;
    }
    return "US";
  })();

  return {
    id: `${attachmentId}`,
    url: buildDownloadUrl(attachmentId),
    flagUrl: `https://flagsapi.com/${countryCode}/flat/24.png`,
    format,
    encoding,
    display: displayName,
    language: normalizedLanguage,
    media: entry.title ?? parent.filename ?? "Unknown",
    isHearingImpaired,
    source: "animetosho",
    release:
      (entry.title && entry.title.trim().length > 0 ? entry.title.trim() : undefined) ??
      (attachment.filename && attachment.filename.trim().length > 0 ?
        attachment.filename.trim()
      : null),
    releases: [entry.title, attachment.filename]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0),
    origin: extractOrigin(entry.title) ?? extractOrigin(attachment.filename) ?? null,
    fileName: attachment.filename ?? null,
  };
}

function extractSubtitles(
  details: AnimetoshoTorrentDetails | null,
  entry: AnimetoshoFeedEntry,
  request: RequestType,
  titleTokens?: string[],
): ResponseType[] {
  if (!details || !Array.isArray(details.files)) {
    return [];
  }

  const results: ResponseType[] = [];

  for (const file of details.files) {
    if (!Array.isArray(file.attachments)) {
      continue;
    }

    for (const attachment of file.attachments) {
      if ((attachment.type ?? "").toLowerCase() !== "subtitle") {
        continue;
      }

      if (
        titleTokens &&
        titleTokens.length > 0 &&
        !matchesTitleTokens(entry, file, attachment, titleTokens)
      ) {
        continue;
      }

      const response = toResponse(attachment, file, entry, request);
      if (response) {
        results.push(response);
      }
    }
  }

  return results;
}

async function fetchEpisodeEntries(episodeId: number): Promise<AnimetoshoFeedEntry[]> {
  const url = `${ANIMETOSHO_FEED_URL}?eid=${episodeId}`;
  try {
    const response = await fetchWithProxyFallback(url);
    if (!response.ok) {
      console.warn(
        `[Animetosho] Episode feed request for ${episodeId} failed with status ${response.status}.`,
      );
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter((entry) => entry && entry.status === "complete")
      .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  } catch (error) {
    console.error(`[Animetosho] Unable to fetch episode entries for ${episodeId}:`, error);
    return [];
  }
}

async function fetchTorrentDetails(torrentId: number): Promise<AnimetoshoTorrentDetails | null> {
  const url = `${ANIMETOSHO_FEED_URL}?show=torrent&id=${torrentId}`;
  try {
    const response = await fetchWithProxyFallback(url);
    if (!response.ok) {
      console.warn(
        `[Animetosho] Torrent detail request for ${torrentId} failed with status ${response.status}.`,
      );
      return null;
    }

    const data = await response.json();
    return data as AnimetoshoTorrentDetails;
  } catch (error) {
    console.error(`[Animetosho] Unable to fetch torrent details for ${torrentId}:`, error);
    return null;
  }
}

export async function searchAnimetosho(request: RequestType): Promise<ResponseType[]> {
  if (!request.imdbId) {
    console.warn("[Animetosho] Request did not include an IMDB ID. Skipping provider.");
    return [];
  }

  const hasSeason = typeof request.season === "number";
  const hasEpisode = typeof request.episode === "number";

  if (hasSeason !== hasEpisode) {
    console.warn(
      "[Animetosho] Season and episode must both be provided for episodic Animetosho requests.",
    );
    return [];
  }

  if (hasSeason && hasEpisode) {
    return await searchAnimetoshoEpisode(request);
  }

  return await searchAnimetoshoMovie(request);
}

async function searchAnimetoshoEpisode(request: RequestType): Promise<ResponseType[]> {
  const imdbId = request.imdbId as string;
  const season = request.season as number;
  const episode = request.episode as number;

  const externalIds = await resolveExternalIds(imdbId);
  const fallbackTitle = externalIds?.title;
  let fallbackCache: ResponseType[] | null = null;

  const ensureFallback = async (): Promise<ResponseType[]> => {
    if (fallbackCache !== null) {
      return fallbackCache;
    }

    if (!fallbackTitle) {
      fallbackCache = [];
      return fallbackCache;
    }

    fallbackCache = await searchAnimetoshoByKeyword(fallbackTitle, request);
    return fallbackCache;
  };

  if (!externalIds?.tvdbId) {
    console.warn(
      `[Animetosho] Unable to resolve TVDB identifier for IMDB ${imdbId}. Falling back to keyword search.`,
    );
    return ensureFallback();
  }

  const animeDoc = await loadAnimeListDocument();
  if (!animeDoc) {
    return ensureFallback();
  }

  const mapping = resolveAniDbEpisode(animeDoc, externalIds.tvdbId, season, episode);

  if (!mapping) {
    console.warn(
      `[Animetosho] Unable to map TVDB ${externalIds.tvdbId} S${season}E${episode} to AniDB identifiers. Attempting keyword search.`,
    );
    return ensureFallback();
  }

  const episodeId = await resolveAniDbEpisodeId(mapping.seriesId, mapping.episodeNumber);
  if (!episodeId) {
    console.warn(
      `[Animetosho] AniDB episode ID not found for series ${mapping.seriesId} episode ${mapping.episodeNumber}. Attempting keyword search.`,
    );
    return ensureFallback();
  }

  const entries = await fetchEpisodeEntries(episodeId);
  if (entries.length === 0) {
    return ensureFallback();
  }

  const limit = Math.max(1, ANIMETOSHO_SEARCH_THRESHOLD);
  const results: ResponseType[] = [];
  const unique = new Map<string, ResponseType>();

  for (const entry of entries.slice(0, limit)) {
    const details = await fetchTorrentDetails(entry.id);
    const subtitles = extractSubtitles(details, entry, request);

    for (const subtitle of subtitles) {
      const key = `${subtitle.id}:${subtitle.url}`;
      if (!unique.has(key)) {
        unique.set(key, subtitle);
        results.push(subtitle);
      }
    }
  }

  if (results.length === 0) {
    return ensureFallback();
  }

  return results;
}

async function searchAnimetoshoMovie(request: RequestType): Promise<ResponseType[]> {
  const imdbId = request.imdbId as string;
  const metadata = await resolveMovieMetadata(imdbId);

  if (!metadata) {
    console.warn(`[Animetosho] Unable to resolve movie metadata for IMDB ${imdbId}.`);
    return [];
  }

  if (metadata.titles.length === 0) {
    console.warn(`[Animetosho] Movie metadata for IMDB ${imdbId} did not contain any titles.`);
    return [];
  }

  const queries = buildMovieQueries(metadata.titles, metadata.year);
  if (queries.length === 0) {
    console.warn(`[Animetosho] Unable to build search queries for IMDB ${imdbId}.`);
    return [];
  }

  const tokens = collectMovieTokens(metadata.titles, metadata.year);
  const requireStrictTitleMatch = tokens.length === 0;

  const limit = Math.max(1, ANIMETOSHO_SEARCH_THRESHOLD);
  const entriesById = new Map<number, AnimetoshoFeedEntry>();

  for (const query of queries) {
    const entries = await fetchKeywordEntries(query);

    for (const entry of entries) {
      if (isLikelyEpisodeTitle(entry.title)) {
        continue;
      }

      if (
        requireStrictTitleMatch &&
        !entryMatchesMovieTitles(entry.title, metadata.titles, metadata.year)
      ) {
        continue;
      }

      if (!entriesById.has(entry.id)) {
        entriesById.set(entry.id, entry);
      }

      if (entriesById.size >= limit) {
        break;
      }
    }

    if (entriesById.size >= limit) {
      break;
    }
  }

  if (entriesById.size === 0) {
    console.warn(`[Animetosho] No movie matches found for IMDB ${imdbId}.`);
    return [];
  }

  const orderedEntries = Array.from(entriesById.values())
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, limit);

  const unique = new Map<string, ResponseType>();
  const results: ResponseType[] = [];

  for (const entry of orderedEntries) {
    const details = await fetchTorrentDetails(entry.id);
    const subtitles = extractSubtitles(
      details,
      entry,
      request,
      tokens.length > 0 ? tokens : undefined,
    );

    for (const subtitle of subtitles) {
      if (
        requireStrictTitleMatch &&
        !entryMatchesMovieTitles(subtitle.media, metadata.titles, metadata.year)
      ) {
        continue;
      }

      const key = `${subtitle.id}:${subtitle.url}`;
      if (!unique.has(key)) {
        unique.set(key, subtitle);
        results.push(subtitle);
      }
    }
  }

  return results;
}

function sanitizeTitleForSearch(title: string): string {
  return title
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTitle(title: string): string[] {
  return sanitizeTitleForSearch(title)
    .split(" ")
    .map((entry) => entry.toLowerCase())
    .filter((entry) => entry.length >= 3);
}

function buildKeywordQueries(title: string, season: number, episode: number): string[] {
  const cleanedTitle = sanitizeTitleForSearch(title);
  const seasonPadded = season.toString().padStart(2, "0");
  const episodePadded = episode.toString().padStart(2, "0");
  const baseQueries = [
    `${cleanedTitle} S${seasonPadded}E${episodePadded}`,
    `${cleanedTitle} ${season}x${episode}`,
    `${cleanedTitle} season ${season} episode ${episode}`,
    `${cleanedTitle} episode ${episode}`,
  ];

  return Array.from(
    new Set(baseQueries.map((entry) => entry.trim()).filter((entry) => entry.length > 0)),
  );
}

function matchesEpisodeTitle(title: string | undefined, season: number, episode: number): boolean {
  if (!title) {
    return false;
  }

  const lower = title.toLowerCase();
  const seasonPadded = season.toString().padStart(2, "0");
  const episodePadded = episode.toString().padStart(2, "0");
  const patterns = [
    new RegExp(`s${seasonPadded}e${episodePadded}`, "i"),
    new RegExp(`${season}x${episode}`, "i"),
    new RegExp(`season\s*${season}[^\d]*episode\s*${episode}`, "i"),
    new RegExp(`episode\s*${episode}`, "i"),
  ];

  if (patterns.some((pattern) => pattern.test(lower))) {
    return true;
  }

  const episodeWordPattern = /episodes?/i;
  const episodeNumberPattern = new RegExp(`\\b${episode}\\b`);
  const hasEpisodeIndicator = episodeWordPattern.test(lower) && episodeNumberPattern.test(lower);
  if (hasEpisodeIndicator) {
    return true;
  }

  const hasSeasonIndicator =
    new RegExp(`s${seasonPadded}\\b`, "i").test(lower) ||
    new RegExp(`${season}\\s*x`, "i").test(lower) ||
    new RegExp(`season\\s*${season}\\b`, "i").test(lower);

  if (hasSeasonIndicator && episodeNumberPattern.test(lower)) {
    return true;
  }

  return false;
}

async function fetchKeywordEntries(query: string): Promise<AnimetoshoFeedEntry[]> {
  const url = `${ANIMETOSHO_FEED_URL}?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchWithProxyFallback(url);
    if (!response.ok) {
      console.warn(
        `[Animetosho] Keyword feed request for "${query}" failed with status ${response.status}.`,
      );
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter((entry) => entry && entry.status === "complete")
      .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  } catch (error) {
    console.error(`[Animetosho] Unable to fetch keyword entries for "${query}":`, error);
    return [];
  }
}

function countMatchingTokens(candidates: string[], tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of tokens) {
    if (candidateContainsToken(candidates, token)) {
      matches += 1;
    }
  }

  return matches;
}

function candidateContainsToken(candidates: string[], token: string): boolean {
  const lowered = token.toLowerCase();
  return candidates.some((candidate) => candidate.toLowerCase().includes(lowered));
}

function matchesTitleTokens(
  entry: AnimetoshoFeedEntry,
  parent: AnimetoshoFile,
  attachment: AnimetoshoAttachment,
  tokens: string[] | undefined,
): boolean {
  if (!tokens || tokens.length === 0) {
    return true;
  }

  const candidates = [
    entry.title ?? "",
    parent.filename ?? "",
    attachment.filename ?? "",
    attachment.info?.name ?? "",
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (candidates.length === 0) {
    return false;
  }

  const significantTokens = tokens.filter((token) => token.length >= 3);
  if (significantTokens.length === 0) {
    return true;
  }

  const matched = countMatchingTokens(candidates, significantTokens);

  // Require a small, bounded number of strong token matches so localized
  // alternative titles (which can add many tokens) do not filter out valid
  // subtitles while still ensuring some relevance.
  const required = Math.min(3, Math.max(1, Math.ceil(significantTokens.length / 4)));
  return matched >= required;
}

async function searchAnimetoshoByKeyword(
  title: string,
  request: RequestType,
): Promise<ResponseType[]> {
  if (request.season === undefined || request.episode === undefined) {
    return [];
  }

  const queries = buildKeywordQueries(title, request.season, request.episode);
  const titleTokens = tokenizeTitle(title);
  const limit = Math.max(1, ANIMETOSHO_SEARCH_THRESHOLD);
  const entriesById = new Map<number, AnimetoshoFeedEntry>();

  for (const query of queries) {
    const entries = await fetchKeywordEntries(query);
    for (const entry of entries) {
      if (!matchesEpisodeTitle(entry.title, request.season, request.episode)) {
        continue;
      }

      if (!entriesById.has(entry.id)) {
        entriesById.set(entry.id, entry);
      }

      if (entriesById.size >= limit) {
        break;
      }
    }

    if (entriesById.size >= limit) {
      break;
    }
  }

  if (entriesById.size === 0) {
    return [];
  }

  const orderedEntries = Array.from(entriesById.values())
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, limit);

  const unique = new Map<string, ResponseType>();
  const results: ResponseType[] = [];

  for (const entry of orderedEntries) {
    const details = await fetchTorrentDetails(entry.id);
    const subtitles = extractSubtitles(details, entry, request, titleTokens);

    for (const subtitle of subtitles) {
      const key = `${subtitle.id}:${subtitle.url}`;
      if (!unique.has(key)) {
        unique.set(key, subtitle);
        results.push(subtitle);
      }
    }
  }

  return results;
}
