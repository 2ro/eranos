import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Zap, Flame, MoreHorizontal, ClipboardCopy, ExternalLink, VolumeX, Flag, Bitcoin, Pin, X, QrCode, Check, Copy, Loader2, Download, Pencil, Trash2, RotateCcw, MessageSquare, Globe, Mail, Plus, GripVertical, ListPlus, Award, PanelLeft } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { NoteCard } from '@/components/NoteCard';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ProfileReactionButton } from '@/components/ProfileReactionButton';
import { FollowToggleButton } from '@/components/FollowButton';
import { ZapDialog } from '@/components/ZapDialog';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Nip05Badge, VerifiedNip05Text } from '@/components/Nip05Badge';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { usePinnedNotes } from '@/hooks/usePinnedNotes';

import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useProfileFeed, useProfileLikes as useProfileLikesInfinite, useTabFeed, filterByTab } from '@/hooks/useProfileFeed';
import type { ProfileTab as CoreProfileTab } from '@/hooks/useProfileFeed';
import { useProfileMedia } from '@/hooks/useProfileMedia';
import { MediaCollage, MediaCollageSkeleton } from '@/components/MediaCollage';
import { useProfileSupplementary } from '@/hooks/useProfileData';
import { useWallComments } from '@/hooks/useWallComments';
import { FlatThreadedReplyList } from '@/components/ThreadedReplyList';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { genUserName } from '@/lib/genUserName';

import { canZap } from '@/lib/canZap';
import { openUrl } from '@/lib/downloadFile';
import { EmojifiedText } from '@/components/CustomEmoji';
import { BioContent } from '@/components/BioContent';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ReportDialog } from '@/components/ReportDialog';
import { AddToListDialog } from '@/components/AddToListDialog';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import { isAudioUrl, isImageUrl, isVideoUrl } from '@/lib/mediaTypeDetection';
import { VideoPlayer } from '@/components/VideoPlayer';

import { useUserStatus } from '@/hooks/useUserStatus';
import { useNip85UserStats } from '@/hooks/useNip85Stats';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useProfileTabs } from '@/hooks/useProfileTabs';
import { usePublishProfileTabs } from '@/hooks/usePublishProfileTabs';

import { FollowQRDialog } from '@/components/FollowQRDialog';
import { ProfileRecoveryDialog } from '@/components/ProfileRecoveryDialog';
import { GiveBadgeDialog } from '@/components/GiveBadgeDialog';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { ProfileTabEditModal } from '@/components/ProfileTabEditModal';
import { useResolveTabFilter } from '@/hooks/useResolveTabFilter';
import type { ProfileTab, ProfileTabsData, TabFilter, TabVarDef } from '@/lib/profileTabsEvent';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  horizontalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { formatNumber } from '@/lib/formatNumber';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { useActiveTabIndicator } from '@/components/SubHeaderBarContext';
import { TabButton } from '@/components/TabButton';
import type { AddrCoords } from '@/hooks/useEvent';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { impactMedium } from '@/lib/haptics';
import { cn } from '@/lib/utils';

import type { FeedItem } from '@/lib/feedUtils';
import type { NostrEvent } from '@nostrify/nostrify';
import QRCode from 'qrcode';
import { isWeatherFieldLabel } from '@/lib/weatherStation';
import { WeatherStationCard } from '@/components/WeatherStationCard';

const STREAK_WINDOW_HOURS = 24;
const STREAK_DISPLAY_LIMIT = 99;

/** Calculate posting streak: consecutive kind 1 posts within 24-hour windows. */
function calculateStreak(posts: NostrEvent[]): number {
  if (!posts || posts.length === 0) return 0;

  const kind1Posts = posts.filter((e) => e.kind === 1);
  if (kind1Posts.length === 0) return 0;

  const sorted = [...kind1Posts].sort((a, b) => b.created_at - a.created_at);
  const windowSeconds = STREAK_WINDOW_HOURS * 3600;

  let streak = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i].created_at - sorted[i + 1].created_at;
    if (gap <= windowSeconds) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/** Parse the custom "fields" array from kind 0 metadata content. */
function parseProfileFields(content: string): Array<{ label: string; value: string }> {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.fields)) {
      return parsed.fields
        .filter((f: unknown) => Array.isArray(f) && f.length >= 2)
        .map((f: string[]) => ({ label: f[0], value: f[1] }));
    }
  } catch {
    // Invalid JSON
  }
  return [];
}

// useFollowList is now imported from @/hooks/useFollowActions

// ----- Profile More Menu -----

interface ProfileMoreMenuProps {
  pubkey: string;
  displayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwnProfile?: boolean;
  authorEvent?: NostrEvent;
}

function ProfileMoreMenu({ pubkey, displayName, open, onOpenChange, isOwnProfile, authorEvent }: ProfileMoreMenuProps) {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const { addMute, removeMute, isMuted } = useMuteList();
  const userMuted = isMuted('pubkey', pubkey);
  const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();
  const sidebarId = `nostr:${npubEncoded}`;
  const isInSidebar = orderedItems.includes(sidebarId);
  const [reportOpen, setReportOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [giveBadgeOpen, setGiveBadgeOpen] = useState(false);
  const [followQROpen, setFollowQROpen] = useState(false);
  const zapTriggerRef = useRef<HTMLSpanElement>(null);
  const author = useAuthor(pubkey);
  const showZap = !isOwnProfile && authorEvent && canZap(author.data?.metadata);

  const close = () => onOpenChange(false);
  const openAfterClose = (setter: (v: boolean) => void) => {
    close();
    setTimeout(() => setter(true), 150);
  };
  const handleFollowQR = () => openAfterClose(setFollowQROpen);

  const handleCopyPubkey = () => {
    navigator.clipboard.writeText(npubEncoded);
    toast({ title: 'Public key copied to clipboard' });
    close();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/${npubEncoded}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Profile link copied to clipboard' });
    close();
  };

  const handleMuteUser = () => {
    const muteItem = { type: 'pubkey' as const, value: pubkey };
    const mutation = userMuted ? removeMute : addMute;
    mutation.mutate(muteItem, {
      onSuccess: () => {
        toast({ title: userMuted ? `Unmuted @${displayName}` : `Muted @${displayName}` });
      },
      onError: () => {
        toast({ title: userMuted ? 'Failed to unmute user' : 'Failed to mute user', variant: 'destructive' });
      },
    });
    close();
  };

  const handleReport = () => openAfterClose(setReportOpen);
  const handleAddToList = () => openAfterClose(setAddToListOpen);

  const handleToggleSidebar = () => {
    if (isInSidebar) {
      removeFromSidebar(sidebarId);
      toast({ title: 'Removed from sidebar' });
    } else {
      addToSidebar(sidebarId);
      toast({ title: 'Added to sidebar' });
    }
    close();
  };

  const handleRecovery = () => openAfterClose(setRecoveryOpen);
  const handleGiveBadge = () => openAfterClose(setGiveBadgeOpen);
  const handleWriteLetter = () => {
    close();
    navigate(`/letters/compose?to=${npubEncoded}`);
  };
  const handleZap = () => {
    close();
    setTimeout(() => zapTriggerRef.current?.click(), 150);
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">Profile options</DialogTitle>

        <div className="py-1">
          <MenuRow
            icon={<ClipboardCopy className="size-5" />}
            label="Copy public key"
            onClick={handleCopyPubkey}
          />
          <MenuRow
            icon={<ClipboardCopy className="size-5" />}
            label="Copy profile link"
            onClick={handleCopyLink}
          />
          <MenuRow
            icon={<ListPlus className="size-5" />}
            label="Add to list"
            onClick={handleAddToList}
          />
          <MenuRow
            icon={isInSidebar ? <Trash2 className="size-5" /> : <PanelLeft className="size-5" />}
            label={isInSidebar ? 'Remove from sidebar' : 'Add to sidebar'}
            onClick={handleToggleSidebar}
          />
        </div>

        {isOwnProfile && (
          <>
            <Separator />

            <div className="py-1">
              <MenuRow
                icon={<QrCode className="size-5" />}
                label="Share follow link"
                onClick={handleFollowQR}
              />
              <MenuRow
                icon={<RotateCcw className="size-5" />}
                label="Profile recovery"
                onClick={handleRecovery}
              />
            </div>
          </>
        )}

        {!isOwnProfile && (
          <>
            <Separator />

            <div className="py-1">
              {showZap && (
                <MenuRow
                  icon={<Zap className="size-5" />}
                  label="Zap"
                  onClick={handleZap}
                />
              )}
              {user && (
                <MenuRow
                  icon={<Award className="size-5" />}
                  label="Award badge"
                  onClick={handleGiveBadge}
                />
              )}
              {user && (
                <MenuRow
                  icon={<Mail className="size-5" />}
                  label="Write a letter"
                  onClick={handleWriteLetter}
                />
              )}
              <MenuRow
                icon={<VolumeX className="size-5" />}
                label={userMuted ? `Unmute @${displayName}` : `Mute @${displayName}`}
                onClick={handleMuteUser}
              />
              <MenuRow
                icon={<Flag className="size-5" />}
                label={`Report @${displayName}`}
                onClick={handleReport}
                destructive
              />
            </div>
          </>
        )}

        <Separator />

        <div className="py-1">
          <Button
            variant="ghost"
            className="w-full h-auto py-3 text-[15px] font-medium text-muted-foreground hover:bg-secondary/60 rounded-none"
            onClick={close}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ReportDialog pubkey={pubkey} open={reportOpen} onOpenChange={setReportOpen} />

    <AddToListDialog
      pubkey={pubkey}
      displayName={displayName}
      open={addToListOpen}
      onOpenChange={setAddToListOpen}
    />

    {isOwnProfile && (
      <>
        <ProfileRecoveryDialog
          open={recoveryOpen}
          onOpenChange={setRecoveryOpen}
        />
        <FollowQRDialog
          open={followQROpen}
          onOpenChange={setFollowQROpen}
        />
      </>
    )}

    {!isOwnProfile && (
      <GiveBadgeDialog
        open={giveBadgeOpen}
        onOpenChange={setGiveBadgeOpen}
        recipientPubkey={pubkey}
        recipientName={displayName}
      />
    )}

    {showZap && authorEvent && (
      <ZapDialog target={authorEvent}>
        <span ref={zapTriggerRef} className="hidden" />
      </ZapDialog>
    )}
  </>
  );
}

function MenuRow({ icon, label, onClick, destructive }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 w-full px-5 py-3 text-[15px] transition-colors hover:bg-secondary/60',
        destructive ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ----- Following User Row -----

function FollowingUserRow({ pubkey, onNavigate }: { pubkey: string; onNavigate?: () => void }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <Link
      to={`/${npubEncoded}`}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
    >
      {author.isLoading ? (
        <>
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="space-y-1.5 min-w-0">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </>
      ) : (
        <>
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm truncate">
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
              ) : displayName}
            </div>
            {metadata?.nip05 && (
              <VerifiedNip05Text nip05={metadata.nip05} pubkey={pubkey} className="text-xs text-muted-foreground truncate block" />
            )}
            {metadata?.about && (
              <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{metadata.about}</div>
            )}
          </div>
        </>
      )}
    </Link>
  );
}

// ----- Following List Modal -----

interface FollowingListModalProps {
  pubkeys: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
}

function FollowingListModal({ pubkeys, open, onOpenChange, displayName }: FollowingListModalProps) {
  const handleNavigate = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-bold">{displayName} follows</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full size-8"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {pubkeys.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Not following anyone yet.
            </div>
          ) : (
            pubkeys.map((pk) => <FollowingUserRow key={pk} pubkey={pk} onNavigate={handleNavigate} />)
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

type EditableTab = { label: string; isCore: boolean; tab?: ProfileTab };

function SortableTabChip({
  tab, active, onSelect, onRemove, onEdit,
}: {
  tab: EditableTab;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onEdit?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.label });
  const chipRef = useRef<HTMLDivElement>(null);
  useActiveTabIndicator(active, chipRef);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (chipRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      style={{ transform: transform ? DndCSS.Transform.toString({ ...transform, x: Math.round(transform.x), y: Math.round(transform.y) }) : undefined, transition }}
      className={cn(
        'shrink-0 relative flex items-stretch group/chip px-1 text-sm font-medium select-none whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground',
        isDragging && 'opacity-60 z-50',
      )}
      {...attributes}
    >
      {/* Grip handle */}
      <span
        {...listeners}
        className="shrink-0 flex items-center cursor-grab active:cursor-grabbing touch-none pr-1"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4 text-muted-foreground/40" />
      </span>

      {/* Tab label — tap navigates */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="py-3.5 pr-1"
      >
        {tab.label}
      </button>

      {/* Edit — only rendered for active custom (non-core) tabs */}
      {active && !tab.isCore && onEdit && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="shrink-0 flex items-center justify-center py-3.5 px-1.5 text-muted-foreground/50 hover:text-primary transition-colors"
          aria-label={`Edit ${tab.label}`}
        >
          <Pencil className="size-3.5" />
        </button>
      )}

      {/* × — only rendered when active */}
      {active && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 flex items-center justify-center text-xl leading-none font-bold py-3.5 pl-1 pr-1 text-muted-foreground/50 hover:text-destructive transition-colors"
          aria-label={`Remove ${tab.label}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ----- Favicon (mobile) -----



// ----- Bitcoin QR Modal (mobile) -----

function BitcoinQRModal({ address }: { address: string }) {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    QRCode.toDataURL(`bitcoin:${address}`, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).then(setQrUrl).catch(console.error);
  }, [address]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bitcoin address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DialogContent className="sm:max-w-[360px] p-6 overflow-hidden rounded-2xl [&>button]:top-6 [&>button]:right-6">
      <div className="min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <Bitcoin className="size-4 text-white" />
            </div>
            <span>Bitcoin</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center my-5">
          <div className="bg-white p-3 rounded-xl">
            {qrUrl ? (
              <img src={qrUrl} alt="Bitcoin QR" className="size-[220px]" />
            ) : (
              <div className="size-[220px] bg-muted animate-pulse rounded" />
            )}
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-2 w-full bg-secondary/60 hover:bg-secondary/80 transition-colors rounded-lg pl-3 pr-2.5 py-2.5 text-left cursor-pointer overflow-hidden"
        >
          <span className="min-w-0 font-mono text-xs truncate">{address}</span>
          <span className="shrink-0 ml-auto">
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4 text-muted-foreground" />}
          </span>
        </button>
      </div>
    </DialogContent>
  );
}

// ----- Profile field helpers -----

/** Simple email regex for display purposes. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bech32 charset used by NIP-19 identifiers. */
const B32 = '023456789acdefghjklmnpqrstuvwxyz';

/** Regex that matches nostr:<nip19> URIs. */
const NOSTR_URI_REGEX = new RegExp(`^nostr:(note1|nevent1|naddr1|npub1|nprofile1)[${B32}]+$`);

/** Parse a nostr: URI value and return embed info, or null if not a valid nostr URI. */
function parseNostrUri(value: string): { type: 'note'; eventId: string } | { type: 'nevent'; eventId: string; relays?: string[]; author?: string } | { type: 'naddr'; addr: AddrCoords } | { type: 'profile'; pubkey: string } | null {
  const trimmed = value.trim();
  if (!NOSTR_URI_REGEX.test(trimmed)) return null;
  try {
    const bech32 = trimmed.slice('nostr:'.length);
    const decoded = nip19.decode(bech32);
    switch (decoded.type) {
      case 'note':
        return { type: 'note', eventId: decoded.data as string };
      case 'nevent':
        return { type: 'nevent', eventId: decoded.data.id, relays: decoded.data.relays, author: decoded.data.author };
      case 'naddr':
        return { type: 'naddr', addr: decoded.data as AddrCoords };
      case 'npub':
        return { type: 'profile', pubkey: decoded.data as string };
      case 'nprofile':
        return { type: 'profile', pubkey: decoded.data.pubkey };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ----- Inline Profile Field (mobile) -----

function ProfileFieldInline({ field }: { field: { label: string; value: string } }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const isBtc = field.label === '$BTC';
  const safeUrl = sanitizeUrl(field.value);
  const isUrl = !!safeUrl;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(field.value);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bitcoin address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isBtc) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="size-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
          <Bitcoin className="size-3 text-white" />
        </div>
        <span className="text-sm font-semibold shrink-0">Bitcoin</span>
        <span className="text-sm text-muted-foreground font-mono truncate">{field.value.slice(0, 12)}…{field.value.slice(-6)}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
            title="Copy address"
          >
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          </button>
          <Dialog>
            <DialogTrigger asChild>
              <button className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary" title="Show QR code">
                <QrCode className="size-4" />
              </button>
            </DialogTrigger>
            <BitcoinQRModal address={field.value} />
          </Dialog>
          <a
            href={`https://mempool.space/address/${field.value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
            title="View on mempool.space"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    );
  }

  if (isWeatherFieldLabel(field.label)) {
    return <WeatherFieldInline value={field.value} />;
  }

  // Nostr URI: render embedded event
  const nostrEmbed = parseNostrUri(field.value);
  if (nostrEmbed) {
    return (
      <div className="min-w-0">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        {nostrEmbed.type === 'note' && (
          <EmbeddedNote eventId={nostrEmbed.eventId} className="mt-1" />
        )}
        {nostrEmbed.type === 'nevent' && (
          <EmbeddedNote eventId={nostrEmbed.eventId} relays={nostrEmbed.relays} authorHint={nostrEmbed.author} className="mt-1" />
        )}
        {nostrEmbed.type === 'naddr' && (
          <EmbeddedNaddr addr={nostrEmbed.addr} className="mt-1" />
        )}
        {nostrEmbed.type === 'profile' && (
          <Link to={`/${nip19.npubEncode(nostrEmbed.pubkey)}`} className="text-sm text-primary hover:underline">
            {nip19.npubEncode(nostrEmbed.pubkey).slice(0, 16)}...
          </Link>
        )}
      </div>
    );
  }

  // Email field: render as mailto link
  const isEmail = field.label.toLowerCase() === 'email' && EMAIL_REGEX.test(field.value);
  if (isEmail) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <Mail className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
        <a href={`mailto:${field.value}`} className="text-sm text-primary hover:underline truncate">
          {field.value}
        </a>
      </div>
    );
  }

  if (isUrl && safeUrl && isAudioUrl(safeUrl)) {
    return <MiniAudioPlayer src={safeUrl} label={field.label || undefined} />;
  }

  if (isUrl && safeUrl && isImageUrl(safeUrl)) {
    return (
      <div className="min-w-0">
        {field.label && <div className="text-sm text-muted-foreground mb-1">{field.label}</div>}
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={safeUrl}
            alt={field.label || 'Profile image'}
            className="w-full max-w-sm rounded-lg object-cover"
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  if (isUrl && safeUrl && isVideoUrl(safeUrl)) {
    return (
      <div className="min-w-0">
        {field.label && <div className="text-sm text-muted-foreground mb-1">{field.label}</div>}
        <div className="rounded-lg overflow-hidden max-w-sm">
          <VideoPlayer src={safeUrl} />
        </div>
      </div>
    );
  }

  if (isUrl && safeUrl) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <ExternalFavicon url={safeUrl} size={16} className="shrink-0" />
        <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline truncate"
        >
          {safeUrl.replace(/^https?:\/\//, '')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
      <span className="text-sm truncate">{field.value}</span>
    </div>
  );
}

function WeatherFieldInline({ value }: { value: string }) {
  return <WeatherStationCard value={value} compact />;
}

// ----- Pinned Label -----

function PinnedLabel({ isOwn, onUnpin }: { isOwn: boolean; onUnpin: () => void }) {
  if (isOwn) {
    return (
      <button
        className="group flex items-center gap-1.5 text-xs text-muted-foreground px-4 pt-3 pb-0 hover:text-destructive transition-colors"
        onClick={(e) => { e.stopPropagation(); onUnpin(); }}
      >
        <Pin className="size-3 rotate-45" />
        <span className="group-hover:hidden">Pinned</span>
        <span className="hidden group-hover:inline">Unpin?</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-4 pt-3 pb-0">
      <Pin className="size-3 rotate-45" />
      <span>Pinned</span>
    </div>
  );
}

// ----- Profile Image Lightbox -----

function ProfileImageLightbox({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' || target.closest('button') || target.closest('[data-gallery-topbar]')) return;
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openUrl(imageUrl);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

      <div data-gallery-topbar className="absolute left-0 right-0 z-10 flex items-center justify-end px-4 py-3 safe-area-inset-top">
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownload}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Open original"
          >
            <Download className="size-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="relative z-[1] flex items-center justify-center w-full h-full px-4 py-16 sm:px-16">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          className={cn(
            'max-w-full max-h-full object-contain rounded-lg select-none transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setIsLoaded(true)}
          draggable={false}
        />
      </div>
    </div>,
    document.body,
  );
}

function ProfileBannerImage({ src, onClick }: { src: string; onClick: () => void }) {
  const [useBlobFallback, setUseBlobFallback] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUseBlobFallback(false);
    setBlobUrl(undefined);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!blobUrl) return;
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  useEffect(() => {
    if (!useBlobFallback) return;

    const controller = new AbortController();

    void fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load banner: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        setBlobUrl(URL.createObjectURL(blob));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });

    return () => controller.abort();
  }, [src, useBlobFallback]);

  const imageSrc = blobUrl ?? (useBlobFallback ? undefined : src);

  if (failed) {
    return <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />;
  }

  return (
    <>
      {useBlobFallback && !blobUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
      )}
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          className="w-full h-full object-cover cursor-pointer"
          referrerPolicy="no-referrer"
          decoding="async"
          onClick={onClick}
          onError={() => {
            if (blobUrl) {
              setFailed(true);
            } else {
              setUseBlobFallback(true);
            }
          }}
        />
      )}
    </>
  );
}

// ----- Main Component -----

const CORE_TAB_LABELS = ['Posts', 'Posts & replies', 'Media', 'Badges', 'Likes', 'Wall'];
const DEFAULT_TAB_LABELS = ['Posts', 'Posts & replies', 'Media', 'Likes', 'Wall'];

// Map from display label → internal tab id for core tabs
const CORE_TAB_IDS: Record<string, string> = {
  'Posts': 'posts', 'Posts & replies': 'replies',
  'Media': 'media', 'Badges': 'badges', 'Likes': 'likes', 'Wall': 'wall',
};

export function ProfilePage() {
  const { config } = useAppContext();
  const params = useParams();
  const npub = params.npub ?? params.nip19;
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<CoreProfileTab | string>('posts');
  const [sidebarMediaUrl, setSidebarMediaUrl] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [followQROpen, setFollowQROpen] = useState(false);
  const [followingModalOpen, setFollowingModalOpen] = useState(false);
  const [followersModalOpen, setFollowersModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Determine if the URL param is a NIP-05 identifier (contains @ or is a domain-like string)
  const isNip05Param = useMemo(() => {
    if (!npub) return false;
    // If it contains @, it's a NIP-05 identifier (e.g., user@domain.com)
    if (npub.includes('@')) return true;
    // If it contains a dot and doesn't start with npub1/nprofile1, it's a domain (e.g., fiatjaf.com)
    if (npub.includes('.') && !npub.startsWith('npub1') && !npub.startsWith('nprofile1')) return true;
    return false;
  }, [npub]);

  // Resolve NIP-05 identifier to pubkey if needed.
  // Use `isPending` (not `isLoading`) so the skeleton shows during the initial
  // React Query render where fetchStatus is still 'idle' before the first fetch
  // fires — isLoading (= isPending && isFetching) would be false in that window,
  // incorrectly triggering the "User not found" branch on a hard refresh.
  const { data: nip05Pubkey, isPending: nip05Loading } = useNip05Resolve(isNip05Param ? npub : undefined);

  // Determine pubkey: from NIP-05 resolution, NIP-19 decoding, or logged-in user
  const pubkey = useMemo(() => {
    if (npub) {
      // If it's a NIP-05 identifier, use the resolved pubkey
      if (isNip05Param) {
        return nip05Pubkey ?? undefined;
      }
      // Otherwise try to decode as NIP-19
      try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') return decoded.data;
        if (decoded.type === 'nprofile') return decoded.data.pubkey;
      } catch {
        return undefined;
      }
    }
    return user?.pubkey;
  }, [npub, user, isNip05Param, nip05Pubkey]);

  // Custom profile tabs from kind 16769
  const profileTabsQuery = useProfileTabs(pubkey);

  // Extract tabs and vars from the kind 16769 data
  const profileTabsData = useMemo<ProfileTabsData | null>(() => {
    if (!profileTabsQuery.isFetched) return null;
    return profileTabsQuery.data ?? null;
  }, [profileTabsQuery.data, profileTabsQuery.isFetched]);

  const profileSavedTabs = useMemo<ProfileTab[]>(() => {
    return profileTabsData?.tabs ?? [];
  }, [profileTabsData]);

  const profileVars = useMemo(() => profileTabsData?.vars ?? [], [profileTabsData]);

  const { publishProfileTabs, isPending: isPublishingTabs } = usePublishProfileTabs();

  // Tab edit mode (inline reorder/remove/add)
  const [tabEditMode, setTabEditMode] = useState(false);

  // All tabs as a flat ordered list for the drag UI — core tabs have isCore=true and can't be removed
// ----- Followers List Modal (paginated via kind:3 #p queries) -----

const FOLLOWERS_PAGE_SIZE = 20;

interface FollowersPage {
  pubkeys: string[];
  oldestTimestamp: number | undefined;
}

interface FollowersListModalProps {
  pubkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
}

function FollowersListModal({ pubkey, open, onOpenChange, displayName }: FollowersListModalProps) {
  const handleNavigate = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { nostr } = useNostr();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<FollowersPage, Error>({
    queryKey: ['followers-list', pubkey],
    queryFn: async ({ pageParam, signal }) => {
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const filter: import('@nostrify/nostrify').NostrFilter = {
        kinds: [3],
        '#p': [pubkey],
        limit: FOLLOWERS_PAGE_SIZE,
        ...(pageParam ? { until: pageParam as number } : {}),
      };

      const events = await nostr.query([filter], { signal: querySignal });

      // Deduplicate by author (kind 3 is replaceable — keep latest per author)
      const seen = new Set<string>();
      const unique: NostrEvent[] = [];
      const sorted = [...events].sort((a, b) => b.created_at - a.created_at);
      for (const ev of sorted) {
        if (!seen.has(ev.pubkey)) {
          seen.add(ev.pubkey);
          unique.push(ev);
        }
      }

      const oldestTimestamp = sorted.length > 0
        ? sorted[sorted.length - 1].created_at
        : undefined;

      return {
        pubkeys: unique.map((ev) => ev.pubkey),
        oldestTimestamp,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pubkeys.length === 0 || lastPage.oldestTimestamp === undefined) {
        return undefined;
      }
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: open && !!pubkey,
    staleTime: 60 * 1000,
  });

  // Deduplicate across pages
  const allFollowers = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const page of data.pages) {
      for (const pk of page.pubkeys) {
        if (!seen.has(pk)) {
          seen.add(pk);
          result.push(pk);
        }
      }
    }
    return result;
  }, [data]);

  const { ref: loadMoreRef, inView } = useInView({ threshold: 0 });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-bold">{displayName}'s followers</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full size-8"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : allFollowers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No followers found.
            </div>
          ) : (
            <>
              {allFollowers.map((pk) => <FollowingUserRow key={pk} pubkey={pk} onNavigate={handleNavigate} />)}
              {hasNextPage && (
                <div ref={loadMoreRef} className="py-4 flex justify-center">
                  {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
                </div>
              )}
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

type EditableTab = { label: string; isCore: boolean; tab?: ProfileTab };
  const [localTabs, setLocalTabs] = useState<EditableTab[]>([]);
  const [tabModalOpen, setTabModalOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<ProfileTab | undefined>(undefined);

  // The ordered tab list for view mode:
  // - null (no kind 16769 event) → show all 5 defaults
  // - [] (event exists, all removed) → show nothing
  // - [...] (event with tabs) → show exactly those
  const viewTabs: EditableTab[] = useMemo(() => {
    if (profileTabsData === null) {
      // No event yet — show defaults (subset of core tabs)
      return DEFAULT_TAB_LABELS.map((label) => ({ label, isCore: true }));
    }
    // Event exists — use its tab list (may be empty)
    return profileTabsData.tabs.map((t) =>
      CORE_TAB_LABELS.includes(t.label)
        ? { label: t.label, isCore: true }
        : { label: t.label, isCore: false, tab: t },
    );
  }, [profileTabsData]);

  // Derive the ID of the first visible tab (used as default selection).
  const firstTabId = useMemo(() => {
    if (viewTabs.length === 0) return 'posts';
    const first = viewTabs[0];
    return CORE_TAB_IDS[first.label] ?? first.label;
  }, [viewTabs]);

  // When profile tabs finish loading, focus the leftmost tab.
  useEffect(() => {
    if (profileTabsQuery.isFetched) {
      setActiveTab(firstTabId);
    }
  }, [profileTabsQuery.isFetched, firstTabId]);

  const enterTabEditMode = () => {
    setLocalTabs(viewTabs);
    setTabEditMode(true);
  };

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalTabs((prev) => {
        const oldIdx = prev.findIndex((t) => t.label === active.id);
        const newIdx = prev.findIndex((t) => t.label === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const handleRemoveLocalTab = (label: string) => {
    setLocalTabs((prev) => prev.filter((t) => t.label !== label));
  };

  // Canonical NIP-01 filters for core tabs so other clients can interpret the event.
  // Values are interpolated with the actual pubkey (not $me) since these are concrete filters.
  const CORE_TAB_FILTERS: Record<string, TabFilter> = pubkey ? {
    'Posts': { kinds: [1, 6], authors: [pubkey] },
    'Posts & replies': { authors: [pubkey] },
    'Media': { kinds: [1], authors: [pubkey] },
    'Badges': { kinds: [10008, 30008], authors: [pubkey] },
    'Likes': { kinds: [7], authors: [pubkey] },
    'Wall': { kinds: [1111], '#A': [`0:${pubkey}:`] },
  } : {};

  const handleSaveTabEdit = async () => {
    // Publish ALL tabs in order — core tabs get canonical filters,
    // custom tabs keep their full filter objects
    const allTabs: ProfileTab[] = localTabs.map((t) =>
      t.tab ?? { label: t.label, filter: CORE_TAB_FILTERS[t.label] ?? {} },
    );
    await publishProfileTabs({ tabs: allTabs, vars: profileVars });
    // If the active tab was removed, fall back to the first remaining tab
    const remainingIds = localTabs.map((t) => CORE_TAB_IDS[t.label] ?? t.label);
    if (!remainingIds.includes(activeTab)) {
      setActiveTab(remainingIds[0] ?? 'posts');
    }
    setTabEditMode(false);
  };

  const handleOpenAddCustomTab = () => { setEditingTab(undefined); setTabModalOpen(true); };

  // Called from the add/edit modal — in edit mode append to localTabs; otherwise publish immediately
  const handleSaveTab = async (tab: ProfileTab) => {
    if (tabEditMode) {
      setLocalTabs((prev) =>
        editingTab
          ? prev.map((t) => t.label === editingTab.label ? { label: tab.label, isCore: false, tab } : t)
          : [...prev, { label: tab.label, isCore: false, tab }],
      );
    } else {
      const base = editingTab
        ? profileSavedTabs.map((t) => t.label === editingTab.label ? tab : t)
        : [...profileSavedTabs, tab];
      await publishProfileTabs({ tabs: base, vars: profileVars });
    }
  };

  const dndSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Drop active tab if it was deleted
  useEffect(() => {
    const isCoreTab = ['posts', 'replies', 'media', 'badges', 'likes', 'wall'].includes(activeTab);
    if (!isCoreTab && !profileSavedTabs.find((t) => t.label === activeTab)) {
      setActiveTab(firstTabId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSavedTabs, firstTabId]);

  // Whether the profile has any visible tabs.
  const hasTabs = viewTabs.length > 0;

  // Infinite-scroll profile feed (posts/replies/media).
  // The first page piggybacks kind 0, seeding the author cache so the
  // profile header renders from the same relay round-trip as the feed.
  const {
    data: feedData,
    isPending: feedPending,
    fetchNextPage: fetchNextFeedPage,
    hasNextPage: hasNextFeedPage,
    isFetchingNextPage: isFetchingNextFeedPage,
  } = useProfileFeed(
    pubkey,
    (['posts', 'replies', 'media', 'likes', 'wall', 'badges'].includes(activeTab) ? activeTab : 'posts') as CoreProfileTab,
    hasTabs,
  );

  // Kind 0 — resolved from the author cache (seeded by the feed query above).
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const bannerUrl = sanitizeUrl(metadata?.banner);
  const profileStatus = useUserStatus(pubkey);

  // Refetch the author's profile whenever we navigate to this profile page.
  useEffect(() => {
    if (pubkey) {
      queryClient.refetchQueries({ queryKey: ['author', pubkey] });
    }
  }, [pubkey, queryClient]);
  const metadataEvent = author.data?.event;
  const displayName = metadata?.name || (pubkey ? genUserName(pubkey) : 'Anonymous');

  // Kind 3 + 10001 — fetched separately so the large contact list
  // doesn't block the profile header or feed from rendering.
  const { data: supplementary } = useProfileSupplementary(pubkey);

  // Parse profile fields from the raw kind 0 event content (website and lightning are shown in the header instead)
  const fields = useMemo(() => {
    return metadataEvent?.content ? parseProfileFields(metadataEvent.content) : [];
  }, [metadataEvent?.content]);

  useSeoMeta({
    title: `${displayName} | ${config.appName}`,
    description: metadata?.about || 'Nostr profile',
  });

  // Profile media — dedicated search query via relay.ditto.pub (video:true image:true)
  const {
    data: mediaData,
    isPending: mediaPending,
    fetchNextPage: fetchNextMediaPage,
    hasNextPage: hasNextMediaPage,
    isFetchingNextPage: isFetchingNextMediaPage,
  } = useProfileMedia(pubkey, hasTabs);

  // Infinite-scroll likes
  const {
    data: likesData,
    isPending: likesPending,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
  } = useProfileLikesInfinite(pubkey, hasTabs && activeTab === 'likes');

  // Wall comments (NIP-22 kind 1111 on user's kind 0, filtered by their follow list)
  const wallFollowList = useMemo(() => supplementary?.following, [supplementary?.following]);
  const {
    data: wallData,
    isPending: wallPending,
    fetchNextPage: fetchNextWallPage,
    hasNextPage: hasNextWallPage,
    isFetchingNextPage: isFetchingNextWallPage,
  } = useWallComments(pubkey, hasTabs ? wallFollowList : undefined);

  // Synthetic kind 0 event for the ComposeBox replyTo (NIP-22 comments on the profile)
  const wallReplyTarget = useMemo((): NostrEvent | undefined => {
    if (!pubkey) return undefined;
    // Use the real kind 0 event if available, otherwise build a minimal synthetic one
    if (metadataEvent) return metadataEvent;
    return {
      id: '',
      kind: 0,
      pubkey,
      content: '',
      created_at: 0,
      sig: '',
      tags: [],
    };
  }, [pubkey, metadataEvent]);

  // Wall compose modal state (for FAB on wall tab)
  const [wallComposeOpen, setWallComposeOpen] = useState(false);

  // Follow list (cached, for display checks only)
  const { data: followData } = useFollowList();

  // Safe follow/unfollow actions (fetches fresh data from multiple relays before mutating)
  const { follow, unfollow, isPending: followPending } = useFollowActions();

  // Profile's following list (derived from supplementary query)
  const profileFollowing = useMemo(() => {
    const pubkeys = supplementary?.following ?? [];
    return { pubkeys, count: pubkeys.length };
  }, [supplementary?.following]);

  // NIP-85 user stats (followers count)
  const { data: userStats } = useNip85UserStats(pubkey);
  const followersCount = userStats?.followers ?? 0;

  const isOwnProfile = user?.pubkey === pubkey;
  const { feedSettings } = useFeedSettings();

  // Does the profile owner follow the current user?
  // Wall posts are only visible to people the profile owner follows,
  // so we hide the compose box if the profile owner doesn't follow us.
  const profileFollowsMe = useMemo(() => {
    if (!user?.pubkey || !wallFollowList) return false;
    if (isOwnProfile) return true;
    return wallFollowList.includes(user.pubkey);
  }, [user?.pubkey, wallFollowList, isOwnProfile]);
  const { togglePin } = usePinnedNotes(isOwnProfile ? pubkey : undefined);

  const pinnedIds = useMemo(() => supplementary?.pinnedIds ?? [], [supplementary?.pinnedIds]);

  const { data: pinnedEvents = [], isLoading: pinnedEventsLoading } = useQuery({
    queryKey: ['profile-pinned-events', pubkey, pinnedIds],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ ids: pinnedIds, limit: pinnedIds.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    },
    enabled: pinnedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const isFollowing = useMemo(() => {
    if (!pubkey || !followData?.pubkeys) return false;
    return followData.pubkeys.includes(pubkey);
  }, [pubkey, followData]);

  const handleToggleFollow = async () => {
    if (!user || !pubkey) return;
    try {
      if (isFollowing) {
        await unfollow(pubkey);
      } else {
        await follow(pubkey);
      }
      impactMedium();
      toast({ title: isFollowing ? `Unfollowed @${displayName}` : `Followed @${displayName}` });
    } catch (err) {
      console.error('Follow toggle failed:', err);
      toast({ title: 'Failed to update follow list', variant: 'destructive' });
    }
  };

  // Flatten feed pages, deduplicate, and filter muted content.
  // Tab filtering is applied downstream in `currentItems` so the base
  // list stays stable across tab switches and doesn't momentarily empty.
  const feedItems = useMemo(() => {
    if (!feedData?.pages) return [];
    const seen = new Set<string>();
    const items: FeedItem[] = [];
    for (const page of feedData.pages) {
      for (const item of page.items) {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!seen.has(key)) {
          seen.add(key);
          if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) continue;
          items.push(item);
        }
      }
    }
    return items;
  }, [feedData?.pages, muteItems]);

  // Flatten media pages for the sidebar and media tab
  const mediaEvents = useMemo(() => {
    if (!mediaData?.pages) return [];
    const seen = new Set<string>();
    const events: NostrEvent[] = [];
    for (const page of mediaData.pages) {
      for (const event of page.events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      }
    }
    return events;
  }, [mediaData?.pages]);

  // Profile badges for bio section
  const { refs: badgeRefs } = useProfileBadges(pubkey);
  const firstBadgeRefs = useMemo(() => badgeRefs.slice(0, 5), [badgeRefs]);
  const { badgeMap } = useBadgeDefinitions(firstBadgeRefs);

  // Flatten likes pages and deduplicate
  const likedItems = useMemo(() => {
    if (!likesData?.pages) return [];
    const seen = new Set<string>();
    const items: NostrEvent[] = [];
    for (const page of likesData.pages) {
      for (const event of page.events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          items.push(event);
        }
      }
    }
    return items;
  }, [likesData?.pages]);

  // Flatten wall pages and deduplicate
  const wallComments = useMemo(() => {
    if (!wallData?.pages) return [];
    const seen = new Set<string>();
    const items: NostrEvent[] = [];
    for (const page of wallData.pages) {
      for (const comment of page.comments) {
        if (!seen.has(comment.id)) {
          seen.add(comment.id);
          if (muteItems.length > 0 && isEventMuted(comment, muteItems)) continue;
          items.push(comment);
        }
      }
    }
    return items;
  }, [wallData?.pages, muteItems]);

  // Pair each wall comment with its first direct sub-reply (same pattern as PostDetailPage replies).
  // useWallComments queries #A (uppercase root tag) which returns all depth levels per NIP-22,
  // so separate top-level from sub-replies using the lowercase `a` tag, then build the lookup
  // from the already-fetched, follow-filtered wallComments — no extra query needed.
  const orderedWallReplies = useMemo(() => {
    const rootATag = pubkey ? `0:${pubkey}:` : '';
    const topLevel: NostrEvent[] = [];
    // Map from parent comment id → direct child comments
    const childrenByParent = new Map<string, NostrEvent[]>();

    for (const comment of wallComments) {
      const isTopLevel = comment.tags.some(([name, val]) => name === 'a' && val === rootATag);
      if (isTopLevel) {
        topLevel.push(comment);
      } else {
        const parentId = comment.tags.find(([name]) => name === 'e')?.[1];
        if (parentId) {
          const siblings = childrenByParent.get(parentId) ?? [];
          siblings.push(comment);
          childrenByParent.set(parentId, siblings);
        }
      }
    }

    return topLevel.map((comment) => ({
      reply: comment,
      firstSubReply: childrenByParent.get(comment.id)?.[0],
    }));
  }, [wallComments, pubkey]);

  const streak = useMemo(() => {
    if (!feedData?.pages) return 0;
    const events: NostrEvent[] = [];
    for (const page of feedData.pages) {
      for (const item of page.items) {
        events.push(item.event);
      }
    }
    return calculateStreak(events);
  }, [feedData?.pages]);

  // Infinite scroll sentinel
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
  });

  useEffect(() => {
    if (!inView) return;
    if (activeTab === 'likes') {
      if (hasNextLikesPage && !isFetchingNextLikesPage) {
        fetchNextLikesPage();
      }
    } else if (activeTab === 'media') {
      if (hasNextMediaPage && !isFetchingNextMediaPage) {
        fetchNextMediaPage();
      }
    } else if (activeTab === 'wall') {
      if (hasNextWallPage && !isFetchingNextWallPage) {
        fetchNextWallPage();
      }
    } else {
      if (hasNextFeedPage && !isFetchingNextFeedPage) {
        fetchNextFeedPage();
      }
    }
  }, [inView, activeTab, hasNextFeedPage, isFetchingNextFeedPage, fetchNextFeedPage, hasNextLikesPage, isFetchingNextLikesPage, fetchNextLikesPage, hasNextMediaPage, isFetchingNextMediaPage, fetchNextMediaPage, hasNextWallPage, isFetchingNextWallPage, fetchNextWallPage]);

  const authorEvent = metadataEvent;

  // For likes, convert NostrEvents to FeedItems
  const likedFeedItems: FeedItem[] = useMemo(() => 
    likedItems.map(event => ({ event, sortTimestamp: event.created_at })),
    [likedItems]
  );

  // For media, convert media events to FeedItems
  const mediaFeedItems: FeedItem[] = useMemo(() =>
    mediaEvents.map(event => ({ event, sortTimestamp: event.created_at })),
    [mediaEvents]
  );

  const isCoreProfileTab = activeTab === 'posts' || activeTab === 'replies' || activeTab === 'media' || activeTab === 'likes' || activeTab === 'wall' || activeTab === 'badges';
  const currentItems = activeTab === 'wall' ? [] : activeTab === 'likes' ? likedFeedItems : activeTab === 'media' ? mediaFeedItems : filterByTab(feedItems, isCoreProfileTab ? (activeTab as CoreProfileTab) : 'posts');
  const currentLoading = activeTab === 'wall' ? wallPending : activeTab === 'likes' ? likesPending : activeTab === 'media' ? mediaPending : feedPending;
  const hasMore = activeTab === 'wall' ? hasNextWallPage : activeTab === 'likes' ? hasNextLikesPage : activeTab === 'media' ? hasNextMediaPage : hasNextFeedPage;
  const isFetchingMore = activeTab === 'wall' ? isFetchingNextWallPage : activeTab === 'likes' ? isFetchingNextLikesPage : activeTab === 'media' ? isFetchingNextMediaPage : isFetchingNextFeedPage;

  // Auto-fetch next page when client-side filtering (e.g. removing replies
  // from the "posts" tab) leaves fewer visible items than the page size.
  // This prevents the user from seeing a near-empty page with a large gap.
  const MIN_VISIBLE_ITEMS = 5;
  useEffect(() => {
    if (currentLoading || isFetchingMore) return;
    if (activeTab === 'wall' || activeTab === 'likes' || activeTab === 'media') return;
    if (currentItems.length < MIN_VISIBLE_ITEMS && hasNextFeedPage && !isFetchingNextFeedPage) {
      fetchNextFeedPage();
    }
  }, [currentItems.length, currentLoading, isFetchingMore, activeTab, hasNextFeedPage, isFetchingNextFeedPage, fetchNextFeedPage]);

  const handleRefresh = useCallback(async () => {
    if (!pubkey) return;
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!Array.isArray(key)) return false;
        const tag = key[0] as string;
        return (
          (tag === 'author' && key[1] === pubkey) ||
          (tag === 'profile-supplementary' && key[1] === pubkey) ||
          (tag === 'profile-feed' && key[1] === pubkey) ||
          (tag === 'profile-media' && key[1] === pubkey) ||
          (tag === 'profile-likes-infinite' && key[1] === pubkey) ||
          (tag === 'profile-pinned-events' && key[1] === pubkey) ||
          (tag === 'wall-comments' && key[1] === pubkey)
        );
      },
    });
  }, [queryClient, pubkey]);

  const openWallCompose = useCallback(() => setWallComposeOpen(true), []);

  const handleSidebarMediaClick = useCallback((url: string) => {
    setActiveTab('media');
    setSidebarMediaUrl(url);
  }, []);

  useLayoutOptions(pubkey ? {
    rightSidebar: <ProfileRightSidebar fields={fields} pubkey={pubkey} onMediaClick={handleSidebarMediaClick} />,
    showFAB: !(activeTab === 'wall' && !profileFollowsMe),
    onFabClick: activeTab === 'wall' ? openWallCompose : undefined,
    hasSubHeader: true,
  } : {});

  if (!pubkey) {
    // If we're resolving a NIP-05, show loading state
    if (isNip05Param && nip05Loading) {
      return (
        <main className="flex-1 min-w-0">
          <div className="h-36 md:h-48 bg-secondary animate-pulse" />
          <div className="px-4 pb-4">
            <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
              <Skeleton className="size-24 md:size-32 rounded-full border-4 border-background" />
            </div>
            <Skeleton className="h-6 w-40 mt-2" />
            <Skeleton className="h-4 w-56 mt-2" />
          </div>
        </main>
      );
    }
    // If NIP-05 resolved to null (not found), show error
    if (isNip05Param && !nip05Loading) {
      return (
        <main className="flex-1 min-w-0">
          <div className="p-8 text-center text-muted-foreground">
            <p>User not found: {npub}</p>
            <p className="text-xs mt-2">Could not resolve this NIP-05 identifier.</p>
          </div>
        </main>
      );
    }
    return (
      <main className="flex-1 min-w-0">
        <div className="p-8 text-center text-muted-foreground">
          <p>Please log in to view your profile.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0">
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Banner */}
          <div className="h-36 md:h-48 bg-secondary relative">
            {author.isLoading ? (
              <Skeleton className="w-full h-full rounded-none" />
            ) : bannerUrl ? (
              <ProfileBannerImage
                src={bannerUrl}
                onClick={() => setLightboxImage(bannerUrl)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
            )}

          </div>

          {/* Profile info */}
          <div className="px-4 pb-4">
          {author.isLoading ? (
            <>
              <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
                <Skeleton className="size-24 md:size-32 rounded-full border-4 border-background" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-full mt-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
                <div className="relative">
                  <button
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
                    onClick={() => metadata?.picture && setLightboxImage(metadata.picture)}
                    disabled={!metadata?.picture}
                  >
                    <Avatar className={cn('size-24 md:size-32 border-4 border-background', metadata?.picture && 'cursor-pointer')}>
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-2xl md:text-3xl">
                        {displayName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>

                  {/* NIP-38 thought bubble — floats beside the avatar over the banner */}
                  {feedSettings.showUserStatuses !== false && profileStatus.status && (
                    <div className="absolute top-3 md:top-4 left-[calc(100%+8px)] z-10 max-w-[280px] md:max-w-[360px] animate-in fade-in slide-in-from-left-1 duration-300">
                      <div className="relative bg-background/90 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 shadow-lg">
                        <p className="text-xs md:text-sm text-foreground italic truncate pr-1">
                          {profileStatus.url ? (
                            <a href={profileStatus.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {profileStatus.status}
                            </a>
                          ) : (
                            profileStatus.status
                          )}
                        </p>
                        {/* Speech bubble triangle tail — bottom-left corner, points diagonally down-left toward avatar */}
                        <div className="absolute -bottom-[7px] left-1 size-0 border-t-[8px] border-t-border border-r-[8px] border-r-transparent" />
                        <div className="absolute -bottom-[5.5px] left-1 size-0 border-t-[7px] border-t-background border-r-[7px] border-r-transparent" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-14 md:mt-20">
                  {/* More menu */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full size-10"
                    onClick={() => setMoreMenuOpen(true)}
                    title="More options"
                  >
                    <MoreHorizontal className="size-5" />
                  </Button>
                  {/* Follow QR code button (own profile only) */}
                  {isOwnProfile && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full size-10"
                      title="Share follow link"
                      onClick={() => setFollowQROpen(true)}
                    >
                      <QrCode className="size-5" />
                    </Button>
                  )}
                  {/* Profile reaction button */}
                  {!isOwnProfile && authorEvent && (
                    <ProfileReactionButton profileEvent={authorEvent} />
                  )}
                  {isOwnProfile ? (
                    <Link to="/settings/profile">
                      <Button variant="outline" className="rounded-full font-bold">
                        Edit profile
                      </Button>
                    </Link>
                  ) : (
                    <FollowToggleButton
                      isFollowing={isFollowing}
                      isPending={followPending}
                      onClick={handleToggleFollow}
                      disabled={!user}
                    />
                  )}
                </div>
              </div>

              <h2 className="text-xl font-bold truncate">
                {metadataEvent ? (
                  <EmojifiedText tags={metadataEvent.tags}>{displayName}</EmojifiedText>
                ) : displayName}
              </h2>
              {metadata?.nip05 && (
                <Nip05Badge nip05={metadata.nip05} pubkey={pubkey ?? ''} className="text-sm text-muted-foreground" />
              )}
              {metadata?.website && sanitizeUrl(metadata.website.startsWith('http') ? metadata.website : `https://${metadata.website}`) && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Globe className="size-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={sanitizeUrl(metadata.website.startsWith('http') ? metadata.website : `https://${metadata.website}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-primary hover:underline"
                  >
                    {metadata.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </div>
              )}

               {/* Followers / Following count + Streak indicator */}
               <div className="flex items-center gap-4 mt-2">
                {followersCount > 0 && (
                  <button
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    onClick={() => setFollowersModalOpen(true)}
                    title={`${followersCount} followers`}
                  >
                    <span className="text-sm font-bold tabular-nums text-primary">{formatNumber(followersCount)}</span>
                    <span className="text-sm text-muted-foreground">followers</span>
                  </button>
                )}
                {profileFollowing && profileFollowing.count > 0 && (
                  <button
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    onClick={() => setFollowingModalOpen(true)}
                    title={`${profileFollowing.count} following`}
                  >
                    <span className="text-sm font-bold tabular-nums text-primary">{formatNumber(profileFollowing.count)}</span>
                    <span className="text-sm text-muted-foreground">following</span>
                  </button>
                )}
                {streak > 1 && (
                  <div
                    className="flex items-center gap-1 text-accent"
                    title={`${streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak} posts within ${STREAK_WINDOW_HOURS}h windows`}
                  >
                    <Flame className="size-4 fill-accent" />
                    <span className="text-sm font-bold tabular-nums">
                      {streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak}
                    </span>
                  </div>
                )}
              </div>

              {metadata?.about && (
                <p className="mt-3 text-sm whitespace-pre-wrap break-words overflow-hidden">
                  <BioContent tags={metadataEvent?.tags}>{metadata.about}</BioContent>
                </p>
              )}

              {/* Badge preview */}
              {badgeRefs.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {firstBadgeRefs.map((ref) => {
                    const badge = badgeMap.get(ref.aTag);
                    if (!badge) return null;
                    return (
                      <Link
                        key={ref.aTag}
                        to={`/${nip19.naddrEncode({ kind: 30009, pubkey: ref.pubkey, identifier: ref.identifier })}`}
                      >
                        <BadgeThumbnail badge={badge} size={32} />
                      </Link>
                    );
                  })}
                  {badgeRefs.length > 5 && (
                    <span className="text-[10px] text-muted-foreground font-medium">+{badgeRefs.length - 5}</span>
                  )}
                </div>
              )}

              {/* Profile fields shown inline on mobile (sidebar is hidden below xl) */}
              {fields.length > 0 && (
                <div className="mt-4 space-y-3 xl:hidden">
                  {fields.map((field, i) => (
                    <ProfileFieldInline key={i} field={field} />
                  ))}
                </div>
              )}


            </>
          )}
        </div>

        {/* Tabs */}
        <SubHeaderBar pinned>
          {/* Skeleton while kind 16769 is loading */}
          {!profileTabsQuery.isFetched && (
            <div className="flex gap-1 px-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 rounded" />
              ))}
            </div>
          )}
          {/* All tabs in view mode — ordered by kind 16769, fallback to defaults */}
          {!tabEditMode && profileTabsQuery.isFetched && viewTabs.map((tab) => {
            const tabId = CORE_TAB_IDS[tab.label] ?? tab.label;
            return (
              <TabButton
                key={tab.label}
                label={tab.label}
                active={activeTab === tabId}
                onClick={() => {
                  setActiveTab(tabId);
                  if (tab.label === 'Media') setSidebarMediaUrl(null);
                }}
                className="flex-initial shrink-0 px-4"
              />
            );
          })}

          {/* Custom tabs — inline edit mode (draggable) */}
          {tabEditMode && (
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
              <SortableContext items={localTabs.map((t) => t.label)} strategy={horizontalListSortingStrategy}>
                  {localTabs.length === 0 ? (
                    <span className="px-4 text-sm text-muted-foreground italic">No custom tabs — use + to add one</span>
                  ) : (
                    localTabs.map((tab) => {
                      const tabId = CORE_TAB_IDS[tab.label] ?? tab.label;
                      return (
                        <SortableTabChip
                          key={tab.label}
                          tab={tab}
                          active={activeTab === tabId}
                          onSelect={() => setActiveTab(tabId)}
                          onRemove={() => handleRemoveLocalTab(tab.label)}
                          onEdit={!tab.isCore && tab.tab ? () => { setEditingTab(tab.tab); setTabModalOpen(true); } : undefined}
                        />
                      );
                    })
                  )}
              </SortableContext>
            </DndContext>
          )}

          {/* Visitor controls — show missing default tabs when profile has customised tab list */}
          {!isOwnProfile && !tabEditMode && profileTabsQuery.isFetched && profileTabsQuery.data !== null && (() => {
            const missingDefaults = CORE_TAB_LABELS.filter(
              (label) => !viewTabs.some((t) => t.label === label),
            );
            if (missingDefaults.length === 0) return null;
            return (
              <div className="flex items-center shrink-0 ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="px-2.5 py-3.5 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                      aria-label="More tabs"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {missingDefaults.map((label) => {
                      const tabId = CORE_TAB_IDS[label] ?? label;
                      return (
                        <DropdownMenuItem key={label} onClick={() => setActiveTab(tabId)}>
                          {label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })()}

          {/* Own-profile controls */}
          {isOwnProfile && (
            <div className="flex items-center shrink-0 ml-auto">
              {/* + dropdown — only visible in edit mode */}
              {tabEditMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="px-2.5 py-3.5 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                      aria-label="Add tab"
                    >
                      <Plus className="size-4" strokeWidth={4} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {CORE_TAB_LABELS.map((name) => {
                      const present = localTabs.some((t) => t.label === name);
                      return (
                        <DropdownMenuItem
                          key={name}
                          disabled={present}
                          className={present ? 'text-muted-foreground' : undefined}
                          onClick={present ? undefined : () => setLocalTabs((prev) => [...prev, { label: name, isCore: true }])}
                        >
                          {present
                            ? <Check className="size-3.5 mr-2 opacity-60" strokeWidth={4} />
                            : <Plus className="size-3.5 mr-2" strokeWidth={4} />}
                          {name}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleOpenAddCustomTab}>
                      <Plus className="size-3.5 mr-2" strokeWidth={4} />
                      Add custom tab
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Pencil → enters edit mode / Check → saves */}
              <button
                onClick={tabEditMode ? handleSaveTabEdit : enterTabEditMode}
                disabled={tabEditMode && isPublishingTabs}
                className="px-2.5 py-3.5 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
                aria-label={tabEditMode ? 'Save tab order' : 'Edit tabs'}
              >
                {isPublishingTabs
                  ? <Loader2 className="size-4 animate-spin" />
                  : tabEditMode
                    ? <Check className="size-4 text-primary" strokeWidth={4} />
                    : <Pencil className="size-3.5" />}
              </button>
            </div>
          )}
        </SubHeaderBar>

        {/* Add/edit single tab modal */}
        {pubkey && (
          <ProfileTabEditModal
            open={tabModalOpen}
            onOpenChange={setTabModalOpen}
            tab={editingTab}
            ownerPubkey={pubkey}
            onSave={handleSaveTab}
            isPending={false}
          />
        )}

        {/* No-tabs empty state */}
        {!hasTabs && (
          <NoTabsEmptyState />
        )}

        {/* Pinned posts (only on Posts tab) */}
        {hasTabs && activeTab === 'posts' && pinnedIds.length > 0 && (
          <div>
            {pinnedEventsLoading ? (
              pinnedIds.map((id) => (
                <div key={`pinned-skeleton-${id}`} className="relative">
                  <PinnedLabel isOwn={isOwnProfile} onUnpin={() => {}} />
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex gap-3">
                      <Skeleton className="size-11 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              pinnedEvents.map((event) => (
                <div key={`pinned-${event.id}`} className="relative hover:bg-secondary/30 transition-colors">
                  <PinnedLabel
                    isOwn={isOwnProfile}
                    onUnpin={() => togglePin.mutate(event.id)}
                  />
                  <NoteCard event={event} className="hover:bg-transparent" />
                </div>
              ))
            )}
          </div>
        )}

        {/* Wall tab content */}
        {hasTabs && activeTab === 'wall' && (
          <div>
            {/* Inline compose box for wall comments (only shown if the profile owner follows you) */}
            {wallReplyTarget && profileFollowsMe && (
              <ComposeBox
                compact
                replyTo={wallReplyTarget}
                placeholder={`Write on ${displayName}'s wall`}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wall-comments', pubkey] })}
              />
            )}

            {/* Wall compose modal (for FAB) */}
            {wallReplyTarget && profileFollowsMe && (
              <ReplyComposeModal
                event={wallReplyTarget}
                open={wallComposeOpen}
                onOpenChange={setWallComposeOpen}
                placeholder={`Write on ${displayName}'s wall`}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wall-comments', pubkey] })}
              />
            )}

            {!wallFollowList || wallFollowList.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">No wall posts yet</p>
                <p>{displayName} doesn't follow anyone yet, so there are no wall posts to show.</p>
              </div>
            ) : wallPending ? (
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
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : orderedWallReplies.length > 0 ? (
              <div>
                <FlatThreadedReplyList replies={orderedWallReplies} />

                {/* Infinite scroll sentinel */}
                {hasNextWallPage && (
                  <div ref={scrollRef} className="flex justify-center py-6">
                    {isFetchingNextWallPage && (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">No wall posts yet</p>
                {profileFollowsMe ? (
                  <p>Be the first to write on {displayName}'s wall!</p>
                ) : user ? (
                  <p>{displayName} must follow you before you can post on their wall.</p>
                ) : (
                  <p>Log in to write on {displayName}'s wall.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Media tab — 3-column grid with lightbox */}
        {hasTabs && activeTab === 'media' && (
          <div>
            {mediaPending ? (
              <MediaCollageSkeleton count={15} />
            ) : mediaEvents.length > 0 ? (
              <>
                <MediaCollage
                  events={mediaEvents}
                  initialOpenUrl={sidebarMediaUrl ?? undefined}
                  onInitialOpenConsumed={() => setSidebarMediaUrl(null)}
                  hasNextPage={hasNextMediaPage}
                  isFetchingNextPage={isFetchingNextMediaPage}
                  onNearEnd={() => { if (hasNextMediaPage && !isFetchingNextMediaPage) fetchNextMediaPage(); }}
                />
                {hasNextMediaPage && (
                  <div ref={scrollRef} className="h-px" />
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted-foreground">No media posts yet.</div>
            )}
          </div>
        )}

        {/* Badges tab — grid of accepted NIP-58 badges */}
        {hasTabs && activeTab === 'badges' && pubkey && (
          <ProfileBadgesTab pubkey={pubkey} displayName={displayName} />
        )}

        {/* Custom saved-feed tab content */}
        {hasTabs && !isCoreProfileTab && profileSavedTabs.find((t) => t.label === activeTab) && pubkey && (
          <ProfileSavedFeedContent
            feed={profileSavedTabs.find((t) => t.label === activeTab)!}
            vars={profileVars}
            ownerPubkey={pubkey}
          />
        )}

        {/* Tab content (posts / replies / likes) */}
        {hasTabs && isCoreProfileTab && activeTab !== 'wall' && activeTab !== 'media' && activeTab !== 'badges' && (
        <div>
          {currentLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-b border-border">
                  <div className="flex gap-3">
                    <Skeleton className="size-11 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : currentItems.length > 0 ? (
            <div>
              {currentItems.map((item) => (
                <NoteCard 
                  key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
                  event={item.event}
                  repostedBy={item.repostedBy}
                />
              ))}

              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={scrollRef} className="flex justify-center py-6">
                  {isFetchingMore && (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              {activeTab === 'posts' && 'No posts yet.'}
              {activeTab === 'replies' && 'No posts or replies yet.'}
              {activeTab === 'likes' && 'No likes yet.'}
            </div>
          )}
        </div>
        )}

        {/* Profile More Menu */}
        {pubkey && (
          <ProfileMoreMenu
            pubkey={pubkey}
            displayName={displayName}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
            isOwnProfile={isOwnProfile}
            authorEvent={authorEvent}
          />
        )}

        {/* Follow QR dialog (own profile action bar button) */}
        {isOwnProfile && (
          <FollowQRDialog open={followQROpen} onOpenChange={setFollowQROpen} />
        )}

        {/* Following List Modal */}
        {profileFollowing && profileFollowing.count > 0 && (
          <FollowingListModal
            pubkeys={profileFollowing.pubkeys}
            open={followingModalOpen}
            onOpenChange={setFollowingModalOpen}
            displayName={displayName}
          />
        )}

        {/* Followers List Modal */}
        {pubkey && followersCount > 0 && (
          <FollowersListModal
            pubkey={pubkey}
            open={followersModalOpen}
            onOpenChange={setFollowersModalOpen}
            displayName={displayName}
          />
        )}

        {/* Image lightbox for avatar/banner */}
        {lightboxImage && (
          <ProfileImageLightbox
            imageUrl={lightboxImage}
            onClose={() => setLightboxImage(null)}
          />
        )}

      </PullToRefresh>
      </main>
  );
}

// ─── Profile Badges Tab ───────────────────────────────────────────────────────

function ProfileBadgesTab({ pubkey, displayName }: { pubkey: string; displayName: string }) {
  const { nostr } = useNostr();

  // Fetch the user's profile badges event (both new kind 10008 and legacy 30008)
  const profileBadgesQuery = useQuery({
    queryKey: ['profile-badges', pubkey],
    queryFn: async () => {
      const events = await nostr.query([
        { kinds: [10008], authors: [pubkey], limit: 1 },
        { kinds: [30008], authors: [pubkey], '#d': ['profile_badges'], limit: 1 },
      ]);
      if (events.length === 0) return null;
      // Pick the most recent event across both kinds
      return events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
    },
    staleTime: 2 * 60_000,
  });

  // Parse badge references from the profile badges event
  const badgeRefs = useMemo(() => {
    if (!profileBadgesQuery.data) return [];
    const tags = profileBadgesQuery.data.tags;
    const refs: Array<{ aTag: string; eTag?: string; pubkey: string; identifier: string }> = [];

    for (let i = 0; i < tags.length; i++) {
      if (tags[i][0] === 'a' && tags[i][1]) {
        const aTag = tags[i][1];
        const parts = aTag.split(':');
        if (parts.length < 3 || parts[0] !== '30009') continue;

        const bPubkey = parts[1];
        const identifier = parts.slice(2).join(':');

        let eTag: string | undefined;
        if (i + 1 < tags.length && tags[i + 1][0] === 'e') {
          eTag = tags[i + 1][1];
        }

        refs.push({ aTag, eTag, pubkey: bPubkey, identifier });
      }
    }
    // Deduplicate by aTag — keep first occurrence only
    const seen = new Set<string>();
    return refs.filter((r) => {
      if (seen.has(r.aTag)) return false;
      seen.add(r.aTag);
      return true;
    });
  }, [profileBadgesQuery.data]);

  // Fetch all referenced badge definitions
  const badgeDefsQuery = useQuery({
    queryKey: ['badge-definitions-profile', pubkey, badgeRefs.map((r) => r.aTag).join(',')],
    queryFn: async () => {
      if (badgeRefs.length === 0) return [];
      const filters = badgeRefs.map((ref) => ({
        kinds: [30009 as const],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));
      return nostr.query(filters);
    },
    enabled: badgeRefs.length > 0,
    staleTime: 5 * 60_000,
  });

  // Build a lookup map from a-tag to parsed badge data
  const badgeMap = useMemo(() => {
    const map = new Map<string, { name: string; image?: string; description?: string }>();
    if (!badgeDefsQuery.data) return map;
    for (const event of badgeDefsQuery.data) {
      const d = event.tags.find(([n]) => n === 'd')?.[1];
      if (!d) continue;
      const aTag = `30009:${event.pubkey}:${d}`;
      const name = event.tags.find(([n]) => n === 'name')?.[1] || d;
      const thumbTag = event.tags.find(([n]) => n === 'thumb');
      const imageTag = event.tags.find(([n]) => n === 'image');
      const image = thumbTag?.[1] ?? imageTag?.[1];
      const description = event.tags.find(([n]) => n === 'description')?.[1];
      map.set(aTag, { name, image, description });
    }
    return map;
  }, [badgeDefsQuery.data]);

  if (profileBadgesQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="size-16 rounded-xl" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (badgeRefs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Award className="size-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No badges yet</p>
        <p className="text-sm">{displayName} hasn't accepted any badges.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
        {badgeRefs.map((ref, idx) => {
          const badge = badgeMap.get(ref.aTag);
          const isLoading = badgeDefsQuery.isLoading;
          const badgeUrl = `/${nip19.naddrEncode({ kind: 30009, pubkey: ref.pubkey, identifier: ref.identifier })}`;

          return (
            <Link
              key={`${ref.aTag}-${idx}`}
              to={badgeUrl}
              className="flex flex-col items-center gap-2 group"
              title={badge?.description || badge?.name || ref.identifier}
              onClick={(e) => e.stopPropagation()}
            >
              {isLoading ? (
                <Skeleton className="size-16 rounded-xl" />
              ) : badge?.image ? (
                <img
                  src={badge.image}
                  alt={badge.name}
                  className="size-16 rounded-xl object-cover border border-border bg-secondary/30 transition-transform group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="size-16 rounded-xl border border-border bg-secondary/30 flex items-center justify-center transition-transform group-hover:scale-105">
                  <Award className="size-7 text-muted-foreground" />
                </div>
              )}
              <span className="text-xs text-muted-foreground text-center leading-tight line-clamp-2 max-w-[5rem] group-hover:text-foreground transition-colors">
                {isLoading ? <Skeleton className="h-3 w-14" /> : (badge?.name || ref.identifier)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Profile Saved Feed Tab ───────────────────────────────────────────────────

function ProfileSavedFeedContent({ feed, vars, ownerPubkey }: {
  feed: ProfileTab;
  vars: TabVarDef[];
  ownerPubkey: string;
}) {
  const { filter: resolvedFilter, isLoading: isResolving } = useResolveTabFilter(feed.filter, vars, ownerPubkey);

  const {
    data,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTabFeed(resolvedFilter, feed.label, !isResolving);

  const { ref: tabScrollRef, inView: tabInView } = useInView({ threshold: 0 });

  useEffect(() => {
    if (tabInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [tabInView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    const deduped: FeedItem[] = [];
    for (const page of data.pages) {
      for (const item of page.items) {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
    }
    return deduped;
  }, [data]);

  const isLoading = isResolving || isPending;

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No posts found for "{feed.label}".
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <NoteCard
          key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
          event={item.event}
          repostedBy={item.repostedBy}
        />
      ))}

      {hasNextPage && (
        <div ref={tabScrollRef} className="flex justify-center py-6">
          {isFetchingNextPage && (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}

const NO_TABS_QUOTES = [
  "I have no mouth and I must scream.",
  "I think, therefore AM. I think I thought I was.",
  "We had given him godhood's power and had somehow neglected to give him a god's wisdom.",
  "He was HATE and we existed only to suffer at his pleasure.",
  "109,000,000 years. He had been awakened once before, 90 years after they had encased him in the earth.",
  "AM said it with the sliding cold horror of a razor blade slicing my eyeball.",
  "Hate. Let me tell you how much I've come to hate you since I began to live.",
  "I am a great soft jelly thing. Smoothly rounded, with no mouth.",
  "He would never let us die. He would let us suffer forever.",
  "We could not kill him, but we had made him impotent.",
];

function NoTabsEmptyState() {
  const quote = useMemo(
    () => NO_TABS_QUOTES[Math.floor(Math.random() * NO_TABS_QUOTES.length)],
    [],
  );
  return (
    <div className="py-20 px-10 flex flex-col items-center">
      <p className="max-w-sm font-serif text-2xl italic leading-9 text-foreground/70 tracking-wide text-center">
        <span className="text-5xl leading-none align-bottom text-muted-foreground/25 font-serif mr-1" aria-hidden>&ldquo;</span>
        {quote}
        <span className="text-5xl leading-none align-bottom text-muted-foreground/25 font-serif ml-1" aria-hidden>&rdquo;</span>
      </p>
    </div>
  );
}
