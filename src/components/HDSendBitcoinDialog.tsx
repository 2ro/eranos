import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nip19 } from 'nostr-tools';
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
import { BitcoinAmountPicker } from '@/components/BitcoinAmountPicker';
import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { BitcoinRecipientInput } from '@/components/BitcoinRecipientInput';
import { QrScannerDialog } from '@/components/QrScannerDialog';
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
  type BitcoinFeeSpeed,
} from '@/lib/bitcoinFeeSpeed';
import {
  isLargeAmount,
  nostrPubkeyToBitcoinAddress,
  parseBitcoinUri,
  satsToUSD,
} from '@/lib/bitcoin';
import {
  broadcastBlockbookTx,
  fetchFeeRates,
} from '@/lib/hdwallet/blockbook';
import {
  buildHdSpendPsbt,
  finalizeHdPsbt,
  type HdInput,
  type HdSpendableSpUtxo,
  type HdSpendableUtxo,
  parseHdRecipient,
  previewHdFee,
  signHdPsbt,
} from '@/lib/hdwallet/transaction';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USD_PRESETS = [1, 5, 10, 25, 100];

type FeeSpeed = BitcoinFeeSpeed;

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

interface ResolvedRecipient {
  /**
   * Final P2TR/P2WPKH/etc. address used as the PSBT output.
   *
   * For silent-payment (`sp1…`) recipients this is the original `sp1…`
   * string — the real on-chain `P_k` is derived at build time, after coin
   * selection. The dialog never displays this value directly when
   * `kind === 'sp'`; it's kept here so {@link buildHdSpendPsbt} can route
   * by recipient kind.
   */
  address: string;
  /** Optional Nostr pubkey when the recipient was an npub/nprofile. */
  pubkey?: string;
  /** Raw text the user typed (for re-display). */
  raw: string;
  /**
   * Recipient kind. `'address'` for bare Bitcoin addresses (including
   * Nostr-derived ones); `'sp'` for BIP-352 silent-payment addresses.
   */
  kind: 'address' | 'sp';
}

/**
 * Parse the recipient input as one of:
 *   - bare Bitcoin address (mainnet, any standard type)
 *   - silent-payment address (`sp1…`, mainnet, v0)
 *   - npub1… → P2TR derived from the Nostr pubkey
 *   - nprofile1… → P2TR derived from the encoded pubkey
 *
 * Returns `null` for unparseable input. The caller should treat `null` as
 * "input still in progress" rather than "error" until the user submits.
 */
function resolveRecipient(input: string): ResolvedRecipient | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try bare Bitcoin / silent-payment via the unified parser.
  const parsed = parseHdRecipient(trimmed);
  if (parsed) {
    if (parsed.kind === 'address') {
      return { address: parsed.address, raw: trimmed, kind: 'address' };
    }
    return { address: parsed.spAddress, raw: trimmed, kind: 'sp' };
  }

  // Try NIP-19 npub / nprofile.
  if (trimmed.startsWith('npub1') || trimmed.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'npub') {
        const address = nostrPubkeyToBitcoinAddress(decoded.data);
        if (address) return { address, pubkey: decoded.data, raw: trimmed, kind: 'address' };
      } else if (decoded.type === 'nprofile') {
        const address = nostrPubkeyToBitcoinAddress(decoded.data.pubkey);
        if (address) return { address, pubkey: decoded.data.pubkey, raw: trimmed, kind: 'address' };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HDSendBitcoinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** BTC/USD price — passed in to avoid duplicate fetches. */
  btcPrice?: number;
  /**
   * Optional recipient (bare address, `sp1…` code, npub, or `bitcoin:` URI)
   * to prefill the recipient field with when the dialog opens. Used by
   * callers like the campaign detail page that already know the
   * destination, so the donor only needs to enter an amount.
   *
   * The field stays editable — donors can clear and retype if they want
   * to send somewhere else. The prefill applies on each open transition
   * (false → true) so reopening after a successful send loads the same
   * destination again.
   */
  initialRecipient?: string;
  /**
   * Optional *alternate* recipient. When supplied alongside
   * {@link initialRecipient}, the dialog shows a small "Use silent
   * payment instead" / "Use on-chain address instead" toggle under the
   * recipient field. Clicking it swaps the input between the two values
   * so donors can pick whichever the campaign provides without leaving
   * the modal.
   *
   * Campaign detail page wires the on-chain `bc1…` address as
   * {@link initialRecipient} (default) and the silent-payment `sp1…`
   * code as `initialRecipientAlt`.
   */
  initialRecipientAlt?: string;
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
export function HDSendBitcoinDialog({ isOpen, onClose, btcPrice, initialRecipient, initialRecipientAlt }: HDSendBitcoinDialogProps) {
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
    }),
    [t],
  );

  // ── Form state ───────────────────────────────────────────────
  const [recipientInput, setRecipientInput] = useState('');
  const [usdAmount, setUsdAmount] = useState<number | string>(5);
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);
  const [success, setSuccess] = useState<SendResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const feeSpeedUserChanged = useRef(false);

  const recipient = useMemo(() => resolveRecipient(recipientInput), [recipientInput]);

  /**
   * Interpret a freshly-scanned QR code and stuff it into the recipient
   * input. A `bitcoin:bc1q…?sp=sp1q…` BIP-21 URI means "send via silent
   * payment if you can; otherwise fall back to the on-chain address" — we
   * prefer the `sp` parameter when it parses, and the swap toggle under the
   * input lets the user fall back to the on-chain address if they want to.
   * Anything else (bare address, `sp1…`, npub, nprofile) is dropped in
   * verbatim and `resolveRecipient` does the rest.
   */
  const handleScan = useCallback((scanned: string) => {
    setScannerOpen(false);
    setError('');
    const trimmed = scanned.trim();
    const bip21 = parseBitcoinUri(trimmed);
    if (bip21) {
      if (bip21.sp && resolveRecipient(bip21.sp)) {
        setRecipientInput(bip21.sp);
        return;
      }
      if (bip21.address) {
        setRecipientInput(bip21.address);
        return;
      }
    }
    setRecipientInput(trimmed);
  }, []);

  // ── Fee rates ────────────────────────────────────────────────
  const { data: feeRates } = useQuery({
    queryKey: ['blockbook-fee-rates', blockbookBaseUrl],
    queryFn: ({ signal }) => fetchFeeRates(blockbookBaseUrl, signal),
    enabled: isOpen && isReady,
    staleTime: 30_000,
  });

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return undefined;
    return getBitcoinFeeRate(feeRates, feeSpeed);
  }, [feeRates, feeSpeed]);

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

  const totalSats = amountSats + estimatedFeeSats;
  // `previewHdFee` returns 0 when the coin selector can't cover `amount + fee`.
  // Treat that as insufficient so the UI doesn't claim a 0-sat fee is fine.
  const selectionFailed =
    amountSats > 0 && !!currentFeeRate && ownedInputs.length > 0 && estimatedFeeSats === 0;
  const insufficient = selectionFailed || (totalBalance > 0 && totalSats > totalBalance);
  const showBalance = insufficient || (amountSats > 0 && totalBalance === 0);

  // Auto-tune fee speed to keep fees < 40% of the send amount, unless the
  // user has manually overridden.
  useEffect(() => {
    if (feeSpeedUserChanged.current) return;
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
  }, [amountSats, feeRates, ownedInputs, totalBalance]);

  const handleFeeSpeedChange = useCallback((speed: FeeSpeed) => {
    feeSpeedUserChanged.current = true;
    setFeeSpeed(speed);
    setFeePopoverOpen(false);
  }, []);

  // ── Two-tap arm + raw-address disclaimer ─────────────────────
  const isLarge = isLargeAmount(totalSats, btcPrice);
  // SP recipients (`sp1…`) produce a fresh, unlinkable Taproot output per
  // payment — they do NOT have the privacy concern of a reused on-chain
  // address. The public disclaimer is only needed for bare BTC addresses
  // typed in directly (no Nostr identity attached, no SP).
  const isRawAddress =
    !!recipient && recipient.kind === 'address' && !recipient.pubkey;
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [acknowledgedPublic, setAcknowledgedPublic] = useState(false);

  // Recipient swap target. When the caller supplied two alternate
  // destinations (e.g. campaign detail page passing both `bc1…` and
  // `sp1…` from the campaign's wallet endpoints) and the current input
  // still matches one of them, expose a one-tap toggle to swap. If the
  // donor manually edited the field to something else, the toggle hides
  // itself so we don't trash their typed input.
  //
  // Lives next to `isRawAddress` so the render block can place the
  // toggle adjacent to the privacy disclaimer (its natural home — both
  // are about whether to expose a reusable on-chain address).
  const recipientSwap = useMemo<{ swapTo: string; labelKey: string } | null>(() => {
    if (!initialRecipient || !initialRecipientAlt) return null;
    const trimmed = recipientInput.trim();
    let swapTo: string | null = null;
    if (trimmed === initialRecipient) swapTo = initialRecipientAlt;
    else if (trimmed === initialRecipientAlt) swapTo = initialRecipient;
    if (!swapTo) return null;
    // The label tells the user *what they're switching to* — detect by
    // prefix so an `sp1…` swap target advertises silent payment.
    const labelKey = swapTo.toLowerCase().startsWith('sp1')
      ? 'walletSend.recipient.useSilentPayment'
      : 'walletSend.recipient.useOnchain';
    return { swapTo, labelKey };
  }, [initialRecipient, initialRecipientAlt, recipientInput]);

  useEffect(() => {
    setConfirmArmed(false);
  }, [amountSats, currentFeeRate, btcPrice, recipient?.address]);

  // Reset the privacy acknowledgement only when the recipient changes —
  // not when the user adjusts the amount or fee tier. Toggling between
  // fee speeds should not silently uncheck the warning.
  useEffect(() => {
    setAcknowledgedPublic(false);
  }, [recipient?.address]);

  // Prefill the recipient field on every dialog open transition (closed →
  // open). Callers like the campaign donate column already know the
  // destination, so the donor only needs to type an amount. The field
  // stays editable; reopening after a send re-applies the prefill instead
  // of remembering the cleared value. Tracked via a ref so reopens with a
  // stable string still re-apply (the value alone can't tell us whether
  // the dialog has reopened).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current && initialRecipient) {
      setRecipientInput(initialRecipient);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialRecipient]);

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
      if (!feeRates) throw new Error(t('walletSend.errors.feesNotLoaded'));
      if (recipient.pubkey === availability.pubkey) throw new Error(t('walletSend.errors.cantSendToSelf'));
      if (amountSats <= 0) throw new Error(t('walletSend.errors.enterAmount'));
      if (insufficient) throw new Error(t('walletSend.errors.insufficient'));

      const rate = getBitcoinFeeRate(feeRates, feeSpeed);
      const nextChangeIndex = scan?.change.firstUnusedIndex ?? 0;

      setProgress('building');
      const built = buildHdSpendPsbt({
        account: availability.account,
        inputs: ownedInputs,
        recipient:
          recipient.kind === 'sp'
            ? { kind: 'sp', spAddress: recipient.address }
            : { kind: 'address', address: recipient.address },
        amountSats,
        feeRate: rate,
        nextChangeIndex,
        seed: availability.seed,
      });

      setProgress('signing');
      const signedHex = signHdPsbt(
        built.psbtHex,
        built.inputDescriptors,
        availability.account,
        availability.seed,
      );
      const txHex = finalizeHdPsbt(signedHex);

      setProgress('broadcasting');
      const txid = await broadcastBlockbookTx(blockbookBaseUrl, txHex);

      return { txid, amountSats, fee: built.fee, consumedSpUtxos: built.consumedSpUtxos };
    },
    onSuccess: (result) => {
      notificationSuccess();
      setSuccess(result);
      queryClient.invalidateQueries({ queryKey: ['hdwallet-scan'] });
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
      void refetchWallet();
    },
    onError: (err) => {
      toast({ title: t('walletSend.toast.failedTitle'), description: err.message, variant: 'destructive' });
    },
    onSettled: () => setProgress('idle'),
  });

  const handleSend = useCallback(() => {
    setError('');
    if (availability.status !== 'available') {
      setError(t('walletSend.errors.unavailable')); return;
    }
    if (!recipient) { setError(t('walletSend.errors.enterRecipient')); return; }
    if (recipient.pubkey === availability.pubkey) { setError(t('walletSend.errors.cantSendToSelf')); return; }
    if (!btcPrice) { setError(t('walletSend.errors.waitingPrice')); return; }
    if (amountSats <= 0) { setError(t('walletSend.errors.enterAmount')); return; }
    if (!ownedInputs.length) { setError(t('walletSend.errors.noneYet')); return; }
    if (insufficient) { setError(t('walletSend.errors.insufficient')); return; }
    if (isRawAddress && !acknowledgedPublic) {
      setError(t('walletSend.errors.acknowledgePrivacy')); return;
    }
    if (requiresArm && !confirmArmed) { setConfirmArmed(true); return; }
    sendMutation.mutate();
  }, [
    t,
    availability,
    recipient,
    btcPrice,
    amountSats,
    ownedInputs.length,
    insufficient,
    isRawAddress,
    acknowledgedPublic,
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
      setRecipientInput('');
      setUsdAmount(5);
      setError('');
      setConfirmArmed(false);
      setAcknowledgedPublic(false);
      setSuccess(null);
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
    return t('walletSend.send');
  })();

  const sendDisabled =
    sendMutation.isPending ||
    !recipient ||
    !btcPrice ||
    amountSats <= 0 ||
    insufficient ||
    !ownedInputs.length ||
    (isRawAddress && !acknowledgedPublic);

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
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
                onUsdAmountChange={setUsdAmount}
                presets={USD_PRESETS}
                insufficient={insufficient}
                satsLabel={amountSats > 0 && btcPrice
                  ? t('walletSend.approxSats', { sats: amountSats.toLocaleString() })
                  : undefined}
                onAmountChangeStart={() => setError('')}
              />

              {/* Recipient */}
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground" htmlFor="hd-recipient-input">
                  {t('walletSend.recipient.label')}
                </label>
                <BitcoinRecipientInput
                  value={recipientInput}
                  onChange={setRecipientInput}
                  placeholder={t('walletSend.recipient.placeholder')}
                  resolvedPubkey={recipient?.pubkey}
                  onScanClick={() => setScannerOpen(true)}
                  scanLabel={t('walletSend.recipient.scan')}
                />
                {recipient && (
                  <p className="text-xs text-muted-foreground">
                    {recipient.kind === 'sp'
                      ? t('walletSend.recipient.sendingSp')
                      : recipient.pubkey
                        ? t('walletSend.recipient.sendingNostr')
                        : t('walletSend.recipient.sendingRaw')}
                  </p>
                )}
              </div>

              {/* Privacy disclaimer for raw addresses + companion
                  swap-to-silent-payment toggle. Both are about whether
                  the donation will land on a reusable, publicly-tied
                  address; grouping them lets a donor who reads the
                  warning flip straight to SP without hunting for the
                  control. When the disclaimer is absent (recipient is
                  already SP or a Nostr identity), the toggle still
                  renders so the donor can swap back to on-chain. */}
              {(isRawAddress || recipientSwap) && (
                <div className="grid gap-2">
                  {isRawAddress && (
                    <BitcoinPublicDisclaimer
                      acknowledged={acknowledgedPublic}
                      onAcknowledgedChange={setAcknowledgedPublic}
                    />
                  )}
                  {recipientSwap && (
                    <button
                      type="button"
                      onClick={() => setRecipientInput(recipientSwap.swapTo)}
                      className="self-start text-xs text-primary hover:underline motion-safe:transition-colors"
                    >
                      {t(recipientSwap.labelKey)}
                    </button>
                  )}
                </div>
              )}

              {/* Fee speed */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('walletSend.networkFee')}</span>
                <Popover open={feePopoverOpen} onOpenChange={setFeePopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors text-muted-foreground tabular-nums"
                    >
                      {estimatedFeeSats > 0 && btcPrice ? (
                        <>≈ {satsToUSD(estimatedFeeSats, btcPrice)}</>
                      ) : currentFeeRate ? (
                        <>{t('walletSend.satPerVB', { rate: currentFeeRate })}</>
                      ) : (
                        <>—</>
                      )}
                      <span className="opacity-60">·</span>
                      {feeSpeedLabels[feeSpeed]}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="end">
                    <div className="grid gap-0.5">
                      {getUniqueBitcoinFeeSpeeds(feeRates).map((speed) => (
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
                          {feeRates && (
                            <span className="text-muted-foreground tabular-nums">
                              {t('walletSend.satPerVB', { rate: getBitcoinFeeRate(feeRates, speed) })}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {showBalance && totalBalance > 0 && btcPrice && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('walletSend.available', {
                    usd: satsToUSD(totalBalance, btcPrice),
                    sats: totalBalance.toLocaleString(),
                  })}
                </p>
              )}

              {/* Error */}
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="size-3.5" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
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
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    <QrScannerDialog
      isOpen={scannerOpen}
      onClose={() => setScannerOpen(false)}
      onScan={handleScan}
      title={t('walletSend.recipient.scan')}
    />
    </>
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
