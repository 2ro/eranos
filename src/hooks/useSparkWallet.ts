/**
 * useSparkWallet Hook
 * Convenience hook for accessing Spark wallet functionality
 */

import { useSparkWalletContext } from '@/contexts/SparkWalletContext';

export function useSparkWallet() {
  return useSparkWalletContext();
}
