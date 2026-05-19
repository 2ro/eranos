import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { useToast } from '@/hooks/useToast';
import { nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface BeneficiaryDonateDialogProps {
  /** Hex pubkey of the beneficiary. */
  pubkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Per-beneficiary donate dialog. Renders the recipient's Taproot Bitcoin
 * address (derived from their Nostr pubkey) as a scannable BIP-21 QR code
 * and a copyable string, plus an "Open in wallet" affordance.
 *
 * Intentionally minimal: no amount input, no PSBT/in-app wallet flow —
 * that's `DonateDialog`'s job. This is for donating directly to one
 * individual.
 */
export function BeneficiaryDonateDialog({
  pubkey,
  open,
  onOpenChange,
}: BeneficiaryDonateDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Donate to {displayName}</DialogTitle>
          <DialogDescription className="sr-only">
            Scan the QR code or copy the Bitcoin address below to donate.
          </DialogDescription>
        </DialogHeader>

        {/* Profile preview */}
        <div className="flex items-center gap-3">
          <Avatar className="size-10 ring-1 ring-border">
            {picture && <AvatarImage src={picture} alt="" />}
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate">{displayName}</div>
          </div>
        </div>

        {address ? (
          <div className="space-y-4">
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

            {/* Open in wallet — relies on the `bitcoin:` URI handler. */}
            <Button asChild className="w-full">
              <a href={bip21}>
                <ExternalLink className="size-4 mr-1.5" />
                Open in wallet
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-5 text-orange-500 shrink-0" />
              <span>We couldn't derive a Bitcoin address for this beneficiary.</span>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
