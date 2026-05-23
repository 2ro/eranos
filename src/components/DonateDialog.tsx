import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  HandHeart,
  Heart,
  Loader2,
  LogIn,
  Sparkle,
  Sparkles,
  Star,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { Button } from '@/components/ui/button';
import { CampaignWalletDonatePanel } from '@/components/CampaignWalletDonatePanel';
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
import AuthDialog from '@/components/auth/AuthDialog';
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
  type ParsedCampaign,
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
  const cleaned = input.replace(/[, $]/g, '').trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function feeRateForSpeed(rates: FeeRates, speed: DonationFeeSpeed): number {
  return {
    fastest: rates.fastestFee,
    halfHour: rates.halfHourFee,
    hour: rates.hourFee,
    economy: rates.economyFee,
  }[speed];
}

function estimateDonationFee({
  feeRate,
  utxoCount,
}: {
  feeRate: number;
  utxoCount: number;
}): number {
  // Single recipient + change output.
  return estimateFee(utxoCount, 2, feeRate);
}

interface DonateDialogProps {
  campaign: ParsedCampaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Spot price of BTC in USD, used for inline USD previews. Optional. */
  btcPrice?: number;
}

type Step = 'form' | 'confirm' | 'success';

/**
 * Donate dialog for **on-chain** (`bc1q…` / `bc1p…`) campaigns. The
 * campaign's `w` wallet endpoint is the single output destination —
 * there are no recipient splits, no per-recipient previews, and no
 * dust math beyond the one-output PSBT.
 *
 * Silent-payment campaigns (`sp1…`) never open this dialog; their
 * detail-page donate column points directly at the SP code via the
 * `CampaignWalletDonatePanel` so donors can scan/copy and pay from a
 * BIP-352-aware external wallet.
 */
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

  const effectiveUsd = customUsd.trim()
    ? parseUsdInput(customUsd)
    : amountUsd;
  const effectiveAmount = usdToSats(effectiveUsd, btcPrice);

  const belowDust = Number.isFinite(effectiveAmount) && effectiveAmount > 0 && effectiveAmount < BITCOIN_DUST_LIMIT;

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
  if (open && !user) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <LoggedOutChooserView
            campaign={campaign}
            onClose={handleClose}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Logged-in but the signer can't build a PSBT (e.g. NIP-07 extension
  // without signPsbt). Direct the donor at the external-wallet panel on
  // the page — the in-app flow simply isn't possible without a PSBT
  // signer.
  if (open && !canSignPsbt) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <SignerUnsupportedView campaign={campaign} onClose={handleClose} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {step === 'form' && (
          <FormView
            campaign={campaign}
            amountUsd={amountUsd}
            customUsd={customUsd}
            comment={comment}
            feeSpeed={feeSpeed}
            effectiveAmount={effectiveAmount}
            effectiveUsd={effectiveUsd}
            belowDust={belowDust}
            btcPrice={btcPrice}
            isPending={donateMutation.isPending}
            onAmountChange={(usd) => {
              setAmountUsd(usd);
              setCustomUsd('');
            }}
            onCustomChange={setCustomUsd}
            onCommentChange={setComment}
            onFeeSpeedChange={setFeeSpeed}
            onContinue={() => setStep('confirm')}
            onClose={handleClose}
          />
        )}

        {step === 'confirm' && (
          <ConfirmView
            campaign={campaign}
            amountSats={effectiveAmount}
            effectiveUsd={effectiveUsd}
            comment={comment}
            feeSpeed={feeSpeed}
            btcPrice={btcPrice}
            isPending={donateMutation.isPending}
            onBack={() => setStep('form')}
            onSubmit={() => donateMutation.mutate()}
          />
        )}

        {step === 'success' && result && (
          <SuccessView
            campaign={campaign}
            result={result}
            btcPrice={btcPrice}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Form step
// ─────────────────────────────────────────────────────────────────────

interface FormViewProps {
  campaign: ParsedCampaign;
  amountUsd: number;
  customUsd: string;
  comment: string;
  feeSpeed: DonationFeeSpeed;
  effectiveAmount: number;
  effectiveUsd: number;
  belowDust: boolean;
  btcPrice: number | undefined;
  isPending: boolean;
  onAmountChange: (usd: number) => void;
  onCustomChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onFeeSpeedChange: (speed: DonationFeeSpeed) => void;
  onContinue: () => void;
  onClose: () => void;
}

function FormView({
  campaign,
  amountUsd,
  customUsd,
  comment,
  feeSpeed,
  effectiveAmount,
  effectiveUsd,
  belowDust,
  btcPrice,
  isPending,
  onAmountChange,
  onCustomChange,
  onCommentChange,
  onFeeSpeedChange,
  onContinue,
}: FormViewProps) {
  const usingCustom = customUsd.trim().length > 0;
  const canContinue = effectiveAmount > 0 && !belowDust;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Donate to {campaign.title}</DialogTitle>
        <DialogDescription>
          Send Bitcoin to the campaign's wallet from your in-app balance.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-2">
        {/* Preset amounts */}
        <div>
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Amount
          </Label>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {PRESET_AMOUNTS.map(({ amountUsd: usd, icon: Icon, label }) => {
              const selected = !usingCustom && amountUsd === usd;
              return (
                <button
                  key={usd}
                  type="button"
                  onClick={() => onAmountChange(usd)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-semibold motion-safe:transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-muted/60',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom amount */}
        <div className="space-y-1.5">
          <Label htmlFor="donate-custom" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Or custom (USD)
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="donate-custom"
              type="text"
              inputMode="decimal"
              placeholder="50"
              value={customUsd}
              onChange={(e) => onCustomChange(e.target.value)}
              className="pl-7"
            />
          </div>
          {effectiveAmount > 0 && (
            <div className="text-xs text-muted-foreground">
              ≈ {formatSats(effectiveAmount)} sats
              {btcPrice && effectiveUsd > 0 && (
                <> · ${effectiveUsd.toLocaleString()} at current price</>
              )}
            </div>
          )}
        </div>

        {/* Comment */}
        <div className="space-y-1.5">
          <Label htmlFor="donate-comment" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Public comment (optional)
          </Label>
          <Textarea
            id="donate-comment"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Stay strong."
            rows={2}
            maxLength={280}
          />
        </div>

        {/* Fee speed */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Confirmation speed
          </Label>
          <Select value={feeSpeed} onValueChange={(v) => onFeeSpeedChange(v as DonationFeeSpeed)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fastest">Fastest (~10 min)</SelectItem>
              <SelectItem value="halfHour">Half hour</SelectItem>
              <SelectItem value="hour">Hour</SelectItem>
              <SelectItem value="economy">Economy (cheapest)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {belowDust && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Amount is below the Bitcoin dust limit ({BITCOIN_DUST_LIMIT.toLocaleString()} sats).
              Choose a larger amount.
            </AlertDescription>
          </Alert>
        )}

        <BitcoinPublicDisclaimer tone="soft" />
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={onContinue}
        disabled={!canContinue || isPending}
      >
        Review donation
        <ArrowUpRight className="size-4 ml-1.5" />
      </Button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Confirm step
// ─────────────────────────────────────────────────────────────────────

interface ConfirmViewProps {
  campaign: ParsedCampaign;
  amountSats: number;
  effectiveUsd: number;
  comment: string;
  feeSpeed: DonationFeeSpeed;
  btcPrice: number | undefined;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

function ConfirmView({
  campaign,
  amountSats,
  effectiveUsd,
  comment,
  feeSpeed,
  btcPrice,
  isPending,
  onBack,
  onSubmit,
}: ConfirmViewProps) {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { esploraApis } = config;

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : null;

  // Pre-fetch UTXOs + fee rates so the confirm screen can show an
  // accurate fee estimate before the donor commits.
  const utxosQuery = useQuery({
    queryKey: ['bitcoin-utxos', senderAddress, esploraApis],
    queryFn: ({ signal }) => fetchUTXOs(senderAddress!, esploraApis, signal),
    enabled: !!senderAddress,
    staleTime: 30_000,
  });
  const feeRatesQuery = useQuery({
    queryKey: ['bitcoin-fee-rates', esploraApis],
    queryFn: ({ signal }) => getFeeRates(esploraApis, signal),
    staleTime: 30_000,
  });

  const feeEstimate = useMemo(() => {
    const utxos = utxosQuery.data;
    const rates = feeRatesQuery.data;
    if (!utxos || !rates) return null;
    return estimateDonationFee({
      feeRate: feeRateForSpeed(rates, feeSpeed),
      utxoCount: utxos.length,
    });
  }, [utxosQuery.data, feeRatesQuery.data, feeSpeed]);

  return (
    <>
      <DialogHeader>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground motion-safe:transition-colors -ml-1"
          disabled={isPending}
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <DialogTitle>Confirm donation</DialogTitle>
        <DialogDescription>
          Review the details before signing the transaction.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <Row label="Campaign" value={campaign.title} />
        <Row
          label="Amount"
          value={
            <span>
              <span className="font-semibold">{formatSats(amountSats)} sats</span>
              {btcPrice && effectiveUsd > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">≈ ${effectiveUsd.toLocaleString()}</span>
              )}
            </span>
          }
        />
        <Row
          label="To wallet"
          value={
            <span className="font-mono text-xs break-all">{campaign.wallet.value}</span>
          }
        />
        <Row
          label="Network fee"
          value={
            feeEstimate === null ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <span>
                <span className="font-semibold">{formatSats(feeEstimate)} sats</span>
                {btcPrice && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ≈ ${satsToUSD(feeEstimate, btcPrice)}
                  </span>
                )}
              </span>
            )
          }
        />
        {comment.trim() && (
          <Row label="Comment" value={<span className="italic">"{comment}"</span>} />
        )}
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={onSubmit}
        disabled={isPending || feeEstimate === null}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Sending donation…
          </>
        ) : (
          <>
            <HandHeart className="size-5 mr-2" />
            Send donation
          </>
        )}
      </Button>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right min-w-0">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Success step
// ─────────────────────────────────────────────────────────────────────

function SuccessView({
  campaign,
  result,
  btcPrice,
  onClose,
}: {
  campaign: ParsedCampaign;
  result: DonateCampaignResult;
  btcPrice: number | undefined;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <div className="mx-auto rounded-full bg-primary/15 p-3 mb-2">
          <Check className="size-8 text-primary" />
        </div>
        <DialogTitle className="text-center">Thank you!</DialogTitle>
        <DialogDescription className="text-center">
          Your donation to <span className="font-semibold text-foreground">{campaign.title}</span> is on its way.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        <Row
          label="Amount"
          value={
            <span className="font-semibold">
              {formatSats(result.totalSats)} sats
              {btcPrice && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ≈ ${satsToUSD(result.totalSats, btcPrice)}
                </span>
              )}
            </span>
          }
        />
        <Row
          label="Network fee"
          value={<span>{formatSats(result.fee)} sats</span>}
        />
        <Row
          label="Transaction"
          value={
            <a
              href={`https://mempool.space/tx/${result.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline break-all"
            >
              {result.txid.slice(0, 16)}…
            </a>
          }
        />
      </div>

      <Button size="lg" className="w-full" onClick={onClose}>
        Done
      </Button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Logged-out chooser
// ─────────────────────────────────────────────────────────────────────

function LoggedOutChooserView({
  campaign,
  onClose,
}: {
  campaign: ParsedCampaign;
  onClose: () => void;
}) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Donate to {campaign.title}</DialogTitle>
        <DialogDescription>
          Log in to donate from your in-app wallet, or scan the QR on the
          campaign page to pay from any external Bitcoin wallet.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        <Button
          size="lg"
          className="w-full"
          onClick={() => setAuthOpen(true)}
        >
          <LogIn className="size-4 mr-2" />
          Log in to donate
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={onClose}
        >
          Pay from external wallet instead
        </Button>
      </div>

      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Signer-unsupported fallback
// ─────────────────────────────────────────────────────────────────────

function SignerUnsupportedView({
  campaign,
  onClose,
}: {
  campaign: ParsedCampaign;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Donate to {campaign.title}</DialogTitle>
        <DialogDescription>
          Scan the QR code with your phone's Bitcoin wallet, or tap "Open in
          wallet" to send your donation. You choose the amount in your wallet.
        </DialogDescription>
      </DialogHeader>

      <CampaignWalletDonatePanel wallet={campaign.wallet} />

      <Button variant="outline" size="lg" className="w-full" onClick={onClose}>
        Close
      </Button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Loading skeleton (for callers that need a placeholder button)
// ─────────────────────────────────────────────────────────────────────

export function DonateButtonSkeleton() {
  return <Skeleton className="h-11 w-full rounded-md" />;
}
