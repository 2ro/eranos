import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bech32 } from '@scure/base';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  GRIN_DONATION_KIND,
  bytesToHex,
  decodeSlatepackAddress,
  isValidSlatepackAddress,
  kernelOnChain,
  parseReceiverProof,
  parseSignedReceipt,
  proofMessage,
  receiptCanonicalJson,
  verifyDonationEvent,
  verifyReceiverProof,
  verifySignedReceipt,
  type GoblinPayReceipt,
  type GrinReceiverProof,
} from '@/lib/grinProof';
import { extractSlatepackArmor, formatGrin, parseGrinAmount } from '@/lib/goblinPay';

// ─── helpers ─────────────────────────────────────────────────────────

/** Deterministic ed25519 keypair from a seed byte (mirrors gp-wallet's tests). */
function keypair(seed: number): { secret: Uint8Array; public: Uint8Array } {
  const secret = new Uint8Array(32).fill(seed);
  return { secret, public: ed25519.getPublicKey(secret) };
}

function grin1Address(publicKey: Uint8Array): string {
  return bech32.encode('grin', bech32.toWords(publicKey), 1000);
}

/**
 * Build a valid receiver proof exactly as a Grin wallet would: sign the
 * canonical message (`amount BE u64 || kernel excess || sender address`)
 * with a real ed25519 key. Mirrors GoblinPay's `gp-wallet/src/proof.rs`
 * test fixture.
 */
function validProof(): { proof: GrinReceiverProof; recipient: ReturnType<typeof keypair> } {
  const amount = 2_500_000_000n;
  const kernelExcess = new Uint8Array(33).fill(0x09);
  const sender = new Uint8Array(32).fill(0x11);
  const recipient = keypair(7);

  const unsigned: GrinReceiverProof = {
    amount,
    kernelExcess,
    senderAddress: sender,
    recipientAddress: recipient.public,
    recipientSig: new Uint8Array(64),
  };
  const sig = ed25519.sign(proofMessage(unsigned), recipient.secret);
  return { proof: { ...unsigned, recipientSig: sig }, recipient };
}

/** The proof as GoblinPay's ReceiverProof JSON (hex addresses, nanogrin amount). */
function proofJson(proof: GrinReceiverProof): Record<string, unknown> {
  return {
    amount: Number(proof.amount),
    kernel_excess: bytesToHex(proof.kernelExcess),
    sender_address: bytesToHex(proof.senderAddress),
    recipient_address: bytesToHex(proof.recipientAddress),
    recipient_sig: bytesToHex(proof.recipientSig),
  };
}

function sampleReceipt(serverPubkey: string): GoblinPayReceipt {
  return {
    version: 1,
    payment_id: 'b6f7c2a0-1234-5678-9abc-def012345678',
    amount: 2_500_000_000,
    kernel_excess: '09'.repeat(33),
    confirmed_height: 3_900_000,
    confirmations: 11,
    proof: null,
    issued_at: '2026-07-01T12:00:00Z',
    server_pubkey: serverPubkey,
  };
}

/** Sign a receipt the way GoblinPay does: BIP-340 over SHA-256 of the canonical JSON. */
function signReceipt(receipt: GoblinPayReceipt, secret: Uint8Array): { receipt: GoblinPayReceipt; sig: string } {
  const withKey = { ...receipt, server_pubkey: bytesToHex(schnorr.getPublicKey(secret)) };
  const digest = sha256(new TextEncoder().encode(receiptCanonicalJson(withKey)));
  const sig = schnorr.sign(digest, secret, new Uint8Array(32));
  return { receipt: withKey, sig: bytesToHex(sig) };
}

function donationEvent(pubkey: string, content: string, aTag = '33863:owner:camp'): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey,
    created_at: 1_770_000_000,
    kind: GRIN_DONATION_KIND,
    tags: [['a', aTag]],
    content,
    sig: 'f'.repeat(128),
  };
}

// ─── receiver proof (ed25519) ────────────────────────────────────────

describe('verifyReceiverProof', () => {
  it('accepts a valid proof', () => {
    const { proof } = validProof();
    expect(verifyReceiverProof(proof)).toBe(true);
  });

  it('rejects a tampered amount', () => {
    const { proof } = validProof();
    expect(verifyReceiverProof({ ...proof, amount: proof.amount + 1n })).toBe(false);
  });

  it('rejects a tampered kernel excess', () => {
    const { proof } = validProof();
    expect(verifyReceiverProof({ ...proof, kernelExcess: new Uint8Array(33).fill(0x0a) })).toBe(false);
  });

  it('rejects a tampered sender address', () => {
    const { proof } = validProof();
    expect(verifyReceiverProof({ ...proof, senderAddress: new Uint8Array(32).fill(0x22) })).toBe(false);
  });

  it('rejects a wrong recipient key', () => {
    const { proof } = validProof();
    expect(verifyReceiverProof({ ...proof, recipientAddress: keypair(9).public })).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const { proof } = validProof();
    const sig = proof.recipientSig.slice();
    sig[0] ^= 0xff;
    expect(verifyReceiverProof({ ...proof, recipientSig: sig })).toBe(false);
  });
});

describe('proofMessage', () => {
  it('serializes amount as big-endian u64, then excess, then sender', () => {
    const proof: GrinReceiverProof = {
      amount: 0x0102030405060708n,
      kernelExcess: new Uint8Array(33).fill(0xaa),
      senderAddress: new Uint8Array(32).fill(0xbb),
      recipientAddress: new Uint8Array(32),
      recipientSig: new Uint8Array(64),
    };
    const msg = proofMessage(proof);
    expect(msg.length).toBe(8 + 33 + 32);
    expect(Array.from(msg.slice(0, 8))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(msg[8]).toBe(0xaa);
    expect(msg[8 + 33]).toBe(0xbb);
  });
});

describe('parseReceiverProof', () => {
  it('parses the GoblinPay ReceiverProof shape (hex addresses, nanogrin number)', () => {
    const { proof } = validProof();
    const parsed = parseReceiverProof(proofJson(proof));
    expect(parsed).not.toBeNull();
    expect(parsed!.amount).toBe(proof.amount);
    expect(verifyReceiverProof(parsed!)).toBe(true);
  });

  it('parses the grin-wallet export shape (grin1 addresses, excess field, string amount)', () => {
    const { proof } = validProof();
    const parsed = parseReceiverProof({
      amount: proof.amount.toString(),
      excess: bytesToHex(proof.kernelExcess),
      sender_address: grin1Address(proof.senderAddress),
      recipient_address: grin1Address(proof.recipientAddress),
      recipient_sig: bytesToHex(proof.recipientSig),
      sender_sig: '00'.repeat(64),
    });
    expect(parsed).not.toBeNull();
    expect(verifyReceiverProof(parsed!)).toBe(true);
  });

  it('parses a decimal GRIN string amount', () => {
    const { proof } = validProof();
    const parsed = parseReceiverProof({ ...proofJson(proof), amount: '2.5' });
    expect(parsed).not.toBeNull();
    expect(parsed!.amount).toBe(2_500_000_000n);
    expect(verifyReceiverProof(parsed!)).toBe(true);
  });

  it('rejects malformed fields without throwing', () => {
    const { proof } = validProof();
    const good = proofJson(proof);
    for (const bad of [
      { ...good, kernel_excess: 'zz' },
      { ...good, recipient_address: '' },
      { ...good, recipient_sig: '00' },
      { ...good, sender_address: 'nothex' },
      { ...good, amount: -5 },
      { ...good, amount: '0' },
      null,
      'a string',
      42,
      [],
    ]) {
      expect(parseReceiverProof(bad)).toBeNull();
    }
  });
});

describe('decodeSlatepackAddress', () => {
  it('round-trips a grin1 address to its ed25519 key', () => {
    const key = keypair(3).public;
    const addr = grin1Address(key);
    expect(addr.startsWith('grin1')).toBe(true);
    expect(bytesToHex(decodeSlatepackAddress(addr)!)).toBe(bytesToHex(key));
    expect(isValidSlatepackAddress(addr)).toBe(true);
  });

  it('rejects other prefixes, bad checksums, and non-addresses', () => {
    const addr = grin1Address(keypair(3).public);
    expect(decodeSlatepackAddress(addr.replace('grin1', 'bc1'))).toBeNull();
    expect(decodeSlatepackAddress(addr.slice(0, -1) + (addr.endsWith('a') ? 'c' : 'a'))).toBeNull();
    expect(decodeSlatepackAddress('grin1')).toBeNull();
    expect(decodeSlatepackAddress('not an address')).toBeNull();
  });
});

// ─── kernel on-chain check (node fixtures from GoblinPay's test suite) ─

const KERNEL_FOUND_JSON =
  '{"id":1,"jsonrpc":"2.0","result":{"Ok":{"tx_kernel":{"features":{"Plain":{"fee":7000000}},"excess":"09a1","excess_sig":"8f1c"},"height":3900000,"mmr_index":54321000}}}';
const KERNEL_NOTFOUND_JSON = '{"id":1,"jsonrpc":"2.0","result":{"Err":"NotFound"}}';

function mockFetch(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
}

describe('kernelOnChain', () => {
  const excess = '09'.repeat(33);

  it('reports on-chain with height when the node locates the kernel', async () => {
    const status = await kernelOnChain('https://node.example', excess, mockFetch(KERNEL_FOUND_JSON));
    expect(status).toEqual({ onChain: true, height: 3_900_000 });
  });

  it('reports not-on-chain for NotFound', async () => {
    const status = await kernelOnChain('https://node.example', excess, mockFetch(KERNEL_NOTFOUND_JSON));
    expect(status).toEqual({ onChain: false });
  });

  it('throws on other node errors and bad responses', async () => {
    await expect(
      kernelOnChain('https://node.example', excess, mockFetch('{"result":{"Err":"Internal"}}')),
    ).rejects.toThrow();
    await expect(kernelOnChain('https://node.example', excess, mockFetch('oops', 500))).rejects.toThrow();
  });

  it('rejects a malformed excess before any network call', async () => {
    await expect(kernelOnChain('https://node.example', '09aa', mockFetch(KERNEL_FOUND_JSON))).rejects.toThrow();
  });
});

// ─── GoblinPay signed receipts ───────────────────────────────────────

describe('signed receipts', () => {
  const serverSecret = new Uint8Array(32).fill(42);

  it('sign-then-verify round-trips', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    expect(verifySignedReceipt(signed)).toBe(true);
  });

  it('rejects tampering with any field', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    expect(verifySignedReceipt({ ...signed, receipt: { ...signed.receipt, amount: signed.receipt.amount + 1 } })).toBe(false);
    expect(verifySignedReceipt({ ...signed, receipt: { ...signed.receipt, kernel_excess: '0a'.repeat(33) } })).toBe(false);
    expect(verifySignedReceipt({ ...signed, receipt: { ...signed.receipt, confirmed_height: 999_999 } })).toBe(false);
    expect(verifySignedReceipt({ ...signed, receipt: { ...signed.receipt, payment_id: 'other' } })).toBe(false);
  });

  it('rejects a signature from another key (pubkey swap)', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    const other = bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(43)));
    expect(verifySignedReceipt({ ...signed, receipt: { ...signed.receipt, server_pubkey: other } })).toBe(false);
  });

  it('does not throw on malformed signatures', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    expect(verifySignedReceipt({ ...signed, sig: 'zz' })).toBe(false);
    expect(verifySignedReceipt({ ...signed, sig: '' })).toBe(false);
  });

  it('canonical JSON uses declaration order for the receipt and sorted keys for the proof', () => {
    // The embedded proof round-trips through serde_json::Value (a BTreeMap
    // without preserve_order), so its keys are alphabetical regardless of
    // input order; the receipt struct itself serializes in declaration order.
    const receipt = sampleReceipt('ab'.repeat(16));
    receipt.proof = { sender_address: '11', amount: 5, kernel_excess: '09' };
    expect(receiptCanonicalJson(receipt)).toBe(
      '{"version":1,"payment_id":"b6f7c2a0-1234-5678-9abc-def012345678",' +
        '"amount":2500000000,"kernel_excess":"' + '09'.repeat(33) + '",' +
        '"confirmed_height":3900000,"confirmations":11,' +
        '"proof":{"amount":5,"kernel_excess":"09","sender_address":"11"},' +
        '"issued_at":"2026-07-01T12:00:00Z","server_pubkey":"' + 'ab'.repeat(16) + '"}',
    );
  });

  it('parseSignedReceipt tolerates null optionals and rejects junk', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    const parsed = parseSignedReceipt(JSON.parse(JSON.stringify(signed)));
    expect(parsed).not.toBeNull();
    expect(verifySignedReceipt(parsed!)).toBe(true);
    expect(parseSignedReceipt(null)).toBeNull();
    expect(parseSignedReceipt({ receipt: {}, sig: 'ab' })).toBeNull();
    expect(parseSignedReceipt({ sig: 'ab' })).toBeNull();
  });
});

// ─── donation events (kind 3414) ─────────────────────────────────────

describe('verifyDonationEvent', () => {
  const ownerPubkey = '1'.repeat(64);
  const donorPubkey = '2'.repeat(64);
  const serverSecret = new Uint8Array(32).fill(42);
  const serverPubkey = bytesToHex(schnorr.getPublicKey(serverSecret));

  it('accepts a bare proof bound to the campaign grin1 address, from any author', () => {
    const { proof } = validProof();
    const campaign = { pubkey: ownerPubkey, grinAddress: grin1Address(proof.recipientAddress) };
    const event = donationEvent(donorPubkey, JSON.stringify(proofJson(proof)));
    const verified = verifyDonationEvent(event, campaign);
    expect(verified).not.toBeNull();
    expect(verified!.path).toBe('proof');
    expect(verified!.amount).toBe(proof.amount);
    expect(verified!.kernelExcessHex).toBe('09'.repeat(33));
  });

  it('rejects a proof paid to a different address', () => {
    const { proof } = validProof();
    const campaign = { pubkey: ownerPubkey, grinAddress: grin1Address(keypair(9).public) };
    const event = donationEvent(donorPubkey, JSON.stringify(proofJson(proof)));
    expect(verifyDonationEvent(event, campaign)).toBeNull();
  });

  it('rejects a proof when the campaign has no grin address', () => {
    const { proof } = validProof();
    const event = donationEvent(donorPubkey, JSON.stringify(proofJson(proof)));
    expect(verifyDonationEvent(event, { pubkey: ownerPubkey })).toBeNull();
  });

  it('accepts an owner-published GoblinPay receipt', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    const event = donationEvent(ownerPubkey, JSON.stringify(signed));
    const verified = verifyDonationEvent(event, { pubkey: ownerPubkey });
    expect(verified).not.toBeNull();
    expect(verified!.path).toBe('goblinpay');
    expect(verified!.amount).toBe(2_500_000_000n);
  });

  it('accepts a donor-published receipt only when the campaign declared the signer', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    const event = donationEvent(donorPubkey, JSON.stringify(signed));
    expect(verifyDonationEvent(event, { pubkey: ownerPubkey })).toBeNull();
    expect(
      verifyDonationEvent(event, { pubkey: ownerPubkey, goblinPaySignerPubkey: serverPubkey }),
    ).not.toBeNull();
    const otherSigner = bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(43)));
    expect(
      verifyDonationEvent(event, { pubkey: ownerPubkey, goblinPaySignerPubkey: otherSigner }),
    ).toBeNull();
  });

  it('rejects a tampered receipt even from the owner', () => {
    const signed = signReceipt(sampleReceipt(''), serverSecret);
    signed.receipt.amount += 1;
    const event = donationEvent(ownerPubkey, JSON.stringify(signed));
    expect(verifyDonationEvent(event, { pubkey: ownerPubkey })).toBeNull();
  });

  it('rejects wrong kinds and non-JSON content', () => {
    const { proof } = validProof();
    const campaign = { pubkey: ownerPubkey, grinAddress: grin1Address(proof.recipientAddress) };
    const wrongKind = { ...donationEvent(donorPubkey, JSON.stringify(proofJson(proof))), kind: 1 };
    expect(verifyDonationEvent(wrongKind, campaign)).toBeNull();
    expect(verifyDonationEvent(donationEvent(donorPubkey, 'not json'), campaign)).toBeNull();
  });
});

// ─── GoblinPay client helpers ────────────────────────────────────────

describe('parseGrinAmount / formatGrin', () => {
  it('parses whole and decimal GRIN', () => {
    expect(parseGrinAmount('2.5')).toBe(2_500_000_000);
    expect(parseGrinAmount('1')).toBe(1_000_000_000);
    expect(parseGrinAmount('0.000000001')).toBe(1);
    expect(parseGrinAmount('2,5')).toBe(2_500_000_000);
  });

  it('rejects junk, negatives, zero, and too many decimals', () => {
    for (const bad of ['', 'abc', '-1', '0', '0.0', '1.0000000001', '1.2.3']) {
      expect(parseGrinAmount(bad)).toBeNull();
    }
  });

  it('formats nanogrin back to GRIN', () => {
    expect(formatGrin(2_500_000_000)).toBe('2.5');
    expect(formatGrin(1)).toBe('0.000000001');
    expect(formatGrin(1_000_000_000)).toBe('1');
    expect(formatGrin(0)).toBe('0');
  });
});

describe('extractSlatepackArmor', () => {
  it('extracts armor from an HTML page', () => {
    const armor = 'BEGINSLATEPACK. abc DEF ghi. ENDSLATEPACK.';
    const html = `<html><textarea>\n${armor}\n</textarea></html>`;
    expect(extractSlatepackArmor(html)).toBe(armor);
  });

  it('returns null when no armor is present', () => {
    expect(extractSlatepackArmor('<html>nope</html>')).toBeNull();
  });
});
