/** @format */

import type { Subtitle, SubtitleInput } from "~/utils/types";

/**
 * Safely parse JSON payloads that may contain leading noise or truncated responses.
 * Returns null when parsing fails instead of throwing, allowing callers to decide
 * how to proceed without crashing the request pipeline.
 */
export function safeJsonParse<T>(payload: string): T | null {
  if (!payload) {
    return null;
  }

  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  const attemptParse = (value: string) => {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      return null;
    }
  };

  const direct = attemptParse(trimmed);
  if (direct !== null) {
    return direct;
  }

  const firstBraceIndex = trimmed.search(/[\[{]/);
  if (firstBraceIndex > 0) {
    const sliced = trimmed.slice(firstBraceIndex);
    const slicedResult = attemptParse(sliced);
    if (slicedResult !== null) {
      return slicedResult;
    }
  }

  return null;
}

export function parseSubtitles(jsonString: string): Subtitle[] {
  const parsed = safeJsonParse(jsonString);
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Subtitle => isValidSubtitle(item));
  }

  const fragments = jsonString.split('{"MatchedBy":"imdbid"');
  const results: Subtitle[] = [];

  for (let i = 1; i < fragments.length; i++) {
    const fragment = '{"MatchedBy":"imdbid"' + fragments[i];
    const regex = /,"Score":[^}]+}/;
    const match = fragment.match(regex);

    if (match) {
      const completeFragment = fragment.substring(0, match.index + match[0].length);

      try {
        const jsonObject = JSON.parse(completeFragment);

        if (isValidSubtitle(jsonObject)) {
          results.push(jsonObject);
        }
      } catch (error) {
        console.error("Invalid JSON fragment:", completeFragment, error);
      }
    }
  }

  return results;
}

function isValidSubtitle(obj: SubtitleInput): obj is Subtitle {
  return (
    typeof obj.ISO639 === "string" &&
    typeof obj.LanguageName === "string" &&
    typeof obj.SubHearingImpaired === "string" &&
    typeof obj.IDSubtitleFile === "string" &&
    typeof obj.SubFormat === "string" &&
    typeof obj.MovieName === "string" &&
    typeof obj.SubEncoding === "string" &&
    typeof obj.SubDownloadLink === "string"
  );
}
