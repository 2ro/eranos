/**
 * Payment History Component
 * Displays list of recent payments
 */

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock, Loader2, Zap, User } from "lucide-react";
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useEnrichedPayment } from "@/hooks/usePaymentContext";
import { PaymentDetailDialog } from '@/components/SparkWallet/PaymentDetailDialog';
import { getDisplayName } from "@/lib/genUserName";
import { cn } from "@/lib/utils";
import type { BreezPaymentInfo } from "@/lib/spark/breezService";

interface PaymentHistoryProps {
  limit?: number;
  className?: string;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function PaymentItem({ payment, onClick }: { payment: BreezPaymentInfo; onClick: () => void }) {
  const isReceived = payment.paymentType === "receive";
  const amount = Number(payment.amount);
  const timestamp = Number(payment.timestamp);
  const { context, author } = useEnrichedPayment(payment);

  const isZap = context?.isZap && !isReceived;
  const targetEvent = context?.targetEvent;
  const targetProfile = context?.targetProfile;
  const zapRequest = context?.zapRequest;
  const metadata = author?.metadata;

  // Determine zap type based on target
  let zapType = "Zapped";
  let targetLink: string | undefined;
  let targetLabel: string | undefined;

  if (isZap) {
    // Determine type by event kind or lack thereof
    if (targetEvent) {
      if (targetEvent.kind === 1111) {
        // Check if this is a challenge submission (has k:36639 tag)
        const isSubmission = targetEvent.tags.some(
          ([name, value]) => name === 'k' && value === '36639'
        );
        zapType = isSubmission ? "Zapped submission" : "Zapped post";
      } else if (targetEvent.kind === 1) {
        zapType = "Zapped post";
      } else if (targetEvent.kind === 30023) {
        zapType = "Zapped article";
      } else {
        zapType = "Zapped event";
      }
      
      // Link to the event
      const noteId = nip19.noteEncode(targetEvent.id);
      targetLink = `/${noteId}`;
      targetLabel = getDisplayName(metadata, targetEvent.pubkey);
    } else if (targetProfile) {
      // Profile zap (no event)
      zapType = "Zapped profile";
      const npub = nip19.npubEncode(targetProfile);
      targetLink = `/${npub}`;
      targetLabel = getDisplayName(metadata, targetProfile);
    } else if (zapRequest) {
      // We have zap request but no target event loaded yet
      // Try to determine type from 'k' tag in zap request
      const kindTag = zapRequest.tags.find(([name]) => name === 'k')?.[1];
      const hasEventTarget = zapRequest.tags.some(([name]) => name === 'e' || name === 'a');
      
      if (kindTag) {
        const kind = parseInt(kindTag);
        if (kind === 1111) {
          // Check if parent is a challenge (k:36639 tag)
          const isSubmission = kindTag === '36639';
          zapType = isSubmission ? "Zapped submission" : "Zapped post";
        } else if (kind === 1) {
          zapType = "Zapped post";
        } else if (kind === 30023) {
          zapType = "Zapped article";
        } else if (kind >= 30000 && kind < 40000) {
          zapType = "Zapped event";
        } else {
          zapType = "Zapped post";
        }
      } else if (!hasEventTarget) {
        zapType = "Zapped profile";
      }
    }
  }

  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            isReceived
              ? "bg-primary/10 text-primary"
              : "bg-red-100 text-red-600",
          )}
        >
          {isReceived ? (
            <ArrowDownLeft className="h-4 w-4" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">
              {isReceived ? "Received" : isZap ? zapType : "Sent"}
            </p>
            {isZap && <Zap className="h-3 w-3 text-yellow-500" />}
          </div>
          
          {/* Show author/target info for zaps */}
          {isZap && targetLink && (
            <Link 
              to={targetLink}
              className="flex items-center gap-1.5 mt-1 hover:underline max-w-full"
            >
              {metadata?.picture ? (
                <Avatar className="h-4 w-4">
                  <AvatarImage src={metadata.picture} />
                  <AvatarFallback>
                    <User className="h-2 w-2" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground truncate">
                {targetLabel}
              </span>
            </Link>
          )}
          
          {/* Fallback: show timestamp if not a zap or still loading */}
          {(!isZap || !targetLink) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" />
              {formatDate(timestamp)}
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <p
          className={cn(
            "font-medium",
            isReceived ? "text-primary" : "text-red-600",
          )}
        >
          {isReceived ? "+" : "-"}
          {amount.toLocaleString()} sats
        </p>
        {payment.status && payment.status !== 'completed' && (
          <p className="text-xs text-muted-foreground capitalize">
            {payment.status}
          </p>
        )}
      </div>
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 border-b">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div>
          <Skeleton className="h-4 w-20 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="text-right">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
    </div>
  );
}

export function PaymentHistory({ limit, className }: PaymentHistoryProps) {
  const {
    payments,
    isLoadingPayments,
    hasMorePayments,
    loadMorePayments,
    refreshPayments,
    isInitialized,
  } = useSparkWallet();

  const [selectedPayment, setSelectedPayment] = useState<BreezPaymentInfo | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handlePaymentClick = (payment: BreezPaymentInfo) => {
    setSelectedPayment(payment);
    setDetailDialogOpen(true);
  };

  // If limit is specified, only show that many; otherwise show all loaded payments
  const displayPayments = limit ? payments.slice(0, limit) : payments;

  if (!isInitialized) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Connect wallet to view history
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
            {!limit && displayPayments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {displayPayments.length} payments
              </p>
            )}
          </div>
          <button
            onClick={() => refreshPayments()}
            disabled={isLoadingPayments}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLoadingPayments ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingPayments && payments.length === 0 ? (
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <PaymentSkeleton key={i} />
            ))}
          </div>
        ) : displayPayments.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground text-sm">No payments yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your transaction history will appear here
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {displayPayments.map((payment) => (
                <PaymentItem 
                  key={payment.id} 
                  payment={payment}
                  onClick={() => handlePaymentClick(payment)}
                />
              ))}
            </div>
            {/* Load More button - only show when not limiting and there are more payments */}
            {!limit && hasMorePayments && (
              <Button
                variant="ghost"
                onClick={loadMorePayments}
                disabled={isLoadingPayments}
                className="w-full mt-3 text-sm"
              >
                {isLoadingPayments ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>

      {/* Payment Detail Dialog */}
      <PaymentDetailDialog
        payment={selectedPayment}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </Card>
  );
}
