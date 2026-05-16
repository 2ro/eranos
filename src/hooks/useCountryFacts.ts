import { useQuery } from '@tanstack/react-query';

/**
 * Facts about a sovereign country pulled from Wikidata.
 *
 * Subdivisions (e.g. `US-CA`) are not supported — Wikidata's data quality and
 * property layout differ significantly between the country and subdivision
 * levels, so we keep this hook narrowly focused on alpha-2 country codes.
 */
export interface CountryFacts {
  /** Wikidata entity ID (e.g. `Q142` for France). */
  id: string;
  /** Official native name(s) — `<lang>: <name>` pairs. */
  officialNames: { lang: string; name: string }[];
  /** Demonym (e.g. "French" for France). */
  demonym: string | null;
  /** Capital city name. */
  capital: string | null;
  /** Form of government (e.g. "federal republic"). */
  government: string | null;
  /** Head of state (current). */
  headOfState: string | null;
  /** Head of government (current). */
  headOfGovernment: string | null;
  /** Population. */
  population: number | null;
  /** Total area in km². */
  area: number | null;
  /** Inception / founding date as ISO string (YYYY or YYYY-MM-DD). */
  inception: string | null;
  /** Official language names. */
  languages: string[];
  /** Currency name(s). */
  currencies: string[];
  /** Coat of arms image URL (Commons Special:FilePath). */
  coatOfArmsUrl: string | null;
  /**
   * Commons filename of the national anthem audio file (e.g.
   * `Gloria al Bravo Pueblo instrumental.ogg`). To play it you need to
   * resolve actual playable derivative URLs through the MediaWiki API —
   * see `useCommonsAudio`. The raw filename is exposed (rather than a
   * direct URL) because OGG Vorbis isn't playable in Safari/WKWebView,
   * so we always want to negotiate an MP3 transcode.
   */
  anthemFilename: string | null;
  /** National anthem title. */
  anthemTitle: string | null;
  /** Time zone(s) (UTC offsets as strings, e.g. "UTC+1"). */
  timeZones: string[];
  /** Wikidata article URL for the country. */
  wikidataUrl: string;
}

const ENDPOINT = 'https://query.wikidata.org/sparql';

/**
 * Single SPARQL query that pulls all interesting country facts grouped per
 * country entity. We GROUP_CONCAT multi-valued properties (languages,
 * currencies, time zones, official names) so the result is a single row.
 *
 * `?country wdt:P297 "<CODE>"` resolves the ISO 3166-1 alpha-2 code to a
 * Wikidata country. `wdt:` shortcuts truthy claims (best-rank statements),
 * which gives us current values for things like head of state without
 * extracting them from full statement objects.
 */
function buildQuery(code: string): string {
  const safeCode = code.toUpperCase().replace(/[^A-Z]/g, '');
  return `
SELECT
  ?country ?countryLabel
  ?demonymLabel
  ?capitalLabel
  ?governmentLabel
  ?headOfStateLabel
  ?headOfGovernmentLabel
  ?population
  ?area
  ?inception
  (GROUP_CONCAT(DISTINCT ?languageEntry; SEPARATOR="|") AS ?languages)
  (GROUP_CONCAT(DISTINCT ?currencyLabel; SEPARATOR="|") AS ?currencies)
  (GROUP_CONCAT(DISTINCT ?timeZoneLabel; SEPARATOR="|") AS ?timeZones)
  (GROUP_CONCAT(DISTINCT CONCAT(LANG(?officialName), ":", STR(?officialName)); SEPARATOR="|") AS ?officialNames)
  (SAMPLE(?coatOfArms) AS ?coatOfArms)
  (SAMPLE(?anthem) AS ?anthem)
  (SAMPLE(?anthemLabel) AS ?anthemTitle)
WHERE {
  ?country wdt:P297 "${safeCode}" .
  OPTIONAL { ?country wdt:P1813 ?demonym . FILTER(LANG(?demonym) = "en") }
  OPTIONAL { ?country wdt:P1448 ?officialName . }
  OPTIONAL { ?country wdt:P36 ?capital . }
  OPTIONAL { ?country wdt:P122 ?government . }
  OPTIONAL { ?country wdt:P35 ?headOfState . }
  OPTIONAL { ?country wdt:P6 ?headOfGovernment . }
  OPTIONAL { ?country wdt:P1082 ?population . }
  OPTIONAL { ?country wdt:P2046 ?area . }
  OPTIONAL { ?country wdt:P571 ?inception . }
  OPTIONAL {
    ?country wdt:P37 ?language .
    ?language rdfs:label ?languageLabel . FILTER(LANG(?languageLabel) = "en")
    # Wikidata lists sign languages as official languages of many
    # countries (e.g. Venezuelan Sign Language for VE) alongside the
    # spoken language(s). For a destination-flavour header the user
    # is asking "what do they speak?" — signed languages are
    # accessibility metadata, not a postcard answer. Filter them out.
    FILTER NOT EXISTS { ?language wdt:P31/wdt:P279* wd:Q34228 }
    BIND(?languageLabel AS ?languageEntry)
  }
  OPTIONAL { ?country wdt:P38 ?currency . ?currency rdfs:label ?currencyLabel . FILTER(LANG(?currencyLabel) = "en") }
  OPTIONAL { ?country wdt:P421 ?timeZone . ?timeZone rdfs:label ?timeZoneLabel . FILTER(LANG(?timeZoneLabel) = "en") }
  OPTIONAL { ?country wdt:P94 ?coatOfArms . }
  OPTIONAL { ?country wdt:P85 ?anthemRef . ?anthemRef wdt:P51 ?anthem . ?anthemRef rdfs:label ?anthemLabel . FILTER(LANG(?anthemLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?country ?countryLabel ?demonymLabel ?capitalLabel ?governmentLabel ?headOfStateLabel ?headOfGovernmentLabel ?population ?area ?inception
LIMIT 1`;
}

interface SparqlBinding {
  [key: string]: { type: string; value: string } | undefined;
}

interface SparqlResponse {
  results?: { bindings?: SparqlBinding[] };
}

/**
 * Convert a Wikidata "Commons media" claim value into a direct image URL
 * via Commons' Special:FilePath redirect endpoint. SPARQL returns image
 * values as `http://commons.wikimedia.org/wiki/Special:FilePath/<encoded>`
 * URLs — `<encoded>` is already percent-encoded, so we decode first and
 * then re-encode to avoid double-encoding spaces (`%20` → `%2520`).
 *
 * Always returns `https://` even though SPARQL emits `http://`, so the
 * URL is loadable from secure contexts without mixed-content blocks.
 */
function commonsImageUrl(raw: string | undefined): string | null {
  const filename = commonsFilename(raw);
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

/**
 * Extract the raw Commons filename from a `Special:FilePath/...` URL,
 * decoding the percent-encoding once so the result is a plain filename
 * (e.g. `Gloria al Bravo Pueblo instrumental.ogg`).
 */
function commonsFilename(raw: string | undefined): string | null {
  if (!raw) return null;
  const encoded = raw.replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i, '');
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    // If the input was already plain (or malformed), fall back to using
    // it as-is rather than throwing the whole fetch away.
    return encoded;
  }
}

function splitConcat(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('|').map((s) => s.trim()).filter(Boolean);
}

function parseInception(raw: string | undefined): string | null {
  if (!raw) return null;
  // Wikidata returns ISO-8601 timestamps like `1789-07-14T00:00:00Z` or
  // (for historical dates) `-0500-01-01T00:00:00Z`. Strip the time component
  // and drop trailing `-01-01` if it looks like a year-only value.
  const m = raw.match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  const [, year, month, day] = m;
  if (month === '01' && day === '01') return year;
  if (!month) return year;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

async function fetchCountryFacts(
  code: string,
  signal?: AbortSignal,
): Promise<CountryFacts | null> {
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('query', buildQuery(code));
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), {
      signal,
      headers: { Accept: 'application/sparql-results+json' },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as SparqlResponse;
    const binding = data.results?.bindings?.[0];
    if (!binding || !binding.country) return null;

    const get = (key: string) => binding[key]?.value;
    const num = (key: string): number | null => {
      const v = get(key);
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Parse the `lang:name|lang:name|...` packed string back into structured
    // entries. We drop empty lang tags (which happen for untyped strings).
    const officialNames = splitConcat(get('officialNames'))
      .map((entry) => {
        const idx = entry.indexOf(':');
        if (idx < 0) return null;
        const lang = entry.slice(0, idx);
        const name = entry.slice(idx + 1);
        if (!lang || !name) return null;
        return { lang, name };
      })
      .filter((x): x is { lang: string; name: string } => x !== null);

    const countryUri = binding.country.value;
    const id = countryUri.split('/').pop() ?? '';

    return {
      id,
      officialNames,
      demonym: get('demonymLabel') ?? null,
      capital: get('capitalLabel') ?? null,
      government: get('governmentLabel') ?? null,
      headOfState: get('headOfStateLabel') ?? null,
      headOfGovernment: get('headOfGovernmentLabel') ?? null,
      population: num('population'),
      area: num('area'),
      inception: parseInception(get('inception')),
      languages: splitConcat(get('languages')),
      currencies: splitConcat(get('currencies')),
      coatOfArmsUrl: commonsImageUrl(get('coatOfArms')),
      anthemFilename: commonsFilename(get('anthem')),
      anthemTitle: get('anthemTitle') ?? null,
      timeZones: splitConcat(get('timeZones')),
      wikidataUrl: `https://www.wikidata.org/wiki/${id}`,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch rich country facts from Wikidata for an ISO 3166-1 alpha-2 country
 * code (e.g. `FR`, `VE`). Returns `null` for unknown codes, subdivision codes
 * (`US-CA`), or when the SPARQL endpoint is unavailable.
 *
 * Cached aggressively (24 h fresh, 7 d gc) since country facts change rarely
 * and SPARQL queries are relatively expensive.
 */
export function useCountryFacts(code: string | null | undefined) {
  // Only run for valid two-letter alpha-2 codes. Subdivision codes contain a
  // dash and are explicitly out of scope.
  const isCountryCode = !!code && /^[A-Za-z]{2}$/.test(code);

  return useQuery({
    queryKey: ['country-facts', code?.toUpperCase() ?? null],
    queryFn: ({ signal }) => fetchCountryFacts(code!, signal),
    enabled: isCountryCode,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}
