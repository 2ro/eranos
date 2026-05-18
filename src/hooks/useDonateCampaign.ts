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
import { minDonationForSplit, type ParsedCampaign, splitDonation } from '@/lib/campaign';

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

export interface DonateCampaignResult {
  /** The broadcast Bitcoin txid. */
  txid: string;
  /** On-chain fee paid in satoshis. */
  fee: number;
  /** Number of recipients that received funds in the tx. */
  recipientCount: number;
  /** Total sent to recipients (donation amount; excludes fee). */
  totalSats: number;
  /** Whether the kind 8333 donation receipt published successfully. */
  receiptPublished: boolean;
  /** Reason the receipt failed to publish, if any. The on-chain tx is still final. */
  receiptPublishError?: string;
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
 * mempool.space, and then publishes a single kind 8333 onchain-zap receipt
 * for the transaction referencing the campaign's addressable coordinate and
 * listing every recipient under its own `p` tag.
 *
 * Returns an async function that throws on any pre-broadcast failure
 * (insufficient funds, signer not available, dust, etc.). Once the tx is
 * broadcast, the function always resolves: a kind 8333 publish failure is
 * reported in {@link DonateCampaignResult.receiptPublished} rather than
 * thrown, because the donation itself is already final on-chain.
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

    // Publish a single kind 8333 receipt covering the whole transaction. The
    // event lists every recipient under its own `p` tag; the `amount` tag is
    // the combined total paid to all recipients (i.e. the full donation,
    // excluding the donor's change). Per-recipient amounts are recomputed
    // from the on-chain tx at display time by matching each recipient's
    // derived Taproot address against the tx outputs.
    //
    // The on-chain tx is already final at this point; we record a publish
    // failure rather than throwing so the donor sees a successful result
    // even if the relay hiccups.
    const totalSats = splits.reduce((sum, s) => sum + s.amountSats, 0);
    let receiptPublished = false;
    let receiptPublishError: string | undefined;
    try {
      await publishEvent({
        kind: 8333,
        content: comment,
        tags: [
          ['i', `bitcoin:tx:${txid}`],
          ...splits.map((s) => ['p', s.pubkey]),
          ['amount', String(totalSats)],
          ['a', campaign.aTag],
          ['K', String(campaign.event.kind)],
          [
            'alt',
            splits.length === 1
              ? `Donation to ${campaign.title}: ${totalSats.toLocaleString()} sats`
              : `Donation to ${campaign.title}: ${totalSats.toLocaleString()} sats across ${splits.length} recipients`,
          ],
        ],
      });
      receiptPublished = true;
    } catch (error) {
      receiptPublishError = errorMessage(error);
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
      totalSats,
      receiptPublished,
      receiptPublishError,
    };
  }

  return { donateToCampaign };
}
