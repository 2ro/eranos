/**
 * Geographic Identifier Utilities
 * 
 * Manages ISO 3166 identifiers for Nostr events:
 * - ISO 3166-1 alpha-2 country codes (e.g., 'US', 'BR')
 * - ISO 3166-2 subdivision codes (e.g., 'US-CA', 'BR-SP', 'CN-54')
 * 
 * Provides migration support from legacy geo: format to iso3166: format.
 * 
 * @see NIP.md for protocol specification
 */

import { isValidCountryCode, isValidSubdivisionCode, isSubdivisionFormat, isValidGeoCode } from './countries';

/**
 * Create an ISO 3166 identifier for Nostr events.
 * Supports both country codes and subdivision codes.
 * 
 * @param code - ISO 3166-1 alpha-2 country code (e.g., 'BR', 'US') or ISO 3166-2 subdivision code (e.g., 'US-CA', 'CN-54')
 * @returns Formatted identifier (e.g., 'iso3166:BR' or 'iso3166:US-CA')
 * @throws Error if the code is invalid
 */
export function createCountryIdentifier(code: string): string {
  const upperCode = code.toUpperCase();
  if (!isValidGeoCode(upperCode)) {
    throw new Error(`Invalid ISO 3166 code: ${code}`);
  }
  return `iso3166:${upperCode}`;
}

/**
 * Parse a geographic identifier and extract the code.
 * Supports both new (iso3166:) and legacy (geo:) formats.
 * Returns both country codes (e.g., 'BR') and subdivision codes (e.g., 'US-CA').
 * 
 * @param identifier - Geographic identifier (e.g., 'iso3166:BR', 'iso3166:US-CA', or 'geo:BR')
 * @returns ISO 3166 code or undefined if invalid
 * 
 * @example
 * parseCountryIdentifier('iso3166:BR') // 'BR'
 * parseCountryIdentifier('iso3166:US-CA') // 'US-CA'
 * parseCountryIdentifier('iso3166:CN-54') // 'CN-54'
 * parseCountryIdentifier('geo:BR') // 'BR' (legacy support)
 * parseCountryIdentifier('geo:6gyf4') // undefined (geohash, not country)
 */
export function parseCountryIdentifier(identifier: string): string | undefined {
  if (!identifier) return undefined;
  
  const lowerIdentifier = identifier.toLowerCase();
  
  // New format (case-insensitive)
  if (lowerIdentifier.startsWith('iso3166:')) {
    const code = identifier.slice(8).toUpperCase();

    // Check subdivision format first (e.g., 'US-CA', 'CN-54')
    if (isSubdivisionFormat(code) && isValidSubdivisionCode(code)) {
      return code;
    }

    // Then check country format (e.g., 'BR', 'US')
    if (code.length === 2 && isValidCountryCode(code)) {
      return code;
    }

    return undefined;
  }
  
  // Legacy format (deprecated, case-insensitive) - only supports country codes
  if (lowerIdentifier.startsWith('geo:')) {
    const code = identifier.slice(4).toUpperCase();
    // Validate it's a country code, not a geohash
    if (code.length === 2 && isValidCountryCode(code)) {
      return code;
    }
  }
  
  return undefined;
}

/**
 * Check if an identifier is a valid geographic identifier (iso3166: or legacy geo:)
 * Supports both country and subdivision identifiers.
 * @param identifier - Identifier to check
 * @returns True if it's a valid geographic identifier
 */
export function isCountryIdentifier(identifier: string): boolean {
  return parseCountryIdentifier(identifier) !== undefined;
}

/**
 * Get filter values for querying geographically-scoped events.
 * Returns both new and legacy formats for backward compatibility.
 * 
 * For subdivision codes, only the iso3166: format is returned (no legacy geo: support
 * since subdivisions were never published with the legacy format).
 * 
 * @param code - ISO 3166-1 alpha-2 country code or ISO 3166-2 subdivision code
 * @param legacySupport - Include legacy geo: format for country codes (default: true during migration period ending March 1, 2026)
 * @returns Array of identifier formats to query
 * 
 * @example
 * getCountryFilterValues('BR', true) // ['iso3166:BR', 'geo:BR']
 * getCountryFilterValues('BR', false) // ['iso3166:BR']
 * getCountryFilterValues('US-CA', true) // ['iso3166:US-CA'] (no legacy format for subdivisions)
 */
export function getCountryFilterValues(
  code: string,
  legacySupport: boolean = true
): string[] {
  const upperCode = code.toUpperCase();
  const values = [createCountryIdentifier(upperCode)];
  
  // Legacy geo: format only applies to country codes (2-letter), not subdivisions
  if (legacySupport && !isSubdivisionFormat(upperCode)) {
    values.push(`geo:${upperCode}`); // Legacy format - deprecated, will not be queried after March 1, 2026
  }
  
  return values;
}

/**
 * DEPRECATED: Legacy function for backward compatibility
 * Use createCountryIdentifier() instead
 * @deprecated Will be removed after migration period
 */
export function createGeoIdentifier(countryCode: string): string {
  console.warn('createGeoIdentifier is deprecated. Use createCountryIdentifier instead.');
  return `geo:${countryCode.toUpperCase()}`;
}
