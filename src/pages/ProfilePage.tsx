import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { ClipboardCopy, ExternalLink, VolumeX, Flag, Bitcoin, X, QrCode, Check, Copy, Loader2, Download, RotateCcw, Mail } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useAppContext } from '@/hooks/useAppContext';
import { useImageProxy } from '@/hooks/useImageProxy';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useMuteList } from '@/hooks/useMuteList';
import type { ProfileTab as CoreProfileTab } from '@/hooks/useProfileFeed';
import { useProfileSupplementary } from '@/hooks/useProfileData';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { genUserName } from '@/lib/genUserName';

import { openUrl } from '@/lib/downloadFile';
import { EmojifiedText } from '@/components/CustomEmoji';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ReportDialog } from '@/components/ReportDialog';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import { isAudioUrl, isImageUrl, isVideoUrl } from '@/lib/mediaTypeDetection';
import { VideoPlayer } from '@/components/VideoPlayer';

import { useUserStatus } from '@/hooks/useUserStatus';
import { useNip85UserStats } from '@/hooks/useNip85Stats';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useFeedSettings } from '@/hooks/useFeedSettings';

import { FollowQRDialog } from '@/components/FollowQRDialog';
import { ProfileRecoveryDialog } from '@/components/ProfileRecoveryDialog';
import { useProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import type { ProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import { useVerifierStatement } from '@/hooks/useVerifierStatement';
import { useActions } from '@/hooks/useActions';
import type { Action } from '@/hooks/useActions';
import {
  ProfileIdentityRail,
  ProfileAvatarBlock,
  ProfileIdentityHeader,
  ActionBar,
  ProfileOrganizationsSection,
} from '@/components/profile/ProfileIdentityRail';
import { ProfilePledgesTab } from '@/components/profile/ProfilePledgesTab';
import { ProfileActivityTab } from '@/components/profile/ProfileActivityTab';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileAgoraTab } from '@/components/profile/ProfileAgoraTab';
import type { ParsedCampaign } from '@/lib/campaign';
import type { AddrCoords } from '@/hooks/useEvent';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { impactMedium } from '@/lib/haptics';
import { cn } from '@/lib/utils';

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
}

function ProfileMoreMenu({ pubkey, displayName, open, onOpenChange, isOwnProfile }: ProfileMoreMenuProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const { addMute, removeMute, isMuted } = useMuteList();
  const userMuted = isMuted('pubkey', pubkey);
  const [reportOpen, setReportOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [followQROpen, setFollowQROpen] = useState(false);

  const close = () => onOpenChange(false);
  const openAfterClose = (setter: (v: boolean) => void) => {
    close();
    setTimeout(() => setter(true), 150);
  };
  const handleFollowQR = () => openAfterClose(setFollowQROpen);

  const handleCopyPubkey = () => {
    navigator.clipboard.writeText(npubEncoded);
    toast({ title: t('profile.toast.pubkeyCopied') });
    close();
  };

  const handleCopyLink = () => {
    const url = `${shareOrigin}/${npubEncoded}`;
    navigator.clipboard.writeText(url);
    toast({ title: t('profile.toast.linkCopied') });
    close();
  };

  const handleMuteUser = () => {
    const muteItem = { type: 'pubkey' as const, value: pubkey };
    const mutation = userMuted ? removeMute : addMute;
    mutation.mutate(muteItem, {
      onSuccess: () => {
        toast({ title: userMuted ? t('profile.toast.unmuted', { name: displayName }) : t('profile.toast.muted', { name: displayName }) });
      },
      onError: () => {
        toast({ title: userMuted ? t('profile.toast.unmuteFailed') : t('profile.toast.muteFailed'), variant: 'destructive' });
      },
    });
    close();
  };

  const handleReport = () => openAfterClose(setReportOpen);

  const handleRecovery = () => openAfterClose(setRecoveryOpen);

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogTitle className="sr-only">{t('profile.moreMenu.title')}</DialogTitle>

        <div className="pt-10 pb-2">
          <MenuRow
            icon={<ClipboardCopy className="size-5" />}
            label={t('profile.moreMenu.copyPubkey')}
            onClick={handleCopyPubkey}
          />
          <MenuRow
            icon={<ClipboardCopy className="size-5" />}
            label={t('profile.moreMenu.copyLink')}
            onClick={handleCopyLink}
          />

          {isOwnProfile ? (
            <>
              <MenuRow
                icon={<QrCode className="size-5" />}
                label={t('profile.moreMenu.shareFollowLink')}
                onClick={handleFollowQR}
              />
              <MenuRow
                icon={<RotateCcw className="size-5" />}
                label={t('profile.moreMenu.profileRecovery')}
                onClick={handleRecovery}
              />
            </>
          ) : (
            <>
              <MenuRow
                icon={<VolumeX className="size-5" />}
                label={userMuted ? t('profile.moreMenu.unmute', { name: displayName }) : t('profile.moreMenu.mute', { name: displayName })}
                onClick={handleMuteUser}
              />
              <MenuRow
                icon={<Flag className="size-5" />}
                label={t('profile.moreMenu.report', { name: displayName })}
                onClick={handleReport}
                destructive
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <ReportDialog pubkey={pubkey} open={reportOpen} onOpenChange={setReportOpen} />

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
  const { t } = useTranslation();
  const handleNavigate = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-bold">{t('profile.followingModal.title', { name: displayName })}</DialogTitle>
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
              {t('profile.followingModal.empty')}
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
// Retained interop, not Eranos marketing: legacy Agora clients publish a `$BTC`
// profile field, and this renders those third-party fields accurately. Eranos
// itself is Grin-only and offers no way to add such a field.

function BitcoinQRModal({ address }: { address: string }) {
  const { t } = useTranslation();
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
    toast({ title: t('common.copied'), description: t('profile.toast.btcAddressCopied') });
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
            <span>{t('profile.bitcoinModal.title')}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center my-5">
          <div className="bg-white p-3 rounded-xl">
            {qrUrl ? (
              <img src={qrUrl} alt={t('profile.bitcoinModal.qrAlt')} className="size-[220px]" />
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
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const isBtc = field.label === '$BTC';
  const safeUrl = sanitizeUrl(field.value);
  const isUrl = !!safeUrl;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(field.value);
    setCopied(true);
    toast({ title: t('common.copied'), description: t('profile.toast.btcAddressCopied') });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isBtc) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="size-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
          <Bitcoin className="size-3 text-white" />
        </div>
        <span className="text-sm font-semibold shrink-0">{t('profile.bitcoinModal.title')}</span>
        <span className="text-sm text-muted-foreground font-mono truncate">{field.value.slice(0, 12)}…{field.value.slice(-6)}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
            title={t('profile.bitcoinModal.copyAddress')}
          >
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          </button>
          <Dialog>
            <DialogTrigger asChild>
              <button className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary" title={t('profile.bitcoinModal.showQr')}>
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
            title={t('profile.bitcoinModal.viewOnMempool')}
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
            alt={field.label || t('profile.lightbox.imageAlt')}
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

// ----- Profile Image Lightbox -----

function ProfileImageLightbox({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const { t } = useTranslation();
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
            title={t('profile.lightbox.openOriginal')}
          >
            <Download className="size-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={t('profile.lightbox.close')}
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
  const [proxyFailed, setProxyFailed] = useState(false);
  const proxy = useImageProxy();

  useEffect(() => {
    setUseBlobFallback(false);
    setBlobUrl(undefined);
    setFailed(false);
    setProxyFailed(false);
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

  // Route the displayed src through the image proxy at banner width. The
  // proxy serves permissive CORS so the CORP/blob fallback usually isn't
  // needed when the proxy is on. If the proxy itself errors, swap to the
  // original src (which may then trigger the blob fallback).
  const proxied = proxy(src, 1200);
  const usingProxy = proxied !== src;
  const displaySrc = proxyFailed || !usingProxy ? src : proxied;

  const imageSrc = blobUrl ?? (useBlobFallback ? undefined : displaySrc);

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
            // First failure with the proxy → drop back to the original URL.
            if (usingProxy && !proxyFailed && !blobUrl && !useBlobFallback) {
              setProxyFailed(true);
              return;
            }
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

// ----- Tab content router -----

interface ProfileTabContentProps {
  activeTab: string;
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  profileCampaignStats: ProfileCampaignStats;
  allActions: Action[] | undefined;
  campaigns: ParsedCampaign[];
  pledges: Action[];
}

/**
 * Single source of truth for tab body rendering — used by both the
 * desktop and mobile layouts. The Agora tab owns the old Overview,
 * Verified, and Campaigns concepts; Activity remains separate.
 */
function ProfileTabContent({
  activeTab,
  pubkey,
  displayName,
  isOwnProfile,
  profileCampaignStats,
  allActions,
  campaigns,
  pledges,
}: ProfileTabContentProps) {
  if (activeTab === 'agora' || activeTab === 'overview' || activeTab === 'verified' || activeTab === 'campaigns') {
    return (
      <ProfileAgoraTab
        pubkey={pubkey}
        displayName={displayName}
        isOwnProfile={isOwnProfile}
        profileCampaignStats={profileCampaignStats}
        campaigns={campaigns}
      />
    );
  }

  if (activeTab === 'community') {
    return (
      <div className="pt-5">
        <ProfileOrganizationsSection pubkey={pubkey} />
      </div>
    );
  }

  if (activeTab === 'pledges') {
    return (
      <ProfilePledgesTab
        pubkey={pubkey}
        displayName={displayName}
        isOwnProfile={isOwnProfile}
        pledges={pledges}
        isLoading={!allActions}
      />
    );
  }

  // Default — activity.
  return <ProfileActivityTab pubkey={pubkey} displayName={displayName} />;
}

// ----- Main Component -----

// Profile keeps Activity separate and folds the old Overview, Verified,
// and Campaigns tabs into one Agora surface. Groups and Pledges are
// temporarily hidden.
const PROFILE_TAB_LABEL_KEYS = ['agora', 'activity'] as const;

// Map from label key → internal tab id.
const CORE_TAB_IDS: Record<string, string> = {
  'agora': 'agora',
  'overview': 'overview',
  'verified': 'verified',
  'activity': 'activity',
  'campaigns': 'campaigns',
  'groups': 'community',
  'pledges': 'pledges',
};

const KNOWN_TAB_IDS = new Set(['agora', 'overview', 'verified', 'activity', 'campaigns', 'community', 'pledges']);
const DESKTOP_TAB_IDS = new Set(['agora', 'activity']);

/**
 * Read the viewport at first render to pick the initial active tab.
 * `lg` is Tailwind's 1024px breakpoint and matches the grid boundary
 * where the desktop two-column layout kicks in. Doing this in
 * `useState`'s initializer (instead of `useEffect`) avoids a flash of
 * "activity" on mobile before the effect runs.
 */
function getInitialActiveTab(): string {
  if (typeof window === 'undefined' || !window.matchMedia) return 'activity';
  return window.matchMedia('(min-width: 1024px)').matches ? 'activity' : 'agora';
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const params = useParams();
  const npub = params.npub ?? params.nip19;
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<CoreProfileTab | string>(getInitialActiveTab);
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
  const { t } = useTranslation();
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
          <DialogTitle className="text-base font-bold">{t('profile.followersModal.title', { name: displayName })}</DialogTitle>
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
              {t('profile.followersModal.empty')}
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

  // Is the profile being viewed a verifier (has a kind 14672 statement)?
  // When so, Agora becomes the default on first load. The flag is async,
  // so the default switch happens in an effect.
  const { isVerifier } = useVerifierStatement(pubkey);

  // True once the user has explicitly picked a tab, so the verifier
  // default-switch never overrides a deliberate selection.
  const tabManuallySelected = useRef(false);
  const handleTabChange = useCallback((tabId: string) => {
    tabManuallySelected.current = true;
    setActiveTab(tabId);
  }, []);

  // Default verifier profiles to the Agora tab on first load.
  useEffect(() => {
    if (isVerifier && !tabManuallySelected.current) {
      setActiveTab('agora');
    }
  }, [isVerifier]);

  // Reset the "manually selected" guard when navigating to a new profile
  // so the verifier default applies fresh on each profile.
  useEffect(() => {
    tabManuallySelected.current = false;
  }, [pubkey]);

  // Two tab lists are kept for layout symmetry, but both now expose the
  // same content set: Agora and Activity. The rail still covers desktop
  // identity details while Agora contains those sections on mobile.
  const desktopTabs = useMemo(() => {
    return PROFILE_TAB_LABEL_KEYS.map((key) => ({
      id: CORE_TAB_IDS[key],
      label: key === 'agora' ? t('search.tabs.agora') : t(`profile.tabs.${key}`),
    }));
  }, [t]);
  const mobileTabs = useMemo(() => {
    return PROFILE_TAB_LABEL_KEYS.map((key) => ({
      id: CORE_TAB_IDS[key],
      label: key === 'agora' ? t('search.tabs.agora') : t(`profile.tabs.${key}`),
    }));
  }, [t]);

  // Keep the active tab in sync if it ever falls out of the recognized
  // set. Legacy Agora-adjacent tab ids collapse into the new unified tab;
  // desktop still redirects mobile-only community content to Activity.
  useEffect(() => {
    const isKnown = KNOWN_TAB_IDS.has(activeTab);
    if (!isKnown) {
      setActiveTab(getInitialActiveTab());
      return;
    }
    if (activeTab === 'overview' || activeTab === 'verified' || activeTab === 'campaigns') {
      setActiveTab('agora');
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const desktopMq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (desktopMq.matches && !DESKTOP_TAB_IDS.has(activeTab)) {
        // Resizing from mobile → desktop while on a mobile-only tab.
        setActiveTab('activity');
      }
    };
    onChange();
    desktopMq.addEventListener('change', onChange);
    return () => desktopMq.removeEventListener('change', onChange);
  }, [activeTab]);

  // Kind 0 — resolved from the author cache.
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
  const displayName = metadata?.name || (pubkey ? genUserName(pubkey) : t('profile.anonymous'));

  // Kind 3 + 10001 — fetched separately so the large contact list
  // doesn't block the profile header or feed from rendering.
  const { data: supplementary } = useProfileSupplementary(pubkey);

  // Parse profile fields from the raw kind 0 event content (website and lightning are shown in the header instead)
  const fields = useMemo(() => {
    return metadataEvent?.content ? parseProfileFields(metadataEvent.content) : [];
  }, [metadataEvent?.content]);

  useSeoMeta({
    title: `${displayName} | ${config.appName}`,
    description: metadata?.about || t('profile.seoDescriptionFallback'),
  });

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

  // Agora stat sources: campaigns and pledges count.
  const profileCampaignStats = useProfileCampaignStats(pubkey);
  // Pledges (kind 36639) authored by this user. Filters the global pledges
  // list rather than issuing a separate per-author query.
  const { data: allActions } = useActions({ limit: 100 });

  const isOwnProfile = user?.pubkey === pubkey;
  const { feedSettings } = useFeedSettings();

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
      toast({ title: isFollowing ? t('profile.toast.unfollowed', { name: displayName }) : t('profile.toast.followed', { name: displayName }) });
    } catch (err) {
      console.error('Follow toggle failed:', err);
      toast({ title: t('profile.toast.followFailed'), variant: 'destructive' });
    }
  };

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
          (tag === 'agora-feed')
        );
      },
    });
  }, [queryClient, pubkey]);

  if (!pubkey) {
    // If we're resolving a NIP-05, show loading state
    if (isNip05Param && nip05Loading) {
      return (
        <main className="min-h-screen pb-16">
          <div className="h-48 bg-secondary animate-pulse" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-4">
            <div className="flex justify-between items-start -mt-16 mb-3">
              <Skeleton className="size-32 rounded-full border-4 border-background" />
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
            <p>{t('profile.userNotFoundNip05', { handle: npub })}</p>
            <p className="text-xs mt-2">{t('profile.couldNotResolveNip05')}</p>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-7xl mx-auto p-8 text-center text-muted-foreground">
          <p>{t('profile.userNotFound')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16">
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Banner — full-bleed at the top of the page. The avatar lives in
            the identity rail below and overlaps this banner via -mt-16. */}
        <div className="h-48 bg-secondary relative">
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

        {/* Two layouts share the same banner above. Desktop (lg+) keeps
            the original two-column grid with the sticky identity rail on
            the left; mobile reshapes the page so the avatar + identity
            header sit directly above a 5-tab bar (Overview is the
            default tab and surfaces what the rail would have shown).
            Toggled by `hidden`/`lg:hidden` instead of `useIsMobile` so
            there's no first-render flicker. */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          {/* ─── Desktop layout (lg+) ─── */}
          <div className="hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6 lg:gap-10">
            {/* Left column — identity rail. Sticky to the top of the page
                scroll so it stays present while the right column feeds
                new tab content underneath. */}
            {pubkey && (
              <aside className="lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-2rem)] pb-4">
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
                  pledges={(allActions ?? []).filter((a) => a.pubkey === pubkey)}
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
                  onTabChange={(id) => handleTabChange(id)}
                  canFollow={!!user}
                />
              </aside>
            )}

            {/* Right column — tab navigation and the active tab's content.
                `min-w-0` is critical inside a grid track so long unbroken
                text doesn't push the column wider than its fraction. */}
            <section className="min-w-0">
              <ProfileTabs
                tabs={desktopTabs}
                activeTab={DESKTOP_TAB_IDS.has(activeTab) ? activeTab : 'activity'}
                onChange={handleTabChange}
              />
              {pubkey && (
                <ProfileTabContent
                  activeTab={DESKTOP_TAB_IDS.has(activeTab) ? activeTab : 'activity'}
                  pubkey={pubkey}
                  displayName={displayName}
                  isOwnProfile={isOwnProfile}
                  profileCampaignStats={profileCampaignStats}
                  allActions={allActions}
                  campaigns={profileCampaignStats.campaigns}
                  pledges={(allActions ?? []).filter((a) => a.pubkey === pubkey)}
                />
              )}
            </section>
          </div>

          {/* ─── Mobile layout (<lg) ─── */}
          {pubkey && (
            <div className="lg:hidden">
              {author.isLoading ? (
                <div className="flex flex-col gap-5 pt-2">
                  <Skeleton className="size-32 rounded-full -mt-20 border-4 border-background" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full mt-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-full" />
                </div>
              ) : (
                <>
                  {/* Avatar + action buttons share one row, Twitter/X-style:
                      the avatar overhangs the banner on the left while the
                      Edit Profile / QR / more (or Follow / Donate) buttons sit
                      bottom-right. The avatar sits outside any subsequent
                      scroll/overflow container so its `-mt-20` overhang into
                      the banner isn't clipped. */}
                  <div className="flex items-end justify-between gap-2">
                    <ProfileAvatarBlock
                      metadata={metadata}
                      displayName={displayName}
                      status={feedSettings.showUserStatuses !== false && profileStatus.status
                        ? { text: profileStatus.status, url: profileStatus.url ?? undefined }
                        : undefined}
                      onLightbox={(url) => setLightboxImage(url)}
                    />
                    <ActionBar
                      pubkey={pubkey}
                      align="end"
                      isOwnProfile={isOwnProfile}
                      isFollowing={isFollowing}
                      followPending={followPending}
                      canFollow={!!user}
                      onToggleFollow={handleToggleFollow}
                      onMoreMenuOpen={() => setMoreMenuOpen(true)}
                      onFollowQROpen={() => setFollowQROpen(true)}
                    />
                  </div>

                  {/* Persistent identity header above the tab bar — name,
                      bio, and the top-level stats row. The action bar is
                      hidden here because it now lives on the avatar row. */}
                  <ProfileIdentityHeader
                    className="mt-4"
                    hideActionBar
                    pubkey={pubkey}
                    isOwnProfile={isOwnProfile}
                    metadata={metadata}
                    metadataEvent={metadataEvent}
                    displayName={displayName}
                    websiteHref={(() => {
                      if (!metadata?.website) return undefined;
                      const candidate = metadata.website.startsWith('http')
                        ? metadata.website
                        : `https://${metadata.website}`;
                      return sanitizeUrl(candidate);
                    })()}
                    fields={fields}
                    fieldsContent={fields.map((field, i) => (
                      <ProfileFieldInline key={i} field={field} />
                    ))}
                    isFollowing={isFollowing}
                    followPending={followPending}
                    canFollow={!!user}
                    followersCount={followersCount}
                    followingCount={profileFollowing?.count ?? 0}
                    onToggleFollow={handleToggleFollow}
                    onMoreMenuOpen={() => setMoreMenuOpen(true)}
                    onFollowQROpen={() => setFollowQROpen(true)}
                    onFollowersOpen={() => setFollowersModalOpen(true)}
                    onFollowingOpen={() => setFollowingModalOpen(true)}
                  />

                  {/* Tab bar — sticky to the top of the page scroll once
                      it leaves the viewport. Sits right below the stats. */}
                  <div className="mt-5 min-w-0">
                    <ProfileTabs
                      tabs={mobileTabs}
                      activeTab={activeTab}
                      onChange={handleTabChange}
                    />
                    <ProfileTabContent
                      activeTab={activeTab}
                      pubkey={pubkey}
                      displayName={displayName}
                      isOwnProfile={isOwnProfile}
                      profileCampaignStats={profileCampaignStats}
                      allActions={allActions}
                      campaigns={profileCampaignStats.campaigns}
                      pledges={(allActions ?? []).filter((a) => a.pubkey === pubkey)}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Profile More Menu */}
        {pubkey && (
          <ProfileMoreMenu
            pubkey={pubkey}
            displayName={displayName}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
            isOwnProfile={isOwnProfile}
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
