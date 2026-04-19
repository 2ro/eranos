/**
 * Rate Limiter for Wallet Restore
 * 
 * Implements exponential backoff on failed mnemonic restore attempts
 * to prevent brute-force attacks on wallet recovery.
 * 
 * Security: Rate limit state is stored in sessionStorage (cleared on tab close)
 * to prevent cross-session tracking while still protecting against attacks.
 */

import { logger } from '@/lib/logger';

const RATE_LIMIT_KEY = 'spark-wallet-restore-rate-limit';

interface RateLimitState {
  failedAttempts: number;
  lastFailedAt: number;
  lockedUntil: number;
}

/**
 * Calculate lockout duration based on failed attempts (exponential backoff)
 * - 1-2 failures: No lockout
 * - 3 failures: 30 seconds
 * - 4 failures: 2 minutes
 * - 5 failures: 5 minutes
 * - 6+ failures: 15 minutes
 */
function getLockoutDuration(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  if (failedAttempts === 3) return 30 * 1000; // 30 seconds
  if (failedAttempts === 4) return 2 * 60 * 1000; // 2 minutes
  if (failedAttempts === 5) return 5 * 60 * 1000; // 5 minutes
  return 15 * 60 * 1000; // 15 minutes for 6+ failures
}

/**
 * Get current rate limit state from session storage
 */
function getRateLimitState(): RateLimitState {
  try {
    const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) {
      return { failedAttempts: 0, lastFailedAt: 0, lockedUntil: 0 };
    }
    return JSON.parse(stored) as RateLimitState;
  } catch {
    return { failedAttempts: 0, lastFailedAt: 0, lockedUntil: 0 };
  }
}

/**
 * Save rate limit state to session storage
 */
function saveRateLimitState(state: RateLimitState): void {
  try {
    sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
  } catch (error) {
    logger.error('[RateLimiter] Failed to save state:', error);
  }
}

/**
 * Check if restore attempts are currently rate limited
 * @returns Object with isLimited flag and remainingSeconds if limited
 */
export function checkRestoreRateLimit(): { isLimited: boolean; remainingSeconds: number; failedAttempts: number } {
  const state = getRateLimitState();
  const now = Date.now();

  if (state.lockedUntil > now) {
    const remainingMs = state.lockedUntil - now;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    logger.debug('[RateLimiter] Rate limited for', remainingSeconds, 'seconds');
    return { isLimited: true, remainingSeconds, failedAttempts: state.failedAttempts };
  }

  return { isLimited: false, remainingSeconds: 0, failedAttempts: state.failedAttempts };
}

/**
 * Record a failed restore attempt and apply rate limiting
 * @returns Object with lockout info
 */
export function recordFailedRestoreAttempt(): { isLocked: boolean; lockoutSeconds: number; failedAttempts: number } {
  const state = getRateLimitState();
  const now = Date.now();

  // Increment failed attempts
  const newFailedAttempts = state.failedAttempts + 1;
  const lockoutDuration = getLockoutDuration(newFailedAttempts);
  const lockedUntil = lockoutDuration > 0 ? now + lockoutDuration : 0;

  const newState: RateLimitState = {
    failedAttempts: newFailedAttempts,
    lastFailedAt: now,
    lockedUntil,
  };

  saveRateLimitState(newState);

  logger.warn('[RateLimiter] Failed attempt', newFailedAttempts, 'lockout:', lockoutDuration / 1000, 'seconds');

  return {
    isLocked: lockoutDuration > 0,
    lockoutSeconds: Math.ceil(lockoutDuration / 1000),
    failedAttempts: newFailedAttempts,
  };
}

/**
 * Record a successful restore (clears rate limit state)
 */
export function recordSuccessfulRestore(): void {
  try {
    sessionStorage.removeItem(RATE_LIMIT_KEY);
    logger.debug('[RateLimiter] Rate limit state cleared on success');
  } catch (error) {
    logger.error('[RateLimiter] Failed to clear state:', error);
  }
}

/**
 * Clear rate limit state (for manual reset or testing)
 */
export function clearRestoreRateLimit(): void {
  try {
    sessionStorage.removeItem(RATE_LIMIT_KEY);
    logger.debug('[RateLimiter] Rate limit state manually cleared');
  } catch (error) {
    logger.error('[RateLimiter] Failed to clear state:', error);
  }
}

/**
 * Format remaining lockout time for display
 */
export function formatLockoutTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}
