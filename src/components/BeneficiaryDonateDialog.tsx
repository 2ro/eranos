import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, HandHeart } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
 * address (derived from their Nostr pubkey) as both a scannable QR code
 * (`bitcoin:` URI) and a copyable string. Intentionally minimal: no amount
 * input, no PSBT/in-app wallet flow — that's `DonateDialog`'s job. This is
 * for donating directly to one individual.
 */
export function BeneficiaryDonateDialog({
  pubkey,
  open,
  onOpenChange,
}: BeneficiaryDonateDialogProps) {
  const author = useAuthor(pubkey);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const address = useMemo(
    () => nostrPubkeyToBitcoinAddress(pubkey),
    [pubkey],
  );

  // BIP-21 URI: most wallets recognize the `bitcoin:` scheme when scanning.
  // No amount field — donor picks one in their wallet.
  const bip21 = address ? `bitcoin:${address}` : '';

  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);

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
        {address ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HandHeart className="size-5 text-primary" />
                Donate to {name}
              </DialogTitle>
              <DialogDescription>
                Scan the QR code or copy the Bitcoin address to send a donation
                directly to this beneficiary.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Recipient identity strip */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                <Avatar className="size-10 shrink-0">
                  {picture && <AvatarImage src={picture} alt="" />}
                  <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{name}</div>
                  {metadata?.nip05 && (
                    <div className="text-xs text-muted-foreground truncate">
                      {metadata.nip05}
                    </div>
                  )}
                </div>
              </div>

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

              {/* Heads-up: this skips campaign tally */}
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription className="text-xs">
                  Direct donations go straight to this beneficiary on Bitcoin
                  but won't appear in the campaign's donor list or progress
                  bar.
                </AlertDescription>
              </Alert>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange-500" />
                Address unavailable
              </DialogTitle>
              <DialogDescription>
                We couldn't derive a Bitcoin address for this beneficiary.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
