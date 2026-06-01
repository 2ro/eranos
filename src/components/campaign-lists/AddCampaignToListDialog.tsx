import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAllCampaigns } from '@/hooks/useAllCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useDebounce } from '@/hooks/useDebounce';
import { useCampaignListActions } from '@/hooks/useCampaignListActions';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { ParsedCampaign } from '@/lib/campaign';

interface AddCampaignToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slug of the list the chosen campaign will be added to. */
  slug: string;
  /** Coords already in the list, used to mark existing members and avoid duplicates. */
  existingCoords: readonly string[];
}

/**
 * Modal that lets a moderator search the network of published campaigns
 * and pick one to add to a given list. Multi-pick within a single open
 * session (each click immediately publishes a new revision), since the
 * RMW path is cheap and being able to add several campaigns in a row
 * without reopening the dialog matches the curation workflow.
 *
 * The search query is debounced and runs through {@link useAllCampaigns}.
 * Already-in-list campaigns are shown with a check mark and an
 * "already added" affordance instead of an Add button.
 *
 * Campaigns hidden via {@link useCampaignModeration} are filtered out
 * entirely — a moderator shouldn't be encouraged to surface suppressed
 * content into a curated list. (If a coord is already on the list and
 * later gets hidden, it stays on the list but renders as the
 * `member`-state row so a moderator can still see + remove it.)
 */
export function AddCampaignToListDialog({
  open,
  onOpenChange,
  slug,
  existingCoords,
}: AddCampaignToListDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);

  const { data: campaigns = [], isLoading } = useAllCampaigns({
    sort: 'none',
    search: debounced,
    limit: 50,
    enabled: open,
  });

  const { data: moderation } = useCampaignModeration();

  // Filter out hidden campaigns. Existing list members that are hidden
  // remain in the dialog so the moderator can spot them and unwind the
  // membership — but freshly-searched hidden campaigns are dropped.
  const visibleCampaigns = useMemo<ParsedCampaign[]>(() => {
    const hiddenCoords = moderation?.hiddenCoords ?? new Set<string>();
    if (hiddenCoords.size === 0) return campaigns;
    const existingSet = new Set(existingCoords);
    return campaigns.filter(
      (c) => !hiddenCoords.has(c.aTag) || existingSet.has(c.aTag),
    );
  }, [campaigns, moderation, existingCoords]);

  const { addCampaignToList } = useCampaignListActions();
  const [pendingCoord, setPendingCoord] = useState<string | null>(null);
  // Track coords added within this session so they switch from "Add" to
  // the "already added" affordance immediately, before the moderation
  // query refetches.
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  const existingSet = useMemo(
    () => new Set([...existingCoords, ...justAdded]),
    [existingCoords, justAdded],
  );

  const handleAdd = async (campaign: ParsedCampaign) => {
    const coord = campaign.aTag;
    setPendingCoord(coord);
    try {
      await addCampaignToList(slug, coord);
      setJustAdded((s) => {
        const next = new Set(s);
        next.add(coord);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: t('campaigns.lists.addFailed'),
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setPendingCoord(null);
    }
  };

  // Reset the just-added state on close so reopening starts clean.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setJustAdded(new Set());
      setSearch('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80dvh] rounded-2xl flex flex-col overflow-hidden">
        <DialogTitle>{t('campaigns.lists.addCampaign')}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t('campaigns.lists.addCampaignDesc')}
        </DialogDescription>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('campaigns.lists.searchPlaceholder')}
            aria-label={t('campaigns.lists.searchPlaceholder')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 py-2">
          {isLoading && visibleCampaigns.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : visibleCampaigns.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('campaigns.lists.searchEmpty')}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visibleCampaigns.map((campaign) => {
                const isMember = existingSet.has(campaign.aTag);
                const isPending = pendingCoord === campaign.aTag;
                return (
                  <li
                    key={campaign.aTag}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {campaign.title}
                      </div>
                      {campaign.summary && (
                        <div className="text-xs text-muted-foreground truncate">
                          {campaign.summary}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={isMember ? 'ghost' : 'outline'}
                      size="sm"
                      disabled={isMember || isPending}
                      onClick={() => handleAdd(campaign)}
                      className={cn(isMember && 'text-muted-foreground')}
                    >
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : isMember ? (
                        <>
                          <Check className="size-4 mr-1" />
                          {t('campaigns.lists.alreadyAdded')}
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

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
