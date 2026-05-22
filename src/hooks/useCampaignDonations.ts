import { useNostr } from '@nostrify/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { verifyOnchainZap, extractOnchainZapTxid, type OnchainZapEntry } from '@/hooks/useOnchainZaps';
import { fetchAddressData } from '@/lib/bitcoin';
import type { ParsedCampaign } from '@/lib/campaign';

export interface CampaignDonationStats {
  /**
   * Total satoshis raised, sourced from the cumulative on-chain amount
   * ever received by the campaign's `w` address (`chain_stats.funded_txo_sum`
   * from Esplora). This is independent of Nostr donation receipts —
   * any payment to the address counts, and beneficiary payouts do not
   * reduce the number.
   */
  totalSats: number;
  /** Number of unique on-chain transactions counted (from verified receipts). */
  txCount: number;
  /** Number of unique donor pubkeys (from verified receipts). */
  donorCount: number;
  /** All raw kind 8333 receipts for the campaign, newest first. */
  receipts: NostrEvent[];
  /** Verified entries (one per unique txid). */
  verified: OnchainZapEntry[];
  /**
   * True while underlying queries (address balance + receipt verification)
   * are still in flight. Callers may use this to defer rendering
   * "0 sats raised" until the data has had a chance to load.
   */
  isVerifying: boolean;
}

const EMPTY_RECEIPTS: NostrEvent[] = [];

/**
 * Aggregates donation statistics for a campaign.
 *
 * The headline number — `totalSats` — comes from a direct balance lookup
 * on the campaign's `w` Bitcoin address via the configured Esplora endpoint
 * (default: mempool.space). Specifically, it's `chain_stats.funded_txo_sum`,
 * the cumulative amount ever sent to the address. This means:
 *
 * - Donations are counted whether or not the donor publishes a Nostr
 *   receipt (kind 8333).
 * - The progress bar does not regress when the beneficiary spends from
 *   the address.
 * - Anyone who sends sats to the address contributes to "raised" —
 *   address reuse trades off security here. Fresh-per-campaign addresses
 *   (the default "public" wallet source) avoid this entirely.
 *
 * Donation receipts (kind 8333) are still fetched and verified on-chain
 * to populate the donor list, donor count, and per-tx breakdown shown in
 * the UI. They no longer contribute to `totalSats`.
 *
 * Silent-payment campaigns (`w` starts with `sp1…`) short-circuit to
 * zeros — donations are unlinkable by design, so address balance is
 * undefined.
 */
export function useCampaignDonations(campaign: ParsedCampaign | undefined): {
  data: CampaignDonationStats;
  isLoading: boolean;
} {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraApis } = config;

  const aTag = campaign?.aTag;
  const wallet = campaign?.wallet;
  const isSilentPayment = wallet?.mode === 'sp';
  const isOnchain = wallet?.mode === 'onchain';
  const walletValue = wallet?.value;

  // Headline number: query the address balance directly from Esplora.
  // `totalReceived` is `chain_stats.funded_txo_sum` — sats ever sent to
  // the address. Does not regress when the beneficiary spends.
  const addressQuery = useQuery({
    queryKey: ['bitcoin-balance', 'campaign', esploraApis, walletValue ?? ''],
    queryFn: ({ signal }) => fetchAddressData(walletValue!, esploraApis, signal),
    enabled: !!walletValue && isOnchain,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Donor list / breakdown: fetch kind 8333 receipts. Disabled for SP
  // campaigns (no receipts are published by design).
  const receiptsQuery = useQuery({
    queryKey: ['campaign-donations', 'events', aTag ?? ''],
    queryFn: async ({ signal }): Promise<NostrEvent[]> => {
      if (!aTag) return EMPTY_RECEIPTS;
      const events = await nostr.query(
        [{ kinds: [8333], '#a': [aTag], limit: 500 }],
        { signal },
      );
      return events;
    },
    enabled: !!aTag && !isSilentPayment,
    staleTime: 15_000,
  });

  // Dedupe by txid; prefer the earliest receipt per tx (first to claim).
  const receipts = receiptsQuery.data ?? EMPTY_RECEIPTS;
  const dedupedByTxid = (() => {
    const byTxid = new Map<string, NostrEvent>();
    for (const event of receipts) {
      const txid = extractOnchainZapTxid(event);
      if (!txid) continue;
      const existing = byTxid.get(txid);
      if (!existing || event.created_at < existing.created_at) {
        byTxid.set(txid, event);
      }
    }
    return Array.from(byTxid.values());
  })();

  // Verify each unique-txid receipt against the campaign's `w` wallet
  // address. The verified entries drive the donor list / breakdown UI,
  // not the headline raised total.
  const verifications = useQueries({
    queries: dedupedByTxid.map((event) => ({
      queryKey: ['onchain-zaps', 'verify', esploraApis, event.id, walletValue ?? ''],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        verifyOnchainZap(event, esploraApis, walletValue, signal),
      staleTime: 60_000,
      enabled: !!walletValue && !isSilentPayment,
    })),
  });

  const verified: OnchainZapEntry[] = verifications
    .map((v) => v.data)
    .filter((v): v is OnchainZapEntry => !!v);

  const totalSats = isOnchain ? (addressQuery.data?.totalReceived ?? 0) : 0;

  const txids = new Set<string>();
  const donors = new Set<string>();
  for (const v of verified) {
    txids.add(v.txid);
    donors.add(v.senderPubkey);
  }

  const sortedReceipts = [...receipts].sort((a, b) => b.created_at - a.created_at);

  const isVerifying =
    !isSilentPayment &&
    (addressQuery.isLoading ||
      receiptsQuery.isLoading ||
      verifications.some((v) => v.isLoading));

  return {
    data: {
      totalSats,
      txCount: txids.size,
      donorCount: donors.size,
      receipts: sortedReceipts,
      verified,
      isVerifying,
    },
    isLoading: isVerifying,
  };
}
