import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useToast } from '@/hooks/useToast';
import { impactMedium } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface FollowButtonProps {
  /** The pubkey of the user to follow/unfollow. */
  pubkey: string;
  /** Optional class name overrides. */
  className?: string;
  /** Button size variant. Defaults to "sm". */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

interface FollowToggleButtonProps {
  /** Whether the target is currently followed. */
  isFollowing: boolean;
  /** Whether a follow/unfollow mutation is pending. */
  isPending?: boolean;
  /** Called when the button is clicked. */
  onClick: (event: React.MouseEvent) => void;
  /** Optional class name overrides. */
  className?: string;
  /** Button size variant. Defaults to "sm". */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Disable the button. */
  disabled?: boolean;
  /** Optional leading icon shown before the label. */
  icon?: React.ReactNode;
  /** Optional leading icon shown when the target is followed (overrides `icon`). */
  followingIcon?: React.ReactNode;
  /**
   * If true, the followed state shows "Following" by default and swaps to
   * "Unfollow" on hover/focus (Twitter-style). When false (default), the
   * followed state shows "Unfollow" directly.
   */
  hoverToUnfollow?: boolean;
}

export function FollowToggleButton({
  isFollowing,
  isPending = false,
  onClick,
  className,
  size = 'sm',
  disabled = false,
  icon,
  followingIcon,
  hoverToUnfollow = false,
}: FollowToggleButtonProps) {
  const { t } = useTranslation();
  const leadingIcon = isFollowing ? (followingIcon ?? icon) : icon;
  const followedLabel = (
    isPending
      ? '...'
      : isFollowing
        ? hoverToUnfollow
          // Two spans crossfade on hover/focus via group state — keeps button width stable.
          ? (
              <>
                <span className="group-hover:hidden group-focus-visible:hidden">{t('follow.following')}</span>
                <span className="hidden group-hover:inline group-focus-visible:inline">{t('follow.unfollow')}</span>
              </>
            )
          : t('follow.unfollow')
        : t('follow.follow')
  );

  return (
    <Button
      type="button"
      size={size}
      variant={isFollowing ? 'outline' : 'default'}
      className={cn(
        'group rounded-full font-bold gap-1.5',
        isFollowing && 'bg-transparent border border-border text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50',
        className,
      )}
      onClick={onClick}
      disabled={disabled || isPending}
    >
      {!isPending && leadingIcon}
      {followedLabel}
    </Button>
  );
}

/**
 * Reusable follow / unfollow button.
 *
 * Hides itself when the target is the logged-in user or when no user is logged in.
 */
export function FollowButton({ pubkey, className, size = 'sm' }: FollowButtonProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { isPending, follow, unfollow } = useFollowActions();
  const { toast } = useToast();

  const isFollowing = useMemo(() => {
    if (!followData?.pubkeys) return false;
    return followData.pubkeys.includes(pubkey);
  }, [pubkey, followData]);

  const handleToggleFollow = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    try {
      if (isFollowing) {
        await unfollow(pubkey);
        impactMedium();
        toast({ title: t('follow.unfollowed') });
      } else {
        await follow(pubkey);
        impactMedium();
        toast({ title: t('follow.followed') });
      }
    } catch (err) {
      console.error('Follow toggle failed:', err);
      toast({ title: t('follow.updateFailed'), variant: 'destructive' });
    }
  }, [user, pubkey, isFollowing, follow, unfollow, toast, t]);

  // Don't render for own profile or when logged out
  if (!user || user.pubkey === pubkey) return null;

  return (
    <FollowToggleButton
      size={size}
      isFollowing={isFollowing}
      isPending={isPending}
      className={className}
      onClick={handleToggleFollow}
    />
  );
}
