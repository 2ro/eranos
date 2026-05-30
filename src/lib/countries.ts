import { getSubdivisionName, getSubdivisionWikipediaTitle } from './subdivisions';
import { SUBDIVISION_CODES as SUBDIVISION_CODE_LIST } from './subdivisionCodes';

/**
 * Authoritative set of ISO 3166-2 subdivision codes for validation.
 *
 * Backed by a build-time-generated code list (`subdivisionCodes.ts`) rather
 * than importing the full `iso-3166` package, which would drag ~244 KB of
 * subdivision objects into the critical-path bundle. Regenerate the list with
 * `node scripts/gen-subdivision-codes.mjs`.
 */
const SUBDIVISION_CODES = new Set(SUBDIVISION_CODE_LIST);

/** ISO 3166-1 alpha-2 country code to country name and flag emoji mapping. */
export const COUNTRIES: Record<string, { name: string; flag: string }> = {
  AF: { name: 'Afghanistan', flag: '🇦🇫' },
  AL: { name: 'Albania', flag: '🇦🇱' },
  DZ: { name: 'Algeria', flag: '🇩🇿' },
  AD: { name: 'Andorra', flag: '🇦🇩' },
  AO: { name: 'Angola', flag: '🇦🇴' },
  AG: { name: 'Antigua and Barbuda', flag: '🇦🇬' },
  AR: { name: 'Argentina', flag: '🇦🇷' },
  AM: { name: 'Armenia', flag: '🇦🇲' },
  AU: { name: 'Australia', flag: '🇦🇺' },
  AT: { name: 'Austria', flag: '🇦🇹' },
  AZ: { name: 'Azerbaijan', flag: '🇦🇿' },
  BS: { name: 'Bahamas', flag: '🇧🇸' },
  BH: { name: 'Bahrain', flag: '🇧🇭' },
  BD: { name: 'Bangladesh', flag: '🇧🇩' },
  BB: { name: 'Barbados', flag: '🇧🇧' },
  BY: { name: 'Belarus', flag: '🇧🇾' },
  BE: { name: 'Belgium', flag: '🇧🇪' },
  BZ: { name: 'Belize', flag: '🇧🇿' },
  BJ: { name: 'Benin', flag: '🇧🇯' },
  BT: { name: 'Bhutan', flag: '🇧🇹' },
  BO: { name: 'Bolivia', flag: '🇧🇴' },
  BA: { name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  BW: { name: 'Botswana', flag: '🇧🇼' },
  BR: { name: 'Brazil', flag: '🇧🇷' },
  BN: { name: 'Brunei', flag: '🇧🇳' },
  BG: { name: 'Bulgaria', flag: '🇧🇬' },
  BF: { name: 'Burkina Faso', flag: '🇧🇫' },
  BI: { name: 'Burundi', flag: '🇧🇮' },
  CV: { name: 'Cabo Verde', flag: '🇨🇻' },
  KH: { name: 'Cambodia', flag: '🇰🇭' },
  CM: { name: 'Cameroon', flag: '🇨🇲' },
  CA: { name: 'Canada', flag: '🇨🇦' },
  CF: { name: 'Central African Republic', flag: '🇨🇫' },
  TD: { name: 'Chad', flag: '🇹🇩' },
  CL: { name: 'Chile', flag: '🇨🇱' },
  CN: { name: 'China', flag: '🇨🇳' },
  CO: { name: 'Colombia', flag: '🇨🇴' },
  KM: { name: 'Comoros', flag: '🇰🇲' },
  CG: { name: 'Congo', flag: '🇨🇬' },
  CD: { name: 'Congo (DRC)', flag: '🇨🇩' },
  CR: { name: 'Costa Rica', flag: '🇨🇷' },
  CI: { name: "Cote d'Ivoire", flag: '🇨🇮' },
  HR: { name: 'Croatia', flag: '🇭🇷' },
  CU: { name: 'Cuba', flag: '🇨🇺' },
  CY: { name: 'Cyprus', flag: '🇨🇾' },
  CZ: { name: 'Czechia', flag: '🇨🇿' },
  DK: { name: 'Denmark', flag: '🇩🇰' },
  DJ: { name: 'Djibouti', flag: '🇩🇯' },
  DM: { name: 'Dominica', flag: '🇩🇲' },
  DO: { name: 'Dominican Republic', flag: '🇩🇴' },
  EC: { name: 'Ecuador', flag: '🇪🇨' },
  EG: { name: 'Egypt', flag: '🇪🇬' },
  SV: { name: 'El Salvador', flag: '🇸🇻' },
  GQ: { name: 'Equatorial Guinea', flag: '🇬🇶' },
  ER: { name: 'Eritrea', flag: '🇪🇷' },
  EE: { name: 'Estonia', flag: '🇪🇪' },
  SZ: { name: 'Eswatini', flag: '🇸🇿' },
  ET: { name: 'Ethiopia', flag: '🇪🇹' },
  FJ: { name: 'Fiji', flag: '🇫🇯' },
  FI: { name: 'Finland', flag: '🇫🇮' },
  FR: { name: 'France', flag: '🇫🇷' },
  GA: { name: 'Gabon', flag: '🇬🇦' },
  GM: { name: 'Gambia', flag: '🇬🇲' },
  GE: { name: 'Georgia', flag: '🇬🇪' },
  DE: { name: 'Germany', flag: '🇩🇪' },
  GH: { name: 'Ghana', flag: '🇬🇭' },
  GR: { name: 'Greece', flag: '🇬🇷' },
  GD: { name: 'Grenada', flag: '🇬🇩' },
  GT: { name: 'Guatemala', flag: '🇬🇹' },
  GN: { name: 'Guinea', flag: '🇬🇳' },
  GW: { name: 'Guinea-Bissau', flag: '🇬🇼' },
  GY: { name: 'Guyana', flag: '🇬🇾' },
  HT: { name: 'Haiti', flag: '🇭🇹' },
  HN: { name: 'Honduras', flag: '🇭🇳' },
  HU: { name: 'Hungary', flag: '🇭🇺' },
  IS: { name: 'Iceland', flag: '🇮🇸' },
  IN: { name: 'India', flag: '🇮🇳' },
  ID: { name: 'Indonesia', flag: '🇮🇩' },
  IR: { name: 'Iran', flag: '🇮🇷' },
  IQ: { name: 'Iraq', flag: '🇮🇶' },
  IE: { name: 'Ireland', flag: '🇮🇪' },
  IL: { name: 'Israel', flag: '🇮🇱' },
  IT: { name: 'Italy', flag: '🇮🇹' },
  JM: { name: 'Jamaica', flag: '🇯🇲' },
  JP: { name: 'Japan', flag: '🇯🇵' },
  JO: { name: 'Jordan', flag: '🇯🇴' },
  KZ: { name: 'Kazakhstan', flag: '🇰🇿' },
  KE: { name: 'Kenya', flag: '🇰🇪' },
  KI: { name: 'Kiribati', flag: '🇰🇮' },
  XK: { name: 'Kosovo', flag: '🌍' },
  KP: { name: 'North Korea', flag: '🇰🇵' },
  KR: { name: 'South Korea', flag: '🇰🇷' },
  KW: { name: 'Kuwait', flag: '🇰🇼' },
  KG: { name: 'Kyrgyzstan', flag: '🇰🇬' },
  LA: { name: 'Laos', flag: '🇱🇦' },
  LV: { name: 'Latvia', flag: '🇱🇻' },
  LB: { name: 'Lebanon', flag: '🇱🇧' },
  LS: { name: 'Lesotho', flag: '🇱🇸' },
  LR: { name: 'Liberia', flag: '🇱🇷' },
  LY: { name: 'Libya', flag: '🇱🇾' },
  LI: { name: 'Liechtenstein', flag: '🇱🇮' },
  LT: { name: 'Lithuania', flag: '🇱🇹' },
  LU: { name: 'Luxembourg', flag: '🇱🇺' },
  MG: { name: 'Madagascar', flag: '🇲🇬' },
  MW: { name: 'Malawi', flag: '🇲🇼' },
  MY: { name: 'Malaysia', flag: '🇲🇾' },
  MV: { name: 'Maldives', flag: '🇲🇻' },
  ML: { name: 'Mali', flag: '🇲🇱' },
  MT: { name: 'Malta', flag: '🇲🇹' },
  MH: { name: 'Marshall Islands', flag: '🇲🇭' },
  MR: { name: 'Mauritania', flag: '🇲🇷' },
  MU: { name: 'Mauritius', flag: '🇲🇺' },
  MX: { name: 'Mexico', flag: '🇲🇽' },
  FM: { name: 'Micronesia', flag: '🇫🇲' },
  MD: { name: 'Moldova', flag: '🇲🇩' },
  MC: { name: 'Monaco', flag: '🇲🇨' },
  MN: { name: 'Mongolia', flag: '🇲🇳' },
  ME: { name: 'Montenegro', flag: '🇲🇪' },
  MA: { name: 'Morocco', flag: '🇲🇦' },
  MZ: { name: 'Mozambique', flag: '🇲🇿' },
  MM: { name: 'Myanmar', flag: '🇲🇲' },
  NA: { name: 'Namibia', flag: '🇳🇦' },
  NR: { name: 'Nauru', flag: '🇳🇷' },
  NP: { name: 'Nepal', flag: '🇳🇵' },
  NL: { name: 'Netherlands', flag: '🇳🇱' },
  NZ: { name: 'New Zealand', flag: '🇳🇿' },
  NI: { name: 'Nicaragua', flag: '🇳🇮' },
  NE: { name: 'Niger', flag: '🇳🇪' },
  NG: { name: 'Nigeria', flag: '🇳🇬' },
  MK: { name: 'North Macedonia', flag: '🇲🇰' },
  NO: { name: 'Norway', flag: '🇳🇴' },
  OM: { name: 'Oman', flag: '🇴🇲' },
  PK: { name: 'Pakistan', flag: '🇵🇰' },
  PW: { name: 'Palau', flag: '🇵🇼' },
  PS: { name: 'Palestine', flag: '🇵🇸' },
  PA: { name: 'Panama', flag: '🇵🇦' },
  PG: { name: 'Papua New Guinea', flag: '🇵🇬' },
  PY: { name: 'Paraguay', flag: '🇵🇾' },
  PE: { name: 'Peru', flag: '🇵🇪' },
  PH: { name: 'Philippines', flag: '🇵🇭' },
  PL: { name: 'Poland', flag: '🇵🇱' },
  PT: { name: 'Portugal', flag: '🇵🇹' },
  QA: { name: 'Qatar', flag: '🇶🇦' },
  RO: { name: 'Romania', flag: '🇷🇴' },
  RU: { name: 'Russia', flag: '🇷🇺' },
  RW: { name: 'Rwanda', flag: '🇷🇼' },
  KN: { name: 'Saint Kitts and Nevis', flag: '🇰🇳' },
  LC: { name: 'Saint Lucia', flag: '🇱🇨' },
  VC: { name: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
  WS: { name: 'Samoa', flag: '🇼🇸' },
  SM: { name: 'San Marino', flag: '🇸🇲' },
  ST: { name: 'Sao Tome and Principe', flag: '🇸🇹' },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦' },
  SN: { name: 'Senegal', flag: '🇸🇳' },
  RS: { name: 'Serbia', flag: '🇷🇸' },
  SC: { name: 'Seychelles', flag: '🇸🇨' },
  SL: { name: 'Sierra Leone', flag: '🇸🇱' },
  SG: { name: 'Singapore', flag: '🇸🇬' },
  SK: { name: 'Slovakia', flag: '🇸🇰' },
  SI: { name: 'Slovenia', flag: '🇸🇮' },
  SB: { name: 'Solomon Islands', flag: '🇸🇧' },
  SO: { name: 'Somalia', flag: '🇸🇴' },
  ZA: { name: 'South Africa', flag: '🇿🇦' },
  SS: { name: 'South Sudan', flag: '🇸🇸' },
  ES: { name: 'Spain', flag: '🇪🇸' },
  LK: { name: 'Sri Lanka', flag: '🇱🇰' },
  SD: { name: 'Sudan', flag: '🇸🇩' },
  SR: { name: 'Suriname', flag: '🇸🇷' },
  SE: { name: 'Sweden', flag: '🇸🇪' },
  CH: { name: 'Switzerland', flag: '🇨🇭' },
  SY: { name: 'Syria', flag: '🇸🇾' },
  TW: { name: 'Taiwan', flag: '🇹🇼' },
  TJ: { name: 'Tajikistan', flag: '🇹🇯' },
  TZ: { name: 'Tanzania', flag: '🇹🇿' },
  TH: { name: 'Thailand', flag: '🇹🇭' },
  TL: { name: 'Timor-Leste', flag: '🇹🇱' },
  TG: { name: 'Togo', flag: '🇹🇬' },
  TO: { name: 'Tonga', flag: '🇹🇴' },
  TT: { name: 'Trinidad and Tobago', flag: '🇹🇹' },
  TN: { name: 'Tunisia', flag: '🇹🇳' },
  TR: { name: 'Turkey', flag: '🇹🇷' },
  TM: { name: 'Turkmenistan', flag: '🇹🇲' },
  TV: { name: 'Tuvalu', flag: '🇹🇻' },
  UG: { name: 'Uganda', flag: '🇺🇬' },
  UA: { name: 'Ukraine', flag: '🇺🇦' },
  AE: { name: 'United Arab Emirates', flag: '🇦🇪' },
  GB: { name: 'United Kingdom', flag: '🇬🇧' },
  US: { name: 'United States', flag: '🇺🇸' },
  UY: { name: 'Uruguay', flag: '🇺🇾' },
  UZ: { name: 'Uzbekistan', flag: '🇺🇿' },
  VU: { name: 'Vanuatu', flag: '🇻🇺' },
  VA: { name: 'Vatican City', flag: '🇻🇦' },
  VE: { name: 'Venezuela', flag: '🇻🇪' },
  VN: { name: 'Vietnam', flag: '🇻🇳' },
  EH: { name: 'Western Sahara', flag: '🇪🇭' },
  YE: { name: 'Yemen', flag: '🇾🇪' },
  ZM: { name: 'Zambia', flag: '🇿🇲' },
  ZW: { name: 'Zimbabwe', flag: '🇿🇼' },
};

/** Pre-sorted array of country entries for searching. */
export const COUNTRY_LIST = (() => {
  const base = Object.entries(COUNTRIES).map(([code, { name, flag }]) => ({ code, name, flag }));

  // Promote a handful of ISO 3166-2 subdivisions to country-level entries
  // in the search list. These are editorial choices to surface places that
  // are commonly thought of as countries but lack their own ISO 3166-1
  // code. The on-wire identifier stays `iso3166:CC-XX` so we don't fork
  // a parallel addressing scheme — only the picker pretends.
  const promoted: { code: string; name: string; flag: string }[] = [
    // Tibet (CN-XZ) — bundled Snow Lion SVG renders via CountryFlag; the
    // `flag` field here is the text fallback for raw-text consumers, so
    // we use the parent-country emoji rather than nothing.
    { code: 'CN-XZ', name: 'Tibet', flag: '🇨🇳' },
  ];

  return [...base, ...promoted].sort((a, b) => a.name.localeCompare(b.name));
})();

export type CountryEntry = typeof COUNTRY_LIST[number];

interface CountryMatch {
  country: CountryEntry;
  exact: boolean;
}

/**
 * Find a single country matching the query (case-insensitive).
 * Matches exact code/name or name prefix (e.g. "angol" -> Angola).
 * Returns the match with an `exact` flag indicating whether it was a full match.
 */
export function searchCountry(query: string): CountryMatch | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;

  // Exact code match
  for (const entry of COUNTRY_LIST) {
    if (entry.code.toLowerCase() === q) {
      return { country: entry, exact: true };
    }
  }

  // Exact name match
  for (const entry of COUNTRY_LIST) {
    if (entry.name.toLowerCase() === q) {
      return { country: entry, exact: true };
    }
  }

  // Prefix match (shortest name = most specific)
  let best: CountryEntry | null = null;
  for (const entry of COUNTRY_LIST) {
    if (entry.name.toLowerCase().startsWith(q)) {
      if (!best || entry.name.length < best.name.length) {
        best = entry;
      }
    }
  }
  return best ? { country: best, exact: false } : null;
}

/**
 * Find multiple countries matching the query, ranked for typeahead results.
 * Matches ISO code, exact name, name prefix, then name substring.
 */
export function searchCountries(query: string, limit = 8): CountryEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const ranked = COUNTRY_LIST
    .map((country) => {
      const code = country.code.toLowerCase();
      const name = country.name.toLowerCase();
      if (code === q) return { country, rank: 0 };
      if (name === q) return { country, rank: 1 };
      if (name.startsWith(q)) return { country, rank: 2 };
      if (name.includes(q)) return { country, rank: 3 };
      return null;
    })
    .filter((match): match is { country: CountryEntry; rank: number } => match !== null)
    .sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name));

  return ranked.slice(0, limit).map(({ country }) => country);
}

/**
 * Map of ISO 3166-1 alpha-2 codes to their Wikipedia article titles,
 * only for countries whose common name differs from the Wikipedia title.
 */
const WIKIPEDIA_TITLES: Record<string, string> = {
  BS: 'The Bahamas',
  BO: 'Bolivia',
  CG: 'Republic of the Congo',
  CD: 'Democratic Republic of the Congo',
  CI: 'Ivory Coast',
  CZ: 'Czech Republic',
  SZ: 'Eswatini',
  GM: 'The Gambia',
  GE: 'Georgia (country)',
  IR: 'Iran',
  KP: 'North Korea',
  KR: 'South Korea',
  LA: 'Laos',
  FM: 'Federated States of Micronesia',
  MD: 'Moldova',
  MM: 'Myanmar',
  MK: 'North Macedonia',
  PS: 'State of Palestine',
  RU: 'Russia',
  ST: 'São Tomé and Príncipe',
  SY: 'Syria',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  GB: 'United Kingdom',
  US: 'United States',
  VE: 'Venezuela',
  VN: 'Vietnam',
};

/** Get the Wikipedia article title for a country or subdivision. */
export function getWikipediaTitle(code: string): string | null {
  const upper = code.toUpperCase();

  if (upper.includes('-')) {
    // Subdivision — try subdivision-specific Wikipedia title
    const subTitle = getSubdivisionWikipediaTitle(upper);
    if (subTitle) return subTitle;
    // Fall back to parent country
    const countryCode = upper.split('-')[0];
    const country = COUNTRIES[countryCode];
    if (!country) return null;
    return WIKIPEDIA_TITLES[countryCode] ?? country.name;
  }

  const country = COUNTRIES[upper];
  if (!country) return null;
  return WIKIPEDIA_TITLES[upper] ?? country.name;
}

/** Get country info from an ISO 3166 code (country or subdivision). */
export function getCountryInfo(code: string): { name: string; flag: string; subdivision?: string; subdivisionName?: string } | null {
  const upper = code.toUpperCase();

  // Handle subdivision codes like "US-CA"
  if (upper.includes('-')) {
    const [countryCode] = upper.split('-');
    const country = COUNTRIES[countryCode];
    if (!country) return null;
    return {
      name: country.name,
      flag: country.flag,
      subdivision: upper,
      subdivisionName: getSubdivisionName(upper) ?? undefined,
    };
  }

  const country = COUNTRIES[upper];
  if (!country) return null;
  return { name: country.name, flag: country.flag };
}

// ---------------------------------------------------------------------------
// ISO 3166 validators (used by countryIdentifiers.ts)
// ---------------------------------------------------------------------------

/**
 * Check if a code matches the ISO 3166-2 subdivision format
 * (2-letter country + hyphen + 1-3 alphanumeric chars).
 */
export function isSubdivisionFormat(code: string): boolean {
  return /^[A-Za-z]{2}-[A-Za-z0-9]{1,3}$/.test(code);
}

/** Validate an ISO 3166-1 alpha-2 country code. */
export function isValidCountryCode(code: string): boolean {
  return COUNTRIES[code.toUpperCase()] !== undefined;
}

/** Validate an ISO 3166-2 subdivision code (e.g. 'US-CA', 'CN-XZ'). */
export function isValidSubdivisionCode(code: string): boolean {
  return SUBDIVISION_CODES.has(code.toUpperCase());
}

/**
 * Validate that a code is either a valid ISO 3166-1 country code
 * or a valid ISO 3166-2 subdivision code.
 */
export function isValidGeoCode(code: string): boolean {
  const upper = code.toUpperCase();
  if (isSubdivisionFormat(upper)) {
    return isValidSubdivisionCode(upper);
  }
  return isValidCountryCode(upper);
}

// ---------------------------------------------------------------------------
// Country list / display helpers (Pathos-compat surface)
// ---------------------------------------------------------------------------

/**
 * Return the list of countries Agora surfaces for picker UIs, sorted
 * alphabetically by English name. Mirrors {@link COUNTRY_LIST} (which
 * also includes editorially promoted ISO 3166-2 entries like Tibet).
 * Pathos exposes a localized variant — Agora is currently English-only
 * so the `lang` argument is ignored. Kept for call-site compatibility
 * with ports.
 */
export function getAllCountries(_lang?: string): { code: string; name: string; flag: string }[] {
  return COUNTRY_LIST.map(({ code, name, flag }) => ({ code, name, flag }));
}

/**
 * Resolve an ISO 3166-1 country or 3166-2 subdivision code to a display name,
 * falling back to the upper-cased code when unknown. Subdivisions return
 * "Subdivision, Country" when both names are available.
 */
export function getGeoDisplayName(code: string, _lang?: string): string {
  const upper = code.toUpperCase();
  const info = getCountryInfo(upper);
  if (!info) return upper;
  if (info.subdivisionName) {
    return `${info.subdivisionName}, ${info.name}`;
  }
  return info.name;
}

/**
 * Convert a 2-letter ISO 3166-1 alpha-2 country code (or a subdivision
 * code) to its regional indicator emoji sequence representing the country
 * flag. Returns the parent country flag for subdivisions — for actual
 * subnational flags use {@link subdivisionFlag}.
 *
 * Unknown codes return an empty string.
 */
export function countryCodeToFlag(code: string): string {
  const upper = code.toUpperCase();
  const parentCode = upper.includes('-') ? upper.split('-')[0] : upper;
  if (!/^[A-Z]{2}$/.test(parentCode)) return '';
  // Honour explicit overrides first — covers user-assigned codes like
  // Kosovo (`XK`) whose regional-indicator sequence has no associated
  // Unicode flag glyph and would otherwise render as raw letters.
  const explicit = COUNTRIES[parentCode]?.flag;
  if (explicit) return explicit;
  // Regional indicator symbols start at U+1F1E6 (🇦); A=0x41.
  return parentCode
    .split('')
    .map((c) => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('');
}

// ── Map coordinates ──────────────────────────────────────────────────────────
//
// Approximate centre points used by the world map (`/world`). Values are
// `[longitude, latitude]` to match the convention used throughout the map UI
// (Leaflet itself prefers `[lat, lng]`, so call sites swap the order).
//
// Tables ported verbatim from Pathos's `lib/countries.ts`.

