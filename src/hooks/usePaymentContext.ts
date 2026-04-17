import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import type { NostrEvent } from '@nostrify/nostrify';
import type { BreezPaymentInfo } from '@/lib/spark/breezService';

export interface PaymentContext {
  zapRequest?: NostrEvent;
  targetEvent?: NostrEvent; // The event that was zapped
  targetProfile?: string; // Pubkey if it was a profile zap
  isZap: boolean;
}

/**
 * Hook to fetch all zap receipts for the current user
 * Cached globally to avoid repeated queries
 */
function useUserZapReceipts() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['user-zap-receipts', user?.pubkey],
    enabled: !!user?.pubkey,
    staleTime: 60000, // 1 minute
    queryFn: async (c) => {
      if (!user?.pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      try {
        // Query for zap receipts where the zapper (in description) is the current user
        // We need to get recent receipts and filter client-side since we can't filter by description
        const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
        
        const receipts = await nostr.query(
          [
            {
              kinds: [9735],
              '#P': [user.pubkey],
              since: oneWeekAgo,
              limit: 500,
            },
          ],
          { signal }
        );

        // Filter to only receipts where the current user was the zapper
        return receipts.filter(receipt => {
          const descriptionTag = receipt.tags.find(([name]) => name === 'description')?.[1];
          if (!descriptionTag) return false;

          try {
            const zapRequest = JSON.parse(descriptionTag);
            return zapRequest.pubkey === user.pubkey;
          } catch {
            return false;
          }
        });
      } catch (error) {
        console.warn('Failed to fetch zap receipts:', error);
        return [];
      }
    },
  });
}

/**
 * Hook to fetch Nostr context for a payment (if it's a zap)
 * Matches payment to zap receipt and extracts target info
 */
export function usePaymentContext(payment: BreezPaymentInfo) {
  const { nostr } = useNostr();
  const receiptsQuery = useUserZapReceipts();
  const zapReceipts = receiptsQuery.data || [];

  return useQuery({
    queryKey: ['payment-context', payment.id, payment.invoice, zapReceipts.length],
    enabled: payment.paymentType === 'send' && !!payment.invoice && zapReceipts.length > 0,
    staleTime: 300000, // 5 minutes
    queryFn: async (c) => {
      if (!payment.invoice || zapReceipts.length === 0) {
        return { isZap: false };
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      try {
        // Find matching zap receipt by bolt11 invoice
        const zapReceipt = zapReceipts.find(receipt => {
          const bolt11 = receipt.tags.find(([name]) => name === 'bolt11')?.[1];
          return bolt11 === payment.invoice;
        });

        if (!zapReceipt) {
          return { isZap: false };
        }

        // Extract zap request from description
        const descriptionTag = zapReceipt.tags.find(([name]) => name === 'description')?.[1];
        let zapRequest: NostrEvent | undefined;

        if (descriptionTag) {
          try {
            zapRequest = JSON.parse(descriptionTag) as NostrEvent;
          } catch (error) {
            console.warn('Failed to parse zap request:', error);
          }
        }

        if (!zapRequest) {
          return { isZap: true, zapRequest: undefined, targetEvent: undefined, targetProfile: undefined };
        }

        // Determine if this is an event zap or profile zap
        // Event zaps have 'e' or 'a' tags in the zap request
        const eventIdTag = zapRequest.tags.find(([name]) => name === 'e')?.[1];
        const addrTag = zapRequest.tags.find(([name]) => name === 'a')?.[1];
        const profileTag = zapRequest.tags.find(([name]) => name === 'p')?.[1];

        let targetEvent: NostrEvent | undefined;
        let targetProfile: string | undefined;

        // Event zap - fetch the event
        if (eventIdTag || addrTag) {
          try {
            if (eventIdTag) {
              // Regular event zap
              const events = await nostr.query(
                [{ ids: [eventIdTag], limit: 1 }],
                { signal }
              );
              targetEvent = events[0];
            } else if (addrTag) {
              // Addressable event zap
              const [kind, pubkey, identifier] = addrTag.split(':');
              const events = await nostr.query(
                [
                  {
                    kinds: [parseInt(kind)],
                    authors: [pubkey],
                    '#d': [identifier || ''],
                    limit: 1,
                  },
                ],
                { signal }
              );
              targetEvent = events[0];
            }
          } catch (error) {
            console.warn('Failed to fetch target event:', error);
          }
        } else if (profileTag) {
          // Profile zap
          targetProfile = profileTag;
        }

        return {
          isZap: true,
          zapRequest,
          targetEvent,
          targetProfile,
        };
      } catch (error) {
        console.warn('Failed to fetch payment context:', error);
        return { isZap: false };
      }
    },
  });
}

/**
 * Hook to get enriched payment data with author information
 */
export function useEnrichedPayment(payment: BreezPaymentInfo | null) {
  // Create dummy payment for hooks when payment is null
  const dummyPayment: BreezPaymentInfo = {
    id: '',
    amount: 0,
    fees: 0,
    paymentType: 'send',
    status: 'completed',
    timestamp: 0,
  };

  const actualPayment = payment || dummyPayment;
  const contextQuery = usePaymentContext(actualPayment);
  const context = contextQuery.data;

  // Get target author (either from target event or profile zap)
  const targetPubkey = context?.targetEvent?.pubkey || context?.targetProfile;
  const authorQuery = useAuthor(targetPubkey);

  return {
    ...contextQuery,
    context,
    author: authorQuery.data,
    isLoadingAuthor: authorQuery.isLoading,
  };
}
