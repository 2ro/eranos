import { useCallback, useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { getCountryInfo } from '@/lib/countries';
import { getStorageKey } from '@/lib/storageKey';

/**
 * Sentinel value for "post to the global / world feed" (a plain kind 1 note
 * with no country root). Matches the value used by ComposeBox's `destination`
 * state.
 */
export type PostCountryDestination = 'world' | string;

const WORLD = 'world' as const;
const STORAGE_SUFFIX = 'compose-default-country';

function readStored(key: string): PostCountryDestination {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === WORLD) return WORLD;
    // Validate against the country directory so a stale code (or an
    // invalid string from a different version) doesn't pin the composer
    // to a country that no longer parses.
    return getCountryInfo(raw) ? raw : WORLD;
  } catch {
    return WORLD;
  }
}

/**
 * The user's preferred default post destination — either `'world'` (plain
 * kind 1) or an ISO 3166 country code (NIP-22 country-rooted kind 1111).
 *
 * Persisted to localStorage so the choice survives reloads. Hydrates
 * synchronously from storage on first render, so the composer never flashes
 * the wrong default.
 *
 * The act of selecting a destination in ComposeBox does NOT auto-save the
 * default — there is an explicit "Set as default" affordance for that. This
 * means a user posting once to a country they don't normally post to does
 * not unintentionally change their default.
 */
export function useDefaultPostCountry(): [
  PostCountryDestination,
  (value: PostCountryDestination) => void,
] {
  const { config } = useAppContext();
  const key = getStorageKey(config.appId, STORAGE_SUFFIX);

  const [value, setValue] = useState<PostCountryDestination>(() => readStored(key));

  const setDefault = useCallback(
    (next: PostCountryDestination) => {
      setValue(next);
      try {
        if (next === WORLD) {
          localStorage.setItem(key, WORLD);
        } else if (getCountryInfo(next)) {
          localStorage.setItem(key, next);
        }
      } catch {
        // localStorage unavailable — non-critical.
      }
    },
    [key],
  );

  return [value, setDefault];
}
