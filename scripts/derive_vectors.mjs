import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { bech32m, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';

// Test vector 1: all-zero nsec
const nsec1 = new Uint8Array(32);

// Test vector 2: nsec from a deterministic source — all 0x01s
const nsec2 = new Uint8Array(32).fill(0x01);

// Test vector 3: an actual realistic nsec
const nsec3 = hex.decode('67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa');

function deriveAll(nsec, label) {
  const entropy = hkdf(sha256, nsec, undefined, 'agora/v1', 32);
  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const account = root.derive("m/86'/0'/0'");
  const receive0 = account.deriveChild(0).deriveChild(0);
  const xonly = receive0.publicKey.slice(1, 33);
  const { address } = btc.p2tr(xonly, undefined, btc.NETWORK);

  const spendNode = root.derive("m/352'/0'/0'/0'/0");
  const scanNode = root.derive("m/352'/0'/0'/1'/0");
  const spendPub = spendNode.publicKey;
  const scanPub = scanNode.publicKey;
  const payload = new Uint8Array(66);
  payload.set(scanPub, 0);
  payload.set(spendPub, 33);
  const words = [0, ...bech32m.toWords(payload)];
  const spAddress = bech32m.encode('sp', words, 1023);

  console.log(`\n--- ${label} ---`);
  console.log(`nsec hex:  ${hex.encode(nsec)}`);
  console.log(`entropy:   ${hex.encode(entropy)}`);
  console.log(`mnemonic:  ${mnemonic}`);
  console.log(`seed:      ${hex.encode(seed)}`);
  console.log(`xpub:      ${account.publicExtendedKey}`);
  console.log(`addr 0/0:  ${address}`);
  console.log(`sp addr:   ${spAddress}`);
}

deriveAll(nsec1, 'all-zero nsec');
deriveAll(nsec2, 'all-0x01 nsec');
deriveAll(nsec3, 'realistic nsec');
