import { useMemo } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { deriveAccountFromSeed, type HdAccount } from '@/lib/hdwallet/derivation';
import { nsecToWalletSeed } from '@/lib/hdwallet/seed';

/**
 * Aggregate availability of the HD wallet for the active login.
 *
 * The HD wallet derives all of its keys from a BIP-39 24-word mnemonic that
 * Agora derives deterministically from the user's raw Nostr secret key
 * (`nsec → HKDF → BIP-39 → BIP-32 seed`; see `src/lib/hdwallet/seed.ts`).
 *
 * Only the `nsec` login type stores that secret in a form we can read; both
 * the NIP-07 browser extension and NIP-46 remote bunker keep the key
 * elsewhere (the extension never exposes it; the bunker never sends it).
 * Without the raw secret we cannot derive child keys, so the HD wallet is
 * gated to nsec logins.
 */
export type HdWalletAvailability =
  /**
   * User logged in with nsec — full HD wallet access. `seed` is the
   * 64-byte BIP-32 seed (BIP-39 PBKDF2 output) feeding every downstream
   * derivation; `mnemonic` is the 24-word backup the user can copy out or
   * import into another wallet. Both are deterministic functions of the
   * nsec and re-derived per login change.
   */
  | {
      status: 'available';
      account: HdAccount;
      /** 64-byte BIP-32 seed (the BIP-39 PBKDF2 output). */
      seed: Uint8Array;
      /** BIP-39 24-word mnemonic, ASCII space-separated, lowercase. */
      mnemonic: string;
      pubkey: string;
    }
  /** Not logged in at all. */
  | { status: 'logged-out' }
  /** Logged in, but the login type doesn't expose the secret key. */
  | { status: 'unsupported'; loginType: 'extension' | 'bunker' | 'other' };

/**
 * Hook that returns whether the HD wallet is usable for the active login,
 * and (when usable) the derived BIP86 account.
 *
 * **Security note**: the returned `account`, `seed`, and `mnemonic` hold
 * secret material in memory for as long as the consumer holds the
 * reference. This is unavoidable for a wallet that signs locally — the
 * nsec is already in plaintext localStorage in the same threat model.
 *
 * The hook intentionally re-derives on every login change rather than
 * caching across logouts, so a fresh login starts from a clean derivation.
 * Within a single login the `useMemo` keeps the derived seed/mnemonic
 * stable so the PBKDF2 round (2048 iterations of HMAC-SHA512) only runs
 * once per login change instead of on every render.
 */
export function useHdWalletAccess(): HdWalletAvailability {
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const activeLogin = logins[0];

  return useMemo<HdWalletAvailability>(() => {
    if (!user || !activeLogin) return { status: 'logged-out' };

    if (activeLogin.type !== 'nsec') {
      const loginType =
        activeLogin.type === 'extension'
          ? 'extension'
          : activeLogin.type === 'bunker'
            ? 'bunker'
            : 'other';
      return { status: 'unsupported', loginType };
    }

    // Decode the nsec → 32-byte secret key, run the v2 mnemonic-from-nsec
    // pipeline, then derive the BIP-86 account from the resulting 64-byte
    // BIP-32 seed.
    const decoded = nip19.decode(activeLogin.data.nsec);
    if (decoded.type !== 'nsec') {
      // Defensive — should be impossible given the discriminated union.
      return { status: 'unsupported', loginType: 'other' };
    }
    const nsecBytes = decoded.data;
    const { seed, mnemonic } = nsecToWalletSeed(nsecBytes);
    const account = deriveAccountFromSeed(seed);

    return { status: 'available', account, seed, mnemonic, pubkey: user.pubkey };
  }, [user, activeLogin]);
}
