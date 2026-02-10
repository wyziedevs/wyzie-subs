/** @format */

import {
  capitalizeFirstLetter,
  getMovieNameFromImdb,
  numberToCardinal,
  extractOrigin,
} from "~/utils/utils";
import type { RequestType, ResponseType, SubdlPageProps } from "~/utils/types";
import { languageToCountryCode } from "~/utils/lookup";
import { safeJsonParse } from "~/utils/json";
import { proxyFetch } from "~/utils/proxy";
import ISO6391 from "iso-639-1";

const buildId: string | null = "Ce4_1IeW-O1D1kv4jnft4";

export async function searchSubdl(request: RequestType): Promise<ResponseType[]> {
  console.log(`[SubDL Source] Searching with parameters:`, {
    imdbId: request.imdbId,
    season: request.season,
    episode: request.episode,
    languages: request.languages,
    formats: request.formats,
    encodings: request.encodings,
    hearingImpaired: request.hearingImpaired,
  });

  try {
    const fetcher = typeof proxyFetch === "function" ? proxyFetch : fetch;
    const baseHeaders = {
      "x-nextjs-data": "1",
    };
    const imdbId = request.imdbId?.trim();

    if (!imdbId) {
      console.warn("[SubDL Source] Missing IMDb ID for SubDL search.");
      return [];
    }

    const slugCandidates: string[] = [];
    const pushCandidate = (value?: string | null) => {
      if (!value) return;
      const normalized = value.trim();
      if (!normalized) return;
      const duplicate = slugCandidates.some(
        (existing) => existing.toLowerCase() === normalized.toLowerCase(),
      );
      if (!duplicate) {
        slugCandidates.push(normalized);
      }
    };

    const derivedTitle = await getMovieNameFromImdb(imdbId);
    pushCandidate(derivedTitle);
    pushCandidate(imdbId);

    if (slugCandidates.length === 0) {
      console.warn(`[SubDL Source] Unable to derive a SubDL search slug for IMDb ID ${imdbId}.`);
      return [];
    }

    interface SubdlNextSearchResponse {
      pageProps: {
        list: {
          type: "movie" | "tv";
          sd_id: string;
          name: string;
          original_name: string;
          poster_url: string;
          year: number;
          slug: string;
          subtitles_count: number;
        }[];
      };
      __N_SSP: boolean;
    }

    let searchData: SubdlNextSearchResponse | null = null;
    let successfulSlug: string | null = null;

    for (const slug of slugCandidates) {
      const encodedSlug = encodeURIComponent(slug);
      const searchApiUrl = `https://subdl.com/_next/data/${buildId}/en/search/${encodedSlug}.json?slug=${encodedSlug}`;
      const searchHeaders = {
        ...baseHeaders,
        referer: `https://subdl.com/search/${encodedSlug}`,
      };

      let response;
      try {
        response = await fetcher(searchApiUrl, { headers: searchHeaders });
        console.log(response);
      } catch (requestError) {
        console.warn(`[SubDL Source] Search request failed for slug "${slug}":`, requestError);
        continue;
      }

      if (!response.ok) {
        console.warn(
          `[SubDL Source] SubDL search slug "${slug}" returned status ${response.status}.`,
        );
        continue;
      }

      const responseText = await response.text();
      const parsed = safeJsonParse<SubdlNextSearchResponse>(responseText);

      if (parsed?.pageProps?.list && parsed.pageProps.list.length > 0) {
        searchData = parsed;
        successfulSlug = slug;
        break;
      }

      console.log(
        `[SubDL Source] SubDL search slug "${slug}" did not return any results. Trying next candidate...`,
      );
    }

    if (!searchData) {
      console.warn(
        `[SubDL Source] No SubDL results found for IMDb ID ${imdbId} after testing ${slugCandidates.length} search term(s).`,
      );
      return [];
    }

    if (successfulSlug) {
      console.log(`[SubDL Source] Using SubDL search results from slug "${successfulSlug}".`);
    }

    if (
      !searchData.pageProps ||
      !searchData.pageProps.list ||
      searchData.pageProps.list.length === 0
    ) {
      console.log(
        `[SubDL Source] No results found via Next.js data API for IMDb ID: ${request.imdbId}`,
      );
      return [];
    }

    const expectedType = request.season !== undefined ? "tv" : "movie";
    const candidateResults = searchData.pageProps.list.filter((item) => item.type === expectedType);
    const searchItems = candidateResults.length > 0 ? candidateResults : searchData.pageProps.list;

    type SubdlSearchItem = (typeof searchItems)[number];

    const collectFromSearchItem = async (
      searchResultItem: SubdlSearchItem,
    ): Promise<ResponseType[]> => {
      let finalSubtitleApiUrl = "";
      let finalReferer = "";
      let seasonSlug: string | null = null;

      const sdNumericId = searchResultItem.sd_id.replace(/^sd/i, "");

      if (searchResultItem.type === "movie") {
        finalSubtitleApiUrl = `https://subdl.com/_next/data/${buildId}/en/subtitle/${sdNumericId}/${searchResultItem.slug}.json?slug=${sdNumericId}&slug=${searchResultItem.slug}`;
        finalReferer = `https://subdl.com/movie/${searchResultItem.slug}`;
      } else if (searchResultItem.type === "tv") {
        if (request.season === undefined) {
          console.warn(
            `[SubDL Source] Skipping TV result ${searchResultItem.slug} because no season was requested.`,
          );
          return [];
        }

        const metadataApiUrl = `https://subdl.com/_next/data/${buildId}/en/subtitle/${sdNumericId}/${searchResultItem.slug}.json?slug=${sdNumericId}&slug=${searchResultItem.slug}`;
        const metadataReferer = `https://subdl.com/tv/${searchResultItem.slug}`;
        const metadataHeaders = { ...baseHeaders, referer: metadataReferer };

        const metadataResponse = await fetcher(metadataApiUrl, {
          headers: metadataHeaders,
        });

        if (!metadataResponse.ok) {
          console.warn(
            `[SubDL Source] Metadata request for slug ${searchResultItem.slug} returned status ${metadataResponse.status}. Skipping.`,
          );
          return [];
        }

        const metadataResponseText = await metadataResponse.text();

        interface SubdlNextMetadataResponse {
          pageProps: {
            movieInfo: {
              seasons?: { number: string; name: string }[];
            };
          };
          __N_SSP: boolean;
        }
        const metadataData = safeJsonParse<SubdlNextMetadataResponse>(metadataResponseText);
        if (!metadataData) {
          console.warn(
            `[SubDL Source] Failed to parse metadata JSON for slug ${searchResultItem.slug}.`,
          );
          return [];
        }
        const seasons = metadataData.pageProps?.movieInfo?.seasons;
        if (!seasons) {
          throw new Error(
            `[SubDL Source] Metadata API response did not contain expected seasons data (pageProps.movieInfo.seasons). Cannot determine season slug.`,
          );
        }

        const seasonInfo = seasons.find((s) => {
          const seasonNumberFromName = s.name.match(/^Season\s*(\d+)/i);
          if (seasonNumberFromName && parseInt(seasonNumberFromName[1]) === request.season) {
            return true;
          }
          const seasonName = numberToCardinal(request.season!);
          return s.number.includes(seasonName) || s.number === `season-${request.season}`;
        });

        if (seasonInfo && seasonInfo.number) {
          seasonSlug = seasonInfo.number;
          finalSubtitleApiUrl = `https://subdl.com/_next/data/${buildId}/en/subtitle/${sdNumericId}/${searchResultItem.slug}/${seasonSlug}.json?slug=${sdNumericId}&slug=${searchResultItem.slug}&slug=${seasonSlug}`;
          finalReferer = `https://subdl.com/tv/${searchResultItem.slug}/${seasonSlug}`;
        } else {
          throw new Error(
            `[SubDL Source] Could not find matching season slug for season ${request.season} in metadata response.`,
          );
        }
      } else {
        throw new Error(`Unknown search result type: ${searchResultItem.type}`);
      }

      if (!finalSubtitleApiUrl) {
        throw new Error("Failed to determine final subtitle API URL.");
      }

      const finalSubtitleHeaders = { ...baseHeaders, referer: finalReferer };

      const finalSubtitleResponse = await fetcher(finalSubtitleApiUrl, {
        headers: finalSubtitleHeaders,
      });

      if (!finalSubtitleResponse.ok) {
        console.warn(
          `[SubDL Source] Subtitle request for slug ${searchResultItem.slug} returned status ${finalSubtitleResponse.status}. Skipping.`,
        );
        return [];
      }

      const finalSubtitleResponseText = await finalSubtitleResponse.text();

      interface SubdlNextSubtitleResponse {
        pageProps: SubdlPageProps;
        __N_SSP: boolean;
      }

      const finalSubtitleData = safeJsonParse<SubdlNextSubtitleResponse>(finalSubtitleResponseText);
      if (!finalSubtitleData) {
        console.warn(
          `[SubDL Source] Failed to parse subtitle JSON for slug ${searchResultItem.slug}.`,
        );
        return [];
      }
      const pageProps = finalSubtitleData.pageProps;

      if (!pageProps || !pageProps.movieInfo) {
        throw new Error(
          "Failed to get page properties (pageProps) from the subtitle API endpoint.",
        );
      }

      if (!pageProps.groupedSubtitles) {
        console.log(`[SubDL Source] No subtitles found via subtitle API`);
        return [];
      }

      const isTvShow = request.season !== undefined && request.episode !== undefined;

      const collected: ResponseType[] = [];

      for (const [language, subtitles] of Object.entries(pageProps.groupedSubtitles)) {
        let langCode = "unknown";
        const lowerLangName = language.toLowerCase().trim();

        // Custom mapping for non-standard language names
        const customLanguageMap: Record<string, string> = {
          "brazillian-portuguese": "pt",
          "brazilian-portuguese": "pt",
          "brazilian portuguese": "pt",
          portugese: "pt",
          "chinese-bg-code": "zh",
          "chinese simplified": "zh",
          "chinese traditional": "zh",
          farsi_persian: "fa",
          "farsi/persian": "fa",
          farsi: "fa",
          ukranian: "uk",
          "português-brasileiro": "pt",
          "português-brasil": "pt",
        };

        // Check custom map first, then try ISO6391
        if (lowerLangName in customLanguageMap) {
          langCode = customLanguageMap[lowerLangName];
        } else {
          const isoLangCode = ISO6391.getCode(lowerLangName);
          if (isoLangCode) {
            langCode = isoLangCode.toLowerCase();
          } else {
            console.warn(
              `[SubDL] Could not find code for language name: "${language}", defaulting to 'unknown'.`,
            );
          }
        }

        if (
          request.languages &&
          request.languages.length > 0 &&
          !request.languages.includes(langCode)
        ) {
          continue;
        }

        for (const subtitle of subtitles) {
          const format = subtitle.quality.toLowerCase();
          if (request.formats && request.formats.length > 0 && !request.formats.includes(format)) {
            continue;
          }

          if (request.hearingImpaired === true && subtitle.hi !== 1) {
            continue;
          }

          if (isTvShow) {
            // for season pages, we need to check if the subtitle matches the requested episode
            // some subtitles have season/episode info, others have it in the title or link

            const hasMatchingEpisode =
              (subtitle.season === request.season && subtitle.episode === request.episode) ||
              (subtitle.title &&
                subtitle.title.match(
                  new RegExp(`S0?${request.season}E0?${request.episode}\\b`, "i"),
                )) ||
              (subtitle.link &&
                subtitle.link.match(
                  new RegExp(`(^|[^a-z0-9])e0?${request.episode}([^a-z0-9]|$)`, "i"),
                )) ||
              (subtitle.extra &&
                subtitle.extra.match(
                  new RegExp(`(^|[^a-z0-9])(ep|episode)\\s*0?${request.episode}([^a-z0-9]|$)`, "i"),
                ));

            if (!hasMatchingEpisode) {
              continue;
            }
          }

          const compatibleUrl = `subdl/${subtitle.n_id || subtitle.id}/${subtitle.link}`;

          const countryCode =
            languageToCountryCode[langCode] ||
            (langCode === "unknown" ? "UN" : langCode.toUpperCase());

          let mediaDisplay = pageProps.movieInfo.name;
          if (isTvShow) {
            mediaDisplay = `${pageProps.movieInfo.name} - S${request.season.toString().padStart(2, "0")}E${request.episode.toString().padStart(2, "0")}`;
          }

          const normalizedReleases =
            Array.isArray(subtitle.releases) ?
              subtitle.releases
                .map((entry) => entry?.trim())
                .filter((entry): entry is string => Boolean(entry && entry.length > 0))
            : [];

          const releasePriority = [
            subtitle.title,
            subtitle.extra,
            normalizedReleases[0],
            subtitle.link,
          ];
          let primaryRelease: string | null = null;
          for (const candidate of releasePriority) {
            if (typeof candidate !== "string") {
              continue;
            }
            const trimmed = candidate.trim();
            if (trimmed.length > 0) {
              primaryRelease = trimmed;
              break;
            }
          }

          const origin = primaryRelease ? extractOrigin(primaryRelease) : null;

          collected.push({
            id: subtitle.n_id || String(subtitle.id),
            url: compatibleUrl,
            flagUrl: `https://flagsapi.com/${countryCode}/flat/24.png`,
            format: subtitle.quality.toLowerCase(),
            encoding: "UTF-8",
            display: capitalizeFirstLetter(language),
            language: langCode,
            media: mediaDisplay,
            isHearingImpaired: subtitle.hi === 1,
            source: "subdl",
            release: primaryRelease ?? null,
            releases: normalizedReleases,
            origin,
            fileName: subtitle.link ?? null,
          });
        }
      }

      return collected;
    };

    const uniqueResults = new Map<string, ResponseType>();

    for (const item of searchItems.slice(0, 3)) {
      try {
        const subtitles = await collectFromSearchItem(item);
        for (const subtitle of subtitles) {
          const key = `${subtitle.id}-${subtitle.url}`;
          if (!uniqueResults.has(key)) {
            uniqueResults.set(key, subtitle);
          }
        }
      } catch (itemError) {
        console.warn(
          `[SubDL Source] Failed to collect subtitles for slug ${item.slug}:`,
          itemError,
        );
      }
    }

    return Array.from(uniqueResults.values());
  } catch (error) {
    console.error(`[SubDL Source] Error searching for subtitles:`, error);
    return [];
  }
}
