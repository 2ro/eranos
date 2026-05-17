import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import { createZapInvoice } from '@/lib/createZapInvoice';
import { breezService } from '@/lib/spark/breezService';
import type { ParsedCommunity } from '@/lib/communityUtils';

export interface CommunityBatchZapRecipient {
  pubkey: string;
  authorEvent: NostrEvent;
}

export interface CommunityBatchZapArgs {
  community: ParsedCommunity;
  recipients: CommunityBatchZapRecipient[];
  amountSats: number;
  comment: string;
}

export interface CommunityBatchZapFailure {
  pubkey: string;
  reason: string;
}

export interface CommunityBatchZapSummary {
  attempted: number;
  succeeded: number;
  failed: CommunityBatchZapFailure[];
  totalSats: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Send real NIP-57 profile zaps to a selected set of community members. */
export function useCommunityBatchZaps() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const sparkWallet = useSparkWallet();

  async function zapCommunity({
    community,
    recipients,
    amountSats,
    comment,
  }: CommunityBatchZapArgs): Promise<CommunityBatchZapSummary> {
    if (!user) throw new Error('You must be logged in to zap a community.');
    if (!user.signer) throw new Error('No signer available.');
    if (!sparkWallet.isEnabled || !sparkWallet.isInitialized) {
      throw new Error('Your Agora Wallet is not ready.');
    }
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      throw new Error('Enter a valid amount.');
    }
    if (recipients.length === 0) {
      throw new Error('No selected members can receive zaps.');
    }

    const failed: CommunityBatchZapFailure[] = [];
    let succeeded = 0;

    for (const recipient of recipients) {
      try {
        const invoice = await createZapInvoice({
          recipientEvent: recipient.authorEvent,
          recipientPubkey: recipient.pubkey,
          amountSats,
          comment,
          relays: config.relayMetadata.relays.map((relay) => relay.url),
          signer: user.signer,
          extraTags: [
            ['A', community.aTag],
            ['K', '34550'],
          ],
        });
        await breezService.sendPayment(invoice);
        succeeded++;
      } catch (error) {
        console.error('Community batch zap failed for recipient', recipient.pubkey, error);
        failed.push({ pubkey: recipient.pubkey, reason: errorMessage(error) });
      }
    }

    await Promise.allSettled([
      sparkWallet.refreshBalance(),
      sparkWallet.refreshPayments(),
    ]);

    return {
      attempted: recipients.length,
      succeeded,
      failed,
      totalSats: succeeded * amountSats,
    };
  }

  return { zapCommunity };
}
