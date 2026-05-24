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
import { Input } from '@/components/ui/input';
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
import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { cn } from '@/lib/utils';

import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { useHdWallet } from '@/hooks/useHdWallet';
import { notificationSuccess } from '@/lib/haptics';
import {
  isLargeAmount,
  nostrPubkeyToBitcoinAddress,
  satsToUSD,
} from '@/lib/bitcoin';
import {
  broadcastBlockbookTx,
  type BlockbookFeeRates,
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

type FeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

const FEE_SPEED_ORDER: FeeSpeed[] = ['fastest', 'halfHour', 'hour', 'economy'];

function getRateForSpeed(rates: BlockbookFeeRates, speed: FeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

function getUniqueFeeSpeeds(rates: BlockbookFeeRates | undefined): FeeSpeed[] {
  if (!rates) return FEE_SPEED_ORDER;
  const seen = new Set<number>();
  const result: FeeSpeed[] = [];
  for (const speed of FEE_SPEED_ORDER) {
    const rate = getRateForSpeed(rates, speed);
    if (!seen.has(rate)) { seen.add(rate); result.push(speed); }
  }
  return result;
}

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
export function HDSendBitcoinDialog({ isOpen, onClose, btcPrice }: HDSendBitcoinDialogProps) {
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
  const [editingAmount, setEditingAmount] = useState(false);
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);
  const [success, setSuccess] = useState<SendResult | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const feeSpeedUserChanged = useRef(false);

  const recipient = useMemo(() => resolveRecipient(recipientInput), [recipientInput]);

  // ── Fee rates ────────────────────────────────────────────────
  const { data: feeRates } = useQuery({
    queryKey: ['blockbook-fee-rates', blockbookBaseUrl],
    queryFn: ({ signal }) => fetchFeeRates(blockbookBaseUrl, signal),
    enabled: isOpen && isReady,
    staleTime: 30_000,
  });

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return undefined;
    return getRateForSpeed(feeRates, feeSpeed);
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

    const uniqueSpeeds = getUniqueFeeSpeeds(feeRates);
    const threshold = amountSats * 0.4;

    let target: FeeSpeed = uniqueSpeeds[uniqueSpeeds.length - 1];
    for (const speed of uniqueSpeeds) {
      const rate = getRateForSpeed(feeRates, speed);
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

  useEffect(() => {
    setConfirmArmed(false);
  }, [amountSats, currentFeeRate, btcPrice, recipient?.address]);

  // Reset the privacy acknowledgement only when the recipient changes —
  // not when the user adjusts the amount or fee tier. Toggling between
  // fee speeds should not silently uncheck the warning.
  useEffect(() => {
    setAcknowledgedPublic(false);
  }, [recipient?.address]);

  const requiresArm = isLarge || isRawAddress;

  // ── Amount focus management ──────────────────────────────────
  useEffect(() => {
    if (editingAmount) {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }
  }, [editingAmount]);

  const commitAmountEdit = useCallback(() => {
    setEditingAmount(false);
    if (typeof usdAmount === 'string' && usdAmount.trim() === '') setUsdAmount(0);
  }, [usdAmount]);

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

      const rate = getRateForSpeed(feeRates, feeSpeed);
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
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">{t('walletSend.title')}</DialogTitle>

        {success ? (
          <SuccessScreen
            txid={success.txid}
            amountSats={success.amountSats}
            btcPrice={btcPrice}
            onClose={handleClose}
          />
        ) : (
          <div className="grid gap-5 px-6 py-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{t('walletSend.title')}</h2>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('common.close')}
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Amount */}
            <div className="flex flex-col items-center py-2">
              {editingAmount ? (
                <div className="flex items-center text-4xl font-bold tracking-tight">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    ref={amountInputRef}
                    type="number"
                    inputMode="decimal"
                    value={usdAmount}
                    onChange={(e) => setUsdAmount(e.target.value)}
                    onBlur={commitAmountEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitAmountEdit(); }}
                    className="bg-transparent border-none focus-visible:ring-0 text-4xl font-bold tracking-tight w-32 text-center px-0 h-auto"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingAmount(true)}
                  className="text-4xl font-bold tracking-tight hover:text-primary transition-colors cursor-text"
                >
                  ${typeof usdAmount === 'number' ? usdAmount : (parseFloat(usdAmount) || 0)}
                </button>
              )}
              {amountSats > 0 && btcPrice && (
                <span className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {t('walletSend.approxSats', { sats: amountSats.toLocaleString() })}
                </span>
              )}
            </div>

            {/* USD presets */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {USD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => { setUsdAmount(preset); setEditingAmount(false); }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs border transition-colors',
                    Number(usdAmount) === preset
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  ${preset}
                </button>
              ))}
            </div>

            {/* Recipient */}
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="hd-recipient-input">
                {t('walletSend.recipient.label')}
              </label>
              <Input
                id="hd-recipient-input"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder={t('walletSend.recipient.placeholder')}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-sm"
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

            {/* Privacy disclaimer for raw addresses */}
            {isRawAddress && (
              <BitcoinPublicDisclaimer
                acknowledged={acknowledgedPublic}
                onAcknowledgedChange={setAcknowledgedPublic}
              />
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
                    {getUniqueFeeSpeeds(feeRates).map((speed) => (
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
                            {t('walletSend.satPerVB', { rate: getRateForSpeed(feeRates, speed) })}
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
