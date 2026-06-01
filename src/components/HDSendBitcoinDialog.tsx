import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { BitcoinAmountPicker } from '@/components/BitcoinAmountPicker';
import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import {
  BitcoinRecipientInput,
  type ResolvedRecipient,
} from '@/components/BitcoinRecipientInput';
import { BroadcastErrorAlert } from '@/components/BroadcastErrorAlert';
import { HelpTip } from '@/components/HelpTip';
import { cn } from '@/lib/utils';

import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { useHdWallet } from '@/hooks/useHdWallet';
import { notificationSuccess } from '@/lib/haptics';
import {
  getBitcoinFeeRate,
  getUniqueBitcoinFeeSpeeds,
  resolveBitcoinFeeRate,
  type BitcoinFeeSpeed,
} from '@/lib/bitcoinFeeSpeed';
import {
  classifyBroadcastError,
  type BroadcastErrorKind,
} from '@/lib/bitcoinBroadcastError';
import { formatSats, isLargeAmount, satsToUSD } from '@/lib/bitcoin';
import {
  broadcastBlockbookTx,
  fetchFeeRates,
} from '@/lib/hdwallet/blockbook';
import {
  buildHdSpendPsbt,
  buildHdMaxSpendPsbt,
  finalizeHdPsbt,
  type HdInput,
  type HdSpendableSpUtxo,
  type HdSpendableUtxo,
  previewHdMaxSpend,
  previewHdFee,
  signHdPsbt,
} from '@/lib/hdwallet/transaction';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USD_PRESETS = [5, 10, 25, 100];

type FeeSpeed = BitcoinFeeSpeed;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HDSendBitcoinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** BTC/USD price — passed in to avoid duplicate fetches. */
  btcPrice?: number;
  /**
   * Optional initial recipient string to prefill the recipient field. May
   * be a bare on-chain address (`bc1…`), a silent payment address
   * (`sp1…`), or a `bitcoin:` BIP-21 URI. When the URI carries both an
   * on-chain path and an `sp=` parameter, the picker's dropdown surfaces
   * both as separate rows so the donor explicitly picks which payment
   * path to use (no separate "swap" toggle needed — picking happens in
   * the dropdown).
   *
   * The prefill is re-applied on each open transition (false → true) so
   * reopening after a successful send loads the same destination again,
   * and is also re-applied when the user clears a previously-selected
   * chip so they don't have to retype.
   */
  initialRecipient?: string;
}

interface SendResult {
  txid: string;
  amountSats: number;
  fee: number;
  /**
   * Silent-payment UTXOs (`(txid, vout)`) consumed by the broadcast tx.
   * Pruned from local SP storage in `onSuccess` — otherwise the wallet
   * would keep treating them as spendable and the displayed balance would
   * jump *up* after the spend (because the BIP-86 change credits to
   * Blockbook's xpub balance while the SP entries remain locally).
   */
  consumedSpUtxos: Array<{ txid: string; vout: number }>;
}

/**
 * "Send Bitcoin" dialog for the HD wallet at `/wallet`.
 *
 * Provides a large editable USD amount, preset chips, fee speed picker, two-tap
 * arming for large amounts, and a privacy disclaimer for raw addresses. Uses
 * the HD wallet's UTXO set across many addresses, signs with per-input HD-derived
 * keys, and emits change to a fresh internal address.
 */
export function HDSendBitcoinDialog({ isOpen, onClose, btcPrice, initialRecipient }: HDSendBitcoinDialogProps) {
  const { t } = useTranslation();
  const availability = useHdWalletAccess();
  const {
    scan,
    silentPaymentBalance,
    silentPaymentStorage,
    refetch: refetchWallet,
    pruneSpentSilentPaymentUtxos,
  } = useHdWallet();
  const { config } = useAppContext();
  const { blockbookBaseUrl } = config;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isReady = availability.status === 'available';

  const feeSpeedLabels: Record<FeeSpeed, string> = useMemo(
    () => ({
      fastest: t('walletSend.feeSpeed.fastest'),
      halfHour: t('walletSend.feeSpeed.halfHour'),
      hour: t('walletSend.feeSpeed.hour'),
      economy: t('walletSend.feeSpeed.economy'),
      custom: t('walletSend.feeSpeed.custom'),
    }),
    [t],
  );

  // ── Form state ───────────────────────────────────────────────
  //
  // The picker owns its input text internally and emits a resolved
  // recipient (or null) to us. We only see the final picked destination.
  const [recipient, setRecipient] = useState<ResolvedRecipient | null>(null);
  const [usdAmount, setUsdAmount] = useState<number | string>(5);
  const [sendMax, setSendMax] = useState(false);
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('halfHour');
  /** Raw text for the custom sat/vB rate input (only used when feeSpeed === 'custom'). */
  const [customFeeRate, setCustomFeeRate] = useState('');
  const [error, setError] = useState('');
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);
  const [success, setSuccess] = useState<SendResult | null>(null);
  /**
   * Classified failure from the most recent broadcast attempt. Renders as an
   * inline {@link BroadcastErrorAlert} above the Send button with a recovery
   * action (typically "Use a higher fee"). Cleared automatically whenever
   * the user adjusts any field that could plausibly resolve the failure,
   * and on every successful submit.
   */
  const [broadcastError, setBroadcastError] = useState<BroadcastErrorKind | null>(null);

  const feeSpeedUserChanged = useRef(false);


  // ── Fee rates ────────────────────────────────────────────────
  const {
    data: feeRates,
    isLoading: feeRatesLoading,
    isError: feeRatesError,
    refetch: refetchFeeRates,
  } = useQuery({
    queryKey: ['blockbook-fee-rates', blockbookBaseUrl],
    queryFn: ({ signal }) => fetchFeeRates(blockbookBaseUrl, signal),
    enabled: isOpen && isReady,
    staleTime: 30_000,
  });

  const currentFeeRate = useMemo(
    () => resolveBitcoinFeeRate(feeSpeed, feeRates, customFeeRate),
    [feeSpeed, feeRates, customFeeRate],
  );

  // ── Owned UTXO set ───────────────────────────────────────────
  //
  // Combines BIP-86 UTXOs scanned from Blockbook with silent-payment UTXOs
  // discovered by the BIP-352 scanner and persisted via NIP-78. Both can
  // fund a send; the PSBT builder dispatches per-input.
  const bip86Utxos: HdSpendableUtxo[] = useMemo(() => scan?.utxos ?? [], [scan]);
  const spUtxos: HdSpendableSpUtxo[] = useMemo(
    () =>
      (silentPaymentStorage?.utxos ?? []).map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        tweakHex: u.tweak,
        k: u.k,
        height: u.height,
      })),
    [silentPaymentStorage],
  );
  const ownedInputs: HdInput[] = useMemo(
    () => [
      ...bip86Utxos.map<HdInput>((utxo) => ({ kind: 'bip86', utxo })),
      ...spUtxos.map<HdInput>((utxo) => ({ kind: 'sp', utxo })),
    ],
    [bip86Utxos, spUtxos],
  );
  const totalBalance = useMemo(
    () => bip86Utxos.reduce((s, u) => s + u.value, 0) + silentPaymentBalance,
    [bip86Utxos, silentPaymentBalance],
  );

  // ── USD → sats ───────────────────────────────────────────────
  const amountSats = useMemo(() => {
    if (!btcPrice) return 0;
    const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
    if (!Number.isFinite(usd) || usd <= 0) return 0;
    return Math.round((usd / btcPrice) * 100_000_000);
  }, [usdAmount, btcPrice]);

  const maxSpend = useMemo(
    () => (currentFeeRate ? previewHdMaxSpend(ownedInputs, currentFeeRate) : null),
    [ownedInputs, currentFeeRate],
  );

  // ── Fee estimate (matches the actual coin selection) ────────
  //
  // Crucially we do NOT use `ownedInputs.length` as the input count: an HD
  // wallet typically has many UTXOs across many addresses, but a real send
  // only consumes the minimal set the coin selector picks. Using the full
  // count would over-estimate fees by 10x or more on an active wallet, and
  // would also make the UI think we're insufficient when we're not.
  const estimatedFeeSats = useMemo(() => {
    if (!ownedInputs.length || !currentFeeRate || !amountSats) return 0;
    return previewHdFee(ownedInputs, amountSats, currentFeeRate);
  }, [ownedInputs, currentFeeRate, amountSats]);

  const effectiveAmountSats = sendMax ? (maxSpend?.amountSats ?? 0) : amountSats;
  const effectiveFeeSats = sendMax ? (maxSpend?.fee ?? 0) : estimatedFeeSats;
  const totalSats = effectiveAmountSats + effectiveFeeSats;
  // `previewHdFee` returns 0 when the coin selector can't cover `amount + fee`.
  // Treat that as insufficient so the UI doesn't claim a 0-sat fee is fine.
  const selectionFailed = sendMax
    ? !!currentFeeRate && ownedInputs.length > 0 && !maxSpend
    : amountSats > 0 && !!currentFeeRate && ownedInputs.length > 0 && estimatedFeeSats === 0;
  const insufficient = selectionFailed || (totalBalance > 0 && totalSats > totalBalance);

  // Auto-tune fee speed to keep fees < 40% of the send amount, unless the
  // user has manually overridden.
  useEffect(() => {
    if (feeSpeedUserChanged.current) return;
    if (sendMax) return;
    if (!ownedInputs.length || !feeRates || amountSats <= 0) return;

    const uniqueSpeeds = getUniqueBitcoinFeeSpeeds(feeRates);
    const threshold = amountSats * 0.4;

    let target: FeeSpeed = uniqueSpeeds[uniqueSpeeds.length - 1];
    for (const speed of uniqueSpeeds) {
      const rate = getBitcoinFeeRate(feeRates, speed);
      const fee = previewHdFee(ownedInputs, amountSats, rate);
      if (fee > 0 && fee <= threshold) { target = speed; break; }
    }
    setFeeSpeed((prev) => (prev === target ? prev : target));
  }, [amountSats, feeRates, ownedInputs, sendMax, totalBalance]);

  const handleFeeSpeedChange = useCallback((speed: FeeSpeed) => {
    feeSpeedUserChanged.current = true;
    setFeeSpeed(speed);
    // Keep the popover open for 'custom' so the user can type a rate; close
    // it for preset tiers since the choice is complete.
    if (speed !== 'custom') setFeePopoverOpen(false);
  }, []);

  // ── Two-tap arm + raw-address disclaimer ─────────────────────
  const isLarge = isLargeAmount(totalSats, btcPrice);
  // SP recipients (`sp1…`) produce a fresh, unlinkable Taproot output per
  // payment — they do NOT have the privacy concern of a reused on-chain
  // address. The public disclaimer is only needed for bare BTC addresses
  // picked from the dropdown (no SP).
  const isRawAddress = !!recipient && recipient.kind === 'address';
  const [confirmArmed, setConfirmArmed] = useState(false);

  useEffect(() => {
    setConfirmArmed(false);
  }, [effectiveAmountSats, currentFeeRate, btcPrice, recipient?.address]);

  // Track open transitions so we can re-key the picker on each
  // closed → open transition. Re-keying remounts the picker with a fresh
  // `initialInput`, restoring the prefilled recipient after a successful
  // send (which closes and reopens with the same prefill).
  const [openCount, setOpenCount] = useState(0);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setOpenCount((c) => c + 1);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const requiresArm = isLarge || isRawAddress;

  // ── Send mutation ────────────────────────────────────────────
  const [progress, setProgress] = useState<'idle' | 'building' | 'signing' | 'broadcasting'>('idle');

  const sendMutation = useMutation<SendResult, Error, void>({
    mutationFn: async () => {
      if (availability.status !== 'available') {
        throw new Error(t('walletSend.errors.unavailable'));
      }
      if (!recipient) throw new Error(t('walletSend.errors.enterRecipient'));
      if (!ownedInputs.length) throw new Error(t('walletSend.errors.noSpendable'));
      if (feeSpeed !== 'custom' && !feeRates) throw new Error(t('walletSend.errors.feesNotLoaded'));
      if (effectiveAmountSats <= 0) throw new Error(t('walletSend.errors.enterAmount'));
      if (insufficient) throw new Error(t('walletSend.errors.insufficient'));

      const rate = resolveBitcoinFeeRate(feeSpeed, feeRates, customFeeRate);
      if (!rate || rate < 1) throw new Error(t('walletSend.errors.feeRateTooLow'));
      const nextChangeIndex = scan?.change.firstUnusedIndex ?? 0;
      const resolvedRecipient = recipient.kind === 'sp'
        ? { kind: 'sp' as const, spAddress: recipient.address }
        : { kind: 'address' as const, address: recipient.address };

      setProgress('building');
      let psbtHex: string;
      let fee: number;
      let sentAmountSats = effectiveAmountSats;
      let inputDescriptors: Parameters<typeof signHdPsbt>[1];
      let consumedSpUtxos: Array<{ txid: string; vout: number }>;

      if (sendMax) {
        const built = buildHdMaxSpendPsbt({
          account: availability.account,
          inputs: ownedInputs,
          recipient: resolvedRecipient,
          feeRate: rate,
          seed: availability.seed,
        });
        psbtHex = built.psbtHex;
        fee = built.fee;
        sentAmountSats = built.amountSats;
        inputDescriptors = built.inputDescriptors;
        consumedSpUtxos = built.consumedSpUtxos;
      } else {
        const built = buildHdSpendPsbt({
          account: availability.account,
          inputs: ownedInputs,
          recipient: resolvedRecipient,
          amountSats: effectiveAmountSats,
          feeRate: rate,
          nextChangeIndex,
          seed: availability.seed,
        });
        psbtHex = built.psbtHex;
        fee = built.fee;
        inputDescriptors = built.inputDescriptors;
        consumedSpUtxos = built.consumedSpUtxos;
      }

      setProgress('signing');
      const signedHex = signHdPsbt(
        psbtHex,
        inputDescriptors,
        availability.account,
        availability.seed,
      );
      const txHex = finalizeHdPsbt(signedHex);

      setProgress('broadcasting');
      const txid = await broadcastBlockbookTx(blockbookBaseUrl, txHex);

      return { txid, amountSats: sentAmountSats, fee, consumedSpUtxos };
    },
    onSuccess: (result) => {
      notificationSuccess();
      setSuccess(result);
      // Remove the SP UTXOs we just spent from local storage and
      // republish the NIP-78 doc. Blockbook's xpub scan can't see SP
      // outputs, so without this the spent UTXOs would linger forever:
      // the balance would still count them, the coin selector would try
      // to spend them again (resulting in "missing/spent input" broadcast
      // errors), and the wallet would appear to *gain* money on each SP
      // spend (BIP-86 change is observed by Blockbook, but the consumed
      // SP value is not subtracted locally).
      if (result.consumedSpUtxos.length > 0) {
        pruneSpentSilentPaymentUtxos(result.consumedSpUtxos);
      }
      // Refresh after pruning so transaction history can classify mixed
      // BIP-86 + SP sends with the spent SP outpoints already archived.
      queryClient.invalidateQueries({ queryKey: ['hdwallet-scan'] });
      void refetchWallet();
    },
    onError: (err) => {
      const classified = classifyBroadcastError(err);
      setBroadcastError(classified);
      // Force a re-arm on every failure so the donor explicitly re-confirms
      // after seeing the error — without this, a second tap of an
      // already-armed Send would immediately re-broadcast with the same
      // (rejected) parameters.
      setConfirmArmed(false);
      // The inline alert is the primary surface for classified errors;
      // a toast on top would be noisy. Keep the toast only for the
      // catch-all `unknown` bucket so something always surfaces even when
      // we can't recognise the reject reason.
      if (classified.kind === 'unknown') {
        toast({
          title: t('walletSend.toast.failedTitle'),
          description: err.message,
          variant: 'destructive',
        });
      }
    },
    onSettled: () => setProgress('idle'),
  });

  // Clear the broadcast-error alert as soon as the donor adjusts anything
  // that could plausibly resolve the failure. Recipient / amount / fee rate
  // changes are the obvious cases; we don't clear on a btcPrice tick alone
  // because that's just a passive refresh.
  useEffect(() => {
    setBroadcastError(null);
  }, [recipient?.address, effectiveAmountSats, feeSpeed, customFeeRate]);

  /**
   * Recovery action for fee-related broadcast failures.
   *
   * Strategy:
   * - If the user is on a preset and a faster preset exists in the
   *   *deduped* tier list, jump to it.
   * - Otherwise (already on the fastest tier, or only one unique tier
   *   loaded), switch to a custom rate seeded from the strongest hint
   *   we have: the parsed minRelayFee from the error, the parsed actual
   *   rate * 1.5, or the current fastest preset + 1. Open the fee popover
   *   so the donor can see the new rate and tweak it further.
   *
   * Either way: refetch fee rates, mark the picker as user-touched (so the
   * auto-tune effect doesn't override the bump on the next render), clear
   * the broadcast-error alert, and reset `confirmArmed`.
   */
  const bumpFeeForRetry = useCallback(() => {
    feeSpeedUserChanged.current = true;
    setConfirmArmed(false);
    setBroadcastError(null);
    void refetchFeeRates();

    const uniqueSpeeds = feeRates ? getUniqueBitcoinFeeSpeeds(feeRates) : [];
    const presetIndex = uniqueSpeeds.indexOf(feeSpeed as Exclude<FeeSpeed, 'custom'>);

    if (feeSpeed !== 'custom' && presetIndex > 0) {
      // A faster preset exists — jump to it.
      setFeeSpeed(uniqueSpeeds[presetIndex - 1]);
      return;
    }

    // Either at the fastest preset already, or on `custom`. Fall back to
    // a custom rate using the strongest available hint.
    const fastestPresetRate = feeRates?.fastestFee ?? 1;
    const fromError =
      broadcastError?.kind === 'feeTooLow'
        ? (broadcastError.minRelayFeeRate ?? broadcastError.actualFeeRate)
        : undefined;
    const seed = (() => {
      if (broadcastError?.kind === 'feeTooLow' && broadcastError.minRelayFeeRate) {
        // +1 sat/vB over the network minimum so we clear it comfortably.
        return Math.max(broadcastError.minRelayFeeRate + 1, fastestPresetRate);
      }
      if (fromError) {
        // No minimum surfaced but we know the rejected rate — 1.5× as a
        // safe escalation step.
        return Math.max(Math.ceil(fromError * 1.5), fastestPresetRate + 1);
      }
      // No usable hint — nudge above the current fastest tier.
      const current = currentFeeRate ?? fastestPresetRate;
      return Math.max(current + 1, fastestPresetRate + 1);
    })();

    setFeeSpeed('custom');
    setCustomFeeRate(String(Math.max(1, Math.ceil(seed))));
    setFeePopoverOpen(true);
  }, [
    broadcastError,
    currentFeeRate,
    feeRates,
    feeSpeed,
    refetchFeeRates,
  ]);

  const handleSend = useCallback(() => {
    setError('');
    if (availability.status !== 'available') {
      setError(t('walletSend.errors.unavailable')); return;
    }
    if (!recipient) { setError(t('walletSend.errors.enterRecipient')); return; }
    if (!btcPrice) { setError(t('walletSend.errors.waitingPrice')); return; }
    if (effectiveAmountSats <= 0) { setError(t('walletSend.errors.enterAmount')); return; }
    if (!ownedInputs.length) { setError(t('walletSend.errors.noneYet')); return; }
    if (!currentFeeRate || currentFeeRate < 1) {
      setError(
        feeSpeed === 'custom'
          ? t('walletSend.errors.feeRateTooLow')
          : t('walletSend.errors.feesNotLoadedYet'),
      );
      return;
    }
    if (insufficient) { setError(t('walletSend.errors.insufficient')); return; }
    if (requiresArm && !confirmArmed) { setConfirmArmed(true); return; }
    sendMutation.mutate();
  }, [
    t,
    availability,
    recipient,
    btcPrice,
    effectiveAmountSats,
    ownedInputs.length,
    currentFeeRate,
    feeSpeed,
    insufficient,
    requiresArm,
    confirmArmed,
    sendMutation,
  ]);

  // ── Reset on close ───────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (sendMutation.isPending) return;
    onClose();
    // defer to allow exit animation
    setTimeout(() => {
      setRecipient(null);
      setUsdAmount(5);
      setSendMax(false);
      setError('');
      setFeeSpeed('halfHour');
      setCustomFeeRate('');
      setConfirmArmed(false);
      setSuccess(null);
      setBroadcastError(null);
      feeSpeedUserChanged.current = false;
    }, 200);
  }, [onClose, sendMutation.isPending]);

  // ── Render helpers ───────────────────────────────────────────
  const sendButtonLabel = (() => {
    if (sendMutation.isPending) {
      switch (progress) {
        case 'building': return t('walletSend.progress.building');
        case 'signing': return t('walletSend.progress.signing');
        case 'broadcasting': return t('walletSend.progress.broadcasting');
        default: return t('walletSend.progress.sending');
      }
    }
    if (confirmArmed) return t('walletSend.tapAgainToConfirm');
    if (insufficient) return t('walletSend.notEnoughBitcoin');
    return t('walletSend.send');
  })();

  const sendDisabled =
    sendMutation.isPending ||
    !recipient ||
    !btcPrice ||
    effectiveAmountSats <= 0 ||
    insufficient ||
    !ownedInputs.length ||
    !currentFeeRate ||
    currentFeeRate < 1;

  const maxAmountLabel = sendMax && effectiveAmountSats > 0 && btcPrice
    ? `${satsToUSD(effectiveAmountSats, btcPrice)} · ${t('walletSend.success.satsAmount', { sats: formatSats(effectiveAmountSats) })}`
    : undefined;

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-[425px] rounded-2xl p-0 gap-0 border-border overflow-hidden max-h-[95vh] [&>button]:hidden">
        <DialogTitle className="sr-only">{t('walletSend.title')}</DialogTitle>

        {success ? (
          <SuccessScreen
            txid={success.txid}
            amountSats={success.amountSats}
            btcPrice={btcPrice}
            onClose={handleClose}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12">
              <h2 className="text-base font-semibold flex items-center gap-1.5">
                {t('walletSend.title')}
                <HelpTip faqId="send-bitcoin-onchain" />
              </h2>
              <button
                onClick={handleClose}
                className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                aria-label={t('common.close')}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="grid gap-4 px-4 py-4 w-full overflow-y-auto">
              <BitcoinAmountPicker
                usdAmount={usdAmount}
                onUsdAmountChange={(amount) => {
                  setSendMax(false);
                  setUsdAmount(amount);
                }}
                presets={USD_PRESETS}
                maxLabel={t('walletSend.max')}
                maxSelected={sendMax}
                maxDisabled={!ownedInputs.length || !currentFeeRate || !maxSpend}
                onMaxSelect={() => {
                  setError('');
                  setSendMax(true);
                }}
                insufficient={insufficient}
                satsLabel={maxAmountLabel}
                onAmountChangeStart={() => {
                  setError('');
                  setSendMax(false);
                }}
              />

              {/* Recipient — text input + Popover dropdown surfacing the
                  BIP-21 candidates, with an inline QR-scanner button. The
                  picker swaps itself out for a chip once a destination is
                  selected; clicking the chip's X returns to the input. */}
              <BitcoinRecipientInput
                key={openCount}
                value={recipient}
                onChange={(next) => {
                  setRecipient(next);
                  setError('');
                }}
                placeholder={t('walletSend.recipient.placeholder')}
                initialInput={initialRecipient}
              />

              {/* Privacy disclaimer for raw on-chain addresses. SP
                  recipients produce a fresh unlinkable output per payment
                  and don't need the warning. */}
              {isRawAddress && (
                <BitcoinPublicDisclaimer tone="soft" />
              )}

              {/* Error */}
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="size-3.5" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              {/* Classified broadcast failure with an actionable recovery.
                  Replaces the older raw-toast UX so the donor can see why
                  the network rejected the tx (fee too low, mempool full,
                  RBF replacement underpriced, etc.) AND act on it without
                  guessing. Cleared automatically the moment they touch a
                  field that could resolve the failure. */}
              {broadcastError && (
                <BroadcastErrorAlert
                  error={broadcastError}
                  currentFeeRate={currentFeeRate}
                  feeSpeed={feeSpeed}
                  feeRates={feeRates}
                  isPending={sendMutation.isPending}
                  onBumpFee={bumpFeeForRetry}
                  onRetry={() => sendMutation.mutate()}
                />
              )}

              {/* Send button */}
              <Button
                type="button"
                onClick={handleSend}
                disabled={sendDisabled}
                className={cn(
                  'w-full',
                  confirmArmed && !sendMutation.isPending && 'bg-amber-500 hover:bg-amber-600 text-white',
                )}
              >
                {sendMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                {sendButtonLabel}
              </Button>

              {/* Fee speed — under the Send button, centered. The label is
                  implicit: the only thing in the dialog you'd open a popover
                  for here is the network-fee tier. */}
              <div className="flex justify-center text-xs">
                <Popover open={feePopoverOpen} onOpenChange={setFeePopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors text-muted-foreground tabular-nums"
                    >
                      {effectiveFeeSats > 0 && btcPrice ? (
                        <>≈ {satsToUSD(effectiveFeeSats, btcPrice)}</>
                      ) : currentFeeRate ? (
                        <>{t('walletSend.satPerVB', { rate: currentFeeRate })}</>
                      ) : feeRatesLoading && feeSpeed !== 'custom' ? (
                        <>{t('walletSend.fee.loading')}</>
                      ) : feeRatesError && feeSpeed !== 'custom' ? (
                        <>{t('walletSend.fee.unavailable')}</>
                      ) : (
                        <>—</>
                      )}
                      <span className="opacity-60">·</span>
                      {feeSpeed === 'custom' && currentFeeRate
                        ? t('walletSend.satPerVB', { rate: currentFeeRate })
                        : feeSpeedLabels[feeSpeed]}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1" align="center">
                    <div className="grid gap-0.5">
                      {feeRatesError && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground">
                          <p className="text-destructive">{t('walletSend.fee.loadFailed')}</p>
                          <button
                            type="button"
                            onClick={() => refetchFeeRates()}
                            className="mt-1 underline hover:text-foreground transition-colors"
                          >
                            {t('walletSend.fee.retry')}
                          </button>
                          <p className="mt-1">{t('walletSend.fee.orCustom')}</p>
                        </div>
                      )}
                      {feeRatesLoading && !feeRatesError && (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          {t('walletSend.fee.loadingTiers')}
                        </div>
                      )}
                      {feeRates && getUniqueBitcoinFeeSpeeds(feeRates).map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => handleFeeSpeedChange(speed)}
                          className={cn(
                            'flex justify-between items-center px-3 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors',
                            feeSpeed === speed && 'bg-muted',
                          )}
                        >
                          <span>{feeSpeedLabels[speed]}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {t('walletSend.satPerVB', { rate: getBitcoinFeeRate(feeRates, speed) })}
                          </span>
                        </button>
                      ))}
                      {/* Custom fee rate */}
                      <button
                        type="button"
                        onClick={() => handleFeeSpeedChange('custom')}
                        className={cn(
                          'flex justify-between items-center px-3 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors',
                          feeSpeed === 'custom' && 'bg-muted',
                        )}
                      >
                        <span>{feeSpeedLabels.custom}</span>
                      </button>
                      {feeSpeed === 'custom' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={1}
                            step={1}
                            autoFocus
                            value={customFeeRate}
                            onChange={(e) => setCustomFeeRate(e.target.value)}
                            placeholder={t('walletSend.fee.customPlaceholder')}
                            className="h-7 text-xs"
                            aria-label={t('walletSend.fee.customAriaLabel')}
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">sat/vB</span>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

interface SuccessScreenProps {
  txid: string;
  amountSats: number;
  btcPrice: number | undefined;
  onClose: () => void;
}

function SuccessScreen({ txid, amountSats, btcPrice, onClose }: SuccessScreenProps) {
  const { t } = useTranslation();
  const usdDisplay = btcPrice ? satsToUSD(amountSats, btcPrice) : '';

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative grid gap-5 px-6 py-8 w-full overflow-hidden text-center motion-safe:animate-success-fade-up"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--primary)/0.18),transparent_65%)]"
      />

      <div className="relative mx-auto flex size-28 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-500/30 motion-safe:animate-success-halo"
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/30 motion-safe:animate-success-pop"
        />
        <Check className="relative size-14 text-white drop-shadow-sm motion-safe:animate-success-pop" strokeWidth={3} aria-hidden />
      </div>

      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('walletSend.success.title')}</h2>
        <div className="text-4xl font-bold tabular-nums bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-transparent">
          {usdDisplay || t('walletSend.success.satsAmount', { sats: amountSats.toLocaleString() })}
        </div>
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" asChild className="w-full">
          <Link to={`/i/bitcoin:tx:${txid}`} onClick={onClose}>
            <ExternalLink className="size-4 mr-2" />
            {t('walletSend.success.viewTransaction')}
          </Link>
        </Button>
        <Button type="button" onClick={onClose} className="w-full">{t('walletSend.success.done')}</Button>
      </div>
    </div>
  );
}
