import { Shield, ShieldOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMembersOnlyFilter } from '@/hooks/useMembersOnlyFilter';
import { cn } from '@/lib/utils';

interface MembersOnlyToggleProps {
  /** Additional classes for the trigger button. */
  className?: string;
}

/**
 * Shield-icon toggle that controls the "members only" filter for community
 * surfaces. When active (default), community feeds only show content authored
 * by chain-validated members — matching the NIP's canonical-author
 * recommendation. When inactive, the feed shows every event scoped to the
 * community regardless of author.
 *
 * The preference is persisted in localStorage via `useMembersOnlyFilter` and
 * is global across community surfaces (Activities feed, per-community
 * Comments tab, etc.).
 */
export function MembersOnlyToggle({ className }: MembersOnlyToggleProps) {
  const { membersOnly, toggle } = useMembersOnlyFilter();

  const label = membersOnly ? 'Showing members only' : 'Showing everyone';
  const hint = membersOnly
    ? 'Click to show posts from anyone scoped to this community.'
    : 'Click to limit posts to validated community members.';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={membersOnly}
            aria-label={label}
            className={cn(
              'p-2 rounded-full transition-colors',
              membersOnly
                ? 'text-primary hover:bg-primary/10'
                : 'text-muted-foreground hover:bg-secondary',
              className,
            )}
          >
            {membersOnly
              ? <Shield className="size-5" />
              : <ShieldOff className="size-5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-center">
          <p className="text-xs font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
