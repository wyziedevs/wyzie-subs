export const sourcesConfig = {
  subdl: false,  // Cloudflare Clearance stopping me
  subf2m: true,
  opensubtitles: true,
  podnapisi: true,
  animetosho: true,
  gestdown: true,
};

export type SourceName = keyof typeof sourcesConfig;
