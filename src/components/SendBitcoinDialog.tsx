import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Check, ChevronLeft, Loader2, Send } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  broadcastTransaction,
  BITCOIN_DUST_LIMIT,
  btcToSats,
  buildUnsignedPsbt,
  estimateFee,
  fetchUTXOs,
  finalizePsbt,
  formatBTC,
  formatSats,
  getFeeRates,
  isLargeAmount,
  maxSendable,
  nostrPubkeyToBitcoinAddress,
  npubToBitcoinAddress,
  satsToUSD,
  validateBitcoinAddress,
} from '@/lib/bitcoin';
import type { FeeRates, UTXO } from '@/lib/bitcoin';

type FeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';
type Step = 'form' | 'confirm' | 'success';

interface SendBitcoinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  btcPrice?: number;
}

const FEE_SPEED_LABELS: Record<FeeSpeed, string> = {
  fastest: 'Fastest (~10 min)',
  halfHour: 'Half hour',
  hour: 'One hour',
  economy: 'Economy (~1 day)',
};

function feeRateForSpeed(rates: FeeRates, speed: FeeSpeed): number {
  return {
    fastest: rates.fastestFee,
    halfHour: rates.halfHourFee,
    hour: rates.hourFee,
    economy: rates.economyFee,
  }[speed];
}

function resolveRecipient(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('npub1')) return npubToBitcoinAddress(trimmed);
  if (validateBitcoinAddress(trimmed)) return trimmed;
  throw new Error('Invalid recipient. Enter an npub or a Bitcoin address.');
}

export function SendBitcoinDialog({ isOpen, onClose, btcPrice }: SendBitcoinDialogProps) {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [txId, setTxId] = useState('');
  const [confirmedFee, setConfirmedFee] = useState(0);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';
  const { data: utxos, isLoading: isLoadingUtxos } = useQuery({
    queryKey: ['bitcoin-utxos', senderAddress],
    queryFn: () => fetchUTXOs(senderAddress),
    enabled: !!senderAddress && isOpen,
    staleTime: 30_000,
  });
  const { data: feeRates, isLoading: isLoadingFees } = useQuery({
    queryKey: ['bitcoin-fee-rates'],
    queryFn: getFeeRates,
    enabled: isOpen,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);
  const currentFeeRate = feeRates ? feeRateForSpeed(feeRates, feeSpeed) : 0;
  const parsedAmountSats = useMemo(() => {
    const n = parseFloat(amount);
    return Number.isNaN(n) || n <= 0 ? 0 : btcToSats(n);
  }, [amount]);
  const resolvedRecipient = useMemo(() => {
    try {
      return resolveRecipient(recipient);
    } catch {
      return '';
    }
  }, [recipient]);
  const previewFee = useMemo(() => {
    if (!utxos?.length || !currentFeeRate || !parsedAmountSats) return 0;
    const fee2 = estimateFee(utxos.length, 2, currentFeeRate);
    const change = totalBalance - parsedAmountSats - fee2;
    return estimateFee(utxos.length, change > 546 ? 2 : 1, currentFeeRate);
  }, [utxos, currentFeeRate, parsedAmountSats, totalBalance]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user || !canSignPsbt || !signPsbt) throw new Error("Your login doesn't support sending Bitcoin.");
      if (!utxos?.length) throw new Error('No spendable Bitcoin available.');
      if (!feeRates) throw new Error('Fee rates not loaded.');

      const recipientAddress = resolveRecipient(recipient);
      const amountSats = btcToSats(parseFloat(amount));
      if (Number.isNaN(amountSats) || amountSats <= 0) throw new Error('Invalid amount.');

      const { psbtHex, fee } = buildUnsignedPsbt(user.pubkey, recipientAddress, amountSats, utxos, feeRateForSpeed(feeRates, feeSpeed));
      const signedHex = await signPsbt(psbtHex);
      const txHex = finalizePsbt(signedHex);
      const id = await broadcastTransaction(txHex);
      return { txId: id, fee };
    },
    onSuccess: ({ txId: id, fee }) => {
      setTxId(id);
      setConfirmedFee(fee);
      setStep('success');
      toast({ title: 'Transaction sent', description: `Fee: ${formatSats(fee)} sats` });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setStep('form');
      toast({ title: 'Transaction failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleSendMax = () => {
    if (!utxos?.length || !currentFeeRate) return;
    const max = maxSendable(totalBalance, utxos.length, currentFeeRate);
    if (max <= 0) return;
    setAmount(formatBTC(max));
    setError('');
  };

  const goToConfirm = () => {
    setError('');
    try {
      resolveRecipient(recipient);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid recipient');
      return;
    }
    if (parsedAmountSats <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (parsedAmountSats < BITCOIN_DUST_LIMIT) {
      setError(`Bitcoin sends must be at least ${BITCOIN_DUST_LIMIT.toLocaleString()} sats.`);
      return;
    }
    if (parsedAmountSats + previewFee > totalBalance) {
      setError('Insufficient funds.');
      return;
    }
    setStep('confirm');
  };

  const handleClose = () => {
    setRecipient('');
    setAmount('');
    setError('');
    setTxId('');
    setConfirmedFee(0);
    setStep('form');
    setFeeSpeed('halfHour');
    onClose();
  };

  if (isOpen && !canSignPsbt) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Sending Not Available
            </DialogTitle>
            <DialogDescription>Your login doesn't support sending Bitcoin.</DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>Log in with your secret key to send Bitcoin.</AlertDescription>
          </Alert>
          <Button onClick={handleClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'success' ? (
          <SuccessView txId={txId} fee={confirmedFee} btcPrice={btcPrice} onClose={handleClose} />
        ) : step === 'confirm' ? (
          <ConfirmView recipient={resolvedRecipient} amountSats={parsedAmountSats} fee={previewFee} feeSpeed={feeSpeed} btcPrice={btcPrice} isPending={sendMutation.isPending} onBack={() => setStep('form')} onConfirm={() => sendMutation.mutate()} />
        ) : (
          <FormView
            recipient={recipient}
            amount={amount}
            feeSpeed={feeSpeed}
            error={error}
            totalBalance={totalBalance}
            btcPrice={btcPrice}
            utxos={utxos}
            feeRates={feeRates}
            isLoadingUtxos={isLoadingUtxos}
            isLoadingFees={isLoadingFees}
            currentFeeRate={currentFeeRate}
            onRecipientChange={(v) => { setRecipient(v); setError(''); }}
            onAmountChange={(v) => { setAmount(v); setError(''); }}
            onFeeSpeedChange={setFeeSpeed}
            onSendMax={handleSendMax}
            onNext={goToConfirm}
            onCancel={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormView({
  recipient,
  amount,
  feeSpeed,
  error,
  totalBalance,
  btcPrice,
  utxos,
  feeRates,
  isLoadingUtxos,
  isLoadingFees,
  currentFeeRate,
  onRecipientChange,
  onAmountChange,
  onFeeSpeedChange,
  onSendMax,
  onNext,
  onCancel,
}: {
  recipient: string;
  amount: string;
  feeSpeed: FeeSpeed;
  error: string;
  totalBalance: number;
  btcPrice?: number;
  utxos?: UTXO[];
  feeRates?: FeeRates;
  isLoadingUtxos: boolean;
  isLoadingFees: boolean;
  currentFeeRate: number;
  onRecipientChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onFeeSpeedChange: (v: FeeSpeed) => void;
  onSendMax: () => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const parsedBtc = parseFloat(amount) || 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Send className="size-5 text-orange-500" />Send Bitcoin</DialogTitle>
        <DialogDescription>Send Bitcoin to a Nostr user or Bitcoin address.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4">
          <Label className="text-xs text-muted-foreground">Available Balance</Label>
          {isLoadingUtxos ? <Skeleton className="mt-1 h-7 w-36" /> : <p className="text-xl font-bold">{btcPrice ? satsToUSD(totalBalance, btcPrice) : `${formatBTC(totalBalance)} BTC`}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="send-recipient">Recipient</Label>
          <Input id="send-recipient" placeholder="npub1... or bc1..." value={recipient} onChange={(event) => onRecipientChange(event.target.value)} />
          <p className="text-xs text-muted-foreground">Nostr npub or Bitcoin address</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="send-amount">Amount (BTC)</Label>
          <Input id="send-amount" type="number" step="0.00000001" min="0" placeholder="0.00000000" value={amount} onChange={(event) => onAmountChange(event.target.value)} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{parsedBtc > 0 ? btcPrice ? satsToUSD(btcToSats(parsedBtc), btcPrice) : `${formatSats(btcToSats(parsedBtc))} sats` : ''}</span>
            <button type="button" onClick={onSendMax} className="text-primary hover:underline">Send Max</button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Transaction Speed</Label>
          <Select value={feeSpeed} onValueChange={(value) => onFeeSpeedChange(value as FeeSpeed)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(FEE_SPEED_LABELS) as FeeSpeed[]).map((speed) => (
                <SelectItem key={speed} value={speed}>{FEE_SPEED_LABELS[speed]} - {isLoadingFees ? '...' : feeRates ? `${feeRateForSpeed(feeRates, speed)} sat/vB` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentFeeRate > 0 && parsedBtc > 0 && <p className="text-xs text-muted-foreground">Estimated fee: ~{formatSats(estimateFee(utxos?.length ?? 1, 2, currentFeeRate))} sats</p>}
        </div>
        {error && <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        <Alert><AlertTriangle className="size-4" /><AlertDescription className="text-xs">Bitcoin transactions are public, irreversible, and can take time to confirm.</AlertDescription></Alert>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={onNext} disabled={!recipient || !amount || parsedBtc <= 0 || isLoadingUtxos || isLoadingFees} className="flex-1"><ArrowUpRight className="size-4 mr-1.5" />Review</Button>
        </div>
      </div>
    </>
  );
}

function ConfirmView({ recipient, amountSats, fee, feeSpeed, btcPrice, isPending, onBack, onConfirm }: { recipient: string; amountSats: number; fee: number; feeSpeed: FeeSpeed; btcPrice?: number; isPending: boolean; onBack: () => void; onConfirm: () => void }) {
  const totalSats = amountSats + fee;
  const isLarge = isLargeAmount(totalSats, btcPrice);
  const truncatedRecipient = recipient.length > 24 ? `${recipient.slice(0, 12)}...${recipient.slice(-8)}` : recipient;
  const row = (label: string, sats: number) => (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right"><span className="text-sm font-medium">{formatBTC(sats)} BTC</span>{btcPrice && <span className="ml-2 text-xs text-muted-foreground">({satsToUSD(sats, btcPrice)})</span>}</div>
    </div>
  );

  return (
    <>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="size-5 text-orange-500" />Confirm Transaction</DialogTitle><DialogDescription>Review the details before sending.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1 rounded-lg bg-muted/50 p-4"><Label className="text-xs text-muted-foreground">Sending to</Label><p className="break-all font-mono text-sm">{truncatedRecipient}</p></div>
        <div className="space-y-2">{row('Amount', amountSats)}{row(`Fee (${FEE_SPEED_LABELS[feeSpeed].toLowerCase()})`, fee)}<div className="border-t pt-2">{row('Total', totalSats)}</div></div>
        {isLarge && btcPrice && <p className="text-center text-xs text-muted-foreground">Sending {satsToUSD(totalSats, btcPrice)}. Double-check the recipient and amount.</p>}
        <div className="flex gap-2"><Button variant="outline" onClick={onBack} disabled={isPending} className="flex-1"><ChevronLeft className="size-4 mr-1" />Back</Button><Button onClick={onConfirm} disabled={isPending} variant={isLarge && !isPending ? 'destructive' : 'default'} className="flex-1">{isPending ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Sending...</> : <><Send className="size-4 mr-1.5" />Confirm &amp; Send</>}</Button></div>
      </div>
    </>
  );
}

function SuccessView({ txId, fee, btcPrice, onClose }: { txId: string; fee: number; btcPrice?: number; onClose: () => void }) {
  return (
    <>
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400"><Check className="size-5" />Transaction Sent</DialogTitle><DialogDescription>Your transaction has been broadcast to the Bitcoin network.</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="space-y-1 rounded-lg bg-green-50 p-4 dark:bg-green-950/30"><Label className="text-xs text-green-700 dark:text-green-300">Transaction ID</Label><p className="break-all font-mono text-xs text-green-900 dark:text-green-100">{txId}</p></div><p className="text-center text-xs text-muted-foreground">Fee: {formatSats(fee)} sats{btcPrice ? ` (${satsToUSD(fee, btcPrice)})` : ''}</p><div className="flex gap-2"><Button variant="outline" className="flex-1" asChild><Link to={`/i/bitcoin:tx:${txId}`} onClick={onClose}>View Details</Link></Button><Button className="flex-1" onClick={onClose}>Done</Button></div></div>
    </>
  );
}
