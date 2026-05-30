import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDebounce } from '@/hooks/useDebounce';
import type { Nip50Sort } from '@/hooks/useNip50Search';

/**
 * Type-guard for the `?sort=` URL param value used by every discovery
 * section (Campaigns, Groups, Pledges).
 *
 * - `'top'` and `'new'` map to the toolbar's active sort modes.
 * - Anything else (missing, empty, legacy values) collapses to
 *   `'default'`, the curated featured-first idle state.
 *
 * Exported because the dedicated discovery pages (`/campaigns`,
 * `/pledges`) read `?sort=` independently from the section's hook to
 * thread the value into ancillary derivations (hidden-list cache
 * lookups, create-X href country prefills). One canonical parser
 * keeps page-level and section-level reads in lockstep.
 */
export function parseSort(value: string | null): Nip50Sort {
  if (value === 'top') return 'top';
  if (value === 'new') return 'new';
  return 'default';
}

export interface DiscoveryFilters {
  /**
   * Live search input value, updated on every keystroke. Bind this to
   * the toolbar's `<input>` so typing stays responsive.
   */
  searchInput: string;
  setSearchInput: (next: string) => void;
  /**
   * Debounced search value. Use this as the input to relay queries
   * and as the source for "is this section actively searching?"
   * checks. URL writes also happen on this value, so the URL doesn't
   * churn on every keystroke.
   */
  debouncedSearch: string;
  /** Active sort mode. */
  sort: Nip50Sort;
  setSort: (next: Nip50Sort) => void;
  /** Selected ISO-3166 alpha-2 country code, or `undefined` for global. */
  country: string | undefined;
  setCountry: (next: string | undefined) => void;
}

interface UseDiscoveryFiltersOptions {
  /**
   * URL-namespace for persisted filters, or `undefined` for local-only
   * state.
   *
   *   • `''` — flat URL params (`?q=…&sort=…&country=…`). The dedicated
   *     browse pages (`/campaigns`, `/groups`, `/pledges`) want
   *     this so search results are shareable / linkable and survive
   *     refresh.
   *
   *   • `undefined` — purely local state, no URL writes. The home
   *     page (`/`) hosts all three sections at once. Pushing each
   *     section's filters into the URL there would either collide
   *     (three sections want `?q=`) or pollute the path with six to
   *     nine prefixed params on every keystroke. Keeping state local
   *     means refreshing `/` lands on the curated idle view, which
   *     matches what we want anyway.
   *
   *   • Any other string — namespaced URL params
   *     (`?fooQ=&fooSort=&fooCountry=`). Reserved for future surfaces
   *     that need multiple coexisting filter sets in the URL.
   */
  urlPrefix?: string;
  /**
   * Whether the section exposes a country picker. When `false`, the
   * country slot stays `undefined` and the `country` URL param is
   * never read or written even if a stale value sits in the URL.
   * Defaults to `true`.
   */
  enableCountry?: boolean;
}

/**
 * Filter state machine shared by every discovery section.
 *
 * Owns three pieces of state — search input (debounced), sort mode,
 * country code — and (optionally) mirrors them to URL params so deep
 * links and browser back/forward work. Defaults are stripped on write
 * so the canonical URL stays clean (`/campaigns`, not
 * `/campaigns?q=&sort=`).
 *
 * Debouncing lives inside this hook (300ms) so consumers don't have
 * to thread the debounced value back in — that would create a
 * circular dependency with the URL-sync effect. Consumers should
 * pass `debouncedSearch` straight to their relay query.
 *
 * URL writes use `replace: true` so typing doesn't pile entries onto
 * the history stack.
 */
export function useDiscoveryFilters({
  urlPrefix,
  enableCountry = true,
}: UseDiscoveryFiltersOptions): DiscoveryFilters {
  const useUrl = urlPrefix !== undefined;
  // Always call the hook — React's rules — but only read/write through
  // it when `useUrl` is true.
  const [searchParams, setSearchParams] = useSearchParams();

  const qKey = useUrl ? (urlPrefix === '' ? 'q' : `${urlPrefix}Q`) : '';
  const sortKey = useUrl ? (urlPrefix === '' ? 'sort' : `${urlPrefix}Sort`) : '';
  const countryKey = useUrl
    ? urlPrefix === ''
      ? 'country'
      : `${urlPrefix}Country`
    : '';

  // Seed state from the URL on first render so deep links / refreshes
  // restore the user's last view, then run the toolbar from local
  // state and push debounced changes back to the URL.
  const [searchInput, setSearchInputState] = useState(
    useUrl ? (searchParams.get(qKey) ?? '') : '',
  );
  const [sort, setSortState] = useState<Nip50Sort>(
    useUrl ? parseSort(searchParams.get(sortKey)) : 'default',
  );
  const [country, setCountryState] = useState<string | undefined>(
    useUrl && enableCountry
      ? (searchParams.get(countryKey) ?? undefined)
      : undefined,
  );

  const debouncedSearch = useDebounce(searchInput, 300);

  // URL → state. Handles browser back/forward and direct deep-link
  // navigation while a section is mounted (e.g. clicking an internal
  // link that updates `?sort=top`). We compare before assigning to
  // avoid React render loops.
  useEffect(() => {
    if (!useUrl) return;
    const urlQuery = searchParams.get(qKey) ?? '';
    if (urlQuery !== searchInput && urlQuery !== debouncedSearch) {
      setSearchInputState(urlQuery);
    }
    const urlSort = parseSort(searchParams.get(sortKey));
    if (urlSort !== sort) setSortState(urlSort);
    if (enableCountry) {
      const urlCountry = searchParams.get(countryKey) ?? undefined;
      if (urlCountry !== country) setCountryState(urlCountry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced search → URL. Strip empty values so the canonical URL
  // stays clean.
  useEffect(() => {
    if (!useUrl) return;
    const next = new URLSearchParams(searchParams);
    const trimmed = debouncedSearch.trim();
    if (trimmed) next.set(qKey, trimmed);
    else next.delete(qKey);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, useUrl]);

  const setSort = useCallback(
    (next: Nip50Sort) => {
      setSortState(next);
      if (!useUrl) return;
      const params = new URLSearchParams(searchParams);
      if (next === 'default') params.delete(sortKey);
      else params.set(sortKey, next);
      setSearchParams(params, { replace: true });
    },
    [useUrl, searchParams, setSearchParams, sortKey],
  );

  const setCountry = useCallback(
    (next: string | undefined) => {
      if (!enableCountry) return;
      setCountryState(next);
      if (!useUrl) return;
      const params = new URLSearchParams(searchParams);
      if (next) params.set(countryKey, next);
      else params.delete(countryKey);
      setSearchParams(params, { replace: true });
    },
    [enableCountry, useUrl, searchParams, setSearchParams, countryKey],
  );

  const setSearchInput = useCallback((next: string) => {
    setSearchInputState(next);
    // URL writes happen on `debouncedSearch` flipping, not per keystroke.
  }, []);

  return {
    searchInput,
    setSearchInput,
    debouncedSearch,
    sort,
    setSort,
    country,
    setCountry,
  };
}
