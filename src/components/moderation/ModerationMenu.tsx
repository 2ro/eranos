import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check, EyeOff, Eye, Loader2, MoreHorizontal,
  ShieldCheck, ShieldOff, Sparkles, SparklesIcon,
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
 * Which axes the menu should render. Campaigns have all three; pledges
 * and groups don't have an approval axis. The order in this array does
 * NOT determine render order — the menu always renders Approve → Hide →
 * Feature top-to-bottom when present, which keeps the three surfaces
 * visually consistent.
 */
export type ModerationAxis = 'approval' | 'hide' | 'featured';

interface ModerationMenuProps {
  /** Addressable coordinate of the entity (`<kind>:<pubkey>:<d>`). */
  coord: string;
  /** Visible title for the entity, used in toast feedback. */
  entityTitle: string;
  /** Which surface this kebab acts on. */
  surface: ModerationSurface;
  /** Which axes to render. */
  axes: readonly ModerationAxis[];
  /** Optional override className applied to the trigger button. */
  className?: string;
}

/** Bag of state + mutation that the menu shell needs. Shape-unified
 *  across the three per-surface hooks (they all return `data` and
 *  `moderate`). */
interface SurfaceModeration {
  data: ReturnType<typeof useCampaignModeration>['data'];
  moderate: ReturnType<typeof useCampaignModeration>['moderate'];
}

/** Translated label for the trigger's aria-label. */
function ariaLabelKey(surface: ModerationSurface): string {
  switch (surface) {
    case 'campaign': return 'moderation.menu.ariaCampaign';
    case 'pledge': return 'moderation.menu.ariaPledge';
    case 'group': return 'moderation.menu.ariaGroup';
  }
}

/**
 * Shared dropdown shell. Pure UI — receives the moderation state and
 * the `moderate` mutation from the per-surface wrapper above, so it
 * never has to know which surface it's for. Renders the configured
 * axes in a consistent order:
 *
 *   Approve / Unapprove   (axis = 'approval')
 *   Hide / Unhide         (axis = 'hide')
 *   ───────
 *   Feature / Unfeature   (axis = 'featured')
 *
 * The split keeps the destructive Hide action adjacent to the
 * trust-decision Approve action, and pushes the Feature elevation into
 * its own visual group below the separator.
 */
function ModerationMenuShell({
  coord,
  entityTitle,
  surface,
  axes,
  className,
  data: moderation,
  moderate,
}: ModerationMenuProps & SurfaceModeration) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ModerationLabel | null>(null);

  const isApproved = moderation.approvedCoords.has(coord);
  const isHidden = moderation.hiddenCoords.has(coord);
  const isFeatured = moderation.featuredCoords.has(coord);

  const hasApproval = axes.includes('approval');
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(ariaLabelKey(surface))}
          className={className ?? 'h-8 w-8 bg-background/80 backdrop-blur text-muted-foreground hover:text-foreground'}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('moderation.menu.label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {hasApproval && (
          isApproved ? (
            <DropdownMenuItem onClick={() => runAction('unapproved', t('moderation.menu.toastUnapproved'))}>
              <ShieldOff className="h-4 w-4 mr-2" />
              {t('moderation.menu.unapprove')}
              <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> {t('moderation.menu.approvedState')}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => runAction('approved', t('moderation.menu.toastApproved'))}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              {t('moderation.menu.approve')}
            </DropdownMenuItem>
          )
        )}

        {hasHide && (
          isHidden ? (
            <DropdownMenuItem onClick={() => runAction('unhidden', t('moderation.menu.toastUnhidden'))}>
              <Eye className="h-4 w-4 mr-2" />
              {t('moderation.menu.unhide')}
              <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> {t('moderation.menu.hiddenState')}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => runAction('hidden', t('moderation.menu.toastHidden'))}
              className="text-destructive focus:text-destructive"
            >
              <EyeOff className="h-4 w-4 mr-2" />
              {t('moderation.menu.hide')}
            </DropdownMenuItem>
          )
        )}

        {hasFeatured && (hasApproval || hasHide) && <DropdownMenuSeparator />}

        {hasFeatured && (
          isFeatured ? (
            <DropdownMenuItem onClick={() => runAction('unfeatured', t('moderation.menu.toastUnfeatured'))}>
              <SparklesIcon className="h-4 w-4 mr-2" />
              {t('moderation.menu.unfeature')}
              <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> {t('moderation.menu.featuredState')}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => runAction('featured', t('moderation.menu.toastFeatured'))}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t('moderation.menu.feature')}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-surface inner components. Each one is the only place its
// moderation hook is mounted, so we never subscribe a pledge card to
// the campaign label query (or vice versa). They all share the same
// dropdown shell above.
// ─────────────────────────────────────────────────────────────────────

function CampaignMenuInner(props: ModerationMenuProps) {
  const { data, moderate } = useCampaignModeration();
  return <ModerationMenuShell {...props} data={data} moderate={moderate} />;
}

function PledgeMenuInner(props: ModerationMenuProps) {
  const { data, moderate } = usePledgeModeration();
  return <ModerationMenuShell {...props} data={data} moderate={moderate} />;
}

function GroupMenuInner(props: ModerationMenuProps) {
  const { data, moderate } = useOrganizationModeration();
  return <ModerationMenuShell {...props} data={data} moderate={moderate} />;
}

/**
 * Per-card / per-surface kebab menu for moderator actions. Returns
 * `null` for non-moderators so the moderation cache is never subscribed
 * on non-mod views.
 *
 * Used directly on detail pages (no overlay wrapper). For card grids,
 * prefer {@link ModerationOverlay}, which bundles this kebab with a
 * "Hidden" badge in an absolutely-positioned corner.
 */
export function ModerationMenu(props: ModerationMenuProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  if (!isMod) return null;

  switch (props.surface) {
    case 'campaign': return <CampaignMenuInner {...props} />;
    case 'pledge': return <PledgeMenuInner {...props} />;
    case 'group': return <GroupMenuInner {...props} />;
  }
}
