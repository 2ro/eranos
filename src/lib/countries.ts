import { iso31662 } from 'iso-3166';
import { getSubdivisionName, getSubdivisionWikipediaTitle } from './subdivisions';

/** Authoritative set of ISO 3166-2 subdivision codes for validation. */
const SUBDIVISION_CODES = new Set(iso31662.map((s) => s.code));

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
  YE: { name: 'Yemen', flag: '🇾🇪' },
  ZM: { name: 'Zambia', flag: '🇿🇲' },
  ZW: { name: 'Zimbabwe', flag: '🇿🇼' },
};

/** Pre-sorted array of country entries for searching. */
const COUNTRY_LIST = Object.entries(COUNTRIES)
  .map(([code, { name, flag }]) => ({ code, name, flag }))
  .sort((a, b) => a.name.localeCompare(b.name));

export type CountryEntry = typeof COUNTRY_LIST[number];

export interface CountryMatch {
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
 * Return the list of ISO 3166-1 countries Agora knows about, sorted
 * alphabetically by English name. Pathos exposes a localized variant — Agora
 * is currently English-only so the `lang` argument is ignored. Kept for
 * call-site compatibility with ports.
 */
export function getAllCountries(_lang?: string): { code: string; name: string; flag: string }[] {
  return Object.entries(COUNTRIES)
    .map(([code, info]) => ({ code, name: info.name, flag: info.flag }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  // Regional indicator symbols start at U+1F1E6 (🇦); A=0x41.
  return parentCode
    .split('')
    .map((c) => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('');
}

/**
 * Returns the Unicode emoji flag for ISO 3166-2 subdivisions that have an
 * RGI ("Recommended for General Interchange") tag sequence — the only
 * subnational flags broadly supported across Apple, Google, Microsoft,
 * and major mobile fonts.
 *
 * As of Unicode 15.1 that set is exactly three: the constituent countries
 * of the United Kingdom (England, Scotland, Wales). All other ISO 3166-2
 * codes return `null`, and callers should fall back to the parent country
 * flag plus a typographic subdivision-code badge.
 *
 * Construction: a black flag (`U+1F3F4`) followed by ASCII tag characters
 * for each lowercase letter of the `cc-sss` identifier, terminated by a
 * cancel tag (`U+E007F`).
 */
const RGI_SUBDIVISION_FLAGS = new Set(['GB-ENG', 'GB-SCT', 'GB-WLS']);

export function subdivisionFlag(code: string): string | null {
  const upper = code.toUpperCase();
  if (!RGI_SUBDIVISION_FLAGS.has(upper)) return null;

  // Tag sequence: <U+1F3F4><tagged 'gb'><tagged 'sss'><U+E007F>
  const [country, region] = upper.toLowerCase().split('-');
  const codePoints: number[] = [0x1f3f4];
  // Each ASCII letter / digit is tagged via U+E0000 + codepoint.
  for (const ch of country) codePoints.push(0xe0000 + ch.charCodeAt(0));
  for (const ch of region) codePoints.push(0xe0000 + ch.charCodeAt(0));
  codePoints.push(0xe007f); // Cancel tag.
  return String.fromCodePoint(...codePoints);
}

// ── Map coordinates ──────────────────────────────────────────────────────────
//
// Approximate centre points used by the world map (`/world`). Values are
// `[longitude, latitude]` to match the convention used throughout the map UI
// (Leaflet itself prefers `[lat, lng]`, so call sites swap the order).
//
// Tables ported verbatim from Pathos's `lib/countries.ts`.

const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  // Africa
  AF: [66.0, 33.0],  DZ: [3.0, 28.0],   AO: [17.9, -11.2], BJ: [2.3, 9.3],
  BW: [24.7, -22.3], BF: [-1.6, 12.2],  BI: [29.9, -3.4],  CM: [12.4, 6.0],
  CF: [21.0, 6.6],   TD: [18.7, 15.5],  CD: [21.8, -4.0],  CG: [15.8, -0.2],
  CI: [-5.5, 7.5],   DJ: [42.6, 11.8],  EG: [30.0, 27.0],  GQ: [10.3, 1.7],
  ER: [39.8, 15.2],  SZ: [31.5, -26.5], ET: [40.5, 9.1],   GA: [11.6, -0.8],
  GM: [-15.3, 13.4], GH: [-1.0, 7.9],   GN: [-9.7, 9.9],   GW: [-15.2, 12.0],
  KE: [38.0, 1.0],   LS: [28.2, -29.6], LR: [-9.4, 6.4],   LY: [17.2, 26.3],
  MG: [47.0, -18.8], MW: [34.3, -13.3], ML: [-4.0, 17.6],  MR: [-10.9, 21.0],
  MU: [57.6, -20.3], MA: [-5.0, 32.0],  MZ: [35.5, -18.7], NA: [18.5, -22.0],
  NE: [8.1, 17.6],   NG: [8.0, 10.0],   RW: [29.9, -2.0],  SN: [-14.5, 14.5],
  SL: [-11.8, 8.5],  SO: [46.2, 5.2],   ZA: [24.0, -29.0], SS: [31.3, 6.9],
  SD: [30.2, 12.9],  TZ: [34.9, -6.4],  TG: [0.8, 8.6],    TN: [9.5, 34.0],
  UG: [32.3, 1.4],   ZM: [27.8, -13.1], ZW: [29.2, -19.0],
  // Americas
  AR: [-64.0, -34.0], BO: [-65.0, -17.0], BR: [-51.9, -14.2], CA: [-95.0, 60.0],
  CL: [-71.5, -30.0], CO: [-72.0, 4.0],   CR: [-84.0, 9.9],   CU: [-77.8, 21.5],
  DO: [-70.2, 18.7],  EC: [-78.2, -1.8],  SV: [-88.9, 13.8],  GT: [-90.2, 15.8],
  HT: [-72.3, 19.0],  HN: [-86.2, 15.2],  JM: [-77.3, 18.1],  MX: [-102.0, 23.0],
  NI: [-85.2, 13.0],  PA: [-80.8, 8.4],   PY: [-58.4, -23.4], PE: [-76.0, -10.0],
  PR: [-66.6, 18.2],  TT: [-61.2, 10.7],  US: [-95.7, 37.1],  UY: [-55.8, -32.5],
  VE: [-66.9, 6.4],
  // Asia
  AL: [20.0, 41.0],  AM: [45.0, 40.1],   AZ: [47.6, 40.1],  BH: [50.6, 26.0],
  BD: [90.0, 24.0],  BT: [90.4, 27.5],   BN: [114.7, 4.5],  KH: [105.0, 12.6],
  CN: [105.0, 35.0], CY: [33.4, 35.1],   GE: [43.4, 42.3],  HK: [114.1, 22.4],
  IN: [77.0, 20.0],  ID: [120.0, -5.0],  IR: [53.0, 32.0],  IQ: [44.0, 33.0],
  IL: [34.8, 31.5],  JP: [138.0, 36.0],  JO: [36.2, 30.6],  KZ: [66.9, 48.0],
  KW: [47.5, 29.3],  KG: [74.8, 41.2],   LA: [102.5, 19.9], LB: [35.9, 33.9],
  MO: [113.5, 22.2], MY: [101.7, 4.2],   MV: [73.2, 3.2],   MN: [103.8, 46.9],
  MM: [96.0, 19.2],  NP: [84.1, 28.4],   KP: [127.5, 40.3], KR: [127.5, 37.0],
  OM: [55.9, 21.5],  PK: [70.0, 30.0],   PS: [35.2, 31.9],  PH: [122.0, 13.0],
  QA: [51.2, 25.4],  SA: [45.0, 25.0],   SG: [103.8, 1.35], LK: [80.8, 7.9],
  SY: [38.0, 35.0],  TW: [121.0, 24.0],  TJ: [71.3, 38.9],  TH: [100.5, 15.0],
  TL: [125.7, -8.9], TR: [35.0, 39.0],   TM: [59.6, 38.9],  AE: [54.0, 24.0],
  UZ: [64.6, 41.4],  VN: [106.0, 16.0],  YE: [48.5, 15.6],
  // Europe
  AT: [13.3, 47.3], BY: [27.9, 53.7], BE: [4.0, 50.8],  BA: [17.7, 43.9],
  BG: [25.5, 42.7], HR: [15.5, 45.2], CZ: [15.5, 49.8], DK: [10.0, 56.0],
  EE: [25.0, 59.0], FI: [26.0, 64.0], FR: [2.0, 46.0],  DE: [9.0, 51.0],
  GR: [22.0, 39.0], HU: [20.0, 47.0], IS: [-19.0, 65.0],IE: [-8.0, 53.0],
  IT: [12.8, 42.8], LV: [24.6, 56.9], LT: [24.0, 55.2], LU: [6.1, 49.8],
  MK: [21.7, 41.5], MT: [14.4, 35.9], MD: [28.4, 47.4], ME: [19.3, 42.7],
  NL: [5.75, 52.5], NO: [10.0, 62.0], PL: [20.0, 52.0], PT: [-8.0, 39.5],
  RO: [25.0, 46.0], RU: [100.0, 60.0], RS: [21.0, 44.0], SK: [19.7, 48.7],
  SI: [14.8, 46.1], ES: [-4.0, 40.0], SE: [15.0, 62.0], CH: [8.2, 46.8],
  UA: [32.0, 49.0], GB: [-2.0, 54.0],
  // Oceania
  AU: [133.0, -27.0], FJ: [178.0, -17.8], NZ: [174.0, -41.0], PG: [147.2, -6.3],
  WS: [-172.1, -13.8], SB: [160.0, -9.6], TO: [-175.2, -21.2], VU: [166.9, -15.4],
};

const SUBDIVISION_COORDINATES: Record<string, [number, number]> = {
  // US States
  'US-AL': [-86.9, 32.8], 'US-AK': [-153.4, 64.2], 'US-AZ': [-111.1, 34.0], 'US-AR': [-92.2, 35.0],
  'US-CA': [-119.4, 36.8], 'US-CO': [-105.3, 39.1], 'US-CT': [-72.8, 41.6], 'US-DE': [-75.5, 39.0],
  'US-FL': [-81.5, 27.7], 'US-GA': [-83.5, 32.2], 'US-HI': [-155.5, 19.9], 'US-ID': [-114.7, 44.1],
  'US-IL': [-89.4, 40.3], 'US-IN': [-86.1, 40.3], 'US-IA': [-93.1, 42.0], 'US-KS': [-98.5, 38.5],
  'US-KY': [-84.3, 37.8], 'US-LA': [-91.9, 31.2], 'US-ME': [-69.4, 45.3], 'US-MD': [-76.6, 39.0],
  'US-MA': [-71.8, 42.4], 'US-MI': [-84.5, 44.3], 'US-MN': [-94.7, 46.7], 'US-MS': [-89.6, 32.7],
  'US-MO': [-91.8, 38.6], 'US-MT': [-109.5, 46.8], 'US-NE': [-99.9, 41.5], 'US-NV': [-116.4, 38.8],
  'US-NH': [-71.6, 43.2], 'US-NJ': [-74.4, 40.1], 'US-NM': [-105.9, 34.5], 'US-NY': [-75.5, 43.0],
  'US-NC': [-79.0, 35.8], 'US-ND': [-101.0, 47.5], 'US-OH': [-82.9, 40.4], 'US-OK': [-97.1, 35.0],
  'US-OR': [-120.6, 43.8], 'US-PA': [-77.2, 41.2], 'US-RI': [-71.5, 41.7], 'US-SC': [-81.1, 34.0],
  'US-SD': [-99.9, 43.9], 'US-TN': [-86.6, 35.5], 'US-TX': [-99.3, 31.1], 'US-UT': [-111.1, 39.3],
  'US-VT': [-72.6, 44.0], 'US-VA': [-78.7, 37.4], 'US-WA': [-120.7, 47.7], 'US-WV': [-80.5, 38.6],
  'US-WI': [-89.6, 43.8], 'US-WY': [-107.3, 43.0], 'US-DC': [-77.0, 38.9],
  'US-AS': [-170.7, -14.3], 'US-GU': [144.8, 13.4], 'US-MP': [145.7, 15.2],
  'US-PR': [-66.6, 18.2], 'US-VI': [-64.9, 18.3],
  // China Provinces
  'CN-AH': [117.3, 31.9], 'CN-BJ': [116.4, 39.9], 'CN-CQ': [106.5, 29.6], 'CN-FJ': [119.3, 26.1],
  'CN-GD': [113.3, 23.1], 'CN-GS': [103.8, 36.1], 'CN-GX': [108.3, 22.8], 'CN-GZ': [106.7, 26.6],
  'CN-HA': [113.6, 34.8], 'CN-HB': [114.3, 30.6], 'CN-HE': [114.5, 38.0], 'CN-HI': [110.3, 20.0],
  'CN-HK': [114.2, 22.3], 'CN-HL': [126.6, 45.8], 'CN-HN': [112.9, 28.2], 'CN-JL': [125.3, 43.9],
  'CN-JS': [118.8, 32.1], 'CN-JX': [115.9, 28.7], 'CN-LN': [123.4, 41.8], 'CN-MO': [113.5, 22.2],
  'CN-NM': [111.7, 40.8], 'CN-NX': [106.3, 38.5], 'CN-QH': [101.8, 36.6], 'CN-SC': [104.1, 30.6],
  'CN-SD': [117.0, 36.7], 'CN-SH': [121.5, 31.2], 'CN-SN': [108.9, 34.3], 'CN-SX': [112.5, 37.9],
  'CN-TJ': [117.2, 39.1], 'CN-TW': [120.9, 23.7], 'CN-XJ': [87.6, 43.8], 'CN-XZ': [91.1, 29.6],
  'CN-YN': [102.7, 25.0], 'CN-ZJ': [120.2, 30.3],
  // Brazil States
  'BR-AC': [-70.5, -9.0], 'BR-AL': [-36.7, -9.6], 'BR-AM': [-64.0, -3.4], 'BR-AP': [-51.1, 1.4],
  'BR-BA': [-41.7, -12.6], 'BR-CE': [-39.3, -5.5], 'BR-DF': [-47.9, -15.8], 'BR-ES': [-40.3, -19.2],
  'BR-GO': [-49.6, -15.9], 'BR-MA': [-44.3, -5.1], 'BR-MG': [-44.6, -18.5], 'BR-MS': [-54.8, -20.4],
  'BR-MT': [-56.1, -12.6], 'BR-PA': [-52.0, -3.4], 'BR-PB': [-36.6, -7.1], 'BR-PE': [-37.3, -8.3],
  'BR-PI': [-42.8, -7.7], 'BR-PR': [-51.4, -25.3], 'BR-RJ': [-43.2, -22.9], 'BR-RN': [-36.5, -5.8],
  'BR-RO': [-63.6, -10.9], 'BR-RR': [-61.4, 2.1], 'BR-RS': [-53.2, -30.0], 'BR-SC': [-49.4, -27.2],
  'BR-SE': [-37.1, -10.9], 'BR-SP': [-48.5, -22.2], 'BR-TO': [-48.3, -10.2],
  // India States
  'IN-AN': [92.7, 11.7], 'IN-AP': [79.7, 15.9], 'IN-AR': [94.7, 28.2], 'IN-AS': [92.9, 26.2],
  'IN-BR': [85.3, 25.1], 'IN-CH': [76.8, 30.7], 'IN-CT': [81.9, 21.3], 'IN-DL': [77.1, 28.7],
  'IN-GA': [74.0, 15.3], 'IN-GJ': [71.6, 22.3], 'IN-HP': [77.2, 31.1], 'IN-HR': [76.1, 29.1],
  'IN-JH': [85.3, 23.6], 'IN-JK': [74.8, 33.8], 'IN-KA': [75.7, 15.3], 'IN-KL': [76.3, 10.9],
  'IN-LA': [77.6, 34.2], 'IN-MH': [75.7, 19.8], 'IN-ML': [91.4, 25.5], 'IN-MN': [93.9, 24.7],
  'IN-MP': [78.7, 23.5], 'IN-MZ': [92.7, 23.2], 'IN-NL': [94.1, 26.2], 'IN-OR': [84.0, 20.9],
  'IN-PB': [75.3, 31.1], 'IN-PY': [79.8, 11.9], 'IN-RJ': [74.2, 27.0], 'IN-SK': [88.5, 27.5],
  'IN-TG': [79.0, 18.1], 'IN-TN': [78.7, 11.1], 'IN-TR': [91.7, 23.9], 'IN-UK': [79.0, 30.1],
  'IN-UP': [80.9, 26.8], 'IN-WB': [87.9, 22.6],
  // Germany
  'DE-BB': [13.4, 52.4], 'DE-BE': [13.4, 52.5], 'DE-BW': [9.0, 48.5], 'DE-BY': [11.5, 48.8],
  'DE-HB': [8.8, 53.1], 'DE-HE': [9.0, 50.7], 'DE-HH': [10.0, 53.6], 'DE-MV': [12.4, 53.6],
  'DE-NI': [9.8, 52.6], 'DE-NW': [7.5, 51.4], 'DE-RP': [7.4, 49.9], 'DE-SH': [9.8, 54.2],
  'DE-SL': [7.0, 49.4], 'DE-SN': [13.4, 51.1], 'DE-ST': [11.7, 51.8], 'DE-TH': [11.0, 50.9],
  // UK
  'GB-ENG': [-1.2, 52.0], 'GB-NIR': [-6.5, 54.6], 'GB-SCT': [-4.2, 56.5], 'GB-WLS': [-3.4, 52.1],
  // Russia
  'RU-MOW': [37.6, 55.8], 'RU-SPE': [30.3, 59.9], 'RU-MOS': [37.3, 55.5],
  // Japan
  'JP-13': [139.7, 35.7], 'JP-27': [135.5, 34.7], 'JP-23': [136.9, 35.2], 'JP-01': [143.2, 43.1],
  'JP-40': [130.4, 33.6], 'JP-14': [139.6, 35.4], 'JP-26': [135.8, 35.0],
  // Australia
  'AU-ACT': [149.1, -35.3], 'AU-NSW': [146.9, -32.0], 'AU-NT': [133.8, -19.5], 'AU-QLD': [144.7, -22.6],
  'AU-SA': [135.8, -30.0], 'AU-TAS': [146.3, -42.0], 'AU-VIC': [144.8, -37.0], 'AU-WA': [121.6, -25.0],
  // Canada
  'CA-AB': [-114.4, 53.9], 'CA-BC': [-125.6, 54.7], 'CA-MB': [-98.8, 53.8], 'CA-NB': [-66.2, 46.5],
  'CA-NL': [-57.7, 53.1], 'CA-NS': [-63.0, 44.7], 'CA-NT': [-119.3, 64.3], 'CA-NU': [-86.8, 70.3],
  'CA-ON': [-85.3, 51.3], 'CA-PE': [-63.4, 46.5], 'CA-QC': [-71.2, 52.9], 'CA-SK': [-106.3, 52.9],
  'CA-YT': [-135.1, 64.3],
  // Mexico
  'MX-AGU': [-102.3, 21.9], 'MX-BCN': [-115.1, 30.8], 'MX-BCS': [-112.1, 26.0],
  'MX-CMX': [-99.1, 19.4], 'MX-JAL': [-103.3, 20.7], 'MX-NLE': [-99.8, 25.6],
};

/**
 * Approximate centre point `[longitude, latitude]` for a country code.
 * Returns `undefined` for unknown codes (callers should fall back gracefully).
 */
export function getCountryCoordinates(code: string): [number, number] | undefined {
  return COUNTRY_COORDINATES[code.toUpperCase()];
}

/**
 * Approximate centre point `[longitude, latitude]` for an ISO 3166-2
 * subdivision code (e.g. `US-TX`, `CN-XZ`). Returns `undefined` when no
 * subdivision-specific point is curated; callers should fall back to the
 * parent country via `getCountryCoordinates`.
 */
export function getSubdivisionCoordinates(code: string): [number, number] | undefined {
  return SUBDIVISION_COORDINATES[code.toUpperCase()];
}
