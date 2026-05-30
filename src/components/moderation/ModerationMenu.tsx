import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUp, ArrowDown, ArrowUpToLine,
  Check, EyeOff, Eye, MoreHorizontal,
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
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
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
 * Which axes the menu should render. Two are defined: `hide` and
 * `featured`. Every current surface (campaigns, organizations,
 * pledges) supports both; the prop exists so future surfaces can
 * selectively expose one axis if needed. The order in this array
 * does NOT determine render order — the menu always renders
 * Hide → Feature top-to-bottom when present, which keeps the
 * surfaces visually consistent.
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
  /**
   * Optional reorder controls. Present when this entity sits inside a
   * moderator-curated ordered list (the Featured row and Community
   * Campaigns grid on the home page). When present, three rows render
   * between the standard axis controls and the trailing rule:
   *
   *  - Move to top (skipped when already at index 0)
   *  - Move up    (skipped when already at index 0)
   *  - Move down  (skipped when already at the last index)
   *
   * Callers compute `canMoveUp` / `canMoveDown` themselves from the
   * displayed list so the dropdown stays purely presentational and
   * doesn't need to know about list state.
   */
  reorder?: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveToTop: () => Promise<void> | void;
    onMoveUp: () => Promise<void> | void;
    onMoveDown: () => Promise<void> | void;
  };
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
  reorder,
  moderation,
  moderate,
}: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
  reorder?: ModerationItemsProps['reorder'];
  moderation: ReturnType<typeof useCampaignModeration>['data'];
  moderate: ReturnType<typeof useCampaignModeration>['moderate'];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ModerationLabel | null>(null);
  // Separate busy flag for reorder operations — they share the same
  // mutate hook but we want the menu to remain interactive for axis
  // actions while a reorder is in flight (and vice-versa).
  const [reordering, setReordering] = useState(false);

  const isHidden = moderation.hiddenCoords.has(coord);
  const isFeatured = moderation.featuredCoords.has(coord);

  const hasHide = axes.includes('hide');
  const hasFeatured = axes.includes('featured');

  const runAction = async (action: ModerationLabel, verbPast: string) => {
    if (busy) return;
    setBusy(action);
    try {
      await moderate.mutateAsync({ coord, action });
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

  /**
   * Wraps a reorder callback with the shared toast + busy-flag UX. The
   * caller passes the actual move (a thunk returned from
   * `useReorderCampaign`); we surface success / failure here so every
   * site that mounts the menu gets the same feedback for free.
   */
  const runReorder = async (
    op: () => Promise<void> | void,
    toastKey: 'movedUp' | 'movedDown' | 'movedToTop',
  ) => {
    if (reordering) return;
    setReordering(true);
    try {
      await op();
      toast({ title: t(`moderation.menu.toast.${toastKey}`), description: entityTitle });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: t('moderation.menu.failedReorder'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setReordering(false);
    }
  };

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        {t('moderation.menu.label')}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

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

      {/* Reorder section — only rendered when the host passes the
          reorder prop (i.e. the entity lives in a moderator-curated
          ordered list). Individual rows are gated on canMoveUp /
          canMoveDown so the menu doesn't show dead-end actions. */}
      {reorder && (reorder.canMoveUp || reorder.canMoveDown) && (
        <>
          <DropdownMenuSeparator />
          {reorder.canMoveUp && (
            <DropdownMenuItem
              onClick={() => runReorder(reorder.onMoveToTop, 'movedToTop')}
              disabled={reordering}
            >
              <ArrowUpToLine className="h-4 w-4 mr-2" />
              {t('moderation.menu.moveToTop')}
            </DropdownMenuItem>
          )}
          {reorder.canMoveUp && (
            <DropdownMenuItem
              onClick={() => runReorder(reorder.onMoveUp, 'movedUp')}
              disabled={reordering}
            >
              <ArrowUp className="h-4 w-4 mr-2" />
              {t('moderation.menu.moveUp')}
            </DropdownMenuItem>
          )}
          {reorder.canMoveDown && (
            <DropdownMenuItem
              onClick={() => runReorder(reorder.onMoveDown, 'movedDown')}
              disabled={reordering}
            >
              <ArrowDown className="h-4 w-4 mr-2" />
              {t('moderation.menu.moveDown')}
            </DropdownMenuItem>
          )}
        </>
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
  reorder?: ModerationItemsProps['reorder'];
}) {
  const { data, moderate } = useCampaignModeration();
  return <ModerationItemsShell {...props} moderation={data} moderate={moderate} />;
}

function PledgeItemsInner(props: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
  reorder?: ModerationItemsProps['reorder'];
}) {
  const { data, moderate } = usePledgeModeration({ coordinates: [props.coord] });
  return <ModerationItemsShell {...props} moderation={data} moderate={moderate} />;
}

function GroupItemsInner(props: {
  coord: string;
  entityTitle: string;
  axes: readonly ModerationAxis[];
  reorder?: ModerationItemsProps['reorder'];
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
 */
export function ModerationMenuItems(props: ModerationItemsProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  if (!isMod) return null;

  const inner = {
    coord: props.coord,
    entityTitle: props.entityTitle,
    axes: props.axes,
    reorder: props.reorder,
  };
  switch (props.surface) {
    case 'campaign': return <CampaignItemsInner {...inner} />;
    case 'pledge': return <PledgeItemsInner {...inner} />;
    case 'group': return <GroupItemsInner {...inner} />;
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
 */
export function ModerationMenu({ className, ...rest }: ModerationMenuProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  if (!isMod) return null;

  return (
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
        <ModerationMenuItems {...rest} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
