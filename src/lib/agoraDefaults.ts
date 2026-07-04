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
const VERIFIED_FOLLOW_PACK_NADDR =
  'naddr1qqxxwmrvvfjh2dmfw33hgugpzemhxue69uhhyetvv9ujuurjd9kkzmpwdejhgq3qjvnpg4c6ljadf5t6ry0w9q0rnm4mksde87kglkrc993z46c39axsxpqqqzvtzxrjurt';

const decoded = nip19.decode(VERIFIED_FOLLOW_PACK_NADDR);
if (decoded.type !== 'naddr') {
  throw new Error('VERIFIED_FOLLOW_PACK_NADDR must be an naddr');
}

/** Sidebar path for the in-app Verified page. */
export const VERIFIED_PAGE_PATH = '/verified';

/**
 * Eranos's own Nostr identity (npub). Used as the "Follow Eranos on Nostr"
 * support pointer on the About and Corporate Sponsorship pages, rendered
 * in-app via the `/:nip19` profile route.
 */
export const ERANOS_NPUB =
  'npub1m049skfequeelxy032555eg7w47ff7qvzfc2cahym7xkrsgvmtqsnm9ny6';

/**
 * The Eranos / Goblin team page. Every user-facing link that used to route
 * people to the upstream project (soapbox.pub support, contact, source, help
 * guides) now points here instead. The page is created by the team; use the
 * URL exactly.
 */
export const TEAM_URL = 'https://goblin.st/team';

/**
 * Team Soapbox follow pack (kind 39089). The `p` tags of this pack form the
 * authoritative list of campaign moderators — pubkeys allowed to sign
 * approve / hide labels in the `agora.moderation` namespace (see NIP.md).
 *
 * Decoded:
 *   kind:       39089 (NIP-51 follow pack)
 *   pubkey:     932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d
 *   identifier: k4p5w0n22suf
 *
 * Phase 1: the pack is fetched live every session. We accept the extra
 * round-trip in exchange for not having to ship a code change every time a
 * moderator is added or removed. If perf becomes a problem we can fall back
 * to a hardcoded snapshot of the `p` tags — see the chat-with-opencode
 * notes in `useCampaignModerators.ts` for the tradeoff.
 */
const teamSoapboxDecoded = nip19.decode(
  'naddr1qvzqqqyckypzpyexz3t34l966ngh5xg7u2q788hthdqmj0av3lv8s2tz9t43zt6dqqxxkdrsx4mnqm3jxfeh2ess5pyrw',
);
if (teamSoapboxDecoded.type !== 'naddr') {
  throw new Error('TEAM_SOAPBOX must decode to naddr');
}

export const TEAM_SOAPBOX = {
  kind: teamSoapboxDecoded.data.kind,
  pubkey: teamSoapboxDecoded.data.pubkey,
  identifier: teamSoapboxDecoded.data.identifier,
  relays: teamSoapboxDecoded.data.relays,
} as const;

/**
 * The single pubkey allowed to author campaign **lists** (kind 30003 with
 * the `agora.campaign-list` hashtag) and the list-of-lists index sentinel.
 *
 * This is deliberately narrower than the moderator allowlist
 * ({@link CAMPAIGN_MODERATORS}). That allowlist governs **labels** —
 * approve / hide moderation in the `agora.moderation` namespace — where
 * any pack member is trusted to sign. Lists are an editorial surface (the
 * home hero row, the topic strip) curated by one person (MK Fain / Team
 * Soapbox), so a list authored by anyone else — including another
 * moderator — is dropped before it reaches the UI.
 *
 * It happens to equal the follow-pack author (`TEAM_SOAPBOX.pubkey`),
 * which is the same single admin identity, so we derive it from there
 * rather than duplicating the hex.
 */
export const LIST_CURATOR_PUBKEY = TEAM_SOAPBOX.pubkey;

/**
 * Hardcoded snapshot of the campaign-moderator pubkeys — the `p` tags of
 * the Team Soapbox follow pack ({@link TEAM_SOAPBOX}) as of the snapshot
 * date below.
 *
 * These pubkeys form the authoritative allowlist for **labels**: who may
 * sign approve / hide moderation in the `agora.moderation` namespace (see
 * NIP.md and `useCampaignModerators`). A campaign appears on `/` and
 * Discover only if one of these pubkeys labeled it `approved`; a `hidden`
 * label from any of them always wins.
 *
 * **Why hardcoded.** The pack used to be fetched live every cold session
 * (kind 39089), which put a single-relay round-trip — up to an 8s EOSE
 * timeout — on the critical path of every moderation-gated surface. The
 * roster changes rarely, so we snapshot it here and pay zero network cost.
 * When the pack membership changes, update this array (and re-cut a
 * release). Source of truth remains the on-relay pack; this is a copy.
 *
 * Snapshot taken from pack event `740838e6…fac76` (created_at 1779321391).
 */
export const CAMPAIGN_MODERATORS: readonly string[] = [
  '781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5',
  '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
  '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d',
  '3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24',
  '86184109eae937d8d6f980b4a0b46da4ef0d983eade403ee1b4c0b6bde238b47',
  '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
  'ce97367c75d7d91fb9bc3bc6ff5bb3bdb52c18941bfce2f368616dcbf0adfd2f',
  '0574536d3ef4d65faf95b42393610b8475d22f4c294649d46c50d5d36f75267c',
  'be7358c4fe50148cccafc02ea205d80145e253889aa3958daafa8637047c840e',
  '2093baa8621c5b255e8f4fc2c6fdfc10d8a5598a25517664efaba860735f1030',
  '8f53782e8693e88afb710b6d68182ad973973c8822caa237bb60288b125673ca',
  'c839bc85846f24fc6b777548fe654672377f4cc2a04cab19cddec75b2f8b4dbd',
] as const;
