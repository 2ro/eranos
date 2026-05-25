import { Trans } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Unified author display used by every card and detail page that
 * surfaces the human behind an event. Standardizes:
 *
 *  - Avatar component (shadcn `Avatar` + initials fallback).
 *  - Display-name resolution via `getDisplayName` (display_name → name → "Anonymous").
 *  - Link target via `useProfileUrl` (nip05 path when verified, npub otherwise).
 *  - i18n: the "by {name}" label uses the shared `common.byAuthor`
 *    key so every surface ships the same translated string in every
 *    locale.
 *  - Click semantics inside a card: when `insideLink` is true the
 *    byline renders as a `<button>` that calls `navigate()` and stops
 *    propagation, so an outer `<Link>` keeps wrapping the whole card
 *    without nesting `<a>` inside `<a>` (invalid HTML, React Router
 *    warns).
 *
 * Two visual variants:
 *
 *  - `card` (default): muted text, 20px avatar, sized for the
 *    bottom row of a feed card.
 *  - `hero`: white text with drop-shadow, 32px avatar with a soft
 *    ring; for use on top of dark scrims in detail-page heroes.
 */
interface AuthorBylineProps {
  pubkey: string;
  /** Visual variant. `card` is the small inline footer style; `hero` is large white-on-dark. */
  variant?: 'card' | 'hero';
  /**
   * True when this byline is rendered inside another `<Link>` (cards
   * wrap themselves in one). Renders the byline as a `<button>` that
   * navigates and stops propagation, avoiding nested anchors.
   */
  insideLink?: boolean;
  className?: string;
}

export function AuthorByline({
  pubkey,
  variant = 'card',
  insideLink = false,
  className,
}: AuthorBylineProps) {
  const navigate = useNavigate();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const picture = sanitizeUrl(metadata?.picture);
  const initials = displayName.slice(0, 2).toUpperCase();

  const isHero = variant === 'hero';

  const wrapperClass = cn(
    'inline-flex items-center gap-2 min-w-0 text-left group/byline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full',
    'motion-safe:transition-colors',
    isHero
      ? 'text-white/90 hover:text-white text-sm sm:text-base gap-2.5'
      : 'text-xs text-muted-foreground hover:text-foreground',
    className,
  );

  const avatarClass = cn(
    isHero ? 'size-8 sm:size-9 ring-2 ring-white/30 shrink-0' : 'size-5 shrink-0',
  );

  const fallbackClass = cn(
    'text-[10px]',
    isHero ? 'bg-white/15 text-white text-xs' : 'bg-secondary text-secondary-foreground',
  );

  const labelClass = cn(
    'truncate min-w-0',
    isHero && '[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]',
  );

  const nameClass = cn(
    isHero
      ? 'font-semibold underline-offset-4 group-hover/byline:underline'
      : 'font-medium text-foreground',
  );

  const inner = (
    <>
      <Avatar className={avatarClass}>
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback className={fallbackClass}>{initials}</AvatarFallback>
      </Avatar>
      <span className={labelClass}>
        <Trans
          i18nKey="common.byAuthor"
          values={{ name: displayName }}
          components={{ 0: <span className={nameClass} /> }}
        />
      </span>
    </>
  );

  if (insideLink) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigate(profileUrl);
        }}
        className={wrapperClass}
        aria-label={displayName}
      >
        {inner}
      </button>
    );
  }

  return (
    <a
      href={profileUrl}
      onClick={(e) => {
        // Use SPA navigation; preserve modifier-clicks for new tabs.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        navigate(profileUrl);
      }}
      className={wrapperClass}
      aria-label={displayName}
    >
      {inner}
    </a>
  );
}

