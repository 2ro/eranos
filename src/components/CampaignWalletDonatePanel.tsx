import { useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';

import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { Button } from '@/components/ui/button';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useToast } from '@/hooks/useToast';
import type { CampaignWallet } from '@/lib/campaign';

interface CampaignWalletDonatePanelProps {
  /** Parsed wallet endpoint declared by the campaign's `w` tag. */
  wallet: CampaignWallet;
  /** Optional campaign title used in toast/copy messages. */
  campaignTitle?: string;
}

/**
 * Inline panel rendering the campaign's wallet endpoint as a scannable
 * QR code, a copyable string, and an "Open in wallet" button.
 *
 * Behavior forks on the wallet's mode:
 *
 * - **on-chain** (`bc1q…` / `bc1p…`) — BIP-21 QR with the address; a
 *   public-ledger disclaimer reminds donors that the donation is
 *   traceable.
 * - **sp** (`sp1…`) — raw silent-payment code QR; an "unlinkable by
 *   design" notice replaces the traceability disclaimer.
 *
 * Intentionally minimal: no amount input, no PSBT/in-app wallet flow —
 * that's `DonateDialog`'s job. This panel is the always-available
 * "scan and pay from any wallet" affordance.
 */
export function CampaignWalletDonatePanel({
  wallet,
  campaignTitle,
}: CampaignWalletDonatePanelProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Build the QR payload. For on-chain we use BIP-21 so any wallet that
  // recognizes the `bitcoin:` scheme can pre-fill the address; for SP we
  // use the BIP-21 `bitcoin:?sp=` extension. Donors pick the amount in
  // their wallet either way.
  const qrPayload = wallet.mode === 'onchain'
    ? `bitcoin:${wallet.value}`
    : `bitcoin:?sp=${wallet.value}`;

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(wallet.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: wallet.mode === 'sp' ? 'Silent-payment code copied' : 'Address copied' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select and copy the value manually.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* QR — large, centered on a clean white tile with the Agora logo
          embedded in an orange circular badge in the center.
          Error-correction level H tolerates the centered occlusion
          (~30% of modules can be missing and the code still scans). */}
      <div className="flex justify-center">
        <div className="relative rounded-2xl bg-white p-4 shadow-sm">
          <QRCodeCanvas value={qrPayload} size={280} level="H" />
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

      {/* Copyable value — single line, tap to copy. No wrapping
          container; sits flush with the rest of the column. */}
      <button
        type="button"
        onClick={copyValue}
        className="w-full flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs text-left hover:bg-muted/60 motion-safe:transition-colors"
        aria-label={wallet.mode === 'sp' ? 'Copy silent-payment code' : 'Copy Bitcoin address'}
      >
        <span className="flex-1 min-w-0 truncate" title={wallet.value}>
          {wallet.value}
        </span>
        {copied ? (
          <Check className="size-4 text-green-500 shrink-0" />
        ) : (
          <Copy className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {wallet.mode === 'onchain' ? (
        <BitcoinPublicDisclaimer
          tone="soft"
          includeCashOutAdvice={false}
          leadText="Donations are public and can be traced back to you."
        />
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 mt-0.5 text-primary" />
          <span>
            Silent-payment campaigns are unlinkable by design. Your donation
            cannot be tied to the campaign by anyone other than the
            organizer{campaignTitle ? ` (${campaignTitle})` : ''}.
          </span>
        </div>
      )}

      {/* Open in wallet — relies on the `bitcoin:` URI handler. SP codes
          inside `bitcoin:?sp=` are still understood by BIP-352-aware
          wallets. Older wallets that don't know about SP will ignore
          the parameter and either refuse the link or show an error — at
          which point the donor falls back to copy/paste anyway. */}
      <Button asChild className="w-full">
        <a href={qrPayload}>
          <ExternalLink className="size-4 mr-1.5" />
          Open in wallet
        </a>
      </Button>
    </div>
  );
}

/**
 * Fallback rendered when the wallet failed to parse. The detail page
 * should normally never reach this — `parseCampaign` rejects events
 * without a valid `w` tag — but a defensive surface is cheap and helps
 * debugging.
 */
export function CampaignWalletMissing() {
  return (
    <div className="flex items-center gap-2 text-sm">
      <AlertTriangle className="size-5 text-orange-500 shrink-0" />
      <span>This campaign is missing a valid wallet endpoint.</span>
    </div>
  );
}
