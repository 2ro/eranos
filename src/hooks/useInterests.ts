/**
 * useInterests
 *
 * Hook for managing NIP-51 Interests (kind 10015).
 * A replaceable event containing `t` tags for hashtags the user is interested in.
 */
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

type InterestTagName = 't' | 'g' | 'i';

function normalizeInterest(tagName: InterestTagName, value: string): string {
  const stripped = value.replace(/^#/, '').trim();
  if (tagName === 'i' && stripped.toLowerCase().startsWith('iso3166:')) {
    return `iso3166:${stripped.slice('iso3166:'.length).toUpperCase()}`;
  }
  return stripped.toLowerCase();
}

export function useInterests(tagName: InterestTagName = 't') {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const interestsQuery = useQuery({
    queryKey: ['interests', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query(
        [{ kinds: [10015], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      // Kind 10015 is replaceable — only the latest event matters
      return events.length > 0
        ? events.reduce((a, b) => (a.created_at > b.created_at ? a : b))
        : null;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  /** All interests for this tag type, normalized to lowercase. */
  const hashtags: string[] = (interestsQuery.data?.tags ?? [])
    .filter(([name]) => name === tagName)
    .map(([, value]) => normalizeInterest(tagName, value))
    .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

  /** Check if the user follows a specific interest. */
  function hasInterest(tag: string): boolean {
    return hashtags.includes(normalizeInterest(tagName, tag));
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['interests', user?.pubkey] });
    // The Following feed pulls from `t`/`g`/`i` interests, so any mutation
    // here can change what shows up there.
    queryClient.invalidateQueries({ queryKey: ['following-hashtag-feed'] });
    queryClient.invalidateQueries({ queryKey: ['following-country-feed'] });
  };

  /** Add an interest. */
  const addInterest = useMutation({
    mutationFn: async (tag: string) => {
      if (!user) throw new Error('Must be logged in');
      const normalized = normalizeInterest(tagName, tag);
      if (!normalized) throw new Error('Empty tag');

      // Fetch the freshest kind 10015 from relays before mutating
      const prev = await fetchFreshEvent(nostr, {
        kinds: [10015],
        authors: [user.pubkey],
      });

      const currentTags = prev?.tags ?? [];

      // Don't add duplicates
      if (currentTags.some(([n, v]) => n === tagName && normalizeInterest(tagName, v) === normalized)) return;

      const newTags = [...currentTags, [tagName, normalized]];
      await publishEvent({
        kind: 10015,
        content: prev?.content ?? '',
        tags: newTags,
        prev: prev ?? undefined,
      });
    },
    onSuccess: invalidate,
  });

  /** Remove an interest. */
  const removeInterest = useMutation({
    mutationFn: async (tag: string) => {
      if (!user) throw new Error('Must be logged in');
      const normalized = normalizeInterest(tagName, tag);

      // Fetch the freshest kind 10015 from relays before mutating
      const prev = await fetchFreshEvent(nostr, {
        kinds: [10015],
        authors: [user.pubkey],
      });

      if (!prev) return;

      const newTags = prev.tags.filter(
        ([name, value]) => !(name === tagName && normalizeInterest(tagName, value) === normalized),
      );
      await publishEvent({
        kind: 10015,
        content: prev.content ?? '',
        tags: newTags,
        prev,
      });
    },
    onSuccess: invalidate,
  });

  return {
    hashtags,
    hasInterest,
    addInterest,
    removeInterest,
    isLoading: interestsQuery.isLoading,
  };
}
