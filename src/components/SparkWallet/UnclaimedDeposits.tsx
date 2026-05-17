/**
 * Unclaimed Deposits Component
 * Displays on-chain deposits that need manual claiming
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, Bitcoin, Loader2, RefreshCw, ArrowRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import { cn } from '@/lib/utils';
import type { UnclaimedDepositInfo, RecommendedFeesInfo } from '@/lib/spark/breezService';

interface UnclaimedDepositsProps {
  className?: string;
}

interface ClaimDialogState {
  isOpen: boolean;
  deposit: UnclaimedDepositInfo | null;
  recommendedFees: RecommendedFeesInfo | null;
  isLoading: boolean;
  isClaiming: boolean;
}

interface RefundDialogState {
  isOpen: boolean;
  deposit: UnclaimedDepositInfo | null;
  destinationAddress: string;
  isRefunding: boolean;
}

function DepositItem({ 
  deposit, 
  onClaim, 
  onRefund 
}: { 
  deposit: UnclaimedDepositInfo; 
  onClaim: () => void;
  onRefund: () => void;
}) {
  const shortTxid = `${deposit.txid.slice(0, 8)}...${deposit.txid.slice(-8)}`;
  
  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Bitcoin className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="font-medium">
              {deposit.amountSats.toLocaleString()} sats
            </p>
            <a 
              href={`https://mempool.space/tx/${deposit.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              {shortTxid}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <Badge variant="outline" className="text-orange-600 border-orange-300">
          Pending
        </Badge>
      </div>

      {deposit.claimError && (
        <Alert variant="default" className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm">
            {deposit.claimError.type === 'maxDepositClaimFeeExceeded' && (
              <>
                Auto-claim failed: network fee ({deposit.claimError.requiredFeeRateSatPerVbyte} sat/vB) 
                exceeds wallet limit. Manual approval required.
              </>
            )}
            {deposit.claimError.type === 'missingUtxo' && (
              <>UTXO not found. The deposit may still be confirming.</>
            )}
            {deposit.claimError.type === 'generic' && (
              <>{deposit.claimError.message || 'An error occurred while claiming.'}</>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button 
          onClick={onClaim} 
          className="flex-1"
          size="sm"
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          Claim Now
        </Button>
        <Button 
          onClick={onRefund} 
          variant="outline"
          size="sm"
        >
          Refund
        </Button>
      </div>
    </div>
  );
}

export function UnclaimedDeposits({ className }: UnclaimedDepositsProps) {
  const { 
    unclaimedDeposits, 
    isLoadingDeposits, 
    refreshUnclaimedDeposits,
    getRecommendedFees,
    claimDeposit,
    refundDeposit,
    isInitialized,
  } = useSparkWallet();

  const [claimDialog, setClaimDialog] = useState<ClaimDialogState>({
    isOpen: false,
    deposit: null,
    recommendedFees: null,
    isLoading: false,
    isClaiming: false,
  });

  const [refundDialog, setRefundDialog] = useState<RefundDialogState>({
    isOpen: false,
    deposit: null,
    destinationAddress: '',
    isRefunding: false,
  });

  // Refresh unclaimed deposits when wallet initializes
  useEffect(() => {
    if (isInitialized) {
      refreshUnclaimedDeposits();
    }
  }, [isInitialized, refreshUnclaimedDeposits]);

  const handleOpenClaimDialog = async (deposit: UnclaimedDepositInfo) => {
    setClaimDialog({
      isOpen: true,
      deposit,
      recommendedFees: null,
      isLoading: true,
      isClaiming: false,
    });

    try {
      const fees = await getRecommendedFees();
      setClaimDialog(prev => ({
        ...prev,
        recommendedFees: fees,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to get recommended fees:', error);
      setClaimDialog(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  };

  const handleClaim = async (useNetworkFee: boolean = false) => {
    if (!claimDialog.deposit) return;

    setClaimDialog(prev => ({ ...prev, isClaiming: true }));

    try {
      if (useNetworkFee) {
        await claimDeposit(
          claimDialog.deposit.txid,
          claimDialog.deposit.vout,
          claimDialog.deposit.claimError?.requiredFeeSats || 0
        );
      } else {
        // Use the required fee from the error
        const requiredFee = claimDialog.deposit.claimError?.requiredFeeSats || 0;
        await claimDeposit(
          claimDialog.deposit.txid,
          claimDialog.deposit.vout,
          requiredFee
        );
      }
      
      setClaimDialog({
        isOpen: false,
        deposit: null,
        recommendedFees: null,
        isLoading: false,
        isClaiming: false,
      });
    } catch (error) {
      console.error('Failed to claim deposit:', error);
      setClaimDialog(prev => ({ ...prev, isClaiming: false }));
    }
  };

  const handleOpenRefundDialog = (deposit: UnclaimedDepositInfo) => {
    setRefundDialog({
      isOpen: true,
      deposit,
      destinationAddress: '',
      isRefunding: false,
    });
  };

  const handleRefund = async () => {
    if (!refundDialog.deposit || !refundDialog.destinationAddress) return;

    setRefundDialog(prev => ({ ...prev, isRefunding: true }));

    try {
      // Use economy fee rate for refunds
      const fees = await getRecommendedFees();
      await refundDeposit(
        refundDialog.deposit.txid,
        refundDialog.deposit.vout,
        refundDialog.destinationAddress,
        fees.economyFee
      );
      
      setRefundDialog({
        isOpen: false,
        deposit: null,
        destinationAddress: '',
        isRefunding: false,
      });
    } catch (error) {
      console.error('Failed to refund deposit:', error);
      setRefundDialog(prev => ({ ...prev, isRefunding: false }));
    }
  };

  // Avoid inserting/removing a loading card below the balance during routine
  // background syncs. Only render this section when there is something useful
  // for the user to act on.
  if (!isInitialized || unclaimedDeposits.length === 0) {
    return null;
  }

  return (
    <>
      <Card className={cn('border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20', className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-lg">Pending Deposits</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshUnclaimedDeposits()}
              disabled={isLoadingDeposits}
            >
              {isLoadingDeposits ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <CardDescription>
            These on-chain deposits need manual approval to claim
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unclaimedDeposits.map((deposit) => (
            <DepositItem 
              key={`${deposit.txid}:${deposit.vout}`} 
              deposit={deposit}
              onClaim={() => handleOpenClaimDialog(deposit)}
              onRefund={() => handleOpenRefundDialog(deposit)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Claim Dialog */}
      <Dialog 
        open={claimDialog.isOpen} 
        onOpenChange={(open) => !open && setClaimDialog(prev => ({ ...prev, isOpen: false }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim On-Chain Deposit</DialogTitle>
            <DialogDescription>
              Approve the network fee to claim this deposit to your Lightning balance.
            </DialogDescription>
          </DialogHeader>

          {claimDialog.deposit && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">{claimDialog.deposit.amountSats.toLocaleString()} sats</span>
                </div>
                {claimDialog.deposit.claimError?.requiredFeeSats && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Required Fee</span>
                    <span className="font-medium text-orange-600">
                      {claimDialog.deposit.claimError.requiredFeeSats.toLocaleString()} sats
                    </span>
                  </div>
                )}
                {claimDialog.deposit.claimError?.requiredFeeRateSatPerVbyte && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee Rate</span>
                    <span className="text-muted-foreground">
                      {claimDialog.deposit.claimError.requiredFeeRateSatPerVbyte} sat/vB
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">You'll Receive</span>
                  <span className="font-medium text-primary">
                    ~{(claimDialog.deposit.amountSats - (claimDialog.deposit.claimError?.requiredFeeSats || 0)).toLocaleString()} sats
                  </span>
                </div>
              </div>

              {claimDialog.isLoading ? (
                <div className="py-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">Loading fee estimates...</p>
                </div>
              ) : claimDialog.recommendedFees && (
                <div className="text-sm text-muted-foreground">
                  <p>Current network fees:</p>
                  <ul className="mt-1 space-y-1">
                    <li>Fastest: {claimDialog.recommendedFees.fastestFee} sat/vB</li>
                    <li>Normal: {claimDialog.recommendedFees.halfHourFee} sat/vB</li>
                    <li>Economy: {claimDialog.recommendedFees.economyFee} sat/vB</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClaimDialog(prev => ({ ...prev, isOpen: false }))}
              disabled={claimDialog.isClaiming}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleClaim(false)}
              disabled={claimDialog.isClaiming || claimDialog.isLoading}
            >
              {claimDialog.isClaiming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Claiming...
                </>
              ) : (
                'Approve & Claim'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog 
        open={refundDialog.isOpen} 
        onOpenChange={(open) => !open && setRefundDialog(prev => ({ ...prev, isOpen: false }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Deposit</DialogTitle>
            <DialogDescription>
              Send this deposit back to a Bitcoin address. Network fees will be deducted.
            </DialogDescription>
          </DialogHeader>

          {refundDialog.deposit && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">{refundDialog.deposit.amountSats.toLocaleString()} sats</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destination Address</Label>
                <Input
                  id="destination"
                  placeholder="bc1q..."
                  value={refundDialog.destinationAddress}
                  onChange={(e) => setRefundDialog(prev => ({ 
                    ...prev, 
                    destinationAddress: e.target.value 
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Enter a Bitcoin address to receive the refund
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundDialog(prev => ({ ...prev, isOpen: false }))}
              disabled={refundDialog.isRefunding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRefund}
              disabled={refundDialog.isRefunding || !refundDialog.destinationAddress}
              variant="destructive"
            >
              {refundDialog.isRefunding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Refunding...
                </>
              ) : (
                'Refund'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
