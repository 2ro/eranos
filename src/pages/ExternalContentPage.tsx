import { useCallback, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Activity, ArrowLeft, BarChart3, Globe, MessageCircle, MessageSquare, MoreHorizontal, Repeat2, Star, AlertTriangle, PanelLeft, Trash2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FlatThreadedReplyList } from '@/components/ThreadedReplyList';
import { FeedCard } from '@/components/FeedCard';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ExternalReactionButton } from '@/components/ExternalReactionButton';
import { BookReviewFormDialog } from '@/components/BookReviewForm';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import {
  UrlContentHeader,
  BookContentHeader,
  CountryContentHeader,
} from '@/components/ExternalContentHeader';
import { parseExternalUri, headerLabel, seoTitle, type ExternalContent } from '@/lib/externalContent';
import { ratingToStars } from '@/lib/bookstr';
import { formatNumber } from '@/lib/formatNumber';
import { useAppContext } from '@/hooks/useAppContext';
import { useComments } from '@/hooks/useComments';
import { usePaginatedFeed } from '@/hooks/usePaginatedFeed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePinnedPosts } from '@/hooks/usePinnedPosts';
import { CountryFeedProvider } from '@/components/CountryFeedProvider';
import { CountryStatsDialog } from '@/components/world/CountryStatsDialog';
import { Pin } from 'lucide-react';
import { NoteCard } from '@/components/NoteCard';
import { useBookReviews } from '@/hooks/useBookReviews';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { useWikidataEntity } from '@/hooks/useWikidataEntity';
import { useScryfallCard } from '@/hooks/useScryfallCard';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/getDisplayName';
import { timeAgo } from '@/lib/timeAgo';
import { extractWikipediaTitle, extractWikidataId, extractGathererCard } from '@/lib/linkEmbed';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';
import type { BookReview } from '@/lib/bookstr';
import NotFound from './NotFound';

// ---------------------------------------------------------------------------
// Action bar component for external content (comment + react + share)
// ---------------------------------------------------------------------------

interface ExternalActionBarProps {
  content: ExternalContent;
  /** Opens the comment composer. */
  onComment: () => void;
  /** Number of top-level comments on this content, for the comment button badge. */
  commentCount: number;
}

function ExternalActionBar({ content, onComment, commentCount }: ExternalActionBarProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const identifier = content.value;
  const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();

  const isInSidebar = orderedItems.includes(identifier);

  // Country pages get a "View stats" item in the 3-dots menu (the kind-30385
  // snapshot is country-scoped, so it's not meaningful for URL / ISBN / unknown
  // content types). The dialog is controlled from local state and mounted at
  // the bottom of the bar so the dropdown can dismiss without unmounting it
  // mid-animation.
  const countryCode = content.type === 'iso3166' ? content.code : null;
  const showDashboardLink = countryCode?.toUpperCase() === 'VE';
  const [statsOpen, setStatsOpen] = useState(false);

  const handleAddToSidebar = useCallback(() => {
    addToSidebar(identifier);
    toast({ title: 'Added to sidebar' });
  }, [identifier, addToSidebar, toast]);

  const handleRemoveFromSidebar = useCallback(() => {
    removeFromSidebar(identifier);
    toast({ title: 'Removed from sidebar' });
  }, [identifier, removeFromSidebar, toast]);

  // Share compose modal state
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
      {/* Comment button — opens the compose modal, same as the FAB */}
      <button
        className="flex items-center gap-1.5 p-2 rounded-full transition-colors text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10"
        title="Comment"
        onClick={onComment}
      >
        <MessageCircle className="size-5" />
        {commentCount > 0 && <span className="text-sm tabular-nums">{formatNumber(commentCount)}</span>}
      </button>

      {/* Reaction button */}
      <ExternalReactionButton content={content} />

      {/* Share button — opens compose modal pre-filled with the URL */}
      <button
        className="flex items-center gap-1.5 p-2 rounded-full transition-colors text-muted-foreground hover:text-accent hover:bg-accent/10"
        title="Share to feed"
        onClick={() => setShareOpen(true)}
      >
        <Repeat2 className="size-5" />
      </button>

      {/* Write Review button — only for ISBN content */}
      {content.type === 'isbn' && user && (
        <BookReviewFormDialog isbn={content.value.replace('isbn:', '')}>
          <button
            className="flex items-center gap-1.5 p-2 rounded-full transition-colors text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
            title="Write a review"
          >
            <Star className="size-5" />
          </button>
        </BookReviewFormDialog>
      )}

      {/* Spacer pushes the 3-dots menu to the right */}
      <div className="flex-1" />

      {/* 3-dots menu with sidebar action */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-2 rounded-full transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="More"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {showDashboardLink && (
            <DropdownMenuItem asChild>
              <Link to="/dashboard" className="gap-3">
                <Activity className="size-4" />
                View Dashboard
              </Link>
            </DropdownMenuItem>
          )}
          {countryCode && (
            <DropdownMenuItem onClick={() => setStatsOpen(true)} className="gap-3">
              <BarChart3 className="size-4" />
              View stats
            </DropdownMenuItem>
          )}
          {isInSidebar ? (
            <DropdownMenuItem onClick={handleRemoveFromSidebar} className="gap-3">
              <Trash2 className="size-4" />
              Remove from sidebar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleAddToSidebar} className="gap-3">
              <PanelLeft className="size-4" />
              Add to sidebar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {shareOpen && (
        <ReplyComposeModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          initialContent={identifier}
          title="Share to feed"
        />
      )}

      {countryCode && (
        <CountryStatsDialog
          countryCode={countryCode}
          open={statsOpen}
          onOpenChange={setStatsOpen}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ExternalContentPage() {
  const { config } = useAppContext();
  const { '*': rawUri } = useParams();
  const location = useLocation();

  // Support both encoded URLs (/i/https%3A%2F%2F...) and bare URLs (/i/https://...?q=x).
  // For bare URLs the browser splits the target's query string into location.search,
  // so we reattach it. For encoded URLs we decode the whole thing.
  const uri = useMemo(() => {
    if (!rawUri) return '';
    // If the wildcard param looks already encoded (no "://" present), decode it.
    if (!rawUri.includes('://')) {
      try { return decodeURIComponent(rawUri); } catch { return rawUri; }
    }
    // Otherwise it's a bare URL — reattach any query string the browser separated out.
    return rawUri + location.search;
  }, [rawUri, location.search]);

  const content = useMemo(() => {
    if (!uri) return null;
    return parseExternalUri(uri);
  }, [uri]);

  // Fetch link preview for URL content to get the actual page title.
  const linkPreviewUrl = content?.type === 'url' ? content.value : null;
  const { data: linkPreview } = useLinkPreview(linkPreviewUrl);

  // For Wikipedia URLs, use the Wikipedia API for accurate titles.
  // For Wikidata URLs, resolve the entity's English Wikipedia sitelink and fall through
  // to the Wikipedia branch so the page title and back-link behave identically.
  const directWikiTitle = useMemo(() => linkPreviewUrl ? extractWikipediaTitle(linkPreviewUrl) : null, [linkPreviewUrl]);
  const wikidataId = useMemo(() => linkPreviewUrl ? extractWikidataId(linkPreviewUrl) : null, [linkPreviewUrl]);
  const { data: wikidataEntity } = useWikidataEntity(directWikiTitle ? null : wikidataId);
  const wikiTitle = directWikiTitle ?? wikidataEntity?.wikipediaTitle ?? null;
  const { data: wikiSummary } = useWikipediaSummary(wikiTitle);

  // For Gatherer URLs, look up the card on Scryfall for its real name. The
  // same query is made (and cached) by GathererCardHeader, so this adds no
  // extra network traffic.
  const gathererCard = useMemo(() => linkPreviewUrl ? extractGathererCard(linkPreviewUrl) : null, [linkPreviewUrl]);
  const scryfallLookup = useMemo(() => {
    if (!gathererCard) return null;
    return gathererCard.kind === 'multiverse'
      ? { kind: 'multiverse' as const, multiverseId: gathererCard.multiverseId }
      : { kind: 'set' as const, set: gathererCard.set, number: gathererCard.number, lang: gathererCard.lang };
  }, [gathererCard]);
  const { data: scryfallCard } = useScryfallCard(scryfallLookup);

  const resolvedTitle = wikiSummary?.title ?? scryfallCard?.name ?? linkPreview?.title;

  const pageTitle = resolvedTitle ?? (content ? headerLabel(content) : 'External Content');

  useSeoMeta({ title: content ? (resolvedTitle ? `${resolvedTitle} | ${config.appName}` : seoTitle(content, config.appName)) : `External Content | ${config.appName}` });

  // Build the NIP-73 identifier for comments. NIP-73 identifiers with schemes
  // (isbn:, iso3166:, etc.) are URL objects so NIP-22 writes the
  // protocol into the k/K tag instead of treating them as hashtags.
  const commentRootUrl = useMemo((): URL | undefined => {
    if (!content || content.type !== 'url') return undefined;
    try { return new URL(content.value); } catch { return undefined; }
  }, [content]);

  const commentRootId = useMemo((): URL | `#${string}` | undefined => {
    if (!content || content.type === 'url') return undefined;
    if (content.value.startsWith('#')) return content.value as `#${string}`;
    try { return new URL(content.value); } catch { return content.value as `#${string}`; }
  }, [content]);

  const commentRoot: URL | `#${string}` | undefined = commentRootUrl ?? commentRootId;

  const { muteItems } = useMuteList();

  // Country pages route through usePaginatedFeed (legacy `geo:` fallback +
  // cursor pagination + diversity cap); all other external content (URL,
  // ISBN, unknown) keeps the existing threaded useComments path.
  const isCountry = content?.type === 'iso3166';
  const countryCode = isCountry ? content.code : null;

  const { data: commentsData, isLoading: commentsLoading } = useComments(
    isCountry ? undefined : commentRoot,
    500,
  );

  const {
    data: feedPages,
    isLoading: feedLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePaginatedFeed({
    countryCode: isCountry && countryCode ? countryCode : undefined,
  });

  const { scrollRef } = useInfiniteScroll({
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount: feedPages?.pages.length,
    enabled: isCountry,
  });

  // Country-feed pinned posts (admin/organizer-curated). Fetched only on
  // country pages; the hook is a no-op when countryCode is undefined.
  const { pinnedPosts, isLoading: pinnedLoading } = usePinnedPosts(
    isCountry && countryCode ? countryCode : undefined,
  );
  const pinnedIds = useMemo(
    () => new Set(pinnedPosts.map((p) => p.id)),
    [pinnedPosts],
  );
  const filteredPinnedPosts = useMemo(
    () =>
      muteItems.length > 0
        ? pinnedPosts.filter((e) => !isEventMuted(e, muteItems))
        : pinnedPosts,
    [pinnedPosts, muteItems],
  );

  // Build a reply tree: direct replies each paired with their first sub-reply.
  const orderedReplies = useMemo(() => {
    if (isCountry) {
      // Country feed: flat list of top-level posts ordered newest-first
      // (already sorted by usePaginatedFeed). Pinned posts are surfaced in a
      // dedicated section above, so we drop them from the regular feed list
      // to avoid duplication. No sub-reply previews.
      const events = (feedPages?.pages ?? []).flatMap((page) => page.events);
      const filtered = events.filter((e) => {
        if (pinnedIds.has(e.id)) return false;
        if (muteItems.length > 0 && isEventMuted(e, muteItems)) return false;
        return true;
      });
      return filtered.map((reply) => ({
        reply,
        firstSubReply: undefined as import('@nostrify/nostrify').NostrEvent | undefined,
      }));
    }

    const topLevel = commentsData?.topLevelComments ?? [];
    const filteredTopLevel = muteItems.length > 0
      ? topLevel.filter((r) => !isEventMuted(r, muteItems))
      : topLevel;

    // Other external content types are threaded conversations (oldest-first)
    const sorted = [...filteredTopLevel].sort((a, b) => a.created_at - b.created_at);

    return sorted.map((reply) => {
      const directReplies = commentsData?.getDirectReplies(reply.id) ?? [];
      return {
        reply,
        firstSubReply: directReplies[0] as import('@nostrify/nostrify').NostrEvent | undefined,
      };
    });
  }, [isCountry, feedPages, commentsData, muteItems, pinnedIds]);

  const repliesLoading = isCountry ? feedLoading : commentsLoading;

  // FAB opens the comment compose dialog
  const [composeOpen, setComposeOpen] = useState(false);
  const openCompose = useCallback(() => setComposeOpen(true), []);

  if (!content || !uri) {
    return <NotFound />;
  }

  return (
    <main className="w-full max-w-3xl mx-auto">
      {/* Non-sticky transparent header — skipped on country pages because
          the country hero carries its own back arrow overlaid on the
          photo, which lets the cinematic banner reach all the way to the
          top of the column instead of sitting under a redundant title
          bar. */}
      {!isCountry && (
        <div className="flex items-center gap-4 px-4 pt-4 pb-5">
          <Link
            to={content.type === 'isbn' ? '/books' : '/'}
            className={cn(
              'p-2 rounded-full hover:bg-secondary transition-colors',
              content.type !== 'isbn' && 'sidebar:hidden',
            )}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold truncate">{pageTitle}</h1>
        </div>
      )}

      {/* Content-specific header wrapper. Skipped on country pages because
          the country hero is edge-to-edge — an empty `px-4 pb-4` wrapper
          above it would leave a dead band of padding between the top of
          the column and the start of the hero photo. */}
      {!isCountry && (
        <div className="px-4 space-y-6 pb-4">
          {content.type === 'url' && <UrlContentHeader url={content.value} />}
          {content.type === 'isbn' && <BookContentHeader isbn={content.value} />}
          {content.type === 'unknown' && (
            <div className="rounded-2xl border border-border p-5 text-center">
              <Globe className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground break-all">{content.value}</p>
            </div>
          )}
        </div>
      )}

      {/* React / share action bar — for non-country pages. Country
          pages render their own action bar inside the FeedCard below. */}
      {!isCountry && (
        <ExternalActionBar
          content={content}
          onComment={openCompose}
          commentCount={orderedReplies.length}
        />
      )}

      {/* Comment compose dialog (opened via FAB or the Comment button) */}
      {commentRoot && !isCountry && (
        <ReplyComposeModal event={commentRoot} open={composeOpen} onOpenChange={setComposeOpen} />
      )}

      {/* Country pages: the entire surface — cinematic hero, action
          bar, compose box, pinned posts, recent posts — lives in one
          rounded FeedCard so the page reads as a single GoFundMe-style
          card instead of an edge-to-edge Twitter timeline stacked under
          a hero image. The hero's edge-to-edge bleed becomes
          edge-to-card-edge, and the action bar / compose box / feeds
          all share the same surface. */}
      {isCountry && content.type === 'iso3166' && (
        <FeedCard className="mt-4">
          <CountryContentHeader code={content.code} />

          {/* React / share action bar — sits flush with the card edges
              inside the FeedCard's overflow-hidden clip. */}
          <ExternalActionBar
            content={content}
            onComment={openCompose}
            commentCount={orderedReplies.length}
          />

          {/* Comment compose dialog (opened via FAB or the Comment button) */}
          {commentRoot && <ReplyComposeModal event={commentRoot} open={composeOpen} onOpenChange={setComposeOpen} />}

          {countryCode && (
            <CountryFeedProvider countryCode={countryCode}>
              {/* Inline compose box — hideBorder so the bottom seam
                  comes from the next section's own border or heading
                  instead of doubling up. Override default
                  `bg-background/85` with `bg-transparent` so the
                  composer reads as part of the card surface. */}
              <ComposeBox compact replyTo={commentRoot} hideBorder className="bg-transparent" />

              {/* Pinned posts (curated by country organizers/admins). */}
              {(pinnedLoading || filteredPinnedPosts.length > 0) && (
                <div>
                  <div className="px-4 sm:px-6 pt-4 pb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">
                    <Pin className="size-3.5" />
                    <span>Pinned</span>
                  </div>
                  {pinnedLoading ? (
                    <div className="divide-y divide-border">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="flex gap-3">
                            <Skeleton className="size-10 rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-3 w-28" />
                              </div>
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      {filteredPinnedPosts.map((post) => (
                        <NoteCard key={post.id} event={post} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recent posts list */}
              {repliesLoading ? (
                <div>
                  <div className="px-4 sm:px-6 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">
                    Recent
                  </div>
                  <div className="divide-y divide-border">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="px-4 py-3">
                        <div className="flex gap-3">
                          <Skeleton className="size-10 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-20" />
                              <Skeleton className="h-3 w-28" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : orderedReplies.length > 0 ? (
                <>
                  {filteredPinnedPosts.length > 0 && (
                    <div className="px-4 sm:px-6 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">
                      Recent
                    </div>
                  )}
                  <FlatThreadedReplyList replies={orderedReplies} />
                </>
              ) : filteredPinnedPosts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm border-t border-border">
                  <MessageSquare className="size-12 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">No comments yet</p>
                  <p>Be the first to share your thoughts about this!</p>
                </div>
              ) : null}
            </CountryFeedProvider>
          )}
        </FeedCard>
      )}

      {hasNextPage && isCountry && (
        <div ref={scrollRef} className="py-6 text-center text-xs text-muted-foreground">
          {isFetchingNextPage ? 'Loading more…' : ''}
        </div>
      )}

      {/* ISBN pages get a tabbed interface with Comments + Reviews.
          Country pages are handled above (whole-page FeedCard).
          URL / unknown content types render a simple compose + threaded
          comments column. */}
      {content.type === 'isbn' ? (
        <BookContentTabs
          isbn={content.value.replace('isbn:', '')}
          commentRoot={commentRoot}
          orderedReplies={orderedReplies}
          commentsLoading={repliesLoading}
        />
      ) : !isCountry ? (
        <>
          {/* Inline compose box */}
          <ComposeBox compact replyTo={commentRoot} />

          {/* Threaded comments list (URL/unknown content types) */}
          <div>
            {repliesLoading ? (
              <CommentsSkeleton />
            ) : orderedReplies.length > 0 ? (
              <FeedCard className="mt-2">
                <FlatThreadedReplyList replies={orderedReplies} />
              </FeedCard>
            ) : (
              <CommentsEmptyState />
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Props shared by the comments section (both standalone and inside a tab). */
interface ExternalCommentsSectionProps {
  commentRoot: URL | `#${string}` | undefined;
  orderedReplies: Array<{ reply: NostrEvent; firstSubReply?: NostrEvent }>;
  commentsLoading: boolean;
}

/** Inline compose box + threaded replies list (or loading/empty state). */
function ExternalCommentsSection({ commentRoot, orderedReplies, commentsLoading }: ExternalCommentsSectionProps) {
  return (
    <>
      {commentRoot && <ComposeBox compact replyTo={commentRoot} />}
      <div>
        {commentsLoading ? (
          <CommentsSkeleton />
        ) : orderedReplies.length > 0 ? (
          <FeedCard className="mt-2">
            <FlatThreadedReplyList replies={orderedReplies} />
          </FeedCard>
        ) : (
          <CommentsEmptyState />
        )}
      </div>
    </>
  );
}

function CommentsSkeleton() {
  return (
    <FeedCard className="mt-2 divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex gap-3">
            <Skeleton className="size-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </FeedCard>
  );
}

function CommentsEmptyState() {
  return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      <MessageSquare className="size-12 mx-auto mb-4" />
      <p className="text-lg font-medium mb-2">No comments yet</p>
      <p>Be the first to share your thoughts about this!</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book Content Tabs (Comments + Reviews)
// ---------------------------------------------------------------------------

interface BookContentTabsProps {
  isbn: string;
  commentRoot: URL | `#${string}` | undefined;
  orderedReplies: Array<{ reply: NostrEvent; firstSubReply?: NostrEvent }>;
  commentsLoading: boolean;
}

type BookTab = 'comments' | 'reviews';

function BookContentTabs({ isbn, commentRoot, orderedReplies, commentsLoading }: BookContentTabsProps) {
  const { user } = useCurrentUser();
  const { data: reviews = [], isLoading: reviewsLoading } = useBookReviews(isbn);
  const [activeTab, setActiveTab] = useState<BookTab>('comments');

  const commentCount = orderedReplies.length;
  const reviewCount = reviews.length;

  return (
    <>
      <SubHeaderBar>
        <TabButton
          label={`Comments${commentCount > 0 ? ` (${commentCount})` : ''}`}
          active={activeTab === 'comments'}
          onClick={() => setActiveTab('comments')}
        />
        <TabButton
          label={`Reviews${reviewCount > 0 ? ` (${reviewCount})` : ''}`}
          active={activeTab === 'reviews'}
          onClick={() => setActiveTab('reviews')}
        />
      </SubHeaderBar>

      {activeTab === 'comments' ? (
        <ExternalCommentsSection
          commentRoot={commentRoot}
          orderedReplies={orderedReplies}
          commentsLoading={commentsLoading}
        />
      ) : (
        <>
          {/* Write review CTA */}
          {user && (
            <div className="px-4 py-3 border-b border-border">
              <BookReviewFormDialog isbn={isbn}>
                <Button variant="outline" className="w-full">
                  <Star className="size-4 mr-2" />
                  Write a Review
                </Button>
              </BookReviewFormDialog>
            </div>
          )}

          {/* Reviews list */}
          {reviewsLoading ? (
            <CommentsSkeleton />
          ) : reviews.length > 0 ? (
            <FeedCard className="mt-2 divide-y divide-border">
              {reviews.map(({ event, review }) => (
                <BookReviewCard key={event.id} event={event} review={review} />
              ))}
            </FeedCard>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Star className="size-12 mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">No reviews yet</p>
              <p>Be the first to review this book!</p>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Book Review Card (shown in Reviews tab)
// ---------------------------------------------------------------------------

function BookReviewCard({ event, review }: { event: NostrEvent; review: BookReview }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const [showSpoiler, setShowSpoiler] = useState(false);

  const starCount = review.rating !== undefined ? ratingToStars(review.rating) : 0;
  const hasSpoiler = !!review.contentWarning;

  return (
    <div className="px-4 py-3">
      <div className="flex gap-3">
        {/* Avatar */}
        {author.isLoading ? (
          <Skeleton className="size-10 rounded-full shrink-0" />
        ) : (
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="shrink-0">
              <Avatar className="size-10">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
        )}

        <div className="min-w-0 flex-1">
          {/* Author and time */}
          <div className="flex items-start justify-between">
            <div>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link to={profileUrl} className="font-semibold text-sm hover:underline">
                  {displayName}
                </Link>
              </ProfileHoverCard>
              <p className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</p>
            </div>

            {/* Star rating */}
            {review.rating !== undefined && (
              <div className="flex items-center gap-1 shrink-0">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'size-3.5',
                      i < starCount
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground/30',
                    )}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {(review.rating * 5).toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Content with spoiler guard */}
          {hasSpoiler && !showSpoiler ? (
            <div className="mt-2 py-3 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-orange-600">
                <AlertTriangle className="size-4" />
                <span className="text-sm font-medium">Spoiler Warning</span>
              </div>
              <p className="text-xs text-muted-foreground">{review.contentWarning}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSpoiler(true)}
              >
                Show Review
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              {hasSpoiler && (
                <Badge variant="outline" className="text-orange-600 border-orange-200 dark:border-orange-800 mb-2">
                  <AlertTriangle className="size-3 mr-1" />
                  Contains Spoilers
                </Badge>
              )}
              {review.content ? (
                <p className="text-sm whitespace-pre-wrap break-words">{review.content}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Rating only, no written review</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
