import { useNostr } from '@nostrify/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { verifyOnchainZap, extractOnchainZapTxid, type OnchainZapEntry } from '@/hooks/useOnchainZaps';
import type { ParsedCampaign } from '@/lib/campaign';

export interface CampaignDonationStats {
  /** Total satoshis pledged across all verified kind 8333 receipts. */
  totalSats: number;
  /** Number of unique on-chain transactions counted. */
  txCount: number;
  /** Number of unique donor pubkeys. */
  donorCount: number;
  /** All raw kind 8333 receipts for the campaign, newest first. */
  receipts: NostrEvent[];
  /** Verified entries (one per unique txid). */
  verified: OnchainZapEntry[];
  /**
   * True while underlying verification queries are still in flight.
   * Callers may use this to defer rendering "0 sats raised" until
   * the verifier has had a chance to validate the receipts.
   */
  isVerifying: boolean;
}

const EMPTY_RECEIPTS: NostrEvent[] = [];

/**
 * Aggregates donation receipts (kind 8333 events) for a campaign and
 * **verifies each one on-chain** before counting it toward the campaign
 * total.
 *
 * Per NIP.md §Kind 33863, each receipt:
 *
 * - Targets the campaign via an `a` tag (`33863:<pubkey>:<d>`).
 * - Carries an `i bitcoin:tx:<txid>` tag.
 * - Carries an `amount <sats>` tag (self-reported, capped at verified).
 * - Carries **no `p` tags** — campaigns are not Nostr-identity recipients.
 *
 * Verification re-fetches the tx from the configured Esplora endpoint and
 * sums the outputs paying the campaign's `w` address. The self-reported
 * `amount` is capped at the verified amount.
 *
 * Silent-payment campaigns (`w` starts with `sp1…`) short-circuit to
 * zeros — donations to SP campaigns are unlinkable by design and clients
 * MUST NOT publish receipts.
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

  // Step 1: fetch raw receipts. Disabled for SP campaigns.
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

  // Step 2: verify each unique-txid receipt against the campaign's `w`
  // wallet address. SP campaigns are short-circuited above so the
  // wallet here is always `onchain` mode when present.
  const walletValue = wallet?.value;
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

  const totalSats = verified.reduce((sum, v) => sum + v.amountSats, 0);
  const txids = new Set<string>();
  const donors = new Set<string>();
  for (const v of verified) {
    txids.add(v.txid);
    donors.add(v.senderPubkey);
  }

  const sortedReceipts = [...receipts].sort((a, b) => b.created_at - a.created_at);

  const isVerifying = !isSilentPayment && (receiptsQuery.isLoading || verifications.some((v) => v.isLoading));

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
