import type React from 'react';
import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  Award, BarChart3, Bird, BookOpen, Camera, Clapperboard, FileText, Film,
  GitBranch, GitPullRequest, HandHeart, Highlighter, Mail, MapPin, Megaphone, MessageSquare, Mic, Music,
  Package, Palette, PartyPopper, Podcast, Radio, Rocket, SmilePlus,
  Stars, Target, Users, UserCheck, Vote,
} from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { CardsIcon } from '@/components/icons/CardsIcon';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { LinkPreview } from '@/components/LinkPreview';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ReactionEmoji } from '@/components/CustomEmoji';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddrEvent, useEvent } from '@/hooks/useEvent';
import { usePollVoteLabel } from '@/hooks/usePollVoteLabel';
import { useAuthor } from '@/hooks/useAuthor';
import { useBookInfo } from '@/hooks/useBookInfo';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useScryfallCard } from '@/hooks/useScryfallCard';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { getCountryInfo } from '@/lib/countries';
import { CountryFlag } from '@/components/CountryFlag';
import { hasCustomFlag } from '@/lib/customFlags';
import { useCountryFeed } from '@/contexts/CountryFeedContext';
import { cn } from '@/lib/utils';
import { extractGathererCard, type GathererCard } from '@/lib/linkEmbed';
import { cardPrimaryImage } from '@/lib/scryfall';


/** Default classes shared by all comment context rows. */
const ROW_CLASS = 'flex items-center gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden';

/** Parsed root reference from a kind 1111 comment's uppercase tags. */
interface CommentRoot {
  type: 'event' | 'addr' | 'external';
  /** For type 'event': the root event ID. */
  eventId?: string;
  /** For type 'addr': the addressable event coordinates. */
  addr?: { kind: number; pubkey: string; identifier: string };
  /** For type 'external': the raw identifier (URL, ISBN, etc.). */
  identifier?: string;
  /** Root kind number (from K tag). */
  rootKind?: string;
  /** Relay URL hint from the E or A tag (position [2]). */
  relayHint?: string;
  /** Author pubkey hint extracted from the E tag (position [3]) or P tag. */
  authorHint?: string;
}

/** Parse the root reference from a kind 1111 comment's tags. */
function parseCommentRoot(event: NostrEvent): CommentRoot | undefined {
  const aTagFull = event.tags.find(([name]) => name === 'A');
  // Use find (not findLast) to get the root E tag, not a parent e tag
  const eTagFull = event.tags.find(([name]) => name === 'E');
  const iTag = event.tags.find(([name]) => name === 'I')?.[1];
  const kTag = event.tags.find(([name]) => name === 'K')?.[1];
  // P tag holds the root event author's pubkey — used as author hint fallback
  const pTag = event.tags.find(([name]) => name === 'P')?.[1];

  if (aTagFull) {
    const aTag = aTagFull[1];
    const relayHint = aTagFull[2] || undefined;
    const parts = aTag.split(':');
    const kind = parseInt(parts[0], 10);
    const pubkey = parts[1] ?? '';
    const identifier = parts.slice(2).join(':');
    return { type: 'addr', addr: { kind, pubkey, identifier }, rootKind: kTag, relayHint };
  }

  if (eTagFull) {
    const eTag = eTagFull[1];
    const relayHint = eTagFull[2] || undefined;
    // NIP-22 E tags may have the author pubkey at position [3]; fall back to P tag
    const authorHint = eTagFull[3] || pTag || undefined;
    return { type: 'event', eventId: eTag, rootKind: kTag, relayHint, authorHint };
  }

  if (iTag) {
    return { type: 'external', identifier: iTag, rootKind: kTag };
  }

  return undefined;
}

/**
 * Singular comment-context labels for every supported kind.
 * Must use singular form with article ("a post", "an article") since these
 * appear as "Commenting on {label}". EXTRA_KINDS labels are plural/categorical
 * ("Requests to Vanish", "User Statuses") and must NOT be used directly.
 */
const KIND_LABELS: Record<number, string> = {
  0: 'a profile',
  1: 'a post',
  3: 'a follow list',
  4: 'an encrypted message',
  6: 'a repost',
  7: 'a reaction',
  8: 'a badge award',
  16: 'a repost',
  20: 'a photo',
  21: 'a video',
  22: 'a short video',
  62: 'a request to vanish',
  1063: 'a file',
  1018: 'a vote',
  1068: 'a poll',
  1111: 'a comment',
  1222: 'a voice message',
  8211: 'a letter',
  1617: 'a patch',
  1618: 'a pull request',
  2473: 'a bird detection',
  12473: 'a Birdex',
  3367: 'a color moment',
  7516: 'a found log',
  15128: 'an nsite',
  10008: 'profile badges',
  30008: 'profile badges',
  30009: 'a badge',
  30023: 'an article',
  30030: 'an emoji pack',
  30054: 'a podcast episode',
  30055: 'a podcast trailer',
  3063: 'a Zapstore asset',
  30063: 'a Zapstore release',
  30311: 'a stream',
  30315: 'a status',
  30617: 'a repository',
  30817: 'a custom NIP',
  31922: 'a calendar event',
  31923: 'a calendar event',
  31990: 'an app',
  32267: 'a Zapstore app',
  34139: 'a playlist',
  34236: 'a divine',
  34550: 'a group',
  9041: 'a goal',
  33863: 'a campaign',
  35128: 'an nsite',
  36639: 'a pledge',
  36787: 'a track',
  37381: 'a Magic deck',
  37516: 'a treasure',
  30000: 'a follow set',
  30621: 'a constellation',
  39089: 'a follow pack',
  9802: 'a highlight',
};

/** Kind-specific icons — matches sidebar and NoteCard icons. */
const KIND_ICONS: Partial<Record<number, React.ComponentType<{ className?: string }>>> = {
  0: Users,
  1: MessageSquare,
  4: Mail,
  6: RepostIcon,
  8: Award,
  16: RepostIcon,
  20: Camera,
  21: Film,
  22: Film,
  1063: FileText,
  1018: Vote,
  1068: BarChart3,
  1222: Mic,
  1617: FileText,
  8211: Mail,
  1618: GitPullRequest,
  15128: Rocket,
  35128: Rocket,
  36639: Megaphone,
  10008: Award,
  30008: Award,
  30009: Award,
  30023: BookOpen,
  30030: SmilePlus,
  30054: Podcast,
  30055: Podcast,
  3063: Package,
  30063: Package,
  30311: Radio,
  30617: GitBranch,
  31990: Package,
  32267: Package,
  34236: Clapperboard,
  36787: Music,
  34139: Music,
  37381: CardsIcon,
  37516: ChestIcon,
  7516: ChestIcon,
  3: UserCheck,
  30000: Users,
  39089: PartyPopper,
  3367: Palette,
  9041: Target,
  33863: HandHeart,
  9802: Highlighter,
  2473: Bird,
  12473: Bird,
  30621: Stars,
};

/**
 * Get a singular comment-context label for a kind number.
 * Only uses KIND_LABELS (which has proper singular forms with articles).
 * Never falls through to EXTRA_KINDS labels since those are plural/categorical.
 * Unknown kinds render as "an unsupported event" — never as "a post", which
 * would misrepresent arbitrary event kinds as text notes.
 */
function getKindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? 'an unsupported event';
}

/** Parse a rootKind string into a label, handling both numeric and external content kinds. */
function getRootKindLabel(rootKind: string | undefined): string {
  if (!rootKind) return 'a post';

  const kindNum = parseInt(rootKind, 10);
  if (isNaN(kindNum)) {
    if (rootKind === 'web' || rootKind === 'https' || rootKind === 'http') return 'a link';
    if (rootKind === '#') return 'a hashtag';
    return rootKind;
  }

  return getKindLabel(kindNum);
}

/** Suffix that describes the kind, appended after a title (e.g. "Wet Dry World theme"). */
const KIND_SUFFIXES: Partial<Record<number, string>> = {
  30009: 'badge',
  30030: 'emoji pack',
  30000: 'follow set',
  39089: 'follow pack',
  37381: 'deck',
  37516: 'treasure',
  30621: 'constellation',
  34550: 'group',
  33863: 'campaign',
  30054: 'episode',
  30055: 'trailer',
  34139: 'playlist',
};

/** Postfix that replaces the default pattern (e.g. "Ditto on Zapstore" instead of "Ditto Zapstore app"). */
const KIND_POSTFIXES: Partial<Record<number, string>> = {
  32267: 'on Zapstore',
  30063: 'Zapstore release',
  3063: 'Zapstore asset',
};

/** Get a display name for an event based on its kind and tags. */
function getEventDisplayName(event: NostrEvent): { text: string; icon?: React.ComponentType<{ className?: string }> } {
  const icon = KIND_ICONS[event.kind];

  // Nsite deployments: "{siteName} nsite" with rocket icon
  if (event.kind === 15128 || event.kind === 35128) {
    const title = event.tags.find(([name]) => name === 'title')?.[1];
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    const siteName = title || dTag;
    return { text: siteName ? `${siteName} nsite` : 'an nsite', icon };
  }

  // NIP-89 apps: name lives in JSON content, not in tags
  if (event.kind === 31990) {
    try {
      const meta = JSON.parse(event.content);
      const appName = meta?.name || event.tags.find(([n]) => n === 'name')?.[1];
      if (appName) return { text: `${appName} app`, icon };
    } catch { /* fall through */ }
    return { text: 'an app', icon };
  }

  // Extract a title-like string from tags
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const name = event.tags.find(([name]) => name === 'name')?.[1];
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  const alt = event.tags.find(([name]) => name === 'alt')?.[1]?.trim();
  const displayTitle = title || name || dTag;

  // Kinds with a custom postfix (e.g. "Ditto on Zapstore")
  const postfix = KIND_POSTFIXES[event.kind];
  if (postfix && displayTitle) {
    return { text: `${displayTitle} ${postfix}`, icon };
  }

  // Kinds with a suffix (e.g. "Beagle Owner badge", "Wet Dry World theme")
  const suffix = KIND_SUFFIXES[event.kind];
  if (suffix && displayTitle) {
    return { text: `${displayTitle} ${suffix}`, icon };
  }

  // Known kinds: use the conventional title/name/d tag if available.
  if (KIND_LABELS[event.kind] && displayTitle) {
    return { text: displayTitle, icon };
  }

  // Unknown kinds: only trust the NIP-31 `alt` tag. title/name/d have
  // kind-specific semantics we can't interpret; `d` in particular is often
  // an opaque compound identifier.
  if (alt) return { text: alt, icon };

  // Fall back to kind label ("an unsupported event" for unknown kinds).
  return { text: getKindLabel(event.kind), icon };
}

/** Build a navigation link for the root event. */
function getRootLink(event: NostrEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    if (dTag) {
      return `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;
    }
  }
  return `/${nip19.neventEncode({ id: event.id, author: event.pubkey })}`;
}

// ─── Shared wrapper ────────────────────────────────────────────

interface CommentContextRowProps {
  prefix: string;
  className?: string;
  loading?: boolean;
  children?: ReactNode;
}

/** Shared row wrapper for all comment context variants. */
function CommentContextRow({ prefix, className, loading, children }: CommentContextRowProps) {
  return (
    <div className={className || ROW_CLASS}>
      <span className="shrink-0">{prefix}</span>
      {loading ? <Skeleton className="h-3.5 w-24 inline-block" /> : children}
    </div>
  );
}

// ─── Shared hover card for Nostr events ────────────────────────

interface EventHoverLinkProps {
  display: { text: string; icon?: React.ComponentType<{ className?: string }> };
  link: string;
  hoverContent: ReactNode;
}

/** Link with icon that shows a hover card preview. */
function EventHoverLink({ display, link, hoverContent }: EventHoverLinkProps) {
  const DisplayIcon = display.icon;
  return (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {DisplayIcon && <DisplayIcon className="size-3.5 shrink-0" />}
          {display.text}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-80 p-0 rounded-2xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {hoverContent}
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── Main export ───────────────────────────────────────────────

interface CommentContextProps {
  event: NostrEvent;
  className?: string;
  prefix?: string;
}

/**
 * Displays "Replying to @user" or "Commenting on [name]" context for kind 1111 comments.
 * When the parent item (lowercase k tag) is another kind 1111 comment, shows "Replying to @user"
 * using the lowercase p tag (parent author). Otherwise shows "Commenting on [root]".
 */
export function CommentContext({ event, className, prefix = 'Commenting on' }: CommentContextProps) {
  // If the direct parent is another comment (k="1111"), show "Replying to @user"
  const parentKind = event.tags.find(([name]) => name === 'k')?.[1];
  const parentAuthorPubkey = event.tags.findLast(([name]) => name === 'p')?.[1];

  if (parentKind === '1111' && parentAuthorPubkey) {
    return <ReplyToCommentContext pubkey={parentAuthorPubkey} eventId={event.tags.findLast(([name]) => name === 'e')?.[1]} className={className} />;
  }

  const root = parseCommentRoot(event);

  if (!root) return null;

  switch (root.type) {
    case 'addr':
      return <AddrCommentContext root={root} className={className} prefix={prefix} />;
    case 'event':
      return <EventCommentContext root={root} className={className} prefix={prefix} />;
    case 'external':
      return <ExternalCommentContext root={root} className={className} prefix={prefix} />;
    default:
      return null;
  }
}

// ─── Sub-components ────────────────────────────────────────────

/** Comment context when replying directly to another kind 1111 comment — shows "Replying to @user". */
function ReplyToCommentContext({ pubkey, eventId, className }: { pubkey: string; eventId?: string; className?: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const parentLink = useMemo(() => {
    if (!eventId) return undefined;
    try { return `/${nip19.neventEncode({ id: eventId, author: pubkey })}`; } catch { return undefined; }
  }, [eventId, pubkey]);

  return (
    <CommentContextRow prefix="Replying to" className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={parentLink ?? `/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for addressable event roots (A tag). */
function AddrCommentContext({ root, className, prefix }: { root: CommentRoot; className?: string; prefix: string }) {
  // Kind 0 (profile) roots get special treatment — show "@DisplayName" with a profile link
  if (root.addr?.kind === 0) {
    return <ProfileCommentContext pubkey={root.addr.pubkey} className={className} prefix={prefix} />;
  }

  // Kind 10008 or 30008 (profile badges) roots — show "@User's profile badges"
  if (root.addr?.kind === 10008 || root.addr?.kind === 30008) {
    return <ProfileBadgesCommentContext root={root} className={className} prefix={prefix} />;
  }

  // Kind 3 follow lists have no title of their own — synthesize one from the author's name
  if (root.addr?.kind === 3) {
    return <FollowListCommentContext pubkey={root.addr.pubkey} className={className} prefix={prefix} />;
  }

  return <GenericAddrCommentContext root={root} className={className} prefix={prefix} />;
}

/** Comment context for kind 3 (follow list) roots — shows "Commenting on @Name's follow list". */
function FollowListCommentContext({ pubkey, className, prefix }: { pubkey: string; className?: string; prefix: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const listLink = useMemo(
    () => `/${nip19.naddrEncode({ kind: 3, pubkey, identifier: '' })}`,
    [pubkey],
  );

  return (
    <CommentContextRow prefix={prefix} className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}'s
        </Link>
      </ProfileHoverCard>
      <Link
        to={listLink}
        className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <UserCheck className="size-3.5 shrink-0" />
        follow list
      </Link>
    </CommentContextRow>
  );
}

/** Comment context for kind 0 (profile) roots — shows "Commenting on @Name". */
function ProfileCommentContext({ pubkey, className, prefix }: { pubkey: string; className?: string; prefix: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <CommentContextRow prefix={prefix} className={className} loading={author.isLoading}>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for kind 10008/30008 (profile badges) roots — shows "Commenting on profile badges by @User". */
function ProfileBadgesCommentContext({ root, className, prefix }: { root: CommentRoot; className?: string; prefix: string }) {
  const pubkey = root.addr?.pubkey ?? '';
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  // Build naddr link for the profile badges event
  const link = useMemo(() => {
    if (!root.addr) return undefined;
    try { return `/${nip19.naddrEncode({ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier })}`; } catch { return undefined; }
  }, [root.addr]);

  // Hover content for the addressable event
  const hoverContent = root.addr ? (
    <EmbeddedNaddr
      addr={{ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier }}
      className="border-0 rounded-none"
    />
  ) : undefined;

  return (
    <CommentContextRow prefix={prefix} className={className} loading={author.isLoading}>
      {link && hoverContent ? (
        <EventHoverLink
          display={{ text: 'profile badges', icon: Award }}
          link={link}
          hoverContent={hoverContent}
        />
      ) : (
        <span className="inline-flex items-center gap-1 truncate">
          <Award className="size-3.5 shrink-0" />
          profile badges
        </span>
      )}
      <span className="shrink-0">by</span>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={`/${npubEncoded}`}
          className="text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          @{displayName}
        </Link>
      </ProfileHoverCard>
    </CommentContextRow>
  );
}

/** Comment context for non-profile addressable event roots (A tag). */
function GenericAddrCommentContext({ root, className, prefix }: { root: CommentRoot; className?: string; prefix: string }) {
  const { data: event, isLoading } = useAddrEvent(root.addr, root.relayHint ? [root.relayHint] : undefined);

  const isCommunity = root.rootKind === '34550' || root.addr?.kind === 34550;
  const rowPrefix = isCommunity && prefix === 'Commenting on' ? 'Posted in' : prefix;

  const display = event ? getEventDisplayName(event) : { text: getRootKindLabel(root.rootKind) };
  const link = event ? getRootLink(event) : undefined;

  // Build hover card content for addressable events
  const hoverContent = root.addr ? (
    <EmbeddedNaddr
      addr={{ kind: root.addr.kind, pubkey: root.addr.pubkey, identifier: root.addr.identifier }}
      className="border-0 rounded-none"
    />
  ) : undefined;

  return (
    <CommentContextRow prefix={rowPrefix} className={className} loading={isLoading}>
      {link && hoverContent ? (
        <EventHoverLink display={display} link={link} hoverContent={hoverContent} />
      ) : link ? (
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-primary hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {display.icon && <display.icon className="size-3.5 shrink-0" />}
          {display.text}
        </Link>
      ) : (
        <span className="truncate">{display.text}</span>
      )}
    </CommentContextRow>
  );
}

/** Comment context for regular event roots (E tag). */
function EventCommentContext({ root, className, prefix }: { root: CommentRoot; className?: string; prefix: string }) {
  const { data: event, isLoading } = useEvent(
    root.eventId,
    root.relayHint ? [root.relayHint] : undefined,
    root.authorHint,
  );

  // Kind 7 reactions get special treatment
  if (event?.kind === 7) {
    return <ReactionCommentContext event={event} className={className} prefix={prefix} />;
  }

  // Kind 1018 poll votes get special treatment
  if (event?.kind === 1018) {
    return <PollVoteCommentContext event={event} className={className} prefix={prefix} />;
  }

  const display = event ? getEventDisplayName(event) : { text: getRootKindLabel(root.rootKind) };
  const link = event ? getRootLink(event) : undefined;

  const hoverContent = root.eventId ? (
    <EmbeddedNote
      eventId={root.eventId}
      relays={root.relayHint ? [root.relayHint] : undefined}
      authorHint={root.authorHint}
      className="border-0 rounded-none"
      disableHoverCards
    />
  ) : undefined;

  return (
    <CommentContextRow prefix={prefix} className={className} loading={isLoading}>
      {link && hoverContent ? (
        <EventHoverLink display={display} link={link} hoverContent={hoverContent} />
      ) : (
        <span className="truncate">{display.text}</span>
      )}
    </CommentContextRow>
  );
}

/** Comment context for kind 7 reaction roots — shows "Commenting on {emoji} by @{name}". */
function ReactionCommentContext({ event, className, prefix }: { event: NostrEvent; className?: string; prefix: string }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const reactionLink = getRootLink(event);
  const profileLink = `/${nip19.npubEncode(event.pubkey)}`;

  return (
    <CommentContextRow prefix={prefix} className={className}>
      <Link
        to={reactionLink}
        className="text-primary hover:underline shrink-0 cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <ReactionEmoji content={event.content} tags={event.tags} className="inline-block h-[1.2em] w-[1.2em] align-text-bottom object-contain" />
      </Link>
      <span className="shrink-0">by</span>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-16 inline-block" />
      ) : (
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileLink}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            @{displayName}
          </Link>
        </ProfileHoverCard>
      )}
    </CommentContextRow>
  );
}

/** Comment context for kind 1018 poll vote roots — shows "Commenting on @{name}'s vote for {option}". */
function PollVoteCommentContext({ event, className, prefix }: { event: NostrEvent; className?: string; prefix: string }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const voteLink = getRootLink(event);
  const profileLink = `/${nip19.npubEncode(event.pubkey)}`;

  const voteLabel = usePollVoteLabel(event);

  return (
    <CommentContextRow prefix={prefix} className={className}>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-16 inline-block" />
      ) : (
        <ProfileHoverCard pubkey={event.pubkey} asChild>
          <Link
            to={profileLink}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            @{displayName}
          </Link>
        </ProfileHoverCard>
      )}
      <Link
        to={voteLink}
        className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <Vote className="size-3.5 shrink-0" />
        {voteLabel ? `vote for ${voteLabel}` : 'vote'}
      </Link>
    </CommentContextRow>
  );
}

/** Comment context for external content roots (I tag). */
function ExternalCommentContext({ root, className, prefix }: { root: CommentRoot; className?: string; prefix: string }) {
  const identifier = root.identifier ?? '';

  // ISBN identifiers get special treatment — show book title instead of raw ISBN
  if (identifier.startsWith('isbn:')) {
    return <IsbnCommentContext identifier={identifier} className={className} prefix={prefix} />;
  }

  // URL identifiers get special treatment — show page title with favicon.
  // Gatherer URLs are routed to a Scryfall-backed renderer that shows the
  // actual card name instead of the raw URL.
  if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
    const gathererCard = extractGathererCard(identifier);
    if (gathererCard) {
      return <GathererCardCommentContext card={gathererCard} url={identifier} className={className} prefix={prefix} />;
    }
    return <UrlCommentContext url={identifier} className={className} prefix={prefix} />;
  }

  // ISO 3166 country/subdivision identifiers get special treatment
  if (identifier.startsWith('iso3166:')) {
    return <CountryCommentContext identifier={identifier} className={className} prefix={prefix} />;
  }

  // Generic fallback for other external identifiers
  const link = `/i/${encodeURIComponent(identifier)}`;

  return (
    <CommentContextRow prefix={prefix} className={className}>
      <Link
        to={link}
        className="text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {identifier}
      </Link>
    </CommentContextRow>
  );
}

/** Comment context for URL identifiers — fetches and displays the page title with favicon. */
function UrlCommentContext({ url, className, prefix }: { url: string; className?: string; prefix: string }) {
  const { data: preview, isLoading } = useLinkPreview(url);
  const link = `/i/${encodeURIComponent(url)}`;

  let fallbackHost: string;
  try {
    fallbackHost = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    fallbackHost = url;
  }

  const title = preview?.title;

  return (
    <CommentContextRow prefix={prefix} className={className} loading={isLoading}>
      <ExternalFavicon url={url} size={14} className="shrink-0" />
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            {title || fallbackHost}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-80 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <LinkPreview url={url} className="border-0 rounded-none" navigateToComments />
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/** Internal: clickable country flag emoji that opens the country feed. */
function CountryPillBadge({ identifier, className }: { identifier: string; className?: string }) {
  const code = identifier.slice('iso3166:'.length);
  const info = getCountryInfo(code);
  const link = `/i/${encodeURIComponent(identifier)}`;

  const flag = info?.flag ?? '🌍';
  // Treat ISO codes with a curated custom flag (Tibet) as country-level
  // throughout the pill chrome — display its own name, drop the parent
  // country sub-line, and label it as a country rather than a region.
  const treatAsCountry = hasCustomFlag(code);
  const displayLabel = treatAsCountry
    ? info?.subdivisionName ?? info?.name ?? code
    : info?.subdivisionName ?? info?.name ?? code;
  const subLabel = !treatAsCountry && info?.subdivisionName && info.name ? info.name : null;
  const tierLabel = info?.subdivisionName && !treatAsCountry ? 'Region' : 'Country';
  const ariaLabel = info ? `Flag of ${displayLabel}` : code;

  return (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          to={link}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Posted from ${info?.name ?? code}`}
          className={cn(
            'group/flag inline-flex items-center justify-center shrink-0',
            'text-xl leading-none',
            'transition-transform duration-200',
            'motion-safe:hover:scale-110 motion-safe:active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full',
            className,
          )}
        >
          {/* CountryFlag swaps in a bundled SVG (Tibet's Snow Lion etc.)
              when the ISO code has no Unicode flag — emoji otherwise. */}
          <CountryFlag code={code} emoji={flag} label={ariaLabel} />
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-64 p-0 rounded-2xl shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <CountryFlag
            code={code}
            emoji={flag}
            label={ariaLabel}
            className="text-2xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span>{tierLabel}</span>
            </div>
            <p className="text-sm font-medium truncate mt-0.5">
              {displayLabel}
            </p>
            {subLabel && (
              <p className="text-xs text-muted-foreground truncate">
                {subLabel}
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Resolve whether a kind-1111 event should display country-rooted UI in the
 * current context. Shared by `CountryCommentPill` (renders a pill in the
 * card header) and `CountryFlagBackdrop` (renders a faded flag behind the
 * card). Returns `null` to suppress both; otherwise returns the resolved
 * country identifier so callers don't re-parse tags.
 */
function useCountryRootContext(event: NostrEvent): { iTag: string; code: string } | null {
  const countryFeed = useCountryFeed();

  if (event.kind !== 1111) return null;

  // If the direct parent is another kind-1111 comment, the body shows
  // "Replying to @user" — country chrome would be visual noise.
  const parentKind = event.tags.find(([name]) => name === 'k')?.[1];
  if (parentKind === '1111') return null;

  // Root I tag (uppercase = root identifier per NIP-22)
  const iTag = event.tags.find(([name]) => name === 'I')?.[1];
  if (!iTag || !iTag.startsWith('iso3166:')) return null;

  const code = iTag.slice('iso3166:'.length);

  // Suppress when already inside the matching country feed page — there the
  // chrome would just point back to the page the user is already on.
  if (countryFeed && countryFeed.countryCode === code.toUpperCase()) {
    return null;
  }

  return { iTag, code };
}

/**
 * Whether the given event is rendering with country chrome (the corner
 * flag pill) in the current context. Useful for sibling components that
 * want to coordinate styling.
 */
/**
 * Standalone country flag pill for kind-1111 events whose root is an ISO 3166
 * identifier. Intended to be rendered in the upper-right of `NoteCard`'s
 * header row so the post reads as a neighborhood entry instead of a comment.
 *
 * Visibility rules: see `useCountryRootContext`.
 *
 * Because the pill takes over the country-root presentation, the body-level
 * `CommentContext` is silent for country roots — see `CountryCommentContext`.
 */
export function CountryCommentPill({ event, className }: { event: NostrEvent; className?: string }) {
  const ctx = useCountryRootContext(event);
  if (!ctx) return null;
  return <CountryPillBadge identifier={ctx.iTag} className={className} />;
}

/**
 * Decorative flag backdrop for country-rooted kind-1111 posts has been
 * removed in favor of a cleaner card surface. The `CountryCommentPill`
 * in the upper-right of the header is now the sole country chrome for
 * world posts.
 */

/**
 * Body-level comment context for ISO 3166 roots — intentionally renders
 * nothing. The country pill is hoisted into the card header via
 * `CountryCommentPill`, so we suppress the in-body version to avoid
 * duplication.
 */
function CountryCommentContext(_props: { identifier: string; className?: string; prefix: string }) {
  return null;
}

/** Comment context for ISBN identifiers — fetches and displays the book title with hover preview. */
function IsbnCommentContext({ identifier, className, prefix }: { identifier: string; className?: string; prefix: string }) {
  const isbn = identifier.slice('isbn:'.length);
  const { data: bookInfo, isLoading } = useBookInfo(isbn);
  const link = `/i/${encodeURIComponent(identifier)}`;
  const displayText = bookInfo?.title ?? identifier;
  const coverUrl = bookInfo?.cover?.medium || bookInfo?.cover?.large;
  const authors = bookInfo?.authors?.map((a) => a.name).join(', ');

  return (
    <CommentContextRow prefix={prefix} className={className} loading={isLoading}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="size-3.5 shrink-0" />
            {displayText}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-72 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={bookInfo?.title || 'Book cover'}
                className="w-9 h-12 rounded object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
                <BookOpen className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="size-3 shrink-0" />
                <span>Book</span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {bookInfo?.title || `ISBN ${isbn}`}
              </p>
              {authors && (
                <p className="text-xs text-muted-foreground truncate">
                  by {authors}
                </p>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}

/**
 * Comment context for gatherer.wizards.com URLs — resolves the URL to a
 * Magic: The Gathering card via Scryfall and shows the card's real name
 * (e.g. "Xenagos, God of Revels") instead of the raw URL.
 */
function GathererCardCommentContext({
  card,
  url,
  className,
  prefix,
}: {
  card: GathererCard;
  url: string;
  className?: string;
  prefix: string;
}) {
  const lookup = useMemo(() => (
    card.kind === 'multiverse'
      ? { kind: 'multiverse' as const, multiverseId: card.multiverseId }
      : { kind: 'set' as const, set: card.set, number: card.number, lang: card.lang }
  ), [card]);
  const { data: scryCard, isLoading } = useScryfallCard(lookup);
  const link = `/i/${encodeURIComponent(url)}`;

  const displayText = scryCard?.name ?? 'Magic card';
  const coverUrl = scryCard ? cardPrimaryImage(scryCard, 'small') : undefined;

  return (
    <CommentContextRow prefix={prefix} className={className} loading={isLoading}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <Link
            to={link}
            className="inline-flex items-center gap-1 text-primary hover:underline truncate cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <CardsIcon className="size-3.5 shrink-0" />
            {displayText}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-72 p-0 rounded-2xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={scryCard?.name ?? 'Magic card'}
                className="w-9 h-12 rounded object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-9 h-12 rounded bg-secondary flex items-center justify-center shrink-0">
                <CardsIcon className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CardsIcon className="size-3 shrink-0" />
                <span>Magic Card</span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {scryCard?.name ?? 'Unknown card'}
              </p>
              {scryCard?.set_name && (
                <p className="text-xs text-muted-foreground truncate">
                  {scryCard.set_name}
                </p>
              )}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </CommentContextRow>
  );
}
