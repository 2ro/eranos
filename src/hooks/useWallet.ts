import { useMemo } from 'react';
import { useNWC } from '@/hooks/useNWCContext';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import type { WebLNProvider } from '@webbtc/webln-types';

export interface WalletStatus {
  hasNWC: boolean;
  hasSpark: boolean;
  sparkEnabled: boolean;
  sparkConnected: boolean;
  sparkBalance: number;
  webln: WebLNProvider | null;
  activeNWC: ReturnType<typeof useNWC>['getActiveConnection'] extends () => infer T ? T : null;
  preferredMethod: 'spark' | 'nwc' | 'webln' | 'manual';
}

export function useWallet() {
  const { connections, getActiveConnection } = useNWC();
  const spark = useSparkWallet();

  // Get the active connection directly - no memoization to avoid stale state
  const activeNWC = getActiveConnection();

  // Access WebLN directly from browser global scope
  const webln = (globalThis as { webln?: WebLNProvider }).webln || null;

  // Calculate status values reactively
  const hasNWC = useMemo(() => {
    return connections.length > 0 && connections.some(c => c.isConnected);
  }, [connections]);

  // Spark wallet status
  const hasSpark = spark.hasWallet;
  const sparkEnabled = spark.isEnabled;
  const sparkConnected = spark.isInitialized;
  const sparkBalance = spark.balance;

  // Determine preferred payment method
  // Priority: Spark > NWC > WebLN > Manual
  const preferredMethod: WalletStatus['preferredMethod'] = 
    sparkEnabled && sparkConnected
      ? 'spark'
      : activeNWC
      ? 'nwc'
      : webln
      ? 'webln'
      : 'manual';

  const status: WalletStatus = {
    hasNWC,
    hasSpark,
    sparkEnabled,
    sparkConnected,
    sparkBalance,
    webln,
    activeNWC,
    preferredMethod,
  };

  return status;
}
