import { Check, ChevronDown, Globe, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FeedMode } from '@/hooks/useMixedFeed';
import { cn } from '@/lib/utils';

interface FeedModeOption {
  mode: FeedMode;
  /** Translation key suffix under `feed.modeSwitcher`. */
  i18nKey: 'agora' | 'allNostr' | 'following';
}

const OPTIONS: FeedModeOption[] = [
  { mode: 'agora', i18nKey: 'agora' },
  { mode: 'all-nostr', i18nKey: 'allNostr' },
  { mode: 'following', i18nKey: 'following' },
];

function FeedModeIcon({ mode, className }: { mode: FeedMode; className?: string }) {
  if (mode === 'agora') {
    return (
      <span
        className={cn(
          "inline-block shrink-0 bg-current [mask-image:url('/logo.svg')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]",
          className,
        )}
        aria-hidden
      />
    );
  }

  const Icon = mode === 'following' ? Users : Globe;
  return <Icon className={cn('shrink-0', className)} aria-hidden />;
}

interface FeedModeSwitcherProps {
  value: FeedMode;
  onChange: (mode: FeedMode) => void;
  /** When false, Following mode is disabled (requires login). */
  followingAvailable: boolean;
  /** Click handler for the disabled Following item (typically opens the auth dialog). */
  onLoginRequested?: () => void;
  className?: string;
}

/**
 * The primary feed-mode picker rendered at the top-left of the home feed page.
 *
 * Visually anchored as the page heading — the active mode label is the largest
 * text on the page. Clicking opens a compact dropdown menu offering the three
 * modes; the active one is marked with a check.
 *
 * Logged-out users see "Following" greyed out; clicking it invokes
 * {@link FeedModeSwitcherProps.onLoginRequested} to surface the auth dialog.
 */
export function FeedModeSwitcher({
  value,
  onChange,
  followingAvailable,
  onLoginRequested,
  className,
}: FeedModeSwitcherProps) {
  const { t } = useTranslation();
  const active = OPTIONS.find((opt) => opt.mode === value) ?? OPTIONS[0];
  const activeLabel = t(`feed.modeSwitcher.${active.i18nKey}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'group inline-flex items-center gap-2 rounded-lg -ml-1 px-1 py-1 outline-none',
          'text-foreground hover:text-foreground motion-safe:transition-colors',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
        aria-label={t('feed.modeSwitcher.ariaLabel', { label: activeLabel })}
      >
        <FeedModeIcon
          mode={active.mode}
          className={cn('size-6 sm:size-7', active.mode === 'agora' ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className={cn(
          'text-2xl sm:text-3xl font-bold tracking-tight leading-none',
          active.mode === 'agora' && 'text-primary',
        )}>
          {activeLabel}
        </span>
        <ChevronDown
          className="size-5 text-muted-foreground motion-safe:transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-56 p-1.5">
        {OPTIONS.map((opt) => {
          const label = t(`feed.modeSwitcher.${opt.i18nKey}`);
          const isActive = opt.mode === value;
          const isFollowing = opt.mode === 'following';
          const disabled = isFollowing && !followingAvailable;

          const handleSelect = (event: Event) => {
            if (disabled) {
              event.preventDefault();
              onLoginRequested?.();
              return;
            }
            onChange(opt.mode);
          };

          const itemContent = (
            <DropdownMenuItem
              key={opt.mode}
              onSelect={handleSelect}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer',
                disabled && 'opacity-60 data-[disabled]:opacity-60',
              )}
              data-disabled={disabled || undefined}
            >
              <FeedModeIcon
                mode={opt.mode}
                className={cn('size-4', opt.mode === 'agora' ? 'text-primary' : 'text-muted-foreground')}
              />
              <span className={cn('flex-1 text-sm font-medium', opt.mode === 'agora' && 'text-primary')}>{label}</span>
              {isActive && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
            </DropdownMenuItem>
          );

          if (disabled) {
            return (
              <Tooltip key={opt.mode}>
                <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
                <TooltipContent side="right">
                  {t('feed.modeSwitcher.loginRequired')}
                </TooltipContent>
              </Tooltip>
            );
          }
          return itemContent;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
