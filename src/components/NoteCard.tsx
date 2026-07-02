import type { NostrEvent } from "@nostrify/nostrify";
import {
  Award,
  Camera,
  FileCode,
  FileText,
  GitBranch,
  GitPullRequest,
  HandHeart,
  Mail,
  Megaphone,
  MessageCircle,
  Rocket,
  MoreHorizontal,
  Package,
  Play,
  Radio,
  Share2,
  SmilePlus,
  PartyPopper,
  Users,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { type ReactNode, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
/** Lazy-loaded markdown-heavy components — keeps react-markdown + unified pipeline out of the main feed bundle. */
const ArticleContent = lazy(() => import("@/components/ArticleContent").then(m => ({ default: m.ArticleContent })));
import {
  MusicPlaylistContent,
  MusicTrackContent,
  PodcastEpisodeContent,
  PodcastTrailerContent,
} from "@/components/AudioKindContent";
import { CampaignInlinePreview, GroupInlinePreview, PledgeInlinePreview } from "@/components/AgoraInlinePreview";
import { BadgeAwardCard } from "@/components/BadgeAwardCard";
import { BadgeContent } from "@/components/BadgeContent";
import { CalendarEventContent } from "@/components/CalendarEventContent";
import { ColorMomentContent } from "@/components/ColorMomentContent";
import { CommentContext, CountryCommentPill } from "@/components/CommentContext";
import { CommunityContentWarning } from "@/components/CommunityContentWarning";
import { ContentWarningGuard } from "@/components/ContentWarningGuard";
import { EmojifiedText, ReactionEmoji } from "@/components/CustomEmoji";
const CustomNipCard = lazy(() => import("@/components/CustomNipCard").then(m => ({ default: m.CustomNipCard })));
import { EmojiPackContent } from "@/components/EmojiPackContent";
import { FileMetadataContent } from "@/components/FileMetadataContent";
import { PeopleListContent } from "@/components/PeopleListContent";
import { FoundLogContent } from "@/components/FoundLogContent";
import { GeocacheContent } from "@/components/GeocacheContent";
import { GitRepoCard } from "@/components/GitRepoCard";
import { GoalCard } from "@/components/GoalCard";
import { NsiteCard } from "@/components/NsiteCard";
import { ImageGallery } from "@/components/ImageGallery";
import { CardsIcon } from "@/components/icons/CardsIcon";
import { ChestIcon } from "@/components/icons/ChestIcon";
import { RepostIcon } from "@/components/icons/RepostIcon";
import { LiveStreamPlayer } from "@/components/LiveStreamPlayer";
import { MagicDeckContent } from "@/components/MagicDeckContent";
import { NoteContent } from "@/components/NoteContent";
import { NoteMoreMenu } from "@/components/NoteMoreMenu";
import { PatchCard } from "@/components/PatchCard";
import { PollContent } from "@/components/PollContent";
import { ProfileBadgesContent } from "@/components/ProfileBadgesContent";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileHoverCard } from "@/components/ProfileHoverCard";
const PullRequestCard = lazy(() => import("@/components/PullRequestCard").then(m => ({ default: m.PullRequestCard })));
import { ReactionButton } from "@/components/ReactionButton";
import { ReplyComposeModal } from "@/components/ReplyComposeModal";
import { ReplyContext } from "@/components/ReplyContext";
import { RepostMenu } from "@/components/RepostMenu";
import { EncryptedMessageContent } from "@/components/EncryptedMessageContent";
import { EncryptedLetterContent } from "@/components/EncryptedLetterContent";
import { VanishCardCompact } from "@/components/VanishEventContent";
import { ZapstoreAppContent } from "@/components/ZapstoreAppContent";
import { ZapstoreReleaseContent, ZapstoreAssetContent } from "@/components/ZapstoreReleaseContent";
import { AppHandlerContent } from "@/components/AppHandlerContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VoiceMessagePlayer } from "@/components/VoiceMessagePlayer";
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthor } from "@/hooks/useAuthor";
import { useOpenPost } from "@/hooks/useOpenPost";
import { useProfileUrl } from "@/hooks/useProfileUrl";
import { useShareOrigin } from "@/hooks/useShareOrigin";
import { toast } from "@/hooks/useToast";
import { useEventStats } from "@/hooks/useTrending";
import { useEventTranslation } from "@/hooks/useEventTranslation";
import { getContentWarning } from "@/lib/contentWarning";
import { genUserName } from "@/lib/genUserName";
import { getDisplayName } from "@/lib/getDisplayName";
import { usePollVoteLabel } from "@/hooks/usePollVoteLabel";
import { getParentEventHints, isReplyEvent } from "@/lib/nostrEvents";
import { isSingleImagePost } from "@/lib/noteContent";
import { shareOrCopy } from "@/lib/share";
import { impactLight } from "@/lib/haptics";
import { timeAgo } from "@/lib/timeAgo";
import { formatNumber } from "@/lib/formatNumber";
import { publishedAtAction } from "@/lib/publishedAtAction";
import { getEffectiveStreamStatus } from "@/lib/streamStatus";
import { getEventRelaySource } from "@/lib/relayDebug";
import { cn } from "@/lib/utils";


/** Profile card for use in feeds (kind 0). */
function ProfileCardContent({ event }: { event: NostrEvent }) {
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(event.content); } catch { /* ignore */ }
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <ProfileCard pubkey={event.pubkey} metadata={metadata} showNip05={false} />
    </div>
  );
}

/* ──── Shared activity card shell for reaction / repost / poll vote ──── */

interface ActivityCardProps {
  /** The round element in the left column (icon bubble or avatar). */
  icon: ReactNode;
  /** The actor row content (avatar + name + label + timestamp). */
  actorRow: ReactNode;
  /** Optional extra content below the actor row (vote label, etc.). */
  children?: ReactNode;
  /** Threaded mode: connector line below icon, no bottom border. */
  threaded?: boolean;
  /** Last item in thread — no connector line, has bottom border. */
  threadedLast?: boolean;
  /** Custom connector line class. */
  threadedLineClassName?: string;
  className?: string;
  onClick?: React.MouseEventHandler;
  onAuxClick?: React.MouseEventHandler;
}

export function ActivityCard({
  icon,
  actorRow,
  children,
  threaded,
  threadedLast,
  threadedLineClassName,
  className,
  onClick,
  onAuxClick,
}: ActivityCardProps) {
  const isThreaded = threaded || threadedLast;
  return (
    <article
      className={cn(
        "px-4 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
        isThreaded
          ? cn("pt-3", threaded ? "pb-0" : "pb-3 border-b border-border")
          : "py-3 border-b border-border",
        className,
      )}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          {icon}
          {threaded && (
            <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
          )}
        </div>
        <div className={cn("flex-1 min-w-0", isThreaded ? "min-h-10 flex flex-col justify-center" : "", threaded && "pb-3")}>
          {actorRow}
          {children}
        </div>
      </div>
    </article>
  );
}

/** Reusable actor row: small avatar + display name + action label + timestamp. */
interface ActorRowProps {
  pubkey: string;
  profileUrl: string;
  picture?: string;
  displayName: string;
  authorEvent?: NostrEvent;
  isLoading?: boolean;
  label: string;
  /** Extra inline elements after the label. */
  extra?: ReactNode;
  /** Formatted timestamp string (e.g. timeAgo or full date). */
  timestampLabel: string;
}

function ActorRow({ pubkey, profileUrl, picture, displayName, authorEvent, isLoading, label, extra, timestampLabel }: ActorRowProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full shrink-0" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-6">
            <AvatarImage src={picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[8px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
      </ProfileHoverCard>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link to={profileUrl} className="font-semibold text-sm hover:underline truncate" onClick={(e) => e.stopPropagation()}>
          {authorEvent ? <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText> : displayName}
        </Link>
      </ProfileHoverCard>
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {extra}
      <span className="text-xs text-muted-foreground ml-auto shrink-0">{timestampLabel}</span>
    </div>
  );
}

interface NoteCardProps {
  event: NostrEvent;
  className?: string;
  /** If set, shows a "Reposted by" header with this pubkey. */
  repostedBy?: string;
  /** If true, hide action buttons (used for embeds). */
  compact?: boolean;
  /** If true, render in threaded ancestor style: connector line below avatar, no bottom border. */
  threaded?: boolean;
  /** Custom class for the threaded connector line (overrides the default color). */
  threadedLineClassName?: string;
  /** Like threaded but without the connector line — used for the last item in a thread (e.g. sub-reply hint). */
  threadedLast?: boolean;
  /** If true, briefly highlight this card (e.g. newly loaded post). */
  highlight?: boolean;
  /** If true, suppress the kind-derived action header (e.g. "created a badge"). Used when the parent already provides context. */
  hideKindHeader?: boolean;
  /** Override the NIP-22 context row prefix. Used by synthetic activity cards. */
  commentContextPrefix?: string;
  /**
   * Suppress the NIP-22 "Commenting on …" context row. Used by pages
   * that already establish the comment's subject from page chrome
   * (e.g. the campaign detail page renders comments below the
   * campaign hero — the "Commenting on …" line is redundant there).
   */
  hideCommentContext?: boolean;
  /**
   * Custom badge rendered inside the author row, next to the display
   * name. Used for page-specific role markers (e.g. a "Campaigner"
   * badge on the campaign detail page). Keep it short — a single
   * pill-style span is the expected shape.
   */
  authorBadge?: ReactNode;
  /** Event used for actions/navigation when the displayed card is synthetic. */
  actionEvent?: NostrEvent;
}

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse single imeta tag into structured object (legacy, for kind 34236 vines). */
function parseImeta(tags: string[][]): { url?: string; thumbnail?: string } {
  const imetaTag = tags.find(([name]) => name === "imeta");
  if (!imetaTag) return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    const spaceIdx = part.indexOf(" ");
    if (spaceIdx === -1) continue;
    const key = part.slice(0, spaceIdx);
    const value = part.slice(spaceIdx + 1);
    if (key === "url") result.url = value;
    else if (key === "image") result.thumbnail = value;
  }
  return result;
}

/** Encodes the NIP-19 identifier for navigating to an event. */
function encodeEventId(event: NostrEvent): string {
  // Addressable events (30000-39999) use naddr with their d-tag
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = getTag(event.tags, "d");
    if (dTag) {
      return nip19.naddrEncode({
        kind: event.kind,
        pubkey: event.pubkey,
        identifier: dTag,
      });
    }
  }
  // Replaceable events (10000-19999) use naddr with an empty identifier
  if (event.kind >= 10000 && event.kind < 20000) {
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: "",
    });
  }
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

/** d-tags reserved by NIP-51 for other purposes — hide these kind 30000 events. */
const DEPRECATED_DTAGS = new Set(["mute", "pin", "bookmark", "communities"]);

/** Returns true if a kind 30000 event is a deprecated/junk list that should be hidden. */
function isDeprecatedFollowSet(event: NostrEvent): boolean {
  if (event.kind !== 30000) return false;
  const dTag = event.tags.find(([n]) => n === "d")?.[1] ?? "";
  if (DEPRECATED_DTAGS.has(dTag)) return true;
  // Filter empty lists with no p-tags or title
  const hasPTags = event.tags.some(([n]) => n === "p");
  const hasTitle = event.tags.some(([n]) => n === "title" || n === "name");
  if (!hasPTags && !hasTitle) return true;
  return false;
}

export const NoteCard = memo(function NoteCard({
  event,
  className,
  repostedBy,
  compact,
  threaded,
  threadedLineClassName,
  threadedLast,
  highlight,
  hideKindHeader,
  commentContextPrefix,
  hideCommentContext,
  authorBadge,
  actionEvent,
}: NoteCardProps) {
  const { t } = useTranslation();
  const actionTarget = actionEvent ?? event;
  const { config } = useAppContext();
  const shareOrigin = useShareOrigin();
  const author = useAuthor(event.pubkey);

  const pollVoteLabel = usePollVoteLabel(event);

  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const encodedId = useMemo(() => encodeEventId(actionTarget), [actionTarget]);
  const { data: stats } = useEventStats(actionTarget.id, actionTarget);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  useEffect(() => {
    console.debug('[nostr note render]', {
      relay: getEventRelaySource(event.id) ?? 'unknown',
      kind: event.kind,
      id: event.id,
      actionRelay: actionEvent ? getEventRelaySource(actionEvent.id) ?? 'unknown' : undefined,
      actionKind: actionEvent?.kind,
      actionId: actionEvent?.id,
      path: window.location.pathname,
    });
  }, [event.id, event.kind, actionEvent]);

  const { onClick: openPost, onAuxClick: auxOpenPost } = useOpenPost(
    `/${encodedId}`,
  );

  // Handler to navigate to post detail, but only if click didn't originate from a modal
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[role="dialog"]') ||
      target.closest("[data-radix-dialog-overlay]") ||
      target.closest("[data-radix-dialog-content]") ||
      target.closest("[data-vaul-drawer]") ||
      target.closest("[data-vaul-drawer-overlay]") ||
      target.closest("button") ||
      target.closest("a")
    ) {
      return;
    }
    openPost();
  };

  const handleAuxClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[role="dialog"]') ||
      target.closest("[data-radix-dialog-overlay]") ||
      target.closest("[data-radix-dialog-content]") ||
      target.closest("[data-vaul-drawer]") ||
      target.closest("[data-vaul-drawer-overlay]") ||
      target.closest("button") ||
      target.closest("a")
    ) {
      return;
    }
    auxOpenPost(e);
  };

  const isVine = event.kind === 34236;
  const isPoll = event.kind === 1068;
  const isGeocache = event.kind === 37516;
  const isFoundLog = event.kind === 7516;
  const isColor = event.kind === 3367;
  const isFollowPack = event.kind === 3 || event.kind === 39089 || event.kind === 30000;
  const isArticle = event.kind === 30023;
  const isMagicDeck = event.kind === 37381;
  const isStream = event.kind === 30311;
  const isFileMetadata = event.kind === 1063;
  const isVoiceMessage = event.kind === 1222 || event.kind === 1244;
  const isCalendarEvent = event.kind === 31922 || event.kind === 31923;
  const isEmojiPack = event.kind === 30030;
  const isBadgeDefinition = event.kind === 30009;
  const isProfileBadges = event.kind === 10008 || event.kind === 30008;
  const isBadgeAward = event.kind === 8;
  const isBadge = isBadgeDefinition || isProfileBadges || isBadgeAward;
  const isCommunity = event.kind === 34550;
  const isGoal = event.kind === 9041;
  const isAction = event.kind === 36639;
  const isCampaign = event.kind === 33863;
  const isReaction = event.kind === 7;
  const isPollVote = event.kind === 1018;
  const isRepost = event.kind === 6 || event.kind === 16;
  const isPhoto = event.kind === 20;
  const isNormalVideo = event.kind === 21;
  const isShortVideo = event.kind === 22;
  const isVideo = isNormalVideo || isShortVideo;
  const isMusicTrack = event.kind === 36787;
  const isMusicPlaylist = event.kind === 34139;
  const isPodcastEpisode = event.kind === 30054;
  const isPodcastTrailer = event.kind === 30055;
  const isAudioKind =
    isMusicTrack || isMusicPlaylist || isPodcastEpisode || isPodcastTrailer;
  const isGitRepo = event.kind === 30617;
  const isPatch = event.kind === 1617;
  const isPullRequest = event.kind === 1618;
  const isCustomNip = event.kind === 30817;
  const isNsite = event.kind === 15128 || event.kind === 35128;
  const isZapstoreApp = event.kind === 32267;
  const isZapstoreRelease = event.kind === 30063;
  const isZapstoreAsset = event.kind === 3063;
  const isAppHandler = event.kind === 31990;
  const isEncryptedDM = event.kind === 4;
  const isLetter = event.kind === 8211;
  const isVanish = event.kind === 62;
  const isProfile = event.kind === 0;
  const isDevKind = isGitRepo || isPatch || isPullRequest || isCustomNip || isNsite;
  const isTextNote =
    !isVine &&
    !isPoll &&
    !isGeocache &&
    !isFoundLog &&
    !isColor &&
    !isFollowPack &&
    !isArticle &&
    !isMagicDeck &&
    !isStream &&
    !isFileMetadata &&
    !isVoiceMessage &&
    !isCalendarEvent &&
    !isEmojiPack &&
    !isBadge &&
    !isCommunity &&
    !isGoal &&
    !isAction &&
    !isCampaign &&
    !isReaction &&
    !isPollVote &&
    !isRepost &&
    !isPhoto &&
    !isVideo &&
    !isAudioKind &&
    !isDevKind &&
    !isZapstoreApp &&
    !isZapstoreRelease &&
    !isZapstoreAsset &&
    !isAppHandler &&
    !isEncryptedDM &&
    !isLetter &&
    !isVanish &&
    !isProfile;

  const isComment = event.kind === 1111;
  const isReply = isTextNote && !isComment && isReplyEvent(event);
  const { translatedEvent: contentEvent, translateAction } = useEventTranslation(event, {
    includePlainContent: isTextNote,
    iconOnly: true,
    buttonClassName: "h-9 w-9 p-0",
  });

  // Find all people being replied to (for "Replying to @user1 and @user2")
  const replyToPubkeys = useMemo(() => {
    if (!isTextNote || !isReply) return [];

    // Get all p tags that aren't marked as mentions
    const pTags = event.tags.filter(
      ([name, , , marker]) => name === "p" && marker !== "mention",
    );

    if (pTags.length > 0) {
      // Remove duplicates and filter out undefined/empty pubkeys
      return [
        ...new Set(pTags.map(([, pubkey]) => pubkey).filter(Boolean)),
      ] as string[];
    }

    // Fallback: if all p tags are mentions, use all p tags anyway
    const allPTags = event.tags.filter(([name]) => name === "p");
    if (allPTags.length > 0) {
      return [
        ...new Set(allPTags.map(([, pubkey]) => pubkey).filter(Boolean)),
      ] as string[];
    }

    // Self-reply fallback: when replying to own post, no p tags are added (the
    // author's own pubkey is excluded during compose). Try to extract the parent
    // author from the reply/root e-tag's 5th element (NIP-10 pubkey hint), and
    // ultimately fall back to the event author (self-reply).
    const eTags = event.tags.filter(
      ([name, , , marker]) => name === "e" && marker !== "mention",
    );
    const replyTag = eTags.find(([, , , marker]) => marker === "reply");
    const rootTag = eTags.find(([, , , marker]) => marker === "root");
    const parentAuthor = replyTag?.[4] || rootTag?.[4] || event.pubkey;
    return [parentAuthor];
  }, [event.tags, isTextNote, isReply, event.pubkey]);

  // Extract the parent event ID + relay/author hints for reply hover card preview
  const parentHints = useMemo(() => {
    if (!isReply) return undefined;
    return getParentEventHints(event);
  }, [event, isReply]);
  const parentEventId = parentHints?.id;

  // Kind 34236 specific
  const imeta = useMemo(
    () => (isVine ? parseImeta(event.tags) : undefined),
    [event.tags, isVine],
  );
  const vineTitle = isVine ? getTag(event.tags, "title") : undefined;
  const hashtags = isVine
    ? event.tags.filter(([n]) => n === "t").map(([, v]) => v)
    : [];

  // Filter out deprecated/junk kind 30000 events
  if (isDeprecatedFollowSet(event)) {
    return null;
  }

  // NIP-36: If the event has a content-warning and the policy is "hide", skip rendering entirely
  if (
    getContentWarning(event) !== undefined &&
    config.contentWarningPolicy === "hide"
  ) {
    return null;
  }

  // Hide magic decks tagged t:unlisted and treasures tagged t:hidden
  if (
    isMagicDeck &&
    event.tags.some(([n, v]) => n === "t" && v === "unlisted")
  ) {
    return null;
  }
  if (isGeocache && event.tags.some(([n, v]) => n === "t" && v === "hidden")) {
    return null;
  }

  // Shared content block used in both normal and threaded layouts.
  // Wrapped in `CommunityContentWarning`, which subscribes to the community
  // moderation context internally and is a no-op outside community surfaces.
  const contentBlock = (
    <CommunityContentWarning event={event}>
      {/* Reply context (kind 1) or comment context (kind 1111) — shown above content */}
      {isComment && !hideCommentContext && <CommentContext event={event} prefix={commentContextPrefix} />}
      {isReply && (
        <ReplyContext
          pubkeys={replyToPubkeys}
          parentEventId={parentEventId}
          parentRelayHint={parentHints?.relayHint}
          parentAuthorHint={parentHints?.authorHint}
        />
      )}

      {/* Content — kind-based dispatch, guarded by NIP-36 content-warning */}
      <ContentWarningGuard event={event}>
        {isPhoto ? (
          <PhotoContent event={event} />
        ) : isVideo ? (
          <VideoContent event={event} />
        ) : isVine ? (
          <>
            {vineTitle && (
              <p className="text-[15px] mt-2 leading-relaxed break-words overflow-hidden">
                {vineTitle}
              </p>
            )}
            <VineMedia imeta={imeta} hashtags={hashtags} />
          </>
        ) : isPoll ? (
          <PollContent event={event} />
        ) : isGeocache ? (
          <GeocacheContent event={event} />
        ) : isFoundLog ? (
          <FoundLogContent event={event} />
        ) : isColor ? (
          <ColorMomentContent event={event} />
        ) : isFollowPack ? (
          <PeopleListContent event={event} />
        ) : isArticle ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <ArticleContent event={event} preview className="mt-2" />
          </Suspense>
        ) : isMagicDeck ? (
          <MagicDeckContent event={event} />
        ) : isStream ? (
          <StreamContent event={event} />
        ) : isFileMetadata ? (
          <FileMetadataContent event={event} compact />
        ) : isEmojiPack ? (
          <EmojiPackContent event={event} />
        ) : isBadgeDefinition ? (
          <BadgeContent event={event} />
        ) : isProfileBadges ? (
          <ProfileBadgesContent event={event} />
        ) : isBadgeAward ? (
          <BadgeAwardCard event={event} />
        ) : isCommunity ? (
          <GroupInlinePreview event={contentEvent} />
        ) : isGoal ? (
          <GoalCard event={event} />

        ) : isAction ? (
          <PledgeInlinePreview event={contentEvent} />

        ) : isCampaign ? (
          <CampaignInlinePreview event={contentEvent} />

        ) : isVoiceMessage ? (
          <VoiceMessagePlayer event={event} />
        ) : isCalendarEvent ? (
          <CalendarEventContent event={event} compact />
        ) : isMusicTrack ? (
          <MusicTrackContent event={event} />
        ) : isMusicPlaylist ? (
          <MusicPlaylistContent event={event} />
        ) : isPodcastEpisode ? (
          <PodcastEpisodeContent event={event} />
        ) : isPodcastTrailer ? (
          <PodcastTrailerContent event={event} />
        ) : isGitRepo ? (
          <GitRepoCard event={event} />
        ) : isPatch ? (
          <PatchCard event={event} />
        ) : isPullRequest ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <PullRequestCard event={event} />
          </Suspense>
        ) : isCustomNip ? (
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <CustomNipCard event={event} />
          </Suspense>
        ) : isNsite ? (
          <NsiteCard event={event} />
        ) : isZapstoreApp ? (
          <div className="mt-2 rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <div className="px-3.5 pb-3.5 pt-3">
              <ZapstoreAppContent event={event} compact />
            </div>
          </div>
        ) : isZapstoreRelease ? (
          <div className="mt-2 rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <div className="px-3.5 pb-3.5 pt-3">
              <ZapstoreReleaseContent event={event} compact />
            </div>
          </div>
        ) : isZapstoreAsset ? (
          <div className="mt-2 rounded-xl border border-border overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <div className="px-3.5 pb-3.5 pt-3">
              <ZapstoreAssetContent event={event} compact />
            </div>
          </div>
        ) : isAppHandler ? (
          <AppHandlerContent event={event} compact />
        ) : isEncryptedDM ? (
          <EncryptedMessageContent event={event} compact />
        ) : isLetter ? (
          <EncryptedLetterContent event={event} compact />
        ) : isProfile ? (
          <ProfileCardContent event={event} />
        ) : (
          <TruncatedNoteContent
            event={contentEvent}
          />
        )}
      </ContentWarningGuard>
    </CommunityContentWarning>
  );

  // Shared author info block — min-h-[42px] keeps the container the same height
  // whether the skeleton or the resolved profile is rendered, preventing layout shifts.
  const authorInfo = author.isLoading ? (
    <div className="min-w-0 min-h-[42px] flex flex-col justify-center space-y-1.5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-36" />
    </div>
  ) : (
    <div className="min-w-0 flex-1 min-h-[42px] flex flex-col justify-center">
      <div className="flex items-center gap-1.5">
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileUrl}
            className="font-bold text-[15px] hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>
                {displayName}
              </EmojifiedText>
            ) : (
              displayName
            )}
          </Link>
        </ProfileHoverCard>
        {metadata?.bot && (
          <span className="text-xs text-primary shrink-0" title={t('noteCard.botAccount')}>
            🤖
          </span>
        )}
        {authorBadge}
      </div>
      <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 pr-2">
        <span className="shrink-0 hover:underline whitespace-nowrap">
          {timeAgo(event.created_at)}
        </span>
      </div>
    </div>
  );

  // Shared avatar element
  const avatarElement = author.isLoading ? (
    <Skeleton
      className={cn(
        threaded || threadedLast ? "size-10" : "size-11",
        "rounded-full shrink-0",
      )}
    />
  ) : (
    <ProfileHoverCard pubkey={event.pubkey} asChild>
      <Link
        to={profileUrl}
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar className={threaded || threadedLast ? "size-10" : "size-11"}>
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
    </ProfileHoverCard>
  );

  // ── Shared action buttons (used in all layouts) ──
  const actionButtons = (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-3">
      <button
        className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={t('feed.actions.reply')}
        onClick={(e) => {
          e.stopPropagation();
          setReplyOpen(true);
        }}
      >
        <MessageCircle className="size-[18px]" />
        {stats?.replies ? (
          <span className="tabular-nums">{formatNumber(stats.replies)}</span>
        ) : null}
      </button>

      <RepostMenu event={actionTarget}>
        {(isReposted: boolean) => (
          <button
            className={cn(
              "inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium transition-colors",
              isReposted
                ? "text-accent hover:text-accent/80 hover:bg-accent/10"
                : "text-muted-foreground hover:text-accent hover:bg-accent/10",
            )}
            title={isReposted ? t('feed.actions.undoRepost') : t('feed.actions.repost')}
          >
            <RepostIcon className="size-[18px]" />
            {stats?.reposts || stats?.quotes ? (
              <span className="tabular-nums">
                {formatNumber((stats?.reposts ?? 0) + (stats?.quotes ?? 0))}
              </span>
            ) : null}
          </button>
        )}
      </RepostMenu>

      <ReactionButton
        eventId={actionTarget.id}
        eventPubkey={actionTarget.pubkey}
        eventKind={actionTarget.kind}
        reactionCount={stats?.reactions}
        variant="chip"
      />

      <div className="flex-1" />

      <button
        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={t('feed.actions.share')}
        onClick={async (e) => {
          e.stopPropagation();
          impactLight();
          const url = `${shareOrigin}/${encodedId}`;
          const result = await shareOrCopy(url);
          if (result === "copied") toast({ title: t('feed.actions.linkCopied') });
        }}
      >
        <Share2 className="size-[18px]" />
      </button>
    </div>
  );

  const headerControls = !compact ? (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {translateAction}
      <button
        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={t('feed.actions.more')}
        onClick={(e) => {
          e.stopPropagation();
          setMoreMenuOpen(true);
        }}
      >
        <MoreHorizontal className="size-[18px]" />
      </button>
    </div>
  ) : null;

  // ── Vanish layout (kind 62) — dramatic card, no author row ──
  if (isVanish) {
    // Threaded vanish (ancestor in a reply thread — needs connector line + avatar column)
    if (threaded || threadedLast) {
      return (
        <article
          className={cn(
            "relative px-4 pt-3 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
            threaded ? "pb-0" : "pb-3 border-b border-border",
            className,
          )}
          onClick={handleCardClick}
          onAuxClick={handleAuxClick}
        >
          {headerControls && <div className="absolute right-3 top-2 z-10">{headerControls}</div>}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              {avatarElement}
              {threaded && (
                <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
              )}
            </div>
            <div className={cn("flex-1 min-w-0", threaded && "pb-3")}>
              <VanishCardCompact event={event} timestamp={timeAgo(event.created_at)} />
              {!compact && (
                <>
                  {actionButtons}
                  <NoteMoreMenu event={actionTarget} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
                  <ReplyComposeModal event={actionTarget} open={replyOpen} onOpenChange={setReplyOpen} />
                </>
              )}
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        className={cn(
          "relative px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
          className,
        )}
        onClick={handleCardClick}
        onAuxClick={handleAuxClick}
      >
        {headerControls && <div className="absolute right-3 top-2 z-10">{headerControls}</div>}
        <VanishCardCompact event={event} />
        {!compact && (
          <>
            {actionButtons}
            <NoteMoreMenu
              event={actionTarget}
              open={moreMenuOpen}
              onOpenChange={setMoreMenuOpen}
            />
            <ReplyComposeModal
              event={actionTarget}
              open={replyOpen}
              onOpenChange={setReplyOpen}
            />
          </>
        )}
      </article>
    );
  }

  // ── Reaction layout (kind 7) ──
  if (isReaction) {
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    return (
      <ActivityCard
        icon={
          <div className={cn("flex items-center justify-center rounded-full bg-pink-500/10 shrink-0 text-lg leading-none", iconSize)}>
            <ReactionEmoji content={event.content} tags={event.tags} className="h-5 w-5 object-contain" />
          </div>
        }
        actorRow={
          <ActorRow pubkey={event.pubkey} profileUrl={profileUrl} picture={metadata?.picture}
            displayName={displayName} authorEvent={author.data?.event} isLoading={author.isLoading} label={t('noteCard.reacted')} timestampLabel={timeAgo(event.created_at)} />
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      />
    );
  }

  // ── Repost layout (kind 6 / 16) ──
  if (isRepost) {
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    return (
      <ActivityCard
        icon={
          <div className={cn("flex items-center justify-center rounded-full bg-accent/10 shrink-0", iconSize)}>
            <RepostIcon className="size-5 text-accent" />
          </div>
        }
        actorRow={
          <ActorRow pubkey={event.pubkey} profileUrl={profileUrl} picture={metadata?.picture}
            displayName={displayName} authorEvent={author.data?.event} isLoading={author.isLoading} label={t('noteCard.reposted')} timestampLabel={timeAgo(event.created_at)} />
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      />
    );
  }

  // ── Poll vote layout (kind 1018) ──
  if (isPollVote) {
    const iconSize = threaded || threadedLast ? "size-10" : "size-11";
    return (
      <ActivityCard
        icon={
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Avatar className={iconSize}>
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">{displayName[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
        }
        actorRow={
          <div className="flex items-center gap-1.5">
            <ProfileHoverCard pubkey={event.pubkey} asChild>
              <Link to={profileUrl} className="font-semibold text-sm hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText> : displayName}
              </Link>
            </ProfileHoverCard>
            <span className="text-sm text-muted-foreground shrink-0">{t('noteCard.voted')}</span>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        }
        threaded={threaded} threadedLast={threadedLast} threadedLineClassName={threadedLineClassName}
        className={className} onClick={handleCardClick} onAuxClick={handleAuxClick}
      >
        {pollVoteLabel && <p className="text-sm font-semibold mt-0.5 truncate">{pollVoteLabel}</p>}
      </ActivityCard>
    );
  }

  // ── Threaded layout (with or without connector line) ──
  if (threaded || threadedLast) {
    // Kind action header (e.g. "updated their badges") — same logic as normal layout
    const threadedKindHeader = !repostedBy && !hideKindHeader && KIND_HEADER_MAP[event.kind]
      ? (() => {
          const cfg = KIND_HEADER_MAP[event.kind];
          const isLive = event.kind === 30311 && getEffectiveStreamStatus(event) === "live";
          return (
            <EventActionHeader
              pubkey={event.pubkey}
              icon={cfg.icon}
              iconClassName={
                event.kind === 30311
                  ? isLive ? "text-primary" : "text-muted-foreground"
                  : cfg.iconClassName
              }
              action={typeof cfg.action === "function" ? cfg.action(event) : cfg.action}
              noun={cfg.noun}
              nounRoute={cfg.nounRoute}
            />
          );
        })()
      : null;

    return (
      <article
        className={cn(
          "relative px-4 pt-3 hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
          threaded ? "pb-0" : "pb-3 border-b border-border",
          className,
        )}
        onClick={handleCardClick}
        onAuxClick={handleAuxClick}
      >
        <div className="relative">
          {threadedKindHeader && (
            <div>
              {threadedKindHeader}
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              {avatarElement}
              {threaded && (
                <div className={cn("w-0.5 flex-1 mt-2 rounded-full", threadedLineClassName || "bg-foreground/20")} />
              )}
            </div>
            <div className={cn("flex-1 min-w-0", threaded && "pb-3")}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {authorInfo}
                </div>
                <CountryCommentPill event={event} className="shrink-0 [text-shadow:none]" />
                {headerControls}
              </div>
              {contentBlock}
              {actionButtons}
              <NoteMoreMenu
                event={actionTarget}
                open={moreMenuOpen}
                onOpenChange={setMoreMenuOpen}
              />
              <ReplyComposeModal
                event={actionTarget}
                open={replyOpen}
                onOpenChange={setReplyOpen}
              />
            </div>
          </div>
        </div>
      </article>
    );
  }

  // ── Normal layout ──
  return (
    <article
      className={cn(
        "relative px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer overflow-hidden",
        highlight && "animate-highlight-fade",
        className,
      )}
      onClick={handleCardClick}
      onAuxClick={handleAuxClick}
    >
      <div className="relative">
        <div>
          {/* Action header — repost takes priority, otherwise derived from event kind */}
          {repostedBy ? (
            <EventActionHeader
              pubkey={repostedBy}
              icon={RepostIcon}
              iconClassName="text-accent"
              action="noteCard.reposted"
            />
          ) : (
            !hideKindHeader && KIND_HEADER_MAP[event.kind] &&
            (() => {
              const cfg = KIND_HEADER_MAP[event.kind];
              const isLive =
                event.kind === 30311 && getEffectiveStreamStatus(event) === "live";
              return (
                <EventActionHeader
                  pubkey={event.pubkey}
                  icon={cfg.icon}
                  iconClassName={
                    event.kind === 30311
                      ? isLive
                        ? "text-primary"
                        : "text-muted-foreground"
                      : cfg.iconClassName
                  }
                  action={
                    typeof cfg.action === "function"
                      ? cfg.action(event)
                      : cfg.action
                  }
                  noun={cfg.noun}
                  nounRoute={cfg.nounRoute}
                />
              );
            })()
          )}

          {/* Header: avatar + name/handle with the country pill anchored
              right. The pill is a flex sibling of the author row so it
              keeps its own surface treatment regardless of context. */}
          <div className="flex items-center gap-3">
            {avatarElement}
            {authorInfo}
            <CountryCommentPill
              event={event}
              className="shrink-0 [text-shadow:none]"
            />
            {headerControls}
          </div>
        </div>

        {contentBlock}

        {/* Action buttons — hidden in compact/embed mode */}
        {!compact && (
          <>
            {actionButtons}
            <NoteMoreMenu
              event={actionTarget}
              open={moreMenuOpen}
              onOpenChange={setMoreMenuOpen}
            />
            <ReplyComposeModal
              event={actionTarget}
              open={replyOpen}
              onOpenChange={setReplyOpen}
            />
          </>
        )}
      </div>
    </article>
  );
});

const MAX_HEIGHT = 400; // px — posts taller than this get truncated

/** Truncates long text note content with a "Read more" fade + button.
 *  Media attachments render inline within NoteContent at their original content position. */
function TruncatedNoteContent({
  event,
}: {
  event: NostrEvent;
}) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const singleImage = isSingleImagePost(event);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (el) setOverflows(!singleImage && el.scrollHeight > MAX_HEIGHT);
  }, [singleImage]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Re-measure after images load — scrollHeight is unreliable before images have rendered.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll("img");
    if (imgs.length === 0) return;
    imgs.forEach((img) =>
      img.addEventListener("load", measure, { once: true }),
    );
    return () =>
      imgs.forEach((img) => img.removeEventListener("load", measure));
  }, [measure]);

  return (
    <div className="mt-2 break-words overflow-hidden">
      <div
        ref={contentRef}
        style={
          !expanded && overflows
            ? { maxHeight: MAX_HEIGHT, overflow: "hidden" }
            : undefined
        }
        className="relative"
      >
        <NoteContent event={event} className="text-[15px] leading-relaxed" />
        {!expanded && overflows && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      {overflows && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            className="text-sm text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? t('noteCard.showLess') : t('noteCard.readMore')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── NIP-68 Photo content (kind 20) ────────────────────────────────────────────

/** Parse all imeta image URLs from NIP-68 photo events. */
function parsePhotoUrls(
  tags: string[][],
): Array<{ url: string; alt?: string; blurhash?: string }> {
  const results: Array<{ url: string; alt?: string; blurhash?: string }> = [];
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(" ");
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url)
      results.push({
        url: parts.url,
        alt: parts.alt,
        blurhash: parts.blurhash,
      });
  }
  return results;
}

/** Inline photo gallery for NIP-68 kind 20 events. */
function PhotoContent({ event }: { event: NostrEvent }) {
  const photos = useMemo(() => parsePhotoUrls(event.tags), [event.tags]);
  const title = getTag(event.tags, "title");
  const description = event.content;
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

  // Build imetaMap with dim + blurhash so ImageGallery can show blurhash placeholders
  const imetaMap = useMemo(() => {
    const map = new Map<string, { dim?: string; blurhash?: string }>();
    for (const photo of photos) {
      map.set(photo.url, { blurhash: photo.blurhash });
    }
    return map;
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {title && <p className="font-semibold text-[15px]">{title}</p>}
      <ImageGallery
        images={photos.map((p) => p.url)}
        maxVisible={4}
        maxGridHeight="480px"
        imetaMap={imetaMap}
      />
      {description && (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NIP-71 Video content (kinds 21 & 22) ──────────────────────────────────────

/** Parse the primary video url and thumbnail from NIP-71 imeta tags. */
function parseVideoImeta(tags: string[][]): {
  url?: string;
  thumbnail?: string;
  duration?: string;
} {
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(" ");
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url)
      return {
        url: parts.url,
        thumbnail: parts.image,
        duration: parts.duration,
      };
  }
  // Fallback to plain url/thumb tags
  return {
    url: tags.find(([n]) => n === "url")?.[1],
    thumbnail:
      tags.find(([n]) => n === "thumb")?.[1] ??
      tags.find(([n]) => n === "image")?.[1],
  };
}

/** Format seconds into MM:SS / HH:MM:SS. */
function fmtDuration(seconds: string | undefined): string | undefined {
  const s = parseFloat(seconds ?? "");
  if (isNaN(s) || s <= 0) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Inline video player for NIP-71 kind 21/22 events. */
function VideoContent({ event }: { event: NostrEvent }) {
  const { url, thumbnail, duration } = useMemo(
    () => parseVideoImeta(event.tags),
    [event.tags],
  );
  const title = getTag(event.tags, "title");
  const description = event.content;
  const isShort = event.kind === 22;
  const formattedDuration = fmtDuration(duration);
  const hashtags = event.tags.filter(([n]) => n === "t").map(([, v]) => v);

  if (!url) return null;

  return (
    <div className="mt-2 space-y-2">
      {title && <p className="font-semibold text-[15px]">{title}</p>}
      <div
        className={cn(
          "relative rounded-xl overflow-hidden bg-muted",
          isShort ? "max-w-[280px]" : "",
        )}
      >
        <VideoPlayer src={url} poster={thumbnail} title={title ?? undefined} />
        {formattedDuration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
            {formattedDuration}
          </div>
        )}
        {isShort && (
          <div className="absolute top-2 left-2 pointer-events-none">
            <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
              Short
            </span>
          </div>
        )}
      </div>
      {description && (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Media content for kind 34236 vine events — rendered at full card width. */
function VineMedia({
  imeta,
  hashtags,
}: {
  imeta?: { url?: string; thumbnail?: string };
  hashtags: string[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Pause video when scrolled out of view
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <>
      {imeta?.url && (
        <div
          ref={containerRef}
          className="relative mt-3 rounded-2xl overflow-hidden cursor-pointer"
          onClick={handlePlayToggle}
        >
          <video
            ref={videoRef}
            src={imeta.url}
            poster={imeta.thumbnail}
            className="w-full max-h-[70vh] object-cover"
            loop
            playsInline
            preload="none"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="size-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                <Play className="size-7 text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>
      )}

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** Stream status badge config. The `label` is an i18n key under `noteCard.stream.*`. */
function getStreamStatusConfig(status: string | undefined) {
  switch (status) {
    case "live":
      return {
        labelKey: "noteCard.stream.live",
        className: "bg-red-600 hover:bg-red-600 text-white border-red-600",
      };
    case "ended":
      return {
        labelKey: "noteCard.stream.ended",
        className: "bg-muted text-muted-foreground border-border",
      };
    case "planned":
      return {
        labelKey: "noteCard.stream.planned",
        className:
          "bg-blue-600/90 hover:bg-blue-600/90 text-white border-blue-600",
      };
    default:
      return {
        labelKey: "noteCard.stream.unknown",
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

/** Inline content for kind 30311 live stream events. */
function StreamContent({ event }: { event: NostrEvent }) {
  const { t } = useTranslation();
  const title = getTag(event.tags, "title") || t('noteCard.stream.untitled');
  const summary = getTag(event.tags, "summary");
  const imageUrl = getTag(event.tags, "image");
  const streamingUrl = getTag(event.tags, "streaming");
  const status = getEffectiveStreamStatus(event);
  const currentParticipants = getTag(event.tags, "current_participants");
  const statusConfig = getStreamStatusConfig(status);

  const isLive = status === "live" && !!streamingUrl;

  const encodedId = useMemo(() => {
    const dTag = getTag(event.tags, "d") || "";
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: dTag,
    });
  }, [event]);

  const { onClick: openPost } = useOpenPost(`/${encodedId}`);

  return (
    <div className="mt-2 space-y-2">
      {/* Stream player / thumbnail */}
      <div className="rounded-xl overflow-hidden border border-border">
        {isLive ? (
          // Inline live player — clicks on the player are intercepted so they don't navigate away
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <LiveStreamPlayer
              src={streamingUrl}
              poster={imageUrl}
              title={title}
            />
            {/* Status + viewer overlay on top of the player */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2 pointer-events-none">
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusConfig.className)}
              >
                <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
                {t(statusConfig.labelKey)}
              </Badge>
              {currentParticipants && (
                <span className="flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                  <Users className="size-3" />
                  {currentParticipants}
                </span>
              )}
            </div>
          </div>
        ) : imageUrl ? (
          <div className="relative w-full aspect-video overflow-hidden bg-muted">
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display =
                  "none";
              }}
            />
            <div className="absolute top-2 left-2">
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusConfig.className)}
              >
                {t(statusConfig.labelKey)}
              </Badge>
            </div>
            {currentParticipants && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                <Users className="size-3" />
                {currentParticipants}
              </div>
            )}
          </div>
        ) : (
          // No image, no live stream — show a minimal placeholder with status
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/40">
            <Radio className="size-4 text-primary shrink-0" />
            <Badge
              variant="outline"
              className={cn("text-[10px]", statusConfig.className)}
            >
              {status === "live" && (
                <div className="size-1.5 bg-white rounded-full animate-pulse mr-1" />
              )}
              {t(statusConfig.labelKey)}
            </Badge>
            {currentParticipants && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" />
                {currentParticipants}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Title + summary — clickable to open stream details */}
      <button
        type="button"
        className="flex items-start gap-2 text-left w-full group"
        onClick={(e) => {
          e.stopPropagation();
          openPost();
        }}
      >
        <Radio className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:underline">
            {title}
          </h3>
          {summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {summary}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}

interface EventActionHeaderProps {
  /** Pubkey of the person performing the action. */
  pubkey: string;
  /** Lucide icon component shown to the left of the author name. */
  icon: React.ComponentType<{ className?: string }>;
  /** Optional className for the icon (defaults to text-primary). */
  iconClassName?: string;
  /**
   * Translation key for the verb phrase shown after the author name,
   * e.g. "noteCard.kindHeader.treasureHidCreated". Translated at render
   * time via i18next.
   */
  action: string;
  /** Translation key for an optional noun shown after the verb. */
  noun?: string;
  /** Route to link the noun to, e.g. "/treasures". */
  nounRoute?: string;
}

/** Static config for deriving the action header from an event's kind and tags. */
interface KindHeaderConfig {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  /**
   * Either a static i18n key under `noteCard.kindHeader`, or a function
   * that computes the action key from the event. The materialized verb
   * phrase is filled in by `useKindHeader()` at render time.
   */
  action: string | ((event: NostrEvent) => string);
  /** Optional i18n key for the linked noun under `noteCard.kindHeader`. */
  noun?: string;
  nounRoute?: string;
}

/** Resolves a `publishedAtAction` outcome to a noteCard.kindHeader.* key. */
function publishedAtKey(event: NostrEvent, keys: { created: string; updated: string; fallback: string }): string {
  return publishedAtAction(event, keys);
}

const KIND_HEADER_MAP: Record<number, KindHeaderConfig> = {
  20: {
    icon: Camera,
    action: "noteCard.kindHeader.photo.action",
    noun: "noteCard.kindHeader.photo.noun",
    nounRoute: "/photos",
  },
  4: {
    icon: Mail,
    action: "noteCard.kindHeader.encryptedMessage.action",
    noun: "noteCard.kindHeader.encryptedMessage.noun",
  },
  8211: {
    icon: Mail,
    action: "noteCard.kindHeader.letter.action",
    noun: "noteCard.kindHeader.letter.noun",
    nounRoute: "/letters",
  },
  37516: {
    icon: ChestIcon,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.treasureHidCreated", updated: "noteCard.kindHeader.treasureHidUpdated", fallback: "noteCard.kindHeader.treasureHidCreated" }),
    noun: "noteCard.kindHeader.treasureNoun",
    nounRoute: "/treasures",
  },
  7516: {
    icon: ChestIcon,
    action: "noteCard.kindHeader.treasureFound",
    noun: "noteCard.kindHeader.treasureNoun",
    nounRoute: "/treasures",
  },
  37381: {
    icon: CardsIcon,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.deckCreated", updated: "noteCard.kindHeader.deckUpdated", fallback: "noteCard.kindHeader.deckFallback" }),
    noun: "noteCard.kindHeader.deckNoun",
    nounRoute: "/decks",
  },
  30030: {
    icon: SmilePlus,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.emojiPackCreated", updated: "noteCard.kindHeader.emojiPackUpdated", fallback: "noteCard.kindHeader.emojiPackFallback" }),
    noun: "noteCard.kindHeader.emojiPackNoun",
    nounRoute: "/emojis",
  },
  34550: {
    icon: Users,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.groupCreated", updated: "noteCard.kindHeader.groupUpdated", fallback: "noteCard.kindHeader.groupFallback" }),
    noun: "noteCard.kindHeader.groupNoun",
    nounRoute: "/groups",
  },
  33863: {
    icon: HandHeart,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.campaignLaunched", updated: "noteCard.kindHeader.campaignUpdated", fallback: "noteCard.kindHeader.campaignFallback" }),
    noun: "noteCard.kindHeader.campaignNoun",
    nounRoute: "/campaigns",
  },
  8: {
    icon: Award,
    action: "noteCard.kindHeader.badgeAwarded",
    noun: "noteCard.kindHeader.badgeNoun",
    nounRoute: "/badges",
  },
  30009: {
    icon: Award,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.badgeCreated", updated: "noteCard.kindHeader.badgeDefUpdated", fallback: "noteCard.kindHeader.badgeCreated" }),
    noun: "noteCard.kindHeader.badgeNoun",
    nounRoute: "/badges",
  },
  10008: {
    icon: Award,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.badgesCreatedTheir", updated: "noteCard.kindHeader.badgesUpdatedTheir", fallback: "noteCard.kindHeader.badgesUpdatedTheir" }),
    noun: "noteCard.kindHeader.badgesNoun",
    nounRoute: "/badges",
  },
  30008: {
    icon: Award,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.badgesCreatedTheir", updated: "noteCard.kindHeader.badgesUpdatedTheir", fallback: "noteCard.kindHeader.badgesUpdatedTheir" }),
    noun: "noteCard.kindHeader.badgesNoun",
    nounRoute: "/badges",
  },
  30311: {
    icon: Radio,
    iconClassName: undefined, // computed dynamically below
    action: (event) =>
      getEffectiveStreamStatus(event) === "live"
        ? "noteCard.kindHeader.streamingLive"
        : "noteCard.kindHeader.streamed",
  },
  32267: {
    icon: Package,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.zapstoreAppPublished", updated: "noteCard.kindHeader.zapstoreAppUpdated", fallback: "noteCard.kindHeader.zapstoreAppPublished" }),
  },
  30063: {
    icon: Package,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.zapstoreReleasePublished", updated: "noteCard.kindHeader.zapstoreReleaseUpdated", fallback: "noteCard.kindHeader.zapstoreReleasePublished" }),
  },
  3063: {
    icon: Package,
    action: "noteCard.kindHeader.zapstoreAssetPublished",
  },
  31990: {
    icon: Package,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.appPublished", updated: "noteCard.kindHeader.appUpdated", fallback: "noteCard.kindHeader.appPublished" }),
  },
  30617: {
    icon: GitBranch,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.repoCreated", updated: "noteCard.kindHeader.repoUpdated", fallback: "noteCard.kindHeader.repoFallback" }),
    noun: "noteCard.kindHeader.repoNoun",
    nounRoute: "/development",
  },
  1617: {
    icon: FileText,
    action: "noteCard.kindHeader.patchSubmitted",
    noun: "noteCard.kindHeader.patchNoun",
    nounRoute: "/development",
  },
  1618: {
    icon: GitPullRequest,
    action: "noteCard.kindHeader.prOpened",
    noun: "noteCard.kindHeader.prNoun",
    nounRoute: "/development",
  },
  30817: {
    icon: FileCode,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.nipProposed", updated: "noteCard.kindHeader.nipUpdated", fallback: "noteCard.kindHeader.nipProposed" }),
    noun: "noteCard.kindHeader.nipNoun",
    nounRoute: "/development",
  },
  15128: {
    icon: Rocket,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.nsiteDeployed", updated: "noteCard.kindHeader.nsiteRedeployed", fallback: "noteCard.kindHeader.nsiteDeployed" }),
    noun: "noteCard.kindHeader.nsiteNoun",
    nounRoute: "/development",
  },
  35128: {
    icon: Rocket,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.nsiteDeployed", updated: "noteCard.kindHeader.nsiteRedeployed", fallback: "noteCard.kindHeader.nsiteDeployed" }),
    noun: "noteCard.kindHeader.nsiteNoun",
    nounRoute: "/development",
  },
  36639: {
    icon: Megaphone,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.pledgeCreated", updated: "noteCard.kindHeader.pledgeUpdated", fallback: "noteCard.kindHeader.pledgeCreated" }),
    noun: "noteCard.kindHeader.pledgeNoun",
    nounRoute: "/pledges",
  },
  39089: {
    icon: PartyPopper,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.followPackCreated", updated: "noteCard.kindHeader.followPackUpdated", fallback: "noteCard.kindHeader.followPackFallback" }),
    noun: "noteCard.kindHeader.followPackNoun",
    nounRoute: "/packs",
  },
  30000: {
    icon: PartyPopper,
    action: (event) => publishedAtKey(event, { created: "noteCard.kindHeader.followSetCreated", updated: "noteCard.kindHeader.followSetUpdated", fallback: "noteCard.kindHeader.followSetFallback" }),
    noun: "noteCard.kindHeader.followSetNoun",
    nounRoute: "/packs",
  },
};

/** Generic action header: icon · [author name] [action] [linked noun] */
export function EventActionHeader({
  pubkey,
  icon: Icon,
  iconClassName,
  action,
  noun,
  nounRoute,
}: EventActionHeaderProps) {
  const { t } = useTranslation();
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const url = useProfileUrl(pubkey, author.data?.metadata);
  const actionText = t(action);
  const nounText = noun ? t(noun) : undefined;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 min-w-0">
      <div className="w-11 shrink-0 flex justify-end">
        <Icon
          className={cn(
            "size-4 translate-y-px",
            iconClassName ?? "text-primary",
          )}
        />
      </div>
      <div className="flex items-center min-w-0">
        {author.isLoading ? (
          <Skeleton className="h-3 w-20 inline-block" />
        ) : (
          <ProfileHoverCard pubkey={pubkey} asChild>
            <Link
              to={url}
              className="font-medium hover:underline mr-1 truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>
                  {name}
                </EmojifiedText>
              ) : (
                name
              )}
            </Link>
          </ProfileHoverCard>
        )}
        <span className={cn("shrink-0", author.isLoading && "ml-1")}>
          {actionText}
          {nounText && nounRoute && (
            <>
              {" "}
              <Link
                to={nounRoute}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {nounText}
              </Link>
            </>
          )}
          {nounText && !nounRoute && <> {nounText}</>}
        </span>
      </div>
    </div>
  );
}
