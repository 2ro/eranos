import { useNostr } from '@nostrify/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { verifyOnchainZap, extractOnchainZapTxid, type OnchainZapEntry } from '@/hooks/useOnchainZaps';
import { fetchAddressData } from '@/lib/bitcoin';
import type { ParsedCampaign } from '@/lib/campaign';

interface CampaignDonationStats {
  /**
   * Total satoshis raised, sourced from the cumulative on-chain amount
   * ever received by the campaign's `w` address (`chain_stats.funded_txo_sum`
   * from Esplora). This is independent of Nostr donation receipts —
   * any payment to the address counts, and beneficiary payouts do not
   * reduce the number.
   */
  totalSats: number;
  /**
   * Mempool delta in sats — the net unconfirmed amount currently sitting
   * in the mempool for the campaign's `w` address. Sourced from Esplora's
   * `mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum`. Counts
   * every inbound mempool tx, whether or not a kind 8333 receipt has
   * been published for it. Negative when the beneficiary has unconfirmed
   * outgoing spends.
   */
  pendingSats: number;
  /** Number of unique on-chain transactions counted (from verified receipts). */
  txCount: number;
  /** Number of unique donor pubkeys (from verified receipts). */
  donorCount: number;
  /** All raw kind 8333 receipts for the campaign, newest first. */
  receipts: NostrEvent[];
  /** Verified entries (one per unique txid). */
  verified: OnchainZapEntry[];
  /**
   * Map of `txid → confirmed` for every verified receipt. Lets the donor
   * preview / activity list mark individual rows as pending when the
   * underlying Bitcoin tx is still in the mempool.
   */
  confirmedByTxid: Map<string, boolean>;
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
export function useCampaignDonations(
  campaign: ParsedCampaign | undefined,
  options: {
    /**
     * Gate for *all* underlying queries — the Esplora `/address` balance
     * lookup, the kind 8333 receipt fetch, and the per-receipt `/tx`
     * verification fan-out. Defaults to `true`.
     *
     * Card grids (`/campaigns`, profile tabs, lists) render up to ~200
     * cards at once. Running this hook eagerly for every card fired an
     * `/address` call per card plus a `/tx` call per donation receipt, in
     * one burst, which rate-limited every configured Esplora backend.
     * Callers in a grid pass `enabled: <card is on screen>` (see
     * {@link useInView}) so only visible cards talk to Esplora.
     */
    enabled?: boolean;
    /**
     * Poll interval (ms) for the Esplora `/address` balance lookup. Defaults
     * to `false` (no polling). Only the campaign **detail** page — a single
     * instance, never a grid — opts into live refresh; card grids must not,
     * or the per-card polling re-creates the Esplora request storm this
     * option's default was introduced to stop.
     */
    refetchInterval?: number | false;
    /**
     * Skip the kind 8333 receipt fetch and the per-receipt `/tx`
     * verification fan-out — i.e. everything that powers the donor
     * list, donor count, and per-tx breakdown. Only the single Esplora
     * `/address` balance lookup that drives the headline `totalSats`
     * (the progress bar) runs.
     *
     * Card grids only render the raised total, never the donor list, so
     * they pass `receipts: false` to avoid an N-receipt `/tx` storm per
     * card. The detail page leaves this `true` to populate its donor UI.
     */
    receipts?: boolean;
  } = {},
): {
  data: CampaignDonationStats;
  isLoading: boolean;
} {
  const { enabled = true, refetchInterval = false, receipts: fetchReceipts = true } = options;
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraApis } = config;

  const aTag = campaign?.aTag;
  const wallets = campaign?.wallets;
  // For dual-endpoint campaigns the on-chain endpoint drives aggregate UI
  // (silent-payment donations are unlinkable and never contribute to totals).
  // A campaign without an on-chain endpoint shows no aggregates.
  const onchainWallet = wallets?.onchain;
  const hasOnchain = !!onchainWallet;
  const walletValue = onchainWallet?.value;

  // Headline number: query the address balance directly from Esplora.
  // `totalReceived` is `chain_stats.funded_txo_sum` — sats ever sent to
  // the address. Does not regress when the beneficiary spends.
  //
  // No `refetchInterval` by default: a card grid mounts dozens of these,
  // and polling every 30s turned a one-time burst into a sustained Esplora
  // load that rate-limited every backend. The detail page opts into live
  // refresh via `options.refetchInterval` (it's a single instance); cards
  // read a cached snapshot (long `staleTime`) and refetch only on remount.
  const addressQuery = useQuery({
    queryKey: ['bitcoin-balance', 'campaign', esploraApis, walletValue ?? ''],
    queryFn: ({ signal }) => fetchAddressData(walletValue!, esploraApis, signal),
    enabled: enabled && !!walletValue && hasOnchain,
    staleTime: 60_000,
    refetchInterval,
  });

  // Donor list / breakdown: fetch kind 8333 receipts. Disabled when the
  // campaign has no on-chain endpoint (silent-payment-only campaigns never
  // publish receipts by design).
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
    enabled: enabled && fetchReceipts && !!aTag && hasOnchain,
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
      enabled: enabled && fetchReceipts && !!walletValue && hasOnchain,
    })),
  });

  const verified: OnchainZapEntry[] = verifications
    .map((v) => v.data)
    .filter((v): v is OnchainZapEntry => !!v);

  const totalSats = hasOnchain ? (addressQuery.data?.totalReceived ?? 0) : 0;
  const pendingSats = hasOnchain ? (addressQuery.data?.pendingBalance ?? 0) : 0;

  const txids = new Set<string>();
  const donors = new Set<string>();
  const confirmedByTxid = new Map<string, boolean>();
  for (const v of verified) {
    txids.add(v.txid);
    donors.add(v.senderPubkey);
    confirmedByTxid.set(v.txid, v.confirmed);
  }

  const sortedReceipts = [...receipts].sort((a, b) => b.created_at - a.created_at);

  // Treat "gated off / not yet on screen" as still-loading so a card in a
  // grid shows its progress skeleton rather than flashing a misleading
  // "0 raised" until it scrolls into view and the queries are allowed to
  // run. (A disabled TanStack query reports `isLoading: false`, so we can't
  // rely on that alone here.)
  const isVerifying =
    hasOnchain &&
    (!enabled ||
      addressQuery.isLoading ||
      (fetchReceipts &&
        (receiptsQuery.isLoading || verifications.some((v) => v.isLoading))));

  return {
    data: {
      totalSats,
      pendingSats,
      txCount: txids.size,
      donorCount: donors.size,
      receipts: sortedReceipts,
      verified,
      confirmedByTxid,
      isVerifying,
    },
    isLoading: isVerifying,
  };
}
