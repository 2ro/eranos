import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import { useNostrLogin } from '@nostrify/react/login';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { deriveAccountFromSeed, type HdAccount } from '@/lib/hdwallet/derivation';
import { nsecToWalletSeedV1 } from '@/lib/hdwallet/seed.v1';
import { scanAccount, type AccountScanResult } from '@/lib/hdwallet/scan';
import {
  EMPTY_SP_STORAGE,
  parseSPStorage,
  spStorageBalance,
  spStorageV1DTag,
  type SPStorageDocument,
} from '@/lib/hdwallet/sp/storage';

// ---------------------------------------------------------------------------
// v1 → v2 migration access hook
// ---------------------------------------------------------------------------
//
// The Agora HD wallet shipped in two derivation generations:
//
//   - **v1** — raw nsec used directly as the BIP-32 master seed
//     (`HDKey.fromMasterSeed(nsec)`). See `src/lib/hdwallet/seed.v1.ts`.
//   - **v2** — current. nsec → HKDF → BIP-39 24-word mnemonic → PBKDF2 →
//     BIP-32 master seed. See `src/lib/hdwallet/seed.ts`.
//
// The two schemes produce completely different addresses for the same nsec.
// This hook hands the migration page everything it needs to detect v1 funds
// and build a single sweep transaction into the user's v2 wallet:
//
//   1. The legacy `HdAccount` derived under v1, for re-signing v1 BIP-86
//      UTXOs.
//   2. The legacy 32-byte "v1 seed" (literally the nsec bytes), for
//      deriving the v1 silent-payment spend key when sweeping any v1 SP
//      UTXOs.
//   3. The v1 Blockbook scan result, so the UI can show the user how much
//      is sitting on the old addresses before they commit to a sweep.
//   4. The v1 SP UTXO document, if it exists, so the sweep can include
//      any incoming silent payments the v1 wallet ever received.
//
// The hook is intentionally narrowly-scoped — its only consumer is
// `WalletMigrateV1Page`. New wallet code paths must never call into it.

/** What the migration UI needs to render and act on. */
export interface HdWalletV1Migration {
  /** Whether the user can run a migration at all (must be nsec-logged-in). */
  available: boolean;
  /** Reason `available` is false. */
  unavailableReason?: 'logged-out' | 'unsupported-signer' | 'no-blockbook';
  /** Legacy BIP-86 account derived from v1 (nsec-as-seed) for signing. */
  v1Account?: HdAccount;
  /**
   * The 32-byte raw nsec, re-exported by the v1 module as "the v1 seed."
   * `HDKey.fromMasterSeed(v1Seed)` reproduces the legacy BIP-32 root.
   * Treat as private key material.
   */
  v1Seed?: Uint8Array;
  /** Trezor Blockbook scan over the v1 xpub. */
  v1Scan?: AccountScanResult;
  /** v1 silent-payment UTXO document loaded from relays, if any. */
  v1Sp?: SPStorageDocument;
  /** Confirmed + pending balance on v1 BIP-86 addresses, in sats. */
  v1Bip86Balance: number;
  /** Sum of v1 silent-payment UTXO values, in sats. */
  v1SpBalance: number;
  /** Convenience total — `v1Bip86Balance + v1SpBalance`. */
  v1TotalBalance: number;
  /** True until the initial scan + storage fetch resolve. */
  isLoading: boolean;
  /** Scan error if any. */
  error: unknown;
  /** Force-refresh the v1 scan. */
  refetch: () => Promise<unknown>;
}

const EMPTY: HdWalletV1Migration = {
  available: false,
  v1Bip86Balance: 0,
  v1SpBalance: 0,
  v1TotalBalance: 0,
  isLoading: false,
  error: null,
  refetch: async () => {},
};

/**
 * Single Blockbook scan over the user's v1 BIP-86 account, plus a lookup
 * of any v1 silent-payment UTXO doc. Cheap on cold-cache (one xpub scan +
 * one NIP-78 query); free on warm-cache.
 */
export function useHdWalletV1Migration(): HdWalletV1Migration {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const { nostr } = useNostr();
  const v2Access = useHdWalletAccess();

  const blockbookUrl = (config.blockbookBaseUrl ?? '').trim();
  const activeLogin = logins[0];

  // ── Derive the v1 account (and stash the v1 seed) ────────────
  //
  // Done synchronously off the nsec because the migration page needs the
  // signing key material in scope — it builds the sweep PSBT and signs
  // every input with v1-derived leaf keys.
  //
  // v1 used the raw 32-byte nsec as the BIP-32 master seed.
  // `deriveAccountFromSeed` accepts any BIP-32-compliant seed length
  // (16-64 bytes per the spec), so passing the 32-byte nsec through it
  // reproduces the legacy BIP-86 account exactly.
  const v1 = useMemo<
    { account: HdAccount; v1Seed: Uint8Array; pubkey: string } | null
  >(() => {
    if (!user || !activeLogin || activeLogin.type !== 'nsec') return null;
    const decoded = nip19.decode(activeLogin.data.nsec);
    if (decoded.type !== 'nsec') return null;
    const v1Seed = nsecToWalletSeedV1(decoded.data);
    const account = deriveAccountFromSeed(v1Seed);
    return { account, v1Seed, pubkey: user.pubkey };
  }, [user, activeLogin]);

  // ── Gate availability ────────────────────────────────────────
  const unavailableReason: HdWalletV1Migration['unavailableReason'] | undefined =
    v2Access.status === 'logged-out'
      ? 'logged-out'
      : v2Access.status === 'unsupported'
        ? 'unsupported-signer'
        : !blockbookUrl
          ? 'no-blockbook'
          : undefined;
  const available = unavailableReason === undefined && v1 !== null;

  // ── Blockbook scan of the v1 BIP-86 xpub ─────────────────────
  const scanKey = ['hdwallet-v1-scan', blockbookUrl, v1?.pubkey ?? ''];
  const {
    data: v1Scan,
    isLoading: scanLoading,
    error: scanError,
    refetch: refetchScan,
  } = useQuery<AccountScanResult>({
    queryKey: scanKey,
    queryFn: async ({ signal }) => {
      if (!v1) throw new Error('v1 account unavailable');
      return scanAccount(v1.account, blockbookUrl, signal);
    },
    enabled: available && !!v1,
    // No automatic refetch — the migration page calls refetch manually
    // after a successful sweep so the UI can confirm the addresses are
    // drained.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // ── v1 SP UTXO doc (NIP-78 kind 30078) ───────────────────────
  const v1SpDTag = spStorageV1DTag(config.appId);
  const { data: v1Sp, isLoading: spLoading } = useQuery<SPStorageDocument>({
    queryKey: ['hdwallet-v1-sp', user?.pubkey ?? '', v1SpDTag],
    queryFn: async () => {
      if (!user?.signer.nip44) return { ...EMPTY_SP_STORAGE };
      const events = await nostr.query([
        {
          kinds: [30078],
          authors: [user.pubkey],
          '#d': [v1SpDTag],
          limit: 1,
        },
      ]);
      if (events.length === 0) return { ...EMPTY_SP_STORAGE };
      const event = events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
      if (!event.content) return { ...EMPTY_SP_STORAGE };
      try {
        const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content);
        return parseSPStorage(plaintext);
      } catch {
        return { ...EMPTY_SP_STORAGE };
      }
    },
    enabled: available && !!user,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  if (!available || !v1) {
    return { ...EMPTY, unavailableReason };
  }

  const v1Bip86Balance = v1Scan?.totalBalance ?? 0;
  const v1SpBalance = v1Sp ? spStorageBalance(v1Sp) : 0;

  return {
    available: true,
    v1Account: v1.account,
    v1Seed: v1.v1Seed,
    v1Scan,
    v1Sp,
    v1Bip86Balance,
    v1SpBalance,
    v1TotalBalance: v1Bip86Balance + v1SpBalance,
    isLoading: scanLoading || spLoading,
    error: scanError,
    refetch: refetchScan,
  };
}
