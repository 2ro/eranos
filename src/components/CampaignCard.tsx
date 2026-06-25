import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HandHeart, ShieldCheck } from 'lucide-react';

import { AuthorByline } from '@/components/AuthorByline';
import { CampaignVerificationBadge } from '@/components/CampaignVerificationBadge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ModerationOverlay } from '@/components/moderation';
import { useAuthor } from '@/hooks/useAuthor';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import { useInView } from '@/hooks/useInView';
import {
  type ParsedCampaign,
  encodeCampaignNaddr,
  getCampaignCountryLabel,
  parseCampaign,
} from '@/lib/campaign';
import { formatCampaignAmount, formatUsdGoal, satsToUsd } from '@/lib/formatCampaignAmount';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Short helper rendered both inline (cards) and in the detail page.
 *
 * Per NIP.md Kind 33863, the campaign **goal** is integer USD and the
 * **raised** total is the sum of verified sats. We render both in the
 * goal's unit (USD) for consistency, converting the sats total at view
 * time using the live BTC price. While the price is loading the raised
 * amount falls back to sats.
 */
function CampaignProgress({
  raisedSats,
  goalUsd,
  btcPrice,
  isLoading,
  className,
}: {
  raisedSats: number;
  goalUsd?: number;
  btcPrice?: number;
  /**
   * True while the donation totals are still being fetched. The bar gets
   * its own skeleton — independent of the card, which paints immediately —
   * so we never flash a misleading "0 raised" before the on-chain balance
   * lands. Footprint matches the loaded state (bar row + one text row).
   */
  isLoading?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <Skeleton className="h-2 w-full" />
        <div className="flex items-baseline justify-between gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  const hasGoal = !!goalUsd && goalUsd > 0;
  const raisedUsd = satsToUsd(raisedSats, btcPrice);
  const pct = hasGoal && raisedUsd !== undefined
    ? Math.min(100, Math.round((raisedUsd / goalUsd!) * 100))
    : 0;

  // Always reserve a bar row so cards with and without a goal occupy
  // the same vertical space. The bar is rendered invisibly when
  // there's no goal — same height, no visual weight.
  //
  // The primitive's default `bg-secondary` track is too close to the
  // card surface in both light and dark modes (in dark mode they're
  // both `0 0% 18%`, making the empty portion of the bar invisible).
  // `bg-foreground/15` overrides it with a foreground-tinted track
  // that has real contrast against the card in either theme.
  return (
    <div className={cn('space-y-1.5', className)}>
      <Progress
        value={pct}
        className={cn('h-2 bg-foreground/15', !hasGoal && 'invisible')}
        aria-hidden={!hasGoal}
      />
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          {formatCampaignAmount(raisedSats, btcPrice)}
          {!hasGoal && <span className="ml-1 font-normal text-muted-foreground">raised</span>}
        </span>
        {hasGoal && (
          <span className="text-muted-foreground">of {formatUsdGoal(goalUsd!)} goal</span>
        )}
      </div>
    </div>
  );
}

/**
 * Replaces {@link CampaignProgress} for silent-payment campaigns, where
 * on-chain totals are unobservable by design. Shows the goal as a target
 * (if set) but no progress bar or raised amount.
 */
function CampaignPrivateNotice({
  goalUsd,
  className,
}: {
  goalUsd?: number;
  className?: string;
}) {
  // Mirrors CampaignProgress's vertical footprint (invisible bar + one
  // text row) so a silent-payment card lines up visually with a
  // public-progress card alongside it.
  return (
    <div className={cn('space-y-1.5', className)}>
      <Progress value={0} className="h-2 invisible" aria-hidden />
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Private campaign
        </span>
        {goalUsd && goalUsd > 0 && (
          <span className="text-muted-foreground">Target: {formatUsdGoal(goalUsd)}</span>
        )}
      </div>
    </div>
  );
}

interface CampaignCardProps {
  campaign: ParsedCampaign;
  /**
   * Visual variant.
   *
   * - `compact` — default grid item.
   * - `featured` — hero placement (wider, side-by-side on `sm+`).
   *   The token is purely visual — it names the layout, not a
   *   curation state — and stayed after the moderator-level
   *   "Featured" concept was retired in favor of curated lists.
   * - `shelf` — fixed-width card for horizontal scroll rails (e.g. group
   *   official-activity). Caller no longer hand-rolls the size wrapper.
   */
  variant?: 'compact' | 'featured' | 'shelf';
  className?: string;
  /** Optional footer affordance rendered opposite the author line. */
  footerBadge?: ReactNode;
  /**
   * When false, the moderator kebab inside the card overlay is suppressed.
   * The "Hidden" badge still renders so mods can see hide state, but the
   * menu trigger is omitted. Pass false when the card is wrapped by a
   * parent (e.g. `ListMemberCard`) that already provides its own combined
   * kebab containing the moderation actions — avoids two overlapping menus
   * in the same top-right corner.
   */
  showModerationMenu?: boolean;
}

/**
 * Renders a single campaign as a clickable card. The whole card is a
 * `<Link>` to the campaign's naddr-based detail route.
 */
export function CampaignCard({ campaign, variant = 'compact', className, footerBadge, showModerationMenu = true }: CampaignCardProps) {
  const { translatedEvent, translateAction } = useEventTranslation(campaign.event, {
    iconOnly: true,
    buttonClassName: 'size-8 rounded-full p-0 text-muted-foreground hover:text-primary hover:bg-primary/10',
  });
  const displayCampaign = parseCampaign(translatedEvent) ?? campaign;
  const author = useAuthor(campaign.pubkey);
  // Defer the (potentially Esplora-heavy) donation lookup until the card is
  // actually on screen. A campaigns grid mounts up to ~200 cards at once;
  // fetching donations for every one eagerly fired an Esplora `/address`
  // call per card plus a `/tx` call per donation receipt, all at once,
  // which rate-limited every configured backend. `rootMargin` pre-arms the
  // fetch just before the card scrolls into view so the number is usually
  // already there by the time the user sees it.
  const cardRef = useRef<HTMLAnchorElement>(null);
  const inView = useInView(cardRef);
  // Cards only show the raised total (the progress bar), never the donor
  // list — so we skip the kind 8333 receipt fetch and the per-receipt
  // `/tx` verification fan-out. Only the single Esplora `/address` balance
  // lookup runs, which keeps a ~200-card grid from firing an N-receipt
  // `/tx` storm per card.
  const { data: stats, isLoading: donationsLoading } = useCampaignDonations(campaign, {
    enabled: inView,
    receipts: false,
  });
  const { data: btcPrice } = useBtcPrice();

  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);
  const authorMetadata = author.data?.metadata;
  const cover = sanitizeUrl(displayCampaign.banner)
    ?? sanitizeUrl(authorMetadata?.banner)
    ?? sanitizeUrl(authorMetadata?.picture);
  const raisedSats = stats?.totalSats ?? 0;
  const countryLabel = getCampaignCountryLabel(campaign);
  // SP-only campaigns hide aggregate totals; dual-endpoint campaigns
  // show on-chain aggregates per spec.
  const isSilentPayment = !campaign.wallets.onchain;

  const isFeaturedVariant = variant === 'featured';
  const isShelfVariant = variant === 'shelf';

  return (
    <Link
      ref={cardRef}
      to={`/${naddr}`}
      className={cn(
        'group block rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5',
        isShelfVariant && 'h-[430px] w-[280px] shrink-0',
        className,
      )}
    >
      <Card
        className={cn(
          'overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg h-full flex flex-col',
          isFeaturedVariant && 'sm:flex-row sm:items-stretch',
        )}
      >
        {/* Cover image. Optional metadata (country) is
            overlaid on the banner as glass chips so the body below can
            stay structurally deterministic. A bottom gradient keeps
            the chips legible against any photo; a top scrim does the
            same for the moderation chip + hidden badge. */}
        <div
          className={cn(
            'relative w-full bg-gradient-to-br from-primary/15 via-primary/5 to-secondary',
            isFeaturedVariant ? 'aspect-[16/10] sm:aspect-auto sm:w-1/2 sm:min-h-[280px]' : 'aspect-[16/9]',
          )}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <HandHeart className="size-12 text-primary" />
            </div>
          )}

          {/* Bottom gradient — only present when there are bottom chips
              to display, so a banner with no overlays stays visually
              clean. */}
          {(countryLabel) && (
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
            />
          )}
          {/* Top scrim for moderation chip + hidden badge legibility. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
          />

          {/* Top-left verification badge — stacked moderator avatars for
              campaigns a moderator has verified. Renders nothing for
              unverified campaigns. Display-only; the verify action lives in
              the moderation kebab. */}
          <CampaignVerificationBadge
            coord={campaign.aTag}
            title={campaign.title}
            className="absolute top-3 left-3 z-10"
          />

          {/* Bottom-left meta chips — country. */}
          {(countryLabel) && (
            <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-1.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
              {countryLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 backdrop-blur-md px-2.5 py-1 text-[11px] font-medium text-white">
                  {countryLabel}
                </span>
              )}
            </div>
          )}

          <ModerationOverlay
            coord={campaign.aTag}
            entityTitle={campaign.title}
            surface="campaign"
            axes={['hide']}
            badgeSize="default"
            showMenu={showModerationMenu}
            className="absolute top-3 right-3 z-10 flex items-center gap-2"
          />
        </div>

        {/* Body — deterministic structure: title (1 line, truncates) →
            story (1 line, truncates; non-breaking space placeholder
            when absent) → progress (invisible-bar placeholder absorbs
            the no-goal case) → creator footer. Country, deadline,
            hidden badge, and moderation menu all live on the banner
            overlay, so this region's height is genuinely fixed: every
            card has the same body footprint, no dead space, no
            raggedness. */}
        <div className={cn('flex flex-col gap-3 p-5', isFeaturedVariant && 'sm:w-1/2 sm:p-6')}>
          <div className="space-y-1">
            <h3
              className={cn(
                'font-bold leading-tight tracking-tight truncate',
                isFeaturedVariant ? 'text-2xl sm:text-3xl' : 'text-lg',
              )}
            >
              {displayCampaign.title}
            </h3>
            <p
              className={cn(
                'text-muted-foreground truncate',
                isFeaturedVariant ? 'text-base' : 'text-sm',
              )}
            >
              {displayCampaign.story || '\u00A0'}
            </p>
          </div>

          {isSilentPayment ? (
            <CampaignPrivateNotice goalUsd={campaign.goalUsd} />
          ) : (
            <CampaignProgress
              raisedSats={raisedSats}
              goalUsd={campaign.goalUsd}
              btcPrice={btcPrice}
              isLoading={donationsLoading}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <AuthorByline pubkey={campaign.pubkey} insideLink />
            </div>
            {(footerBadge || translateAction) && (
              <div className="flex shrink-0 items-center gap-1.5">
                {footerBadge}
                {translateAction}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** Loading placeholder mirroring {@link CampaignCard} dimensions. */
export function CampaignCardSkeleton({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'featured';
  className?: string;
}) {
  const isFeatured = variant === 'featured';
  return (
    <Card
      className={cn(
        'overflow-hidden border-border/70 shadow-sm h-full flex flex-col',
        isFeatured && 'sm:flex-row sm:items-stretch',
        className,
      )}
    >
      <Skeleton
        className={cn(
          'w-full rounded-none',
          isFeatured ? 'aspect-[16/10] sm:aspect-auto sm:w-1/2 sm:min-h-[280px]' : 'aspect-[16/9]',
        )}
      />
      <div className={cn('flex-1 p-5 space-y-3', isFeatured && 'sm:w-1/2 sm:p-6')}>
        <Skeleton className={cn('w-3/4', isFeatured ? 'h-7' : 'h-5')} />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="flex-1" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </Card>
  );
}
