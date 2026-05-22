import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Coins, ExternalLink, FileText, Globe, Landmark, Languages, MapPin, Megaphone, MessageCircle, Package, Pause, Play, Repeat2, Share2, User, UserCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';import { ExternalFavicon } from '@/components/ExternalFavicon';
import { ExternalReactionButton } from '@/components/ExternalReactionButton';
import { FollowToggleButton } from '@/components/FollowButton';
import { LinkEmbed } from '@/components/LinkEmbed';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { WikipediaIcon } from '@/components/icons/WikipediaIcon';
import { BlueskyIcon } from '@/components/icons/BlueskyIcon';
import { extractYouTubeId, extractWikipediaTitle, extractBlueskyPost } from '@/lib/linkEmbed';
import { parseExternalUri, formatIsbn } from '@/lib/externalContent';
import { shareOrCopy } from '@/lib/share';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useBlueskyPost } from '@/hooks/useBlueskyPost';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useCountryFollows } from '@/hooks/useCountryFollows';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo, getWikipediaTitle } from '@/lib/countries';
import { CountryFlag } from '@/components/CountryFlag';
import { customFlagAsset, hasCustomFlag } from '@/lib/customFlags';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { useCountryFacts, type CountryFacts } from '@/hooks/useCountryFacts';
import { useCommonsAudio } from '@/hooks/useCommonsAudio';
import { formatNumber } from '@/lib/formatNumber';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Full-size content headers (used on /i/ page)
// ---------------------------------------------------------------------------

export function UrlContentHeader({ url }: { url: string }) {
  const wikiTitle = useMemo(() => extractWikipediaTitle(url), [url]);
  const blueskyPost = useMemo(() => extractBlueskyPost(url), [url]);

  if (wikiTitle) {
    return <WikipediaArticleHeader title={wikiTitle} url={url} />;
  }

  if (blueskyPost) {
    return <BlueskyPostHeader author={blueskyPost.author} rkey={blueskyPost.rkey} url={url} />;
  }

  return <LinkEmbed url={url} showActions={false} />;
}

// ---------------------------------------------------------------------------
// Bluesky post header (full feed-style, like a thread top post)
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function blueskyTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function BlueskyPostHeader({ author, rkey, url }: { author: string; rkey: string; url: string }) {
  const { data: post, isLoading, isError } = useBlueskyPost(author, rkey);
  const { toast } = useToast();

  const profileUrl = `/i/${encodeURIComponent(`https://bsky.app/profile/${post?.handle ?? author}`)}`;
  const externalContent = useMemo(() => parseExternalUri(url), [url]);

  const [shareOpen, setShareOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);

  const handleComment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentOpen(true);
  }, []);

  const handleRepost = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShareOpen(true);
  }, []);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}/i/${encodeURIComponent(url)}`;
    const result = await shareOrCopy(fullUrl);
    if (result === 'copied') {
      toast({ title: 'Link copied' });
    }
  }, [url, toast]);

  if (isLoading) {
    return (
      <div className="py-3">
        <div className="flex gap-3">
          <Skeleton className="size-11 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex gap-6 pt-1">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return <LinkEmbed url={url} showActions={false} />;
  }

  return (
    <>
      <article className="py-1">
        <div className="flex gap-3">
          {/* Avatar */}
          <Link to={profileUrl} className="shrink-0">
            {post.avatar ? (
              <img
                src={post.avatar}
                alt=""
                className="size-11 rounded-full object-cover"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="size-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                {(post.displayName ?? post.handle).charAt(0).toUpperCase()}
              </div>
            )}
          </Link>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {/* Author info */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Link to={profileUrl} className="font-semibold text-[15px] truncate leading-tight hover:underline">
                {post.displayName ?? post.handle}
              </Link>
              <Link to={profileUrl} className="text-muted-foreground text-sm truncate leading-tight hover:underline">
                @{post.handle}
              </Link>
              <span className="text-muted-foreground text-sm shrink-0">&middot;</span>
              <span className="text-muted-foreground text-sm shrink-0">
                {blueskyTimeAgo(post.createdAt)}
              </span>
            </div>

            {/* Post text */}
            {post.text && (
              <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {post.text}
              </p>
            )}

            {/* Image embeds */}
            {post.images && post.images.length > 0 && (
              <div
                className={cn(
                  'mt-3 rounded-xl overflow-hidden border border-border',
                  post.images.length === 1 && 'grid grid-cols-1',
                  post.images.length === 2 && 'grid grid-cols-2 gap-0.5',
                  post.images.length === 3 && 'grid grid-cols-2 gap-0.5',
                  post.images.length >= 4 && 'grid grid-cols-2 gap-0.5',
                )}
              >
                {post.images.slice(0, 4).map((img, i) => (
                  <div
                    key={i}
                    className={cn(
                      'relative overflow-hidden bg-secondary',
                      post.images!.length === 1 ? 'aspect-video' : 'aspect-square',
                      post.images!.length === 3 && i === 0 && 'row-span-2 aspect-auto',
                    )}
                  >
                    <img
                      src={img.thumb}
                      alt={img.alt || ''}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* External link embed */}
            {post.external && post.external.thumb && (
              <div className="mt-3 rounded-xl border border-border overflow-hidden bg-secondary/30">
                <div className="aspect-[2/1] overflow-hidden bg-secondary">
                  <img
                    src={post.external.thumb}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                {post.external.title && (
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{post.external.title}</p>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-3">
              <button
                type="button"
                onClick={handleComment}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10 transition-colors"
                title="Comment"
              >
                <MessageCircle className="size-[18px]" />
                {post.replyCount > 0 ? (
                  <span className="tabular-nums">{formatCount(post.replyCount)}</span>
                ) : (
                  <span className="hidden sm:inline">Comment</span>
                )}
              </button>
              <button
                type="button"
                onClick={handleRepost}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
                title="Share to feed"
              >
                <Repeat2 className="size-[18px]" />
                {post.repostCount > 0 ? (
                  <span className="tabular-nums">{formatCount(post.repostCount)}</span>
                ) : (
                  <span className="hidden sm:inline">Repost</span>
                )}
              </button>
              <ExternalReactionButton content={externalContent} count={post.likeCount} variant="chip" />
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Share link"
              >
                <Share2 className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>

        {/* Bluesky source link */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BlueskyIcon className="size-3.5 text-sky-500" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors hover:underline"
          >
            View on Bluesky
          </a>
          <ExternalLink className="size-3" />
        </div>
      </article>

      {/* Comment compose modal */}
      {commentOpen && (
        <ReplyComposeModal
          open={commentOpen}
          onOpenChange={setCommentOpen}
          event={new URL(url)}
        />
      )}

      {/* Share compose modal */}
      {shareOpen && (
        <ReplyComposeModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          initialContent={url}
          title="Share to feed"
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wikipedia article header (rich display for Wikipedia URLs)
// ---------------------------------------------------------------------------

const WIKI_ARTICLE_MAX_HEIGHT = 160; // px — extract taller than this gets truncated

function WikipediaArticleHeader({ title, url }: { title: string; url: string }) {
  const { data: wiki, isLoading } = useWikipediaSummary(title);

  const contentRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > WIKI_ARTICLE_MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden">
        <Skeleton className="w-full aspect-[16/9]" />
        <div className="p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // Fallback to generic link preview if Wikipedia API returned nothing
  if (!wiki) {
    return <LinkEmbed url={url} showActions={false} />;
  }

  const heroImage = wiki.originalImage?.source ?? wiki.thumbnail?.source;

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Hero image */}
      {heroImage && (
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
          <img
            src={heroImage}
            alt={wiki.title}
            className="w-full max-h-[320px] object-cover"
            loading="eager"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Article content */}
      <div className="p-5 sm:p-6">
        {/* Wikipedia badge */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <WikipediaIcon className="size-3.5 shrink-0" />
          <span>Wikipedia</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-1">
          {wiki.title}
        </h2>

        {/* Description */}
        {wiki.description && (
          <p className="text-sm text-muted-foreground capitalize mb-4">
            {wiki.description}
          </p>
        )}

        {/* Extract with expand/collapse */}
        {wiki.extract && (
          <div className="space-y-2">
            <div className="relative">
              <p
                ref={contentRef}
                style={!expanded && overflows ? { maxHeight: WIKI_ARTICLE_MAX_HEIGHT, overflow: 'hidden' } : undefined}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {wiki.extract}
              </p>
              {!expanded && overflows && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              )}
            </div>
            {overflows && (
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer with Wikipedia link */}
      <div className="border-t border-border px-5 py-2.5">
        <a
          href={wiki.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <WikipediaIcon className="size-3.5" />
          <span>Read on Wikipedia</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

export function BookContentHeader({ isbn }: { isbn: string }) {
  const rawIsbn = isbn.replace('isbn:', '');
  const { data: book, isLoading } = useBookInfo(rawIsbn);
  const displayIsbn = formatIsbn(rawIsbn);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden p-5">
        <div className="flex gap-5">
          <Skeleton className="w-[120px] h-[180px] rounded-lg shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const coverUrl = book?.cover?.large || book?.cover?.medium;
  const authors = book?.authors?.map((a) => a.name).join(', ');
  const publishers = book?.publishers?.map((p) => p.name).join(', ');

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="p-5">
        <div className="flex gap-5">
          {coverUrl ? (
            <div className="shrink-0">
              <img
                src={coverUrl}
                alt={book?.title || 'Book cover'}
                className="w-[120px] sm:w-[140px] rounded-lg shadow-md object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="shrink-0 w-[120px] sm:w-[140px] h-[180px] sm:h-[210px] rounded-lg bg-secondary flex items-center justify-center">
              <BookOpen className="size-10 text-muted-foreground/40" />
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen className="size-3.5 shrink-0" />
              <span>ISBN {displayIsbn}</span>
            </div>

            <h2 className="text-xl font-bold leading-snug line-clamp-3">
              {book?.title || 'Unknown Book'}
            </h2>

            {authors && (
              <p className="text-sm text-muted-foreground">
                by {authors}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
              {book?.publish_date && (
                <span>{book.publish_date}</span>
              )}
              {publishers && (
                <span>{publishers}</span>
              )}
              {book?.number_of_pages && (
                <span>{book.number_of_pages} pages</span>
              )}
            </div>

            {book?.subjects && book.subjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {book.subjects.map((s) => (
                  <span
                    key={s.name}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-secondary text-muted-foreground"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-2.5">
        <a
          href={`https://openlibrary.org/isbn/${rawIsbn}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="size-3.5" />
          <span>View on OpenLibrary</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

const WIKI_MAX_HEIGHT = 100; // px — extract taller than this gets truncated

function WikipediaExtract({ extract, articleUrl }: { extract: string; articleUrl: string }) {
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(el.scrollHeight > WIKI_MAX_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="mt-5 space-y-2">
      <div className="relative">
        <p
          ref={contentRef}
          style={!expanded && overflows ? { maxHeight: WIKI_MAX_HEIGHT, overflow: 'hidden' } : undefined}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {extract}
        </p>
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      <div className="flex items-center gap-3">
        {overflows && (
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        <a
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="size-3.5" />
          <span>Wikipedia</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

// ── Weather, vitals, and anthem ─────────────────────────────────────────────
//
// The country header surfaces three optional signals below the hero photo:
// a one-line weather strip, a one-line vitals row (capital / population /
// languages / currency from Wikidata), and a tiny anthem-play button that
// lives *inside* the hero. Each piece renders nothing when its data is
// missing, so countries with sparse Wikidata coverage degrade gracefully to
// "hero + Wikipedia extract" instead of leaving empty rows behind.

/**
 * Combined weather + vitals row that lives directly below the hero photo.
 *
 * **Left:** current weather (icon + temperature + description) and the
 * country capital — answers "where am I right now and what's it like there"
 * in one glance.
 *
 * **Right:** vitals (population, primary language, currency) — answers
 * "what's the country itself like" in three short tokens.
 *
 * Collapsing the two into one row (instead of stacking them as
 * separate bars) keeps the header from feeling chunky on tall mobile
 * viewports. The flex layout wraps cleanly when there isn't enough
 * horizontal room: vitals fall onto a second line under the weather
 * group rather than getting crushed beside it.
 *
 * Each side renders nothing when its data is missing; the surrounding
 * `<div>` itself unmounts when both sides are empty so the divider
 * above the Wikipedia extract doesn't draw against a phantom row.
 */
function WeatherVitalsRow({ code, facts }: { code: string; facts: CountryFacts | undefined }) {
  // Weather has been removed; this row now renders only the country vitals
  // (population / languages / currency). The legacy name is preserved so
  // the mount call sites don't churn — the row still vanishes when there
  // are no vitals to show, matching the original behavior.
  void code;
  const vitals: { key: string; icon: React.ReactNode; label: string; value: string }[] = [];
  if (facts) {
    if (facts.population !== null) {
      vitals.push({
        key: 'population',
        icon: <Users className="size-3 shrink-0" />,
        label: 'Population',
        value: formatNumber(facts.population),
      });
    }
    if (facts.languages.length > 0) {
      vitals.push({
        key: 'languages',
        icon: <Languages className="size-3 shrink-0" />,
        label: facts.languages.length > 1 ? 'Languages' : 'Language',
        // Cap at two on this line; the rest stays in the tooltip.
        value: facts.languages.slice(0, 2).join(', '),
      });
    }
    if (facts.currencies.length > 0) {
      vitals.push({
        key: 'currency',
        icon: <Coins className="size-3 shrink-0" />,
        label: facts.currencies.length > 1 ? 'Currencies' : 'Currency',
        value: facts.currencies[0],
      });
    }
  }

  if (vitals.length === 0) return null;

  const capital = facts?.capital ?? null;
  const hasCapitalSide = !!capital;

  return (
    <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-sm">
      {/* Left group — capital. */}
      {hasCapitalSide && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
          {capital && (
            <span className="flex items-center gap-1 text-muted-foreground/80 text-xs">
              <Landmark className="size-3 shrink-0" />
              <span>{capital}</span>
            </span>
          )}
        </div>
      )}

      {/* Right group — vitals (population, language, currency). */}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80 min-w-0">
        {vitals.map((item) => (
          <li
            key={item.key}
            className="flex items-center gap-1 min-w-0"
            title={`${item.label}: ${item.value}`}
          >
            {item.icon}
            <span className="truncate max-w-[14ch] sm:max-w-[18ch]">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Tiny circular play button for a country's national anthem. Sits overlaid
 * on the hero photo next to the country name — no surrounding label (the
 * country name is the label), no list-style chrome, just an iconic
 * affordance.
 *
 * Why this is more involved than it looks:
 *
 * 1. **Codec compatibility.** Commons anthems are almost always OGG Vorbis,
 *    which Safari and iOS WKWebView can't decode. We resolve the filename
 *    to a list of Commons derivatives (incl. MP3 transcodes) via
 *    `useCommonsAudio` and render one `<source>` per derivative, MP3 first
 *    so Safari picks it. Without this step the anthem plays in Chrome /
 *    Firefox only and silently fails on Apple devices.
 *
 * 2. **Autoplay gesture.** Browsers only allow `play()` to start if it's
 *    called *synchronously* inside a user gesture. We always mount the
 *    `<audio>` element (with `preload="none"` so no bytes are fetched
 *    upfront) and call `play()` directly from the click handler — not from
 *    an effect after a state update, which loses the gesture token.
 *
 * 3. **Silent failures.** `audio.play()` returns a promise that rejects on
 *    autoplay block / decode error / network failure. We catch the
 *    rejection and surface it via toast so the user gets feedback instead
 *    of a stuck "playing" button with no audio.
 */
function AnthemButton({ filename, title }: { filename: string; title: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const { data: derivatives, isLoading } = useCommonsAudio(filename);
  const { toast } = useToast();

  // Sort MP3 first — Safari / WKWebView can't play Ogg Vorbis but happily
  // decodes audio/mpeg. Chrome and Firefox accept either. The browser
  // picks the first `<source>` whose `type` it claims to support, so the
  // ordering here is the difference between "works on iOS" and "doesn't".
  const sortedDerivatives = useMemo(() => {
    if (!derivatives) return [];
    return [...derivatives].sort((a, b) => {
      const isMp3 = (t: string) => /^audio\/mpeg\b/i.test(t);
      return Number(isMp3(b.type)) - Number(isMp3(a.type));
    });
  }, [derivatives]);

  const hasPlayable = sortedDerivatives.length > 0;

  const toggle = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const el = audioRef.current;
    if (!el || !hasPlayable) return;
    if (el.paused) {
      // play() is async and may reject (autoplay blocked, decode error,
      // network error). Catch the rejection so the failure isn't silent.
      el.play().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Playback failed';
        toast({
          title: 'Could not play anthem',
          description: message,
          variant: 'destructive',
        });
        setPlaying(false);
      });
    } else {
      el.pause();
    }
  }, [hasPlayable, toast]);

  const tooltip = !hasPlayable && !isLoading
    ? 'Anthem unavailable'
    : playing
      ? `Pause anthem${title ? `: ${title}` : ''}`
      : `Play anthem${title ? `: ${title}` : ''}`;

  // While loading derivatives, render a disabled placeholder of the same
  // size so the hero layout doesn't shift when the URLs resolve.
  if (isLoading) {
    return (
      <div
        aria-hidden
        className="inline-flex size-8 rounded-full shrink-0 bg-black/20 border border-white/20 backdrop-blur-sm [text-shadow:none]"
      />
    );
  }

  // No playable derivatives — don't render the button at all rather than
  // leaving a dead affordance on the page.
  if (!hasPlayable) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={tooltip}
        title={tooltip}
        className={cn(
          'inline-flex items-center justify-center size-8 rounded-full shrink-0',
          'bg-black/30 text-white backdrop-blur-sm border border-white/30',
          'hover:bg-black/50 hover:border-white/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
          'transition-colors [text-shadow:none]',
        )}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-[1px]" />}
      </button>
      {/* Always-mounted audio element with no preload — bytes only start
          flowing after the user clicks Play. Multiple <source> tags let
          the browser pick a format it can actually decode. */}
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          toast({
            title: 'Could not load anthem',
            variant: 'destructive',
          });
        }}
        className="sr-only"
      >
        {sortedDerivatives.map((d) => (
          <source key={d.src} src={d.src} type={d.type} />
        ))}
      </audio>
    </>
  );
}

export function CountryContentHeader({ code }: { code: string }) {
  const info = getCountryInfo(code);
  const wikiTitle = getWikipediaTitle(code);
  const { data: wiki, isLoading: wikiLoading } = useWikipediaSummary(wikiTitle);
  // Country facts are only fetched for sovereign countries (alpha-2 codes);
  // the hook's internal guard returns `null` for subdivisions like `US-CA`.
  const { data: facts } = useCountryFacts(info?.subdivision ? null : code);
  const { user } = useCurrentUser();
  const { isFollowingCountry, toggleCountryFollow, isPending } = useCountryFollows();
  const { toast } = useToast();
  const isFollowing = info ? isFollowingCountry(code) : false;

  // Coat of arms image errors silently — Wikidata sometimes points at SVG
  // files that fail to render in WKWebView, or at filenames that have moved.
  // Hide the image rather than show a broken-image icon next to the flag.
  const [coatError, setCoatError] = useState(false);

  const handleToggleFollow = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user || !info || isPending) return;

    try {
      await toggleCountryFollow(code);
      toast({ title: isFollowing ? 'Country unfollowed' : 'Country followed' });
    } catch {
      toast({ title: 'Failed to update country follow', variant: 'destructive' });
    }
  }, [user, info, isPending, toggleCountryFollow, code, toast, isFollowing]);

  if (!info) {
    return (
      <div className="rounded-2xl border border-border p-5 text-center mx-4">
        <MapPin className="size-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-muted-foreground">Unknown country code: {code}</p>
      </div>
    );
  }

  // For codes with a bundled flag asset (Tibet's Snow Lion), drive the
  // hero banner from that SVG instead of Wikipedia's lead image. The
  // Wikipedia article for `Tibet (autonomous region)` typically returns a
  // map or administrative photo, which contradicts the editorial choice
  // to surface Tibet as a country in its own right.
  const heroImage = customFlagAsset(code) ?? wiki?.originalImage?.source ?? wiki?.thumbnail?.source ?? null;
  // Always render the daytime sky overlay. Previously we keyed this off the
  // live `weather.isDay` flag to flip into a night palette; weather has been
  // removed so we default to the warm amber/rose daytime tint.
  const isDay = true;
  // Sky-tint gradient layered above the hero photo. Warm amber/rose during
  // local daytime, deep indigo/violet at night. Same gradient shape, only
  // the colour palette flips — preserves the cinematic curve while the mood
  // follows the destination.
  const skyOverlay = isDay
    ? 'bg-[linear-gradient(to_bottom,rgba(254,202,87,0.18)_0%,rgba(255,107,107,0.12)_30%,rgba(0,0,0,0.65)_70%,hsl(var(--card))_100%)]'
    : 'bg-[linear-gradient(to_bottom,rgba(30,27,75,0.55)_0%,rgba(15,23,42,0.55)_30%,rgba(0,0,0,0.85)_70%,hsl(var(--card))_100%)]';

  // Whether to show the coat of arms inside the hero. Subdivisions get a
  // thumbnail in the flag slot already (from Wikipedia), so we skip the coat
  // of arms there to avoid two images competing for the same spot.
  const showCoatOfArms = !info.subdivision && !!facts?.coatOfArmsUrl && !coatError;

  return (
    // Edge-to-edge container — caller is expected to mount this outside any
    // horizontal padding wrapper so the hero can fill the column. The country
    // hero replaces the page header (it carries its own back arrow + follow
    // button overlaid on the photo), so no negative top margin is needed to
    // tuck under a sibling header band.
    <section className="relative isolate overflow-hidden">
      {/* Hero — Wikipedia photo (or gradient fallback) with day/night sky
          overlay that fades into the page background. Aspect ratio scales
          from a compact 2:1 on phones to a cinematic 21:9 on tablets+. */}
      <div className="relative w-full aspect-[2/1] sm:aspect-[21/9]">
        <div aria-hidden className="absolute inset-0 -z-10">
          {heroImage ? (
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
            />
          ) : (
            // Fallback when Wikipedia has no hero image — a warm flag-toned
            // gradient that still feels destination-y rather than empty.
            <div className={cn('absolute inset-0', isDay
              ? 'bg-gradient-to-br from-amber-400/30 via-rose-400/20 to-primary/10'
              : 'bg-gradient-to-br from-indigo-900/60 via-slate-900/60 to-primary/20')} />
          )}
          {/* Sky-tint + bottom fade. */}
          <div className={cn('absolute inset-0', skyOverlay)} />
        </div>

        {/* Top-left back button overlaid on the photo. Mirrors the
            sibling top-right follow button's white-on-glass style. Hidden
            on wide layouts where the persistent left sidebar already
            provides navigation (matches the original page-header back
            arrow's `sidebar:hidden` rule). */}
        <Link
          to="/"
          aria-label="Back"
          className={cn(
            'sidebar:hidden absolute top-3 left-3 z-10 inline-flex items-center justify-center size-9 rounded-full',
            'bg-black/30 text-white backdrop-blur-sm border border-white/30',
            'hover:bg-black/50 hover:border-white/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            'transition-colors shadow-md',
          )}
        >
          <ArrowLeft className="size-5" />
        </Link>

        {/* Top-right follow button overlaid on the photo. */}
        {user && (
          <div className="absolute top-3 right-3 z-10">
            <FollowToggleButton
              size="sm"
              isFollowing={isFollowing}
              isPending={isPending}
              onClick={handleToggleFollow}
              icon={<UserPlus className="size-4" />}
              followingIcon={
                <>
                  <UserCheck className="size-4 group-hover:hidden group-focus-visible:hidden" />
                  <UserMinus className="size-4 hidden group-hover:inline group-focus-visible:inline" />
                </>
              }
              hoverToUnfollow
              className={cn(
                'shadow-md',
                !isFollowing && 'bg-white text-black hover:bg-white/90',
                isFollowing && 'bg-black/30 backdrop-blur-sm border-white/40 text-white hover:bg-destructive/30 hover:text-white hover:border-destructive/60',
              )}
            />
          </div>
        )}

        {/* Bottom-anchored hero title block. The text-shadow utility keeps
            white text legible against any underlying photo. */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 pt-10 [text-shadow:0_1px_4px_rgba(0,0,0,0.7),0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="flex items-end gap-3">
            {/* Flag + (optional) coat of arms. Subdivisions normally
                show a small Wikipedia thumbnail in the same slot when
                available; entries with a bundled custom flag asset
                (Tibet's Snow Lion) bypass that branch so our editorial
                flag wins. */}
            <div className="flex items-end gap-2 [text-shadow:none] shrink-0">
              {info.subdivision && wiki?.thumbnail && !hasCustomFlag(code) ? (
                <img
                  src={wiki.thumbnail.source}
                  alt={info.subdivisionName ?? info.subdivision}
                  className="size-14 sm:size-16 rounded-md object-cover shadow-lg border border-white/20"
                />
              ) : (
                <CountryFlag
                  code={code}
                  emoji={info.flag}
                  label={`Flag of ${info.subdivisionName ?? info.name}`}
                  className="text-5xl sm:text-6xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                />
              )}
              {showCoatOfArms && (
                <img
                  src={facts!.coatOfArmsUrl!}
                  alt={`Coat of arms of ${info.name}`}
                  className="h-10 sm:h-14 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] -mb-1"
                  loading="lazy"
                  onError={() => setCoatError(true)}
                />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-2xl sm:text-4xl font-bold leading-tight text-white truncate">
                  {info.subdivisionName ?? info.name}
                </h2>
                {facts?.anthemFilename && (
                  <AnthemButton filename={facts.anthemFilename} title={facts.anthemTitle} />
                )}
              </div>
              {info.subdivision && !hasCustomFlag(code) ? (
                <p className="text-sm text-white/85 mt-0.5 truncate">
                  {info.name}{info.subdivisionName ? '' : ` · ${info.subdivision}`}
                </p>
              ) : facts?.officialNames?.[0] && facts.officialNames[0].name !== info.name ? (
                <p
                  className="text-sm text-white/85 mt-0.5 truncate italic"
                  lang={facts.officialNames[0].lang || undefined}
                >
                  {facts.officialNames[0].name}
                </p>
              ) : wiki?.description ? (
                <p className="text-sm text-white/85 mt-0.5 truncate capitalize">{wiki.description}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Below-hero content — optional one-liners. Each renders nothing
          when its data is missing, so the header degrades to just the
          hero + extract for sparsely-documented places. */}
      <div className="divide-y divide-border/40">
        <WeatherVitalsRow code={code} facts={facts ?? undefined} />

        {/* Wikipedia extract — prose, no surrounding card. */}
        {wikiLoading ? (
          <div className="px-4 pb-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : wiki?.extract ? (
          <div className="px-4 pb-1">
            <WikipediaExtract extract={wiki.extract} articleUrl={wiki.articleUrl} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Compact preview (used on nevent detail pages for kind 1111 comments)
// ---------------------------------------------------------------------------

/**
 * Compact preview of external content, shown above a kind 1111 comment
 * on its detail page. Links to the full /i/ page.
 */
export function ExternalContentPreview({ identifier }: { identifier: string }) {
  const content = useMemo(() => parseExternalUri(identifier), [identifier]);
  const link = `/i/${encodeURIComponent(identifier)}`;

  switch (content.type) {
    case 'url':
      return <UrlPreview url={content.value} link={link} />;
    case 'isbn':
      return <BookPreview isbn={content.value} link={link} />;
    case 'iso3166':
      return <CountryPreview code={content.code} link={link} />;
    default:
      return (
        <Link to={link} className="block px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-3">
            <Globe className="size-5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{identifier}</span>
          </div>
        </Link>
      );
  }
}

function UrlPreview({ url, link }: { url: string; link: string }) {
  const youtubeId = useMemo(() => extractYouTubeId(url), [url]);
  const { data, isLoading } = useLinkPreview(url);

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  const title = data?.title;
  const image = data?.thumbnail_url;
  const providerName = data?.provider_name || domain;

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // YouTube gets a thumbnail from the video ID
  const thumbnail = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
    : image;

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="size-12 rounded-lg object-cover shrink-0"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="size-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <ExternalFavicon url={url} size={20} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalFavicon url={url} size={12} className="shrink-0" />
          <span className="truncate">{providerName}</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {title || url}
        </p>
      </div>

      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function BookPreview({ isbn, link }: { isbn: string; link: string }) {
  const rawIsbn = isbn.replace('isbn:', '');
  const { data: book, isLoading } = useBookInfo(rawIsbn);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-12 rounded shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const coverUrl = book?.cover?.medium || book?.cover?.large;
  const authors = book?.authors?.map((a) => a.name).join(', ');

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={book?.title || 'Book cover'}
          className="w-9 h-12 rounded object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
          <BookOpen className="size-4 text-muted-foreground/40" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="size-3 shrink-0" />
          <span>Book</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {book?.title || `ISBN ${rawIsbn}`}
        </p>
        {authors && (
          <p className="text-xs text-muted-foreground truncate">
            by {authors}
          </p>
        )}
      </div>

      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function CountryPreview({ code, link }: { code: string; link: string }) {
  const info = getCountryInfo(code);

  // For ISO 3166-2 codes we treat editorially as countries (Tibet today),
  // prefer the subdivision's own name and let `CountryFlag` swap in the
  // bundled Snow Lion SVG instead of the parent-country emoji.
  const displayName = hasCustomFlag(code)
    ? info?.subdivisionName ?? info?.name ?? code
    : info?.name ?? code;

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      <CountryFlag
        code={code}
        emoji={info?.flag ?? '🌍'}
        label={`Flag of ${displayName}`}
        className="text-2xl shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span>Country</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {displayName}
        </p>
      </div>

      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

/**
 * Compact preview of a profile, shown above a kind 1111 comment
 * on its detail page when the root is a kind 0 profile event.
 * Links to the profile page.
 */
/**
 * Compact preview of a NIP-72 community, shown above a kind 1111 comment
 * on its detail page when the root is a kind 34550 community definition.
 * Links to the community detail page.
 */
export function CommunityPreview({ addr }: { addr: { kind: number; pubkey: string; identifier: string } }) {
  const { data: event, isLoading } = useAddrEvent(addr);

  const communityName = event?.tags.find(([n]) => n === 'name')?.[1]
    || event?.tags.find(([n]) => n === 'd')?.[1]
    || 'Organization';
  const communityImage = event?.tags.find(([n]) => n === 'image')?.[1];
  const communityDescription = event?.tags.find(([n]) => n === 'description')?.[1];
  const moderatorCount = event?.tags.filter(([n, , , role]) => n === 'p' && role === 'moderator').length ?? 0;

  const link = useMemo(() => {
    return `/${nip19.naddrEncode({ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier })}`;
  }, [addr]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {communityImage ? (
        <img
          src={communityImage}
          alt={communityName}
          className="size-12 rounded-lg object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="size-5 text-primary/50" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3 shrink-0" />
          <span>Organization</span>
          {moderatorCount > 0 && (
            <span className="text-muted-foreground/60">&middot; {moderatorCount} mod{moderatorCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {communityName}
        </p>
        {communityDescription && (
          <p className="text-xs text-muted-foreground truncate">
            {communityDescription}
          </p>
        )}
      </div>
    </Link>
  );
}

export function ProfilePreview({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={profileUrl}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      <Avatar className="size-12 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary">
          <User className="size-5" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="size-3 shrink-0" />
          <span>Profile</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {displayName}
        </p>
        {metadata?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">
            {metadata.nip05}
          </p>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Addressable event preview (vines, music, articles, etc.)
// ---------------------------------------------------------------------------

/** Extract a thumbnail URL from an addressable event's tags. */
function extractThumbnail(tags: string[][]): string | undefined {
  // 1. Explicit icon tag (used by zapstore kind 32267)
  const iconTag = tags.find(([n]) => n === 'icon')?.[1];
  if (iconTag) return iconTag;

  // 2. Explicit image/thumb tag
  const imageTag = tags.find(([n]) => n === 'image' || n === 'thumb')?.[1];
  if (imageTag) return imageTag;

  // 3. imeta tag (used by vines / kind 34236)
  const imetaTag = tags.find(([n]) => n === 'imeta');
  if (imetaTag) {
    for (let i = 1; i < imetaTag.length; i++) {
      const part = imetaTag[i];
      if (part.startsWith('image ')) return part.slice(6);
    }
  }

  return undefined;
}

/** Check if an event has video content (imeta with url containing video indicators). */
function hasVideo(tags: string[][]): boolean {
  const imetaTag = tags.find(([n]) => n === 'imeta');
  if (!imetaTag) return false;
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    if (part.startsWith('url ') || part.startsWith('m video/')) return true;
  }
  return false;
}

/** Fallback labels for well-known kinds not in EXTRA_KINDS. */
const WELL_KNOWN_KIND_LABELS: Record<number, string> = {
  9041: 'Goal',
  31990: 'App',
  32267: 'Zapstore App',
  30063: 'Zapstore Release',
  3063: 'Zapstore Asset',
  15128: 'Nsite',
  35128: 'Nsite',
  36639: 'Pledge',
};

export function AddressableEventPreview({ addr }: { addr: { kind: number; pubkey: string; identifier: string } }) {
  const { data: event, isLoading } = useAddrEvent(addr);
  const author = useAuthor(addr.pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name ?? genUserName(addr.pubkey);

  const kindDef = useMemo(
    () => EXTRA_KINDS.find((d) => d.kind === addr.kind || d.subKinds?.some((s) => s.kind === addr.kind)),
    [addr.kind],
  );
  const kindLabel = useMemo(() => {
    if (kindDef) return kindDef.label;
    const sub = EXTRA_KINDS.flatMap((d) => d.subKinds ?? []).find((s) => s.kind === addr.kind);
    if (sub) return sub.label;
    return WELL_KNOWN_KIND_LABELS[addr.kind] ?? `Kind ${addr.kind}`;
  }, [kindDef, addr.kind]);

  const KindIcon = useMemo(() => {
    if (kindDef?.id) return CONTENT_KIND_ICONS[kindDef.id] ?? FileText;
    // Fallback icons for well-known kinds not in EXTRA_KINDS
    if (addr.kind === 31990 || addr.kind === 32267 || addr.kind === 30063 || addr.kind === 3063) return Package;
    if (addr.kind === 15128 || addr.kind === 35128) return Globe;
    if (addr.kind === 36639) return Megaphone;
    return FileText;
  }, [kindDef, addr.kind]);

  const title = event?.tags.find(([n]) => n === 'title')?.[1]
    || event?.tags.find(([n]) => n === 'name')?.[1]
    || event?.tags.find(([n]) => n === 'd')?.[1]
    || kindLabel;
  const thumbnail = event ? extractThumbnail(event.tags) : undefined;
  const isVideo = event ? hasVideo(event.tags) : false;

  const link = useMemo(() => {
    return `/${nip19.naddrEncode({ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier })}`;
  }, [addr]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      {thumbnail ? (
        <div className="relative size-12 rounded-lg overflow-hidden shrink-0">
          <img
            src={thumbnail}
            alt={title}
            className="size-full object-cover"
            loading="lazy"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="size-4 text-white fill-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <KindIcon className="size-5 text-primary/50" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KindIcon className="size-3 shrink-0" />
          <span>{kindLabel}</span>
          <span className="text-muted-foreground/60">&middot;</span>
          <span className="truncate">{authorName}</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {title}
        </p>
      </div>
    </Link>
  );
}
