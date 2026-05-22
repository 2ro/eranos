import { useState } from 'react';
import { Check, EyeOff, Eye, Loader2, MoreHorizontal, ShieldCheck, ShieldOff, Sparkles, SparklesIcon } from 'lucide-react';

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
  /** Whether the organization is currently approved. */
  isApproved: boolean;
  /** Whether the organization is currently hidden. */
  isHidden: boolean;
  /** Whether the organization is currently featured. */
  isFeatured: boolean;
  className?: string;
}

/**
 * Per-card kebab menu exposing the six moderation actions for an
 * organization:
 *
 *   Approve / Unapprove   (axis = approval)
 *   Hide / Unhide         (axis = hide)
 *   Feature / Unfeature   (axis = featured)
 *
 * Renders `null` for users who are not Team Soapbox pack members. Sits
 * inside the clickable `CommunityMiniCard` `<Link>`, so the trigger
 * swallows its own click and the dropdown content stops propagation —
 * otherwise every menu interaction would navigate to the organization
 * detail page.
 *
 * Mirrors `CampaignModerationMenu`; the only differences are the coord
 * prefix (`34550:` vs `33863:`), the toast copy ("organization" vs
 * "campaign"), and the mutation hook.
 */
export function CommunityModerationMenu({
  coord,
  organizationName,
  isApproved,
  isHidden,
  isFeatured,
  className,
}: CommunityModerationMenuProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const { moderate } = useOrganizationModeration();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ModerationLabel | null>(null);

  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  if (!isMod) return null;

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
          aria-label="Moderate organization"
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
        {isApproved ? (
          <DropdownMenuItem onClick={() => runAction('unapproved', 'Removed approval')}>
            <ShieldOff className="h-4 w-4 mr-2" />
            Unapprove
            <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Approved
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => runAction('approved', 'Approved organization')}>
            <ShieldCheck className="h-4 w-4 mr-2" />
            Approve
          </DropdownMenuItem>
        )}
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
          <DropdownMenuItem onClick={() => runAction('featured', 'Featured organization')}>
            <Sparkles className="h-4 w-4 mr-2" />
            Feature
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
