/** @format */

export type RequestType = (
  | { tmdbId: number; imdbId?: null }
  | { imdbId: string; tmdbId?: null }
) & {
  languages?: string | string[]; // ISO639 locale
  formats?: string | string[]; // subtitle format (srt, ass, vtt)
  encodings?: string | string[]; // subtitle file's encoding (UTF-8, ASCII)
  hearingImpaired?: boolean; // include hearing impaired subtitle
  source?: string | string[]; // Optional: The source to search (e.g., 'subdl')
  releaseFilters?: string[]; // release/group filters to prioritize exact matches
  fileFilters?: string[]; // file-based filters derived from filenames
} & ({ season: number; episode: number } | { season?: null; episode?: null });

export type ResponseType = {
  id: string; // the ID of the subtitle according to open subs
  url: string; // URL to the subtitle download
  flagUrl: string; // URL to the flag of the language's locale
  format: string; //subtitle format (srt, ass, vtt)
  encoding: string; // subtitle file's encoding
  display: string; // full lang (ex: English)
  language: string; // ISO639 locale
  media: string; // the name / title of the media
  isHearingImpaired: boolean; // is the subtitle hearing impaired (true, false)
  source?: string | string[]; // the subtitle source (e.g., 'subdl', 'default')
  release?: string | null; // primary release/display name for filtering
  releases?: string[]; // additional releases/compatibility notes
  fileName?: string | null; // original filename when available
  origin?: string | null;
  matchedRelease?: string | null; // actual release from provider that matched a filter
  matchedFilter?: string | null; // user-supplied filter value that produced the match
};

// JSON parsing types
export type Subtitle = {
  ISO639: string;
  LanguageName: string;
  SubHearingImpaired: string;
  IDSubtitleFile: string;
  SubFormat: string;
  MovieName: string;
  SubEncoding: string;
  SubDownloadLink: string;
  MovieReleaseName?: string;
  SubFileName?: string;
  SubAuthorComment?: string;
};

export type SubtitleInput = {
  ISO639?: unknown;
  LanguageName?: unknown;
  SubHearingImpaired?: unknown;
  IDSubtitleFile?: unknown;
  SubFormat?: unknown;
  MovieName?: unknown;
  SubEncoding?: string;
  SubDownloadLink?: unknown;
  MovieReleaseName?: unknown;
  SubFileName?: unknown;
  SubAuthorComment?: unknown;
};

// Unzip types
export interface UnzipItem {
  name: string;
  buffer: ArrayBuffer;
  tc?: boolean; // tc = text content
  toString: () => string;
}

export interface SubtitleExtractResult {
  success: boolean;
  content?: string;
  filename?: string;
  error?: string;
  details?: any;
  binary?: boolean;
  buffer?: ArrayBuffer;
}

// SubDL API response types
export interface SubdlMovie {
  type: string;
  name: string;
  poster_url: string;
  year: number;
  link: string;
  original_name: string;
}

export interface SubdlApiResponse {
  results: SubdlMovie[];
}

export interface SubdlSubtitle {
  id: number;
  language: string;
  quality: string;
  link: string;
  bucketLink: string;
  author: string;
  season: number;
  episode: number;
  title: string;
  extra: string;
  e: boolean;
  n_id: string;
  downloads: number;
  hi: number; // 0 = not hearing impaired, 1 = hearing impaired
  releases: string[];
  rate: number | null;
  date: number;
  comment: string;
  slug: string;
}

export interface SubdlPageProps {
  movieInfo: {
    type: string;
    sd_id: number;
    slug: string;
    name: string;
    secondName: string;
    poster_url: string;
    year: number;
    seasons?: { number: string; name: string }[];
  };
  groupedSubtitles: Record<string, SubdlSubtitle[]>;
}
