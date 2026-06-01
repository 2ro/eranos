import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpToLine,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from '@/components/LucideIcon';
import { ListFormDialog } from './ListFormDialog';
import { useCampaignLists } from '@/hooks/useCampaignLists';
import { useCampaignListActions } from '@/hooks/useCampaignListActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { toast } from '@/hooks/useToast';
import type { ParsedCampaignList } from '@/lib/campaignLists';
import { cn } from '@/lib/utils';

const DRAG_MIME = 'text/x-agora-campaign-list-coord';

/**
 * Horizontal scrollable strip of moderator-curated campaign list pills.
 *
 * **Layout.** A `flex` row that overflows horizontally — pills size to
 * their own content (icon + label) and the row scrolls sideways on
 * narrow viewports. Moderators get a trailing "+" pill that opens the
 * Create List dialog, and a kebab on every pill exposing Edit, Delete,
 * Move up, Move down, Move to start.
 *
 * **Moderator DnD.** Pills are draggable on desktop via the same
 * native-HTML5 / non-library pattern used by `ReorderableCampaignGrid`.
 * A drop on another pill calls `reorderLists` with the new full-strip
 * order. Optimistic local ordering smooths the gap between the publish
 * and the moderation refetch.
 *
 * **Mobile.** Drag is disabled (touch DnD without a library is
 * unreliable). Reorder happens via the kebab actions instead. Same
 * publish path, different trigger — matching the existing Featured row
 * precedent.
 */
export function CampaignListsStrip() {
  const { t } = useTranslation();
  const { data, isLoading } = useCampaignLists();
  const actions = useCampaignListActions();
  const isMobile = useIsMobile();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ParsedCampaignList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ParsedCampaignList | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<readonly string[] | null>(null);

  const lists = useMemo(() => data?.lists ?? [], [data]);
  const authoritativeCoords = useMemo(() => lists.map((l) => l.aTag), [lists]);

  // Optimistic order overrides authoritative until the latter catches
  // up — same pattern as `ReorderableCampaignGrid`.
  const displayed = useMemo<ParsedCampaignList[]>(() => {
    if (!optimisticOrder) return lists;
    const byCoord = new Map(lists.map((l) => [l.aTag, l]));
    const out: ParsedCampaignList[] = [];
    for (const coord of optimisticOrder) {
      const found = byCoord.get(coord);
      if (found) out.push(found);
    }
    if (out.length !== optimisticOrder.length) return lists;
    return out;
  }, [optimisticOrder, lists]);

  if (
    optimisticOrder &&
    authoritativeCoords.length === optimisticOrder.length &&
    authoritativeCoords.every((c, i) => c === optimisticOrder[i])
  ) {
    queueMicrotask(() => setOptimisticOrder(null));
  }

  const handleReorder = useCallback(
    async (newOrder: string[]) => {
      const prev = optimisticOrder;
      setOptimisticOrder(newOrder);
      try {
        await actions.reorderLists(newOrder);
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
    [optimisticOrder, actions, t],
  );

  const moveTo = useCallback(
    (coord: string, toIndex: number) => {
      const current = displayed.map((l) => l.aTag);
      const fromIndex = current.indexOf(coord);
      if (fromIndex < 0 || fromIndex === toIndex) return;
      const next = [...current];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, coord);
      void handleReorder(next);
    },
    [displayed, handleReorder],
  );

  const handleCreate = useCallback(
    async (values: { title: string; description?: string; icon: string }) => {
      await actions.createList(values);
    },
    [actions],
  );

  const handleEditSubmit = useCallback(
    async (values: { title: string; description?: string; icon: string }) => {
      if (!editTarget) return;
      await actions.updateListMeta({
        slug: editTarget.slug,
        title: values.title,
        description: values.description,
        icon: values.icon,
      });
    },
    [actions, editTarget],
  );

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await actions.deleteList(deleteTarget.slug);
      setDeleteTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: t('campaigns.lists.deleteFailed'),
        description: msg,
        variant: 'destructive',
      });
    }
  };

  // Loading skeleton: a few placeholder pills so the strip doesn't pop in.
  if (isLoading && lists.length === 0) {
    return (
      <section className="space-y-3" aria-label={t('campaigns.lists.stripAria')}>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-full shrink-0" />
          ))}
        </div>
      </section>
    );
  }

  // No lists and non-mod viewer: render nothing rather than an empty row.
  if (!isLoading && lists.length === 0 && !actions.isMod) {
    return null;
  }

  return (
    <>
      <section
        className="space-y-3"
        aria-label={t('campaigns.lists.stripAria')}
      >
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin]">
          {displayed.map((list, idx) => (
            <ListPill
              key={list.aTag}
              list={list}
              index={idx}
              isMod={actions.isMod}
              isMobile={isMobile}
              onDropAt={(coord) => moveTo(coord, idx)}
              onEdit={() => setEditTarget(list)}
              onDelete={() => setDeleteTarget(list)}
              onMoveUp={() => moveTo(list.aTag, Math.max(0, idx - 1))}
              onMoveDown={() => moveTo(list.aTag, idx + 1)}
              onMoveToStart={() => moveTo(list.aTag, 0)}
              canMoveUp={idx > 0}
              canMoveDown={idx < displayed.length - 1}
            />
          ))}
          {actions.isMod && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-dashed px-3.5 py-2 text-sm whitespace-nowrap shrink-0',
                'border-border bg-background hover:border-primary/60 hover:bg-primary/5 text-muted-foreground hover:text-foreground',
                'motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              <span>{t('campaigns.lists.create')}</span>
            </button>
          )}
        </div>
      </section>

      <ListFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSubmit={handleCreate}
      />

      {editTarget && (
        <ListFormDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          mode="edit"
          initial={{
            title: editTarget.title,
            description: editTarget.description,
            icon: editTarget.icon,
          }}
          onSubmit={handleEditSubmit}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('campaigns.lists.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('campaigns.lists.deleteConfirmDesc', {
                title: deleteTarget?.title ?? '',
              })}
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
    </>
  );
}

interface ListPillProps {
  list: ParsedCampaignList;
  index: number;
  isMod: boolean;
  isMobile: boolean;
  onDropAt: (coord: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToStart: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function ListPill({
  list,
  index,
  isMod,
  isMobile,
  onDropAt,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onMoveToStart,
  canMoveUp,
  canMoveDown,
}: ListPillProps) {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);

  // Visible label + icon — same shape for mods and non-mods.
  const content: ReactNode = (
    <>
      <LucideIcon name={list.icon} className="size-4 shrink-0 text-primary" />
      <span className="whitespace-nowrap">{list.title}</span>
    </>
  );

  // Non-moderators: just a link pill.
  if (!isMod) {
    return (
      <Link
        to={`/campaigns/lists/${list.slug}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm shrink-0',
          'bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground',
          'motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        {content}
      </Link>
    );
  }

  // Moderator pill: drop target on desktop, kebab menu on both.
  const dropHandlers = isMobile
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
          if (!sourceCoord || sourceCoord === list.aTag) return;
          e.preventDefault();
          onDropAt(sourceCoord);
        },
      };

  return (
    <div
      className={cn(
        'relative inline-flex items-stretch shrink-0 rounded-full motion-safe:transition-shadow',
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md',
      )}
      {...dropHandlers}
    >
      {!isMobile && (
        <span
          role="button"
          tabIndex={-1}
          draggable
          aria-label={t('moderation.menu.dragHandle', { index: index + 1 })}
          title={t('moderation.menu.dragHandle', { index: index + 1 })}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_MIME, list.aTag);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex items-center pl-2 pr-1 rounded-l-full bg-background border border-r-0 border-border text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        >
          <DragHandleIcon />
        </span>
      )}
      <Link
        to={`/campaigns/lists/${list.slug}`}
        className={cn(
          'inline-flex items-center gap-1.5 border border-border px-3.5 py-2 text-sm',
          'bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground',
          'motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isMobile ? 'rounded-l-full' : '',
        )}
      >
        {content}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('campaigns.lists.menuAria', { title: list.title })}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center px-2 rounded-r-full bg-background border border-l-0 border-border text-muted-foreground hover:text-foreground hover:bg-primary/5 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <MoreVertical className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit()}>
            <Pencil className="size-4 mr-2" />
            {t('campaigns.lists.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMoveUp}
            onSelect={() => onMoveToStart()}
          >
            <ArrowUpToLine className="size-4 mr-2" />
            {t('moderation.menu.moveToTop')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMoveUp()}>
            {t('moderation.menu.moveUp')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMoveDown}
            onSelect={() => onMoveDown()}
          >
            {t('moderation.menu.moveDown')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onDelete()}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4 mr-2" />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Six-dot drag handle. Inline SVG to avoid an extra lucide import. */
function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="5" cy="3" r="1.4" />
      <circle cx="11" cy="3" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="13" r="1.4" />
      <circle cx="11" cy="13" r="1.4" />
    </svg>
  );
}
