import { useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useBitcoinSigner, isSignerCapabilityError, reportSignerUnsupported } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  broadcastTransaction,
  buildUnsignedMultiOutputPsbt,
  fetchUTXOs,
  finalizePsbt,
  getFeeRates,
  nostrPubkeyToBitcoinAddress,
} from '@/lib/bitcoin';
import type { FeeRates } from '@/lib/bitcoin';
import type { ParsedCommunity } from '@/lib/communityUtils';

export type OnchainFeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

export interface CommunityOnchainZapRecipient {
  pubkey: string;
}

export interface CommunityOnchainZapArgs {
  community: ParsedCommunity;
  recipients: CommunityOnchainZapRecipient[];
  amountSats: number;
  comment: string;
  feeSpeed?: OnchainFeeSpeed;
}

export interface CommunityOnchainZapPublishFailure {
  pubkey: string;
  reason: string;
}

export interface CommunityOnchainZapSummary {
  attempted: number;
  published: number;
  publishFailed: CommunityOnchainZapPublishFailure[];
  totalSats: number;
  txid: string;
  fee: number;
}

function feeRateForSpeed(rates: FeeRates, speed: OnchainFeeSpeed): number {
  return {
    fastest: rates.fastestFee,
    halfHour: rates.halfHourFee,
    hour: rates.hourFee,
    economy: rates.economyFee,
  }[speed];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useCommunityOnchainZaps() {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;

  async function zapCommunityOnchain({
    community,
    recipients,
    amountSats,
    comment,
    feeSpeed = 'halfHour',
  }: CommunityOnchainZapArgs): Promise<CommunityOnchainZapSummary> {
    if (!user) throw new Error('You must be logged in to zap a community.');
    if (!canSignPsbt || !signPsbt) {
      throw new Error("Your login doesn't support sending Bitcoin.");
    }
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      throw new Error('Enter a valid amount.');
    }

    const payableRecipients = recipients.filter((recipient) => recipient.pubkey !== user.pubkey);
    if (payableRecipients.length === 0) {
      throw new Error('No selected members can receive Bitcoin zaps.');
    }

    const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
    if (!senderAddress) throw new Error('Failed to derive your Bitcoin address.');

    const outputs = payableRecipients.map((recipient) => {
      const address = nostrPubkeyToBitcoinAddress(recipient.pubkey);
      if (!address) throw new Error(`Failed to derive Bitcoin address for ${recipient.pubkey.slice(0, 8)}...`);
      return { address, amountSats };
    });

    const [utxos, rates] = await Promise.all([
      fetchUTXOs(senderAddress, esploraBaseUrl),
      getFeeRates(esploraBaseUrl),
    ]);
    if (utxos.length === 0) {
      throw new Error('Your Bitcoin wallet has no spendable funds.');
    }

    let signedHex: string;
    let fee: number;
    try {
      const unsigned = buildUnsignedMultiOutputPsbt(
        user.pubkey,
        outputs,
        utxos,
        feeRateForSpeed(rates, feeSpeed),
      );
      fee = unsigned.fee;
      signedHex = await signPsbt(unsigned.psbtHex);
    } catch (error) {
      if (isSignerCapabilityError(error)) {
        reportSignerUnsupported(user.pubkey);
      }
      throw error;
    }

    const txHex = finalizePsbt(signedHex);
    const txid = await broadcastTransaction(txHex, esploraBaseUrl);
    const publishFailed: CommunityOnchainZapPublishFailure[] = [];
    let published = 0;

    for (const recipient of payableRecipients) {
      try {
        await publishEvent({
          kind: 8333,
          content: comment,
          tags: [
            ['i', `bitcoin:tx:${txid}`],
            ['p', recipient.pubkey],
            ['amount', String(amountSats)],
            ['a', community.aTag],
            ['K', '34550'],
            ['alt', `Bitcoin zap: ${amountSats.toLocaleString()} sats`],
          ],
        });
        published++;
      } catch (error) {
        publishFailed.push({ pubkey: recipient.pubkey, reason: errorMessage(error) });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
    queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
    queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });
    queryClient.invalidateQueries({ queryKey: ['onchain-zaps'] });
    queryClient.invalidateQueries({ queryKey: ['event-interactions'] });

    return {
      attempted: payableRecipients.length,
      published,
      publishFailed,
      totalSats: payableRecipients.length * amountSats,
      txid,
      fee,
    };
  }

  return { zapCommunityOnchain };
}
