import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import LoginDialog from '@/components/auth/LoginDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDonateCampaign, type DonateCampaignResult, type DonationFeeSpeed } from '@/hooks/useDonateCampaign';
import { useToast } from '@/hooks/useToast';
import {
  BITCOIN_DUST_LIMIT,
  estimateFee,
  fetchUTXOs,
  formatSats,
  getFeeRates,
  nostrPubkeyToBitcoinAddress,
  satsToUSD,
  usdToSats,
  type FeeRates,
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

function feeRateForSpeed(rates: FeeRates, speed: DonationFeeSpeed): number {
  return {
    fastest: rates.fastestFee,
    halfHour: rates.halfHourFee,
    hour: rates.hourFee,
    economy: rates.economyFee,
  }[speed];
}

function estimateDonationFee({
  inputCount,
  outputCount,
  totalBalance,
  amountSats,
  feeRate,
}: {
  inputCount: number;
  outputCount: number;
  totalBalance: number;
  amountSats: number;
  feeRate: number;
}): number {
  const feeWithChange = estimateFee(inputCount, outputCount + 1, feeRate);
  const changeWithChange = totalBalance - amountSats - feeWithChange;
  const hasChange = changeWithChange >= BITCOIN_DUST_LIMIT;
  return estimateFee(inputCount, outputCount + (hasChange ? 1 : 0), feeRate);
}

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
  const [feeSpeed, setFeeSpeed] = useState<DonationFeeSpeed>('fastest');
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
      if (!r.receiptPublished) {
        toast({
          title: 'Donation sent, but the receipt failed',
          description: `On-chain tx ${r.txid.slice(0, 12)}… broadcast; the kind 8333 receipt didn't publish${r.receiptPublishError ? ` (${r.receiptPublishError})` : ''}.`,
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
  // The ideal path is always to log in and donate through the campaign, so the
  // donation publishes a kind 8333 receipt and counts toward the goal. As a
  // secondary path, single-recipient campaigns can be paid externally from any
  // Bitcoin wallet — the funds reach the recipient but no Nostr receipt is
  // published, so the donation won't appear in Agora's totals. Multi-recipient
  // campaigns only support the log-in path (the split needs the donor's
  // signature on a single PSBT with N outputs).
  if (open && !user) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <LoggedOutChooserView
            campaign={campaign}
            btcPrice={btcPrice}
            onClose={handleClose}
          />
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
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';
  const hasPrice = !!btcPrice && Number.isFinite(btcPrice) && btcPrice > 0;
  const validAmount = hasPrice && Number.isFinite(effectiveUsd) && effectiveUsd > 0 && effectiveAmount > 0;
  const canContinue = validAmount && !belowMin && !tooSmallSplit;

  const { data: utxos } = useQuery({
    queryKey: ['bitcoin-utxos', esploraBaseUrl, senderAddress],
    queryFn: () => fetchUTXOs(senderAddress, esploraBaseUrl),
    enabled: !!senderAddress && validAmount,
    staleTime: 30_000,
  });

  const { data: feeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates', esploraBaseUrl],
    queryFn: () => getFeeRates(esploraBaseUrl),
    enabled: validAmount,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((sum, utxo) => sum + utxo.value, 0) ?? 0, [utxos]);
  const feeEstimates = useMemo(() => {
    if (!utxos?.length || !feeRates || !validAmount) return {};

    let outputCount = recipientCount;
    try {
      outputCount = splitDonation(campaign.recipients, effectiveAmount, user?.pubkey).length;
    } catch {
      return {};
    }

    return (Object.keys(FEE_SPEED_LABELS) as DonationFeeSpeed[]).reduce<Partial<Record<DonationFeeSpeed, number>>>((acc, speed) => {
      acc[speed] = estimateDonationFee({
        inputCount: utxos.length,
        outputCount,
        totalBalance,
        amountSats: effectiveAmount,
        feeRate: feeRateForSpeed(feeRates, speed),
      });
      return acc;
    }, {});
  }, [utxos, feeRates, validAmount, recipientCount, campaign.recipients, effectiveAmount, user?.pubkey, totalBalance]);

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
          <Label>Arrival</Label>
          <Select value={feeSpeed} onValueChange={(v) => onFeeSpeedChange(v as DonationFeeSpeed)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FEE_SPEED_LABELS) as DonationFeeSpeed[]).map((speed) => (
                <SelectItem key={speed} value={speed}>
                  {FEE_SPEED_LABELS[speed]}
                  {btcPrice && feeEstimates[speed] !== undefined
                    ? ` · ${satsToUSD(feeEstimates[speed], btcPrice)} fee`
                    : ''}
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

function BeneficiarySplitRow({ pubkey, amountSats }: { pubkey: string; amountSats: number }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);

  return (
    <tr className="border-b last:border-0 border-border/60">
      <td className="px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground truncate">{name}</span>
          <span className="font-mono text-muted-foreground">
            {pubkey.slice(0, 8)}…{pubkey.slice(-4)}
          </span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-right font-medium">
        {amountSats.toLocaleString()} sats
      </td>
    </tr>
  );
}

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
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';
  const splits = useMemo(() => {
    try {
      return splitDonation(campaign.recipients, amountSats, user?.pubkey);
    } catch {
      return [];
    }
  }, [campaign.recipients, amountSats, user?.pubkey]);

  const { data: utxos, isLoading: utxosLoading, isError: utxosError } = useQuery({
    queryKey: ['bitcoin-utxos', esploraBaseUrl, senderAddress],
    queryFn: () => fetchUTXOs(senderAddress, esploraBaseUrl),
    enabled: !!senderAddress && amountSats > 0,
    staleTime: 30_000,
  });

  const { data: feeRates, isLoading: feeRatesLoading, isError: feeRatesError } = useQuery({
    queryKey: ['bitcoin-fee-rates', esploraBaseUrl],
    queryFn: () => getFeeRates(esploraBaseUrl),
    enabled: amountSats > 0,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((sum, utxo) => sum + utxo.value, 0) ?? 0, [utxos]);
  const estimatedFee = useMemo(() => {
    if (!utxos?.length || !feeRates || splits.length === 0) return undefined;

    return estimateDonationFee({
      inputCount: utxos.length,
      outputCount: splits.length,
      totalBalance,
      amountSats,
      feeRate: feeRateForSpeed(feeRates, feeSpeed),
    });
  }, [utxos, feeRates, splits.length, feeSpeed, totalBalance, amountSats]);
  const feeLoading = utxosLoading || feeRatesLoading;
  const feeError = utxosError || feeRatesError;
  const noSpendableFunds = !!utxos && utxos.length === 0;
  const insufficientFunds = estimatedFee !== undefined && totalBalance < amountSats + estimatedFee;
  const canConfirm = !isPending && estimatedFee !== undefined && !feeError && !noSpendableFunds && !insufficientFunds;
  const formatReviewAmount = (sats: number) => (
    btcPrice ? (
      <>
        {satsToUSD(sats, btcPrice)}
        <span className="ml-2 text-xs text-muted-foreground">({formatSats(sats)} sats)</span>
      </>
    ) : `${formatSats(sats)} sats`
  );

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
              {formatReviewAmount(amountSats)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Network fee</span>
            <span className="font-medium">
              {estimatedFee !== undefined
                ? formatReviewAmount(estimatedFee)
                : feeLoading
                  ? 'Calculating…'
                  : noSpendableFunds
                    ? 'No spendable funds'
                    : 'Unavailable'}
            </span>
          </div>
          {estimatedFee !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">
                {formatReviewAmount(amountSats + estimatedFee)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Arrival</span>
            <span className="font-medium">{FEE_SPEED_LABELS[feeSpeed]}</span>
          </div>
        </div>

        {feeError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              Could not estimate the network fee. Check your connection and try again.
            </AlertDescription>
          </Alert>
        )}

        {noSpendableFunds && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              Your Bitcoin wallet has no spendable funds.
            </AlertDescription>
          </Alert>
        )}

        {insufficientFunds && estimatedFee !== undefined && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              Insufficient funds. This donation needs {(amountSats + estimatedFee).toLocaleString()} sats including the network fee.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-border max-h-40 overflow-auto">
          <table className="w-full text-xs">
            <tbody>
              {splits.map((s) => (
                <BeneficiarySplitRow key={s.pubkey} pubkey={s.pubkey} amountSats={s.amountSats} />
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
          The fee is locked into the transaction when you sign. Confirmation time can still vary with mempool conditions.
        </p>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isPending} className="flex-1">
            <ChevronLeft className="size-4 mr-1" />
            Back
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm} className="flex-1">
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
  const txPath = `/i/bitcoin:tx:${result.txid}`;
  const formatSuccessAmount = (sats: number) => (
    btcPrice ? (
      <>
        {satsToUSD(sats, btcPrice)}
        <span className="ml-2 text-xs text-muted-foreground">({formatSats(sats)} sats)</span>
      </>
    ) : `${formatSats(sats)} sats`
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <Check className="size-5" />
          Donation Sent
        </DialogTitle>
        <DialogDescription>
          Thanks for supporting <span className="font-medium">{campaign.title}</span>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1.5 dark:border-green-800 dark:bg-green-950/40">
          <Label className="text-xs text-green-800 dark:text-green-200">Transaction ID</Label>
          <Link
            to={txPath}
            onClick={onClose}
            className="block break-all font-mono text-xs leading-relaxed text-green-950 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 dark:text-green-50 dark:focus-visible:ring-green-300"
          >
            {result.txid}
          </Link>
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
            <span className="font-medium">{formatSuccessAmount(result.fee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipients paid</span>
            <span className="font-medium">{result.recipientCount}</span>
          </div>
        </div>

        {!result.receiptPublished && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              The Bitcoin tx is final, but the kind 8333 receipt didn't publish. Your donation still
              counts.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link to={txPath} onClick={onClose}>
              View Transaction
            </Link>
          </Button>
          <Button className="flex-1 bg-green-700 text-white hover:bg-green-800 dark:bg-green-300 dark:text-green-950 dark:hover:bg-green-200" onClick={onClose}>
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

// ─── Logged-out chooser view ────────────────────────────────────────────────

/**
 * Shown when a logged-out user clicks Donate. Frames the choice clearly:
 *
 * 1. **Recommended**: log in and donate through Agora so the donation
 *    publishes a kind 8333 receipt and counts toward the campaign goal.
 * 2. **Secondary** (single-recipient campaigns only): pay the recipient
 *    directly with any Bitcoin wallet. Funds reach the recipient but the
 *    donation won't appear in Agora's totals or donor list.
 *
 * Multi-recipient campaigns hide the secondary option because the split
 * fundamentally requires a single PSBT signed by the donor.
 */
function LoggedOutChooserView({
  campaign,
  btcPrice,
  onClose,
}: {
  campaign: ParsedCampaign;
  btcPrice?: number;
  onClose: () => void;
}) {
  const [view, setView] = useState<'choose' | 'external'>('choose');
  const [loginOpen, setLoginOpen] = useState(false);

  const singleRecipient = campaign.recipients.length === 1;
  const firstRecipient = campaign.recipients[0];
  const recipientAuthor = useAuthor(firstRecipient.pubkey);
  const recipientName = singleRecipient
    ? recipientAuthor.data?.metadata?.display_name ||
      recipientAuthor.data?.metadata?.name ||
      genUserName(firstRecipient.pubkey)
    : '';

  if (view === 'external') {
    return (
      <ExternalPayView
        campaign={campaign}
        btcPrice={btcPrice}
        onBack={() => setView('choose')}
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HandHeart className="size-5 text-primary" />
          Log in to donate to this campaign
        </DialogTitle>
        <DialogDescription>
          Donations made through Agora publish a Nostr receipt that counts
          toward <span className="font-medium">{campaign.title}</span>'s goal and
          appears in the donor list.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        {/* Primary path — log in */}
        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          className="w-full text-left rounded-xl border-2 border-primary bg-primary/5 p-4 hover:bg-primary/10 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/15 p-2 shrink-0">
              <LogIn className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">Log in & donate</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                  Recommended
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Your donation counts toward the campaign goal and shows up in the donor list.
                {!singleRecipient &&
                  ` Required for this campaign because it splits across ${campaign.recipients.length} recipients.`}
              </p>
            </div>
            <ArrowUpRight className="size-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </button>

        {/* Secondary path — external pay, single recipient only */}
        {singleRecipient && (
          <button
            type="button"
            onClick={() => setView('external')}
            className="w-full text-left rounded-xl border border-border bg-background p-4 hover:bg-muted/50 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2 shrink-0">
                <Wallet className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  Donate to {recipientName} directly
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pay {recipientName} from any Bitcoin wallet. It{' '}
                  <span className="font-medium text-foreground">won't count</span> toward the
                  campaign goal, but {recipientName} will still receive it.
                </p>
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </button>
        )}

        {!singleRecipient && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">
              This campaign splits each donation across {campaign.recipients.length} recipients in
              one transaction, which requires your signature. Direct payments aren't available for
              multi-recipient campaigns.
            </AlertDescription>
          </Alert>
        )}

        <Button variant="ghost" onClick={onClose} className="w-full">
          Cancel
        </Button>
      </div>

      <LoginDialog
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={() => {
          // The outer DonateDialog re-renders once `user` becomes truthy and
          // automatically swaps to the FormView for the now-logged-in donor.
          setLoginOpen(false);
        }}
      />
    </>
  );
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
  onBack,
  onClose,
}: {
  campaign: ParsedCampaign;
  btcPrice?: number;
  /** When provided, renders a back affordance returning to the chooser. */
  onBack?: () => void;
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
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start -ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground motion-safe:transition-colors mb-1"
          >
            <ChevronLeft className="size-3.5" />
            Back
          </button>
        )}
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
