import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * "Hidden" status pill, rendered on cards (and any other surface) where
 * a moderator has suppressed an entity from public discovery. Visually
 * unified across campaigns, pledges, and organizations — same colors,
 * same icon, same copy — so the cue is instantly recognizable wherever
 * it appears.
 *
 * Two size variants:
 *  - `default` — full-sized chip used on big cards (CampaignCard).
 *  - `compact` — slim chip for overlay corners on smaller cards
 *    (ActionCard, CommunityMiniCard).
 */
export function HiddenBadge({
  size = 'default',
  className,
}: {
  size?: 'default' | 'compact';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="secondary"
      className={cn(
        'backdrop-blur bg-destructive/15 text-destructive border-destructive/30',
        size === 'compact' && 'h-6 px-1.5 text-[10px]',
        className,
      )}
    >
      <EyeOff className={cn('mr-1', size === 'compact' ? 'size-3' : 'size-3.5')} />
      {t('moderation.hiddenBadge')}
    </Badge>
  );
}
