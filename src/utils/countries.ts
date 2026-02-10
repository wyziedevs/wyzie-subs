const DEFAULT_LOCALE = "en" as const;

/**
 * Fallback ISO 3166-1 alpha-2 country names for environments without Intl.DisplayNames support.
 * Values include the primary display name and, when available, common aliases for fuzzy matching.
 */
const FALLBACK_COUNTRY_DATA: Record<string, string | string[]> = {
  AF: "Afghanistan",
  AL: "Albania",
  DZ: "Algeria",
  AS: "American Samoa",
  AD: "Andorra",
  AO: "Angola",
  AI: "Anguilla",
  AQ: "Antarctica",
  AG: "Antigua and Barbuda",
  AR: "Argentina",
  AM: "Armenia",
  AW: "Aruba",
  AU: "Australia",
  AT: "Austria",
  AZ: "Azerbaijan",
  BS: "Bahamas",
  BH: "Bahrain",
  BD: "Bangladesh",
  BB: "Barbados",
  BY: "Belarus",
  BE: "Belgium",
  BZ: "Belize",
  BJ: "Benin",
  BM: "Bermuda",
  BT: "Bhutan",
  BO: "Bolivia",
  BA: "Bosnia and Herzegovina",
  BW: "Botswana",
  BV: "Bouvet Island",
  BR: "Brazil",
  IO: "British Indian Ocean Territory",
  BN: "Brunei Darussalam",
  BG: "Bulgaria",
  BF: "Burkina Faso",
  BI: "Burundi",
  KH: "Cambodia",
  CM: "Cameroon",
  CA: "Canada",
  CV: "Cape Verde",
  KY: "Cayman Islands",
  CF: "Central African Republic",
  TD: "Chad",
  CL: "Chile",
  CN: ["People's Republic of China", "China"],
  CX: "Christmas Island",
  CC: "Cocos (Keeling) Islands",
  CO: "Colombia",
  KM: "Comoros",
  CG: ["Republic of the Congo", "Congo"],
  CD: ["Democratic Republic of the Congo", "Congo"],
  CK: "Cook Islands",
  CR: "Costa Rica",
  CI: ["Cote d'Ivoire", "Côte d'Ivoire", "Ivory Coast"],
  HR: "Croatia",
  CU: "Cuba",
  CY: "Cyprus",
  CZ: ["Czech Republic", "Czechia"],
  DK: "Denmark",
  DJ: "Djibouti",
  DM: "Dominica",
  DO: "Dominican Republic",
  EC: "Ecuador",
  EG: "Egypt",
  SV: "El Salvador",
  GQ: "Equatorial Guinea",
  ER: "Eritrea",
  EE: "Estonia",
  ET: "Ethiopia",
  FK: "Falkland Islands (Malvinas)",
  FO: "Faroe Islands",
  FJ: "Fiji",
  FI: "Finland",
  FR: "France",
  GF: "French Guiana",
  PF: "French Polynesia",
  TF: "French Southern Territories",
  GA: "Gabon",
  GM: ["Republic of The Gambia", "The Gambia", "Gambia"],
  GE: "Georgia",
  DE: "Germany",
  GH: "Ghana",
  GI: "Gibraltar",
  GR: "Greece",
  GL: "Greenland",
  GD: "Grenada",
  GP: "Guadeloupe",
  GU: "Guam",
  GT: "Guatemala",
  GN: "Guinea",
  GW: "Guinea-Bissau",
  GY: "Guyana",
  HT: "Haiti",
  HM: "Heard Island and McDonald Islands",
  VA: "Holy See (Vatican City State)",
  HN: "Honduras",
  HK: "Hong Kong",
  HU: "Hungary",
  IS: "Iceland",
  IN: "India",
  ID: "Indonesia",
  IR: ["Islamic Republic of Iran", "Iran"],
  IQ: "Iraq",
  IE: "Ireland",
  IL: "Israel",
  IT: "Italy",
  JM: "Jamaica",
  JP: "Japan",
  JO: "Jordan",
  KZ: "Kazakhstan",
  KE: "Kenya",
  KI: "Kiribati",
  KP: "North Korea",
  KR: ["South Korea", "Korea, Republic of", "Republic of Korea"],
  KW: "Kuwait",
  KG: "Kyrgyzstan",
  LA: "Lao People's Democratic Republic",
  LV: "Latvia",
  LB: "Lebanon",
  LS: "Lesotho",
  LR: "Liberia",
  LY: "Libya",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  MO: "Macao",
  MG: "Madagascar",
  MW: "Malawi",
  MY: "Malaysia",
  MV: "Maldives",
  ML: "Mali",
  MT: "Malta",
  MH: "Marshall Islands",
  MQ: "Martinique",
  MR: "Mauritania",
  MU: "Mauritius",
  YT: "Mayotte",
  MX: "Mexico",
  FM: "Micronesia, Federated States of",
  MD: "Moldova, Republic of",
  MC: "Monaco",
  MN: "Mongolia",
  MS: "Montserrat",
  MA: "Morocco",
  MZ: "Mozambique",
  MM: "Myanmar",
  NA: "Namibia",
  NR: "Nauru",
  NP: "Nepal",
  NL: ["Netherlands", "The Netherlands", "Netherlands (Kingdom of the)"],
  NC: "New Caledonia",
  NZ: "New Zealand",
  NI: "Nicaragua",
  NE: "Niger",
  NG: "Nigeria",
  NU: "Niue",
  NF: "Norfolk Island",
  MK: ["The Republic of North Macedonia", "North Macedonia"],
  MP: "Northern Mariana Islands",
  NO: "Norway",
  OM: "Oman",
  PK: "Pakistan",
  PW: "Palau",
  PS: ["State of Palestine", "Palestine"],
  PA: "Panama",
  PG: "Papua New Guinea",
  PY: "Paraguay",
  PE: "Peru",
  PH: "Philippines",
  PN: ["Pitcairn", "Pitcairn Islands"],
  PL: "Poland",
  PT: "Portugal",
  PR: "Puerto Rico",
  QA: "Qatar",
  RE: "Reunion",
  RO: "Romania",
  RU: ["Russian Federation", "Russia"],
  RW: "Rwanda",
  SH: "Saint Helena",
  KN: "Saint Kitts and Nevis",
  LC: "Saint Lucia",
  PM: "Saint Pierre and Miquelon",
  VC: "Saint Vincent and the Grenadines",
  WS: "Samoa",
  SM: "San Marino",
  ST: "Sao Tome and Principe",
  SA: "Saudi Arabia",
  SN: "Senegal",
  SC: "Seychelles",
  SL: "Sierra Leone",
  SG: "Singapore",
  SK: "Slovakia",
  SI: "Slovenia",
  SB: "Solomon Islands",
  SO: "Somalia",
  ZA: "South Africa",
  GS: "South Georgia and the South Sandwich Islands",
  ES: "Spain",
  LK: "Sri Lanka",
  SD: "Sudan",
  SR: "Suriname",
  SJ: "Svalbard and Jan Mayen",
  SZ: "Eswatini",
  SE: "Sweden",
  CH: "Switzerland",
  SY: "Syrian Arab Republic",
  TW: ["Taiwan, Province of China", "Taiwan"],
  TJ: "Tajikistan",
  TZ: ["United Republic of Tanzania", "Tanzania"],
  TH: "Thailand",
  TL: "Timor-Leste",
  TG: "Togo",
  TK: "Tokelau",
  TO: "Tonga",
  TT: "Trinidad and Tobago",
  TN: "Tunisia",
  TR: ["Türkiye", "Turkey"],
  TM: "Turkmenistan",
  TC: "Turks and Caicos Islands",
  TV: "Tuvalu",
  UG: "Uganda",
  UA: "Ukraine",
  AE: ["United Arab Emirates", "UAE"],
  GB: ["United Kingdom", "UK", "Great Britain"],
  US: ["United States of America", "United States", "USA", "U.S.A.", "US", "U.S."],
  UM: "United States Minor Outlying Islands",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VU: "Vanuatu",
  VE: "Venezuela",
  VN: "Vietnam",
  VG: "Virgin Islands, British",
  VI: "Virgin Islands, U.S.",
  WF: "Wallis and Futuna",
  EH: "Western Sahara",
  YE: "Yemen",
  ZM: "Zambia",
  ZW: "Zimbabwe",
  AX: ["Åland Islands", "Aland Islands"],
  BQ: "Bonaire, Sint Eustatius and Saba",
  CW: "Curaçao",
  GG: "Guernsey",
  IM: "Isle of Man",
  JE: "Jersey",
  ME: "Montenegro",
  BL: "Saint Barthélemy",
  MF: "Saint Martin (French part)",
  RS: "Serbia",
  SX: "Sint Maarten (Dutch part)",
  SS: "South Sudan",
  XK: "Kosovo",
};

const namesCache: Record<string, string> = {};
const nameIndex = new Map<string, string>();
let initialized = false;

function maybeGetDisplayNames(): Intl.DisplayNames | null {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames === "undefined") {
    return null;
  }
  try {
    return new Intl.DisplayNames([DEFAULT_LOCALE], { type: "region" });
  } catch {
    return null;
  }
}

function getRegionCodes(): string[] {
  const intlWithSupported = Intl as typeof Intl & { supportedValuesOf?: (kind: string) => string[] };
  if (typeof intlWithSupported.supportedValuesOf === "function") {
    try {
      const values = intlWithSupported.supportedValuesOf("region");
      if (Array.isArray(values) && values.length > 0) {
        return Array.from(
          new Set(
            values
              .map((code) => code.toUpperCase())
              .filter((code) => /^[A-Z]{2}$/.test(code)),
          ),
        );
      }
    } catch {
      // ignore unsupported key
    }
  }
  return Object.keys(FALLBACK_COUNTRY_DATA);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function addAlias(alias: string, code: string) {
  const trimmed = alias.trim();
  if (!trimmed) {
    return;
  }
  const lower = trimmed.toLowerCase();
  nameIndex.set(lower, code);
  const collapsed = normalizeKey(trimmed);
  if (collapsed) {
    nameIndex.set(collapsed, code);
  }
}

function ensureInitialized() {
  if (initialized) {
    return;
  }

  const displayNames = maybeGetDisplayNames();
  const regionCodes = new Set<string>([...getRegionCodes(), ...Object.keys(FALLBACK_COUNTRY_DATA)]);

  for (const code of regionCodes) {
    const fallbackValue = FALLBACK_COUNTRY_DATA[code];
    const fallbackPrimary = Array.isArray(fallbackValue) ? fallbackValue[0] : fallbackValue;
    const displayName = displayNames?.of(code) ?? null;
    const primary = (displayName && displayName !== code ? displayName : fallbackPrimary) ?? code;
    namesCache[code] = primary;

    const aliases = new Set<string>();
    if (Array.isArray(fallbackValue)) {
      for (const alias of fallbackValue) {
        if (alias) {
          aliases.add(alias);
        }
      }
    } else if (fallbackValue) {
      aliases.add(fallbackValue);
    }
    if (displayName) {
      aliases.add(displayName);
    }
    aliases.add(primary);
    aliases.add(code);
    aliases.add(code.toLowerCase());
    aliases.add(code.toUpperCase());

    for (const alias of aliases) {
      addAlias(alias, code);
    }
  }

  initialized = true;
}

export function getCountryNames(locale: string = DEFAULT_LOCALE): Record<string, string> {
  if (locale.toLowerCase() !== DEFAULT_LOCALE) {
    return {};
  }
  ensureInitialized();
  return { ...namesCache };
}

export function getAlpha2Code(name: string, locale: string = DEFAULT_LOCALE): string | undefined {
  if (locale.toLowerCase() !== DEFAULT_LOCALE) {
    return undefined;
  }
  ensureInitialized();
  const trimmed = name.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  return (
    nameIndex.get(lower) ??
    nameIndex.get(normalizeKey(trimmed)) ??
    nameIndex.get(trimmed.toUpperCase())
  );
}
