/**
 * Send Payment Component
 * Handles sending Lightning and Bitcoin on-chain payments
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Zap, Send, AlertCircle, ScanLine, Bitcoin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import { useToast } from '@/hooks/useToast';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';

/** On-chain confirmation speed options */
type OnchainConfirmationSpeed = 'fast' | 'medium' | 'slow';

/** Fee quote for a specific confirmation speed */
interface SpeedFeeQuote {
  userFeeSat: number;
  l1BroadcastFeeSat: number;
}

/** Complete fee quote for on-chain send */
interface OnchainFeeQuote {
  id: string;
  expiresAt: number;
  speedFast: SpeedFeeQuote;
  speedMedium: SpeedFeeQuote;
  speedSlow: SpeedFeeQuote;
}

interface SendPaymentProps {
  defaultInvoice?: string;
  defaultAddress?: string;
  defaultAmount?: number;
  onSuccess?: () => void;
  onClose?: () => void;
}

export function SendPayment({
  defaultInvoice,
  defaultAddress,
  defaultAmount,
  onSuccess,
  onClose,
}: SendPaymentProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState(defaultInvoice ?? defaultAddress ?? '');
  const [amount, setAmount] = useState(defaultAmount?.toString() ?? '');
  const [comment, setComment] = useState('');
  const [parsedType, setParsedType] = useState<string | null>(null);
  const [parsedAmount, setParsedAmount] = useState<number | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // On-chain specific state
  const [onchainFeeQuote, setOnchainFeeQuote] = useState<OnchainFeeQuote | null>(null);
  const [confirmationSpeed, setConfirmationSpeed] = useState<OnchainConfirmationSpeed>('medium');
  const [preparedOnchainPayment, setPreparedOnchainPayment] = useState<unknown>(null);

  const { payInvoice, payLightningAddress, payBitcoinAddress, parseInput, prepareBitcoinPayment, balance, isInitialized } = useSparkWallet();
  const { toast } = useToast();
  const { scanBarcode, isScanning: isScanningQR, isSupported: isScannerSupported } = useBarcodeScanner();

  // Parse input when it changes
  useEffect(() => {
    const parse = async () => {
      if (!input.trim() || !isInitialized) {
        setParsedType(null);
        setParsedAmount(null);
        setOnchainFeeQuote(null);
        setPreparedOnchainPayment(null);
        return;
      }

      setIsParsing(true);
      setError(null);
      setOnchainFeeQuote(null);
      setPreparedOnchainPayment(null);

      try {
        const result = await parseInput(input.trim());
        setParsedType(result.type);
        if (result.amountSat) {
          setParsedAmount(result.amountSat);
          setAmount(result.amountSat.toString());
        } else {
          setParsedAmount(null);
        }
        
        // For Bitcoin addresses, prepare the payment to get fee quotes
        if (result.type === 'bitcoinAddress') {
          try {
            const prepared = await prepareBitcoinPayment(input.trim());
            setPreparedOnchainPayment(prepared);
            
            // Extract fee quote from prepared response
            const paymentMethod = (prepared as { paymentMethod?: { feeQuote?: OnchainFeeQuote } })?.paymentMethod;
            if (paymentMethod?.feeQuote) {
              setOnchainFeeQuote(paymentMethod.feeQuote);
            }
          } catch (prepareError) {
            console.warn('[SendPayment] Failed to prepare Bitcoin payment:', prepareError);
            // Don't set error - user can still see it's a valid address
          }
        }
      } catch {
        setParsedType('unknown');
        setError('Could not parse input');
      } finally {
        setIsParsing(false);
      }
    };

    const debounce = setTimeout(parse, 500);
    return () => clearTimeout(debounce);
  }, [input, isInitialized, parseInput, prepareBitcoinPayment]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const amountSat = parseInt(amount);

    // Validate balance
    if (parsedType === 'bolt11Invoice') {
      const sendAmount = parsedAmount ?? amountSat;
      if (sendAmount > balance) {
        setError('Insufficient balance');
        return;
      }
    } else if (parsedType === 'lnurlPay' || parsedType === 'lightningAddress') {
      if (!amountSat || amountSat <= 0) {
        setError('Please enter an amount');
        return;
      }
      if (amountSat > balance) {
        setError('Insufficient balance');
        return;
      }
    } else if (parsedType === 'bitcoinAddress') {
      if (!amountSat || amountSat <= 0) {
        setError('Please enter an amount');
        return;
      }
      // Check balance including estimated fee
      const estimatedFee = getSelectedFee();
      if (amountSat + estimatedFee > balance) {
        setError(`Insufficient balance (need ${(amountSat + estimatedFee).toLocaleString()} sats including fee)`);
        return;
      }
    }

    setIsSending(true);
    setError(null);

    try {
      if (parsedType === 'bolt11Invoice') {
        await payInvoice(input.trim());
        toast({
          title: 'Payment sent',
          description: `Sent ${parsedAmount?.toLocaleString() ?? amountSat.toLocaleString()} sats`,
        });
      } else if (parsedType === 'lnurlPay' || parsedType === 'lightningAddress') {
        await payLightningAddress(input.trim(), amountSat, comment || undefined);
        toast({
          title: 'Payment sent',
          description: `Sent ${amountSat.toLocaleString()} sats to ${input.trim()}`,
        });
      } else if (parsedType === 'bitcoinAddress') {
        // Use the prepared payment response if available, otherwise prepare fresh
        let prepared = preparedOnchainPayment;
        if (!prepared) {
          prepared = await prepareBitcoinPayment(input.trim(), amountSat);
        }
        
        await payBitcoinAddress(prepared, confirmationSpeed);
        toast({
          title: 'Bitcoin payment sent',
          description: `Sent ${amountSat.toLocaleString()} sats on-chain to ${input.trim().slice(0, 12)}...`,
        });
      } else {
        throw new Error('Unsupported payment type');
      }

      setInput('');
      setAmount('');
      setComment('');
      setOnchainFeeQuote(null);
      setPreparedOnchainPayment(null);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsSending(false);
    }
  };
  
  /** Get the fee for the currently selected confirmation speed */
  const getSelectedFee = (): number => {
    if (!onchainFeeQuote) return 0;
    
    switch (confirmationSpeed) {
      case 'fast':
        return onchainFeeQuote.speedFast.userFeeSat + onchainFeeQuote.speedFast.l1BroadcastFeeSat;
      case 'medium':
        return onchainFeeQuote.speedMedium.userFeeSat + onchainFeeQuote.speedMedium.l1BroadcastFeeSat;
      case 'slow':
        return onchainFeeQuote.speedSlow.userFeeSat + onchainFeeQuote.speedSlow.l1BroadcastFeeSat;
      default:
        return 0;
    }
  };

  const needsAmount = parsedType === 'lnurlPay' || parsedType === 'lightningAddress' || parsedType === 'bitcoinAddress' || (parsedType === 'bolt11Invoice' && !parsedAmount);

  const getInputLabel = () => {
    switch (parsedType) {
      case 'bolt11Invoice':
        return t('wallet2.lightningInvoice');
      case 'lnurlPay':
        return 'LNURL';
      case 'lightningAddress':
        return 'Lightning Address';
      case 'bitcoinAddress':
        return 'Bitcoin Address';
      default:
        return 'Invoice or Address';
    }
  };

  const handleScanQR = async () => {
    const result = await scanBarcode();
    if (result?.text) {
      setInput(result.text);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Available balance:</span>
            <span className="font-medium">{balance.toLocaleString()} sats</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="input">{getInputLabel()}</Label>
              {isScannerSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleScanQR}
                  disabled={isScanningQR}
                  className="h-8 px-2"
                >
                  {isScanningQR ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <ScanLine className="h-4 w-4 mr-1" />
                      Scan QR
                    </>
                  )}
                </Button>
              )}
            </div>
            <Textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Lightning invoice, Lightning address, Bitcoin address, or LNURL..."
              rows={3}
              className="font-mono text-xs"
            />
            {isParsing && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Parsing...
              </p>
            )}
            {parsedType && !isParsing && parsedType !== 'unknown' && (
              <p className="text-xs text-primary flex items-center gap-1">
                {parsedType === 'bitcoinAddress' ? (
                  <Bitcoin className="h-3 w-3" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                {parsedType === 'bolt11Invoice' && 'Valid Lightning invoice'}
                {parsedType === 'lnurlPay' && 'Valid LNURL'}
                {parsedType === 'lightningAddress' && 'Valid Lightning address'}
                {parsedType === 'bitcoinAddress' && 'Valid Bitcoin address (on-chain)'}
              </p>
            )}
          </div>

          {needsAmount && (
            <div className="space-y-2">
              <Label htmlFor="amount">{t('wallet2.amount')} (sats)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                placeholder="Enter amount"
                disabled={parsedType === 'bolt11Invoice' && !!parsedAmount}
              />
            </div>
          )}

          {parsedAmount && parsedType === 'bolt11Invoice' && (
            <div className="text-center py-2">
              <p className="text-2xl font-bold">{parsedAmount.toLocaleString()} sats</p>
              <p className="text-sm text-muted-foreground">Invoice amount</p>
            </div>
          )}

          {(parsedType === 'lnurlPay' || parsedType === 'lightningAddress') && (
            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Input
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a message"
              />
            </div>
          )}
          
          {/* On-chain fee selection */}
          {parsedType === 'bitcoinAddress' && onchainFeeQuote && (
            <div className="space-y-3">
              <Label>Confirmation Speed</Label>
              <RadioGroup
                value={confirmationSpeed}
                onValueChange={(value) => setConfirmationSpeed(value as OnchainConfirmationSpeed)}
                className="grid grid-cols-3 gap-2"
              >
                <div className="relative">
                  <RadioGroupItem
                    value="fast"
                    id="speed-fast"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="speed-fast"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-primary/10 peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="text-xs font-medium">Fast</span>
                    <span className="text-xs text-muted-foreground">~10 min</span>
                    <span className="text-xs font-semibold">
                      {(onchainFeeQuote.speedFast.userFeeSat + onchainFeeQuote.speedFast.l1BroadcastFeeSat).toLocaleString()} sats
                    </span>
                  </Label>
                </div>
                
                <div className="relative">
                  <RadioGroupItem
                    value="medium"
                    id="speed-medium"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="speed-medium"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-primary/10 peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="text-xs font-medium">Medium</span>
                    <span className="text-xs text-muted-foreground">~30 min</span>
                    <span className="text-xs font-semibold">
                      {(onchainFeeQuote.speedMedium.userFeeSat + onchainFeeQuote.speedMedium.l1BroadcastFeeSat).toLocaleString()} sats
                    </span>
                  </Label>
                </div>
                
                <div className="relative">
                  <RadioGroupItem
                    value="slow"
                    id="speed-slow"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="speed-slow"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-primary/10 peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="text-xs font-medium">Slow</span>
                    <span className="text-xs text-muted-foreground">~1 hour</span>
                    <span className="text-xs font-semibold">
                      {(onchainFeeQuote.speedSlow.userFeeSat + onchainFeeQuote.speedSlow.l1BroadcastFeeSat).toLocaleString()} sats
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                <span className="font-medium">Network fee:</span>{' '}
                {getSelectedFee().toLocaleString()} sats
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSend}
            disabled={
              isSending ||
              isParsing ||
              !parsedType ||
              parsedType === 'unknown' ||
              (needsAmount && (!amount || parseInt(amount) <= 0)) ||
              (parsedType === 'bitcoinAddress' && !onchainFeeQuote)
            }
            className="w-full"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                {parsedType === 'bitcoinAddress' ? (
                  <Bitcoin className="h-4 w-4 mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {parsedType === 'bitcoinAddress' ? 'Send On-Chain' : 'Send Payment'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {onClose && (
        <Button variant="ghost" onClick={onClose} className="w-full">
          Cancel
        </Button>
      )}
    </div>
  );
}
