import {
  Activity,
  Award,
  BadgeCheck,
  Bell,
  Bird,
  BookMarked,
  BookOpen,
  Bookmark,
  Bot,
  CalendarDays,
  Camera,
  Clapperboard,
  Code,
  Earth,
  Film,
  HandHeart,
  HelpCircle,
  Highlighter,
  Info,
  List,
  MessageSquare,
  MessageSquareMore,
  Megaphone,
  Mic,
  Music,
  Newspaper,
  Palette,
  PartyPopper,
  Podcast,
  Repeat2,
  Search,
  ScrollText,
  Settings,
  Smile,
  SmilePlus,
  Stars,
  User,
  Users,
  Vote,
  WalletMinimal,
} from "lucide-react";
import { VERIFIED_PAGE_PATH } from "@/lib/agoraDefaults";
import { CardsIcon } from "@/components/icons/CardsIcon";
import { ChestIcon } from "@/components/icons/ChestIcon";
import { LogoIcon } from "@/components/icons/LogoIcon";

// ── Types ─────────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string }>;

/** Sentinel ID used to represent a visual divider in the sidebar order. */
export const SIDEBAR_DIVIDER_ID = "divider";

/** Returns true if the given sidebar order ID is a `nostr:` URI. */
export function isNostrUri(id: string): boolean {
  return id.startsWith("nostr:");
}

/** Returns true if the given sidebar order ID is an `nsite://` URI. */
export function isNsiteUri(id: string): boolean {
  return id.startsWith("nsite://");
}

/**
 * Returns true if the given sidebar order ID is an external content identifier
 * (i-tag value): an https:// URL or a prefixed identifier like `iso3166:US`.
 */
export function isExternalUri(id: string): boolean {
  return (
    id.startsWith("https://") ||
    id.startsWith("http://") ||
    id.startsWith("iso3166:") ||
    id.startsWith("isbn:")
  );
}

/** A sidebar-capable item with everything needed for display and navigation. */
export interface SidebarItemDef {
  /** Unique identifier stored in sidebarOrder. */
  id: string;
  /** Display label. */
  label: string;
  /** Navigation path (e.g. '/feed', '/notifications', '/vines'). */
  path: string;
  /** Icon component. */
  icon: IconComponent;
  /** If true, only shown when a user is logged in. */
  requiresAuth?: boolean;
  /** If true, only shown to platform admins (implies requiresAuth). */
  requiresAdmin?: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Single source of truth for known sidebar-capable items.
 *
 * Most of these no longer have dedicated pages after the fundraiser-platform
 * refocus, but the registry is still consumed by:
 *   - `useFeedSettings` to validate `sidebarOrder` entries persisted by older
 *     installs.
 *   - `ProfileSearchDropdown` to surface label-matching suggestions.
 *   - `CONTENT_KIND_ICONS` below to expose icons for use elsewhere (e.g.
 *     ExternalContentHeader, extraKinds, feedFilterUtils).
 */
export const SIDEBAR_ITEMS: SidebarItemDef[] = [
  // System pages
  {
    id: "wallet",
    label: "Wallet",
    path: "/wallet",
    icon: WalletMinimal,
    requiresAuth: true,
  },
  { id: "feed", label: "Feed", path: "/feed", icon: LogoIcon },
  { id: "campaigns", label: "Fundraisers", path: "/campaigns", icon: HandHeart },
  {
    id: "notifications",
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    requiresAuth: true,
  },
  {
    id: "messages",
    label: "Messages",
    path: "/messages",
    icon: MessageSquareMore,
  },
  { id: "search", label: "Search", path: "/search", icon: Search },
  {
    id: "verified",
    label: "Verified",
    path: VERIFIED_PAGE_PATH,
    icon: BadgeCheck,
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    path: "/bookmarks",
    icon: Bookmark,
    requiresAuth: true,
  },
  {
    id: "profile",
    label: "Profile",
    path: "/profile",
    icon: User,
    requiresAuth: true,
  },
  {
    id: "lists",
    label: "Lists",
    path: "/lists",
    icon: List,
    requiresAuth: true,
  },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  { id: "changelog", label: "Changelog", path: "/changelog", icon: ScrollText },
  { id: "help", label: "About", path: "/about", icon: Info },
  { id: "agent", label: "Agent", path: "/agent", icon: Bot },
  // Content types
  { id: "actions", label: "Pledges", path: "/pledges", icon: Megaphone },
  { id: "events", label: "Events", path: "/events", icon: CalendarDays },
  { id: "photos", label: "Photos", path: "/photos", icon: Camera },
  { id: "videos", label: "Videos", path: "/videos", icon: Film },
  { id: "articles", label: "Articles", path: "/articles", icon: Newspaper },
  { id: "highlights", label: "Highlights", path: "/highlights", icon: Highlighter },
  { id: "books", label: "Books", path: "/books", icon: BookMarked },
  { id: "vines", label: "Divines", path: "/vines", icon: Clapperboard },
  { id: "music", label: "Music", path: "/music", icon: Music },
  { id: "podcasts", label: "Podcasts", path: "/podcasts", icon: Podcast },
  { id: "polls", label: "Polls", path: "/polls", icon: Vote },
  { id: "packs", label: "Follow Packs", path: "/packs", icon: PartyPopper },
  { id: "colors", label: "Color Moments", path: "/colors", icon: Palette },
  { id: "decks", label: "Magic Decks", path: "/decks", icon: CardsIcon },
  { id: "treasures", label: "Treasures", path: "/treasures", icon: ChestIcon },
  { id: "emojis", label: "Emojis", path: "/emojis", icon: SmilePlus },
  { id: "development", label: "Development", path: "/development", icon: Code },
  { id: "badges", label: "Badges", path: "/badges", icon: Award },
  { id: "communities", label: "Groups", path: "/groups", icon: Users },
  { id: "world", label: "World", path: "/world", icon: Earth },
  { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: Activity },
];

/** Set of all known sidebar item IDs for quick lookup. */
export const SIDEBAR_ITEM_IDS = new Set(SIDEBAR_ITEMS.map((s) => s.id));

/**
 * Icons for content types used outside the sidebar (e.g. ContentSettings).
 * Feed-only kinds that don't have sidebar pages are included here too.
 */
export const CONTENT_KIND_ICONS: Record<string, IconComponent> = {
  posts: MessageSquare,
  comments: MessageSquareMore,
  reposts: Repeat2,
  "generic-reposts": Repeat2,
  reactions: SmilePlus,
  voice: Mic,
  "custom-emojis": Smile,
  statuses: SmilePlus,
  "bird-detections": Bird,
  constellations: Stars,
  ...Object.fromEntries(
    SIDEBAR_ITEMS.filter((s) => s.icon).map((s) => [s.id, s.icon]),
  ),
  videos: Film,
  books: BookOpen,
  vines: Clapperboard,
  music: Music,
  podcasts: Podcast,
  packs: PartyPopper,
  colors: Palette,
  decks: CardsIcon,
  treasures: ChestIcon,
  emojis: SmilePlus,
  development: Code,
  badges: HelpCircle,
  communities: Users,
  world: Earth,
  archive: HelpCircle,
  bluesky: HelpCircle,
  vanish: MessageSquareMore,
};

// ── Lookups ───────────────────────────────────────────────────────────────────

/**
 * Search sidebar items by label. Matches when the query is a prefix of the
 * full label or of any word within the label (e.g. "arch" matches "Archive"
 * and "Internet Archive" but not "Search"). Whole-label prefix matches are
 * sorted before word-boundary matches.
 */
export function searchSidebarItems(query: string): SidebarItemDef[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const prefixMatches: SidebarItemDef[] = [];
  const wordMatches: SidebarItemDef[] = [];

  for (const item of SIDEBAR_ITEMS) {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) {
      prefixMatches.push(item);
    } else {
      // Check if query matches the start of any word in the label
      const words = label.split(/\s+/);
      if (words.some((word) => word.startsWith(q))) {
        wordMatches.push(item);
      }
    }
  }

  return [...prefixMatches, ...wordMatches];
}
