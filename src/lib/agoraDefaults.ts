/**
 * Hardcoded Agora-wide defaults that aren't user-configurable.
 *
 * Today this only holds the canonical "verified users" follow pack (kind 39089)
 * that the sidebar's Verified entry points at. The naddr is the same WLC pack
 * Pathos shipped — kept as a transitional default until an Agora-specific pack
 * is published. To switch packs, replace `VERIFIED_FOLLOW_PACK_NADDR` below
 * with a new naddr1... encoding any kind 30000 / 39089 follow pack/set.
 */

import { nip19 } from 'nostr-tools';

/**
 * NIP-19 naddr for the canonical Agora "verified users" follow pack.
 * Currently points at the WLC pack Pathos shipped (transitional default).
 *
 * Decoded:
 *   kind:       39089 (NIP-51 follow pack)
 *   pubkey:     932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d
 *   identifier: gllbeu7itctq
 *   relays:     wss://relay.primal.net
 */
export const VERIFIED_FOLLOW_PACK_NADDR =
  'naddr1qqxxwmrvvfjh2dmfw33hgugpzemhxue69uhhyetvv9ujuurjd9kkzmpwdejhgq3qjvnpg4c6ljadf5t6ry0w9q0rnm4mksde87kglkrc993z46c39axsxpqqqzvtzxrjurt';

const decoded = nip19.decode(VERIFIED_FOLLOW_PACK_NADDR);
if (decoded.type !== 'naddr') {
  throw new Error('VERIFIED_FOLLOW_PACK_NADDR must be an naddr');
}

/** Decoded coordinates for the canonical verified-users follow pack. */
export const VERIFIED_FOLLOW_PACK = {
  kind: decoded.data.kind,
  pubkey: decoded.data.pubkey,
  identifier: decoded.data.identifier,
  relays: decoded.data.relays,
} as const;

/** Sidebar path for the in-app Verified page. */
export const VERIFIED_PAGE_PATH = '/verified';
