/** @format */

import { searchOpensubtitles, processOpenSubtitlesResults } from "~/sources/opensubs";
import type { RequestType, ResponseType } from "~/utils/types";
import { convertTmdbToImdb } from "~/utils/utils";
import { searchPodnapisi } from "~/sources/podnapisi";
import { searchSubf2m } from "~/sources/subf2m";
import { searchAnimetosho } from "~/sources/animetosho";
import { searchGestdown } from "~/sources/gestdown";
import { searchSubdl } from "~/sources/subdl";
import { sourcesConfig } from "~/sourcesConfig";

export async function search(request: RequestType): Promise<ResponseType[]> {
  try {
    if (!request.imdbId) {
      if (request.tmdbId) {
        const mediaType = request.season !== undefined ? "tv" : "movie";
        request.imdbId = await convertTmdbToImdb(`${request.tmdbId}`, mediaType);
      } else {
        throw new Error("imdbId or tmdbId is required");
      }
    }

    const safeRequest: RequestType = {
      ...request,
      imdbId: request.imdbId as string,
      tmdbId: undefined, // Clear tmdbId after conversion
    };

    const normalizeSource = (value: string) => value.trim().toLowerCase();
    const sources =
      Array.isArray(safeRequest.source) ? safeRequest.source.map(normalizeSource).filter(Boolean)
      : typeof safeRequest.source === "string" ?
        safeRequest.source.split(",").map(normalizeSource).filter(Boolean)
      : [];

    const results: ResponseType[] = [];

    if (sources.includes("all")) {
      console.log("[Search] Using all available enabled sources.");
      if (sourcesConfig.subdl) {
        results.push(...(await searchSubdl(safeRequest)));
      }
      if (sourcesConfig.subf2m) {
        results.push(...(await searchSubf2m(safeRequest)));
      }
      if (sourcesConfig.podnapisi) {
        results.push(...(await searchPodnapisi(safeRequest)));
      }
      if (sourcesConfig.animetosho) {
        console.log("[Search] Using Animetosho source (all sources mode).");
        results.push(...(await searchAnimetosho(safeRequest)));
      }
      if (sourcesConfig.gestdown) {
        if (safeRequest.season !== undefined && safeRequest.episode !== undefined) {
          console.log("[Search] Using Gestdown source (all sources mode).");
          results.push(...(await searchGestdown(safeRequest)));
        } else {
          console.log("[Search] Skipping Gestdown in all-sources mode: missing season/episode.");
        }
      }
      if (sourcesConfig.opensubtitles) {
        const osData = await searchOpensubtitles(safeRequest);
        results.push(...(await processOpenSubtitlesResults(osData, safeRequest)));
      }
      return results;
    }

    for (const source of sources) {
      if (source === "subdl" && sourcesConfig.subdl) {
        results.push(...(await searchSubdl(safeRequest)));
      } else if (source === "subf2m" && sourcesConfig.subf2m) {
        console.log("[Search] Using Subf2m source.");
        results.push(...(await searchSubf2m(safeRequest)));
      } else if (source === "opensubtitles" && sourcesConfig.opensubtitles) {
        console.log("[Search] Using OpenSubtitles source.");
        const data = await searchOpensubtitles(safeRequest);
        results.push(...(await processOpenSubtitlesResults(data, safeRequest)));
      } else if (source === "podnapisi" && sourcesConfig.podnapisi) {
        console.log("[Search] Using Podnapisi source.");
        results.push(...(await searchPodnapisi(safeRequest)));
      } else if (source === "animetosho" && sourcesConfig.animetosho) {
        console.log("[Search] Using Animetosho source.");
        results.push(...(await searchAnimetosho(safeRequest)));
      } else if (source === "gestdown" && sourcesConfig.gestdown) {
        if (safeRequest.season !== undefined && safeRequest.episode !== undefined) {
          console.log("[Search] Using Gestdown source.");
          results.push(...(await searchGestdown(safeRequest)));
        } else {
          console.warn(
            "[Search] Gestdown source requires both season and episode. Skipping this source.",
          );
        }
      } else if (source !== "all" && !sourcesConfig[source as keyof typeof sourcesConfig]) {
        console.warn(`[Search] Source disabled or unknown: ${source}`);
      }
    }

    if (results.length === 0 && sources.length === 0) {
      console.log("[Search] No specific source requested, using enabled defaults.");
      if (sourcesConfig.opensubtitles) {
        const data = await searchOpensubtitles(safeRequest);
        results.push(...(await processOpenSubtitlesResults(data, safeRequest)));
      }
      if (safeRequest.season !== undefined && safeRequest.episode !== undefined) {
        if (sourcesConfig.animetosho) {
          console.log("[Search] Adding Animetosho results by default for episodic request.");
          results.push(...(await searchAnimetosho(safeRequest)));
        }
        if (sourcesConfig.gestdown) {
          console.log("[Search] Adding Gestdown results by default for episodic request.");
          results.push(...(await searchGestdown(safeRequest)));
        }
      }
    }

    return results;
  } catch (e) {
    console.error(`[Search] Unexpected error in search function:`, e);
    return [];
  }
}
