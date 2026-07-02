import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';
import { CalendarClock, HandHeart, MapPin, Megaphone, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuthor } from '@/hooks/useAuthor';
import { parseAction } from '@/hooks/useActions';
import { getGeoDisplayName } from '@/lib/countries';
import { parseCampaign, getCampaignCountryLabel } from '@/lib/campaign';
import { parseCommunityEvent } from '@/lib/communityUtils';
import { formatUsdGoal } from '@/lib/formatCampaignAmount';
import { formatCompactPledgeDeadline, formatPledgeAmount } from '@/lib/pledges';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

function InlineShell({
  image,
  fallbackIcon,
  title,
  description,
  meta,
}: {
  image?: string;
  fallbackIcon: ReactNode;
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="overflow-hidden rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
        {image ? (
          <img src={image} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/7] items-center justify-center text-primary/45">
            {fallbackIcon}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-bold leading-tight tracking-tight line-clamp-2">{title}</h3>
        {description?.trim() ? (
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{description}</p>
        ) : null}
        {meta}
      </div>
    </div>
  );
}

export function CampaignInlinePreview({ event }: { event: NostrEvent }) {
  const { t } = useTranslation();
  const campaign = parseCampaign(event);
  const author = useAuthor(event.pubkey);
  if (!campaign) return null;

  const authorMetadata = author.data?.metadata;
  const cover = sanitizeUrl(campaign.banner)
    ?? sanitizeUrl(authorMetadata?.banner)
    ?? sanitizeUrl(authorMetadata?.picture);
  const naddr = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: campaign.identifier });
  const countryLabel = getCampaignCountryLabel(campaign);
  const goalLabel = campaign.goalUsd && campaign.goalUsd > 0
    ? t('campaignsDetail.target', { amount: formatUsdGoal(campaign.goalUsd) })
    : undefined;

  return (
    <Link to={`/${naddr}`} onClick={(e) => e.stopPropagation()} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <InlineShell
        image={cover}
        fallbackIcon={<HandHeart className="size-12" />}
        title={campaign.title}
        description={campaign.story}
        meta={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
            {goalLabel && (
              <span className="font-semibold text-foreground">{goalLabel}</span>
            )}
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                {countryLabel}
              </span>
            )}
          </div>
        )}
      />
    </Link>
  );
}

export function PledgeInlinePreview({ event }: { event: NostrEvent }) {
  const { t } = useTranslation();
  const pledge = parseAction(event);
  if (!pledge) return null;

  const naddr = nip19.naddrEncode({ kind: 36639, pubkey: pledge.pubkey, identifier: pledge.id });
  const countryLabel = pledge.countryCode ? getGeoDisplayName(pledge.countryCode) : undefined;
  const deadline = pledge.deadline ? formatCompactPledgeDeadline(pledge.deadline) : undefined;

  return (
    <Link to={`/${naddr}`} onClick={(e) => e.stopPropagation()} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <InlineShell
        image={pledge.image}
        fallbackIcon={<Megaphone className="size-12" />}
        title={pledge.title}
        description={pledge.description}
        meta={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="font-semibold uppercase tracking-wide text-primary">{t('pledges.card.pledged')}</span>
              <span className="text-sm font-bold text-foreground">{formatPledgeAmount(pledge.bounty)}</span>
            </span>
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {countryLabel}
              </span>
            )}
            {deadline && (
              <span className={cn('inline-flex items-center gap-1.5', deadline.isPast && 'text-destructive')}>
                <CalendarClock className="size-3.5" />
                {deadline.label}
              </span>
            )}
          </div>
        )}
      />
    </Link>
  );
}

export function GroupInlinePreview({ event }: { event: NostrEvent }) {
  const { t } = useTranslation();
  const group = parseCommunityEvent(event);
  if (!group) return null;

  const naddr = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: group.dTag });
  const countryLabel = group.countryCode ? getGeoDisplayName(group.countryCode) : undefined;

  return (
    <Link to={`/${naddr}`} onClick={(e) => e.stopPropagation()} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <InlineShell
        image={group.image}
        fallbackIcon={<Users className="size-12" />}
        title={group.name}
        description={group.description}
        meta={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {t('groups.create.moderatorsCount', { count: group.moderatorPubkeys.length })}
            </span>
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {countryLabel}
              </span>
            )}
          </div>
        )}
      />
    </Link>
  );
}
