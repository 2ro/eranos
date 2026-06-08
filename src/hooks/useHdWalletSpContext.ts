import { createContext, useContext } from 'react';
import { useHdWalletSpInternal } from '@/hooks/useHdWalletSp';

type HdWalletSpContextType = ReturnType<typeof useHdWalletSpInternal>;

export const HdWalletSpContext = createContext<HdWalletSpContextType | null>(null);

/**
 * Access the single shared silent-payment wallet orchestrator.
 *
 * Unlike calling `useHdWalletSpInternal()` directly, this reads from the
 * `HdWalletSpProvider` mounted at the app root — so scan state, progress, and
 * the auto-scanner are shared across every page and survive navigation. The
 * background scanner keeps running even while the user is on a different
 * route; the `/wallet` page just renders the shared state.
 *
 * Must be used within an `HdWalletSpProvider`.
 */
export function useHdWalletSp(): HdWalletSpContextType {
  const context = useContext(HdWalletSpContext);
  if (!context) {
    throw new Error('useHdWalletSp must be used within an HdWalletSpProvider');
  }
  return context;
}
