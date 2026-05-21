import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  broadcastTransaction,
  estimateFee,
  getFeeRates,
  isLargeAmount,
  nostrPubkeyToBitcoinAddress,
  satsToUSD,
  validateBitcoinAddress,
  type FeeRates,
} from '@/lib/bitcoin';
import {
  buildHdUnsignedPsbt,
  finalizeHdPsbt,
  type HdSpendableUtxo,
  signHdPsbt,
} from '@/lib/hdwallet/transaction';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USD_PRESETS = [1, 5, 10, 25, 100];

type FeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

const FEE_SPEED_LABELS: Record<FeeSpeed, string> = {
  fastest: '~10 min',
  halfHour: '~30 min',
  hour: '~1 hour',
  economy: '~1 day',
};

const FEE_SPEED_ORDER: FeeSpeed[] = ['fastest', 'halfHour', 'hour', 'economy'];

function getRateForSpeed(rates: FeeRates, speed: FeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

function getUniqueFeeSpeeds(rates: FeeRates | undefined): FeeSpeed[] {
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
  /** Final P2TR/P2WPKH/etc. address used as the PSBT output. */
  address: string;
  /** Optional Nostr pubkey when the recipient was an npub/nprofile. */
  pubkey?: string;
  /** Raw text the user typed (for re-display). */
  raw: string;
}

/**
 * Parse the recipient input as one of:
 *   - bare Bitcoin address (mainnet, any standard type)
 *   - npub1… → P2TR derived from the Nostr pubkey (matches /wallet's mapping)
 *   - nprofile1… → P2TR derived from the encoded pubkey
 *
 * Returns `null` for unparseable input. The caller should treat `null` as
 * "input still in progress" rather than "error" until the user submits.
 */
function resolveRecipient(input: string): ResolvedRecipient | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try bare Bitcoin address first — common case.
  if (validateBitcoinAddress(trimmed)) {
    return { address: trimmed, raw: trimmed };
  }

  // Try NIP-19 npub / nprofile.
  if (trimmed.startsWith('npub1') || trimmed.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'npub') {
        const address = nostrPubkeyToBitcoinAddress(decoded.data);
        if (address) return { address, pubkey: decoded.data, raw: trimmed };
      } else if (decoded.type === 'nprofile') {
        const address = nostrPubkeyToBitcoinAddress(decoded.data.pubkey);
        if (address) return { address, pubkey: decoded.data.pubkey, raw: trimmed };
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
}

/**
 * "Send Bitcoin" dialog for the HD wallet at `/hdwallet`.
 *
 * Mirrors the UX of `SendBitcoinDialog` for visual consistency — large
 * editable USD amount, preset chips, fee speed picker, two-tap arming for
 * large amounts, privacy disclaimer for raw addresses — but uses the HD
 * wallet's UTXO set across many addresses, signs with per-input HD-derived
 * keys, and emits change to a fresh internal address.
 */
export function HDSendBitcoinDialog({ isOpen, onClose, btcPrice }: HDSendBitcoinDialogProps) {
  const availability = useHdWalletAccess();
  const { scan, refetch: refetchWallet } = useHdWallet();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isReady = availability.status === 'available';

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
    queryKey: ['bitcoin-fee-rates', esploraBaseUrl],
    queryFn: () => getFeeRates(esploraBaseUrl),
    enabled: isOpen && isReady,
    staleTime: 30_000,
  });

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return undefined;
    return getRateForSpeed(feeRates, feeSpeed);
  }, [feeRates, feeSpeed]);

  // ── Owned UTXO set ───────────────────────────────────────────
  const ownedUtxos: HdSpendableUtxo[] = useMemo(() => scan?.utxos ?? [], [scan]);
  const totalBalance = useMemo(() => ownedUtxos.reduce((s, u) => s + u.value, 0), [ownedUtxos]);

  // ── USD → sats ───────────────────────────────────────────────
  const amountSats = useMemo(() => {
    if (!btcPrice) return 0;
    const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
    if (!Number.isFinite(usd) || usd <= 0) return 0;
    return Math.round((usd / btcPrice) * 100_000_000);
  }, [usdAmount, btcPrice]);

  // ── Fee estimate (uses a conservative input count) ───────────
  //
  // We don't yet know coin selection will use _all_ UTXOs, but using the
  // full count is the safe over-estimate (real fee will be ≤ this).
  const estimatedFeeSats = useMemo(() => {
    if (!ownedUtxos.length || !currentFeeRate || !amountSats) return 0;
    const fee2 = estimateFee(ownedUtxos.length, 2, currentFeeRate);
    const change = totalBalance - amountSats - fee2;
    const numOutputs = change > 546 ? 2 : 1;
    return estimateFee(ownedUtxos.length, numOutputs, currentFeeRate);
  }, [ownedUtxos.length, currentFeeRate, amountSats, totalBalance]);

  const totalSats = amountSats + estimatedFeeSats;
  const insufficient = totalBalance > 0 && totalSats > totalBalance;
  const showBalance = insufficient || (amountSats > 0 && totalBalance === 0);

  // Auto-tune fee speed to keep fees < 40% of the send amount, unless the
  // user has manually overridden.
  useEffect(() => {
    if (feeSpeedUserChanged.current) return;
    if (!ownedUtxos.length || !feeRates || amountSats <= 0) return;

    const uniqueSpeeds = getUniqueFeeSpeeds(feeRates);
    const threshold = amountSats * 0.4;

    let target: FeeSpeed = uniqueSpeeds[uniqueSpeeds.length - 1];
    for (const speed of uniqueSpeeds) {
      const rate = getRateForSpeed(feeRates, speed);
      const fee2 = estimateFee(ownedUtxos.length, 2, rate);
      const change = totalBalance - amountSats - fee2;
      const outputs = change > 546 ? 2 : 1;
      const fee = estimateFee(ownedUtxos.length, outputs, rate);
      if (fee <= threshold) { target = speed; break; }
    }
    setFeeSpeed((prev) => (prev === target ? prev : target));
  }, [amountSats, feeRates, ownedUtxos.length, totalBalance]);

  const handleFeeSpeedChange = useCallback((speed: FeeSpeed) => {
    feeSpeedUserChanged.current = true;
    setFeeSpeed(speed);
    setFeePopoverOpen(false);
  }, []);

  // ── Two-tap arm + raw-address disclaimer ─────────────────────
  const isLarge = isLargeAmount(totalSats, btcPrice);
  const isRawAddress = !!recipient && !recipient.pubkey;
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [acknowledgedPublic, setAcknowledgedPublic] = useState(false);

  useEffect(() => {
    setConfirmArmed(false);
    setAcknowledgedPublic(false);
  }, [amountSats, currentFeeRate, btcPrice, recipient?.address]);

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
        throw new Error('HD wallet is not available for this login type.');
      }
      if (!recipient) throw new Error('Enter a Bitcoin address or npub.');
      if (!ownedUtxos.length) throw new Error('No spendable Bitcoin in this wallet.');
      if (!feeRates) throw new Error('Fee rates not loaded.');
      if (recipient.pubkey === availability.pubkey) throw new Error("You can't send to yourself.");
      if (amountSats <= 0) throw new Error('Enter an amount.');
      if (insufficient) throw new Error('Not enough Bitcoin for this amount + network fee.');

      const rate = getRateForSpeed(feeRates, feeSpeed);
      const nextChangeIndex = scan?.change.firstUnusedIndex ?? 0;

      setProgress('building');
      const built = buildHdUnsignedPsbt(
        availability.account,
        ownedUtxos,
        recipient.address,
        amountSats,
        rate,
        nextChangeIndex,
      );

      setProgress('signing');
      const signedHex = signHdPsbt(built.psbtHex, built.inputDerivations, availability.account);
      const txHex = finalizeHdPsbt(signedHex);

      setProgress('broadcasting');
      const txid = await broadcastTransaction(txHex, esploraBaseUrl);

      return { txid, amountSats, fee: built.fee };
    },
    onSuccess: (result) => {
      notificationSuccess();
      setSuccess(result);
      // Invalidate HD wallet caches and the legacy single-address ones too
      // (some screens still read them).
      queryClient.invalidateQueries({ queryKey: ['hdwallet-scan'] });
      queryClient.invalidateQueries({ queryKey: ['hdwallet-txs'] });
      void refetchWallet();
    },
    onError: (err) => {
      toast({ title: 'Transaction failed', description: err.message, variant: 'destructive' });
    },
    onSettled: () => setProgress('idle'),
  });

  const handleSend = useCallback(() => {
    setError('');
    if (availability.status !== 'available') {
      setError('HD wallet is not available for this login type.'); return;
    }
    if (!recipient) { setError('Enter a Bitcoin address or npub.'); return; }
    if (recipient.pubkey === availability.pubkey) { setError("You can't send to yourself."); return; }
    if (!btcPrice) { setError('Waiting for BTC price…'); return; }
    if (amountSats <= 0) { setError('Enter an amount.'); return; }
    if (!ownedUtxos.length) { setError("You don't have any Bitcoin yet."); return; }
    if (insufficient) { setError('Not enough Bitcoin for this amount + network fee.'); return; }
    if (isRawAddress && !acknowledgedPublic) {
      setError('Acknowledge the privacy warning before sending.'); return;
    }
    if (requiresArm && !confirmArmed) { setConfirmArmed(true); return; }
    sendMutation.mutate();
  }, [
    availability,
    recipient,
    btcPrice,
    amountSats,
    ownedUtxos.length,
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
        case 'building': return 'Building transaction…';
        case 'signing': return 'Signing…';
        case 'broadcasting': return 'Broadcasting…';
        default: return 'Sending…';
      }
    }
    if (confirmArmed) return 'Tap again to confirm';
    return 'Send Bitcoin';
  })();

  const sendDisabled =
    sendMutation.isPending ||
    !recipient ||
    !btcPrice ||
    amountSats <= 0 ||
    insufficient ||
    !ownedUtxos.length ||
    (isRawAddress && !acknowledgedPublic);

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Send Bitcoin</DialogTitle>

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
              <h2 className="text-base font-semibold">Send Bitcoin</h2>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
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
                  ≈ {amountSats.toLocaleString()} sats
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
                Recipient
              </label>
              <Input
                id="hd-recipient-input"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="bc1… or npub…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-sm"
              />
              {recipient && (
                <p className="text-xs text-muted-foreground">
                  {recipient.pubkey ? (
                    <>Sending to a Nostr user&apos;s on-chain address.</>
                  ) : (
                    <>Sending to a raw Bitcoin address.</>
                  )}
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
              <span className="text-muted-foreground">Network fee</span>
              <Popover open={feePopoverOpen} onOpenChange={setFeePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors text-muted-foreground tabular-nums"
                  >
                    {estimatedFeeSats > 0 && btcPrice ? (
                      <>≈ {satsToUSD(estimatedFeeSats, btcPrice)}</>
                    ) : (
                      <>—</>
                    )}
                    <span className="opacity-60">·</span>
                    {FEE_SPEED_LABELS[feeSpeed]}
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
                        <span>{FEE_SPEED_LABELS[speed]}</span>
                        {feeRates && (
                          <span className="text-muted-foreground tabular-nums">
                            {getRateForSpeed(feeRates, speed)} sat/vB
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
                Available: {satsToUSD(totalBalance, btcPrice)} ({totalBalance.toLocaleString()} sats)
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
        <h2 className="text-lg font-semibold tracking-tight">Bitcoin sent</h2>
        <div className="text-4xl font-bold tabular-nums bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-transparent">
          {usdDisplay || `${amountSats.toLocaleString()} sats`}
        </div>
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" asChild className="w-full">
          <Link to={`/i/bitcoin:tx:${txid}`} onClick={onClose}>
            <ExternalLink className="size-4 mr-2" />
            View transaction
          </Link>
        </Button>
        <Button type="button" onClick={onClose} className="w-full">Done</Button>
      </div>
    </div>
  );
}
