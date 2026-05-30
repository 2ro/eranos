import { describe, expect, it } from 'vitest';

import {
  classifyBroadcastError,
  isFeeRecoverable,
  type BroadcastErrorKind,
} from '@/lib/bitcoinBroadcastError';

/**
 * Real-world reject strings emitted by:
 *
 * - bitcoind Core 25.x / 26.x via `sendrawtransaction`
 * - mempool.space's Esplora `/tx` endpoint (passes the bitcoind body through
 *   unchanged with a 400 status)
 * - Blockstream Esplora (same)
 * - Blockbook's WebSocket `sendTransaction` (`data.error.message` is the
 *   verbatim bitcoind text)
 * - Our own `broadcastTransaction` wrapper that prefixes `Broadcast failed: `
 *   on Esplora responses
 *
 * Each fixture is the actual string we'd see in `err.message` at the toast /
 * alert call site. If a node operator's wrapping ever drifts, the classifier
 * should still bucket the underlying reject reason.
 */

describe('classifyBroadcastError', () => {
  it('classifies the canonical min-relay-fee reject with numeric pair', () => {
    const result = classifyBroadcastError(
      new Error('min relay fee not met, 245 < 1000'),
    );
    expect(result.kind).toBe('feeTooLow');
    expect((result as Extract<BroadcastErrorKind, { kind: 'feeTooLow' }>).actualFeeRate).toBe(245);
    expect((result as Extract<BroadcastErrorKind, { kind: 'feeTooLow' }>).minRelayFeeRate).toBe(1000);
  });

  it('parses the wrapped sendrawtransaction RPC form', () => {
    const result = classifyBroadcastError(
      new Error(
        'sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met, 245 < 1000"}',
      ),
    );
    expect(result.kind).toBe('feeTooLow');
    expect((result as Extract<BroadcastErrorKind, { kind: 'feeTooLow' }>).minRelayFeeRate).toBe(1000);
  });

  it('parses an Esplora-wrapped fee-too-low body', () => {
    const result = classifyBroadcastError(
      new Error('Broadcast failed: sendrawtransaction RPC error: min relay fee not met, 1 < 5'),
    );
    expect(result.kind).toBe('feeTooLow');
    const fee = result as Extract<BroadcastErrorKind, { kind: 'feeTooLow' }>;
    expect(fee.actualFeeRate).toBe(1);
    expect(fee.minRelayFeeRate).toBe(5);
  });

  it('classifies feeTooLow without numbers when the format deviates', () => {
    const result = classifyBroadcastError(new Error('min relay fee not met'));
    expect(result.kind).toBe('feeTooLow');
    expect((result as Extract<BroadcastErrorKind, { kind: 'feeTooLow' }>).minRelayFeeRate).toBeUndefined();
  });

  it('classifies replacement-fee rejection separately from a flat fee-too-low', () => {
    expect(
      classifyBroadcastError(new Error('insufficient fee, rejecting replacement')).kind,
    ).toBe('rbfReplacementFeeTooLow');
  });

  it('classifies mempool-min-fee separately from a flat fee-too-low', () => {
    expect(
      classifyBroadcastError(new Error('mempool min fee not met, 245 < 1000')).kind,
    ).toBe('mempoolFull');
  });

  it('classifies absurdly-high-fee', () => {
    expect(
      classifyBroadcastError(new Error('absurdly-high-fee')).kind,
    ).toBe('absurdlyHighFee');
  });

  it('classifies long mempool chains', () => {
    expect(
      classifyBroadcastError(
        new Error('too-long-mempool-chain, too many descendants for tx ...'),
      ).kind,
    ).toBe('tooLongChain');
  });

  it('classifies double-spends and missing inputs', () => {
    expect(
      classifyBroadcastError(new Error('txn-mempool-conflict')).kind,
    ).toBe('mempoolConflict');
    expect(
      classifyBroadcastError(new Error('bad-txns-inputs-missingorspent')).kind,
    ).toBe('mempoolConflict');
    expect(
      classifyBroadcastError(new Error('Missing inputs')).kind,
    ).toBe('mempoolConflict');
  });

  it('classifies dust outputs as badInputs (not feeTooLow)', () => {
    expect(
      classifyBroadcastError(new Error('dust')).kind,
    ).toBe('badInputs');
    expect(
      classifyBroadcastError(new Error('bad-txns-out-of-range')).kind,
    ).toBe('badInputs');
  });

  it('classifies generic bad-txns- consensus rejects', () => {
    expect(
      classifyBroadcastError(new Error('bad-txns-vin-empty')).kind,
    ).toBe('badInputs');
  });

  it('classifies framing errors from broadcastBlockbookTx as network', () => {
    const samples = [
      'Blockbook WebSocket error (1006: abnormal closure)',
      'Blockbook WebSocket closed (code=1011)',
      'Blockbook WebSocket connect timed out',
      'Blockbook sendTransaction timed out',
      'Request aborted',
      'NetworkError when attempting to fetch resource',
      'Failed to fetch',
    ];
    for (const msg of samples) {
      expect(classifyBroadcastError(new Error(msg)).kind).toBe('network');
    }
  });

  it('falls back to unknown for unrecognized strings, preserving the raw text', () => {
    const result = classifyBroadcastError(new Error('something totally novel'));
    expect(result.kind).toBe('unknown');
    expect((result as Extract<BroadcastErrorKind, { kind: 'unknown' }>).raw).toBe(
      'something totally novel',
    );
  });

  it('handles non-Error inputs gracefully', () => {
    expect(classifyBroadcastError('min relay fee not met, 245 < 1000').kind).toBe('feeTooLow');
    expect(classifyBroadcastError({ message: 'mempool min fee not met' }).kind).toBe('mempoolFull');
    expect(classifyBroadcastError(null).kind).toBe('unknown');
    expect(classifyBroadcastError(undefined).kind).toBe('unknown');
    expect(classifyBroadcastError({}).kind).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(
      classifyBroadcastError(new Error('MIN RELAY FEE NOT MET, 1 < 5')).kind,
    ).toBe('feeTooLow');
    expect(
      classifyBroadcastError(new Error('Insufficient Fee, Rejecting Replacement')).kind,
    ).toBe('rbfReplacementFeeTooLow');
  });
});

describe('isFeeRecoverable', () => {
  it('marks fee-related rejects as recoverable via bump', () => {
    expect(isFeeRecoverable('feeTooLow')).toBe(true);
    expect(isFeeRecoverable('rbfReplacementFeeTooLow')).toBe(true);
    expect(isFeeRecoverable('mempoolFull')).toBe(true);
  });

  it('rejects non-fee categories', () => {
    expect(isFeeRecoverable('absurdlyHighFee')).toBe(false);
    expect(isFeeRecoverable('badInputs')).toBe(false);
    expect(isFeeRecoverable('mempoolConflict')).toBe(false);
    expect(isFeeRecoverable('tooLongChain')).toBe(false);
    expect(isFeeRecoverable('network')).toBe(false);
    expect(isFeeRecoverable('unknown')).toBe(false);
  });
});
