import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Loader2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { ListFormDialog } from '@/components/campaign-lists/ListFormDialog';
import { AddCampaignToListDialog } from '@/components/campaign-lists/AddCampaignToListDialog';
import { CampaignListMembershipDialog } from '@/components/campaign-lists/CampaignListMembershipDialog';
import { VerificationDialog } from '@/components/VerificationDialog';
import { ModerationMenuItems } from '@/components/moderation';
import { LucideIcon } from '@/components/LucideIcon';
import { useCampaignList } from '@/hooks/useCampaignLists';
import { useCampaignListActions } from '@/hooks/useCampaignListActions';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignVerifications } from '@/hooks/useCampaignVerifications';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAppContext } from '@/hooks/useAppContext';
import { toast } from '@/hooks/useToast';
import { Link } from 'react-router-dom';
import type { ParsedCampaign } from '@/lib/campaign';
import { cn } from '@/lib/utils';
import NotFound from './NotFound';

const DRAG_MIME = 'text/x-agora-campaign-list-member';

/**
 * Detail page for a single campaign list. Shows the list's title and
 * description as a header, the list's campaigns in moderator-defined
 * order, and (for moderators) controls to edit the list metadata,
 * delete the list, add campaigns to it, remove campaigns from it, and
 * reorder the membership via drag-and-drop on desktop or the kebab menu
 * on mobile.
 *
 * Hidden campaigns (those carrying a `hidden` label per
 * `useCampaignModeration`) are filtered out for non-moderator viewers
 * the same way they are everywhere else. Moderators still see them so
 * they can decide to unhide or remove from the list.
 */
export function CampaignListDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { config } = useAppContext();

  const { list, isLoading } = useCampaignList(slug);
  const actions = useCampaignListActions();
  const isMobile = useIsMobile();
  const { data: moderation } = useCampaignModeration();

  const coords = useMemo(() => list?.coords ?? [], [list]);
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns({
    coordinates: coords,
    enabled: !!list,
  });

  // Build a coord -> campaign map and emit the list in MEMBERSHIP order
  // (the list's `coords` array is authoritative for display order;
  // `useCampaigns` returns them in `created_at` order which we override).
  const ordered = useMemo<ParsedCampaign[]>(() => {
    if (!campaigns || campaigns.length === 0) return [];
    const byCoord = new Map(campaigns.map((c) => [c.aTag, c]));
    const out: ParsedCampaign[] = [];
    const hiddenSet = moderation?.hiddenCoords ?? new Set<string>();
    for (const coord of coords) {
      const found = byCoord.get(coord);
      if (!found) continue;
      // Non-moderators: drop hidden campaigns. Moderators see everything.
      if (!actions.isMod && hiddenSet.has(coord)) continue;
      out.push(found);
    }
    return out;
  }, [campaigns, coords, moderation, actions.isMod]);

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [optimisticOrder, setOptimisticOrder] = useState<readonly string[] | null>(null);

  const displayedCoords = useMemo(() => {
    if (optimisticOrder) {
      const known = new Set(coords);
      const filtered = optimisticOrder.filter((c) => known.has(c));
      if (filtered.length === coords.length) return filtered;
    }
    return coords;
  }, [optimisticOrder, coords]);

  // Apply optimistic order to the displayed campaigns.
  const displayedCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!optimisticOrder) return ordered;
    const byCoord = new Map(ordered.map((c) => [c.aTag, c]));
    const out: ParsedCampaign[] = [];
    for (const coord of displayedCoords) {
      const found = byCoord.get(coord);
      if (found) out.push(found);
    }
    return out;
  }, [ordered, optimisticOrder, displayedCoords]);

  // Drop the optimistic override once authoritative matches.
  if (
    optimisticOrder &&
    coords.length === optimisticOrder.length &&
    coords.every((c, i) => c === optimisticOrder[i])
  ) {
    queueMicrotask(() => setOptimisticOrder(null));
  }

  const reorderWithOptimism = useCallback(
    async (newOrder: string[]) => {
      if (!slug) return;
      const prev = optimisticOrder;
      setOptimisticOrder(newOrder);
      try {
        await actions.reorderCampaignsInList(slug, newOrder);
      } catch (err) {
        setOptimisticOrder(prev);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: t('moderation.menu.failedReorder'),
          description: msg,
          variant: 'destructive',
        });
      }
    },
    [slug, actions, optimisticOrder, t],
  );

  const moveTo = useCallback(
    (coord: string, toIndex: number) => {
      const current = displayedCoords;
      const fromIndex = current.indexOf(coord);
      if (fromIndex < 0 || fromIndex === toIndex) return;
      const next = [...current];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, coord);
      void reorderWithOptimism(next);
    },
    [displayedCoords, reorderWithOptimism],
  );

  const handleRemove = useCallback(
    async (coord: string) => {
      if (!slug) return;
      try {
        await actions.removeCampaignFromList(slug, coord);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: t('campaigns.lists.removeFailed'),
          description: msg,
          variant: 'destructive',
        });
      }
    },
    [slug, actions, t],
  );

  const handleEditSubmit = useCallback(
    async (values: { title: string; description?: string; icon: string }) => {
      if (!slug) return;
      await actions.updateListMeta({
        slug,
        title: values.title,
        description: values.description,
        icon: values.icon,
      });
    },
    [slug, actions],
  );

  const handleDeleteConfirm = async () => {
    if (!slug) return;
    try {
      await actions.deleteList(slug);
      setDeleteOpen(false);
      navigate('/campaigns');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: t('campaigns.lists.deleteFailed'),
        description: msg,
        variant: 'destructive',
      });
    }
  };

  useSeoMeta({
    title: list
      ? `${list.title} | ${config.appName}`
      : `${t('campaigns.lists.detailTitle')} | ${config.appName}`,
    description: list?.description,
  });

  if (!slug) return <NotFound />;
  if (isLoading) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </main>
    );
  }
  if (!list) return <NotFound />;

  const visibleCount = displayedCampaigns.length;
  const isLoadingCampaigns = campaignsLoading && coords.length > 0;

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12 space-y-8">
        <header className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/campaigns">
              <ArrowLeft className="size-4 mr-1.5" />
              {t('campaigns.lists.backToCampaigns')}
            </Link>
          </Button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center gap-3">
                <span className="inline-flex size-10 sm:size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <LucideIcon name={list.icon} className="size-5 sm:size-6" />
                </span>
                <span className="break-words">{list.title}</span>
              </h1>
              {list.description && (
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
                  {list.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                {t('campaigns.lists.campaignsCount', { count: visibleCount })}
              </p>
            </div>
            {actions.isMod && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setAddOpen(true)}
                  variant="outline"
                  size="sm"
                >
                  <Plus className="size-4 mr-1.5" />
                  {t('campaigns.lists.addCampaign')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('campaigns.lists.listActions')}>
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                      <Pencil className="size-4 mr-2" />
                      {t('campaigns.lists.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDeleteOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4 mr-2" />
                      {t('campaigns.lists.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </header>

        {isLoadingCampaigns && displayedCampaigns.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: Math.min(4, coords.length) }).map((_, i) => (
              <CampaignCardSkeleton key={i} />
            ))}
          </div>
        ) : displayedCampaigns.length === 0 ? (
          <EmptyState
            isMod={actions.isMod}
            onAddClick={() => setAddOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {displayedCampaigns.map((campaign, idx) => (
              <ListMemberCard
                key={campaign.aTag}
                campaign={campaign}
                index={idx}
                isMod={actions.isMod}
                isMobile={isMobile}
                onDropAt={(coord) => moveTo(coord, idx)}
                onMoveToTop={() => moveTo(campaign.aTag, 0)}
                onMoveUp={() => moveTo(campaign.aTag, Math.max(0, idx - 1))}
                onMoveDown={() => moveTo(campaign.aTag, idx + 1)}
                onRemove={() => handleRemove(campaign.aTag)}
                canMoveUp={idx > 0}
                canMoveDown={idx < displayedCampaigns.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      <ListFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={{
          title: list.title,
          description: list.description,
          icon: list.icon,
        }}
        onSubmit={handleEditSubmit}
      />

      <AddCampaignToListDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        slug={slug}
        existingCoords={coords}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('campaigns.lists.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('campaigns.lists.deleteConfirmDesc', { title: list.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export default CampaignListDetailPage;

function EmptyState({
  isMod,
  onAddClick,
}: {
  isMod: boolean;
  onAddClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-dashed py-12 px-8 text-center space-y-3">
      <p className="text-muted-foreground max-w-sm mx-auto">
        {isMod
          ? t('campaigns.lists.emptyMod')
          : t('campaigns.lists.empty')}
      </p>
      {isMod && (
        <Button onClick={onAddClick} variant="outline" size="sm">
          <Plus className="size-4 mr-1.5" />
          {t('campaigns.lists.addCampaign')}
        </Button>
      )}
    </div>
  );
}

interface ListMemberCardProps {
  campaign: ParsedCampaign;
  index: number;
  isMod: boolean;
  isMobile: boolean;
  onDropAt: (sourceCoord: string) => void;
  onMoveToTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/**
 * Wraps a `CampaignCard` with the moderator-only DnD + kebab overlay
 * for in-list reordering and removal. The DnD MIME type is distinct
 * from the Featured-row MIME so a drag started in the Featured grid
 * can't accidentally drop on a list-member card and vice versa.
 */
function ListMemberCard({
  campaign,
  index,
  isMod,
  isMobile,
  onDropAt,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
}: ListMemberCardProps) {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const { verify } = useCampaignVerifications();

  if (!isMod) {
    return <CampaignCard campaign={campaign} />;
  }

  const desktopDropHandlers = isMobile
    ? {}
    : {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!isOver) setIsOver(true);
        },
        onDragLeave: () => setIsOver(false),
        onDrop: (e: React.DragEvent) => {
          const sourceCoord = e.dataTransfer.getData(DRAG_MIME);
          setIsOver(false);
          if (!sourceCoord || sourceCoord === campaign.aTag) return;
          e.preventDefault();
          onDropAt(sourceCoord);
        },
      };

  const onConfirmVerify = async () => {
    try {
      await verify.mutateAsync({ coord: campaign.aTag });
      toast({ title: t('campaignVerification.verified'), description: campaign.title });
      setVerifyOpen(false);
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
      <div
        className={cn(
          'relative group/list-member motion-safe:transition-shadow',
          isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl shadow-lg',
        )}
        {...desktopDropHandlers}
      >
        {!isMobile && (
          <DragHandle
            coord={campaign.aTag}
            index={index}
            mimeType={DRAG_MIME}
            ariaLabel={t('moderation.menu.dragHandle', { index: index + 1 })}
          />
        )}

        <div className="absolute top-3 right-3 z-20 opacity-0 group-hover/list-member:opacity-100 focus-within:opacity-100 motion-safe:transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('campaigns.lists.memberMenuAria')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMoveToTop()}>
                {t('moderation.menu.moveToTop')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMoveUp()}>
                {t('moderation.menu.moveUp')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMoveDown()}>
                {t('moderation.menu.moveDown')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onRemove()}
                className="text-destructive focus:text-destructive"
              >
                {t('campaigns.lists.removeFromList')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ModerationMenuItems
                coord={campaign.aTag}
                entityTitle={campaign.title}
                surface="campaign"
                axes={['hide']}
                onAddToList={() => setMembershipOpen(true)}
                onRequestVerify={() => setVerifyOpen(true)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CampaignCard campaign={campaign} showModerationMenu={false} />
      </div>
      <CampaignListMembershipDialog
        open={membershipOpen}
        onOpenChange={setMembershipOpen}
        campaignCoord={campaign.aTag}
        campaignTitle={campaign.title}
      />
      <VerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        campaignTitle={campaign.title}
        isPending={verify.isPending}
        onConfirm={onConfirmVerify}
      />
    </>
  );
}

interface DragHandleProps {
  coord: string;
  index: number;
  mimeType: string;
  ariaLabel: string;
}

function DragHandle({ coord, index: _index, mimeType, ariaLabel }: DragHandleProps): ReactNode {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-label={ariaLabel}
      title={ariaLabel}
      onDragStart={(e) => {
        e.dataTransfer.setData(mimeType, coord);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="absolute top-3 left-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur text-muted-foreground opacity-0 group-hover/list-member:opacity-100 focus-visible:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing motion-safe:transition-opacity"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <circle cx="5" cy="3" r="1.4" />
        <circle cx="11" cy="3" r="1.4" />
        <circle cx="5" cy="8" r="1.4" />
        <circle cx="11" cy="8" r="1.4" />
        <circle cx="5" cy="13" r="1.4" />
        <circle cx="11" cy="13" r="1.4" />
      </svg>
    </div>
  );
}
