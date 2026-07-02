import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { bech32 } from '@scure/base';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { CAMPAIGN_KIND, grinDonationPaths, parseCampaign } from '@/lib/campaign';

function grin1Address(seed: number): string {
  const publicKey = ed25519.getPublicKey(new Uint8Array(32).fill(seed));
  return bech32.encode('grin', bech32.toWords(publicKey), 1000);
}

function campaignEvent(extraTags: string[][]): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: '1'.repeat(64),
    created_at: 1_770_000_000,
    kind: CAMPAIGN_KIND,
    tags: [['d', 'test-campaign'], ['title', 'Test Campaign'], ...extraTags],
    content: 'story',
    sig: 'f'.repeat(128),
  };
}

describe('parseCampaign Grin receiving config', () => {
  const npub = nip19.npubEncode('2'.repeat(64));

  it('parses a valid grin tag and goblinpay tag', () => {
    const address = grin1Address(5);
    const parsed = parseCampaign(campaignEvent([
      ['grin', address],
      ['goblinpay', npub, '3'.repeat(64)],
    ]));
    expect(parsed).not.toBeNull();
    expect(parsed!.grinAddress).toBe(address);
    expect(parsed!.goblinPayEndpub).toBe(npub);
    expect(parsed!.goblinPaySignerPubkey).toBe('3'.repeat(64));
  });

  it('accepts an npub-form signer key', () => {
    const parsed = parseCampaign(campaignEvent([['goblinpay', npub, nip19.npubEncode('4'.repeat(64))]]));
    expect(parsed!.goblinPaySignerPubkey).toBe('4'.repeat(64));
  });

  it('drops a malformed grin address (bad checksum / wrong prefix)', () => {
    const address = grin1Address(5);
    expect(parseCampaign(campaignEvent([['grin', address.slice(0, -1)]]))!.grinAddress).toBeUndefined();
    expect(parseCampaign(campaignEvent([['grin', 'bc1qxyz']]))!.grinAddress).toBeUndefined();
    expect(parseCampaign(campaignEvent([]))!.grinAddress).toBeUndefined();
  });

  it('drops malformed goblinpay elements field-by-field', () => {
    const parsed = parseCampaign(campaignEvent([['goblinpay', 'not-an-npub', '3'.repeat(64)]]));
    expect(parsed!.goblinPayEndpub).toBeUndefined();
    expect(parsed!.goblinPaySignerPubkey).toBe('3'.repeat(64));
    const parsed2 = parseCampaign(campaignEvent([['goblinpay', npub, 'junk']]));
    expect(parsed2!.goblinPayEndpub).toBe(npub);
    expect(parsed2!.goblinPaySignerPubkey).toBeUndefined();
  });

  it('grinDonationPaths reflects campaign tags and instance config', () => {
    const address = grin1Address(5);
    const withBoth = parseCampaign(campaignEvent([['grin', address], ['goblinpay', npub]]))!;
    expect(grinDonationPaths(withBoth, 'https://pay.example', 'token')).toEqual({
      invoice: true,
      endpub: true,
      address: true,
    });
    const bare = parseCampaign(campaignEvent([]))!;
    expect(grinDonationPaths(bare, undefined, undefined)).toEqual({
      invoice: false,
      endpub: false,
      address: false,
    });
    // No API token = no invoice flow, even with a URL.
    expect(grinDonationPaths(bare, 'https://pay.example', undefined).invoice).toBe(false);
  });
});
