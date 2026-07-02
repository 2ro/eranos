import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useCampaignModerators } from './useCampaignModerators';
import {
  CAMPAIGN_LIST_KIND,
  CAMPAIGN_LIST_HASHTAG,
  CAMPAIGN_LIST_INDEX_D,
  CAMPAIGN_LIST_INDEX_HASHTAG,
  isValidIconName,
  isValidListSlug,
  slugifyListTitle,
} from '@/lib/campaignLists';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

import type { NostrEvent } from '@nostrify/nostrify';

interface CreateListInput {
  title: string;
  description?: string;
  icon: string;
}

interface UpdateListMetaInput {
  slug: string;
  title?: string;
  description?: string;
  icon?: string;
}

/**
 * All write paths for moderator-curated campaign lists.
 *
 * Every action throws if the current user isn't on the campaign
 * moderator allowlist (Team Soapbox follow pack). The UI hides the
 * affordances entirely for non-moderators; this gate is defense in
 * depth so a stray button or a future bug can't publish a list under a
 * non-moderator pubkey.
 *
 * **Read-modify-write.** Mutating an existing list — meta edits,
 * membership changes, reorders — first calls `fetchFreshEvent` against
 * relays so we never publish on top of a stale cached version. The
 * resulting event is passed back as `prev` to `useNostrPublish`, which
 * preserves `published_at` per NIP-24.
 *
 * **Cross-moderator edits.** A moderator who edits another moderator's
 * list publishes their own event under their own pubkey with the same
 * slug. The read fold (`foldCampaignLists`) picks the newest event per
 * `(pubkey, slug)`, so the most recent revision wins — but only for
 * that pubkey's list copy. The list-of-lists index, in contrast, is a
 * single sentinel `d` tag that any moderator may publish; the newest
 * index across all moderators wins.
 *
 * Concurrent reorders by two moderators resolve to whoever publishes
 * last. This matches the rest of the moderation namespace.
 */
export function useCampaignListActions() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  const requireMod = useCallback(() => {
    if (!user) throw new Error('Not logged in');
    if (!moderators || !moderators.includes(user.pubkey)) {
      throw new Error('Not a campaign moderator');
    }
  }, [user, moderators]);

  /** Build the standard tag set for a list event. */
  const buildListTags = useCallback(
    (input: {
      slug: string;
      title: string;
      description?: string;
      icon: string;
      coords: string[];
    }): string[][] => {
      const tags: string[][] = [
        ['d', input.slug],
        ['title', input.title],
        ['icon', input.icon],
        ['t', CAMPAIGN_LIST_HASHTAG],
        ['alt', `Eranos campaign list: ${input.title}`],
      ];
      if (input.description) {
        tags.push(['description', input.description]);
      }
      for (const coord of input.coords) {
        tags.push(['a', coord]);
      }
      return tags;
    },
    [],
  );

  /** Fetch the current user's existing list event for a slug. */
  const fetchOwnList = useCallback(
    async (slug: string): Promise<NostrEvent | null> => {
      if (!user) return null;
      return fetchFreshEvent(nostr, {
        kinds: [CAMPAIGN_LIST_KIND],
        authors: [user.pubkey],
        '#d': [slug],
      });
    },
    [nostr, user],
  );

  /** Fetch the current user's index sentinel event, if any. */
  const fetchOwnIndex = useCallback(async (): Promise<NostrEvent | null> => {
    if (!user) return null;
    return fetchFreshEvent(nostr, {
      kinds: [CAMPAIGN_LIST_KIND],
      authors: [user.pubkey],
      '#d': [CAMPAIGN_LIST_INDEX_D],
    });
  }, [nostr, user]);

  /** Invalidate the campaign-lists query so the strip refetches. */
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['campaign-lists'] });
  }, [queryClient]);

  /**
   * Parse the existing list metadata from a fresh event. Used by every
   * RMW action so it preserves whatever the latest revision says about
   * title / icon / description and only mutates what the action changed.
   */
  const readListFields = useCallback(
    (event: NostrEvent | null) => {
      const tags = event?.tags ?? [];
      const get = (name: string) =>
        tags.find(([n, v]) => n === name && typeof v === 'string')?.[1];
      const coords: string[] = [];
      for (const tag of tags) {
        if (tag[0] === 'a' && typeof tag[1] === 'string') coords.push(tag[1]);
      }
      return {
        title: get('title') ?? '',
        description: get('description'),
        icon: get('icon') ?? 'List',
        coords,
      };
    },
    [],
  );

  /**
   * Create a new list. Generates a slug from the title, collision-checks
   * it against the user's own existing lists, then publishes the list
   * event AND a refreshed index event appending the new list to the end
   * of the strip.
   */
  const createList = useCallback(
    async (input: CreateListInput) => {
      requireMod();
      if (!user) throw new Error('Not logged in');
      const title = input.title.trim();
      if (!title) throw new Error('Title is required');
      if (!isValidIconName(input.icon)) {
        throw new Error(`Invalid icon name: ${input.icon}`);
      }
      const description = input.description?.trim() || undefined;

      // Generate a unique slug. Collision = the user already authored a
      // list at this slug; suffix `-2`, `-3`, … until clear. We bound the
      // search at 50 to avoid an unbounded loop in the (impossible)
      // worst case where the relay always returns an event.
      const base = slugifyListTitle(title);
      let slug = base;
      for (let i = 2; i <= 50; i++) {
        const existing = await fetchOwnList(slug);
        if (!existing) break;
        slug = `${base}-${i}`;
      }
      if (!isValidListSlug(slug)) {
        throw new Error(`Could not generate a valid slug for "${title}"`);
      }

      // Publish the new list event.
      await publishEvent({
        kind: CAMPAIGN_LIST_KIND,
        content: '',
        tags: buildListTags({
          slug,
          title,
          description,
          icon: input.icon,
          coords: [],
        }),
      });

      // Update the index to append the new list to the end of the strip.
      const newListCoord = `${CAMPAIGN_LIST_KIND}:${user.pubkey}:${slug}`;
      const prevIndex = await fetchOwnIndex();
      const existingRefs = prevIndex
        ? prevIndex.tags
            .filter(([n, v]) => n === 'a' && typeof v === 'string')
            .map(([, v]) => v as string)
        : [];
      const dedup = new Set(existingRefs);
      if (!dedup.has(newListCoord)) existingRefs.push(newListCoord);
      await publishIndex(existingRefs, prevIndex);

      invalidate();
      return { slug };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requireMod, user, fetchOwnList, fetchOwnIndex, publishEvent, buildListTags, invalidate],
  );

  /** Publish the index sentinel event with the given ordered refs. */
  const publishIndex = useCallback(
    async (orderedRefs: string[], prev: NostrEvent | null) => {
      const tags: string[][] = [
        ['d', CAMPAIGN_LIST_INDEX_D],
        ['title', 'Eranos Campaign Lists — display order'],
        ['t', CAMPAIGN_LIST_INDEX_HASHTAG],
        ['alt', 'Order of curated campaign lists'],
      ];
      for (const ref of orderedRefs) {
        tags.push(['a', ref]);
      }
      await publishEvent({
        kind: CAMPAIGN_LIST_KIND,
        content: '',
        tags,
        prev: prev ?? undefined,
      });
    },
    [publishEvent],
  );

  /** Update a list's title / description / icon, preserving membership. */
  const updateListMeta = useCallback(
    async (input: UpdateListMetaInput) => {
      requireMod();
      const fresh = await fetchOwnList(input.slug);
      if (!fresh) throw new Error(`List not found: ${input.slug}`);
      const current = readListFields(fresh);
      const nextTitle = input.title?.trim() ?? current.title;
      if (!nextTitle) throw new Error('Title is required');
      const nextDescription =
        input.description === undefined
          ? current.description
          : input.description.trim() || undefined;
      const nextIcon = input.icon ?? current.icon;
      if (!isValidIconName(nextIcon)) {
        throw new Error(`Invalid icon name: ${nextIcon}`);
      }
      await publishEvent({
        kind: CAMPAIGN_LIST_KIND,
        content: fresh.content ?? '',
        tags: buildListTags({
          slug: input.slug,
          title: nextTitle,
          description: nextDescription,
          icon: nextIcon,
          coords: current.coords,
        }),
        prev: fresh,
      });
      invalidate();
    },
    [requireMod, fetchOwnList, readListFields, publishEvent, buildListTags, invalidate],
  );

  /**
   * Append a campaign coordinate to a list. No-op if already present.
   * Operates on the moderator's own copy of the list.
   */
  const addCampaignToList = useCallback(
    async (slug: string, coord: string) => {
      requireMod();
      const fresh = await fetchOwnList(slug);
      if (!fresh) throw new Error(`List not found: ${slug}`);
      const current = readListFields(fresh);
      if (current.coords.includes(coord)) return;
      const nextCoords = [...current.coords, coord];
      await publishEvent({
        kind: CAMPAIGN_LIST_KIND,
        content: fresh.content ?? '',
        tags: buildListTags({
          slug,
          title: current.title,
          description: current.description,
          icon: current.icon,
          coords: nextCoords,
        }),
        prev: fresh,
      });
      invalidate();
    },
    [requireMod, fetchOwnList, readListFields, publishEvent, buildListTags, invalidate],
  );

  /** Remove a campaign coordinate from a list. */
  const removeCampaignFromList = useCallback(
    async (slug: string, coord: string) => {
      requireMod();
      const fresh = await fetchOwnList(slug);
      if (!fresh) throw new Error(`List not found: ${slug}`);
      const current = readListFields(fresh);
      const nextCoords = current.coords.filter((c) => c !== coord);
      if (nextCoords.length === current.coords.length) return;
      await publishEvent({
        kind: CAMPAIGN_LIST_KIND,
        content: fresh.content ?? '',
        tags: buildListTags({
          slug,
          title: current.title,
          description: current.description,
          icon: current.icon,
          coords: nextCoords,
        }),
        prev: fresh,
      });
      invalidate();
    },
    [requireMod, fetchOwnList, readListFields, publishEvent, buildListTags, invalidate],
  );

  /** Replace the list's membership order in one shot. */
  const reorderCampaignsInList = useCallback(
    async (slug: string, newCoords: string[]) => {
      requireMod();
      const fresh = await fetchOwnList(slug);
      if (!fresh) throw new Error(`List not found: ${slug}`);
      const current = readListFields(fresh);
      // Filter the proposed order to the membership we currently know
      // about, then append anything from the latest membership that
      // somehow wasn't represented (an addition since the UI fetched).
      const known = new Set(current.coords);
      const seen = new Set<string>();
      const nextCoords: string[] = [];
      for (const c of newCoords) {
        if (!known.has(c) || seen.has(c)) continue;
        seen.add(c);
        nextCoords.push(c);
      }
      for (const c of current.coords) {
        if (!seen.has(c)) nextCoords.push(c);
      }
      await publishEvent({
        kind: CAMPAIGN_LIST_KIND,
        content: fresh.content ?? '',
        tags: buildListTags({
          slug,
          title: current.title,
          description: current.description,
          icon: current.icon,
          coords: nextCoords,
        }),
        prev: fresh,
      });
      invalidate();
    },
    [requireMod, fetchOwnList, readListFields, publishEvent, buildListTags, invalidate],
  );

  /**
   * Reorder the topic strip itself. `orderedListCoords` is the desired
   * ordering of `30003:<author>:<slug>` references — the same coord
   * shape stored in the index event.
   */
  const reorderLists = useCallback(
    async (orderedListCoords: string[]) => {
      requireMod();
      const prev = await fetchOwnIndex();
      // De-dupe, preserving order.
      const seen = new Set<string>();
      const next: string[] = [];
      for (const c of orderedListCoords) {
        if (seen.has(c)) continue;
        seen.add(c);
        next.push(c);
      }
      await publishIndex(next, prev);
      invalidate();
    },
    [requireMod, fetchOwnIndex, publishIndex, invalidate],
  );

  /**
   * Delete a list. Publishes a NIP-09 kind 5 deletion request for the
   * list event, AND a fresh index event with the list removed so the
   * strip drops the entry immediately. Other moderators' index events
   * may still reference the deleted coord; the read fold tolerates
   * missing coords gracefully.
   */
  const deleteList = useCallback(
    async (slug: string) => {
      requireMod();
      if (!user) throw new Error('Not logged in');
      const fresh = await fetchOwnList(slug);
      if (!fresh) return;

      // NIP-09 deletion. We reference both the event id and the
      // addressable coordinate so any replayed older revision is also
      // suppressed.
      const listCoord = `${CAMPAIGN_LIST_KIND}:${user.pubkey}:${slug}`;
      await publishEvent({
        kind: 5,
        content: 'Campaign list deleted',
        tags: [
          ['e', fresh.id],
          ['a', listCoord],
          ['k', String(CAMPAIGN_LIST_KIND)],
        ],
      });

      // Update the index to drop the deleted coord.
      const prevIndex = await fetchOwnIndex();
      const remainingRefs = prevIndex
        ? prevIndex.tags
            .filter(([n, v]) => n === 'a' && typeof v === 'string' && v !== listCoord)
            .map(([, v]) => v as string)
        : [];
      await publishIndex(remainingRefs, prevIndex);

      invalidate();
    },
    [requireMod, user, fetchOwnList, fetchOwnIndex, publishEvent, publishIndex, invalidate],
  );

  return {
    isMod,
    createList,
    updateListMeta,
    deleteList,
    addCampaignToList,
    removeCampaignFromList,
    reorderCampaignsInList,
    reorderLists,
  };
}
