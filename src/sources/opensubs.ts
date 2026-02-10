import { extractOrigin } from "~/utils/utils";
import type { RequestType, ResponseType } from "~/utils/types";
import { languageToCountryCode } from "~/utils/lookup";
import { parseSubtitles } from "~/utils/json";
import { proxyFetch } from "~/utils/proxy";

export const searchOpensubtitles = async (request: RequestType) => {
  const { imdbId, season, episode } = request;
  const url = `https://rest.opensubtitles.org/search/${
    season && episode ? `episode-${episode}/` : ""
  }imdbid-${imdbId.slice(2)}${season && episode ? `/season-${season}` : ""}`;
  const headers = {
    "Content-Type": "application/json",
    "X-User-Agent": "VLSub 0.10.3",
  };
  const res = await proxyFetch(url, { headers });
  const text = await res.text();

  return parseSubtitles(text);
};

export async function processOpenSubtitlesResults(
  data: any[],
  request: RequestType,
): Promise<ResponseType[]> {
  const subtitles: ResponseType[] = await Promise.all(
    data.map(async (sub) => {
      // Fix for potential OpenSubtitles data issue where Persian is labeled as Greek
      if (
        sub.ISO639 === "el" &&
        sub.LanguageName &&
        sub.LanguageName.toLowerCase().includes("persian")
      ) {
        sub.ISO639 = "fa";
      }
      const hearingImpairedMatch = !request.hearingImpaired || sub.SubHearingImpaired === "1";
      const languageMatch =
        !request.languages ||
        request.languages.length === 0 ||
        request.languages.includes(sub.ISO639);
      const formatMatch =
        !request.formats ||
        request.formats.length === 0 ||
        request.formats.includes(sub.SubFormat.toLowerCase());
      const encodingMatch =
        !request.encodings ||
        request.encodings.length === 0 ||
        request.encodings.includes(sub.SubEncoding.toLowerCase());

      if (languageMatch && formatMatch && hearingImpairedMatch && encodingMatch) {
        const releaseCandidates = new Set<string>();
        const addRelease = (value: unknown) => {
          if (typeof value !== "string") return;
          const trimmed = value.trim();
          if (trimmed.length === 0) return;
          releaseCandidates.add(trimmed);
        };

        addRelease(sub.MovieReleaseName);
        addRelease(sub.SubFileName);
        if (typeof sub.SubAuthorComment === "string") {
          addRelease(sub.SubAuthorComment.replace(/\r\n/g, "\n"));
        }

        const releases = Array.from(releaseCandidates);
        const primaryRelease = releases[0] ?? null;

        // Calculate origin from all available release info
        const origin = releases
          .map((r) => extractOrigin(r))
          .find((o) => o !== null) ?? null;

        const countryCode = languageToCountryCode[sub.ISO639] || sub.ISO639.toUpperCase();
        return {
          id: sub.IDSubtitleFile,
          url: sub.SubDownloadLink.replace(".gz", "").replace(
            "download/",
            "download/subencoding-utf8/",
          ),
          flagUrl: `https://flagsapi.com/${countryCode}/flat/24.png`,
          format: sub.SubFormat,
          encoding: sub.SubEncoding,
          display: sub.LanguageName,
          language: sub.ISO639,
          media: sub.MovieName,
          isHearingImpaired: sub.SubHearingImpaired === "1",
          source: "opensubtitles",
          release: primaryRelease,
          releases,
          origin,
          fileName: sub.SubFileName ?? null,
        };
      }
      return null;
    }),
  );
  return subtitles.filter((sub): sub is ResponseType => sub !== null);
}
