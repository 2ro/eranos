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
import { Label } from '@/components/ui/label';
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
  // Bitcoin's public ledger means the donation can be linked back to the
  // donor's wallet forever. Gate the "Open in wallet" CTA on an explicit
  // acknowledgement — same pattern as the wallet's Send dialog for raw
  // on-chain payments.
  const [acknowledgedPublic, setAcknowledgedPublic] = useState(false);

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
    <div className="space-y-4">
      <Link
        to={profileUrl}
        className="flex items-center gap-3 rounded-md -mx-2 px-2 py-1.5 motion-safe:transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="size-10 ring-1 ring-border">
          {picture && <AvatarImage src={picture} alt="" />}
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="font-medium truncate">{displayName}</div>
        </div>
      </Link>

      {/* QR code */}
      <div className="flex justify-center">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <QRCodeCanvas value={bip21} size={200} level="M" />
        </div>
      </div>

      {/* Copyable address */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Bitcoin address
        </Label>
        <button
          type="button"
          onClick={copyAddress}
          className="w-full flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs break-all text-left hover:bg-muted/60 motion-safe:transition-colors"
          aria-label="Copy Bitcoin address"
        >
          <span className="break-all">{address}</span>
          {copied ? (
            <Check className="size-4 text-green-500 shrink-0" />
          ) : (
            <Copy className="size-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </div>

      {/* Privacy disclaimer — must be acknowledged before the donor
          opens their wallet, since opening it triggers the public on-chain
          payment flow. The copyable address above stays available for
          users who want to inspect the destination first. */}
      <BitcoinPublicDisclaimer
        acknowledged={acknowledgedPublic}
        onAcknowledgedChange={setAcknowledgedPublic}
        leadText="Donations are public and can be traced back to you."
      />

      {/* Open in wallet — relies on the `bitcoin:` URI handler. */}
      <Button asChild className="w-full" disabled={!acknowledgedPublic}>
        <a
          href={acknowledgedPublic ? bip21 : undefined}
          aria-disabled={!acknowledgedPublic}
          onClick={(e) => {
            if (!acknowledgedPublic) e.preventDefault();
          }}
          tabIndex={acknowledgedPublic ? undefined : -1}
        >
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
