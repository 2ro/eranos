import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  violatesGrinOnly,
  sanitizeText,
  stripLightningProfileFields,
  REDACTION_PLACEHOLDER,
} from '@/lib/grinOnlyPolicy';

function event(kind: number, content = ''): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: '1'.repeat(64),
    created_at: 1_770_000_000,
    kind,
    tags: [],
    content,
    sig: 'f'.repeat(128),
  };
}

describe('violatesGrinOnly — dropped Bitcoin/Lightning kinds', () => {
  it('drops kind 9041 (NIP-75 zap goal)', () => {
    expect(violatesGrinOnly(event(9041))).toBe(true);
  });

  it('drops kind 9734 (zap request) and 9735 (zap receipt)', () => {
    expect(violatesGrinOnly(event(9734))).toBe(true);
    expect(violatesGrinOnly(event(9735))).toBe(true);
  });

  it('keeps ordinary text notes (kind 1)', () => {
    expect(violatesGrinOnly(event(1))).toBe(false);
  });
});

describe('violatesGrinOnly — HARD BOUNDARY: Grin campaign machinery untouched', () => {
  it('keeps kind 33863 (Grin campaign)', () => {
    expect(violatesGrinOnly(event(33863))).toBe(false);
  });

  it('keeps kind 36639 (Grin pledge)', () => {
    expect(violatesGrinOnly(event(36639))).toBe(false);
  });

  it('keeps kind 3414 (Grin payment proof)', () => {
    expect(violatesGrinOnly(event(3414))).toBe(false);
  });
});

describe('sanitizeText — prose mentioning bitcoin/lightning is NOT filtered', () => {
  it('keeps a plain post about bitcoin and lightning verbatim', () => {
    const text = 'I like bitcoin and lightning';
    expect(sanitizeText(text)).toBe(text);
  });
});

describe('sanitizeText — redacts serialized money-rail tokens, keeps surrounding text', () => {
  it('redacts a bolt11 invoice but keeps the surrounding text', () => {
    const invoice =
      'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4js';
    const result = sanitizeText(`Please pay ${invoice} thanks!`);
    expect(result).toBe(`Please pay ${REDACTION_PLACEHOLDER} thanks!`);
    expect(result).not.toContain('lnbc');
  });

  it('redacts an lnurl string in a DM but preserves the message', () => {
    const lnurl =
      'lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns';
    const result = sanitizeText(`here you go: ${lnurl} — enjoy`);
    expect(result).toBe(`here you go: ${REDACTION_PLACEHOLDER} — enjoy`);
    expect(result).not.toContain('lnurl1');
  });

  it('redacts a lightning: URI', () => {
    const result = sanitizeText('open lightning:lnbc10u1phelloworldpayload now');
    expect(result).toBe(`open ${REDACTION_PLACEHOLDER} now`);
  });
});

describe('sanitizeText — HARD BOUNDARY: Grin slatepack passes through unchanged', () => {
  it('leaves a BEGINSLATEPACK…ENDSLATEPACK block byte-for-byte identical', () => {
    const slatepack =
      'BEGINSLATEPACK. 4H1qx1wHe5F 5JMkZjxF2Wb Q8QuD5 zVpLmnbcQ t 8fpXj9k ENDSLATEPACK.';
    expect(sanitizeText(slatepack)).toBe(slatepack);
  });

  it('keeps a slatepack intact even inside surrounding text', () => {
    const slatepack =
      'BEGINSLATEPACK. abc123 lnbc456def ENDSLATEPACK.';
    const text = `Here is my payment: ${slatepack} — send it back`;
    // The slatepack (even one whose payload spells "lnbc456...") is untouched.
    expect(sanitizeText(text)).toBe(text);
  });
});

describe('stripLightningProfileFields — strips lud06/lud16 only', () => {
  it('removes lud06 and lud16 when present', () => {
    const result = stripLightningProfileFields({
      name: 'alice',
      lud06: 'lnurl1abc',
      lud16: 'alice@getalby.com',
    });
    expect(result).toEqual({ name: 'alice' });
  });

  it('returns the object unchanged when no lightning fields exist', () => {
    const meta = { name: 'bob', about: 'grin fan' };
    expect(stripLightningProfileFields(meta)).toBe(meta);
  });
});
