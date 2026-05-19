import { useState } from 'react';
import { Check, EyeOff, Eye, Loader2, MoreHorizontal, ShieldCheck, ShieldOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCampaignModeration, type ModerationLabel } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

interface CampaignModerationMenuProps {
  /** The campaign's `30223:<pubkey>:<d>` coordinate. */
  coord: string;
  /** Visible label for the campaign (for toast feedback). */
  campaignTitle: string;
  /** Whether the campaign is currently approved. */
  isApproved: boolean;
  /** Whether the campaign is currently hidden. */
  isHidden: boolean;
  className?: string;
}

/**
 * Per-card kebab menu exposing the four moderation actions:
 *   Approve / Unapprove   (axis = approval)
 *   Hide / Unhide         (axis = hide)
 *
 * Renders `null` for users who are not Team Soapbox pack members. Sits
 * inside the clickable `CampaignCard` `<Link>`, so the trigger swallows
 * its own click + the dropdown content stops propagation, otherwise every
 * menu interaction would navigate to the campaign detail page.
 */
export function CampaignModerationMenu({
  coord,
  campaignTitle,
  isApproved,
  isHidden,
  className,
}: CampaignModerationMenuProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const { moderate } = useCampaignModeration();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ModerationLabel | null>(null);

  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  if (!isMod) return null;

  const runAction = async (action: ModerationLabel, verbPast: string) => {
    if (busy) return;
    setBusy(action);
    try {
      await moderate.mutateAsync({ coord, action });
      toast({ title: `${verbPast}`, description: campaignTitle });
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
          aria-label="Moderate campaign"
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
          <DropdownMenuItem onClick={() => runAction('unapproved', 'Removed from homepage')}>
            <ShieldOff className="h-4 w-4 mr-2" />
            Unapprove
            <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Approved
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => runAction('approved', 'Approved for homepage')}>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
