import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useToast } from '@/hooks/useToast';
import type { CampaignWallets } from '@/lib/campaign';

interface CampaignWalletDonatePanelProps {
  /** Parsed wallet endpoints declared by the campaign's `w` tags. At least one must be present. */
  wallets: CampaignWallets;
  /**
   * Optional primary action rendered immediately above the
   * "Open external wallet" button — typically a "Pay with Agora"
   * button injected by the campaign detail page when the logged-in donor
   * has an HD wallet available.
   *
   * When supplied, the "Open external wallet" button switches to the
   * `outline` variant so the in-app pay action visually leads. When
   * absent, the external-wallet button keeps its default (primary)
   * styling — the panel still works on its own for logged-out donors
   * and SP-only campaigns.
   */
  primaryAction?: ReactNode;
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
 * QR code, a copyable string, and an "Open in wallet" button.
 *
 * Behavior:
 *
 * - **on-chain only** (`bc1q…` / `bc1p…`) — BIP-21 QR with the address
 *   and a copyable row for the raw address.
 * - **silent payment only** (`sp1…`) — raw silent-payment code QR and a
 *   copyable row for the raw SP code.
 * - **both** — combined BIP-21 URI in the QR and a single copyable row
 *   containing the same `bitcoin:<addr>?sp=<sp>` URI; BIP-352-aware
 *   wallets pick the SP path automatically, legacy wallets fall back to
 *   the on-chain address.
 *
 * Intentionally minimal: no amount input, no PSBT/in-app wallet flow —
 * that's `DonateDialog`'s job. This panel is the always-available
 * "scan and pay from any wallet" affordance.
 */
export function CampaignWalletDonatePanel({
  wallets,
  primaryAction,
}: CampaignWalletDonatePanelProps) {
  const { t } = useTranslation();
  const qrPayload = buildQrPayload(wallets);
  const { onchain, sp } = wallets;

  // When both endpoints are present, donors copy the same BIP-21 URI
  // that the QR encodes — modern wallets parse it in their recipient
  // field. When only one endpoint exists, the raw value is friendlier.
  const copyValue = onchain && sp ? qrPayload : (onchain?.value ?? sp?.value ?? '');
  const copyLabel = onchain && sp
    ? 'Payment URI'
    : sp
      ? 'Silent-payment code'
      : 'Bitcoin address';

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

      {/* Copyable value — single row mirroring the QR payload. */}
      <WalletCopyRow value={copyValue} label={copyLabel} />

      {/* Optional in-app pay action rendered immediately above the
          external-wallet button. When present it becomes the primary
          CTA; the external button below downgrades to `outline` so
          there's only ever one orange button stacked here. */}
      {primaryAction}

      {/* "Open in wallet" — relies on the `bitcoin:` URI handler. SP
          codes inside `bitcoin:?sp=` are still understood by BIP-352-
          aware wallets. Older wallets that don't know about SP will
          ignore the parameter and either refuse the link or show an
          error — at which point the donor falls back to copy/paste
          anyway.

          The label switches to "Open external wallet" only when a
          `primaryAction` slot is filled (i.e. the in-app "Pay with
          Agora" button is right above it) — that's the one situation
          where we need to disambiguate between "external" and "Agora's
          own wallet". When the slot is empty the qualifier is just
          noise. */}
      <Button
        asChild
        variant={primaryAction ? 'outline' : 'default'}
        className={primaryAction ? 'w-full' : 'w-full text-white'}
      >
        <a href={qrPayload}>
          <ExternalLink className="size-4 mr-1.5" />
          {primaryAction
            ? t('campaignsDetail.openExternalWallet')
            : t('campaignsDetail.openInWallet')}
        </a>
      </Button>
    </div>
  );
}

/**
 * Single copyable row for the wallet payload. Renders the value in a
 * monospace font and copies it to the clipboard on click. The label is
 * used in the aria-label and the success toast so donors know what
 * they just copied.
 */
function WalletCopyRow({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: `${label} copied` });
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
      onClick={handleCopy}
      className="w-full flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-left hover:bg-muted/60 motion-safe:transition-colors"
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      <span className="flex-1 min-w-0 truncate font-mono text-xs" title={value}>
        {value}
      </span>
      {copied ? (
        <Check className="size-4 text-green-500 shrink-0" />
      ) : (
        <Copy className="size-4 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}
