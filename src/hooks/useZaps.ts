import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useNWC } from '@/hooks/useNWCContext';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import type { NWCConnection } from '@/hooks/useNWC';
import type { Event } from 'nostr-tools';
import type { WebLNProvider } from '@webbtc/webln-types';
import { useQueryClient } from '@tanstack/react-query';
import { notificationSuccess } from '@/lib/haptics';
import { parseGoalEvent } from '@/lib/goalUtils';
import { createZapInvoice } from '@/lib/createZapInvoice';
import { breezService } from '@/lib/spark/breezService';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Hook for sending zaps to an event author.
 * Stats (zap count, total sats) come from NIP-85 via useEventStats — this hook
 * only handles the payment flow.
 */
export function useZaps(
  target: Event,
  webln: WebLNProvider | null,
  _nwcConnection: NWCConnection | null,
  onZapSuccess?: (result: { amountSats: number }) => void
) {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const author = useAuthor(target?.pubkey);
  const { sendPayment, getActiveConnection } = useNWC();
  const sparkWallet = useSparkWallet();
  const [isZapping, setIsZapping] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);

  // Cleanup state when component unmounts
  useEffect(() => {
    return () => {
      setIsZapping(false);
      setInvoice(null);
    };
  }, []);

  const zap = async (amount: number, comment: string) => {
    if (amount <= 0) {
      return;
    }

    setIsZapping(true);
    setInvoice(null); // Clear any previous invoice at the start

    if (!user) {
      toast({
        title: 'Login required',
        description: 'You must be logged in to send a zap.',
        variant: 'destructive',
      });
      setIsZapping(false);
      return;
    }

    if (!target) {
      toast({
        title: 'Event not found',
        description: 'Could not find the event to zap.',
        variant: 'destructive',
      });
      setIsZapping(false);
      return;
    }

    try {
      if (!author.data || !author.data?.metadata || !author.data?.event ) {
        toast({
          title: 'Author not found',
          description: 'Could not find the author of this item.',
          variant: 'destructive',
        });
        setIsZapping(false);
        return;
      }

      const { lud06, lud16 } = author.data.metadata;
      if (!lud06 && !lud16) {
        toast({
          title: 'Lightning address not found',
          description: 'The author does not have a lightning address configured.',
          variant: 'destructive',
        });
        setIsZapping(false);
        return;
      }

      const goalRelays = target.kind === 9041
        ? parseGoalEvent(target as unknown as NostrEvent)?.relays
        : undefined;

      if (!user.signer) {
        throw new Error('No signer available');
      }

      try {
        const newInvoice = await createZapInvoice({
          recipientEvent: author.data.event,
          recipientPubkey: target.pubkey,
          target,
          amountSats: amount,
          comment,
          relays: goalRelays && goalRelays.length > 0
            ? goalRelays
            : config.relayMetadata.relays.map(r => r.url),
          signer: user.signer,
        });

        // Get the current active NWC connection dynamically
        const currentNWCConnection = getActiveConnection();

        // Try self-custodial Agora Wallet first if it is ready and funded.
        if (sparkWallet.isEnabled && sparkWallet.isInitialized && sparkWallet.balance >= amount) {
          try {
            await breezService.sendPayment(newInvoice);
            await Promise.allSettled([
              sparkWallet.refreshBalance(),
              sparkWallet.refreshPayments(),
            ]);

            setIsZapping(false);
            setInvoice(null);
            notificationSuccess();

            queryClient.setQueryData(['user-zap', target.id], true);
            queryClient.invalidateQueries({ queryKey: ['zaps'] });
            if (target.kind === 9041) {
              queryClient.invalidateQueries({ queryKey: ['goal-progress', target.id] });
            }

            if (onZapSuccess) {
              onZapSuccess({ amountSats: amount });
            } else {
              toast({
                title: 'Zap successful!',
                description: `You sent ${amount} sats from your Agora Wallet.`,
              });
            }
            return;
          } catch (sparkError) {
            console.error('Agora Wallet payment failed, falling back:', sparkError);
            const errorMessage = sparkError instanceof Error ? sparkError.message : 'Unknown wallet error';
            toast({
              title: 'Wallet payment failed',
              description: `${errorMessage}. Falling back to other payment methods...`,
              variant: 'destructive',
            });
          }
        }

        // Try NWC next if available and properly connected
        if (currentNWCConnection && currentNWCConnection.connectionString && currentNWCConnection.isConnected) {
          try {
            await sendPayment(currentNWCConnection, newInvoice);

            // Clear states immediately on success
            setIsZapping(false);
            setInvoice(null);
            notificationSuccess();

            // Optimistically mark this event as zapped-by-me so the bolt
            // icon fills instantly — relay echo of the 9735 receipt may lag.
            queryClient.setQueryData(['user-zap', target.id], true);

            // Invalidate zap queries to refresh counts
            queryClient.invalidateQueries({ queryKey: ['zaps'] });
            if (target.kind === 9041) {
              queryClient.invalidateQueries({ queryKey: ['goal-progress', target.id] });
            }

            if (onZapSuccess) {
              // Consumer (e.g. ZapDialog) owns the success UI — skip the
              // toast so we don't double up with their celebration screen.
              onZapSuccess({ amountSats: amount });
            } else {
              toast({
                title: 'Zap successful!',
                description: `You sent ${amount} sats via NWC to the author.`,
              });
            }
            return;
          } catch (nwcError) {
            console.error('NWC payment failed, falling back:', nwcError);

            // Show specific NWC error to user for debugging
            const errorMessage = nwcError instanceof Error ? nwcError.message : 'Unknown NWC error';
            toast({
              title: 'NWC payment failed',
              description: `${errorMessage}. Falling back to other payment methods...`,
              variant: 'destructive',
            });
          }
        }

        if (webln) { // Try WebLN next
          try {
            // For native WebLN, we may need to enable it first
            let webLnProvider = webln;
            if (webln.enable && typeof webln.enable === 'function') {
              const enabledProvider = await webln.enable();
              // Some implementations return the provider, others return void
              // Cast to WebLNProvider to handle both cases
              const provider = enabledProvider as WebLNProvider | undefined;
              if (provider) {
                webLnProvider = provider;
              }
            }

            await webLnProvider.sendPayment(newInvoice);

            // Clear states immediately on success
            setIsZapping(false);
            setInvoice(null);
            notificationSuccess();

            // Optimistically mark this event as zapped-by-me so the bolt
            // icon fills instantly — relay echo of the 9735 receipt may lag.
            queryClient.setQueryData(['user-zap', target.id], true);

            // Invalidate zap queries to refresh counts
            queryClient.invalidateQueries({ queryKey: ['zaps'] });
            if (target.kind === 9041) {
              queryClient.invalidateQueries({ queryKey: ['goal-progress', target.id] });
            }

            if (onZapSuccess) {
              onZapSuccess({ amountSats: amount });
            } else {
              toast({
                title: 'Zap successful!',
                description: `You sent ${amount} sats to the author.`,
              });
            }
          } catch (weblnError) {
            console.error('WebLN payment failed, falling back:', weblnError);

            // Show specific WebLN error to user for debugging
            const errorMessage = weblnError instanceof Error ? weblnError.message : 'Unknown WebLN error';
            toast({
              title: 'WebLN payment failed',
              description: `${errorMessage}. Falling back to other payment methods...`,
              variant: 'destructive',
            });

            setInvoice(newInvoice);
            setIsZapping(false);
          }
        } else { // Default - show QR code and manual Lightning URI
          setInvoice(newInvoice);
          setIsZapping(false);
        }
      } catch (err) {
        console.error('Zap error:', err);
        toast({
          title: 'Zap failed',
          description: (err as Error).message,
          variant: 'destructive',
        });
        setIsZapping(false);
      }
    } catch (err) {
      console.error('Zap error:', err);
      toast({
        title: 'Zap failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
      setIsZapping(false);
    }
  };

  const resetInvoice = useCallback(() => {
    setInvoice(null);
  }, []);

  return {
    zap,
    isZapping,
    invoice,
    setInvoice,
    resetInvoice,
  };
}
