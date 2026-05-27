import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { Copy, Check } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { genUserName } from '@/lib/genUserName';

interface FollowQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowQRDialog({ open, onOpenChange }: FollowQRDialogProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey ?? '');
  const shareOrigin = useShareOrigin();
  const [copied, setCopied] = useState(false);

  const metadata = author.data?.metadata;
  const displayName = user ? metadata?.name || metadata?.display_name || genUserName(user.pubkey) : '';

  const npub = user ? nip19.npubEncode(user.pubkey) : '';
  const nip05 = metadata?.nip05?.trim();
  const followIdentifier = nip05 || npub;
  // Route to the bare /:nip19 path — Agora's universal NIP-19 / NIP-05 dispatcher
  // (src/pages/NIP19Page.tsx) resolves both npub and `user@domain.com` to ProfilePage.
  // There is no `/follow/...` route, so anything nested under it 404s.
  const followUrl = followIdentifier ? `${shareOrigin}/${followIdentifier}` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(followUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6 flex flex-col items-center gap-5 rounded-2xl">
        <DialogTitle className="sr-only">Share follow link</DialogTitle>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2">
          <Avatar className="size-16 ring-2 ring-secondary">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xl font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm text-muted-foreground text-center">
            Scan to follow <span className="text-foreground font-medium">{displayName}</span>
          </p>
        </div>

        {/* QR code */}
        <div className="flex justify-center">
          <div className="relative rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeCanvas value={followUrl} size={280} level="H" />
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="rounded-full bg-primary p-2 ring-[6px] ring-white">
                <img
                  src="/logo.svg"
                  alt=""
                  className="size-16 object-contain brightness-0 invert"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Copy link */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <Check className="size-3.5 text-primary flex-shrink-0" />
            : <Copy className="size-3.5 flex-shrink-0" />}
          <span className="truncate max-w-64">{followUrl}</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
