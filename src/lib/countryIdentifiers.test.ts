import { describe, it, expect } from 'vitest';
import {
  createCountryIdentifier,
  parseCountryIdentifier,
  isCountryIdentifier,
  getCountryFilterValues,
} from './countryIdentifiers';

describe('countryIdentifiers', () => {
  describe('createCountryIdentifier', () => {
    it('creates iso3166 identifier with uppercase country code', () => {
      expect(createCountryIdentifier('br')).toBe('iso3166:BR');
      expect(createCountryIdentifier('BR')).toBe('iso3166:BR');
      expect(createCountryIdentifier('US')).toBe('iso3166:US');
      expect(createCountryIdentifier('de')).toBe('iso3166:DE');
    });

    it('creates iso3166 identifier with subdivision code', () => {
      expect(createCountryIdentifier('US-CA')).toBe('iso3166:US-CA');
      expect(createCountryIdentifier('us-ca')).toBe('iso3166:US-CA');
      expect(createCountryIdentifier('BR-SP')).toBe('iso3166:BR-SP');
      expect(createCountryIdentifier('CN-XZ')).toBe('iso3166:CN-XZ');
      expect(createCountryIdentifier('DE-BY')).toBe('iso3166:DE-BY');
    });

    it('throws on invalid country code', () => {
      expect(() => createCountryIdentifier('ZZ')).toThrow('Invalid ISO 3166 code: ZZ');
      expect(() => createCountryIdentifier('ABC')).toThrow('Invalid ISO 3166 code: ABC');
      expect(() => createCountryIdentifier('1A')).toThrow('Invalid ISO 3166 code: 1A');
      expect(() => createCountryIdentifier('')).toThrow();
    });

    it('throws on invalid subdivision code', () => {
      expect(() => createCountryIdentifier('US-ZZ')).toThrow('Invalid ISO 3166 code: US-ZZ');
      expect(() => createCountryIdentifier('XX-CA')).toThrow('Invalid ISO 3166 code: XX-CA');
    });

    it('handles valid ISO 3166-1 alpha-2 codes', () => {
      const validCodes = ['US', 'BR', 'DE', 'GB', 'FR', 'JP', 'CN', 'IN', 'AU', 'CA'];
      validCodes.forEach(code => {
        expect(createCountryIdentifier(code)).toBe(`iso3166:${code}`);
      });
    });

    it('handles valid ISO 3166-2 subdivision codes', () => {
      const validSubdivisions = [
        { input: 'US-CA', expected: 'iso3166:US-CA' },
        { input: 'US-NY', expected: 'iso3166:US-NY' },
        { input: 'BR-SP', expected: 'iso3166:BR-SP' },
        { input: 'CN-XZ', expected: 'iso3166:CN-XZ' },  // Xizang (Tibet)
        { input: 'DE-BY', expected: 'iso3166:DE-BY' },  // Bayern
        { input: 'GB-ENG', expected: 'iso3166:GB-ENG' }, // England
        { input: 'JP-13', expected: 'iso3166:JP-13' },   // Tokyo
      ];
      validSubdivisions.forEach(({ input, expected }) => {
        expect(createCountryIdentifier(input)).toBe(expected);
      });
    });
  });

  describe('parseCountryIdentifier', () => {
    it('parses iso3166: format for country codes', () => {
      expect(parseCountryIdentifier('iso3166:BR')).toBe('BR');
      expect(parseCountryIdentifier('iso3166:us')).toBe('US');
      expect(parseCountryIdentifier('iso3166:DE')).toBe('DE');
      expect(parseCountryIdentifier('iso3166:gb')).toBe('GB');
    });

    it('parses iso3166: format for subdivision codes', () => {
      expect(parseCountryIdentifier('iso3166:US-CA')).toBe('US-CA');
      expect(parseCountryIdentifier('iso3166:us-ca')).toBe('US-CA');
      expect(parseCountryIdentifier('iso3166:BR-SP')).toBe('BR-SP');
      expect(parseCountryIdentifier('iso3166:CN-XZ')).toBe('CN-XZ');
      expect(parseCountryIdentifier('iso3166:DE-BY')).toBe('DE-BY');
      expect(parseCountryIdentifier('iso3166:GB-ENG')).toBe('GB-ENG');
    });

    it('parses legacy geo: format for country codes', () => {
      expect(parseCountryIdentifier('geo:BR')).toBe('BR');
      expect(parseCountryIdentifier('geo:US')).toBe('US');
      expect(parseCountryIdentifier('geo:de')).toBe('DE');
    });

    it('rejects geo: format for geohashes', () => {
      expect(parseCountryIdentifier('geo:6gyf4')).toBeUndefined();
      expect(parseCountryIdentifier('geo:9q8yy')).toBeUndefined();
      expect(parseCountryIdentifier('geo:u4pruydqqvj')).toBeUndefined();
      expect(parseCountryIdentifier('geo:6')).toBeUndefined();
    });

    it('rejects invalid country codes in geo: format', () => {
      expect(parseCountryIdentifier('geo:ZZ')).toBeUndefined();
      expect(parseCountryIdentifier('geo:XX')).toBeUndefined();
    });

    it('rejects invalid subdivision codes in iso3166: format', () => {
      expect(parseCountryIdentifier('iso3166:US-ZZ')).toBeUndefined();
      expect(parseCountryIdentifier('iso3166:XX-CA')).toBeUndefined();
    });

    it('returns undefined for invalid identifiers', () => {
      expect(parseCountryIdentifier('country:BR')).toBeUndefined();
      expect(parseCountryIdentifier('BR')).toBeUndefined();
      expect(parseCountryIdentifier('')).toBeUndefined();
      expect(parseCountryIdentifier('iso3166:')).toBeUndefined();
      expect(parseCountryIdentifier('geo:')).toBeUndefined();
    });

    it('handles case-insensitive input', () => {
      expect(parseCountryIdentifier('ISO3166:br')).toBe('BR');
      expect(parseCountryIdentifier('GEO:us')).toBe('US');
      expect(parseCountryIdentifier('ISO3166:us-ca')).toBe('US-CA');
    });
  });

  describe('isCountryIdentifier', () => {
    it('returns true for valid iso3166: country identifiers', () => {
      expect(isCountryIdentifier('iso3166:BR')).toBe(true);
      expect(isCountryIdentifier('iso3166:US')).toBe(true);
      expect(isCountryIdentifier('iso3166:de')).toBe(true);
    });

    it('returns true for valid iso3166: subdivision identifiers', () => {
      expect(isCountryIdentifier('iso3166:US-CA')).toBe(true);
      expect(isCountryIdentifier('iso3166:BR-SP')).toBe(true);
      expect(isCountryIdentifier('iso3166:CN-XZ')).toBe(true);
      expect(isCountryIdentifier('iso3166:DE-BY')).toBe(true);
    });

    it('returns true for valid legacy geo: identifiers', () => {
      expect(isCountryIdentifier('geo:BR')).toBe(true);
      expect(isCountryIdentifier('geo:US')).toBe(true);
    });

    it('returns false for geohashes', () => {
      expect(isCountryIdentifier('geo:6gyf4')).toBe(false);
      expect(isCountryIdentifier('geo:9q8yy')).toBe(false);
    });

    it('returns false for invalid identifiers', () => {
      expect(isCountryIdentifier('country:BR')).toBe(false);
      expect(isCountryIdentifier('BR')).toBe(false);
      expect(isCountryIdentifier('')).toBe(false);
      expect(isCountryIdentifier('iso3166:ZZ')).toBe(false);
      expect(isCountryIdentifier('iso3166:US-ZZ')).toBe(false);
    });
  });

  describe('getCountryFilterValues', () => {
    it('returns both formats with legacy support enabled for country codes', () => {
      expect(getCountryFilterValues('BR', true)).toEqual(['iso3166:BR', 'geo:BR']);
      expect(getCountryFilterValues('US', true)).toEqual(['iso3166:US', 'geo:US']);
      expect(getCountryFilterValues('de', true)).toEqual(['iso3166:DE', 'geo:DE']);
    });

    it('returns only iso3166 format for subdivision codes (no legacy geo: support)', () => {
      expect(getCountryFilterValues('US-CA', true)).toEqual(['iso3166:US-CA']);
      expect(getCountryFilterValues('BR-SP', true)).toEqual(['iso3166:BR-SP']);
      expect(getCountryFilterValues('CN-XZ', true)).toEqual(['iso3166:CN-XZ']);
    });

    it('returns both formats by default (legacy support is true)', () => {
      expect(getCountryFilterValues('BR')).toEqual(['iso3166:BR', 'geo:BR']);
      expect(getCountryFilterValues('US')).toEqual(['iso3166:US', 'geo:US']);
    });

    it('returns only new format with legacy support disabled', () => {
      expect(getCountryFilterValues('BR', false)).toEqual(['iso3166:BR']);
      expect(getCountryFilterValues('US', false)).toEqual(['iso3166:US']);
      expect(getCountryFilterValues('de', false)).toEqual(['iso3166:DE']);
    });

    it('normalizes codes to uppercase', () => {
      expect(getCountryFilterValues('br', true)).toEqual(['iso3166:BR', 'geo:BR']);
      expect(getCountryFilterValues('us', false)).toEqual(['iso3166:US']);
      expect(getCountryFilterValues('us-ca', true)).toEqual(['iso3166:US-CA']);
    });

    it('throws on invalid codes', () => {
      expect(() => getCountryFilterValues('ZZ')).toThrow();
      expect(() => getCountryFilterValues('ABC')).toThrow();
      expect(() => getCountryFilterValues('US-ZZ')).toThrow();
    });
  });
});
