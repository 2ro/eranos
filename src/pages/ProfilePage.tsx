import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Zap, MoreHorizontal, ClipboardCopy, ExternalLink, VolumeX, Flag, Bitcoin, Pin, X, QrCode, Check, Copy, Loader2, Download, Trash2, RotateCcw, MessageSquare, Mail, ListPlus, Award, PanelLeft } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { NoteCard } from '@/components/NoteCard';
import { FeedCard } from '@/components/FeedCard';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { usePinnedNotes } from '@/hooks/usePinnedNotes';

import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useProfileFeed, useProfileLikes as useProfileLikesInfinite, filterByTab } from '@/hooks/useProfileFeed';
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

import { FollowQRDialog } from '@/components/FollowQRDialog';
import { ProfileRecoveryDialog } from '@/components/ProfileRecoveryDialog';
import { GiveBadgeDialog } from '@/components/GiveBadgeDialog';
import { useProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import { useActions } from '@/hooks/useActions';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { DonateDialog } from '@/components/DonateDialog';
import { ProfileIdentityRail } from '@/components/profile/ProfileIdentityRail';
import { ProfileOverviewTab } from '@/components/profile/ProfileOverviewTab';
import { ProfileCampaignsTab } from '@/components/profile/ProfileCampaignsTab';
import { ProfilePledgesTab } from '@/components/profile/ProfilePledgesTab';
import { ProfileActivityTab } from '@/components/profile/ProfileActivityTab';
import type { ParsedCampaign } from '@/lib/campaign';
import { SubHeaderBar } from '@/components/SubHeaderBar';
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

const CORE_TAB_LABELS = ['Overview', 'Campaigns', 'Pledges', 'Activity', 'Posts', 'Posts & replies', 'Media', 'Wall', 'Badges', 'Likes'];
const DEFAULT_TAB_LABELS = ['Overview', 'Campaigns', 'Pledges', 'Activity', 'Posts', 'Wall'];

// Map from display label → internal tab id for core tabs
const CORE_TAB_IDS: Record<string, string> = {
  'Overview': 'overview', 'Campaigns': 'campaigns', 'Pledges': 'pledges',
  'Activity': 'activity', 'Posts': 'posts', 'Posts & replies': 'replies',
  'Media': 'media', 'Wall': 'wall', 'Badges': 'badges', 'Likes': 'likes',
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

  const [activeTab, setActiveTab] = useState<CoreProfileTab | string>('overview');
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

  // Determine pubkey: from NIP-05 resolution, NIP-19 decoding, raw hex, or logged-in user
  const pubkey = useMemo(() => {
    if (npub) {
      // If it's a NIP-05 identifier, use the resolved pubkey
      if (isNip05Param) {
        return nip05Pubkey ?? undefined;
      }
      // Raw 64-char hex pubkey
      if (/^[0-9a-f]{64}$/.test(npub)) {
        return npub;
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

  // Tabs are a fixed, Agora-first set. The kind 16769 ("Profile Tabs")
  // customization system carried over from upstream is intentionally NOT
  // wired in here — its drag-to-reorder / add-custom-tab UI did not fit
  // Agora's activism-focused profile and added significant complexity.
  // The shared kind 16769 hooks still exist for `SearchPage` etc.
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

  // Static tab list — the same Agora-first defaults for every profile.
  // The page no longer reads or writes kind 16769.
  const viewTabs = useMemo(
    () => DEFAULT_TAB_LABELS.map((label) => ({ label })),
    [],
  );

  // Derive the ID of the first visible tab (used as default selection).
  const firstTabId = useMemo(() => {
    if (viewTabs.length === 0) return 'overview';
    const first = viewTabs[0];
    return CORE_TAB_IDS[first.label] ?? first.label;
  }, [viewTabs]);

  // Keep the active tab in sync if it ever falls out of the recognized set
  // (e.g. on first mount, or if a user navigates with a stale tab id).
  useEffect(() => {
    const isCoreTab = ['overview', 'campaigns', 'pledges', 'activity', 'posts', 'replies', 'media', 'badges', 'likes', 'wall'].includes(activeTab);
    if (!isCoreTab) {
      setActiveTab(firstTabId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstTabId]);

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
    true,
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

  // Profile media — NIP-50 `media:true` search via the configured read pool.
  const {
    data: mediaData,
    isPending: mediaPending,
    fetchNextPage: fetchNextMediaPage,
    hasNextPage: hasNextMediaPage,
    isFetchingNextPage: isFetchingNextMediaPage,
  } = useProfileMedia(pubkey, true);

  // Infinite-scroll likes
  const {
    data: likesData,
    isPending: likesPending,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
  } = useProfileLikesInfinite(pubkey, activeTab === 'likes');

  // Wall comments (NIP-22 kind 1111 on user's kind 0, filtered by their follow list)
  const wallFollowList = useMemo(() => supplementary?.following, [supplementary?.following]);
  const {
    data: wallData,
    isPending: wallPending,
    fetchNextPage: fetchNextWallPage,
    hasNextPage: hasNextWallPage,
    isFetchingNextPage: isFetchingNextWallPage,
  } = useWallComments(pubkey, wallFollowList);

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

  // Agora stat sources: campaigns + raised totals, and pledges count.
  const profileCampaignStats = useProfileCampaignStats(pubkey);
  const { data: btcPrice } = useBtcPrice();
  // Pledges (kind 36639) authored by this user. Filters the global pledges
  // list rather than issuing a separate per-author query.
  const { data: allActions } = useActions({ limit: 100 });
  const profileActionsCount = useMemo(() => {
    if (!pubkey || !allActions) return 0;
    return allActions.filter((a) => a.pubkey === pubkey).length;
  }, [allActions, pubkey]);

  // Donate dialog state. The header "Donate" button (only shown when the
  // profile has at least one campaign) opens this dialog. When the user
  // has multiple campaigns the action bar surfaces a dropdown that picks
  // which campaign to donate to first.
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateCampaign, setDonateCampaign] = useState<ParsedCampaign | null>(null);
  const openDonateForCampaign = useCallback((campaign: ParsedCampaign) => {
    setDonateCampaign(campaign);
    setDonateOpen(true);
  }, []);

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

  // Profile badges are queried inside ProfileIdentityRail; the page no
  // longer needs to fetch them at this level.

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

  // Whether the active tab is one of the legacy feed-driven core tabs that
  // pulls items out of useProfileFeed / useProfileLikes / useProfileMedia /
  // useWallComments. The new Agora-native core tabs (overview / campaigns /
  // pledges / activity) have their own renderers below and intentionally
  // bypass this fallthrough.
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

  // ProfilePage opts out of FundraiserLayout's default `max-w-3xl` cap so it
  // can run a wider canvas (banner full-bleed, contained `max-w-7xl` content
  // column matching CampaignsPage / AllCampaignsPage). FundraiserLayout has
  // no right-sidebar slot, so any `rightSidebar` option here would be ignored.
  useLayoutOptions(pubkey ? {
    noMaxWidth: true,
    showFAB: !(activeTab === 'wall' && !profileFollowsMe),
    onFabClick: activeTab === 'wall' ? openWallCompose : undefined,
    hasSubHeader: true,
  } : {});

  if (!pubkey) {
    // If we're resolving a NIP-05, show loading state
    if (isNip05Param && nip05Loading) {
      return (
        <main className="min-h-screen pb-16">
          <div className="h-36 md:h-48 bg-secondary animate-pulse" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-4">
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
        <main className="min-h-screen pb-16">
          <div className="max-w-7xl mx-auto p-8 text-center text-muted-foreground">
            <p>User not found: {npub}</p>
            <p className="text-xs mt-2">Could not resolve this NIP-05 identifier.</p>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-7xl mx-auto p-8 text-center text-muted-foreground">
          <p>User not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16">
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Banner — full-bleed at the top of the page. The avatar lives in
            the identity rail below and overlaps this banner via -mt-16. */}
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

        {/* Two-column profile body — identity rail on the left runs the
            full height of the page (sticky on lg+), tabs + content on the
            right are the only thing that changes when the user navigates.
            Below lg the grid collapses to a single column and the rail
            stacks above the tabs, which read top-down like a document. */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6 lg:gap-10">

            {/* Left column — identity rail. Sticky to the top of the page
                scroll on lg+ so it stays present while the right column
                feeds new tab content underneath. */}
            {pubkey && (
              <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pb-4">
                <ProfileIdentityRail
                  pubkey={pubkey}
                  isOwnProfile={isOwnProfile}
                  metadata={metadata}
                  metadataEvent={metadataEvent}
                  displayName={displayName}
                  isAuthorLoading={author.isLoading}
                  bannerUrl={bannerUrl}
                  status={feedSettings.showUserStatuses !== false && profileStatus.status
                    ? { text: profileStatus.status, url: profileStatus.url ?? undefined }
                    : undefined}
                  fields={fields}
                  fieldsContent={fields.map((field, i) => (
                    <ProfileFieldInline key={i} field={field} />
                  ))}
                  campaigns={profileCampaignStats.campaigns}
                  campaignStats={profileCampaignStats}
                  pledgesCount={profileActionsCount}
                  btcPrice={btcPrice}
                  followersCount={followersCount}
                  followingCount={profileFollowing?.count ?? 0}
                  isFollowing={isFollowing}
                  followPending={followPending}
                  onLightbox={(url) => setLightboxImage(url)}
                  onFollowersOpen={() => setFollowersModalOpen(true)}
                  onFollowingOpen={() => setFollowingModalOpen(true)}
                  onMoreMenuOpen={() => setMoreMenuOpen(true)}
                  onFollowQROpen={() => setFollowQROpen(true)}
                  onToggleFollow={handleToggleFollow}
                  onTabChange={(id) => {
                    setActiveTab(id);
                    if (id === 'media') setSidebarMediaUrl(null);
                  }}
                  onDonate={openDonateForCampaign}
                  canFollow={!!user}
                  authorEvent={authorEvent}
                />
              </aside>
            )}

            {/* Right column — tab navigation and the active tab's content.
                `min-w-0` is critical inside a grid track so long unbroken
                text doesn't push the column wider than its fraction. */}
            <section className="min-w-0">
              {/* Tabs — fixed Agora-first set with an overflow `⋯` for the
                  legacy social tabs. Identical for owner and visitor.
                  Sticks to the top of this column as the user scrolls. */}
              <SubHeaderBar pinned>
                {viewTabs.map((tab) => {
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

                {/* Overflow menu — exposes the non-default core tabs
                    (Posts & replies, Media, Badges, Likes). */}
                {(() => {
                  const missingDefaults = CORE_TAB_LABELS.filter(
                    (label) => !DEFAULT_TAB_LABELS.includes(label),
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
              </SubHeaderBar>

              {/* Overview — composite landing view. */}
              {activeTab === 'overview' && pubkey && (
                <ProfileOverviewTab
                  pubkey={pubkey}
                  displayName={displayName}
                  isOwnProfile={isOwnProfile}
                  recentPosts={filterByTab(feedItems, 'posts').slice(0, 3)}
                  onSeeAllPosts={() => setActiveTab('posts')}
                  onSeeAllActivity={() => setActiveTab('activity')}
                />
              )}

              {/* Campaigns tab. */}
              {activeTab === 'campaigns' && pubkey && (
                <ProfileCampaignsTab
                  pubkey={pubkey}
                  displayName={displayName}
                  isOwnProfile={isOwnProfile}
                  campaigns={profileCampaignStats.campaigns}
                  isLoading={profileCampaignStats.isVerifying && profileCampaignStats.campaigns.length === 0}
                />
              )}

              {/* Pledges tab. */}
              {activeTab === 'pledges' && pubkey && (
                <ProfilePledgesTab
                  pubkey={pubkey}
                  displayName={displayName}
                  isOwnProfile={isOwnProfile}
                  pledges={(allActions ?? []).filter((a) => a.pubkey === pubkey)}
                  btcPrice={btcPrice}
                  isLoading={!allActions}
                />
              )}

              {/* Activity — Agora feed scoped to this author. */}
              {activeTab === 'activity' && pubkey && (
                <ProfileActivityTab pubkey={pubkey} displayName={displayName} />
              )}

              {/* Pinned posts (only on Posts tab) */}
              {activeTab === 'posts' && pinnedIds.length > 0 && (
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
              {activeTab === 'wall' && (
                <div>
                  {wallReplyTarget && profileFollowsMe && (
                    <ComposeBox
                      compact
                      replyTo={wallReplyTarget}
                      placeholder={`Write on ${displayName}'s wall`}
                      onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wall-comments', pubkey] })}
                    />
                  )}

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
                  ) : orderedWallReplies.length > 0 ? (
                    <>
                      <FeedCard className="mt-2">
                        <FlatThreadedReplyList replies={orderedWallReplies} />
                      </FeedCard>
                      {hasNextWallPage && (
                        <div ref={scrollRef} className="flex justify-center py-6">
                          {isFetchingNextWallPage && (
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </>
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

              {/* Media tab. */}
              {activeTab === 'media' && (
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

              {/* Badges tab. */}
              {activeTab === 'badges' && pubkey && (
                <ProfileBadgesTab pubkey={pubkey} displayName={displayName} />
              )}

              {/* Posts / Replies / Likes — generic feed renderer. */}
              {isCoreProfileTab && activeTab !== 'wall' && activeTab !== 'media' && activeTab !== 'badges' && (
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
            </section>
          </div>
        </div>

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

        {/* Donate dialog — driven by the header Donate button and (later)
            campaign cards / dropdown rows. Resets the active campaign on
            close so reopening starts fresh. */}
        {donateCampaign && (
          <DonateDialog
            campaign={donateCampaign}
            open={donateOpen}
            onOpenChange={(open) => {
              setDonateOpen(open);
              if (!open) {
                // Invalidate donations cache so the new total reflects in stats.
                queryClient.invalidateQueries({ queryKey: ['campaign-donations', 'events', donateCampaign.aTag] });
              }
            }}
            btcPrice={btcPrice}
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

