import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  HandHeart,
  Heart,
  Loader2,
  Sparkle,
  Sparkles,
  Star,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDonateCampaign, type DonateCampaignResult, type DonationFeeSpeed } from '@/hooks/useDonateCampaign';
import { useToast } from '@/hooks/useToast';
import {
  BITCOIN_DUST_LIMIT,
  formatSats,
  satsToUSD,
  usdToSats,
} from '@/lib/bitcoin';
import {
  minDonationForSplit,
  type ParsedCampaign,
  splitDonation,
} from '@/lib/campaign';
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

  // ── Logged-out / unable-to-sign gate ──
  if (open && !user) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandHeart className="size-5 text-primary" />
              Log in to donate
            </DialogTitle>
            <DialogDescription>
              Donations are sent on-chain from your Nostr-derived Bitcoin wallet. Log in to continue.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (open && !canSignPsbt) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Donating not available
            </DialogTitle>
            <DialogDescription>
              Your current login can't sign Bitcoin transactions. Log in with your secret key (nsec) or a signer that supports <code className="font-mono text-xs">signPsbt</code> to donate.
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
