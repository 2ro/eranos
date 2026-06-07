import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useCampaignVerifications } from '@/hooks/useCampaignVerifications';
import type { CampaignVerification } from '@/lib/agoraVerification';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/** Stop card-`<Link>` navigation when the badge is interacted with. */
function swallow(e: { preventDefault: () => void; stopPropagation: () => void }) {
  e.preventDefault();
  e.stopPropagation();
}

/** One moderator avatar in the stacked badge. */
function ModeratorAvatar({ pubkey, className }: { pubkey: string; className?: string }) {
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

/** A single verifier row inside the popover — links to the moderator's profile. */
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
 * Display-only badge: a stack of moderator avatars over a campaign — one
 * avatar per moderator that has issued an `agora.verified` label for
 * it. Hovering / clicking opens a popover listing the verifiers, each
 * linking to its profile.
 *
 * This is purely informational. The verify / remove-verification *actions*
 * live in the campaign moderation kebab menu (`ModerationMenu`), not here.
 *
 * Renders nothing when the campaign has no verifications — there's nothing
 * to show.
 */
export function CampaignVerificationBadge({ coord, title, className }: CampaignVerificationBadgeProps) {
  const { t } = useTranslation();
  const { data } = useCampaignVerifications();
  const [open, setOpen] = useState(false);

  const verifications = data.byCoord.get(coord) ?? [];
  const count = verifications.length;

  // Nothing to surface for an unverified campaign.
  if (count === 0) return null;

  const shown = verifications.slice(0, 3);
  const extra = count - shown.length;

  const triggerLabel = t('campaignVerification.verifiedByCount', {
    count,
    defaultValue: 'Verified by {{count}} moderator',
  });

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
          <span className="flex items-center -space-x-2">
            {shown.map((v) => (
              <ModeratorAvatar key={v.pubkey} pubkey={v.pubkey} />
            ))}
          </span>
          <span className="ml-0.5 inline-flex items-center gap-0.5 pr-1 text-xs font-semibold">
            <BadgeCheck className="size-4 text-sky-300" />
            {extra > 0 ? `+${extra}` : null}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-2"
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('campaignVerification.verifiedBy', 'Verified by')}
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {verifications.map((v) => (
            <VerifierRow key={v.pubkey} verification={v} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
