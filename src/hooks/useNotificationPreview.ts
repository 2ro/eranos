import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useFollowList } from './useFollowActions';
import { getEnabledNotificationKinds } from '@/lib/notificationKinds';

/**
 * Lightweight hook that fetches up to 3 recent unread notification events.
 *
 * Modeled on {@link useHasUnreadNotifications}: one-shot `useQuery` with
 * `limit: 3`, `since: cursor + 1`, no persistent subscription, no
 * referenced-event batch-fetch. 60 s polling fallback.
 *
 * Use this for dashboard previews where a compact summary is enough.
 * Use `useNotifications` on the full notifications page.
 */
export function useNotificationPreview(): {
  events: NostrEvent[];
  isLoading: boolean;
} {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();

  const notificationsCursor =
    settings !== undefined && settings !== null
      ? (settings.notificationsCursor ?? 0)
      : null;

  const { data: followData } = useFollowList();

  const prefs = settings?.notificationPreferences;

  const enabledKinds = useMemo(
    () => getEnabledNotificationKinds(prefs),
    [prefs],
  );
  const kindsKey = [...enabledKinds].sort().join(',');

  const followedPubkeys = useMemo(
    () => followData?.pubkeys ?? [],
    [followData?.pubkeys],
  );
  const onlyFollowing = prefs?.onlyFollowing === true;
  const authorsFilter =
    onlyFollowing && followedPubkeys.length > 0 ? followedPubkeys : undefined;
  const authorsKey = authorsFilter
    ? authorsFilter.slice().sort().join(',')
    : 'all';

  const { data, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['notifications-preview', user?.pubkey ?? '', kindsKey, authorsKey, notificationsCursor ?? 0],
    queryFn: async ({ signal }) => {
      if (!user || notificationsCursor === null) return [];

      const filter: {
        kinds: number[];
        '#p': string[];
        since: number;
        limit: number;
        authors?: string[];
      } = {
        kinds: enabledKinds,
        '#p': [user.pubkey],
        since: notificationsCursor + 1,
        limit: 3,
        ...(authorsFilter ? { authors: authorsFilter } : {}),
      };

      const events = await nostr.query(
        [filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Exclude self-notifications and return newest first (up to 3)
      return events
        .filter((e) => e.pubkey !== user.pubkey)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 3);
    },
    enabled: !!user && notificationsCursor !== null,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return { events: data ?? [], isLoading };
}
