/**
 * Legacy (v1) Agora HD wallet seed derivation. **Migration-only.**
 *
 * v1 used the raw 32 bytes of the user's Nostr secret key directly as the
 * BIP-32 master seed (`HDKey.fromMasterSeed(nsec)` internally runs
 * `HMAC-SHA512("Bitcoin seed", nsec)`). v2 (the current scheme, see
 * `./seed.ts`) feeds the nsec through HKDF + BIP-39 + PBKDF2, producing a
 * different 64-byte seed and therefore different addresses.
 *
 * The only call sites for this module are:
 *
 *   - `useHdWalletV1Migration` — detects whether the user has any funds at
 *     v1 addresses and presents the migration UI.
 *   - `WalletMigrateV1Page` — builds a single sweep transaction that
 *     spends all v1 BIP-86 + v1 SP UTXOs into a fresh v2 receive address.
 *
 * **Do not call this from any new wallet code.** All new derivation,
 * scanning, send, and receive flows must use the v2 seed from `./seed.ts`.
 */
export function nsecToWalletSeedV1(nsecBytes: Uint8Array): Uint8Array {
  if (nsecBytes.length !== 32) {
    throw new Error('nsec must be 32 bytes');
  }
  // v1 fed the 32-byte nsec straight into `HDKey.fromMasterSeed`, which
  // applies `HMAC-SHA512("Bitcoin seed", seed)` internally. Callers
  // wanting the BIP-32 root should pass these bytes to `HDKey.
  // fromMasterSeed`. We deliberately *don't* return an `HDKey` here so
  // this module has zero runtime dependency on `@scure/bip32` until a
  // migration actually runs.
  //
  // We hand back a fresh copy of the buffer so the caller can wipe its
  // working copy of the nsec independently.
  return new Uint8Array(nsecBytes);
}
