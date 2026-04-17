/**
 * Spark Wallet Storage
 * 
 * Secure storage using NIP-44 encryption for both localStorage and sessionStorage.
 * Mnemonic is encrypted with the user's Nostr pubkey before storage.
 * Based on Primal's sparkStorage.ts for compatibility.
 * 
 * SECURITY: All sensitive data (mnemonic) is encrypted with NIP-44.
 */

import type { SparkWalletConfig, NostrSigner, LockTimeoutMinutes } from './types';
import { logger } from '@/lib/logger';

const SPARK_SEED_KEY_PREFIX = 'spark_seed_';
const SPARK_CONFIG_KEY = 'spark_config';
const MNEMONIC_SESSION_KEY = 'spark-wallet-mnemonic-session';

/**
 * Get storage key for user's Spark seed
 */
function getSeedStorageKey(pubkey: string): string {
  return `${SPARK_SEED_KEY_PREFIX}${pubkey}`;
}

/**
 * Get storage key for user's Spark config
 */
function getConfigStorageKey(pubkey: string): string {
  return `${SPARK_CONFIG_KEY}_${pubkey}`;
}

/**
 * Save encrypted seed to localStorage using NIP-44 encryption
 * @param seed - BIP39 mnemonic seed phrase
 * @param pubkey - User's Nostr public key (used for encryption)
 * @param signer - Nostr signer with nip44 methods
 */
export async function saveEncryptedSeed(
  seed: string,
  pubkey: string,
  signer: NostrSigner
): Promise<void> {
  try {
    logger.debug('[SparkStorage] Saving encrypted seed with NIP-44...');

    if (!signer.nip44) {
      throw new Error('Signer does not support NIP-44 encryption');
    }

    // Encrypt the seed to self using NIP-44
    const encryptedSeed = await signer.nip44.encrypt(pubkey, seed);

    // Store in localStorage as JSON with version marker
    const storageKey = getSeedStorageKey(pubkey);
    const data = {
      version: 'nip44_v1',
      ciphertext: encryptedSeed,
    };
    localStorage.setItem(storageKey, JSON.stringify(data));

    logger.debug('[SparkStorage] Seed saved successfully');
  } catch (error) {
    logger.error('[SparkStorage] Failed to save encrypted seed:', error);
    throw new Error(`Failed to save Spark wallet seed: ${error}`);
  }
}

/**
 * Load and decrypt seed from localStorage
 * @param pubkey - User's Nostr public key
 * @param signer - Nostr signer with nip44 methods
 * @returns Decrypted seed or null if not found
 */
export async function loadEncryptedSeed(
  pubkey: string,
  signer: NostrSigner
): Promise<string | null> {
  try {
    const storageKey = getSeedStorageKey(pubkey);
    const storedData = localStorage.getItem(storageKey);

    if (!storedData) {
      logger.debug('[SparkStorage] No encrypted seed found');
      return null;
    }

    logger.debug('[SparkStorage] Loading encrypted seed...');

    if (!signer.nip44) {
      throw new Error('Signer does not support NIP-44 encryption');
    }

    // Try to parse as JSON (new format)
    try {
      const data = JSON.parse(storedData);
      
      if (data.version === 'nip44_v1' && data.ciphertext) {
        // New format: NIP-44 encrypted
        const seed = await signer.nip44.decrypt(pubkey, data.ciphertext);
        logger.debug('[SparkStorage] Seed loaded with NIP-44');
        return seed;
      }
    } catch {
      // Not JSON, try as legacy plain encrypted string
      logger.debug('[SparkStorage] Attempting legacy format...');
    }

    // Legacy format: plain NIP-44 encrypted string
    const seed = await signer.nip44.decrypt(pubkey, storedData);
    logger.debug('[SparkStorage] Seed loaded with legacy format');
    
    // Auto-migrate to new format
    await saveEncryptedSeed(seed, pubkey, signer);
    
    return seed;
  } catch (error) {
    logger.error('[SparkStorage] Failed to load encrypted seed:', error);
    throw new Error(`Failed to load Spark wallet seed: ${error}`);
  }
}

/**
 * Clear stored seed from localStorage
 * @param pubkey - User's Nostr public key
 */
export function clearSeed(pubkey: string): void {
  try {
    const storageKey = getSeedStorageKey(pubkey);
    localStorage.removeItem(storageKey);
    logger.debug('[SparkStorage] Seed cleared');
  } catch (error) {
    logger.error('[SparkStorage] Failed to clear seed:', error);
    throw error;
  }
}

/**
 * Check if a Spark wallet is configured for the user
 * @param pubkey - User's Nostr public key
 * @returns True if wallet is configured
 */
export function isSparkWalletConfigured(pubkey: string): boolean {
  const storageKey = getSeedStorageKey(pubkey);
  return localStorage.getItem(storageKey) !== null;
}

/**
 * Save Spark wallet configuration
 * @param pubkey - User's Nostr public key
 * @param config - Wallet configuration
 */
export function saveSparkConfig(
  pubkey: string,
  config: SparkWalletConfig
): void {
  try {
    const storageKey = getConfigStorageKey(pubkey);
    localStorage.setItem(storageKey, JSON.stringify(config));
    logger.debug('[SparkStorage] Config saved');
  } catch (error) {
    logger.error('[SparkStorage] Failed to save config:', error);
    throw error;
  }
}

/**
 * Load Spark wallet configuration
 * @param pubkey - User's Nostr public key
 * @returns Wallet configuration or null if not found
 */
export function loadSparkConfig(
  pubkey: string
): SparkWalletConfig | null {
  try {
    const storageKey = getConfigStorageKey(pubkey);
    const configJson = localStorage.getItem(storageKey);

    if (!configJson) {
      return null;
    }

    return JSON.parse(configJson) as SparkWalletConfig;
  } catch (error) {
    logger.error('[SparkStorage] Failed to load config:', error);
    return null;
  }
}

/**
 * Clear Spark wallet configuration
 * @param pubkey - User's Nostr public key
 */
export function clearSparkConfig(pubkey: string): void {
  try {
    const storageKey = getConfigStorageKey(pubkey);
    localStorage.removeItem(storageKey);
    logger.debug('[SparkStorage] Config cleared');
  } catch (error) {
    logger.error('[SparkStorage] Failed to clear config:', error);
    throw error;
  }
}

/**
 * Clear all Spark wallet data for a user
 * @param pubkey - User's Nostr public key
 */
export function clearAllSparkData(pubkey: string): void {
  clearSeed(pubkey);
  clearSparkConfig(pubkey);
  clearMnemonicSession();
  logger.debug('[SparkStorage] All Spark data cleared');
}

/**
 * Store mnemonic in session storage with NIP-44 encryption.
 * Session storage is cleared when the browser tab closes.
 * 
 * SECURITY: Mnemonic is encrypted with NIP-44 before storage,
 * protecting against XSS attacks and malicious browser extensions.
 * 
 * @param mnemonic - The mnemonic to store
 * @param pubkey - User's Nostr public key
 * @param signer - Nostr signer with nip44 methods
 */
export async function storeMnemonicSession(
  mnemonic: string,
  pubkey: string,
  signer: NostrSigner
): Promise<void> {
  try {
    if (!signer.nip44) {
      throw new Error('Signer does not support NIP-44 encryption');
    }

    // Encrypt the mnemonic with NIP-44
    const encrypted = await signer.nip44.encrypt(pubkey, mnemonic);
    
    // Store as JSON with version marker
    const data = {
      version: 'nip44_v1',
      ciphertext: encrypted,
      pubkey, // Store pubkey to verify on retrieval
    };
    sessionStorage.setItem(MNEMONIC_SESSION_KEY, JSON.stringify(data));
    logger.debug('[SparkStorage] Mnemonic session stored (encrypted)');
  } catch (error) {
    logger.error('[SparkStorage] Failed to store mnemonic session:', error);
  }
}

/**
 * Retrieve and decrypt mnemonic from session storage.
 * 
 * @param pubkey - User's Nostr public key
 * @param signer - Nostr signer with nip44 methods
 * @returns Decrypted mnemonic or null if not found
 */
export async function getMnemonicSession(
  pubkey: string,
  signer: NostrSigner
): Promise<string | null> {
  try {
    const stored = sessionStorage.getItem(MNEMONIC_SESSION_KEY);
    if (!stored) return null;

    if (!signer.nip44) {
      throw new Error('Signer does not support NIP-44 decryption');
    }

    const data = JSON.parse(stored);
    
    // Verify pubkey matches (prevents using wrong key)
    if (data.pubkey !== pubkey) {
      logger.warn('[SparkStorage] Session pubkey mismatch, clearing');
      clearMnemonicSession();
      return null;
    }

    if (data.version === 'nip44_v1' && data.ciphertext) {
      const mnemonic = await signer.nip44.decrypt(pubkey, data.ciphertext);
      logger.debug('[SparkStorage] Mnemonic session retrieved (decrypted)');
      return mnemonic;
    }

    // Unknown format
    logger.warn('[SparkStorage] Unknown session format, clearing');
    clearMnemonicSession();
    return null;
  } catch (error) {
    logger.error('[SparkStorage] Failed to get mnemonic session:', error);
    return null;
  }
}

/**
 * Clear mnemonic from session storage
 */
export function clearMnemonicSession(): void {
  try {
    sessionStorage.removeItem(MNEMONIC_SESSION_KEY);
    logger.debug('[SparkStorage] Mnemonic session cleared');
  } catch (error) {
    logger.error('[SparkStorage] Failed to clear mnemonic session:', error);
  }
}

/**
 * Validate mnemonic format (basic validation)
 * NOTE: This only checks format, not BIP39 validity.
 * Use breezService.validateMnemonic() for full BIP39 validation.
 * 
 * @param mnemonic - Mnemonic to validate
 * @returns True if format appears valid
 */
export function validateMnemonicFormat(mnemonic: string): boolean {
  // Basic validation: check word count (should be 12, 15, 18, 21, or 24 words)
  const words = mnemonic.trim().split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];

  if (!validWordCounts.includes(words.length)) {
    logger.warn('[SparkStorage] Invalid mnemonic word count');
    return false;
  }

  // Check that all words are lowercase alphabetic
  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) {
      logger.warn('[SparkStorage] Invalid mnemonic word format');
      return false;
    }
  }

  return true;
}

// Legacy export for backward compatibility
export { validateMnemonicFormat as validateMnemonic };

/**
 * Set the auto-lock timeout for the wallet
 * @param timeout - Timeout in minutes (0 = disabled)
 * @param pubkey - User's Nostr public key
 */
export function setLockTimeout(timeout: LockTimeoutMinutes, pubkey: string): void {
  const config = loadSparkConfig(pubkey) || { hasWallet: true };
  saveSparkConfig(pubkey, {
    ...config,
    lockTimeout: timeout,
  });
  logger.debug('[SparkStorage] Lock timeout set to', timeout, 'minutes');
}

/**
 * Get the current lock timeout setting
 * @param pubkey - User's Nostr public key
 * @returns Lock timeout in minutes (0 = disabled)
 */
export function getLockTimeout(pubkey: string): LockTimeoutMinutes {
  const config = loadSparkConfig(pubkey);
  return config?.lockTimeout ?? 0;
}

/**
 * Update the last activity timestamp for auto-lock tracking
 * @param pubkey - User's Nostr public key
 */
export function updateLastActivity(pubkey: string): void {
  const config = loadSparkConfig(pubkey);
  if (config) {
    saveSparkConfig(pubkey, {
      ...config,
      lastActivityAt: Date.now(),
    });
  }
}

/**
 * Get the last activity timestamp
 * @param pubkey - User's Nostr public key
 * @returns Last activity timestamp or null if not set
 */
export function getLastActivity(pubkey: string): number | null {
  const config = loadSparkConfig(pubkey);
  return config?.lastActivityAt ?? null;
}

/**
 * Check if wallet should be auto-locked based on inactivity
 * @param pubkey - User's Nostr public key
 * @returns True if wallet should be locked
 */
export function shouldAutoLock(pubkey: string): boolean {
  const config = loadSparkConfig(pubkey);
  const timeout = config?.lockTimeout;
  if (timeout === undefined || timeout === 0) {
    return false; // Auto-lock disabled
  }

  const lastActivity = config?.lastActivityAt;
  if (!lastActivity) {
    return false; // No activity recorded yet
  }

  const timeoutMs = timeout * 60 * 1000;
  const timeSinceActivity = Date.now() - lastActivity;
  
  return timeSinceActivity > timeoutMs;
}

// Legacy exports for backward compatibility
export {
  loadSparkConfig as loadWalletConfig,
  saveSparkConfig as saveWalletConfig,
  clearSparkConfig as clearWalletConfig,
};

/**
 * Update cached balance (legacy compatibility)
 */
export function updateCachedBalance(balance: number, pubkey?: string): void {
  if (!pubkey) return;
  const config = loadSparkConfig(pubkey) || { hasWallet: true, isEnabled: true };
  saveSparkConfig(pubkey, {
    ...config,
    cachedBalance: balance,
    lastSynced: Date.now(),
  });
}

/**
 * Mark wallet as having been created/restored (legacy compatibility)
 */
export function markWalletCreated(pubkey?: string): void {
  if (!pubkey) return;
  const config = loadSparkConfig(pubkey) || {};
  saveSparkConfig(pubkey, {
    ...config,
    hasWallet: true,
    isEnabled: true,
  });
}

/**
 * Mark wallet as removed (legacy compatibility)
 */
export function markWalletRemoved(pubkey?: string): void {
  if (pubkey) {
    clearAllSparkData(pubkey);
  }
  clearMnemonicSession();
}

/**
 * Check if a wallet exists locally (legacy compatibility)
 */
export function hasLocalWallet(pubkey?: string): boolean {
  if (!pubkey) return false;
  return isSparkWalletConfigured(pubkey);
}

/**
 * Check if wallet is enabled (legacy compatibility)
 */
export function isWalletEnabled(pubkey?: string): boolean {
  if (!pubkey) return false;
  const config = loadSparkConfig(pubkey);
  return config?.hasWallet === true && config?.isEnabled !== false;
}

/**
 * Set wallet enabled state (legacy compatibility)
 */
export function setWalletEnabled(enabled: boolean, pubkey?: string): void {
  if (!pubkey) return;
  const config = loadSparkConfig(pubkey) || { hasWallet: true };
  saveSparkConfig(pubkey, {
    ...config,
    isEnabled: enabled,
  });
}
