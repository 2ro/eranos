import { describe, it, expect } from 'vitest';

import { SUPPORTED_LANGUAGES } from '@/i18n';
import en from '@/locales/en.json';

/**
 * Validates every shipped locale against `en.json`, which is the source of
 * truth for the key namespace. A locale may be missing keys (they fall back
 * to English at runtime) but it MUST NOT introduce keys that don't exist in
 * English — those would be dead translations that no `t()` call ever reads,
 * and they almost always indicate a typo or stale translation.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Recursively collect every leaf key path in a nested object. */
function collectKeys(obj: Json, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [prefix];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(...collectKeys(v, path));
  }
  return keys;
}

const enKeys = new Set(collectKeys(en as Json));

const locales = SUPPORTED_LANGUAGES.filter((l) => l.code !== 'en');

describe('locale files', () => {
  it('en.json has at least one key', () => {
    expect(enKeys.size).toBeGreaterThan(0);
  });

  for (const { code } of locales) {
    describe(code, () => {
      it('parses as valid JSON', async () => {
        const mod = await import(`../locales/${code}.json`);
        expect(mod.default).toBeTypeOf('object');
      });

      it('contains no keys absent from en.json', async () => {
        const mod = await import(`../locales/${code}.json`);
        const localeKeys = collectKeys(mod.default as Json);
        const extras = localeKeys.filter((k) => !enKeys.has(k));
        expect(extras).toEqual([]);
      });
    });
  }
});
