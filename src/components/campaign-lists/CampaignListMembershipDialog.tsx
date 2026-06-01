import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LucideIcon } from '@/components/LucideIcon';
import { ListFormDialog } from './ListFormDialog';
import { useCampaignLists } from '@/hooks/useCampaignLists';
import { useCampaignListActions } from '@/hooks/useCampaignListActions';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface CampaignListMembershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The campaign's addressable coordinate (`33863:<pubkey>:<d>`). */
  campaignCoord: string;
  /** Visible title for the campaign, used in dialog copy. */
  campaignTitle: string;
}

/**
 * Multi-toggle modal for managing which curated topic lists a single
 * campaign belongs to. Opened from the moderator kebab's "Add to list…"
 * row on `CampaignCard`.
 *
 * Each list renders as a row with the list's icon + title and a single
 * action button — "Add" when the campaign isn't in that list, "Added"
 * when it is. Toggling immediately publishes a new revision of the list
 * event (read-modify-write through `useCampaignListActions`), so a
 * moderator can multi-tag a campaign in one open session without a
 * "save" step.
 *
 * The dialog also exposes a "+ New list" pill that opens the standard
 * `ListFormDialog` create flow — convenient when the moderator wants to
 * coin a list specifically for this campaign.
 *
 * The membership state shown is the union of (a) lists currently
 * containing this campaign per the cached `useCampaignLists` data and
 * (b) any toggles made within this session ("optimistic" set), so the
 * UI reflects the latest write immediately rather than waiting for the
 * relay refetch.
 */
export function CampaignListMembershipDialog({
  open,
  onOpenChange,
  campaignCoord,
  campaignTitle,
}: CampaignListMembershipDialogProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useCampaignLists();
  const actions = useCampaignListActions();

  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  // Per-slug optimistic membership overrides. `true` = this campaign is
  // now in the list, `false` = not in the list. Wins over the
  // authoritative cache until the relay query refetches.
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());
  const [createOpen, setCreateOpen] = useState(false);

  const lists = data?.lists ?? [];

  const isMember = useMemo(() => {
    return (slug: string, coords: readonly string[]): boolean => {
      const override = optimistic.get(slug);
      if (override !== undefined) return override;
      return coords.includes(campaignCoord);
    };
  }, [optimistic, campaignCoord]);

  const handleToggle = async (slug: string, currentlyMember: boolean) => {
    setPendingSlug(slug);
    try {
      if (currentlyMember) {
        await actions.removeCampaignFromList(slug, campaignCoord);
      } else {
        await actions.addCampaignToList(slug, campaignCoord);
      }
      setOptimistic((m) => {
        const next = new Map(m);
        next.set(slug, !currentlyMember);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: currentlyMember
          ? t('campaigns.lists.removeFailed')
          : t('campaigns.lists.addFailed'),
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setPendingSlug(null);
    }
  };

  const handleCreate = async (values: {
    title: string;
    description?: string;
    icon: string;
  }) => {
    // Create the list, then immediately add this campaign to it.
    const { slug } = await actions.createList(values);
    try {
      await actions.addCampaignToList(slug, campaignCoord);
      setOptimistic((m) => {
        const next = new Map(m);
        next.set(slug, true);
        return next;
      });
    } catch (err) {
      // Surface but keep the list around — the moderator can retry the
      // toggle from the row that will appear once the refetch lands.
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: t('campaigns.lists.addFailed'),
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setOptimistic(new Map());
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md max-h-[80dvh] rounded-2xl flex flex-col overflow-hidden">
          <DialogTitle>{t('campaigns.lists.membershipTitle')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('campaigns.lists.membershipDesc', { title: campaignTitle })}
          </DialogDescription>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 py-2">
            {isLoading && lists.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : lists.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('campaigns.lists.membershipEmpty')}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {lists.map((list) => {
                  const member = isMember(list.slug, list.coords);
                  const pending = pendingSlug === list.slug;
                  return (
                    <li
                      key={list.aTag}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                        <LucideIcon name={list.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {list.title}
                        </div>
                        {list.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {list.description}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={member ? 'secondary' : 'outline'}
                        size="sm"
                        disabled={pending}
                        onClick={() => handleToggle(list.slug, member)}
                        className={cn('min-w-[88px] justify-center')}
                      >
                        {pending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : member ? (
                          <>
                            <Check className="size-4 mr-1" />
                            {t('campaigns.lists.added')}
                          </>
                        ) : (
                          t('campaigns.lists.addToList')
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex justify-between items-center gap-2 pt-2 border-t -mx-6 px-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4 mr-1.5" />
              {t('campaigns.lists.create')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ListFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSubmit={handleCreate}
      />
    </>
  );
}
