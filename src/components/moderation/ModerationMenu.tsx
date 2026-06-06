import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck, Check, EyeOff, Eye, ListPlus, MoreHorizontal,
  Sparkles, SparklesIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CampaignListMembershipDialog } from '@/components/campaign-lists/CampaignListMembershipDialog';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCampaignLabelers } from '@/hooks/useCampaignLabelers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignVerifications } from '@/hooks/useCampaignVerifications';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { usePledgeModeration } from '@/hooks/usePledgeModeration';
import type { ModerationLabel } from '@/lib/agoraModeration';

/**
 * Which moderation surface we're acting on. Each surface routes the
 * mutation through its own per-kind hook (different relay invalidations,
 * different axis support) but the dropdown shell is identical.
 */
export type ModerationSurface = 'campaign' | 'pledge' | 'group';

/**
 * Which axes the menu should render. Two are defined: `hide` (used
 * by every surface) and `featured` (used by pledges and groups; the
 * campaign surface stopped opting into this axis when the curated
 * Lists feature replaced campaign-level featuring). The prop exists
 * so future surfaces can selectively expose one axis if needed. The
 * order in this array does NOT determine render order — the menu
 * always renders Hide → Feature top-to-bottom when present, which
 * keeps the surfaces visually consistent.
 */
export type ModerationAxis = 'hide' | 'featured';

interface ModerationItemsProps {
  /** Addressable coordinate of the entity (`<kind>:<pubkey>:<d>`). */
  coord: string;
  /** Visible title for the entity, used in toast feedback. */
  entityTitle: string;
  /** Which surface this acts on. */
  surface: ModerationSurface;
  /** Which axes to render. */
  axes: readonly ModerationAxis[];
}

interface ModerationMenuProps extends ModerationItemsProps {
  /** Optional override className applied to the trigger button. */
  className?: string;
}

/** Translated label for the trigger's aria-label. */
function ariaLabelKey(surface: ModerationSurface): string {
  switch (surface) {
    case 'campaign': return 'moderation.menu.ariaCampaign';
    case 'pledge': return 'moderation.menu.ariaPledge';
    case 'group': return 'moderation.menu.ariaGroup';
  }
}

// ─────────────────────────────────────────────────────────────────────
// ModerationMenuItems — the dropdown rows themselves (label + items)
// without the outer DropdownMenu / DropdownMenuTrigger wrapper. Used by
// the standalone ModerationMenu below and by callers (like ActionCard's
// share/delete kebab) that need to embed moderator actions inside
// their own dropdown so the card carries a single kebab.
//
// Returns `null` for non-moderators; callers compose conditionally:
//
//   <DropdownMenuContent>
//     <DropdownMenuItem onClick={…}>Copy link</DropdownMenuItem>
//     <DropdownMenuSeparator />
//     <ModerationMenuItems coord={…} surface="pledge" axes={…} entityTitle={…} />
//   </DropdownMenuContent>
//
// Callers are responsible for inserting a leading separator when there
// are share/owner items above. The component starts with a
// `DropdownMenuLabel` ("Moderator actions") so the section reads as a
// distinct group either way.
// ─────────────────────────────────────────────────────────────────────

/** Inner rows once moderation state has been resolved. Pure UI. */
function ModerationItemsShell({
  coord,
  entityTitle,
  axes,
  moderation,
  moderate,
  getFeatureRank,
  onAddToList,
}: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
  moderation: ReturnType<typeof useCampaignModeration>['data'];
  moderate: ReturnType<typeof useCampaignModeration>['moderate'];
  /**
   * Optional per-surface hook that computes the `rank` tag to publish
   * on a `featured` action. The display sort is descending by rank,
   * so returning `min(existing ranks) - 1` makes a newly-featured
   * entity land at the **bottom** of the surface's featured shelf
   * (append semantics).
   *
   * Only the `featured` action consults this — `unfeatured`,
   * `hidden`, and `unhidden` ignore it. Surfaces that don't pass it
   * keep the legacy `created_at`-fallback behavior, which puts the
   * newest feature on top.
   */
  getFeatureRank?: () => number | undefined;
  /**
   * Optional click handler for the "Add to list…" row. When provided,
   * the row is rendered above the standard axis controls. Only the
   * campaign surface currently passes this — the menu item opens a
   * per-campaign membership modal in {@link CampaignItemsInner}.
   */
  onAddToList?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ModerationLabel | null>(null);

  const isHidden = moderation.hiddenCoords.has(coord);
  const isFeatured = moderation.featuredCoords.has(coord);

  const hasHide = axes.includes('hide');
  const hasFeatured = axes.includes('featured');

  const runAction = async (action: ModerationLabel, verbPast: string) => {
    if (busy) return;
    setBusy(action);
    try {
      // `featured` actions on surfaces with append-semantics carry an
      // explicit rank so the new label lands at the bottom of the
      // descending-rank shelf. Other axes / surfaces leave `rank`
      // undefined and rely on `created_at` fallback.
      const rank = action === 'featured' ? getFeatureRank?.() : undefined;
      await moderate.mutateAsync({ coord, action, rank });
      toast({ title: verbPast, description: entityTitle });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: t('moderation.menu.failedAction', { action }),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        {t('moderation.menu.label')}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      {onAddToList && (
        <>
          <DropdownMenuItem onClick={() => onAddToList()}>
            <ListPlus className="h-4 w-4 mr-2" />
            {t('moderation.menu.addToList')}
          </DropdownMenuItem>
          {(hasHide || hasFeatured) && <DropdownMenuSeparator />}
        </>
      )}

      {hasHide && (
        isHidden ? (
          <DropdownMenuItem onClick={() => runAction('unhidden', t('moderation.menu.toastUnhidden'))} disabled={!!busy}>
            <Eye className="h-4 w-4 mr-2" />
            {t('moderation.menu.unhide')}
            <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> {t('moderation.menu.hiddenState')}
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => runAction('hidden', t('moderation.menu.toastHidden'))}
            disabled={!!busy}
            className="text-destructive focus:text-destructive"
          >
            <EyeOff className="h-4 w-4 mr-2" />
            {t('moderation.menu.hide')}
          </DropdownMenuItem>
        )
      )}

      {hasFeatured && hasHide && <DropdownMenuSeparator />}

      {hasFeatured && (
        isFeatured ? (
          <DropdownMenuItem onClick={() => runAction('unfeatured', t('moderation.menu.toastUnfeatured'))} disabled={!!busy}>
            <SparklesIcon className="h-4 w-4 mr-2" />
            {t('moderation.menu.unfeature')}
            <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> {t('moderation.menu.featuredState')}
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => runAction('featured', t('moderation.menu.toastFeatured'))} disabled={!!busy}>
            <Sparkles className="h-4 w-4 mr-2" />
            {t('moderation.menu.feature')}
          </DropdownMenuItem>
        )
      )}
    </>
  );
}

// Per-surface inner components. Each mounts only its own moderation
// hook so a pledge card never subscribes to the campaign label query
// (and vice versa).

function CampaignItemsInner(props: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
  /**
   * Called when the moderator clicks "Add to list…". The host (a
   * dropdown menu) closes itself on item-select, which would unmount
   * a dialog rendered here as a sibling. The host holds the modal
   * state instead — see {@link ModerationMenu}.
   */
  onAddToList?: () => void;
}) {
  const { data, moderate } = useCampaignModeration();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  // The campaign surface stopped exposing the `featured` axis when
  // the curated Lists feature replaced campaign-level featuring, so
  // the rank computation is dead weight here. We still pass through
  // the shared shell because the shell drives the "Add to list…" row
  // plus Hide / Unhide.
  //
  // The verification row is gated separately (by the labeler allowlist,
  // not the moderator pack), so it's rendered here as a sibling rather
  // than inside the shell. The moderator rows only render when the user
  // is a mod; the verify row only when they're a labeler — the two sets
  // can differ, and either alone is enough to mount this menu.
  return (
    <>
      {isMod && (
        <ModerationItemsShell
          coord={props.coord}
          entityTitle={props.entityTitle}
          axes={props.axes}
          moderation={data}
          moderate={moderate}
          onAddToList={props.onAddToList}
        />
      )}
      <CampaignVerifyItem
        coord={props.coord}
        entityTitle={props.entityTitle}
        showLeadingSeparator={isMod}
      />
    </>
  );
}

/**
 * Verify / remove-verification row for the campaign moderation menu.
 * Gated by the labeler allowlist (distinct from the moderator pack) —
 * renders `null` for everyone else. Publishes an `agora.verified` label
 * on verify and a kind 5 deletion of the labeler's own label on remove.
 */
function CampaignVerifyItem({
  coord,
  entityTitle,
  showLeadingSeparator,
}: {
  coord: string;
  entityTitle: string;
  /** Render a separator above the row (when moderator rows precede it). */
  showLeadingSeparator: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { data, isLabeler, verify, unverify } = useCampaignVerifications();

  if (!isLabeler) return null;

  const mine = user
    ? (data.byCoord.get(coord) ?? []).find((v) => v.pubkey === user.pubkey)
    : undefined;
  const busy = verify.isPending || unverify.isPending;

  const onVerify = async () => {
    try {
      await verify.mutateAsync({ coord });
      toast({ title: t('campaignVerification.verified'), description: entityTitle });
    } catch (error) {
      toast({
        title: t('campaignVerification.actionFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const onUnverify = async () => {
    if (!mine) return;
    try {
      await unverify.mutateAsync({ verification: mine });
      toast({ title: t('campaignVerification.unverified'), description: entityTitle });
    } catch (error) {
      toast({
        title: t('campaignVerification.actionFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      {showLeadingSeparator && <DropdownMenuSeparator />}
      {mine ? (
        <DropdownMenuItem onClick={onUnverify} disabled={busy}>
          <BadgeCheck className="h-4 w-4 mr-2" />
          {t('campaignVerification.removeVerification')}
          <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
            <Check className="h-3 w-3" /> {t('campaignVerification.verifiedState')}
          </span>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem onClick={onVerify} disabled={busy}>
          <BadgeCheck className="h-4 w-4 mr-2" />
          {t('campaignVerification.verifyCampaign')}
        </DropdownMenuItem>
      )}
    </>
  );
}

function PledgeItemsInner(props: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
}) {
  const { data, moderate } = usePledgeModeration({ coordinates: [props.coord] });
  return <ModerationItemsShell {...props} moderation={data} moderate={moderate} />;
}

function GroupItemsInner(props: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
}) {
  const { data, moderate } = useOrganizationModeration();
  return <ModerationItemsShell {...props} moderation={data} moderate={moderate} />;
}

/**
 * Renders the moderator-only dropdown rows (label + action items) for
 * embedding inside a host `DropdownMenuContent`. Returns `null` for
 * non-moderators so the moderation cache is never subscribed on non-mod
 * views.
 *
 * Compose with other items in a single host dropdown when a card needs
 * to expose both share/owner actions AND moderator actions in one kebab
 * (e.g. `ActionShareMenu` on pledge cards). Insert a
 * `<DropdownMenuSeparator />` immediately before this component when
 * any preceding items exist, so the moderator section reads as a
 * distinct group:
 *
 *   <DropdownMenuContent>
 *     <DropdownMenuItem onClick={copy}>Copy link</DropdownMenuItem>
 *     {isOwner && <DropdownMenuItem onClick={del}>Delete</DropdownMenuItem>}
 *     <DropdownMenuSeparator />
 *     <ModerationMenuItems coord={…} surface="pledge" axes={…} entityTitle={…} />
 *   </DropdownMenuContent>
 *
 * For surfaces that only need the moderator kebab in isolation (no
 * share/owner items), use {@link ModerationMenu} or
 * {@link ModerationOverlay} — both wrap this component in their own
 * trigger.
 *
 * **Campaign-only "Add to list…" row.** Callers embedding the campaign
 * surface can pass `onAddToList` to render an extra row above the
 * standard axes. The host is responsible for owning the dialog state
 * (the dropdown unmounts its own children on close, which would tear
 * down a sibling dialog rendered here). {@link ModerationMenu} does
 * this automatically; other hosts (`ActionShareMenu` etc.) only need
 * to pass the callback if they want the row inline.
 */
export function ModerationMenuItems(
  props: ModerationItemsProps & { onAddToList?: () => void },
) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const labelers = useCampaignLabelers();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const isLabeler = !!user && labelers.includes(user.pubkey);

  // The campaign surface also exposes a verify row to labelers, who are a
  // distinct allowlist from the moderator pack — so a labeler who isn't a
  // moderator still gets the campaign menu. Other surfaces are mod-only.
  const canShow = props.surface === 'campaign' ? isMod || isLabeler : isMod;
  if (!canShow) return null;

  switch (props.surface) {
    case 'campaign':
      return (
        <CampaignItemsInner
          coord={props.coord}
          entityTitle={props.entityTitle}
          axes={props.axes}
          onAddToList={props.onAddToList}
        />
      );
    case 'pledge':
      return (
        <PledgeItemsInner
          coord={props.coord}
          entityTitle={props.entityTitle}
          axes={props.axes}
        />
      );
    case 'group':
      return (
        <GroupItemsInner
          coord={props.coord}
          entityTitle={props.entityTitle}
          axes={props.axes}
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Standalone moderator kebab. Wraps ModerationMenuItems in its own
// DropdownMenu + trigger. Returns null for non-moderators so the
// trigger and the moderation query are both skipped.
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-card / per-surface kebab menu for moderator actions. Returns
 * `null` for non-moderators so the moderation cache is never subscribed
 * on non-mod views.
 *
 * Used directly on detail pages (no overlay wrapper). For card grids,
 * prefer {@link ModerationOverlay}, which bundles this kebab with a
 * "Hidden" badge in an absolutely-positioned corner.
 *
 * Campaign surfaces additionally get an "Add to list…" row at the top
 * that opens a per-campaign membership modal. The modal's state lives
 * at this trigger level (not inside `DropdownMenuContent`) because the
 * dropdown unmounts its children on close — a sibling dialog mounted
 * inside the content would be torn down on the same tick.
 */
export function ModerationMenu({ className, ...rest }: ModerationMenuProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const labelers = useCampaignLabelers();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const isLabeler = !!user && labelers.includes(user.pubkey);
  const [membershipOpen, setMembershipOpen] = useState(false);

  // Campaigns mount the menu for labelers too (verify row); other
  // surfaces stay moderator-only.
  const canShow = rest.surface === 'campaign' ? isMod || isLabeler : isMod;
  if (!canShow) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(ariaLabelKey(rest.surface))}
            className={className ?? 'h-8 w-8 bg-background/80 backdrop-blur text-muted-foreground hover:text-foreground'}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <ModerationMenuItems
            {...rest}
            onAddToList={
              rest.surface === 'campaign'
                ? () => setMembershipOpen(true)
                : undefined
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {rest.surface === 'campaign' && (
        <CampaignListMembershipDialog
          open={membershipOpen}
          onOpenChange={setMembershipOpen}
          campaignCoord={rest.coord}
          campaignTitle={rest.entityTitle}
        />
      )}
    </>
  );
}
