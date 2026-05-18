import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  HandHeart,
  Heart,
  Loader2,
  LogIn,
  Sparkle,
  Sparkles,
  Star,
  Wallet,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDonateCampaign, type DonateCampaignResult, type DonationFeeSpeed } from '@/hooks/useDonateCampaign';
import { useToast } from '@/hooks/useToast';
import {
  BITCOIN_DUST_LIMIT,
  formatSats,
  nostrPubkeyToBitcoinAddress,
  satsToUSD,
  usdToSats,
} from '@/lib/bitcoin';
import {
  minDonationForSplit,
  type ParsedCampaign,
  splitDonation,
} from '@/lib/campaign';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

/**
 * Donation presets in USD. The signed event and Bitcoin transaction still use
 * sats; USD is only the user-facing input currency.
 */
const PRESET_AMOUNTS: readonly { amountUsd: number; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { amountUsd: 10, icon: Sparkle, label: '$10' },
  { amountUsd: 25, icon: Sparkles, label: '$25' },
  { amountUsd: 100, icon: Star, label: '$100' },
  { amountUsd: 500, icon: Heart, label: '$500' },
  { amountUsd: 1_000, icon: HandHeart, label: '$1K' },
];

function parseUsdInput(input: string): number {
  return Number(input.replace(/[, $]/g, ''));
}

const FEE_SPEED_LABELS: Record<DonationFeeSpeed, string> = {
  fastest: 'Fastest (~10 min)',
  halfHour: 'Half hour',
  hour: 'One hour',
  economy: 'Economy (~1 day)',
};

interface DonateDialogProps {
  campaign: ParsedCampaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Spot price of BTC in USD, used for inline USD previews. Optional. */
  btcPrice?: number;
}

type Step = 'form' | 'confirm' | 'success';

export function DonateDialog({ campaign, open, onOpenChange, btcPrice }: DonateDialogProps) {
  const { user } = useCurrentUser();
  const { canSignPsbt } = useBitcoinSigner();
  const { donateToCampaign } = useDonateCampaign();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('form');
  const [amountUsd, setAmountUsd] = useState<number>(PRESET_AMOUNTS[1].amountUsd);
  const [customUsd, setCustomUsd] = useState('');
  const [comment, setComment] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<DonationFeeSpeed>('halfHour');
  const [result, setResult] = useState<DonateCampaignResult | null>(null);

  // Reset when the dialog reopens for a fresh donation.
  useEffect(() => {
    if (open) {
      setStep('form');
      setResult(null);
    }
  }, [open]);

  const minDonation = useMemo(() => {
    return minDonationForSplit(campaign.recipients, user?.pubkey, BITCOIN_DUST_LIMIT);
  }, [campaign.recipients, user?.pubkey]);

  const effectiveUsd = customUsd.trim()
    ? parseUsdInput(customUsd)
    : amountUsd;
  const effectiveAmount = usdToSats(effectiveUsd, btcPrice);

  const splitPreview = useMemo(() => {
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) return null;
    try {
      return splitDonation(campaign.recipients, effectiveAmount, user?.pubkey);
    } catch {
      return null;
    }
  }, [campaign.recipients, effectiveAmount, user?.pubkey]);

  const belowMin = Number.isFinite(effectiveAmount) && effectiveAmount < minDonation;
  const tooSmallSplit = splitPreview?.some((s) => s.amountSats < BITCOIN_DUST_LIMIT) ?? false;

  const donateMutation = useMutation({
    mutationFn: async () =>
      donateToCampaign({
        campaign,
        amountSats: effectiveAmount,
        comment,
        feeSpeed,
      }),
    onSuccess: (r) => {
      setResult(r);
      setStep('success');
      if (r.publishFailed.length > 0) {
        toast({
          title: 'Donation sent, but some receipts failed',
          description: `On-chain tx ${r.txid.slice(0, 12)}… broadcast; ${r.publishFailed.length} of ${r.publishFailed.length + r.publishedReceipts} kind 8333 receipts didn't publish.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Donation sent',
          description: `Thanks for supporting ${campaign.title}.`,
        });
      }
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Donation failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    if (donateMutation.isPending) return;
    onOpenChange(false);
  };

  // ── Logged-out flow ──
  //
  // Single-recipient campaigns can be paid by anyone with any Bitcoin wallet
  // (no Nostr login needed — the donor just sends BTC directly to the
  // recipient's Taproot address). Multi-recipient campaigns still require a
  // login because the split needs a signed PSBT with one output per recipient.
  if (open && !user) {
    if (campaign.recipients.length === 1) {
      return (
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <ExternalPayView
              campaign={campaign}
              btcPrice={btcPrice}
              onClose={handleClose}
            />
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="size-5 text-primary" />
              Log in to donate
            </DialogTitle>
            <DialogDescription>
              This campaign splits donations across {campaign.recipients.length} recipients in a
              single Bitcoin transaction. That requires your Nostr key to sign — log in with your
              nsec or a signer that supports{' '}
              <code className="font-mono text-xs">signPsbt</code> to continue.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (open && !canSignPsbt) {
    // Logged-in but the signer can't build a PSBT (e.g. NIP-07 extension
    // without signPsbt). Single-recipient campaigns can still be paid from
    // any external wallet; multi-recipient ones cannot.
    if (campaign.recipients.length === 1) {
      return (
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <ExternalPayView
              campaign={campaign}
              btcPrice={btcPrice}
              onClose={handleClose}
            />
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Donating not available
            </DialogTitle>
            <DialogDescription>
              Your current login can't sign Bitcoin transactions for the multi-recipient split. Log in with your secret key (nsec) or a signer that supports <code className="font-mono text-xs">signPsbt</code> to donate.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'success' && result ? (
          <SuccessView campaign={campaign} result={result} btcPrice={btcPrice} onClose={handleClose} />
        ) : step === 'confirm' ? (
          <ConfirmView
            campaign={campaign}
            amountSats={effectiveAmount}
            feeSpeed={feeSpeed}
            comment={comment}
            btcPrice={btcPrice}
            isPending={donateMutation.isPending}
            onBack={() => setStep('form')}
            onConfirm={() => donateMutation.mutate()}
          />
        ) : (
          <FormView
            campaign={campaign}
            presetAmountUsd={amountUsd}
            customUsd={customUsd}
            effectiveUsd={effectiveUsd}
            effectiveAmount={effectiveAmount}
            minDonation={minDonation}
            belowMin={belowMin}
            tooSmallSplit={tooSmallSplit}
            comment={comment}
            feeSpeed={feeSpeed}
            btcPrice={btcPrice}
            onPresetClick={(amt) => {
              setAmountUsd(amt);
              setCustomUsd('');
            }}
            onCustomChange={(v) => setCustomUsd(v)}
            onCommentChange={setComment}
            onFeeSpeedChange={setFeeSpeed}
            onNext={() => setStep('confirm')}
            onCancel={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Form view ───────────────────────────────────────────────────────────────

function FormView({
  campaign,
  presetAmountUsd,
  customUsd,
  effectiveUsd,
  effectiveAmount,
  minDonation,
  belowMin,
  tooSmallSplit,
  comment,
  feeSpeed,
  btcPrice,
  onPresetClick,
  onCustomChange,
  onCommentChange,
  onFeeSpeedChange,
  onNext,
  onCancel,
}: {
  campaign: ParsedCampaign;
  presetAmountUsd: number;
  customUsd: string;
  effectiveUsd: number;
  effectiveAmount: number;
  minDonation: number;
  belowMin: boolean;
  tooSmallSplit: boolean;
  comment: string;
  feeSpeed: DonationFeeSpeed;
  btcPrice?: number;
  onPresetClick: (amt: number) => void;
  onCustomChange: (v: string) => void;
  onCommentChange: (v: string) => void;
  onFeeSpeedChange: (v: DonationFeeSpeed) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const recipientCount = campaign.recipients.length;
  const hasPrice = !!btcPrice && Number.isFinite(btcPrice) && btcPrice > 0;
  const validAmount = hasPrice && Number.isFinite(effectiveUsd) && effectiveUsd > 0 && effectiveAmount > 0;
  const canContinue = validAmount && !belowMin && !tooSmallSplit;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HandHeart className="size-5 text-primary" />
          Donate to {campaign.title}
        </DialogTitle>
        <DialogDescription>
          Your donation is sent as one Bitcoin transaction split across {recipientCount}{' '}
          {recipientCount === 1 ? 'recipient' : 'recipients'}.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Preset grid */}
        <div className="space-y-2">
          <Label>Amount (USD)</Label>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_AMOUNTS.map(({ amountUsd: amount, icon: Icon, label }) => {
              const selected = !customUsd && amount === presetAmountUsd;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onPresetClick(amount)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={selected}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom override */}
        <div className="space-y-2">
          <Label htmlFor="donate-custom">Or enter a custom amount (USD)</Label>
          <Input
            id="donate-custom"
            type="text"
            inputMode="decimal"
            placeholder={btcPrice ? `Min ${satsToUSD(minDonation, btcPrice)}` : 'Enter USD amount'}
            value={customUsd}
            onChange={(e) => onCustomChange(e.target.value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {validAmount
                ? `${satsToUSD(effectiveAmount, btcPrice)} · ${formatSats(effectiveAmount)} sats`
                : btcPrice
                  ? `Minimum: ${satsToUSD(minDonation, btcPrice)} (${minDonation.toLocaleString()} sats)`
                  : 'Waiting for BTC/USD price'}
            </span>
            <span>
              {recipientCount > 1 && validAmount
                ? `≈ ${formatSats(Math.floor(effectiveAmount / recipientCount))} sats per recipient`
                : ''}
            </span>
          </div>
        </div>

        {/* Optional comment */}
        <div className="space-y-2">
          <Label htmlFor="donate-comment">Comment (optional)</Label>
          <Textarea
            id="donate-comment"
            placeholder="Say a few words…"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={2}
            maxLength={280}
          />
        </div>

        {/* Fee speed */}
        <div className="space-y-2">
          <Label>Transaction Speed</Label>
          <Select value={feeSpeed} onValueChange={(v) => onFeeSpeedChange(v as DonationFeeSpeed)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FEE_SPEED_LABELS) as DonationFeeSpeed[]).map((speed) => (
                <SelectItem key={speed} value={speed}>
                  {FEE_SPEED_LABELS[speed]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(belowMin || tooSmallSplit) && validAmount && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              That's too small to split across {recipientCount} recipients (each output must be at
              least {BITCOIN_DUST_LIMIT.toLocaleString()} sats). Minimum donation:{' '}
              {minDonation.toLocaleString()} sats.
            </AlertDescription>
          </Alert>
        )}

        {!hasPrice && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              Waiting for the BTC/USD price before converting your USD donation to sats.
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            Bitcoin transactions are public, irreversible, and can take time to confirm. Your
            on-chain wallet pays the network fee on top of your donation amount.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onNext} disabled={!canContinue} className="flex-1">
            <ArrowUpRight className="size-4 mr-1.5" />
            Review
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Confirm view ────────────────────────────────────────────────────────────

function ConfirmView({
  campaign,
  amountSats,
  feeSpeed,
  comment,
  btcPrice,
  isPending,
  onBack,
  onConfirm,
}: {
  campaign: ParsedCampaign;
  amountSats: number;
  feeSpeed: DonationFeeSpeed;
  comment: string;
  btcPrice?: number;
  isPending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { user } = useCurrentUser();
  const splits = useMemo(() => {
    try {
      return splitDonation(campaign.recipients, amountSats, user?.pubkey);
    } catch {
      return [];
    }
  }, [campaign.recipients, amountSats, user?.pubkey]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HandHeart className="size-5 text-primary" />
          Confirm Donation
        </DialogTitle>
        <DialogDescription>Review the split before broadcasting.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 space-y-1">
          <Label className="text-xs text-muted-foreground">Campaign</Label>
          <p className="font-medium truncate">{campaign.title}</p>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Donation amount</span>
            <span className="font-medium">
              {btcPrice ? satsToUSD(amountSats, btcPrice) : `${formatSats(amountSats)} sats`}
              {btcPrice && <span className="ml-2 text-xs text-muted-foreground">({formatSats(amountSats)} sats)</span>}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Recipients</span>
            <span className="font-medium">{splits.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Speed</span>
            <span className="font-medium">{FEE_SPEED_LABELS[feeSpeed]}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border max-h-40 overflow-auto">
          <table className="w-full text-xs">
            <tbody>
              {splits.map((s) => (
                <tr key={s.pubkey} className="border-b last:border-0 border-border/60">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">
                    {s.pubkey.slice(0, 8)}…{s.pubkey.slice(-4)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    {s.amountSats.toLocaleString()} sats
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {comment && (
          <div className="rounded-lg bg-muted/40 p-3">
            <Label className="text-xs text-muted-foreground">Your comment</Label>
            <p className="text-sm whitespace-pre-wrap break-words mt-1">{comment}</p>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          A network fee is added on top of your donation. The exact fee depends on current mempool
          conditions.
        </p>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isPending} className="flex-1">
            <ChevronLeft className="size-4 mr-1" />
            Back
          </Button>
          <Button onClick={onConfirm} disabled={isPending} className="flex-1">
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <HandHeart className="size-4 mr-1.5" />
                Donate {btcPrice ? satsToUSD(amountSats, btcPrice) : `${formatSats(amountSats)} sats`}
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Success view ────────────────────────────────────────────────────────────

function SuccessView({
  campaign,
  result,
  btcPrice,
  onClose,
}: {
  campaign: ParsedCampaign;
  result: DonateCampaignResult;
  btcPrice?: number;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <Check className="size-5" />
          Donation Sent
        </DialogTitle>
        <DialogDescription>
          Thanks for supporting <span className="font-medium">{campaign.title}</span>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 space-y-1">
          <Label className="text-xs text-green-700 dark:text-green-300">Transaction ID</Label>
          <p className="break-all font-mono text-xs text-green-900 dark:text-green-100">
            {result.txid}
          </p>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount sent</span>
            <span className="font-medium">
              {btcPrice ? satsToUSD(result.totalSats, btcPrice) : `${formatSats(result.totalSats)} sats`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Network fee</span>
            <span className="font-medium">{formatSats(result.fee)} sats</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipients paid</span>
            <span className="font-medium">{result.recipientCount}</span>
          </div>
        </div>

        {result.publishFailed.length > 0 && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              The Bitcoin tx is final, but {result.publishFailed.length} kind 8333 receipt
              {result.publishFailed.length === 1 ? '' : 's'} didn't publish. Your donation still
              counts.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link to={`/i/bitcoin:tx:${result.txid}`} onClick={onClose}>
              View Transaction
            </Link>
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}

/** Skeleton placeholder for the donate button while resolving auth. */
export function DonateButtonSkeleton() {
  return <Skeleton className="h-10 w-32" />;
}

// ─── External-pay view (logged-out, single recipient) ────────────────────────

/**
 * Renders address + QR + BIP-21 deep link for a single-recipient campaign so
 * donors can pay from any Bitcoin wallet without logging into Agora.
 *
 * Caveat surfaced to the donor: because no kind 8333 receipt is published,
 * the donation will not appear in Agora's donation totals or donor list. The
 * funds still reach the recipient on-chain; only the social-layer attestation
 * is missing.
 */
function ExternalPayView({
  campaign,
  btcPrice,
  onClose,
}: {
  campaign: ParsedCampaign;
  btcPrice?: number;
  onClose: () => void;
}) {
  const recipient = campaign.recipients[0];
  const author = useAuthor(recipient.pubkey);
  const { toast } = useToast();

  const [usd, setUsd] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  const address = useMemo(
    () => nostrPubkeyToBitcoinAddress(recipient.pubkey),
    [recipient.pubkey],
  );

  const metadata = author.data?.metadata;
  const recipientName =
    metadata?.display_name || metadata?.name || genUserName(recipient.pubkey);

  const parsedUsd = usd.trim() ? parseUsdInput(usd) : NaN;
  const hasPrice = !!btcPrice && Number.isFinite(btcPrice) && btcPrice > 0;
  const amountSats =
    Number.isFinite(parsedUsd) && parsedUsd > 0 && hasPrice
      ? usdToSats(parsedUsd, btcPrice)
      : 0;
  const amountBtc = amountSats > 0 ? amountSats / 100_000_000 : 0;

  // BIP-21 URI. `amount` is in BTC with up to 8 decimals, no trailing zeros.
  // We only include it when the donor entered a positive USD amount AND we
  // have a price to convert with — otherwise we omit it so the wallet can
  // prompt for any amount.
  const bip21 = useMemo(() => {
    if (!address) return '';
    if (amountBtc > 0) {
      // Trim trailing zeros after the decimal, but keep up to 8 places.
      const fixed = amountBtc.toFixed(8).replace(/\.?0+$/, '');
      return `bitcoin:${address}?amount=${fixed}`;
    }
    return `bitcoin:${address}`;
  }, [address, amountBtc]);

  const copy = async (value: string, marker: 'address' | 'uri') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (marker === 'address') {
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 1500);
      } else {
        setCopiedUri(true);
        setTimeout(() => setCopiedUri(false), 1500);
      }
      toast({ title: marker === 'address' ? 'Address copied' : 'Payment URI copied' });
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
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-orange-500" />
            Address unavailable
          </DialogTitle>
          <DialogDescription>
            We couldn't derive a Bitcoin address for this recipient. Try again later or contact the
            campaign creator.
          </DialogDescription>
        </DialogHeader>
        <Button onClick={onClose}>Close</Button>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          Pay with any Bitcoin wallet
        </DialogTitle>
        <DialogDescription>
          Scan the QR code or copy the address below to donate to{' '}
          <span className="font-medium">{recipientName}</span> from your existing wallet.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Optional amount input — informs the BIP-21 URI / QR */}
        <div className="space-y-2">
          <Label htmlFor="external-pay-amount">Amount (USD, optional)</Label>
          <Input
            id="external-pay-amount"
            type="text"
            inputMode="decimal"
            placeholder={hasPrice ? 'Leave blank to choose in your wallet' : 'Waiting for BTC price…'}
            value={usd}
            onChange={(e) => setUsd(e.target.value)}
            disabled={!hasPrice}
          />
          <p className="text-xs text-muted-foreground">
            {amountSats > 0
              ? `${formatSats(amountSats)} sats · embedded in the QR code below`
              : 'Without an amount, your wallet will prompt you to enter one when it scans the QR code.'}
          </p>
        </div>

        {/* QR code */}
        <div className="flex justify-center">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeCanvas value={bip21} size={200} level="M" />
          </div>
        </div>

        {/* Address (copyable) */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Bitcoin address
          </Label>
          <button
            type="button"
            onClick={() => copy(address, 'address')}
            className="w-full flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs break-all text-left hover:bg-muted/60 motion-safe:transition-colors"
          >
            <span className="break-all">{address}</span>
            {copiedAddress ? (
              <Check className="size-4 text-green-500 shrink-0" />
            ) : (
              <Copy className="size-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => copy(bip21, 'uri')}>
            {copiedUri ? (
              <Check className="size-4 mr-1.5 text-green-500" />
            ) : (
              <Copy className="size-4 mr-1.5" />
            )}
            Copy payment URI
          </Button>
          <Button asChild>
            {/* `bitcoin:` is a registered URI scheme. Most desktop / mobile
                wallets will intercept it; if none does, the click is a no-op
                from the user's perspective. */}
            <a href={bip21}>
              <ExternalLink className="size-4 mr-1.5" />
              Open in wallet
            </a>
          </Button>
        </div>

        {/* Heads-up: donation won't appear in Agora's totals */}
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            Payments made this way go straight to the recipient on Bitcoin but won't show up in
            this campaign's donor list or progress bar. To have your donation counted on Agora,{' '}
            <span className="font-medium">log in</span> and donate through the app.
          </AlertDescription>
        </Alert>

        <Button onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </>
  );
}
