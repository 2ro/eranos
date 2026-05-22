import { useState } from 'react';
import { Check, EyeOff, Eye, Loader2, MoreHorizontal, Sparkles, SparklesIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { useToast } from '@/hooks/useToast';
import type { ModerationLabel } from '@/lib/agoraModeration';

interface CommunityModerationMenuProps {
  /** The organization's `34550:<pubkey>:<d>` coordinate. */
  coord: string;
  /** Visible name for the organization (for toast feedback). */
  organizationName: string;
  className?: string;
}

/**
 * Per-card kebab menu exposing the moderator actions for an organization:
 *
 *   Hide / Unhide         (axis = hide)
 *   Feature / Unfeature   (axis = featured)
 *
 * Organizations intentionally do **not** have an `approved` axis — unlike
 * campaigns, which gate homepage placement on moderator approval, every
 * Agora-tagged organization is publicly visible by default. Moderators
 * curate via two narrower controls: lifting an org into the Featured
 * shelf, or suppressing it with a Hidden label.
 *
 * Renders `null` for users who are not Team Soapbox pack members. Sits
 * inside the clickable `CommunityMiniCard` `<Link>`, so the trigger
 * swallows its own click and the dropdown content stops propagation —
 * otherwise every menu interaction would navigate to the organization
 * detail page.
 *
 * The moderation rollup is read inside this component (after the
 * moderator gate) instead of at the parent so non-moderator viewers
 * never subscribe to the heavy `useOrganizationModeration` query — every
 * `CommunityMiniCard` in a grid would otherwise wake the same cache
 * subscription up to 18+ times per page.
 */
export function CommunityModerationMenu({
  coord,
  organizationName,
  className,
}: CommunityModerationMenuProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  // Bail before the heavy moderation query subscribes. Non-moderators
  // (the overwhelming majority) never pay the network or render cost.
  if (!isMod) return null;

  return <CommunityModerationMenuInner coord={coord} organizationName={organizationName} className={className} />;
}

function CommunityModerationMenuInner({
  coord,
  organizationName,
  className,
}: CommunityModerationMenuProps) {
  const { data: moderation, moderate } = useOrganizationModeration();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ModerationLabel | null>(null);

  const isHidden = moderation.hiddenCoords.has(coord);
  const isFeatured = moderation.featuredCoords.has(coord);

  const runAction = async (action: ModerationLabel, verbPast: string) => {
    if (busy) return;
    setBusy(action);
    try {
      await moderate.mutateAsync({ coord, action });
      toast({ title: verbPast, description: organizationName });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: `Failed to ${action}`,
        description: message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Moderate group"
          className={className ?? 'h-8 w-8 bg-background/80 backdrop-blur text-muted-foreground hover:text-foreground'}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Moderator actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isFeatured ? (
          <DropdownMenuItem onClick={() => runAction('unfeatured', 'Removed from featured')}>
            <SparklesIcon className="h-4 w-4 mr-2" />
            Unfeature
            <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Featured
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => runAction('featured', 'Featured group')}>
            <Sparkles className="h-4 w-4 mr-2" />
            Feature
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {isHidden ? (
          <DropdownMenuItem onClick={() => runAction('unhidden', 'Unhidden')}>
            <Eye className="h-4 w-4 mr-2" />
            Unhide
            <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Hidden
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => runAction('hidden', 'Hidden')}
            className="text-destructive focus:text-destructive"
          >
            <EyeOff className="h-4 w-4 mr-2" />
            Hide
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Banner-overlay wrapper for `CommunityMiniCard` cards. Renders the
 * moderator kebab plus a "Hidden" badge when applicable, both
 * absolutely-positioned at the card's top-right. Returns `null` for
 * non-moderators so non-mod grids never subscribe to the moderation
 * query at all.
 *
 * Pulling the overlay (and its `useOrganizationModeration` subscription)
 * out of `CommunityMiniCard` into a single moderator-gated component is
 * the perf win that lets `/communities` paint Featured/My orgs
 * immediately without waiting for the moderator pack or the label query
 * for every card on the page.
 */
export function CommunityModerationOverlay({
  coord,
  organizationName,
}: {
  coord: string;
  organizationName: string;
}) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  if (!isMod) return null;

  return (
    <CommunityModerationOverlayInner coord={coord} organizationName={organizationName} />
  );
}

function CommunityModerationOverlayInner({
  coord,
  organizationName,
}: {
  coord: string;
  organizationName: string;
}) {
  const { data: moderation } = useOrganizationModeration();
  const isHidden = moderation.hiddenCoords.has(coord);

  return (
    <div className="absolute top-2 right-2 flex items-center gap-1.5">
      {isHidden && (
        <Badge
          variant="secondary"
          className="backdrop-blur bg-destructive/15 text-destructive border-destructive/30 h-6 px-1.5 text-[10px]"
        >
          <EyeOff className="size-3 mr-1" />
          Hidden
        </Badge>
      )}
      {/* The kebab inner uses the same moderation cache subscription, so
          no extra round-trip is incurred. */}
      <CommunityModerationMenuInner coord={coord} organizationName={organizationName} />
    </div>
  );
}
