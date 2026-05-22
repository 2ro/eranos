import { useMemo } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { deriveAccountFromNsec, type HdAccount } from '@/lib/hdwallet/derivation';

/**
 * Aggregate availability of the HD wallet for the active login.
 *
 * The HD wallet derives all of its keys from the user's raw Nostr secret key.
 * Only the `nsec` login type stores that key in a form we can read; both the
 * NIP-07 browser extension and NIP-46 remote bunker keep the key elsewhere
 * (the extension never exposes it; the bunker never sends it). Without the
 * raw secret we cannot derive child keys, so the HD wallet is gated to nsec
 * logins.
 */
export type HdWalletAvailability =
  /** User logged in with nsec — full HD wallet access. */
  | { status: 'available'; account: HdAccount; nsecBytes: Uint8Array; pubkey: string }
  /** Not logged in at all. */
  | { status: 'logged-out' }
  /** Logged in, but the login type doesn't expose the secret key. */
  | { status: 'unsupported'; loginType: 'extension' | 'bunker' | 'other' };

/**
 * Hook that returns whether the HD wallet is usable for the active login,
 * and (when usable) the derived BIP86 account.
 *
 * **Security note**: the returned `account` holds private extended keys in
 * memory for as long as the consumer holds the reference. This is unavoidable
 * for a wallet that signs locally — the nsec is already in plaintext
 * localStorage in the same threat model.
 *
 * The hook intentionally re-derives on every login change rather than caching
 * across logouts, so a fresh login starts from a clean derivation.
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

    // Decode the nsec → 32-byte secret key, then derive the BIP86 account.
    const decoded = nip19.decode(activeLogin.data.nsec);
    if (decoded.type !== 'nsec') {
      // Defensive — should be impossible given the discriminated union.
      return { status: 'unsupported', loginType: 'other' };
    }
    const nsecBytes = decoded.data;
    const account = deriveAccountFromNsec(nsecBytes);

    return { status: 'available', account, nsecBytes, pubkey: user.pubkey };
  }, [user, activeLogin]);
}
