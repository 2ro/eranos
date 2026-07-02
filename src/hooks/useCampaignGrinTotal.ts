/**
 * The campaign fundraising tally, backed by Grin payment proofs (Plan 2, C4;
 * the GRIN replacement for the old kind-8333 BTC receipt sum).
 *
 * Queries kind-3414 Grin-donation events tagged to the campaign, verifies
 * each per the tally rule — (a) bound to the campaign's published Grin
 * identity, (b) signature valid, (c) kernel on-chain via a node read, (d)
 * deduped by kernel excess — and sums the verified amounts.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useGrinPayConfig } from '@/hooks/useGrinPay';
import { formatGrin } from '@/lib/goblinPay';
import {
  GRIN_DONATION_KIND,
  kernelOnChain,
  verifyDonationEvent,
  type CampaignGrinIdentity,
} from '@/lib/grinProof';
import type { ParsedCampaign } from '@/lib/campaign';

export interface CampaignGrinTotal {
  /** Sum of verified, on-chain, deduped donations, in nanogrin. */
  totalNanogrin: bigint;
  /** The same total as a display string in GRIN. */
  totalGrin: string;
  /** Number of verified donations counted. */
  donationCount: number;
  /**
   * Number of donations whose signatures verified but whose kernel check
   * could not complete (node unreachable). These are NOT counted — the
   * total never includes unverified amounts — but a nonzero value tells
   * the UI the figure may be an undercount right now.
   */
  uncheckedCount: number;
}

const EMPTY: CampaignGrinTotal = {
  totalNanogrin: 0n,
  totalGrin: '0',
  donationCount: 0,
  uncheckedCount: 0,
};

/** Cap concurrent node reads: campaigns can accumulate many donations. */
const KERNEL_CHECK_BATCH = 8;

/**
 * Verified "raised so far" for a campaign. Enabled only when the campaign
 * publishes at least one Grin receiving identity (nothing can verifiably
 * bind to a campaign without one).
 */
export function useCampaignGrinTotal(campaign: ParsedCampaign | null | undefined) {
  const { nostr } = useNostr();
  const { grinNodeUrl } = useGrinPayConfig();

  const identity: CampaignGrinIdentity | null = campaign
    ? {
        pubkey: campaign.pubkey,
        grinAddress: campaign.grinAddress,
        goblinPaySignerPubkey: campaign.goblinPaySignerPubkey,
      }
    : null;

  const hasGrinIdentity = !!campaign && (!!campaign.grinAddress || !!campaign.goblinPayEndpub || !!campaign.goblinPaySignerPubkey);

  return useQuery({
    queryKey: ['campaign-grin-total', campaign?.aTag, grinNodeUrl],
    queryFn: async (c): Promise<CampaignGrinTotal> => {
      if (!campaign || !identity) return EMPTY;

      const events = await nostr.query(
        [{ kinds: [GRIN_DONATION_KIND], '#a': [campaign.aTag], limit: 500 }],
        { signal: c.signal },
      );

      // Signature-level verification + dedupe by kernel excess (first event
      // per kernel wins; later republications of the same payment are noise).
      const byKernel = new Map<string, bigint>();
      for (const event of events) {
        const verified = verifyDonationEvent(event, identity);
        if (!verified) continue;
        if (!byKernel.has(verified.kernelExcessHex)) {
          byKernel.set(verified.kernelExcessHex, verified.amount);
        }
      }

      // On-chain check per unique kernel, batched. A node failure excludes
      // the donation (never counted on trust) but is surfaced as unchecked.
      let totalNanogrin = 0n;
      let donationCount = 0;
      let uncheckedCount = 0;
      const kernels = Array.from(byKernel.entries());
      for (let i = 0; i < kernels.length; i += KERNEL_CHECK_BATCH) {
        const batch = kernels.slice(i, i + KERNEL_CHECK_BATCH);
        const results = await Promise.allSettled(
          batch.map(([kernel]) => kernelOnChain(grinNodeUrl, kernel, fetch, c.signal)),
        );
        for (let j = 0; j < batch.length; j++) {
          const result = results[j];
          if (result.status === 'fulfilled') {
            if (result.value.onChain) {
              totalNanogrin += batch[j][1];
              donationCount += 1;
            }
          } else {
            uncheckedCount += 1;
          }
        }
      }

      return {
        totalNanogrin,
        totalGrin: formatGrin(totalNanogrin),
        donationCount,
        uncheckedCount,
      };
    },
    enabled: hasGrinIdentity,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
