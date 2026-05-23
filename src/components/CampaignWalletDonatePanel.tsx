import { useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';

import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { Button } from '@/components/ui/button';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useToast } from '@/hooks/useToast';
import type { CampaignWallet, CampaignWallets } from '@/lib/campaign';

interface CampaignWalletDonatePanelProps {
  /** Parsed wallet endpoints declared by the campaign's `w` tags. At least one must be present. */
  wallets: CampaignWallets;
}

/**
 * Build the BIP-21 URI used by the QR code and the "Open in wallet"
 * button.
 *
 * - Single on-chain endpoint:                `bitcoin:<bc1>`
 * - Single silent-payment endpoint:          `bitcoin:?sp=<sp1>`
 * - Both endpoints (combined BIP-21 URI):    `bitcoin:<bc1>?sp=<sp1>`
 *
 * BIP-352-aware wallets pick the `sp=` parameter; legacy wallets fall
 * back to the on-chain address.
 */
function buildQrPayload(wallets: CampaignWallets): string {
  const { onchain, sp } = wallets;
  if (onchain && sp) return `bitcoin:${onchain.value}?sp=${sp.value}`;
  if (onchain) return `bitcoin:${onchain.value}`;
  if (sp) return `bitcoin:?sp=${sp.value}`;
  // parseCampaign rejects events without any wallet; the panel should
  // never be rendered in this state.
  return 'bitcoin:';
}

/**
 * Inline panel rendering the campaign's wallet endpoints as a scannable
 * QR code, copyable strings, and an "Open in wallet" button.
 *
 * Behavior:
 *
 * - **on-chain only** (`bc1q…` / `bc1p…`) — BIP-21 QR with the address;
 *   a public-ledger disclaimer reminds donors that the donation is
 *   traceable.
 * - **silent payment only** (`sp1…`) — raw silent-payment code QR; an
 *   "unlinkable by design" notice replaces the traceability disclaimer.
 * - **both** — combined BIP-21 URI in the QR; donors see both
 *   disclaimers and a copyable row per endpoint, and BIP-352-aware
 *   wallets pick the SP path automatically.
 *
 * Intentionally minimal: no amount input, no PSBT/in-app wallet flow —
 * that's `DonateDialog`'s job. This panel is the always-available
 * "scan and pay from any wallet" affordance.
 */
export function CampaignWalletDonatePanel({
  wallets,
}: CampaignWalletDonatePanelProps) {
  const qrPayload = buildQrPayload(wallets);
  const { onchain, sp } = wallets;

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

      {/* Copyable values — one row per endpoint, tap to copy. */}
      <div className="space-y-2">
        {onchain && <WalletCopyRow wallet={onchain} dualMode={!!sp} />}
        {sp && <WalletCopyRow wallet={sp} dualMode={!!onchain} />}
      </div>

      {/* Disclaimers — each endpoint contributes its own. For dual
          campaigns, both stack: donors deserve to know that the
          on-chain leg is traceable AND that the SP leg is unlinkable. */}
      {onchain && (
        <BitcoinPublicDisclaimer
          tone="soft"
          includeCashOutAdvice={false}
          leadText={
            sp
              ? 'Donations to the on-chain address are public and can be traced back to you.'
              : 'Donations are public and can be traced back to you.'
          }
        />
      )}
      {sp && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 mt-0.5 text-primary" />
          <span>
            {onchain
              ? 'Donations to the silent-payment code are unlinkable by design and are not reflected in any public total.'
              : 'Silent-payment campaigns are unlinkable by design. Your donation cannot be tied to the campaign by anyone other than the organizer.'}
          </span>
        </div>
      )}

      {/* Open in wallet — relies on the `bitcoin:` URI handler. SP codes
          inside `bitcoin:?sp=` are still understood by BIP-352-aware
          wallets. Older wallets that don't know about SP will ignore
          the parameter and either refuse the link or show an error — at
          which point the donor falls back to copy/paste anyway. */}
      <Button asChild className="w-full text-white">
        <a href={qrPayload}>
          <ExternalLink className="size-4 mr-1.5" />
          Open in wallet
        </a>
      </Button>
    </div>
  );
}

/**
 * Single copyable row for one wallet endpoint. In dual-mode the row is
 * prefixed with a mode badge ("Address" or "Silent payment") so donors
 * can tell which is which at a glance.
 */
function WalletCopyRow({ wallet, dualMode }: { wallet: CampaignWallet; dualMode: boolean }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const isSp = wallet.mode === 'sp';

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(wallet.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: isSp ? 'Silent-payment code copied' : 'Address copied' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Select and copy the value manually.',
        variant: 'destructive',
      });
    }
  };

  return (
    <button
      type="button"
      onClick={copyValue}
      className="w-full flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-left hover:bg-muted/60 motion-safe:transition-colors"
      aria-label={isSp ? 'Copy silent-payment code' : 'Copy Bitcoin address'}
    >
      {dualMode && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isSp ? 'Silent' : 'Address'}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate font-mono text-xs" title={wallet.value}>
        {wallet.value}
      </span>
      {copied ? (
        <Check className="size-4 text-green-500 shrink-0" />
      ) : (
        <Copy className="size-4 text-muted-foreground shrink-0" />
      )}
    </button>
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
