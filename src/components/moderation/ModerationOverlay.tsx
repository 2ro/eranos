import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCampaignLabelers } from '@/hooks/useCampaignLabelers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { usePledgeModeration } from '@/hooks/usePledgeModeration';

import { HiddenBadge } from './HiddenBadge';
import { ModerationMenu, type ModerationAxis, type ModerationSurface } from './ModerationMenu';

interface ModerationOverlayProps {
  /** Addressable coordinate of the entity (`<kind>:<pubkey>:<d>`). */
  coord: string;
  /** Visible title for the entity, used in toast feedback. */
  entityTitle: string;
  /** Which surface this overlay acts on. */
  surface: ModerationSurface;
  /** Which axes to expose in the kebab menu. */
  axes: readonly ModerationAxis[];
  /**
   * Visual size for the inline Hidden badge. Big cards (CampaignCard's
   * featured variant) tend to look better with the default size; small
   * grid cards (ActionCard, CommunityMiniCard) use compact.
   */
  badgeSize?: 'default' | 'compact';
  /**
   * When false, the moderator kebab is suppressed and only the
   * "Hidden" badge renders. Useful when a card already exposes a
   * combined kebab elsewhere (e.g. `ActionShareMenu` on pledge cards
   * embeds `ModerationMenuItems` directly into its share/delete
   * dropdown so the card carries a single kebab). Defaults to true.
   */
  showMenu?: boolean;
  /**
   * Extra classes overriding the absolutely-positioned wrapper. Most
   * callers can omit; campaigns historically used `top-3 right-3` while
   * pledges/groups use `top-2 right-2`.
   */
  className?: string;
}

/** Shared overlay body once the hide state has been resolved. */
function OverlayBody({
  isHidden,
  coord,
  entityTitle,
  surface,
  axes,
  badgeSize,
  showMenu = true,
  className,
}: Omit<ModerationOverlayProps, never> & { isHidden: boolean }) {
  const wrapperClass = className ?? 'absolute top-2 right-2 z-10 flex items-center gap-1.5';

  // When the menu is suppressed AND nothing is hidden, the overlay
  // would render an empty positioned div. Skip render entirely so the
  // banner stays clean.
  if (!showMenu && !isHidden) return null;

  return (
    <div className={wrapperClass}>
      {isHidden && <HiddenBadge size={badgeSize ?? 'compact'} />}
      {showMenu && (
        <ModerationMenu
          coord={coord}
          entityTitle={entityTitle}
          surface={surface}
          axes={axes}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-surface inner components. Each component mounts only the
// moderation hook for its surface, so a pledge card never subscribes to
// the campaign label query (and vice versa). Splitting the switch into
// dedicated components keeps the rules of hooks happy.
// ─────────────────────────────────────────────────────────────────────

function CampaignOverlay(props: ModerationOverlayProps) {
  const { data } = useCampaignModeration();
  return <OverlayBody {...props} isHidden={data.hiddenCoords.has(props.coord)} />;
}

function PledgeOverlay(props: ModerationOverlayProps) {
  const { data } = usePledgeModeration({ coordinates: [props.coord] });
  return <OverlayBody {...props} isHidden={data.hiddenCoords.has(props.coord)} />;
}

function GroupOverlay(props: ModerationOverlayProps) {
  const { data } = useOrganizationModeration();
  return <OverlayBody {...props} isHidden={data.hiddenCoords.has(props.coord)} />;
}

/**
 * Absolutely-positioned overlay for cards: bundles the Hidden badge
 * (when the entity is hidden) and the moderator kebab in a single
 * top-right corner. Returns `null` for non-moderators so non-mod grids
 * never subscribe to the moderation label query at all.
 *
 * Consistent across campaigns, pledges, and groups — same chip, same
 * kebab placement, same moderator gating, same visual order.
 *
 * Card containers must be `relative` for the absolute positioning to
 * anchor correctly.
 */
export function ModerationOverlay(props: ModerationOverlayProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const labelers = useCampaignLabelers();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const isLabeler = !!user && labelers.includes(user.pubkey);

  // Campaigns also surface the kebab to labelers (for the verify row),
  // which are a distinct allowlist from the moderator pack. Other
  // surfaces remain moderator-only.
  const canShow = props.surface === 'campaign' ? isMod || isLabeler : isMod;
  if (!canShow) return null;

  switch (props.surface) {
    case 'campaign': return <CampaignOverlay {...props} />;
    case 'pledge': return <PledgeOverlay {...props} />;
    case 'group': return <GroupOverlay {...props} />;
  }
}
