import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useInterests } from '@/hooks/useInterests';
import { createCountryIdentifier, parseCountryIdentifier } from '@/lib/countryIdentifiers';

export function useCountryFollows() {
  const queryClient = useQueryClient();
  const interests = useInterests('i');

  const followedCountries = useMemo(
    () => interests.hashtags
      .map((identifier) => parseCountryIdentifier(identifier))
      .filter((code): code is string => !!code),
    [interests.hashtags],
  );

  function isFollowingCountry(code: string): boolean {
    try {
      const parsed = parseCountryIdentifier(createCountryIdentifier(code));
      return !!parsed && followedCountries.includes(parsed);
    } catch {
      return false;
    }
  }

  async function followCountry(code: string): Promise<void> {
    await interests.addInterest.mutateAsync(createCountryIdentifier(code));
    queryClient.invalidateQueries({ queryKey: ['following-country-feed'] });
    queryClient.invalidateQueries({ queryKey: ['following-feed'] });
  }

  async function unfollowCountry(code: string): Promise<void> {
    await interests.removeInterest.mutateAsync(createCountryIdentifier(code));
    queryClient.invalidateQueries({ queryKey: ['following-country-feed'] });
    queryClient.invalidateQueries({ queryKey: ['following-feed'] });
  }

  async function toggleCountryFollow(code: string): Promise<void> {
    if (isFollowingCountry(code)) {
      await unfollowCountry(code);
    } else {
      await followCountry(code);
    }
  }

  return {
    followedCountries,
    isFollowingCountry,
    followCountry,
    unfollowCountry,
    toggleCountryFollow,
    isPending: interests.addInterest.isPending || interests.removeInterest.isPending,
    isLoading: interests.isLoading,
  };
}
