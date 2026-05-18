import { useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { isSignerCapabilityError, reportSignerUnsupported, useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  BITCOIN_DUST_LIMIT,
  broadcastTransaction,
  buildUnsignedMultiOutputPsbt,
  fetchUTXOs,
  finalizePsbt,
  getFeeRates,
  nostrPubkeyToBitcoinAddress,
} from '@/lib/bitcoin';
import type { FeeRates } from '@/lib/bitcoin';
import { CAMPAIGN_KIND, minDonationForSplit, type ParsedCampaign, splitDonation } from '@/lib/campaign';

/** Supported on-chain fee speeds (mirrors {@link SendBitcoinDialog}). */
export type DonationFeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

export interface DonateCampaignArgs {
  campaign: ParsedCampaign;
  /** Total donation amount in satoshis. Split across recipients per the campaign weights. */
  amountSats: number;
  /** Optional public comment included in each kind 8333 receipt. */
  comment?: string;
  /** Fee speed for the on-chain tx. Default: `halfHour`. */
  feeSpeed?: DonationFeeSpeed;
}

export interface DonateCampaignPublishFailure {
  pubkey: string;
  reason: string;
}

export interface DonateCampaignResult {
  /** The broadcast Bitcoin txid. */
  txid: string;
  /** On-chain fee paid in satoshis. */
  fee: number;
  /** Number of recipients that received funds in the tx. */
  recipientCount: number;
  /** Total sent to recipients (donation amount; excludes fee). */
  totalSats: number;
  /** kind 8333 receipts that successfully published. */
  publishedReceipts: number;
  /** kind 8333 receipts that failed to publish (the on-chain tx is still final). */
  publishFailed: DonateCampaignPublishFailure[];
}

function feeRateForSpeed(rates: FeeRates, speed: DonationFeeSpeed): number {
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

/**
 * Mutation hook that sends a single multi-output Bitcoin transaction to all
 * of a campaign's recipients (split per their weights), broadcasts it via
 * mempool.space, and then publishes one kind 8333 onchain-zap receipt per
 * recipient referencing the campaign's addressable coordinate.
 *
 * Returns an async function that throws on any pre-broadcast failure
 * (insufficient funds, signer not available, dust, etc.). Once the tx is
 * broadcast, the function always resolves: kind 8333 publish failures are
 * reported in {@link DonateCampaignResult.publishFailed} rather than thrown,
 * because the donation itself is already final on-chain.
 */
export function useDonateCampaign() {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;

  async function donateToCampaign({
    campaign,
    amountSats,
    comment = '',
    feeSpeed = 'halfHour',
  }: DonateCampaignArgs): Promise<DonateCampaignResult> {
    if (!user) throw new Error('You must be logged in to donate.');
    if (!canSignPsbt || !signPsbt) {
      throw new Error("Your login doesn't support sending Bitcoin.");
    }
    if (!Number.isFinite(amountSats) || !Number.isInteger(amountSats) || amountSats <= 0) {
      throw new Error('Enter a valid donation amount in satoshis.');
    }

    // Split the donation across the campaign's payable recipients.
    const splits = splitDonation(campaign.recipients, amountSats, user.pubkey);

    // Dust guard: every output must clear the BIP-141 dust limit for P2TR.
    const tooSmall = splits.find((s) => s.amountSats < BITCOIN_DUST_LIMIT);
    if (tooSmall) {
      const min = minDonationForSplit(campaign.recipients, user.pubkey, BITCOIN_DUST_LIMIT);
      throw new Error(
        `Donation is too small to split: each recipient would get less than the dust limit (${BITCOIN_DUST_LIMIT} sats). Minimum: ${min.toLocaleString()} sats.`,
      );
    }

    // Build the multi-output PSBT.
    const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
    if (!senderAddress) throw new Error('Failed to derive your Bitcoin address.');

    const outputs = splits.map((s) => {
      const address = nostrPubkeyToBitcoinAddress(s.pubkey);
      if (!address) {
        throw new Error(`Failed to derive Bitcoin address for ${s.pubkey.slice(0, 8)}…`);
      }
      return { address, amountSats: s.amountSats };
    });

    const [utxos, rates] = await Promise.all([fetchUTXOs(senderAddress, esploraBaseUrl), getFeeRates(esploraBaseUrl)]);
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

    // Publish one kind 8333 receipt per recipient. The on-chain tx is already
    // final at this point; we record per-recipient publish failures rather
    // than throwing so the donor sees a successful result even if one relay
    // hiccups.
    const publishFailed: DonateCampaignPublishFailure[] = [];
    let publishedReceipts = 0;
    for (const split of splits) {
      try {
        await publishEvent({
          kind: 8333,
          content: comment,
          tags: [
            ['i', `bitcoin:tx:${txid}`],
            ['p', split.pubkey],
            ['amount', String(split.amountSats)],
            ['a', campaign.aTag],
            ['K', String(CAMPAIGN_KIND)],
            [
              'alt',
              `Donation to ${campaign.title}: ${split.amountSats.toLocaleString()} sats`,
            ],
          ],
        });
        publishedReceipts++;
      } catch (error) {
        publishFailed.push({ pubkey: split.pubkey, reason: errorMessage(error) });
      }
    }

    // Invalidate caches that depend on UTXOs or donation totals.
    queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
    queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
    queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });
    queryClient.invalidateQueries({ queryKey: ['onchain-zaps'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-donations', campaign.aTag] });

    return {
      txid,
      fee,
      recipientCount: splits.length,
      totalSats: splits.reduce((sum, s) => sum + s.amountSats, 0),
      publishedReceipts,
      publishFailed,
    };
  }

  return { donateToCampaign };
}
