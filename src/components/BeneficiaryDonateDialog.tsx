import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Copy, ExternalLink } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface BeneficiaryDonatePanelProps {
  /** Hex pubkey of the beneficiary. */
  pubkey: string;
}

/**
 * Inline panel rendering a beneficiary's Taproot address as a scannable
 * BIP-21 QR code, a copyable string, and an "Open in wallet" button.
 *
 * Used both by `BeneficiaryDonateDialog` (modal context) and embedded
 * directly into the campaign page when there's a single beneficiary.
 *
 * Always shows the beneficiary's profile preview (avatar + name) as a
 * link to their Nostr profile — even when the surrounding page also
 * identifies a campaign organizer, the beneficiary is a distinct party
 * (the organizer may be running the campaign on someone else's behalf).
 *
 * Intentionally minimal: no amount input, no PSBT/in-app wallet flow —
 * that's `DonateDialog`'s job.
 */
export function BeneficiaryDonatePanel({
  pubkey,
}: BeneficiaryDonatePanelProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);
  const profileUrl = useProfileUrl(pubkey, metadata);

  const address = useMemo(
    () => nostrPubkeyToBitcoinAddress(pubkey),
    [pubkey],
  );
  // BIP-21 URI: most wallets recognize the `bitcoin:` scheme when scanning.
  // No amount field — donor picks one in their wallet.
  const bip21 = address ? `bitcoin:${address}` : '';

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: 'Address copied' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select and copy the address manually.',
        variant: 'destructive',
      });
    }
  };

  if (!address) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="size-5 text-orange-500 shrink-0" />
        <span>We couldn't derive a Bitcoin address for this beneficiary.</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Beneficiary header — bigger avatar + a clear "Sending to"
          eyebrow above the name so the reader knows exactly who's
          receiving the donation. Avatar links to the profile. */}
      <Link
        to={profileUrl}
        className="flex items-center gap-3 rounded-lg -mx-2 px-2 py-2 motion-safe:transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="size-12 ring-2 ring-primary/20">
          {picture && <AvatarImage src={picture} alt="" />}
          <AvatarFallback className="bg-primary/20 text-primary font-semibold">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
            Supporting
          </div>
          <div className="font-semibold text-base truncate leading-tight">
            {displayName}
          </div>
        </div>
      </Link>

      {/* QR — large, centered on a clean white tile with the Agora
          logo embedded in an orange circular badge in the center.
          Error-correction level H tolerates the centered occlusion
          (~30% of modules can be missing and the code still scans).
          No nested panel around it — the QR is its own visual anchor. */}
      <div className="flex justify-center">
        <div className="relative rounded-2xl bg-white p-4 shadow-sm">
          <QRCodeCanvas value={bip21} size={280} level="H" />
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="rounded-full bg-primary p-2.5 ring-4 ring-white">
              <img
                src="/logo.svg"
                alt=""
                className="size-9 object-contain"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Copyable address — single line, tap to copy. No wrapping
          container; sits flush with the rest of the column. */}
      <button
        type="button"
        onClick={copyAddress}
        className="w-full flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs text-left hover:bg-muted/60 motion-safe:transition-colors"
        aria-label="Copy Bitcoin address"
      >
        <span className="flex-1 min-w-0 truncate" title={address}>
          {address}
        </span>
        {copied ? (
          <Check className="size-4 text-green-500 shrink-0" />
        ) : (
          <Copy className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Privacy notice — informational only. Bitcoin is a public
          ledger, so the donation can be traced back to the donor's
          wallet. */}
      <BitcoinPublicDisclaimer
        tone="soft"
        includeCashOutAdvice={false}
        leadText="Donations are public and can be traced back to you."
      />

      {/* Open in wallet — relies on the `bitcoin:` URI handler. */}
      <Button asChild className="w-full">
        <a href={bip21}>
          <ExternalLink className="size-4 mr-1.5" />
          Open in wallet
        </a>
      </Button>
    </div>
  );
}

interface BeneficiaryDonateDialogProps {
  /** Hex pubkey of the beneficiary. */
  pubkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal wrapper around `BeneficiaryDonatePanel` for places that still want
 * the dialog UX (e.g. multi-beneficiary campaigns, where each row's
 * "Donate" button opens this dialog).
 */
export function BeneficiaryDonateDialog({
  pubkey,
  open,
  onOpenChange,
}: BeneficiaryDonateDialogProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.display_name || metadata?.name || genUserName(pubkey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Donate to {displayName}</DialogTitle>
          <DialogDescription className="sr-only">
            Scan the QR code or copy the Bitcoin address below to donate.
          </DialogDescription>
        </DialogHeader>

        <BeneficiaryDonatePanel pubkey={pubkey} />
      </DialogContent>
    </Dialog>
  );
}
