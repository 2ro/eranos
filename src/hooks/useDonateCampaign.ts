import { useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { isSignerCapabilityError, reportSignerUnsupported, useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  broadcastTransaction,
  buildUnsignedPsbt,
  fetchUTXOs,
  finalizePsbt,
  getFeeRates,
  nostrPubkeyToBitcoinAddress,
} from '@/lib/bitcoin';
import type { FeeRates } from '@/lib/bitcoin';
import { CAMPAIGN_KIND, type ParsedCampaign } from '@/lib/campaign';
import { withAgoraTag } from '@/lib/agoraNoteTags';

/** Supported on-chain fee speeds (mirrors {@link SendBitcoinDialog}). */
export type DonationFeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

export interface DonateCampaignArgs {
  campaign: ParsedCampaign;
  /** Donation amount in satoshis. */
  amountSats: number;
  /** Optional public comment included in the kind 8333 receipt. */
  comment?: string;
  /** Fee speed for the on-chain tx. Default: `halfHour`. */
  feeSpeed?: DonationFeeSpeed;
}

export interface DonateCampaignResult {
  /** The broadcast Bitcoin txid. */
  txid: string;
  /** On-chain fee paid in satoshis. */
  fee: number;
  /** Sats paid to the campaign wallet (excludes fee and donor change). */
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
 * Mutation hook that donates to a campaign by paying its declared wallet
 * endpoint with a single Bitcoin transaction, then publishing a kind 8333
 * donation receipt referencing the campaign's addressable coordinate.
 *
 * The campaign's `w` tag drives the destination:
 *
 * - **on-chain** (`bc1q…` / `bc1p…`) — the donor's client builds a
 *   single-output PSBT paying the campaign address, broadcasts it, then
 *   publishes a kind 8333 receipt with no `p` tags (campaigns are not
 *   Nostr-identity recipients; verification matches tx outputs against
 *   the campaign's `w` address).
 * - **silent payment** (`sp1…`) — this hook refuses the request.
 *   Donating to a silent-payment campaign requires a BIP-352-aware
 *   wallet that derives a fresh one-time output from the SP code; the
 *   in-app Taproot signer does not support that. Donors are directed to
 *   an external wallet via a copy/QR affordance instead, and no Nostr
 *   event is ever published.
 *
 * Throws on any pre-broadcast failure (insufficient funds, signer not
 * available, SP mode, etc.). Once the tx is broadcast, the function
 * always resolves: a kind 8333 publish failure is reported in
 * {@link DonateCampaignResult.receiptPublished} rather than thrown,
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

    if (campaign.wallet.mode === 'sp') {
      throw new Error(
        'This campaign uses silent payments. Donate from an external BIP-352-capable wallet using the QR code.',
      );
    }

    // Donor cannot donate to their own campaign (the tx output would just
    // pay the donor's own wallet — an obvious foot-gun).
    if (campaign.pubkey === user.pubkey) {
      throw new Error('You cannot donate to your own campaign.');
    }

    const senderAddress = nostrPubkeyToBitcoinAddress(user.pubkey);
    if (!senderAddress) throw new Error('Failed to derive your Bitcoin address.');

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
      const unsigned = buildUnsignedPsbt(
        user.pubkey,
        campaign.wallet.value,
        amountSats,
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

    // Publish the kind 8333 receipt. Per NIP.md §Kind 33863 §Donation flow,
    // campaign donation receipts MUST NOT carry `p` tags — the recipient is
    // the campaign's `w` wallet, not a Nostr identity. Viewers verify by
    // matching tx outputs against the campaign's `w` address.
    let receiptPublished = false;
    let receiptPublishError: string | undefined;
    try {
      await publishEvent({
        kind: 8333,
        content: comment,
        tags: withAgoraTag([
          ['i', `bitcoin:tx:${txid}`],
          ['amount', String(amountSats)],
          ['a', campaign.aTag],
          ['K', String(CAMPAIGN_KIND)],
          ['alt', `Donation to ${campaign.title}: ${amountSats.toLocaleString()} sats`],
        ]),
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
      totalSats: amountSats,
      receiptPublished,
      receiptPublishError,
    };
  }

  return { donateToCampaign };
}
