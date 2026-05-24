import { describe, it, expect } from 'vitest';
import { hex } from '@scure/base';

import {
  AGORA_HKDF_INFO,
  AGORA_MNEMONIC_WORDS,
  mnemonicMatchesNsec,
  nsecToWalletEntropy,
  nsecToWalletSeed,
} from './seed';
import {
  accountToBip86Descriptor,
  deriveAccountFromSeed,
  deriveReceiveAddress,
  deriveSilentPaymentAddress,
  deriveSilentPaymentKeys,
} from './derivation';

// ---------------------------------------------------------------------------
// Locked test vectors — DO NOT modify without a deliberate scheme migration
// ---------------------------------------------------------------------------
//
// These vectors pin the entire v2 derivation pipeline from a known nsec to
// the first BIP-86 receive address and the static silent-payment address.
//
// Each vector exercises:
//
//   1. nsec → HKDF entropy (32 bytes)
//   2. entropy → BIP-39 24-word mnemonic
//   3. mnemonic → 64-byte BIP-32 seed (PBKDF2 with the literal "mnemonic" salt)
//   4. seed → BIP-86 account xpub
//   5. account → receive address at index 0/0 (bc1p…)
//   6. seed → BIP-352 silent-payment address (sp1q…)
//
// Regenerating the vectors: `node scripts/derive_vectors.mjs`. Any change to
// `AGORA_HKDF_INFO`, the BIP-39 wordlist choice, the PBKDF2 parameters, the
// BIP-86 path, or the BIP-352 path will fail these tests — which is exactly
// the canary we want.
// ---------------------------------------------------------------------------

interface Vector {
  /** Human-readable label for the test description. */
  name: string;
  /** Raw 32-byte nsec, lowercase hex. */
  nsecHex: string;
  /** Expected HKDF entropy, lowercase hex. */
  entropyHex: string;
  /** Expected 24-word BIP-39 mnemonic, space-separated. */
  mnemonic: string;
  /** Expected 64-byte BIP-32 seed, lowercase hex. */
  seedHex: string;
  /** Expected account-level xpub at m/86'/0'/0'. */
  xpub: string;
  /** Expected receive address at chain=0, index=0. */
  firstReceiveAddress: string;
  /** Expected BIP-352 silent payment address. */
  silentPaymentAddress: string;
}

const VECTORS: Vector[] = [
  {
    name: 'all-zero nsec',
    nsecHex: '0000000000000000000000000000000000000000000000000000000000000000',
    entropyHex: '5ade16631c203da7fbc30c2facabbfd5180c321c38b86526a4e5b2e965aadaa8',
    mnemonic:
      'food vague occur debate adult stadium upper ghost cook grab useful pretty liar boil ill blade gown cry defense grape north step height broccoli',
    seedHex:
      'efc600973ea5754e0af6169702d324e18e5533b2e24402e83e1d89f3a0a4a628059c30ca6921f7e7552136729571e0722e7307bdb83eb578a8ad41be15a9dd06',
    xpub:
      'xpub6Cu8bUr5kV1wrTWFckcqHN634t6wEfX7J7uNnUogcb4DKPCQE9nw3sLanPZrcfGr6hBG5XaT5YYoXaTpZgXqqEZZ3oBqKcSLCNJshUGCFh8',
    firstReceiveAddress:
      'bc1p3c5ve9ksv8r0adwxp0hm6v3wjrkskax0fl5jp7yf36dev7tfldjsnp02ts',
    silentPaymentAddress:
      'sp1qqw9pwwndrr8ujcqlg77qjc42g777kc0qvnlp92pqwv9438jr9e6qgqny9yuycewdry4s9cwn95532snccvj5gxqj40magcafc7kffusxxu8g3u6k',
  },
  {
    name: 'all-0x01 nsec',
    nsecHex: '0101010101010101010101010101010101010101010101010101010101010101',
    entropyHex: 'f1f393d5276b715552cda8f370849afe5e894987acd218b06b33a3d192681749',
    mnemonic:
      'vehicle orient vocal excite require primary enroll relax vibrant loud chase witness trigger pill burger olympic board local smooth element bomb cross frog chunk',
    seedHex:
      '491d9e277c3b6d517f5757bf7a46e0520779665800a8b22c0722a32d95c24cb692ffeadda58a35e1236234f5704c3cff580b695709825faaf5f26dbbacf9b43e',
    xpub:
      'xpub6BvrxvKtMBZd5bR4gaLVu7KfUddtkJYUSRvubbhyhxFekhisBft7mR3pAZRXfMBMCry2YtSqjMsH39xkWirtabtq41R6afrTBHWZDb1Krbp',
    firstReceiveAddress:
      'bc1pxxu0x4d00ez5mee37xa2kgcrx4ynjpkzdcmhpew2f90ncux022tsst5z6l',
    silentPaymentAddress:
      'sp1qq0h7xlp2252uyfmqc6w64ftfqrn0vxa9fcsxj2twuz3tx55ceekkzq4k6dlc950ml848dagh9qgw3ujaej7nflhwx4aqrjrjacmwzplhmcz45f3a',
  },
  {
    name: 'realistic nsec',
    nsecHex: '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa',
    entropyHex: 'c341afb8a522f82d3a65a8a8507610907dc5606847fc63311cdd6f922aea4f77',
    mnemonic:
      'select aspect until engage convince bird trumpet relax portion lonely loud can sword rabbit patient zebra glimpse material dance tennis cargo inside differ volume',
    seedHex:
      'b6cabbd3a9a6752e45b638c6d24dd7b38f68a2301c56bcaac3bbae79eec3549cd34fad21c8dd3b7976107f0ad4d03b488e183bf73986f00eff1eb7ea4eb1df73',
    xpub:
      'xpub6Ckqn3ezKkm2ND4dFATu2faBM1J64oou7C4vw45yKRYt3XPu8sP8KHVJH6DBEfBRCmpNmAZdJ1kzSyWjojpodwH8LNrUNhBvUtfAx3zLVLw',
    firstReceiveAddress:
      'bc1peqv5vl805w9sc098mrtc52dcxf7yq2pja7gxkgftd3t8dz85glqqyx986l',
    silentPaymentAddress:
      'sp1qq24srwhj67t8mc5dp4qa8ge8plytheatmahm0r6x5hz67xum2c947qe9dj425njr93wh9tknks44s2gdrvf4nxgxl9q529u7p4p35qud9yf7cq6w',
  },
];

describe('seed derivation constants', () => {
  it('uses "agora/v1" as the HKDF info string', () => {
    expect(AGORA_HKDF_INFO).toBe('agora/v1');
  });
  it('produces 24-word mnemonics', () => {
    expect(AGORA_MNEMONIC_WORDS).toBe(24);
  });
});

describe('v2 wallet derivation — locked vectors', () => {
  for (const v of VECTORS) {
    describe(v.name, () => {
      const nsec = hex.decode(v.nsecHex);

      it('HKDF entropy matches', () => {
        expect(hex.encode(nsecToWalletEntropy(nsec))).toBe(v.entropyHex);
      });

      it('mnemonic matches', () => {
        const { mnemonic } = nsecToWalletSeed(nsec);
        expect(mnemonic).toBe(v.mnemonic);
        expect(mnemonic.split(' ')).toHaveLength(24);
      });

      it('BIP-32 seed matches', () => {
        const { seed } = nsecToWalletSeed(nsec);
        expect(seed.length).toBe(64);
        expect(hex.encode(seed)).toBe(v.seedHex);
      });

      it('account xpub at m/86\'/0\'/0\' matches', () => {
        const { seed } = nsecToWalletSeed(nsec);
        const account = deriveAccountFromSeed(seed);
        expect(account.accountNode.publicExtendedKey).toBe(v.xpub);
        expect(accountToBip86Descriptor(account)).toBe(`tr(${v.xpub})`);
      });

      it('first BIP-86 receive address matches', () => {
        const { seed } = nsecToWalletSeed(nsec);
        const account = deriveAccountFromSeed(seed);
        const derived = deriveReceiveAddress(account, 0);
        expect(derived.address).toBe(v.firstReceiveAddress);
        expect(derived.path).toBe("m/86'/0'/0'/0/0");
      });

      it('BIP-352 silent payment address matches', () => {
        const { seed } = nsecToWalletSeed(nsec);
        const sp = deriveSilentPaymentAddress(seed);
        expect(sp.address).toBe(v.silentPaymentAddress);
      });

      it('deriveSilentPaymentKeys matches deriveSilentPaymentAddress', () => {
        const { seed } = nsecToWalletSeed(nsec);
        const a = deriveSilentPaymentAddress(seed);
        const k = deriveSilentPaymentKeys(seed);
        expect(k.address).toBe(a.address);
        expect(k.bscan.length).toBe(32);
        expect(k.Bscan.length).toBe(33);
        expect(k.Bspend.length).toBe(33);
      });
    });
  }
});

describe('determinism', () => {
  it('nsecToWalletSeed is pure — same nsec produces identical output across calls', () => {
    const nsec = hex.decode(VECTORS[0]!.nsecHex);
    const a = nsecToWalletSeed(nsec);
    const b = nsecToWalletSeed(nsec);
    expect(a.mnemonic).toBe(b.mnemonic);
    expect(hex.encode(a.entropy)).toBe(hex.encode(b.entropy));
    expect(hex.encode(a.seed)).toBe(hex.encode(b.seed));
  });

  it('different nsecs produce different mnemonics', () => {
    const n1 = hex.decode(VECTORS[0]!.nsecHex);
    const n2 = hex.decode(VECTORS[1]!.nsecHex);
    expect(nsecToWalletSeed(n1).mnemonic).not.toBe(nsecToWalletSeed(n2).mnemonic);
  });
});

describe('mnemonicMatchesNsec', () => {
  it('accepts the mnemonic Agora derives from the same nsec', () => {
    const nsec = hex.decode(VECTORS[2]!.nsecHex);
    expect(mnemonicMatchesNsec(VECTORS[2]!.mnemonic, nsec)).toBe(true);
  });

  it('rejects a mnemonic derived from a different nsec', () => {
    const wrongNsec = hex.decode(VECTORS[0]!.nsecHex);
    expect(mnemonicMatchesNsec(VECTORS[2]!.mnemonic, wrongNsec)).toBe(false);
  });

  it('rejects garbage', () => {
    const nsec = hex.decode(VECTORS[0]!.nsecHex);
    expect(mnemonicMatchesNsec('not a valid mnemonic', nsec)).toBe(false);
    expect(mnemonicMatchesNsec('', nsec)).toBe(false);
  });
});

describe('input validation', () => {
  it('nsecToWalletEntropy rejects non-32-byte input', () => {
    expect(() => nsecToWalletEntropy(new Uint8Array(31))).toThrow(/32 bytes/);
    expect(() => nsecToWalletEntropy(new Uint8Array(33))).toThrow(/32 bytes/);
    expect(() => nsecToWalletEntropy(new Uint8Array(0))).toThrow(/32 bytes/);
  });

  it('deriveAccountFromSeed rejects out-of-range seed lengths', () => {
    expect(() => deriveAccountFromSeed(new Uint8Array(15))).toThrow(/16-64 bytes/);
    expect(() => deriveAccountFromSeed(new Uint8Array(65))).toThrow(/16-64 bytes/);
    expect(() => deriveAccountFromSeed(new Uint8Array(0))).toThrow(/16-64 bytes/);
  });
});
