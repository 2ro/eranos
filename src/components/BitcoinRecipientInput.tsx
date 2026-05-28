import { nip19 } from 'nostr-tools';
import { QrCode } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface BitcoinRecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /**
   * When set, the resolved Nostr profile (avatar + display name) is rendered
   * as a chip below the input. Used when the input value is an `npub1…` /
   * `nprofile1…` that the parent has decoded into a hex pubkey.
   */
  resolvedPubkey?: string;
  /**
   * When provided, a camera button is rendered inside the input that opens
   * a QR scanner. The parent owns the scanner lifecycle and interprets the
   * scan result (BIP-21 parsing, silent-payment priority, etc.).
   */
  onScanClick?: () => void;
  /** Localized aria-label for the scan button (only used when `onScanClick` is set). */
  scanLabel?: string;
}

/**
 * Plain-text recipient input for the Send Bitcoin dialog. Accepts whatever
 * the user types or pastes — Bitcoin addresses, BIP-352 silent-payment
 * codes, `npub1…` / `nprofile1…` identifiers, or `bitcoin:` URIs — and
 * leaves interpretation to the parent. When `resolvedPubkey` is set, the
 * resolved Nostr profile is shown as a chip below the input so the sender
 * can confirm the destination.
 *
 * The optional QR-scan button (controlled by `onScanClick`) is rendered
 * inside the input on the right; the parent handles the scanner dialog.
 */
export function BitcoinRecipientInput({ value, onChange, placeholder, resolvedPubkey, onScanClick, scanLabel }: BitcoinRecipientInputProps) {
  return (
    <div className="space-y-2">
      <div className="relative flex items-center">
        <Input
          id="hd-recipient-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'font-mono text-base md:text-sm',
            onScanClick && 'pr-11',
          )}
        />
        {onScanClick && (
          <button
            type="button"
            onClick={onScanClick}
            aria-label={scanLabel ?? 'Scan QR code'}
            className="absolute right-1 top-1/2 -translate-y-1/2 size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center justify-center motion-safe:transition-colors"
          >
            <QrCode className="size-4" />
          </button>
        )}
      </div>

      {resolvedPubkey && <ResolvedRecipientPreview pubkey={resolvedPubkey} />}
    </div>
  );
}

function ResolvedRecipientPreview({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const avatarUrl = sanitizeUrl(metadata?.picture);
  const encoded = nip19.npubEncode(pubkey);
  const fallbackLabel = `${encoded.slice(0, 12)}…${encoded.slice(-8)}`;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatarUrl} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block">{displayName}</span>
        <span className="text-xs text-muted-foreground truncate block">
          {metadata?.nip05?.startsWith('_@') ? metadata.nip05.slice(2) : metadata?.nip05 || fallbackLabel}
        </span>
      </div>
    </div>
  );
}
