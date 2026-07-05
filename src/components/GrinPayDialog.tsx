/**
 * GrinPayDialog — the Grin donate flow (Plan 2, C2/C3), replacing the old
 * BTC DonateDialog at the campaign donate trigger.
 *
 * Two optional paths, tabbed when both are available:
 *
 * 1. **GoblinPay** — the in-app automatic path. Creates an invoice on the
 *    instance's GoblinPay server, renders the receiving `nprofile` as a QR
 *    (scan with a Goblin wallet; the payment travels as a gift-wrapped
 *    slatepack over Nostr), polls live status (waiting → received →
 *    confirmed), links the hosted checkout, and offers the manual
 *    slatepack fallback (paste S1 → get S2 back) when the automatic flow
 *    can't be used. After payment, the donor can publish the server-signed
 *    receipt as a kind-3414 event so the campaign's proof-verified tally
 *    picks it up.
 *
 * 2. **Grin address** — the native path. Shows the campaign's published
 *    `grin1…` Slatepack address + QR; the donor pays from any Grin wallet
 *    (Tor-interactive or slatepack — the donor's wallet handles transport,
 *    Eranos never runs a wallet or Tor). Afterwards the donor can paste
 *    their wallet's payment proof; Eranos verifies it locally (receiver
 *    signature + kernel on-chain) and publishes it for the tally.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, HandHeart, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import {
  useCreateGrinInvoice,
  useGrinInvoiceStatus,
  useGrinPayConfig,
  useGrinPayment,
  useGrinReceipt,
  useManualSlatepack,
} from '@/hooks/useGrinPay';
import { formatGrin, parseGrinAmount } from '@/lib/goblinPay';
import {
  GRIN_DONATION_KIND,
  kernelOnChain,
  bytesToHex,
  decodeSlatepackAddress,
  parseReceiverProof,
  verifyReceiverProof,
} from '@/lib/grinProof';
import { grinDonationPaths, type ParsedCampaign } from '@/lib/campaign';

interface GrinPayDialogProps {
  campaign: ParsedCampaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Small copy-to-clipboard row used for nprofile / grin1 / slatepack values. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the value is still selectable below
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      aria-label={label}
    >
      {copied
        ? <Check className="size-3.5 text-primary flex-shrink-0" />
        : <Copy className="size-3.5 flex-shrink-0" />}
      <span className="truncate font-mono" dir="ltr">{value}</span>
    </button>
  );
}

/** QR in a white surface so it scans on both themes. */
function PayQR({ value }: { value: string }) {
  return (
    <div className="flex justify-center">
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <QRCodeCanvas value={value} size={224} level="M" className="h-auto w-full max-w-56" />
      </div>
    </div>
  );
}

// ─── GoblinPay invoice flow ──────────────────────────────────────────

function GoblinPayFlow({ campaign, dialogOpen }: { campaign: ParsedCampaign; dialogOpen: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending: publishing } = useNostrPublish();

  const [amount, setAmount] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [receiptPublished, setReceiptPublished] = useState(false);

  const createInvoice = useCreateGrinInvoice();
  const invoice = createInvoice.data;

  const { data: status } = useGrinInvoiceStatus(invoice?.token, dialogOpen && !!invoice);
  const paidPaymentId = status?.paidPaymentId ?? null;
  const { data: payment } = useGrinPayment(paidPaymentId, dialogOpen && !!paidPaymentId);
  const { data: receipt } = useGrinReceipt(paidPaymentId, dialogOpen && !!paidPaymentId);

  const manual = useManualSlatepack();

  const amountNanogrin = parseGrinAmount(amount);

  const onCreate = async () => {
    if (amountNanogrin === null) return;
    try {
      await createInvoice.mutateAsync({
        amountNanogrin,
        orderRef: campaign.aTag,
        memo: t('grinPay.invoiceMemo', { title: campaign.title }),
      });
    } catch (err) {
      toast({
        title: t('grinPay.errorCreateInvoice'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const onManualSubmit = async () => {
    if (!invoice || !s1.trim()) return;
    try {
      const armor = await manual.mutateAsync({ token: invoice.token, s1 });
      setS2(armor);
    } catch (err) {
      toast({
        title: t('grinPay.errorManual'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  /**
   * Publish the server-signed receipt as a kind-3414 donation event so the
   * campaign's proof-verified tally can count it. The receipt's RAW bytes
   * are the event content — re-serializing could break the BIP-340
   * signature for readers.
   */
  const onPublishReceipt = async () => {
    if (!receipt || !user) return;
    try {
      await publishEvent({
        kind: GRIN_DONATION_KIND,
        content: receipt.raw,
        tags: [
          ['a', campaign.aTag],
          ['p', campaign.pubkey],
          ['alt', `Grin donation receipt for campaign "${campaign.title}"`],
        ],
      });
      setReceiptPublished(true);
      void queryClient.invalidateQueries({ queryKey: ['campaign-grin-total', campaign.aTag] });
      toast({ title: t('grinPay.receiptPublished'), description: t('grinPay.receiptPublishedDesc') });
    } catch (err) {
      toast({
        title: t('grinPay.errorPublish'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  // ── Step 1: amount ──
  if (!invoice) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('grinPay.goblinPayHelp')}</p>
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            placeholder={t('grinPay.amountPlaceholder')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label={t('grinPay.amountLabel')}
            className="pr-16"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            GRIN
          </span>
        </div>
        <Button
          className="w-full"
          disabled={amountNanogrin === null || createInvoice.isPending}
          onClick={onCreate}
        >
          {createInvoice.isPending
            ? <Loader2 className="size-4 mr-2 animate-spin" />
            : <HandHeart className="size-4 mr-2" />}
          {t('grinPay.createInvoice')}
        </Button>
      </div>
    );
  }

  // ── Step 2: pay + live status ──
  const isPaid = status?.status === 'paid' || !!paidPaymentId;
  const isExpired = status?.status === 'expired';
  const isConfirmed = payment?.status === 'confirmed';

  return (
    <div className="space-y-4">
      {!isPaid && !isExpired && (
        <>
          <PayQR value={invoice.nprofile} />
          <div className="space-y-1.5">
            <CopyValue value={invoice.nprofile} label={t('grinPay.copyNprofile')} />
            <p className="text-xs text-muted-foreground">
              {t('grinPay.scanToPay', { amount: invoice.amount })}
            </p>
          </div>
          <a
            href={invoice.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {t('grinPay.openCheckout')}
          </a>
        </>
      )}

      {/* Live status */}
      <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm" aria-live="polite">
        {isExpired ? (
          <span className="text-destructive">{t('grinPay.statusExpired')}</span>
        ) : isConfirmed ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-primary">
            <Check className="size-4" />
            {t('grinPay.statusConfirmed', {
              amount: payment ? formatGrin(payment.amount) : invoice.amount,
            })}
          </span>
        ) : isPaid ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-4 animate-spin" />
            {t('grinPay.statusReceived')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('grinPay.statusWaiting')}
          </span>
        )}
      </div>

      {/* Record the donation for the public tally (needs the signed receipt). */}
      {isPaid && receipt && user && !receiptPublished && (
        <Button className="w-full" variant="outline" disabled={publishing} onClick={onPublishReceipt}>
          {publishing && <Loader2 className="size-4 mr-2 animate-spin" />}
          {t('grinPay.publishReceipt')}
        </Button>
      )}
      {receiptPublished && (
        <p className="text-xs text-muted-foreground">{t('grinPay.donationRecorded')}</p>
      )}

      {/* Manual slatepack fallback */}
      {!isPaid && !isExpired && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowManual((v) => !v)}
          >
            {t('grinPay.manualToggle')}
          </button>
          {showManual && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">{t('grinPay.manualHelp')}</p>
              <Textarea
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                placeholder="BEGINSLATEPACK. … ENDSLATEPACK."
                rows={4}
                className="font-mono text-xs"
                dir="ltr"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!s1.trim() || manual.isPending}
                onClick={onManualSubmit}
              >
                {manual.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                {t('grinPay.manualSubmit')}
              </Button>
              {s2 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('grinPay.manualResponseHelp')}</p>
                  <Textarea readOnly value={s2} rows={4} className="font-mono text-xs" dir="ltr" />
                  <CopyValue value={s2} label={t('grinPay.copySlatepack')} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Direct GoblinPay endpub (campaign's own receiving identity) ─────

function EndpubPane({ campaign }: { campaign: ParsedCampaign }) {
  const { t } = useTranslation();
  const endpub = campaign.goblinPayEndpub!;
  return (
    <div className="space-y-4">
      <PayQR value={endpub} />
      <CopyValue value={endpub} label={t('grinPay.copyNprofile')} />
      <p className="text-xs text-muted-foreground">{t('grinPay.endpubHelp')}</p>
    </div>
  );
}

// ─── Native grin1 address + proof registration ───────────────────────

function GrinAddressPane({ campaign, dialogOpen }: { campaign: ParsedCampaign; dialogOpen: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { grinNodeUrl } = useGrinPayConfig();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const address = campaign.grinAddress!;
  const [proofText, setProofText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState(false);

  // Reset transient proof state each time the dialog opens fresh.
  const wasOpen = useRef(dialogOpen);
  useEffect(() => {
    if (dialogOpen && !wasOpen.current) {
      setProofText('');
      setPublished(false);
    }
    wasOpen.current = dialogOpen;
  }, [dialogOpen]);

  /**
   * Verify the pasted proof locally (parse → receiver signature → bound to
   * this campaign's address → kernel on-chain), then publish it as a
   * kind-3414 event for the tally.
   */
  const onSubmitProof = async () => {
    setSubmitting(true);
    try {
      let json: unknown;
      try {
        json = JSON.parse(proofText.trim());
      } catch {
        toast({ title: t('grinPay.proofInvalid'), description: t('grinPay.proofNotJson'), variant: 'destructive' });
        return;
      }
      const proof = parseReceiverProof(json);
      if (!proof || !verifyReceiverProof(proof)) {
        toast({ title: t('grinPay.proofInvalid'), description: t('grinPay.proofBadSignature'), variant: 'destructive' });
        return;
      }
      const campaignKey = decodeSlatepackAddress(address);
      if (!campaignKey || bytesToHex(proof.recipientAddress) !== bytesToHex(campaignKey)) {
        toast({ title: t('grinPay.proofInvalid'), description: t('grinPay.proofNotForCampaign'), variant: 'destructive' });
        return;
      }
      const kernel = await kernelOnChain(grinNodeUrl, bytesToHex(proof.kernelExcess));
      if (!kernel.onChain) {
        toast({ title: t('grinPay.proofInvalid'), description: t('grinPay.proofKernelMissing'), variant: 'destructive' });
        return;
      }
      await publishEvent({
        kind: GRIN_DONATION_KIND,
        content: proofText.trim(),
        tags: [
          ['a', campaign.aTag],
          ['p', campaign.pubkey],
          ['alt', `Grin payment proof for campaign "${campaign.title}"`],
        ],
      });
      setPublished(true);
      void queryClient.invalidateQueries({ queryKey: ['campaign-grin-total', campaign.aTag] });
      toast({ title: t('grinPay.proofPublished'), description: t('grinPay.donationRecorded') });
    } catch (err) {
      toast({
        title: t('grinPay.errorPublish'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PayQR value={address} />
      <CopyValue value={address} label={t('grinPay.copyAddress')} />
      <p className="text-xs text-muted-foreground">{t('grinPay.grinAddressHelp')}</p>

      <div className="border-t border-border pt-3 space-y-3">
        <p className="text-sm font-medium">{t('grinPay.proofTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('grinPay.proofHelp')}</p>
        {user ? (
          published ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-primary">
              <Check className="size-4" />
              {t('grinPay.proofPublished')}
            </p>
          ) : (
            <>
              <Textarea
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                placeholder={t('grinPay.proofPlaceholder')}
                rows={4}
                className="font-mono text-xs"
                dir="ltr"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!proofText.trim() || submitting}
                onClick={onSubmitProof}
              >
                {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                {t('grinPay.proofSubmit')}
              </Button>
            </>
          )
        ) : (
          <p className="text-xs text-muted-foreground">{t('grinPay.proofLoginRequired')}</p>
        )}
      </div>
    </div>
  );
}

// ─── The dialog ──────────────────────────────────────────────────────

export function GrinPayDialog({ campaign, open, onOpenChange }: GrinPayDialogProps) {
  const { t } = useTranslation();
  const { goblinPayUrl, goblinPayApiToken } = useGrinPayConfig();

  const paths = useMemo(
    () => grinDonationPaths(campaign, goblinPayUrl, goblinPayApiToken),
    [campaign, goblinPayUrl, goblinPayApiToken],
  );
  const hasGoblinPay = paths.invoice || paths.endpub;
  const hasAddress = paths.address;

  const goblinPayPane = paths.invoice
    ? <GoblinPayFlow campaign={campaign} dialogOpen={open} />
    : <EndpubPane campaign={campaign} />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t('grinPay.title', { title: campaign.title })}</DialogTitle>
          <DialogDescription>{t('grinPay.subtitle')}</DialogDescription>
        </DialogHeader>

        {hasGoblinPay && hasAddress ? (
          <Tabs defaultValue="goblinpay">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="goblinpay">{t('grinPay.goblinPayTab')}</TabsTrigger>
              <TabsTrigger value="address">{t('grinPay.grinAddressTab')}</TabsTrigger>
            </TabsList>
            <TabsContent value="goblinpay" className="pt-2">{goblinPayPane}</TabsContent>
            <TabsContent value="address" className="pt-2">
              <GrinAddressPane campaign={campaign} dialogOpen={open} />
            </TabsContent>
          </Tabs>
        ) : hasGoblinPay ? (
          goblinPayPane
        ) : hasAddress ? (
          <GrinAddressPane campaign={campaign} dialogOpen={open} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('grinPay.notConfigured')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
