import { ReactNode } from 'react';
import { useHdWalletSpInternal } from '@/hooks/useHdWalletSp';
import { HdWalletSpContext } from '@/hooks/useHdWalletSpContext';

/**
 * Provides a single shared silent-payment wallet orchestrator to the whole
 * app. Mounting this once at the root means the BIP-352 background scanner
 * runs continuously — resuming from the last persisted block and keeping up
 * with the chain tip — regardless of which page the user is on. The
 * `/wallet` page consumes the shared state via `useHdWalletSp()`.
 *
 * The internal hook is a no-op (returns a disabled result) when the user
 * isn't logged in with an nsec or no indexer is configured, so it's safe to
 * mount unconditionally at the root.
 */
export function HdWalletSpProvider({ children }: { children: ReactNode }) {
  const sp = useHdWalletSpInternal();
  return <HdWalletSpContext.Provider value={sp}>{children}</HdWalletSpContext.Provider>;
}
