import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useCampaignVerifications } from '@/hooks/useCampaignVerifications';
import { useToast } from '@/hooks/useToast';
import type { CampaignVerification } from '@/lib/agoraVerification';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/** Stop card-`<Link>` navigation when the badge is interacted with. */
function swallow(e: { preventDefault: () => void; stopPropagation: () => void }) {
  e.preventDefault();
  e.stopPropagation();
}

/** One labeler avatar in the stacked badge. */
function LabelerAvatar({ pubkey, className }: { pubkey: string; className?: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const picture = sanitizeUrl(metadata?.picture);
  const initials = getDisplayName(metadata, pubkey).slice(0, 2).toUpperCase();
  return (
    <Avatar className={cn('size-6 ring-2 ring-background', className)}>
      {picture && <AvatarImage src={picture} alt="" proxyWidth={48} />}
      <AvatarFallback className="bg-secondary text-[9px] text-secondary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

/** A single verifier row inside the popover — links to the labeler's profile. */
function VerifierRow({ verification }: { verification: CampaignVerification }) {
  const navigate = useNavigate();
  const author = useAuthor(verification.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, verification.pubkey);
  const profileUrl = useProfileUrl(verification.pubkey, metadata);
  const picture = sanitizeUrl(metadata?.picture);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      onClick={(e) => {
        swallow(e);
        navigate(profileUrl);
      }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Avatar className="size-6 shrink-0">
        {picture && <AvatarImage src={picture} alt="" proxyWidth={48} />}
        <AvatarFallback className="bg-secondary text-[10px] text-secondary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="truncate font-medium">{displayName}</span>
    </button>
  );
}

interface CampaignVerificationBadgeProps {
  /** Campaign coordinate `33863:<pubkey>:<d>`. */
  coord: string;
  /** Campaign title, used for accessible labels. */
  title?: string;
  className?: string;
}

/**
 * Renders a stacked badge of labeler avatars over a campaign — one avatar
 * per trusted labeler that has issued an `agora.verified` label for it.
 * Hovering / clicking opens a popover that lists the verifiers (each links
 * to its profile) and, when the logged-in user is an authorized labeler,
 * shows a verify / remove-verification control.
 *
 * Renders nothing when the campaign has no verifications AND the viewer is
 * not a labeler — there's nothing to show or do. A labeler always sees the
 * badge (an empty shield) so they can verify.
 */
export function CampaignVerificationBadge({ coord, title, className }: CampaignVerificationBadgeProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { data, isLabeler, verify, unverify } = useCampaignVerifications();
  const [open, setOpen] = useState(false);

  const verifications = data.byCoord.get(coord) ?? [];
  const count = verifications.length;
  const mine = user ? verifications.find((v) => v.pubkey === user.pubkey) : undefined;

  // Nothing to surface for a regular viewer of an unverified campaign.
  if (count === 0 && !isLabeler) return null;

  const shown = verifications.slice(0, 3);
  const extra = count - shown.length;
  const pending = verify.isPending || unverify.isPending;

  const handleVerify = async () => {
    try {
      await verify.mutateAsync({ coord });
      toast({ title: t('campaignVerification.verified', 'Campaign verified') });
    } catch (e) {
      toast({
        title: t('campaignVerification.actionFailed', 'Action failed'),
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleUnverify = async () => {
    if (!mine) return;
    try {
      await unverify.mutateAsync({ verification: mine });
      toast({ title: t('campaignVerification.unverified', 'Verification removed') });
    } catch (e) {
      toast({
        title: t('campaignVerification.actionFailed', 'Action failed'),
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const triggerLabel = count > 0
    ? t('campaignVerification.verifiedByCount', {
        count,
        defaultValue: 'Verified by {{count}} labeler',
      })
    : t('campaignVerification.notVerified', 'Not yet verified');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${triggerLabel}${title ? ` — ${title}` : ''}`}
          onClick={swallow}
          onMouseEnter={() => setOpen(true)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-md px-1.5 py-1 text-white motion-safe:transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            className,
          )}
        >
          {count > 0 ? (
            <span className="flex items-center -space-x-2">
              {shown.map((v) => (
                <LabelerAvatar key={v.pubkey} pubkey={v.pubkey} />
              ))}
            </span>
          ) : (
            <BadgeCheck className="size-5 text-white/70" />
          )}
          {count > 0 && (
            <span className="ml-0.5 inline-flex items-center gap-0.5 pr-1 text-xs font-semibold">
              <BadgeCheck className="size-4 text-sky-300" />
              {extra > 0 ? `+${extra}` : null}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-2"
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {count > 0
            ? t('campaignVerification.verifiedBy', 'Verified by')
            : t('campaignVerification.notVerified', 'Not yet verified')}
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {verifications.map((v) => (
            <VerifierRow key={v.pubkey} verification={v} />
          ))}
        </div>
        {isLabeler && (
          <div className="mt-1.5 border-t border-border/60 pt-2">
            {mine ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={pending}
                onClick={(e) => {
                  swallow(e);
                  handleUnverify();
                }}
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('campaignVerification.removeVerification', 'Remove my verification')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={pending}
                onClick={(e) => {
                  swallow(e);
                  handleVerify();
                }}
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                <BadgeCheck className="mr-1.5 size-4" />
                {t('campaignVerification.verifyCampaign', 'Verify this campaign')}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
