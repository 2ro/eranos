import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import {
  Check,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModerationMenuItems } from '@/components/moderation';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import type { Action } from '@/hooks/useActions';

function getPledgeCoord(action: Action) {
  return `36639:${action.pubkey}:${action.id}`;
}

/**
 * Per-card kebab menu for pledges. Surfaces:
 *   • Delete (owner only) — NIP-09 with both `e` and `a` tags so
 *     relays that ignore a-tag-only deletions still drop the event.
 *   • Copy link — naddr1 URL on the current share origin.
 *   • Moderation actions (mods only) — hide / feature, under a
 *     separator that only renders when the viewer is a moderator.
 *
 * Lives outside `ActionsPage` so both the page and the reusable
 * `PledgesDiscoverySection` can pin it to the card's `topRight` slot
 * without duplicating the logic.
 */
export function ActionShareMenu({
  action,
  displayTitle,
}: {
  action: Action;
  displayTitle: string;
}) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = user?.pubkey === action.pubkey;
  // Moderator gate is identical to the one in `ModerationMenuItems`,
  // duplicated here so we can decide whether to render the trailing
  // separator that introduces the moderator section.
  // `ModerationMenuItems` returns `null` for non-mods, so without
  // this check we'd render an orphaned separator at the bottom of
  // the dropdown.
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const actionUrl = `${shareOrigin}/${naddr}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(actionUrl);
      setCopied(true);
      toast({ title: t('pledges.card.linkCopied') });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({ title: t('pledges.card.linkCopyFailed'), variant: 'destructive' });
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !isOwner) return;

    const confirmed = window.confirm(t('pledges.card.confirmDelete'));
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // NIP-09 deletion. Include both 'e' and 'a' tags — some relays don't
      // honour a-tag-only deletions for addressable events.
      await createEvent({
        kind: 5,
        content: t('pledges.card.deletedContent'),
        tags: [
          ['e', action.event.id],
          ['a', getPledgeCoord(action)],
        ],
      });
      // Extract any organization `A` tag the pledge was associated with so
      // the org's activity shelf and community feeds refresh too.
      const orgATag = action.event.tags.find(([n]) => n === 'A')?.[1];
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agora-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['agora-action'] }),
        ...(orgATag
          ? [
              queryClient.invalidateQueries({
                queryKey: ['organization-activity', orgATag],
              }),
              queryClient.invalidateQueries({
                queryKey: ['community-actions', orgATag],
              }),
              queryClient.invalidateQueries({
                predicate: (q) => {
                  const [root, aTagsKey] = q.queryKey;
                  return (
                    root === 'community-activity-feed' &&
                    typeof aTagsKey === 'string' &&
                    aTagsKey.split(',').includes(orgATag)
                  );
                },
              }),
            ]
          : []),
      ]);
      toast({ title: t('pledges.card.deleted') });
    } catch (error) {
      console.error('Failed to delete pledge:', error);
      toast({ title: t('pledges.card.deleteFailed'), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('pledges.card.actionsAriaLabel')}
          className="h-8 w-8 bg-background/80 backdrop-blur text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isOwner && (
          <>
            <DropdownMenuItem onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t('pledges.card.deletePledge')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleCopyLink}>
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-primary" />
          ) : (
            <LinkIcon className="h-4 w-4 mr-2" />
          )}
          {t('pledges.card.copyLink')}
        </DropdownMenuItem>
        {/* Moderator actions appear under a separator when the viewer
            is a Team Soapbox moderator. `ModerationMenuItems` returns
            null for non-mods, so we gate the trailing separator on
            the same `isMod` check to avoid an orphan separator at
            the bottom of non-mod dropdowns. */}
        {isMod && <DropdownMenuSeparator />}
        <ModerationMenuItems
          coord={getPledgeCoord(action)}
          entityTitle={displayTitle}
          surface="pledge"
          axes={['hide', 'featured']}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
