/** @format */

import ISO6391 from "iso-639-1";
import { iso6393, iso6393To1 } from "iso-639-3";
import type { Language as Iso6393Language } from "iso-639-3";
import type { RequestType, ResponseType } from "~/utils/types";
import { languageToCountryCode, getLanguageMetadata } from "~/utils/lookup";
import { getTvIdentifiersFromImdb, extractOrigin } from "~/utils/utils";
import { proxyFetch } from "~/utils/proxy";
import { getCountryNames, getAlpha2Code } from "~/utils/countries";

const BASE_URL = "https://api.gestdown.info";
const DEFAULT_LANGUAGE = "en";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 7_500;

type LegacyLanguagePreference = {
  display: string;
  synonyms?: string[];
};

const LEGACY_LANGUAGE_NAME_MAP: Record<string, string> = {
  af: "Afrikaans",
  ak: "Akan",
  am: "Amharic",
  ar: "Arabic",
  as: "Assamese",
  az: "Azerbaijani",
  ay: "Aymara",
  be: "Belarusian",
  bg: "Bulgarian",
  bh: "Bihari",
  bi: "Bislama",
  bn: "Bengali",
  br: "Breton",
  bs: "Bosnian",
  ca: "Català",
  ch: "Chamorro",
  co: "Corsican",
  cr: "Cree",
  cs: "Czech",
  cy: "Welsh",
  da: "Danish",
  de: "German",
  dv: "Dhivehi",
  ee: "Ewe",
  el: "Greek",
  en: "English",
  eo: "Esperanto",
  es: "Spanish (Spain)",
  "es-419": "Spanish (Latin America)",
  et: "Estonian",
  eu: "Euskera",
  fa: "Persian",
  ff: "Fula",
  fi: "Finnish",
  fj: "Fijian",
  fo: "Faroese",
  fr: "French",
  ga: "Irish",
  gd: "Scottish Gaelic",
  gl: "Galego",
  gn: "Guarani",
  gu: "Gujarati",
  ha: "Hausa",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  ht: "Haitian Creole",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  ig: "Igbo",
  is: "Icelandic",
  it: "Italian",
  ja: "Japanese",
  jv: "Javanese",
  ka: "Georgian",
  kk: "Kazakh",
  kl: "Kalaallisut",
  km: "Khmer",
  kn: "Kannada",
  ko: "Korean",
  ku: "Kurdish",
  ky: "Kyrgyz",
  la: "Latin",
  lb: "Luxembourgish",
  lg: "Ganda",
  ln: "Lingala",
  lo: "Lao",
  lt: "Lithuanian",
  lu: "Luba-Katanga",
  lv: "Latvian",
  mg: "Malagasy",
  mh: "Marshallese",
  mk: "Macedonian",
  ml: "Malayalam",
  mn: "Mongolian",
  mr: "Marathi",
  ms: "Malay",
  my: "Burmese",
  na: "Nauru",
  nb: "Norwegian",
  nd: "North Ndebele",
  ne: "Nepali",
  nl: "Dutch",
  nn: "Norwegian",
  no: "Norwegian",
  oc: "Occitan",
  om: "Oromo",
  or: "Odia",
  os: "Ossetian",
  pa: "Punjabi",
  pl: "Polish",
  ps: "Pashto",
  pt: "Portuguese (Brazilian)",
  "pt-br": "Portuguese (Brazilian)",
  "pt-pt": "Portuguese (Portugal)",
  qu: "Quechua",
  rn: "Kirundi",
  ro: "Romanian",
  ru: "Russian",
  rw: "Kinyarwanda",
  sa: "Sanskrit",
  sc: "Sardinian",
  sd: "Sindhi",
  sg: "Sango",
  si: "Sinhala",
  sk: "Slovak",
  sl: "Slovenian",
  sm: "Samoan",
  sn: "Shona",
  so: "Somali",
  sq: "Albanian",
  sr: "Serbian",
  "sr-cyrl": "Serbian (Cyrillic)",
  "sr-latn": "Serbian (Latin)",
  ss: "Swati",
  st: "Sesotho",
  su: "Sundanese",
  sv: "Swedish",
  sw: "Swahili",
  ta: "Tamil",
  te: "Telugu",
  tg: "Tajik",
  th: "Thai",
  tk: "Turkmen",
  tl: "Tagalog",
  tn: "Tswana",
  tr: "Turkish",
  ts: "Tsonga",
  tt: "Tatar",
  tw: "Twi",
  ty: "Tahitian",
  uk: "Ukrainian",
  ug: "Uyghur",
  ur: "Urdu",
  uz: "Uzbek",
  vi: "Vietnamese",
  wo: "Wolof",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  za: "Zhuang",
  zh: "Chinese (Simplified)",
  "zh-cn": "Chinese (Simplified)",
  "zh-hans": "Chinese (Simplified)",
  "zh-hant": "Chinese (Traditional)",
  "zh-hk": "Chinese (Traditional)",
  "zh-tw": "Chinese (Traditional)",
  zu: "Zulu",
};

const RAW_LEGACY_LANGUAGE_SYNONYMS: Record<string, string[]> = {
  "Portuguese (Brazilian)": ["Portuguese (Brazil)", "Brazilian Portuguese"],
  Portuguese: ["Portuguese (Brazil)", "Portuguese (Portugal)", "Portuguese (Brazilian)"],
  "Portuguese (Portugal)": ["Portuguese (Portugal)", "European Portuguese"],
  "Spanish (Spain)": ["Spanish"],
  "Spanish (Latin America)": ["Spanish Latin America", "Latin American Spanish"],
  "Chinese (Simplified)": ["Chinese Simplified", "Simplified Chinese"],
  "Chinese (Traditional)": ["Chinese Traditional", "Traditional Chinese"],
  "Serbian (Latin)": ["Serbian Latin"],
  "Serbian (Cyrillic)": ["Serbian Cyrillic"],
  Akan: ["Twi (Akan)", "Akan Language"],
  Aymara: ["Aimara"],
  Bihari: ["Bhojpuri"],
  Bislama: ["Bichelamar"],
  Breton: ["Brezhoneg"],
  Chamorro: ["Chamoru"],
  Corsican: ["Corsu"],
  Cree: ["Nehiyawewin"],
  Welsh: ["Cymraeg", "Welsh (UK)"],
  Dhivehi: ["Maldivian", "Divehi"],
  Ewe: ["Ewe Language"],
  Esperanto: ["International Auxiliary Language", "Esperanto Language"],
  Fula: ["Fulah", "Pulaar", "Pular"],
  Faroese: ["Foroyskt", "Faroese Language"],
  Fijian: ["Vosa Vakaviti", "Fijian Language"],
  "Scottish Gaelic": ["Gaelic (Scotland)", "Gaidhlig"],
  Guarani: ["Guaraní", "Guarani Language"],
  Gujarati: ["Gujrati", "Gujarati Language"],
  Hausa: ["Hausa Language"],
  "Haitian Creole": ["Haitian", "Creole (Haiti)"],
  Igbo: ["Ibo", "Igbo Language"],
  Javanese: ["Jawa", "Javanese Language"],
  Kalaallisut: ["Greenlandic"],
  Kannada: ["Kanarese", "Kannada Language"],
  Kyrgyz: ["Kirghiz", "Kyrgyz Language"],
  Luxembourgish: ["Letzeburgesch", "Luxembourgish Language"],
  Ganda: ["Luganda"],
  Lingala: ["Ngala", "Lingala Language"],
  "Luba-Katanga": ["Kiluba"],
  Malagasy: ["Malagasy Language"],
  Marshallese: ["Marshallese Language"],
  Burmese: ["Myanmar", "Burmese Language"],
  Nauru: ["Naoero", "Nauruan"],
  "North Ndebele": ["IsiNdebele"],
  Occitan: ["Occitan Language"],
  Oromo: ["Afaan Oromo", "Oromo Language"],
  Odia: ["Oriya", "Odia Language"],
  Ossetian: ["Ossetic", "Ossetian Language"],
  Quechua: ["Kichwa", "Quechuan"],
  Kirundi: ["Rundi", "Kirundi Language"],
  Kinyarwanda: ["Rwanda", "Kinyarwanda Language"],
  Sanskrit: ["Samskritam", "Sanskrit Language"],
  Sardinian: ["Sardu", "Sardinian Language"],
  Sindhi: ["Sindhi Language"],
  Sango: ["Sango Language"],
  Samoan: ["Gagana Samoa", "Samoan Language"],
  Shona: ["ChiShona", "Shona Language"],
  Swati: ["SiSwati", "Swati Language"],
  Sesotho: ["Southern Sotho", "Sesotho Language"],
  Tajik: ["Tajiki", "Tajik Language"],
  Turkmen: ["Turkmen Language"],
  Tagalog: ["Filipino", "Pilipino"],
  Tswana: ["Setswana", "Tswana Language"],
  Tsonga: ["Xitsonga", "Tsonga Language"],
  Tatar: ["Tatar Language"],
  Twi: ["Akan Twi", "Twi Language"],
  Tahitian: ["Reo Tahiti", "Tahitian Language"],
  Uyghur: ["Uighur", "Uyghur Language"],
  Uzbek: ["Ozbek", "Uzbek Language"],
  Wolof: ["Walof", "Wolof Language"],
  Yiddish: ["Yiddish Language"],
  Zhuang: ["Chuang", "Zhuang Language"],
};

const DEFAULT_GESTDOWN_LANGUAGE_CODES: readonly string[] = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "es-419",
  "eu",
  "et",
  "fa",
  "fi",
  "fr",
  "ga",
  "gl",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "it",
  "ja",
  "is",
  "ka",
  "kk",
  "km",
  "ko",
  "ku",
  "la",
  "lo",
  "ml",
  "mk",
  "mn",
  "mr",
  "ms",
  "lt",
  "lv",
  "ne",
  "nb",
  "nl",
  "nn",
  "no",
  "pl",
  "pt",
  "pt-br",
  "pt-pt",
  "ro",
  "ru",
  "pa",
  "ps",
  "sk",
  "sl",
  "sq",
  "si",
  "so",
  "sr",
  "sr-cyrl",
  "sr-latn",
  "sv",
  "sw",
  "su",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
  "xh",
  "yo",
  "zh",
  "zh-cn",
  "zh-hans",
  "zh-hant",
  "zh-hk",
  "zh-tw",
  "zu",
];

const DEFAULT_GESTDOWN_INPUT_CODES = Array.from(
  new Set<string>([...DEFAULT_GESTDOWN_LANGUAGE_CODES, DEFAULT_LANGUAGE]),
);

const LEGACY_LANGUAGE_OVERRIDES: Record<string, string> = {
  pb: "pt-br",
  ze: "zh-hans",
  zt: "zh-hant",
  iw: "he",
  cn: "zh",
  cz: "cs",
  ge: "ka",
  gr: "el",
  in: "id",
  ji: "yi",
  jp: "ja",
  kr: "ko",
  mo: "ro",
  scr: "sr-latn",
  sh: "sr-latn",
  ua: "uk",
  fil: "tl",
};

const REGION_SYNONYMS: Record<string, string> = {
  latam: "419",
  "latin-america": "419",
  latinamerica: "419",
  latin_america: "419",
};

const HARD_REGION_MATCHES: Record<string, string> = {
  american: "US",
  british: "GB",
  brazilian: "BR",
  european: "PT",
  mexican: "MX",
  argentinian: "AR",
  colombian: "CO",
  canadian: "CA",
  australian: "AU",
  indian: "IN",
  pakistani: "PK",
  newzealand: "NZ",
};

const SCRIPT_SYNONYMS: Record<string, string> = {
  latin: "Latn",
  latn: "Latn",
  cyrillic: "Cyrl",
  cyrl: "Cyrl",
  hans: "Hans",
  simplified: "Hans",
  hant: "Hant",
  traditional: "Hant",
};

const iso3Entries = iso6393 as Iso6393Language[];

const ISO3_TO_ISO2_MAP = new Map<string, string>(
  Object.entries(iso6393To1).map(([iso3Code, iso1Code]) => [
    iso3Code.toLowerCase(),
    iso1Code.toLowerCase(),
  ]),
);

const ISO1_CODES = new Set<string>(ISO6391.getAllCodes().map((code) => code.toLowerCase()));

const ISO2_TO_NAME = new Map<string, string>();
for (const entry of iso3Entries) {
  const iso1 = iso6393To1[entry.iso6393 as keyof typeof iso6393To1];
  if (iso1) {
    const iso2 = iso1.toLowerCase();
    if (!ISO2_TO_NAME.has(iso2)) {
      ISO2_TO_NAME.set(iso2, entry.name);
    }
  }
}

const intlLanguageDisplay =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined" ?
    new Intl.DisplayNames(["en"], { type: "language" })
  : null;

const intlRegionDisplay =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined" ?
    new Intl.DisplayNames(["en"], { type: "region" })
  : null;

const intlScriptDisplay =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined" ?
    new Intl.DisplayNames(["en"], { type: "script" })
  : null;

const DEFAULT_SCRIPT_CODES = ["Latn", "Cyrl", "Hans", "Hant"] as const;

const scriptCodes: string[] = (() => {
  const maybeSupportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (kind: string) => string[];
    }
  ).supportedValuesOf;

  if (typeof maybeSupportedValuesOf === "function") {
    try {
      const values = maybeSupportedValuesOf("script");
      if (Array.isArray(values) && values.length > 0) {
        return Array.from(new Set([...values, ...DEFAULT_SCRIPT_CODES]));
      }
    } catch {
      // ignore unsupported key
    }
  }

  return [...DEFAULT_SCRIPT_CODES];
})();

const SCRIPT_NAME_TO_CODE = new Map<string, string>();
for (const code of scriptCodes) {
  const lower = code.toLowerCase();
  SCRIPT_NAME_TO_CODE.set(lower, code);
  if (intlScriptDisplay) {
    const displayName = intlScriptDisplay.of(code);
    if (displayName) {
      const normalized = displayName.toLowerCase();
      SCRIPT_NAME_TO_CODE.set(normalized, code);
      SCRIPT_NAME_TO_CODE.set(normalized.replace(/[^a-z0-9]/g, ""), code);
    }
  }
}
for (const [alias, script] of Object.entries(SCRIPT_SYNONYMS)) {
  SCRIPT_NAME_TO_CODE.set(alias.toLowerCase(), script);
}

const REGION_NAME_TO_CODE = new Map<string, string>();
const regionNames = getCountryNames("en");
for (const [code, name] of Object.entries(regionNames)) {
  const lowerName = name.toLowerCase();
  REGION_NAME_TO_CODE.set(lowerName, code);
  REGION_NAME_TO_CODE.set(lowerName.replace(/[^a-z0-9]/g, ""), code);
}
for (const [alias, code] of Object.entries(REGION_SYNONYMS)) {
  REGION_NAME_TO_CODE.set(alias.toLowerCase(), code);
}
for (const [alias, code] of Object.entries(HARD_REGION_MATCHES)) {
  REGION_NAME_TO_CODE.set(alias.toLowerCase(), code);
}

const LANGUAGE_NAME_LOOKUP = new Map<string, string>();
for (const code of ISO1_CODES) {
  const name = ISO6391.getName(code) || ISO2_TO_NAME.get(code) || code.toUpperCase();
  LANGUAGE_NAME_LOOKUP.set(code, name);
}

for (const [code, name] of Object.entries(LEGACY_LANGUAGE_NAME_MAP)) {
  const normalizedCode = code.toLowerCase();
  LANGUAGE_NAME_LOOKUP.set(normalizedCode, name);
  const baseCode = normalizedCode.split("-")[0];
  if (!LANGUAGE_NAME_LOOKUP.has(baseCode)) {
    LANGUAGE_NAME_LOOKUP.set(baseCode, name);
  }
}

function normalizeLanguageName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function capitalizeWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function resolveCodeFromLanguageName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const stripped = trimmed
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = new Set<string>();

  if (trimmed) {
    candidates.add(trimmed);
    candidates.add(trimmed.toLowerCase());
    candidates.add(capitalizeWords(trimmed));
  }

  if (stripped) {
    candidates.add(stripped);
    candidates.add(stripped.toLowerCase());
    candidates.add(capitalizeWords(stripped));
  }

  for (const candidate of candidates) {
    const isoCode = ISO6391.getCode(candidate);
    if (isoCode) {
      return isoCode.toLowerCase();
    }
  }

  return null;
}

function getLanguageDisplayName(code: string): string | undefined {
  const canonical = canonicalizeTag(code);
  const intlTag = canonical ? formatTagForIntl(canonical) : undefined;
  const intlName =
    intlTag && intlLanguageDisplay ? (intlLanguageDisplay.of(intlTag) ?? undefined) : undefined;

  if (intlName) {
    return intlName;
  }

  const normalized = code.toLowerCase();
  return (
    LANGUAGE_NAME_LOOKUP.get(normalized) ??
    LANGUAGE_NAME_LOOKUP.get(normalized.split("-")[0]) ??
    ISO2_TO_NAME.get(normalized.split("-")[0]) ??
    normalized.toUpperCase()
  );
}

type NormalizedLanguageCode = {
  apiCode: string;
  baseCode: string;
  script?: string;
  region?: string;
  variants: string[];
};

const SUFFIX_TRANSFORMS: Array<[RegExp, string]> = [
  [/ian$/i, ""],
  [/ian$/i, "ia"],
  [/ean$/i, ""],
  [/an$/i, ""],
  [/an$/i, "a"],
  [/ese$/i, ""],
  [/ese$/i, "e"],
  [/ish$/i, ""],
  [/ic$/i, ""],
];

function looksLikeLanguageCode(value: string): boolean {
  return /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value.trim());
}

function formatTagForIntl(tag: string): string {
  const segments = tag.split("-");
  if (segments.length === 0) {
    return tag;
  }

  const [language, ...rest] = segments;
  const formatted: string[] = [language.toLowerCase()];

  for (const segment of rest) {
    if (/^[a-z]{4}$/i.test(segment)) {
      formatted.push(segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());
    } else if (/^[0-9]{3}$/.test(segment)) {
      formatted.push(segment);
    } else {
      formatted.push(segment.toUpperCase());
    }
  }

  return formatted.join("-");
}

function canonicalizeTag(tag: string): string | null {
  try {
    const canonical = Intl.getCanonicalLocales(tag)[0];
    return canonical ? canonical.toLowerCase() : null;
  } catch {
    return null;
  }
}

function descriptorToRegion(descriptor: string): string | undefined {
  const cleaned = descriptor.trim().toLowerCase();
  if (!cleaned) {
    return undefined;
  }

  const normalized = cleaned
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }

  const direct =
    REGION_NAME_TO_CODE.get(normalized) ??
    REGION_NAME_TO_CODE.get(normalized.replace(/[^a-z0-9]/g, ""));
  if (direct) {
    return direct.toUpperCase();
  }

  const parts = normalized.split(" ");
  const candidates = new Set<string>([normalized, normalized.replace(/\s+/g, "")]);
  for (const part of parts) {
    if (part) {
      candidates.add(part);
      candidates.add(part.replace(/[^a-z0-9]/g, ""));
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const lookup = REGION_NAME_TO_CODE.get(candidate.toLowerCase());
    if (lookup) {
      return lookup.toUpperCase();
    }
    const alpha2 = getAlpha2Code(capitalizeWords(candidate), "en");
    if (alpha2) {
      return alpha2.toUpperCase();
    }
  }

  for (const candidate of candidates) {
    for (const [suffix, addition] of SUFFIX_TRANSFORMS) {
      if (suffix.test(candidate)) {
        const modified = candidate.replace(suffix, addition);
        const lookup = REGION_NAME_TO_CODE.get(modified.toLowerCase());
        if (lookup) {
          return lookup.toUpperCase();
        }
        const alpha2 = getAlpha2Code(capitalizeWords(modified), "en");
        if (alpha2) {
          return alpha2.toUpperCase();
        }
      }
    }
  }

  return undefined;
}

function descriptorToScript(descriptor: string): string | undefined {
  const cleaned = descriptor.trim().toLowerCase();
  if (!cleaned) {
    return undefined;
  }

  const normalized = cleaned
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    SCRIPT_NAME_TO_CODE.get(normalized) ??
    SCRIPT_NAME_TO_CODE.get(normalized.replace(/[^a-z0-9]/g, ""))
  );
}

function generateLanguageCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();
  const lower = trimmed.toLowerCase();
  const noParens = trimmed
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  candidates.add(trimmed);
  candidates.add(lower);
  candidates.add(trimmed.replace(/[_\s]+/g, "-"));
  candidates.add(lower.replace(/[_\s]+/g, "-"));
  candidates.add(trimmed.replace(/[._]/g, "-"));
  candidates.add(lower.replace(/[._]/g, "-"));

  if (noParens) {
    candidates.add(noParens);
    candidates.add(noParens.toLowerCase());
    candidates.add(noParens.replace(/[_\s]+/g, "-"));
  }

  for (const candidate of Array.from(candidates)) {
    if (!candidate.includes("-")) {
      const normalizedCandidate = candidate.toLowerCase();
      if (/^[a-z]{2,3}[a-z0-9]{2,}$/i.test(normalizedCandidate)) {
        candidates.add(`${normalizedCandidate.slice(0, 2)}-${normalizedCandidate.slice(2)}`);
      }
    }
  }

  return Array.from(candidates)
    .map((candidate) =>
      candidate
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean);
}

function parseLanguageCandidate(candidate: string): NormalizedLanguageCode | null {
  if (!candidate) {
    return null;
  }

  const legacyOverride = LEGACY_LANGUAGE_OVERRIDES[candidate];
  if (legacyOverride) {
    return parseLanguageCandidate(legacyOverride);
  }

  const segments = candidate.split("-").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let languageSegment = segments.shift()!;

  if (LEGACY_LANGUAGE_OVERRIDES[languageSegment]) {
    const override = LEGACY_LANGUAGE_OVERRIDES[languageSegment];
    const overrideSegments = override.split("-");
    languageSegment = overrideSegments.shift()!;
    segments.unshift(...overrideSegments);
  }

  if (languageSegment.length === 3 && ISO3_TO_ISO2_MAP.has(languageSegment)) {
    languageSegment = ISO3_TO_ISO2_MAP.get(languageSegment)!;
  }

  if (!ISO1_CODES.has(languageSegment)) {
    const resolved =
      resolveCodeFromLanguageName(languageSegment) ?? resolveCodeFromLanguageName(candidate);
    if (!resolved) {
      return null;
    }
    languageSegment = resolved;
  }

  if (!ISO1_CODES.has(languageSegment)) {
    return null;
  }

  let script: string | undefined;
  let region: string | undefined;
  const variants: string[] = [];

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (!script) {
      const scriptFromDescriptor = descriptorToScript(lower);
      if (scriptFromDescriptor) {
        script = scriptFromDescriptor;
        continue;
      }
    }

    if (!region) {
      const regionFromDescriptor = REGION_SYNONYMS[lower] ?? descriptorToRegion(lower);
      if (regionFromDescriptor) {
        region = regionFromDescriptor;
        continue;
      }
    }

    if (!script && /^[a-z]{4}$/.test(segment)) {
      script = segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
      continue;
    }

    if (!region && /^[a-z]{2}$/.test(segment)) {
      region = segment.toUpperCase();
      continue;
    }

    if (!region && /^[0-9]{3}$/.test(segment)) {
      region = segment;
      continue;
    }

    if (/^[a-z0-9]{5,8}$/.test(lower)) {
      variants.push(lower);
    }
  }

  const canonicalCandidate = [languageSegment, script, region, ...variants]
    .filter(Boolean)
    .map((segment, index) => {
      if (index === 0) return (segment as string).toLowerCase();
      if (typeof segment !== "string") return segment as string;
      if (/^[0-9]{3}$/.test(segment)) return segment;
      if (/^[a-z]{4}$/i.test(segment)) {
        return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
      }
      if (/^[a-z]{2}$/i.test(segment)) {
        return segment.toUpperCase();
      }
      return segment.toLowerCase();
    })
    .join("-");

  const canonical = canonicalizeTag(canonicalCandidate) ?? canonicalCandidate.toLowerCase();
  const [lang, ...rest] = canonical.split("-");
  let resolvedScript: string | undefined;
  let resolvedRegion: string | undefined;
  const resolvedVariants: string[] = [];

  for (const segment of rest) {
    if (!resolvedScript && /^[a-z]{4}$/i.test(segment)) {
      resolvedScript = segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
      continue;
    }
    if (!resolvedRegion && (/^[a-z]{2}$/i.test(segment) || /^[0-9]{3}$/.test(segment))) {
      resolvedRegion = /^[0-9]{3}$/.test(segment) ? segment : segment.toUpperCase();
      continue;
    }
    resolvedVariants.push(segment.toLowerCase());
  }

  return {
    apiCode: canonical,
    baseCode: lang.toLowerCase(),
    script: resolvedScript,
    region: resolvedRegion,
    variants: resolvedVariants,
  };
}

function normalizeLanguageCode(raw: string): NormalizedLanguageCode | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (LEGACY_LANGUAGE_OVERRIDES[lower]) {
    return normalizeLanguageCode(LEGACY_LANGUAGE_OVERRIDES[lower]);
  }

  const candidates = generateLanguageCandidates(trimmed);
  for (const candidate of candidates) {
    const parsed = parseLanguageCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const fromName = resolveCodeFromLanguageName(trimmed);
  if (fromName) {
    return {
      apiCode: fromName,
      baseCode: fromName,
      variants: [],
    };
  }

  return null;
}

function buildDescriptorVariants(baseName: string, descriptor: string): string[] {
  const variants: string[] = [];
  const trimmedDescriptor = descriptor.trim();
  if (!trimmedDescriptor) {
    return variants;
  }

  const normalizedDescriptor = capitalizeWords(trimmedDescriptor);
  const rawLower = trimmedDescriptor.toLowerCase();
  const nounOverride: Record<string, string> = {
    brazilian: "Brazil",
    american: "America",
    european: "Europe",
    latinamerican: "Latin America",
    "latin american": "Latin America",
    mexican: "Mexico",
    argentinian: "Argentina",
    colombian: "Colombia",
  };

  const nounForm =
    nounOverride[rawLower] ??
    capitalizeWords(rawLower.replace(/ian$/i, "").replace(/an$/i, "").replace(/ean$/i, "e"));

  const descriptorVariants = new Set<string>([normalizedDescriptor, nounForm]);

  for (const variant of descriptorVariants) {
    if (!variant) continue;
    variants.push(`${baseName} (${variant})`);
    variants.push(`${variant} ${baseName}`);
    variants.push(`${baseName} ${variant}`);
  }

  return variants;
}

function generateLanguageNameVariants(
  normalized: NormalizedLanguageCode,
  rawInput: string,
): string[] {
  const names: string[] = [];
  const canonicalTag = normalized.apiCode;
  const intlTag = formatTagForIntl(canonicalTag);
  const baseName =
    LANGUAGE_NAME_LOOKUP.get(normalized.baseCode) ??
    ISO2_TO_NAME.get(normalized.baseCode) ??
    normalized.baseCode.toUpperCase();
  const languageDisplay = intlLanguageDisplay?.of(intlTag) ?? undefined;
  const scriptName =
    normalized.script ?
      (intlScriptDisplay?.of(normalized.script) ?? capitalizeWords(normalized.script))
    : undefined;
  const regionName =
    normalized.region ?
      (intlRegionDisplay?.of(normalized.region) ?? capitalizeWords(normalized.region))
    : undefined;

  const trimmedRaw = rawInput.trim();
  if (trimmedRaw && !looksLikeLanguageCode(trimmedRaw)) {
    names.push(trimmedRaw);
  }

  if (languageDisplay) {
    names.push(languageDisplay);
  }

  if (baseName) {
    names.push(baseName);
  }

  if (
    languageDisplay &&
    baseName &&
    languageDisplay.toLowerCase().endsWith(baseName.toLowerCase())
  ) {
    const descriptor = languageDisplay.slice(0, languageDisplay.length - baseName.length).trim();
    if (descriptor) {
      names.push(...buildDescriptorVariants(baseName, descriptor));
    }
  }

  if (scriptName) {
    names.push(...buildDescriptorVariants(baseName, scriptName));
  }

  if (regionName) {
    names.push(...buildDescriptorVariants(baseName, regionName));
  }

  if (normalized.region && normalized.region === "419") {
    names.push(...buildDescriptorVariants(baseName, "Latin America"));
  }

  if (looksLikeLanguageCode(rawInput)) {
    names.push(rawInput.toLowerCase());
  }

  names.push(canonicalTag);
  return Array.from(new Set(names.filter(Boolean)));
}

function getLegacyPreferenceForCode(code: string): LegacyLanguagePreference | null {
  const normalizedCode = code.toLowerCase();
  const display = LEGACY_LANGUAGE_NAME_MAP[normalizedCode];
  if (!display) {
    return null;
  }

  return {
    display,
    synonyms: RAW_LEGACY_LANGUAGE_SYNONYMS[display] ?? [],
  };
}

function choosePrimaryName(candidates: string[]): string {
  const preferred =
    candidates.find((candidate) => !looksLikeLanguageCode(candidate)) ?? candidates[0];
  return preferred ?? DEFAULT_LANGUAGE;
}

function resolveLanguageMapping(raw: string): {
  apiName: string;
  apiCode: string;
  baseCode: string;
  variants: string[];
  requiresVariant: boolean;
  nameVariants: string[];
} | null {
  const normalized = normalizeLanguageCode(raw);
  if (!normalized) {
    return null;
  }

  const legacyPreference =
    getLegacyPreferenceForCode(normalized.apiCode) ??
    getLegacyPreferenceForCode(normalized.baseCode);

  const variantSet = new Set<string>(generateLanguageNameVariants(normalized, raw));
  if (legacyPreference) {
    variantSet.add(legacyPreference.display);
    for (const synonym of legacyPreference.synonyms ?? []) {
      variantSet.add(synonym);
    }
  }

  const nameVariants = Array.from(variantSet).filter(Boolean);
  const apiName = legacyPreference?.display ?? choosePrimaryName(nameVariants);
  const requiresVariant = Boolean(
    normalized.script || normalized.region || normalized.variants.length > 0,
  );

  return {
    apiName,
    apiCode: normalized.apiCode,
    baseCode: normalized.baseCode,
    variants: normalized.variants,
    requiresVariant,
    nameVariants,
  };
}

const GESTDOWN_HEADERS = {
  Accept: "application/json",
  "User-Agent": "WyzieAPI/1.0 (+https://github.com/itzCozi/wyzie-api)",
};

type GestdownShow = {
  id: string;
  name?: string;
  slug?: string;
};

type GestdownSubtitleItem = {
  subtitleId: string;
  version?: string;
  completed: boolean;
  hearingImpaired: boolean;
  downloadUri: string;
  language: string;
};

type GestdownSubtitleResponse = {
  matchingSubtitles?: GestdownSubtitleItem[];
};

type LanguagePlan = {
  apiName: string;
  apiCode: string;
  baseCode: string;
  acceptedCodes: Set<string>;
  acceptedNames: Set<string>;
  requiresVariant: boolean;
};

function toArray(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeEncoding(value: string): string {
  const lower = value.trim().toLowerCase().replace(/_/g, "-");
  return lower === "utf8" ? "utf-8" : lower;
}

let defaultLanguageInputsCache: string[] | null = null;

function getDefaultLanguageInputs(): string[] {
  if (defaultLanguageInputsCache) {
    return defaultLanguageInputsCache;
  }

  const pool = new Set<string>();
  for (const code of DEFAULT_GESTDOWN_INPUT_CODES) {
    const mapping = resolveLanguageMapping(code);
    if (mapping) {
      pool.add(mapping.apiCode);
    }
  }

  pool.add(DEFAULT_LANGUAGE);
  defaultLanguageInputsCache = Array.from(pool);
  return defaultLanguageInputsCache;
}

function buildLanguagePlans(languages: string[]): LanguagePlan[] {
  const planMap = new Map<string, LanguagePlan>();
  const hasExplicitLanguages = languages.length > 0;
  const inputLanguages = hasExplicitLanguages ? languages : getDefaultLanguageInputs();

  for (const lang of inputLanguages) {
    const mapping = resolveLanguageMapping(lang);
    if (!mapping) {
      continue;
    }

    const planKey = mapping.apiCode;
    let plan = planMap.get(planKey);
    const normalizedNames = mapping.nameVariants.map((name) => normalizeLanguageName(name));
    const acceptedNames = new Set(normalizedNames);
    acceptedNames.add(normalizeLanguageName(mapping.apiName));

    const acceptedCodes = new Set<string>([mapping.apiCode]);
    if (!mapping.requiresVariant) {
      acceptedCodes.add(mapping.baseCode);
    }

    if (!plan) {
      plan = {
        apiName: mapping.apiName,
        apiCode: mapping.apiCode,
        baseCode: mapping.baseCode,
        acceptedCodes,
        acceptedNames,
        requiresVariant: mapping.requiresVariant,
      };
      planMap.set(planKey, plan);
    } else {
      for (const code of acceptedCodes) {
        plan.acceptedCodes.add(code);
      }
      for (const name of acceptedNames) {
        plan.acceptedNames.add(name);
      }
      plan.requiresVariant = plan.requiresVariant || mapping.requiresVariant;
    }
  }

  if (planMap.size === 0 && hasExplicitLanguages) {
    const fallbackMapping = resolveLanguageMapping(DEFAULT_LANGUAGE);
    if (fallbackMapping) {
      const acceptedNames = new Set(
        fallbackMapping.nameVariants.map((name) => normalizeLanguageName(name)),
      );
      acceptedNames.add(normalizeLanguageName(fallbackMapping.apiName));

      planMap.set(fallbackMapping.apiCode, {
        apiName: fallbackMapping.apiName,
        apiCode: fallbackMapping.apiCode,
        baseCode: fallbackMapping.baseCode,
        acceptedCodes: new Set([
          fallbackMapping.apiCode,
          ...(fallbackMapping.requiresVariant ? [] : [fallbackMapping.baseCode]),
        ]),
        acceptedNames,
        requiresVariant: fallbackMapping.requiresVariant,
      });
    }
  }

  return Array.from(planMap.values());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchSubtitlesForPlan(
  show: GestdownShow,
  plan: LanguagePlan,
  season: number,
  episode: number,
): Promise<GestdownSubtitleItem[]> {
  const searchUrl = `${BASE_URL}/subtitles/get/${show.id}/${season}/${episode}/${encodeURIComponent(plan.apiName)}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await proxyFetch(searchUrl, { headers: GESTDOWN_HEADERS });

    if (response.status === 404) {
      return [];
    }

    if (response.status === 423) {
      if (attempt === MAX_RETRIES - 1) {
        console.warn(`[Gestdown] 423 response persisted for ${searchUrl}; skipping.`);
        return [];
      }

      await delay(RETRY_DELAY_MS);
      continue;
    }

    if (!response.ok) {
      console.warn(
        `[Gestdown] Failed to fetch subtitles for ${show.id} (${plan.apiName}): ${response.status} ${response.statusText}`,
      );
      return [];
    }

    try {
      const payload = (await response.json()) as GestdownSubtitleResponse;
      return Array.isArray(payload.matchingSubtitles) ? payload.matchingSubtitles : [];
    } catch (parseError) {
      console.error(`[Gestdown] Unable to parse subtitle response for ${show.id}:`, parseError);
      return [];
    }
  }

  return [];
}

function buildMediaLabel(showName: string | undefined, _season: number, _episode: number): string {
  const safeName = showName && showName.trim().length > 0 ? showName.trim() : "Unknown Show";
  return safeName;
}

export async function searchGestdown(request: RequestType): Promise<ResponseType[]> {
  if (!request.imdbId || request.season === undefined || request.episode === undefined) {
    return [];
  }

  try {
    const identifiers = await getTvIdentifiersFromImdb(request.imdbId);

    if (!identifiers.tvdbId) {
      console.warn(`[Gestdown] No TVDB identifier resolved for IMDb ID ${request.imdbId}.`);
      return [];
    }

    const showResponse = await proxyFetch(`${BASE_URL}/shows/external/tvdb/${identifiers.tvdbId}`, {
      headers: GESTDOWN_HEADERS,
    });

    if (showResponse.status === 404) {
      console.warn(`[Gestdown] Show not found for TVDB ID ${identifiers.tvdbId}.`);
      return [];
    }

    if (!showResponse.ok) {
      console.warn(
        `[Gestdown] Failed to retrieve show metadata for TVDB ID ${identifiers.tvdbId}: ${showResponse.status} ${showResponse.statusText}`,
      );
      return [];
    }

    const showPayload = (await showResponse.json()) as { shows?: GestdownShow[] };
    const shows = Array.isArray(showPayload.shows) ? showPayload.shows : [];

    if (shows.length === 0) {
      console.warn(`[Gestdown] No shows returned for TVDB ID ${identifiers.tvdbId}.`);
      return [];
    }

    const requestedLanguages = toArray(request.languages).map((lang) => lang.toLowerCase());
    const languagePlans = buildLanguagePlans(requestedLanguages);
    const shouldFilterByLanguage = requestedLanguages.length > 0;

    if (languagePlans.length === 0) {
      return [];
    }

    const requestedFormats = toArray(request.formats).map((format) => format.toLowerCase());
    const requestedEncodings = toArray(request.encodings).map((encoding) =>
      normalizeEncoding(encoding),
    );
    const formatFiltering = requestedFormats.length > 0;
    const encodingFiltering = requestedEncodings.length > 0;
    const hearingOnly = request.hearingImpaired === true;

    const collected = new Map<string, ResponseType>();

    for (const show of shows) {
      const showName = show.name ?? identifiers.name ?? "Unknown Show";

      for (const plan of languagePlans) {
        const subtitles = await fetchSubtitlesForPlan(show, plan, request.season, request.episode);

        for (const subtitle of subtitles) {
          if (!subtitle.completed) {
            continue;
          }

          if (hearingOnly && !subtitle.hearingImpaired) {
            continue;
          }

          const normalizedLanguageName = normalizeLanguageName(subtitle.language ?? "");
          const subtitleMapping =
            subtitle.language ? resolveLanguageMapping(subtitle.language) : null;

          if (shouldFilterByLanguage) {
            const matchesByName =
              normalizedLanguageName && plan.acceptedNames.has(normalizedLanguageName);
            const matchesByCode =
              subtitleMapping &&
              (plan.acceptedCodes.has(subtitleMapping.apiCode) ||
                (!plan.requiresVariant && plan.acceptedCodes.has(subtitleMapping.baseCode)));

            if (!matchesByName && !matchesByCode) {
              continue;
            }
          }

          const format = "srt";
          if (formatFiltering && !requestedFormats.includes(format)) {
            continue;
          }

          const encoding = "utf-8";
          if (encodingFiltering && !requestedEncodings.includes(encoding)) {
            continue;
          }

          const languageCode = plan.baseCode;
          const countryCode = languageToCountryCode[languageCode] ?? languageCode.toUpperCase();

          const mediaTitle = buildMediaLabel(showName, request.season, request.episode);

          const subtitleId = subtitle.subtitleId;

          if (collected.has(subtitleId)) {
            continue;
          }

          const normalizedRelease =
            typeof subtitle.version === "string" && subtitle.version.trim().length > 0 ?
              subtitle.version.trim()
            : null;

          let fileName: string | null = null;
          if (typeof subtitle.downloadUri === "string" && subtitle.downloadUri.length > 0) {
            try {
              const url = new URL(subtitle.downloadUri, "https://api.gestdown.info");
              const lastSegment = url.pathname.split("/").filter(Boolean).pop();
              if (lastSegment && lastSegment.length > 0) {
                fileName = lastSegment;
              }
            } catch (_error) {
              const fallbackSegment = subtitle.downloadUri.split("/").pop();
              if (fallbackSegment && fallbackSegment.length > 0) {
                fileName = fallbackSegment;
              }
            }
          }

          const entry: ResponseType = {
            id: subtitleId,
            url: `gestdown/${subtitleId}`,
            flagUrl: `https://flagsapi.com/${countryCode}/flat/24.png`,
            format,
            encoding: "UTF-8",
            display:
              plan.apiName ?? getLanguageMetadata(languageCode)?.name ?? languageCode.toUpperCase(),
            language: languageCode,
            media: mediaTitle,
            isHearingImpaired: Boolean(subtitle.hearingImpaired),
            source: "gestdown",
            release: normalizedRelease,
            releases: normalizedRelease ? [normalizedRelease] : [],
            origin: extractOrigin(normalizedRelease) ?? extractOrigin(fileName) ?? null,
            fileName,
          };

          collected.set(subtitleId, entry);
        }
      }
    }

    return Array.from(collected.values());
  } catch (error) {
    console.error("[Gestdown] Unexpected error while searching:", error);
    return [];
  }
}
